"""V2 real PostgreSQL/API contract over disposable synthetic facts; v1 remains separate."""

import json
from datetime import date
from unittest.mock import patch
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import func, select
from test_conversation_postgres import postgres_conversation as _postgres_fixture

from courtload.api.app import create_app
from courtload.config import get_settings
from courtload.database import get_db
from courtload.domain.conversation import AnalysisPlan, ConversationContext, OperationStep
from courtload.domain.hybrid_assistant import HybridTurnRequest
from courtload.services.assistant.hybrid import run_hybrid_turn
from courtload.services.assistant.planner import PlanningOutput, ProviderFailure
from courtload.services.workbench_analytics import canonical_hash
from courtload.workbench_models import WorkbenchPlayerGame

postgres_conversation = _postgres_fixture


def request(context, message="Show scoring", plan=True):
    return HybridTurnRequest(
        request_id=uuid4(),
        message=message,
        context=ConversationContext(release_id=context.release_id, season="2024-25"),
        plan=AnalysisPlan(
            steps=[
                OperationStep(
                    step_id="stats",
                    operation="query",
                    arguments={
                        "metric_selectors": [{"key": "pts_per_game"}],
                        "sort": [{"field": "pts_per_game"}],
                        "page": {"limit": 10},
                    },
                )
            ]
        )
        if plan
        else None,
    )


def test_real_query_exact_arithmetic_claims_actions_and_readonly(postgres_conversation):
    session, context = postgres_conversation
    before = session.scalar(select(func.count()).select_from(WorkbenchPlayerGame))
    answer = run_hybrid_turn(session, request(context), clock=lambda: date(2026, 10, 5))
    assert answer.status == "answered", answer.model_dump_json()
    assert answer.accounting.analytical_calls == 1
    result = next(block.result for block in answer.blocks if block.kind == "result")
    assert len(result.rows) == 3
    # 20*10 + 10*8 points, independently divided by 30 appearances.
    assert result.rows[0]["metrics"]["pts_per_game"] == round(280 / 30, 1)
    assert answer.actions[0].operation_hash == result.operation_hash
    assert answer.saveable
    for block in answer.blocks:
        if block.kind == "local_claim":
            assert block.cell in result.evidence
            assert block.cell.context_fingerprint == answer.scope.context_fingerprint
    assert before == session.scalar(select(func.count()).select_from(WorkbenchPlayerGame))


def test_v2_http_schema_and_v1_readers(postgres_conversation):
    session, context = postgres_conversation
    app = create_app()
    app.dependency_overrides[get_db] = lambda: session
    with TestClient(app) as client:
        body = request(context).model_dump(mode="json")
        response = client.post(
            "/api/workbench/assistant/v2/turn",
            json=body,
            headers={"X-Operator-Token": get_settings().operator_token.get_secret_value()},
        )
        assert response.status_code == 200, response.text
        assert response.json()["schema_version"] == "courtload-assistant-v2"
        assert client.post("/api/workbench/assistant/turn", json=body).status_code == 422
        assert (
            client.post(
                "/api/workbench/assistant/v2/turn",
                json={**body, "schema_version": "v1"},
                headers={"X-Operator-Token": get_settings().operator_token.get_secret_value()},
            ).status_code
            == 422
        )


def test_relative_missing_coverage_never_substitutes_catalog(postgres_conversation):
    session, context = postgres_conversation
    answer = run_hybrid_turn(
        session, request(context, "Show scoring last season"), clock=lambda: date(2026, 10, 5)
    )
    assert answer.scope.selections.season == "2025-26"
    assert answer.blocks[0].reason == "no_observations"
    assert answer.accounting.analytical_calls == 0


def test_followup_preserves_release_and_changes_scope(postgres_conversation):
    session, context = postgres_conversation
    first = run_hybrid_turn(session, request(context))
    retained = first.scope.selections
    fingerprint = canonical_hash(first.model_dump(mode="json"))
    followup = HybridTurnRequest(
        request_id=uuid4(),
        thread_id=first.thread_id,
        message="2025-26 playoffs",
        plan=request(context).plan,
    )
    second = run_hybrid_turn(session, followup, inherited_context=retained)
    assert second.thread_id == first.thread_id
    assert second.scope.selections.release_id == first.scope.selections.release_id
    assert second.scope.selections.season == "2025-26"
    assert second.scope.selections.phase == "playoffs"
    assert canonical_hash(first.model_dump(mode="json")) == fingerprint


