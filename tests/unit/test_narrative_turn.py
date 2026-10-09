"""AR04 narrative wiring over a recorded AR02 turn; no provider or network access."""

import json
from copy import deepcopy
from datetime import date
from pathlib import Path
from typing import Any
from unittest.mock import patch
from uuid import uuid4

import pytest
from pydantic import ValidationError

from courtlens.domain.conversation import ConversationContext
from courtlens.domain.hybrid_assistant import HybridTurnRequest, HybridTurnResponse
from courtlens.services.assistant.legacy.hybrid import run_hybrid_turn
from courtlens.services.assistant.legacy.narrative import NarrativeOutcome
from courtlens.services.assistant.legacy.planner import PlanningOutput, ProviderFailure
from courtlens.services.workbench_analytics import ResolvedContext

CAPTURE = json.loads(Path("tests/fixtures/assistant/ar02/recorded-provider-v1.json").read_text())
# The owner's example: "Who led the league in assists per game last season?"
RECORD = next(r for r in CAPTURE["records"] if r["id"] == "ar02-004" and r["repetition"] == 1)
RESULT = next(b["result"] for b in RECORD["response"]["blocks"] if b["kind"] == "result")
LEADER = RESULT["data"]["items"][0]
SECOND = RESULT["data"]["items"][1]


class Planner:
    def __init__(self) -> None:
        self.calls = iter(RECORD["calls"])

    def plan(self, payload: str, *, timeout_seconds: float) -> PlanningOutput:
        return PlanningOutput(deepcopy(next(self.calls)["data"]))


class Narrator(Planner):
    def __init__(self, reply: Any) -> None:
        super().__init__()
        self.reply = reply
        self.payloads: list[dict[str, Any]] = []

    def narrate(self, payload: str, *, timeout_seconds: float) -> PlanningOutput:
        self.payloads.append(json.loads(payload))
        if isinstance(self.reply, Exception):
            raise self.reply
        return PlanningOutput(self.reply)


def run(session, provider, on_phase=None) -> tuple[HybridTurnResponse, list[NarrativeOutcome]]:
    local = RECORD["response"]["scope"]["local_context"]
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
    catalog = {
        "default_season": context.season,
        "stats_scopes": [{"season": context.season, "phase": context.phase}],
    }
    outcomes: list[NarrativeOutcome] = []
    with (
        patch(
            "courtlens.services.assistant.legacy.hybrid.resolve_workbench_context",
            return_value=context,
        ),
        patch(
            "courtlens.services.assistant.legacy.hybrid.stats_catalog_scope", return_value=catalog
        ),
        patch(
            "courtlens.services.assistant.legacy.hybrid.execute_bounded",
            side_effect=lambda *_: deepcopy(RESULT["data"]),
        ),
        patch(
            "courtlens.services.assistant.legacy.planner.GeminiPlanProvider._generate",
            side_effect=AssertionError("Tests must not call Gemini"),
        ),
    ):
        answer = run_hybrid_turn(
            session,
            HybridTurnRequest(
                request_id=uuid4(),
                message=RECORD["message"],
                context=ConversationContext.model_validate(RECORD["expected"]["scope"]),
            ),
            provider=provider,
            clock=lambda: date.fromisoformat(CAPTURE["clock"]),
            on_narrative=outcomes.append,
            on_phase=on_phase,
        )
    return answer, outcomes


def leader_text() -> str:
    return (
        f"{LEADER['player_name']} led the 2025-26 regular season with "
        f"{LEADER['metrics']['ast_per_game']} assists per game over {LEADER['games_played']} "
        f"games, ahead of {SECOND['player_name']} at {SECOND['metrics']['ast_per_game']}."
    )


def kinds(answer: HybridTurnResponse) -> list[str]:
    return [block.kind for block in answer.blocks]


def test_checked_narrative_replaces_template_claims_and_keeps_cells(session):
    narrator = Narrator({"status": "answered", "text": leader_text()})
    answer, outcomes = run(session, narrator)
    assert answer.status == "answered" and answer.saveable
    assert kinds(answer) == ["narrative", "result"]
    assert answer.blocks[0].text == leader_text()  # type: ignore[union-attr]
    assert answer.accounting.provider_calls == 2
    assert [(o.outcome, o.reason) for o in outcomes] == [("accepted", "accepted")]
    # The narrator only receives server cells and the resolved scope.
    payload = narrator.payloads[0]
    assert payload["purpose"] == "narrative" and payload["season"] == "2025-26"
    assert {"entity": LEADER["player_name"], "rank_in_rows": 1}.items() <= next(
        c for c in payload["cells"] if c["value"] == LEADER["metrics"]["ast_per_game"]
    ).items()
    # A stored response re-verifies; history replay renders the same block.
    assert HybridTurnResponse.model_validate(answer.model_dump(mode="json")) == answer


