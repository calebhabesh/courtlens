"""AR04 narrative: one bounded provider call over result cells, checked before use.

The narrative never replaces evidence. It is accepted only when every number passes the
domain checker; otherwise the turn keeps its template claim text. Narration failures,
including quota, never fail an otherwise answered turn.
"""

from __future__ import annotations

import json
import logging
import re
import time
from collections.abc import Callable, Sequence
from dataclasses import dataclass
from typing import Any, Literal

from pydantic import ValidationError

from courtlens.domain.conversation import EvidenceCell, OperationResult
from courtlens.domain.hybrid_assistant import claim_text
from courtlens.domain.metrics import METRIC_CATALOG
from courtlens.domain.narrative_check import NarrativeRejected, check_narrative
from courtlens.services.assistant.legacy.planner import (
    NarrativeDraft,
    PlanningOutput,
    ProviderFailure,
)

logger = logging.getLogger(__name__)

MAX_CELLS = 80
MAX_PAYLOAD_BYTES = 16 * 1024
# Narration is optional; it only starts with enough of the turn deadline left.
MIN_SECONDS = 4.0

Outcome = Literal["accepted", "fallback", "skipped"]


@dataclass(frozen=True)
class NarrativeOutcome:
    """Eval/observability record. `reason` is "accepted" or why the template was kept."""

    outcome: Outcome
    reason: str
    provider_called: bool = False
    text: str | None = None
    token: str = ""


class _NarrateCall:
    """Adapts `narrate` to the bounded single-slot provider runner."""

    def __init__(self, provider: Any) -> None:
        self._provider = provider

    def plan(self, payload: str, *, timeout_seconds: float) -> PlanningOutput:
        output: PlanningOutput = self._provider.narrate(payload, timeout_seconds=timeout_seconds)
        return output


def _fact(cell: EvidenceCell, result: OperationResult) -> dict[str, Any]:
    name, _, _ = claim_text(cell, result).partition(": ")
    metric = METRIC_CATALOG.get(cell.metric)
    fact: dict[str, Any] = {
        "entity": name,
        "metric": metric.display_name if metric else cell.metric.replace("_", " "),
        "value": cell.value,
        "unit": cell.unit,
    }
    if row := re.match(r"/items/(\d+)", cell.row_identity):
        fact["rank_in_rows"] = int(row[1]) + 1
    return fact


def narrative_payload(
    message: str, results: Sequence[OperationResult], scope: dict[str, Any]
) -> str:
    facts = [
        {"operation": result.operation, **_fact(cell, result)}
        for result in results
        for cell in result.evidence
        if cell.value is not None
    ]
    limit = MAX_CELLS
    while True:
        payload = json.dumps(
            {
                "purpose": "narrative",
                "message": message,
                "scope": scope.get("label"),
                "season": (scope.get("selections") or {}).get("season"),
                "returned_rows": max((len(r.rows) for r in results), default=0),
                "eligible": [r.eligible_count for r in results],
                "limitations": [item for r in results for item in r.limitations][:6],
                "cells": facts[:limit],
            },
            ensure_ascii=False,
            separators=(",", ":"),
            default=str,
        )
        if len(payload.encode()) <= MAX_PAYLOAD_BYTES or limit <= 8:
            return payload
        limit //= 2


def compose_narrative(
    provider: Any,
    message: str,
    results: Sequence[OperationResult],
    scope: dict[str, Any],
    deadline: float,
    run: Callable[[Any, str, float], PlanningOutput],
) -> NarrativeOutcome:
    if not results:
        return NarrativeOutcome("skipped", "no_results")
    if provider is None or not callable(getattr(provider, "narrate", None)):
        return NarrativeOutcome("skipped", "no_narrator")
    if deadline - time.monotonic() < MIN_SECONDS:
        return NarrativeOutcome("skipped", "deadline")
    payload = narrative_payload(message, results, scope)
    try:
        output = run(_NarrateCall(provider), payload, deadline - time.monotonic())
    except ProviderFailure as exc:
        return NarrativeOutcome("fallback", f"provider_{exc.kind}", provider_called=True)
    except TimeoutError:
        return NarrativeOutcome("fallback", "provider_timeout", provider_called=True)
    except Exception:
        logger.exception("narrative provider failed")
        return NarrativeOutcome("fallback", "provider_error", provider_called=True)
    try:
        draft = NarrativeDraft.model_validate(output.data)
    except ValidationError:
        return NarrativeOutcome("fallback", "malformed", provider_called=True)
    if draft.status == "declined":
        return NarrativeOutcome("fallback", "declined", provider_called=True)
    text = " ".join(draft.text.split())
    try:
        check_narrative(text, results, scope)
    except NarrativeRejected as exc:
        logger.info("narrative rejected (%s %r): %s", exc.reason, exc.token, text[:700])
        return NarrativeOutcome(
            "fallback", exc.reason, provider_called=True, text=text, token=exc.token
        )
    return NarrativeOutcome("accepted", "accepted", provider_called=True, text=text)
