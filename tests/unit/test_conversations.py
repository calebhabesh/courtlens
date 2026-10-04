"""Offline planner, state, attribution, budgets and adversarial contract acceptance."""

import json
import time
from datetime import date
from pathlib import Path
from threading import Event
from types import SimpleNamespace
from unittest.mock import patch
from uuid import uuid4

import pytest
from fastapi import HTTPException
from pydantic import ValidationError
from sqlalchemy import create_engine
from sqlalchemy.orm import Session

from courtload.domain.conversation import (
    AnalysisPlan,
    ConversationContext,
    ConversationTurnRequest,
    OperationStep,
)
from courtload.domain.query_url import deserialize_params_to_query
from courtload.services.assistant import conversations
from courtload.services.assistant.conversations import clear_conversation, run_conversation_turn
from courtload.services.assistant.operations import (
    EntityClarification,
    canonical_step,
    execute_operation,
    open_url,
)
from courtload.services.assistant.planner import PlanningOutput, ProviderFailure
from courtload.services.assistant.rendering import bind_evidence, render_result
from courtload.services.workbench_analytics import ResolvedContext


@pytest.fixture
def context():
    return ResolvedContext(
        release_id="release-a",
        snapshot_id="snapshot-a",
        dataset_id="dataset-a",
        dataset_type="workbench",
        semantic_signature="sealed",
        mode="research",
        source="fixture",
        season="2024-25",
        phase="regular_season",
        before_date=date(2025, 4, 15),
        cutoff_utc="2025-04-15T04:00:00+00:00",
        window="season",
        coverage_start=date(2024, 10, 1),
        coverage_end=date(2025, 4, 14),
        default_before_date=date(2025, 4, 15),
        supported_dates=[],
        published_at=None,
        warnings=[],
    )


@pytest.fixture
def session(context):
    conversations.reset_local_state()
    engine = create_engine("sqlite://")
    with (
        Session(engine) as session,
        patch.object(conversations, "resolve_workbench_context", return_value=context),
    ):
        yield session
    engine.dispose()
    conversations.reset_local_state()


def turn(**kwargs):
    return ConversationTurnRequest(message="A question", request_id=uuid4(), **kwargs)


def definition(metric="pts"):
    return AnalysisPlan(
        steps=[OperationStep(step_id="a", operation="definition", arguments={"metric": metric})]
    )


class FixturePlanner:
    def __init__(self, data):
        self.data = data
        self.calls = 0
        self.payloads = []

    def plan(self, payload, *, timeout_seconds):
        self.calls += 1
        self.payloads.append(json.loads(payload))
        assert 0 < timeout_seconds <= 20
        return PlanningOutput(self.data, {"total_token_count": 10})


def test_disabled_and_manual_provider_free_execution(session):
    with patch.object(
        conversations, "get_settings", return_value=SimpleNamespace(gemini_api_key=None)
    ):
        disabled = run_conversation_turn(session, turn())
    assert disabled.status == "disabled" and disabled.results == []
    manual = run_conversation_turn(session, turn(plan=definition()))
    assert manual.status == "answered" and manual.accounting["provider_calls"] == 0
    assert manual.results[0].data["definition"]["formula"] == "sum(points)"


def test_pinned_followup_cache_and_request_identity(session):
    provider = FixturePlanner(definition().model_dump(mode="json"))
    first = run_conversation_turn(session, turn(), provider)
    followup = turn(
        conversation_id=first.conversation_id, context_fingerprint=first.context_fingerprint
    )
    second = run_conversation_turn(session, followup, provider)
    assert second.status == "answered" and second.accounting["cache_hits"] == 1
    assert second.accounting["tool_calls"] == 0
    assert provider.payloads[-1]["previous_plan"]["steps"][0]["operation"] == "definition"
    assert second.context == first.context
    repeated = run_conversation_turn(session, followup, provider)
    assert repeated == second and provider.calls == 2
    with pytest.raises(HTTPException) as changed:
        run_conversation_turn(session, followup.model_copy(update={"message": "changed"}), provider)
    assert changed.value.status_code == 409


