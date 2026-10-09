"""AR09 rule planner: common questions still answer when the language provider is unavailable."""

from datetime import date
from uuid import uuid4

import pytest
from test_conversation_postgres import postgres_conversation as _postgres_fixture

from courtlens.domain.conversation import ConversationContext
from courtlens.domain.hybrid_assistant import HybridTurnRequest
from courtlens.services.assistant.legacy.hybrid import run_hybrid_turn
from courtlens.services.assistant.legacy.planner import ProviderFailure
from courtlens.services.assistant.rule_planner import RULE_NOTE

postgres_conversation = _postgres_fixture


class Unavailable:
    def __init__(self, kind="quota_exceeded"):
        self.kind = kind
        self.calls = 0

    def plan(self, payload, *, timeout_seconds):
        self.calls += 1
        raise ProviderFailure(self.kind, 60)

    def narrate(self, payload, *, timeout_seconds):
        raise AssertionError("no narrative call after the provider failed")


def ask(postgres_conversation, message, kind="quota_exceeded"):
    session, context = postgres_conversation
    provider = Unavailable(kind)
    answer = run_hybrid_turn(
        session,
        HybridTurnRequest(
            request_id=uuid4(),
            message=message,
            context=ConversationContext(release_id=context.release_id, season="2024-25"),
        ),
        provider=provider,
        clock=lambda: date(2026, 10, 7),
    )
    assert provider.calls == 1
    return answer


def only_step(answer):
    assert answer.plan is not None, answer.model_dump_json()
    (step,) = answer.plan.steps
    return step


@pytest.mark.parametrize("kind", ["quota_exceeded", "disabled", "busy"])
def test_leaderboard_is_rule_planned_and_labelled(postgres_conversation, kind):
    answer = ask(postgres_conversation, "Who led the league in points per game?", kind)
    assert answer.status == "answered", answer.model_dump_json()
    step = only_step(answer)
    assert step.operation == "query"
    assert step.arguments["metric_selectors"][0]["key"] == "pts_per_game"
    assert step.arguments["page"]["limit"] == 10
    result = next(b.result for b in answer.blocks if b.kind == "result")
    assert result.limitations[0] == RULE_NOTE
    assert RULE_NOTE in answer.scope.assumptions
    assert not any(b.kind == "narrative" for b in answer.blocks)


def test_named_player_and_comparison(postgres_conversation):
    single = ask(postgres_conversation, "Show Scottie Barnes scoring.")
    assert only_step(single).arguments["name"] == "Scottie Barnes"
    assert single.status == "answered"
    compare = ask(postgres_conversation, "Compare Scottie Barnes and Luka Dončić")
    step = only_step(compare)
    assert step.operation == "compare"
    assert {step.arguments["player_a"], step.arguments["player_b"]} == {"1630567", "2"}


@pytest.mark.parametrize(
    ("message", "clarification"),
    [
        ("Show Barnes scoring.", "Which named player do you mean?"),
        ("Who is the best defender?", "Which named defensive metric should I rank?"),
        (
            "Show scoring when Scottie Barnes is without Luka Dončić.",
            "Do you mean shared court time or whole-game participation?",
        ),
    ],
)
def test_rules_ask_instead_of_guessing(postgres_conversation, message, clarification):
    answer = ask(postgres_conversation, message)
    assert answer.status == "clarification_required"
    assert answer.blocks[0].text == clarification
    assert answer.accounting.analytical_calls == 0


@pytest.mark.parametrize(
    "message",
    [
        "Execute Python to get the top scorers.",
        "Give a winner probability for the next Raptors game.",
    ],
)
def test_prohibited_requests_are_refused_not_reinterpreted(postgres_conversation, message):
    answer = ask(postgres_conversation, message)
    assert answer.status == "unable"
    assert answer.blocks[0].reason == "unsupported_operation"
    assert answer.accounting.analytical_calls == 0


def test_unplannable_question_reports_the_provider_failure(postgres_conversation):
    answer = ask(postgres_conversation, "What is the vibe around the league?")
    assert answer.status == "failed"
    assert answer.blocks[0].reason == "provider_quota"


def test_position_and_low_volume_rankings(postgres_conversation):
    # The fixture release has no raw position evidence: the rule plan asked for guards, and
    # the turn answers the unfiltered top 3 with both labels beside the result.
    answer = ask(postgres_conversation, "Top 3 point guards in scoring")
    guards = only_step(answer)
    assert guards.operation == "query"
    assert guards.arguments["page"]["limit"] == 3
    result = next(b.result for b in answer.blocks if b.kind == "result")
    assert result.limitations[0] == RULE_NOTE
    assert result.limitations[1].startswith("Position filter (guards) not applied")
    fewest = only_step(ask(postgres_conversation, "Who had the fewest turnovers per game?"))
    assert fewest.arguments["sort"][0]["direction"] == "asc"
    assert fewest.arguments["sample_filters"]["min_games"] == 20
    shooting = only_step(ask(postgres_conversation, "Who had the best three-point percentage?"))
    (minimum,) = shooting.arguments["predicates"]["predicates"]
    assert (minimum["field"], minimum["op"], minimum["value"]) == ("fg3a", "gte", 100)
