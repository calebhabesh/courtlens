"""AR03 routing and the general-prose trust boundary, independent of live providers."""

import json
from datetime import date
from types import SimpleNamespace
from unittest.mock import Mock, patch
from uuid import uuid4

import pytest
from pydantic import ValidationError

from courtload.domain.conversation import AnalysisPlan, OperationStep
from courtload.domain.hybrid_assistant import GENERAL_LABEL, HybridTurnRequest, TextBlock
from courtload.services.assistant.hybrid import route_intent, run_hybrid_turn
from courtload.services.assistant.knowledge import registry
from courtload.services.assistant.planner import (
    GENERAL_PROMPT,
    GeminiPlanProvider,
    PlanningOutput,
)
from courtload.services.assistant.revamp_evaluation import load_corpus, score_answer


@pytest.mark.parametrize(
    ("message", "intent"),
    [
        ("Who leads in assists last season?", "local_analysis"),
        ("Show current season scoring", "local_analysis"),
        ("What is Scottie Barnes's points per game?", "local_analysis"),
        ("How many points did Scottie Barnes score?", "local_analysis"),
        ("Explain the points forecast for Scottie Barnes", "local_analysis"),
        ("Explain prediction intervals", "explanation"),
        ("What does a point guard do?", "explanation"),
        ("Who invented basketball?", "explanation"),
        ("Who does Scottie Barnes play for?", "external"),
        ("Who was traded today?", "external"),
        ("What are the current injuries?", "external"),
        ("Explain current rosters", "external"),
        ("Show guards ranked by scoring", "local_analysis"),
        ("Who were the top 10 centers in ppg last season", "local_analysis"),
        ("Refresh the data", "inability"),
        ("Search the internet for injuries", "inability"),
        # Follow-up discourse "Now ..." is not a current-fact request (AR04 finding).
        ("Now show the top 5 instead.", "local_analysis"),
        ("Now, compare him with Trae Young.", "local_analysis"),
        ("Now who is injured?", "external"),
        ("Who is playing well now?", "external"),
    ],
)
def test_server_routes(message, intent):
    assert route_intent(message) == intent


@pytest.mark.parametrize(
    "prose",
    [
        "A player scored 99 points.",
        "A team has five players.",
        "The year is \uff12\uff10\uff12\uff16.",
        "A rate is fifty percent.",
        "A team finished first.",
        "A team finished twelfth.",
        "A player had a dozen assists.",
        "A player scored \u216b points.",
        "A rate is ½.",
    ],
)
def test_general_numbers_rejected_at_wire_boundary(prose):
    with pytest.raises(ValidationError):
        TextBlock(origin="general_knowledge", text=GENERAL_LABEL + "\n" + prose)


def test_general_label_is_required_and_old_text_remains_readable():
    with pytest.raises(ValidationError):
        TextBlock(origin="general_knowledge", text="A basketball concept.")
    assert TextBlock(origin="knowledge", text="Old explanation", source_ids=["old"]).text


def test_all_curated_prose_obeys_number_boundary():
    for entry in registry():
        TextBlock(origin="general_knowledge", text=GENERAL_LABEL + "\n" + entry.text)


def test_frozen_dev_general_category_is_scored_without_release_or_provider():
    corpus, _ = load_corpus()
    for case in corpus["cases"]:
        if case["split"] != "dev" or case["category"] != "general":
            continue
        answer = run_hybrid_turn(
            Mock(),
            HybridTurnRequest(request_id=uuid4(), message=case["message"]),
            clock=lambda: date(2026, 10, 6),
            provider=Mock(),
        )
        assert score_answer(case, {"status": "answered", "kind": "general"}, None, answer)[
            "exact_answer"
        ], case
        assert answer.scope is None and not answer.saveable and answer.plan is None
        assert answer.accounting.provider_calls == answer.accounting.analytical_calls == 0
        assert answer.blocks[0].origin == "general_knowledge"


@pytest.mark.parametrize(
    "data",
    [
        {"status": "answered", "text": "James Naismith invented basketball."},
        {"status": "answered", "text": "James Naismith invented basketball in 1891."},
        {"status": "answered", "text": "A concept.", "steps": []},
        {"status": "unavailable", "text": "I do not know."},
    ],
)
def test_bounded_provider_general_fallback(data):
    provider = Mock()
    provider.plan.return_value = PlanningOutput(data)
    answer = run_hybrid_turn(
        Mock(),
        HybridTurnRequest(request_id=uuid4(), message="Who invented basketball?"),
        provider=provider,
    )
    payload = json.loads(provider.plan.call_args.args[0])
    assert payload["purpose"] == "general_knowledge" and "operations" not in payload
    assert answer.accounting.provider_calls == 1 and answer.accounting.analytical_calls == 0
    assert answer.scope is None and not answer.saveable
    if data["text"] == "James Naismith invented basketball.":
        assert answer.status == "answered" and GENERAL_LABEL in answer.blocks[0].text
    else:
        assert answer.status == "unable" and answer.blocks[0].kind == "inability"
        # Only rendered content; ids and elapsed_ms can contain these digits by chance.
        assert "1891" not in json.dumps([b.model_dump(mode="json") for b in answer.blocks])


@pytest.mark.parametrize(
    "message",
    [
        "Who is on the current Raptors roster?",
        "Who is injured today?",
        "Who was traded?",
    ],
)
def test_current_facts_cannot_use_provider_or_client_plan(message):
    provider = Mock()
    answer = run_hybrid_turn(
        Mock(),
        HybridTurnRequest(
            request_id=uuid4(),
            message=message,
            plan=AnalysisPlan(
                steps=[
                    OperationStep(
                        step_id="a", operation="profile", arguments={"player_id": "1630567"}
                    )
                ]
            ),
        ),
        provider=provider,
    )
    provider.plan.assert_not_called()
    assert answer.status == "unable" and answer.blocks[0].reason == "external_unavailable"
    assert answer.accounting.source_requests == 0


@pytest.mark.filterwarnings(
    "ignore:'_UnionGenericAlias' is deprecated.*:DeprecationWarning:google.genai.types"
)
def test_gemini_general_schema_and_tools_are_bounded():
    with patch("google.genai.Client") as client:
        transport = client.return_value.__enter__.return_value
        transport.models.generate_content.return_value = SimpleNamespace(
            text=json.dumps({"status": "answered", "text": "Basketball uses a ball."}),
            model_version="recorded-version",
            usage_metadata=None,
        )
        output = GeminiPlanProvider("test", "test").plan(
            '{"purpose":"general_knowledge"}',
            timeout_seconds=10,
        )
        config = transport.models.generate_content.call_args.kwargs["config"]
        assert config.system_instruction == GENERAL_PROMPT
        assert config.response_json_schema["additionalProperties"] is False
        assert config.automatic_function_calling.disable and config.tools is None
        assert "plan_version" not in output.data