def test_context_changes_reset_and_expiry(session):
    first = run_conversation_turn(session, turn(plan=definition()))
    with pytest.raises(HTTPException) as mismatch:
        run_conversation_turn(
            session, turn(conversation_id=first.conversation_id, context_fingerprint="0" * 64)
        )
    assert mismatch.value.status_code == 409
    changed_plan = definition().model_copy(
        update={"context_changes": ConversationContext(season="2023-24")}
    )
    changed = run_conversation_turn(session, turn(plan=changed_plan))
    assert changed.status == "clarification_required" and not changed.results
    conversations._turns[first.conversation_id].touched -= 1801
    with pytest.raises(HTTPException) as expired:
        run_conversation_turn(
            session,
            turn(
                conversation_id=first.conversation_id, context_fingerprint=first.context_fingerprint
            ),
        )
    assert expired.value.status_code == 410
    assert clear_conversation(changed.conversation_id)
    assert not clear_conversation(changed.conversation_id)


@pytest.mark.parametrize(
    "args",
    [
        {"sql": "SELECT * FROM players"},
        {"url": "https://example.com"},
        {"secret": "key"},
        {"season": "2025-26"},
        {"phase": "playoffs"},
        {"before_date": "2026-01-01"},
        {"release_id": "other"},
        {"sample_filters": {"position": "G"}},
        {"window": {"sql": "drop"}},
        {"metric_selectors": [{"key": "invented"}]},
    ],
)
def test_invalid_query_arguments_fail_before_execution(session, context, args):
    with pytest.raises(ValueError):
        canonical_step(
            session, context, OperationStep(step_id="a", operation="query", arguments=args)
        )


@pytest.mark.parametrize(
    "operation",
    [
        "sql",
        "web",
        "refresh",
        "train",
        "activate",
        "delete",
        "read_keys",
        "fetch",
        "shell",
        "winner_probability",
    ],
)
def test_prohibited_operations_never_execute(session, operation):
    plan = AnalysisPlan(steps=[OperationStep(step_id="a", operation=operation)])
    with patch.object(conversations, "execute_bounded") as execute:
        answer = run_conversation_turn(session, turn(plan=plan))
    assert answer.status == "unsupported" and answer.results == []
    execute.assert_not_called()


def test_provider_tables_and_prose_are_rejected(session):
    provider = FixturePlanner(
        {
            "steps": [{"step_id": "a", "operation": "definition", "arguments": {"metric": "pts"}}],
            "narrative": "Barnes scored 999",
            "result_tables": [{"rows": [{"pts": 999}]}],
        }
    )
    answer = run_conversation_turn(session, turn(), provider)
    assert answer.status == "unsupported" and not answer.results
    # UUIDs/hashes can randomly contain these digits; inspect displayed numerical content.
    assert "999" not in json.dumps(
        {
            "interpretation": answer.interpretation,
            "results": [r.model_dump(mode="json") for r in answer.results],
            "limitations": answer.limitations,
        }
    )


def test_plan_bounds_cycles_and_duplicate_ids():
    for data in (
        {"steps": [{"step_id": "a", "operation": "definition", "depends_on": ["a"]}]},
        {"steps": [{"step_id": "a", "operation": "definition"}] * 2},
        {"steps": [{"step_id": f"a{i}", "operation": "definition"} for i in range(9)]},
    ):
        with pytest.raises(ValidationError):
            AnalysisPlan.model_validate(data)