@pytest.mark.parametrize(
    ("kind", "reason"),
    [
        ("disabled", "provider_disabled"),
        ("quota_exceeded", "provider_quota"),
        ("busy", "provider_busy"),
        ("provider_error", "provider_error"),
        ("timeout", "provider_timeout"),
        ("malformed", "malformed_output"),
    ],
)
def test_provider_failure_branches_are_distinct(postgres_conversation, kind, reason):
    session, context = postgres_conversation

    class Provider:
        def plan(self, payload, *, timeout_seconds):
            if kind == "timeout":
                raise TimeoutError("private detail")
            if kind == "malformed":
                return PlanningOutput({"plan_version": "wrong", "claims": "invented"})
            raise ProviderFailure(kind)

    answer = run_hybrid_turn(session, request(context, plan=False), provider=Provider())
    assert answer.blocks[0].reason == reason
    assert answer.accounting.analytical_calls == 0
    assert "private detail" not in answer.model_dump_json()


def test_fixture_planner_reuses_canonical_operations(postgres_conversation):
    session, context = postgres_conversation

    class Provider:
        def plan(self, payload, *, timeout_seconds):
            assert json.loads(payload)["context"]["season"] == "2024-25"
            return PlanningOutput(request(context).plan.model_dump(mode="json"))

    answer = run_hybrid_turn(session, request(context, plan=False), provider=Provider())
    assert answer.status == "answered", answer.model_dump_json()
    assert answer.accounting.provider_calls == answer.accounting.analytical_calls == 1


def test_runtime_knowledge_scope_changes_are_measured(postgres_conversation):
    session, context = postgres_conversation
    present = run_hybrid_turn(session, request(context, "How do I compare players here?", False))
    assert "observed box-score coverage" in present.blocks[-1].text
    missing = request(context, "How do I compare players here?", False).model_copy(
        update={"context": ConversationContext(release_id=context.release_id, season="2025-26")}
    )
    absent = run_hybrid_turn(session, missing)
    assert "not declared" in absent.blocks[-1].text
    assert present.sources[-1].content_sha256 != absent.sources[-1].content_sha256
    assert present.accounting.analytical_calls == absent.accounting.analytical_calls == 0


def test_source_failure_sanitized_not_optional_ai(postgres_conversation):
    session, context = postgres_conversation
    with patch(
        "courtload.services.assistant.hybrid.execute_bounded",
        side_effect=RuntimeError("database secret"),
    ):
        answer = run_hybrid_turn(session, request(context))
    assert answer.blocks[0].reason == "backend_failure"
    assert "database secret" not in answer.model_dump_json()


def test_mixed_local_result_and_definition_use_one_shared_budget(postgres_conversation):
    session, context = postgres_conversation
    answer = run_hybrid_turn(session, request(context, "Show scoring; explain pick and roll"))
    assert answer.status == "answered", answer.model_dump_json()
    assert {block.kind for block in answer.blocks} >= {"local_claim", "result", "text"}
    assert answer.accounting.analytical_calls == 1
    assert answer.accounting.provider_calls == 0


def test_v2_request_bytes_bounded_before_parsing(postgres_conversation):
    session, _ = postgres_conversation
    app = create_app()
    app.dependency_overrides[get_db] = lambda: session
    with TestClient(app) as client:
        response = client.post("/api/workbench/assistant/v2/turn", content=b"x" * (160 * 1024 + 1))
    assert response.status_code == 413


def test_planner_scope_conflict_keeps_server_scope(postgres_conversation):
    """AR01: a stale planner season proposal is recorded and ignored, not a failure."""
    session, context = postgres_conversation

    class Provider:
        def plan(self, payload, *, timeout_seconds):
            body = json.loads(payload)
            assert body["today"] == "2026-10-05"
            plan = request(context).plan.model_dump(mode="json")
            plan["context_changes"] = {"season": "2023-24"}
            return PlanningOutput(plan)

    answer = run_hybrid_turn(
        session, request(context, plan=False), provider=Provider(), clock=lambda: date(2026, 10, 5)
    )
    assert answer.status == "answered", answer.model_dump_json()
    assert answer.scope.selections.season == "2024-25"
    assert answer.plan.context_changes is None
    assert any(
        "ignored the planner's proposed season 2023-24" in a for a in answer.scope.assumptions
    )
    assert answer.accounting.provider_calls == 1


