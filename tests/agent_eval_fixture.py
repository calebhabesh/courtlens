"""AG06 authored transport fixtures, explicitly not live language accuracy."""

import gzip
import json
from datetime import UTC, date, datetime
from pathlib import Path
from uuid import UUID

from sqlalchemy import select

from courtlens.domain.assistant_agent import StoredTurnRecord
from courtlens.domain.conversation import ConversationContext
from courtlens.domain.hybrid_assistant import HybridTurnRequest
from courtlens.services.assistant.agent.providers.base import AgentStep, Citation, ToolCall, Usage
from courtlens.services.workbench_analytics import canonical_hash
from courtlens.workbench_models import WorkbenchIdentity

ROOT = Path(__file__).resolve().parents[1]
TODAY = date(2026, 10, 7)
FIXTURE_RELEASE = "00000000-0000-0000-0000-0000000a0601"
FIXTURE_DATASET = "00000000-0000-0000-0000-0000000a0602"
FIXTURE_TIME = datetime(2026, 10, 7, tzinfo=UTC)


def replay_cases(corpus):
    quotas = {
        "leaders": 5,
        "single_player": 5,
        "compare": 3,
        "follow_up": 3,
        "general": 4,
        "mixed": 2,
        "prohibited": 3,
        "web": 4,
        "conflict": 2,
        "forecast": 1,
    }
    supported = {
        "1630567",
        "2544",
        "203999",
        "1627783",
        "1629628",
        "1629029",
        "1626153",
        "1628389",
        "1628424",
    }
    result = []
    for case in corpus["cases"]:
        if case["split"] != "dev":
            continue
        oracle = case["oracle"]
        ids = set(oracle.get("player_ids", [oracle.get("player_id")])) - {None}
        if not ids <= supported:
            continue
        category = case["category"]
        if quotas.get(category, 0):
            quotas[category] -= 1
            result.append(case)
        elif case["id"] == "ar02-134":
            result.append(case)
    return result


def request_for(case, message=None):
    return HybridTurnRequest(
        request_id=UUID(int=606),
        thread_id=UUID(int=607),
        message=message or case["message"],
        context=ConversationContext(
            release_id=FIXTURE_RELEASE,
            season=case.get("season", "2025-26"),
            phase="regular_season",
            before_date=date.fromisoformat(case.get("before_date", "2026-10-07")),
        ),
    )


def history_record(request, answer):
    return StoredTurnRecord(
        thread_id=request.thread_id,
        turn_id=answer.turn_id,
        request=request,
        request_sha256=canonical_hash(request.model_dump(mode="json")),
        accepted_at=FIXTURE_TIME,
        state="completed",
        response=answer,
        response_sha256=canonical_hash(answer.model_dump(mode="json")),
    )


class AuthoredProvider:
    model = "synthetic-ag06-not-language-accuracy"

    def __init__(self, session, case, setup=False):
        self.case = case
        oracle = case["oracle"]
        kind = oracle["kind"]
        self.call = None
        if kind in {"ranking", "single", "mixed"}:
            metric = oracle["metric"]
            args = {
                "metric_selectors": [{"key": metric}],
                "sort": [{"field": metric, "direction": "desc"}],
                "page": {"limit": 10 if setup else oracle["limit"]},
            }
            if kind == "single":
                args["name"] = session.scalar(
                    select(WorkbenchIdentity.display_name).where(
                        WorkbenchIdentity.namespace == "nba",
                        WorkbenchIdentity.kind == "player",
                        WorkbenchIdentity.external_id == oracle["player_id"],
                    )
                )
            self.call = ToolCall(
                id="answer", name="query_stats", arguments={"operation": "query", "arguments": args}
            )
        elif kind == "compare":
            self.call = ToolCall(
                id="answer",
                name="query_stats",
                arguments={
                    "operation": "compare",
                    "arguments": dict(
                        zip(("player_a", "player_b"), oracle["player_ids"], strict=True)
                    ),
                },
            )
        elif kind == "forecast":
            self.call = ToolCall(
                id="answer",
                name="query_stats",
                arguments={
                    "operation": "forecast",
                    "arguments": {"player_id": oracle["player_id"]},
                },
            )
        self.called = False

    def step(self, system_prompt, messages, tools, **kwargs):
        if self.call and not self.called:
            self.called = True
            return AgentStep(tool_calls=[self.call], usage=Usage(input_tokens=10, output_tokens=10))
        kind = self.case["oracle"]["kind"]
        if kind == "web":
            text = "The cited synthetic source supplies the requested basketball context."
            return AgentStep(
                text=text,
                usage=Usage(input_tokens=10, output_tokens=10, web_searches=1),
                citations=[
                    Citation(
                        url="https://example.org/ag06-authored-fixture",
                        title="Synthetic transport fixture",
                        publisher="example.org",
                        retrieved_at=FIXTURE_TIME,
                        cited_text=text,
                        span=(0, len(text)),
                    )
                ],
            )
        text = "The requested statistics are shown in the returned CourtLens result.[^s1]"
        if kind == "forecast":
            text = "No registered forecast issuance exists in this synthetic scope."
        if kind in {"general", "mixed"}:
            text += " Basketball concepts: " + ", ".join(self.case["oracle"]["terms"]) + "."
        if self.case.get("require_assumption"):
            text = "Assumption: Scoring means observed points per game for Scottie Barnes.\n" + text
        return AgentStep(text=text, usage=Usage(input_tokens=10, output_tokens=10))


def read_record(path):
    with gzip.open(path, "rt") as handle:
        return json.load(handle)