def test_entity_clarification_is_context_bound_and_replayed(session):
    plan = AnalysisPlan(
        steps=[
            OperationStep(step_id="a", operation="distribution", arguments={"player_id": "Barnes"})
        ]
    )
    choices = [
        {"value": "1630567", "label": "Scottie Barnes"},
        {"value": "other", "label": "Other Barnes"},
    ]
    with patch(
        "courtload.services.assistant.operations.resolve_entity",
        side_effect=EntityClarification("player_id", choices),
    ):
        first = run_conversation_turn(session, turn(plan=plan))
    assert first.status == "clarification_required" and first.choices == choices
    request = turn(
        conversation_id=first.conversation_id,
        context_fingerprint=first.context_fingerprint,
        clarification_choice="1630567",
    )
    with (
        patch("courtload.services.assistant.operations.resolve_entity", return_value="1630567"),
        patch.object(
            conversations,
            "execute_bounded",
            return_value={
                "summary": {"summary_available": False, "n": 2},
                "samples": [],
                "player_id": "1630567",
                "metric": "pts",
            },
        ),
    ):
        second = run_conversation_turn(session, request)
    assert second.status == "insufficient_sample"
    assert second.plan.steps[0].arguments["player_id"] == "1630567"
    assert second.context_fingerprint == first.context_fingerprint


def test_wrong_equal_value_attribution_fails(context):
    step = OperationStep(step_id="a", operation="query")
    data = {
        "items": [
            {"player_id": "a", "metrics": {"pts": 10}},
            {"player_id": "b", "metrics": {"pts": 10}},
        ]
    }
    result = render_result(step, context, data, "bound")
    a, b = result.evidence
    assert a.value == b.value and a.evidence_id != b.evidence_id
    binding = {
        "evidence_id": a.evidence_id,
        "entity_id": "a",
        "metric": "pts",
        "unit": "points",
        "context_fingerprint": "bound",
        "result_hash": result.result_hash,
    }
    assert bind_evidence(a, **binding) == 10
    for key, wrong in (
        ("entity_id", "b"),
        ("metric", "reb"),
        ("unit", "minutes"),
        ("context_fingerprint", "other"),
        ("result_hash", "other"),
    ):
        with pytest.raises(ValueError):
            bind_evidence(a, **{**binding, key: wrong})


def test_null_zero_and_sample_units(context):
    result = render_result(
        OperationStep(step_id="a", operation="query"),
        context,
        {
            "items": [
                {
                    "player_id": "a",
                    "metrics": {"pts": 0, "reb": None},
                    "sample_sizes": {"pts": 1, "reb": 0},
                }
            ]
        },
        "bound",
    )
    cells = {c.path: c for c in result.evidence}
    assert cells["/items/0/metrics/pts"].value == 0
    assert cells["/items/0/metrics/reb"].value is None
    assert cells["/items/0/metrics/reb"].null_reason
    assert cells["/items/0/sample_sizes/pts"].unit == "observations"
    assert cells["/items/0/metrics/pts"].sample["sample_sizes"] == {"pts": 1, "reb": 0}


def test_equivalent_query_link_roundtrip(session, context):
    from urllib.parse import parse_qs, urlsplit

    step = canonical_step(
        session,
        context,
        OperationStep(
            step_id="a",
            operation="query",
            arguments={
                "metric_selectors": [{"key": "stl_per_game"}],
                "sample_filters": {"min_minutes": 300},
            },
        ),
    )
    params = {k: v[0] for k, v in parse_qs(urlsplit(open_url(step)).query).items()}
    restored = deserialize_params_to_query(params)
    assert restored.metric_selectors[0].key == "stl_per_game"
    assert restored.sample_filters.min_minutes == 300
    assert restored.release_id == context.release_id and restored.before_date == context.before_date


def test_preflight_and_cumulative_rows(session):
    plan = AnalysisPlan(
        steps=[
            OperationStep(step_id=f"a{i}", operation="query", arguments={"page": {"limit": 100}})
            for i in range(3)
        ]
    )
    with patch.object(conversations, "execute_bounded") as execute:
        answer = run_conversation_turn(session, turn(plan=plan))
    assert answer.status == "unsupported"
    execute.assert_not_called()
    with patch.object(
        conversations,
        "execute_bounded",
        return_value={"unexpected_rows": [{"n": i} for i in range(101)]},
    ):
        answer = run_conversation_turn(session, turn(plan=definition()))
    assert answer.status == "unsupported" and not answer.results


