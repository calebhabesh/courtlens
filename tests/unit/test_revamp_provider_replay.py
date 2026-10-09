"""Replay actual captured Gemini plans through the assistant without provider/network access.

SQL oracle expectations and immutable result bytes were acquired independently during
the baseline. Execution is replayed here; Postgres oracle semantics have their own tests.
"""

import hashlib
import json
from copy import deepcopy
from datetime import date
from pathlib import Path
from unittest.mock import patch
from uuid import uuid4

import pytest

from courtlens.domain.conversation import ConversationContext
from courtlens.domain.hybrid_assistant import HybridTurnRequest
from courtlens.services.assistant.legacy.hybrid import run_hybrid_turn
from courtlens.services.assistant.legacy.planner import PlanningOutput, ProviderFailure
from courtlens.services.assistant.revamp_evaluation import load_corpus, score_answer
from courtlens.services.assistant.rule_planner import RULE_NOTE
from courtlens.services.workbench_analytics import ResolvedContext

RECORDING = Path("tests/fixtures/assistant/ar02/recorded-provider-v1.json")
CAPTURE = json.loads(RECORDING.read_text())
CORPUS, DIGEST = load_corpus(Path("evaluation/assistant/ar02-v1.json"))
CASES = {c["id"]: c for c in CORPUS["cases"] if c["split"] == "dev"}
# Registered after capture (AR09 answer-first). Everything the recorded calls saw must still
# be byte-identical; only these named additions are excluded from that comparison.
ADDED_AFTER_CAPTURE = {"position_query"}


def test_recordings_are_actual_inference_and_bound_to_frozen_dev_corpus():
    assert CAPTURE["mode"] == "recorded_live_gemini"
    assert CAPTURE["corpus_sha256"] == DIGEST
    assert hashlib.sha256(RECORDING.read_bytes()).hexdigest() == (
        RECORDING.with_suffix(".sha256").read_text().strip()
    )
    assert len(CAPTURE["records"]) >= 9
    assert all(r["id"] in CASES and r["calls"] for r in CAPTURE["records"])
    assert all(c["model_version"] and c["usage"] for r in CAPTURE["records"] for c in r["calls"])


@pytest.mark.parametrize("record", CAPTURE["records"], ids=lambda r: f"{r['id']}-{r['repetition']}")
def test_recorded_provider_replay(session, record):
    response = record["response"]
    local = response["scope"]["local_context"]
    context = ResolvedContext(
        **{
            k: v
            for k, v in local.items()
            if k not in ("metric_version", "before_date", "coverage_start", "coverage_end")
        },
        before_date=date.fromisoformat(local["before_date"]),
        coverage_start=date.fromisoformat(local["coverage_start"]),
        coverage_end=date.fromisoformat(local["coverage_end"]),
        default_before_date=date.fromisoformat(local["before_date"]),
        supported_dates=[],
        warnings=[],
    )
    calls = iter(record["calls"])
    executed = []

    class ReplayProvider:
        def plan(self, payload, *, timeout_seconds):
            capture = next(calls)
            body = json.loads(payload)
            operations = [
                op for op in body.pop("operations") if op["name"] not in ADDED_AFTER_CAPTURE
            ]
            from courtlens.services.workbench_analytics import canonical_hash

            assert canonical_hash(operations) == capture["operations_sha256"]
            assert body == capture["input"]
            if capture.get("failure"):
                raise ProviderFailure(capture["failure"], capture.get("retry_after"))
            return PlanningOutput(deepcopy(capture["data"]), capture["usage"])

    def execute(db, resolved, step, deadline):
        index = len(executed)
        observed = response["plan"]["steps"][index]
        assert step.operation == observed["operation"]
        assert step.arguments == observed["arguments"]
        executed.append(step)
        return deepcopy(
            [b["result"]["data"] for b in response["blocks"] if b["kind"] == "result"][index]
        )

    pinned = ConversationContext.model_validate(record["expected"]["scope"])
    catalog = {
        "default_season": context.season,
        "stats_scopes": [{"season": context.season, "phase": context.phase}],
    }
    with (
        patch(
            "courtlens.services.assistant.legacy.hybrid.resolve_workbench_context",
            return_value=context,
        ),
        patch(
            "courtlens.services.assistant.legacy.hybrid.stats_catalog_scope", return_value=catalog
        ),
        patch("courtlens.services.assistant.legacy.hybrid.execute_bounded", side_effect=execute),
        patch(
            "courtlens.services.assistant.legacy.planner.GeminiPlanProvider.plan",
            side_effect=AssertionError("CI must not call Gemini"),
        ),
        patch(
            "courtlens.services.assistant.legacy.hybrid.retrieve_source",
            side_effect=AssertionError("CI must not retrieve external sources"),
        ),
    ):
        answer = run_hybrid_turn(
            session,
            HybridTurnRequest(request_id=uuid4(), message=record["message"], context=pinned),
            provider=ReplayProvider(),
            clock=lambda: date.fromisoformat(CAPTURE["clock"]),
        )
    assert next(calls, None) is None
    assert answer.accounting.provider_calls == len(record["calls"])
    score = score_answer(CASES[record["id"]], record["expected"], record["expected_plan"], answer)
    if any(call.get("failure") == "quota_exceeded" for call in record["calls"]):
        # AR09: a recorded quota stop is now planned by rules, and must say so.
        assert answer.plan is not None, answer.model_dump_json()
        assert RULE_NOTE in answer.scope.assumptions
        assert score["plan_correct"] >= record["plan_correct"]
        return
    assert score["exact_answer"] == record["exact_answer"]
    assert score["plan_correct"] == record["plan_correct"]