def test_stored_narrative_with_altered_number_fails_validation(session):
    answer, _ = run(session, Narrator({"status": "answered", "text": leader_text()}))
    stored = answer.model_dump(mode="json")
    value = str(LEADER["metrics"]["ast_per_game"])
    stored["blocks"][0]["text"] = stored["blocks"][0]["text"].replace(value, "12.9", 1)
    with pytest.raises(ValidationError, match="unmatched_number"):
        HybridTurnResponse.model_validate(stored)
    stored = answer.model_dump(mode="json")
    stored["blocks"][0]["operation_hashes"] = ["c" * 64]
    with pytest.raises(ValidationError, match="narrative does not bind"):
        HybridTurnResponse.model_validate(stored)


@pytest.mark.parametrize(
    ("reply", "reason"),
    [
        (
            {"status": "answered", "text": "Jokić averaged 14.2 assists per game."},
            "unmatched_number",
        ),
        ({"status": "answered", "text": "He led the 2019-20 season too."}, "season_outside_scope"),
        ({"status": "answered", "text": "He will win the assist title."}, "unverifiable_claim"),
        ({"status": "declined", "text": "The cells do not answer this."}, "declined"),
        ({"plan_version": "courtload-analysis-plan-v1"}, "malformed"),
        (ProviderFailure("quota_exceeded", 60), "provider_quota_exceeded"),
        (ProviderFailure("busy"), "provider_busy"),
        (TimeoutError("narrative"), "provider_timeout"),
    ],
)
def test_rejected_or_failed_narrative_keeps_template_answer(session, reply, reason):
    answer, outcomes = run(session, Narrator(reply))
    # Narration never fails an otherwise answered, saveable turn.
    assert answer.status == "answered" and answer.saveable
    assert kinds(answer) == ["local_claim", "local_claim", "result"]
    assert answer.accounting.provider_calls == 2
    assert [(o.outcome, o.reason, o.provider_called) for o in outcomes] == [
        ("fallback", reason, True)
    ]


def test_provider_without_narrate_skips_without_a_call(session):
    answer, outcomes = run(session, Planner())
    assert kinds(answer) == ["local_claim", "local_claim", "result"]
    assert answer.accounting.provider_calls == 1
    assert [(o.outcome, o.reason) for o in outcomes] == [("skipped", "no_narrator")]


def test_narrative_is_skipped_when_the_turn_deadline_is_nearly_spent(session):
    narrator = Narrator({"status": "answered", "text": leader_text()})
    with patch("courtlens.services.assistant.legacy.narrative.MIN_SECONDS", 10_000):
        answer, outcomes = run(session, narrator)
    assert narrator.payloads == [] and answer.accounting.provider_calls == 1
    assert [(o.outcome, o.reason) for o in outcomes] == [("skipped", "deadline")]


def test_eval_reports_fallback_rate_over_attempted_narratives():
    from courtlens.services.assistant.revamp_evaluation import narrative_summary

    def outcome(kind: str, reason: str, called: bool = True) -> dict[str, Any]:
        return {"outcome": kind, "reason": reason, "provider_called": called}

    records = [
        {"narratives": [outcome("accepted", "accepted")]},
        {"narratives": [outcome("fallback", "unmatched_number")]},
        {"narratives": [outcome("fallback", "provider_quota_exceeded")]},
        {"narratives": [outcome("skipped", "no_narrator", called=False)]},
        {"narratives": []},
        {},
    ]
    assert narrative_summary(records) == {
        "eligible_turns": 4,
        "attempted": 3,
        "accepted": 1,
        "fallback": 2,
        "fallback_rate": 2 / 3,
        "fallback_reasons": {"unmatched_number": 1, "provider_quota_exceeded": 1},
        "skipped": {"no_narrator": 1},
    }


@pytest.mark.filterwarnings(
    "ignore:'_UnionGenericAlias' is deprecated.*:DeprecationWarning:google.genai.types"
)
def test_gemini_narrative_call_uses_its_own_prompt_schema_and_no_tools():
    from types import SimpleNamespace

    from courtlens.services.assistant.legacy.planner import NARRATIVE_PROMPT, GeminiPlanProvider

    with patch("google.genai.Client") as client:
        transport = client.return_value.__enter__.return_value
        transport.models.generate_content.return_value = SimpleNamespace(
            text=json.dumps({"status": "answered", "text": "Jokić led."}),
            model_version="recorded-version",
            usage_metadata=None,
        )
        output = GeminiPlanProvider("test", "test").narrate(
            '{"purpose":"narrative"}', timeout_seconds=10
        )
    config = transport.models.generate_content.call_args.kwargs["config"]
    assert config.system_instruction == NARRATIVE_PROMPT
    assert set(config.response_json_schema["properties"]) == {"status", "text"}
    assert config.response_json_schema["additionalProperties"] is False
    assert config.automatic_function_calling.disable and config.tools is None
    assert output.data == {"status": "answered", "text": "Jokić led."}