def test_planner_repair_retry_receives_rejection(postgres_conversation):
    session, context = postgres_conversation
    payloads = []

    class Provider:
        def plan(self, payload, *, timeout_seconds):
            payloads.append(json.loads(payload))
            plan = request(context).plan.model_dump(mode="json")
            if len(payloads) == 1:
                plan["steps"][0]["operation"] = "not_registered"
            return PlanningOutput(plan)

    answer = run_hybrid_turn(session, request(context, plan=False), provider=Provider())
    assert answer.status == "answered", answer.model_dump_json()
    assert answer.accounting.provider_calls == 2
    assert payloads[0]["rejected_previous_attempt"] is None
    assert payloads[1]["rejected_previous_attempt"]


def test_planner_gives_up_after_one_repair(postgres_conversation):
    session, context = postgres_conversation

    class Provider:
        def plan(self, payload, *, timeout_seconds):
            return PlanningOutput({"plan_version": "wrong"})

    answer = run_hybrid_turn(session, request(context, plan=False), provider=Provider())
    assert answer.blocks[0].reason == "malformed_output"
    assert answer.accounting.provider_calls == 2
    assert answer.accounting.analytical_calls == 0


def test_execution_value_error_is_not_reported_as_planner_failure(postgres_conversation):
    session, context = postgres_conversation

    class Provider:
        def plan(self, payload, *, timeout_seconds):
            return PlanningOutput(request(context).plan.model_dump(mode="json"))

    with patch(
        "courtload.services.assistant.hybrid.execute_bounded",
        side_effect=ValueError("row budget"),
    ):
        answer = run_hybrid_turn(session, request(context, plan=False), provider=Provider())
    assert answer.blocks[0].reason == "unsupported_operation"
    assert answer.accounting.provider_calls == 1


@pytest.mark.parametrize("join", ["; ", " and show "])
def test_ar03_mixed_has_single_general_sentence_and_exact_query(postgres_conversation, join):
    from courtload.domain.hybrid_assistant import GENERAL_LABEL, GENERAL_NUMBERS

    session, context = postgres_conversation
    message = (
        "Explain pick and roll"
        + join
        + ("scoring in 2024-25" if join == " and show " else "show scoring in 2024-25")
    )
    answer = run_hybrid_turn(session, request(context, message))
    assert answer.status == "answered", answer.model_dump_json()
    prose = [b for b in answer.blocks if b.kind == "text"]
    assert len(prose) == 1 and prose[0].origin == "general_knowledge"
    assert prose[0].text.startswith(GENERAL_LABEL + "\n")
    assert not GENERAL_NUMBERS.search(prose[0].text)
    assert prose[0].text.count(".") == 1
    assert answer.accounting.provider_calls == 0 and answer.accounting.analytical_calls == 1
    assert answer.scope.selections.season == "2024-25" and answer.saveable
    result = next(b.result for b in answer.blocks if b.kind == "result")
    assert result.rows[0]["metrics"]["pts_per_game"] == round(280 / 30, 1)


def test_ar03_label_survives_http_history_and_exact_replay(postgres_conversation):
    from courtload.domain.hybrid_assistant import GENERAL_LABEL

    session, _ = postgres_conversation
    app = create_app()
    app.dependency_overrides[get_db] = lambda: session
    headers = {"X-Operator-Token": get_settings().operator_token.get_secret_value()}
    body = HybridTurnRequest(request_id=uuid4(), message="Explain spacing on offense.")
    with TestClient(app) as client:
        response = client.post(
            "/api/workbench/assistant/v2/turn", json=body.model_dump(mode="json"), headers=headers
        )
        assert response.status_code == 200, response.text
        answer = response.json()
        assert answer["blocks"][0]["origin"] == "general_knowledge"
        assert GENERAL_LABEL in answer["blocks"][0]["text"] and answer["scope"] is None
        replay = client.post(
            "/api/workbench/assistant/v2/turn", json=body.model_dump(mode="json"), headers=headers
        )
        assert replay.json() == answer
        history = client.get(f"/api/workbench/assistant/v2/threads/{answer['thread_id']}/turns")
        assert history.status_code == 200, history.text
        assert history.json()["turns"][0]["response"] == answer