def test_provider_payload_error_redaction_and_quota(session):
    class Quota:
        def plan(self, payload, *, timeout_seconds):
            raise ProviderFailure("quota_exceeded", 60)

    first = run_conversation_turn(session, turn(), Quota())
    assert first.status == "quota_exceeded" and first.accounting["retry_after_seconds"] == 60
    blocked = FixturePlanner(definition().model_dump(mode="json"))
    second = run_conversation_turn(session, turn(), blocked)
    assert second.status == "quota_exceeded" and blocked.calls == 0
    conversations.reset_local_state()

    class Error:
        def plan(self, payload, *, timeout_seconds):
            raise RuntimeError("SECRET_API_KEY_PRIVATE_TEXT")

    error = run_conversation_turn(session, turn(), Error())
    assert error.status == "provider_error" and "SECRET" not in error.model_dump_json()
    with patch.object(conversations, "MAX_PROVIDER_BYTES", 100):
        budget = run_conversation_turn(session, turn(), blocked)
    assert budget.status == "unsupported" and blocked.calls == 0


def test_hard_provider_deadline_and_global_concurrency(session):
    started, finish = Event(), Event()

    class Slow:
        def plan(self, payload, *, timeout_seconds):
            started.set()
            finish.wait(2)
            return PlanningOutput(definition().model_dump(mode="json"))

    with patch.object(conversations, "PROVIDER_TIMEOUT_SECONDS", 0.02):
        begin = time.monotonic()
        result = run_conversation_turn(session, turn(), Slow())
    assert result.status == "timeout" and time.monotonic() - begin < 0.5
    assert started.is_set() and conversations._provider_lock.locked()
    busy = run_conversation_turn(
        session, turn(), FixturePlanner(definition().model_dump(mode="json"))
    )
    assert busy.status == "busy"
    finish.set()
    for _ in range(100):
        if not conversations._provider_lock.locked():
            break
        time.sleep(0.001)
    assert not conversations._provider_lock.locked()


def test_single_active_conversation_and_bounded_exchanges(session):
    first = run_conversation_turn(session, turn(plan=definition()))
    state = conversations._turns[first.conversation_id]
    state.lock.acquire()
    try:
        busy = run_conversation_turn(
            session,
            turn(
                conversation_id=first.conversation_id,
                context_fingerprint=first.context_fingerprint,
                plan=definition(),
            ),
        )
        assert busy.status == "busy"
        with pytest.raises(HTTPException):
            clear_conversation(first.conversation_id)
    finally:
        state.lock.release()
    for _ in range(10):
        run_conversation_turn(
            session,
            turn(
                conversation_id=first.conversation_id,
                context_fingerprint=first.context_fingerprint,
                plan=definition(),
            ),
        )
    assert len(state.exchanges) == 8 and len(state.requests) == 8


def test_workload_shifts_golden_pairs_missingness_future_and_ties(session, context):
    games = []
    for player in ("a", "b", "unknown"):
        for day in range(1, 11):
            games.append(
                {
                    "player_id": player,
                    "player_name": player,
                    "game_id": str(day),
                    "game_date": date(2025, 4, day),
                    "appearance": "appeared",
                    "points": None if player == "unknown" else 10 if day <= 5 else 8,
                    "minutes_seconds": 600 if day <= 5 else 1200,
                }
            )
    games.append({"player_id": "future", "game_date": date(2025, 4, 16), "appearance": "appeared"})
    step = OperationStep(
        step_id="a",
        operation="workload_shifts",
        arguments={"period_n": 5, "min_minutes": 100, "limit": 20},
    )
    with patch("courtload.services.assistant.operations._load_player_games", return_value=games):
        data = execute_operation(session, context, step, time.monotonic() + 1)
    assert data["total_eligible"] == 2 and data["total_matches"] == 2
    assert [r["player_id"] for r in data["items"]] == ["a", "b"]
    assert data["items"][0]["delta_minutes"] == 10 and data["items"][0]["delta_points"] == -2
    assert data["items"][0]["recent"]["n"] == 5


CORPUS_PATH = Path("tests/fixtures/assistant/b33-corpus-v1.json")
CORPUS = json.loads(CORPUS_PATH.read_text())


@pytest.mark.parametrize("case", CORPUS["cases"], ids=lambda case: case["id"])
def test_frozen_offline_plan_corpus(session, case):
    """Plans are pre-authored fixtures. This measures no real-model language success."""
    provider = FixturePlanner(case["fixture_plan"])

    def fixture_data(db, context, step, deadline):
        if step.operation == "definition":
            return execute_operation(db, context, step, deadline)
        if step.operation in ("query", "workload_shifts"):
            return {
                "items": [{"player_id": "1630567", "metrics": {"pts": 10}}],
                "total_eligible": 1,
            }
        if step.operation == "distribution":
            return {
                "summary": {"summary_available": True, "n": 10, "mean": 10},
                "samples": [],
                "metric": step.arguments["metric"],
            }
        if step.operation == "compare_periods":
            return {
                "deltas": [
                    {"metric_key": "pts", "absolute_delta": -2, "period_a_n": 10, "period_b_n": 10}
                ]
            }
        if step.operation == "similarity":
            return {
                "target": {"player_id": "1630567"},
                "cohort": {"cohort_size": 10},
                "peers": [{"player_id": "1", "distance": 1.0}],
            }
        if step.operation == "splits":
            return {
                "venue_splits": [{"bucket_key": "home", "n": 10}],
                "rest_splits": [],
                "opponent_splits": [],
            }
        if step.operation == "compare":
            return {"aligned_metrics": [{"metric": "pts", "value_a": 10, "value_b": 9, "diff": 1}]}
        return {"n": 10}

    with (
        patch(
            "courtload.services.assistant.operations.resolve_entity",
            side_effect=lambda _, __, value, ___: value,
        ),
        patch.object(conversations, "execute_bounded", side_effect=fixture_data),
    ):
        answer = run_conversation_turn(
            session, ConversationTurnRequest(message=case["question"], request_id=uuid4()), provider
        )
    expected = {
        "supported": "answered",
        "clarification": "clarification_required",
        "unsupported": "unsupported",
    }[case["category"]]
    assert answer.status == expected
    if expected != "answered":
        assert not answer.results
    else:
        assert answer.manifest and answer.results
    assert provider.calls == 1


def test_frozen_corpus_membership_and_checksum():
    import hashlib

    expected = CORPUS_PATH.with_suffix(".sha256").read_text().split()[0]
    assert hashlib.sha256(CORPUS_PATH.read_bytes()).hexdigest() == expected
    assert len(CORPUS["cases"]) == 45
    assert sum(c["split"] == "held_out" for c in CORPUS["cases"]) == 12
    assert [
        sum(c["category"] == name for c in CORPUS["cases"])
        for name in ("supported", "clarification", "unsupported")
    ] == [25, 10, 10]


def test_real_refinement_transforms_canonical_plan_and_keeps_pinned_inputs(session):
    initial = FixturePlanner(
        {
            "steps": [
                {
                    "step_id": "a",
                    "operation": "query",
                    "arguments": {
                        "sort": [{"field": "stl_per_game"}],
                        "sample_filters": {"min_games": 5},
                        "window": {"kind": "last_10"},
                        "page": {"limit": 10},
                    },
                }
            ]
        }
    )
    refined = FixturePlanner(
        {
            "steps": [
                {
                    "step_id": "a",
                    "operation": "query",
                    "arguments": {
                        "sort": [{"field": "stl_per_game"}],
                        "sample_filters": {"min_games": 5, "min_minutes": 300},
                        "window": {"kind": "last_10"},
                        "page": {"limit": 10},
                    },
                }
            ]
        }
    )
    with patch.object(
        conversations,
        "execute_bounded",
        return_value={
            "items": [{"player_id": "1", "metrics": {"stl_per_game": 1}}],
            "total_eligible": 1,
        },
    ):
        first = run_conversation_turn(session, turn(), initial)
        second = run_conversation_turn(
            session,
            ConversationTurnRequest(
                message="With at least 300 minutes",
                request_id=uuid4(),
                conversation_id=first.conversation_id,
                context_fingerprint=first.context_fingerprint,
            ),
            refined,
        )
    args = second.plan.steps[0].arguments
    assert args["sample_filters"]["min_games"] == 5 and args["sample_filters"]["min_minutes"] == 300
    assert args["sort"][0]["field"] == "stl_per_game" and args["window"]["kind"] == "last_10"
    assert second.context == first.context
    assert refined.payloads[0]["previous_plan"] == first.plan.model_dump(mode="json")
    assert refined.payloads[0]["recent_exchanges"][0]["message"] == "A question"


def test_finance_exact_cents_unknown_and_independent_context_evidence(context):
    step = OperationStep(
        step_id="finance",
        operation="finance",
        arguments={"book_id": "book", "financial_season": "2025-26"},
    )
    data = {
        "context": {"book_id": "book", "financial_season": "2025-26"},
        "book_sha256": "a" * 64,
        "analytical_content_sha256": "b" * 64,
        "contracts": [
            {
                "player_id": "1630567",
                "known_amount_cents": "12345678901",
                "scenario_amount_cents": None,
                "derived_aav_usd": "40000000.00",
            }
        ],
    }
    result = render_result(step, context, data, "pinned")
    cents = next(c for c in result.evidence if c.path.endswith("known_amount_cents"))
    assert cents.value == "12345678901" and cents.unit == "USD cents"
    assert cents.input_identity["financial_context"]["financial_season"] == "2025-26"
    assert cents.input_identity["season"] == "2024-25"
    assert any(c.value is None and c.null_reason for c in result.evidence)
    assert result.open_url.startswith("/contracts?finance_book_id=")


def test_initial_retry_is_coalesced_without_second_provider_call(session):
    provider = FixturePlanner(definition().model_dump(mode="json"))
    initial = turn()
    first = run_conversation_turn(session, initial, provider)
    second = run_conversation_turn(session, initial, provider)
    assert first == second and provider.calls == 1


def test_http_body_limit_before_json_decode():
    from fastapi.testclient import TestClient

    from courtload.api.app import create_app

    client = TestClient(create_app())
    response = client.post(
        "/api/workbench/assistant/turn",
        content=b"x" * (160 * 1024 + 1),
        headers={"Content-Type": "application/json"},
    )
    assert response.status_code == 413


def test_comparison_cell_entity_and_relationship_attribution(context):
    step = OperationStep(
        step_id="a", operation="compare", arguments={"player_a": "a", "player_b": "b"}
    )
    data = {
        "player_a": {"id": "a", "metrics": {"pts": 10}},
        "player_b": {"id": "b", "metrics": {"pts": 10}},
        "aligned_metrics": [
            {"metric": "pts", "value_a": 10, "value_b": 10, "diff": 0, "n_a": 2, "n_b": 3}
        ],
    }
    result = render_result(step, context, data, "bound")
    cells = {c.path: c for c in result.evidence}
    assert cells["/aligned_metrics/0/value_a"].entity_id == "a"
    assert cells["/aligned_metrics/0/value_b"].entity_id == "b"
    assert cells["/aligned_metrics/0/diff"].entity_id == "a_vs_b"
    assert cells["/player_a/metrics/pts"].entity_id == "a"
    assert cells["/aligned_metrics/0/value_a"].sample["n_a"] == 2


def test_registered_predicate_group_is_accepted_and_extra_fields_rejected(session, context):
    args = {
        "predicates": {
            "conjunction": "and",
            "predicates": [
                {"field": "pts_per_game", "op": "gte", "value": 10},
                {"field": "total_minutes", "op": "gte", "value": 300},
            ],
        }
    }
    step = canonical_step(
        session, context, OperationStep(step_id="a", operation="query", arguments=args)
    )
    assert len(step.arguments["predicates"]["predicates"]) == 2
    args["predicates"]["predicates"][0]["sql"] = "SELECT 1"
    with pytest.raises(ValueError):
        canonical_step(
            session, context, OperationStep(step_id="a", operation="query", arguments=args)
        )


@pytest.mark.parametrize(
    "operation,arguments",
    [
        ("distribution", {"player_id": "1630567", "metric": "min_per_game", "window_n": 20}),
        (
            "similarity",
            {
                "target_player_id": "1630567",
                "dimensions": ["pts_per_36", "ts_pct"],
                "min_minutes": 300,
                "top_k": 7,
            },
        ),
        ("splits", {"player_id": "1630567", "from_date": "2025-01-01"}),
        (
            "compare_periods",
            {
                "player_id": "1630567",
                "mode": "date_range",
                "period_a_from": "2025-01-01",
                "period_b_to": "2025-04-14",
            },
        ),
        ("workload_shifts", {"period_n": 10, "min_minutes": 300, "limit": 20}),
    ],
)
def test_exact_research_ui_destination(context, operation, arguments):
    from urllib.parse import parse_qs, urlsplit

    step = OperationStep(step_id="a", operation=operation, arguments=arguments)
    url = open_url(step, context)
    parsed = urlsplit(url)
    assert parsed.path == "/research/operation"
    params = {key: values[0] for key, values in parse_qs(parsed.query).items()}
    assert params.pop("operation") == operation
    assert json.loads(params.pop("arguments")) == arguments
    assert params == {
        key: str(context.to_dict()[key])
        for key in ("release_id", "season", "phase", "before_date", "window")
    }
    assert open_url(step) is None


def test_browser_conversation_reset_preflight_respects_cors_origins():
    from fastapi.testclient import TestClient

    from courtload.api.app import create_app
    from courtload.config import get_settings

    with TestClient(create_app()) as client:
        path = "/api/workbench/assistant/conversations/" + str(uuid4())
        headers = {
            "Origin": get_settings().cors_origins[0],
            "Access-Control-Request-Method": "DELETE",
        }
        accepted = client.options(path, headers=headers)
        assert accepted.status_code == 200
        assert "DELETE" in accepted.headers["access-control-allow-methods"]
        assert accepted.headers["access-control-allow-origin"] == headers["Origin"]
        rejected = client.options(path, headers={**headers, "Origin": "https://untrusted.invalid"})
        assert rejected.status_code == 400
        assert "access-control-allow-origin" not in rejected.headers


def test_planner_argument_guidance_matches_registered_schemas():
    import re

    from courtload.services.assistant.operations import REGISTRY
    from courtload.services.assistant.planner import PLANNER_PROMPT

    guidance = re.findall(r"operation '(\w+)' with (\w+)", PLANNER_PROMPT)
    assert guidance
    for operation, argument in guidance:
        assert argument in REGISTRY[operation].schema.model_fields, (operation, argument)


def test_provider_receives_canonical_team_catalog(session):
    provider = FixturePlanner(definition().model_dump(mode="json"))
    answer = run_conversation_turn(session, turn(), provider=provider)
    assert answer.status == "answered"
    teams = provider.payloads[0]["teams"]
    assert len(teams) == 30
    assert next(t for t in teams if t["tricode"] == "TOR") == {
        "team_id": "1610612761",
        "name": "Toronto Raptors",
        "city": "Toronto",
        "tricode": "TOR",
    }


@pytest.mark.filterwarnings(
    "ignore:'_UnionGenericAlias' is deprecated and slated for removal in Python 3.17:"
    "DeprecationWarning:google.genai.types"
)
def test_gemini_planning_disables_automatic_function_calls():
    from courtload.services.assistant.planner import GeminiPlanProvider

    with patch("google.genai.Client") as client:
        transport = client.return_value.__enter__.return_value
        transport.models.generate_content.return_value = SimpleNamespace(
            text=json.dumps(definition().model_dump(mode="json")),
            model_version="observed-test-model",
            usage_metadata=None,
        )
        provider = GeminiPlanProvider("offline-test-key", "offline-test-model")
        output = provider.plan("{}", timeout_seconds=20)
        config = transport.models.generate_content.call_args.kwargs["config"]
        assert config.automatic_function_calling.disable is True
        assert config.tools is None
        assert output.data["steps"][0]["operation"] == "definition"
