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

    # AR09: rules plan "Show scoring" without a provider; this question has no rule plan.
    message = "Show me something interesting"
    answer = run_hybrid_turn(session, request(context, message, plan=False), provider=Provider())
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


@pytest.mark.parametrize("honest", [True, False])
def test_ar04_checked_narrative_survives_http_history_or_falls_back(postgres_conversation, honest):
    from pydantic import SecretStr

    session, context = postgres_conversation
    narrated: list[dict] = []

    class Provider:
        def __init__(self, *_):
            pass

        def plan(self, payload, *, timeout_seconds):
            return PlanningOutput(request(context).plan.model_dump(mode="json"))

        def narrate(self, payload, *, timeout_seconds):
            body = json.loads(payload)
            narrated.append(body)
            leader = next(c for c in body["cells"] if c["metric"] == "Points Per Game")
            value = leader["value"] if honest else leader["value"] + 1.4
            text = f"{leader['entity']} led {body['season']} with {value} points per game."
            return PlanningOutput({"status": "answered", "text": text})

    class Settings:
        gemini_api_key = SecretStr("test-only")
        gemini_model = "fixture"

    app = create_app()
    app.dependency_overrides[get_db] = lambda: session
    headers = {"X-Operator-Token": get_settings().operator_token.get_secret_value()}
    body = request(context, "Show scoring in 2024-25", plan=False)
    with (
        patch("courtload.services.assistant.hybrid.GeminiPlanProvider", Provider),
        patch("courtload.services.assistant.hybrid.get_settings", return_value=Settings()),
        TestClient(app) as client,
    ):
        response = client.post(
            "/api/workbench/assistant/v2/turn", json=body.model_dump(mode="json"), headers=headers
        )
        assert response.status_code == 200, response.text
        answer = response.json()
        replay = client.post(
            "/api/workbench/assistant/v2/turn", json=body.model_dump(mode="json"), headers=headers
        )
        history = client.get(f"/api/workbench/assistant/v2/threads/{answer['thread_id']}/turns")
    assert len(narrated) == 1 and narrated[0]["season"] == "2024-25"
    assert answer["status"] == "answered" and answer["saveable"]
    assert answer["accounting"]["provider_calls"] == 2
    kinds = [block["kind"] for block in answer["blocks"]]
    if honest:
        assert kinds == ["narrative", "result"]
        assert f"{round(280 / 30, 1)} points per game" in answer["blocks"][0]["text"]
    else:
        assert kinds == ["local_claim", "local_claim", "result"]
    # The retained record re-verifies the narrative numbers against its own result cells.
    assert replay.json() == answer
    assert history.status_code == 200, history.text
    assert history.json()["turns"][0]["response"] == answer


def sse_events(text: str) -> list[dict]:
    frames = [frame for frame in text.split("\n\n") if frame and not frame.startswith(":")]
    return [json.loads(frame.split("\ndata: ", 1)[1]) for frame in frames]


def test_ar05_stream_phases_final_and_request_response_fallback(postgres_conversation):
    from pydantic import SecretStr

    session, context = postgres_conversation

    class Provider:
        def __init__(self, *_):
            pass

        def plan(self, payload, *, timeout_seconds):
            return PlanningOutput(request(context).plan.model_dump(mode="json"))

        def narrate(self, payload, *, timeout_seconds):
            body = json.loads(payload)
            leader = next(c for c in body["cells"] if c["metric"] == "Points Per Game")
            value = leader["value"]
            text = f"{leader['entity']} led {body['season']} with {value} points per game."
            return PlanningOutput({"status": "answered", "text": text})

    class Settings:
        gemini_api_key = SecretStr("test-only")
        gemini_model = "fixture"

    app = create_app()
    app.dependency_overrides[get_db] = lambda: session
    headers = {"X-Operator-Token": get_settings().operator_token.get_secret_value()}
    body = request(context, "Show scoring in 2024-25", plan=False).model_dump(mode="json")
    stream_url = "/api/workbench/assistant/v2/turn/stream"
    with (
        patch("courtload.services.assistant.hybrid.GeminiPlanProvider", Provider),
        patch("courtload.services.assistant.hybrid.get_settings", return_value=Settings()),
        TestClient(app) as client,
    ):
        streamed = client.post(stream_url, json=body, headers=headers)
        # The request/response fallback replays the same retained turn by request_id.
        fallback = client.post("/api/workbench/assistant/v2/turn", json=body, headers=headers)
        replayed = client.post(stream_url, json=body, headers=headers)
        unauthorized = client.post(stream_url, json={**body, "request_id": str(uuid4())})
        reused = client.post(stream_url, json={**body, "message": "Changed"}, headers=headers)
        oversized = client.post(stream_url, content=b"x" * (160 * 1024 + 1), headers=headers)
        events = sse_events(streamed.text)
        final = events[-1]["response"]
        history = client.get(f"/api/workbench/assistant/v2/threads/{final['thread_id']}/turns")
    assert streamed.status_code == 200, streamed.text
    assert streamed.headers["content-type"].startswith("text/event-stream")
    assert streamed.headers["cache-control"] == "no-store"
    assert [e["event"] for e in events[:4]] == ["accepted", "phase", "phase", "phase"]
    assert [e["phase"] for e in events[1:4]] == ["understanding", "querying", "writing"]
    assert events[0]["turn_id"] == final["turn_id"]
    assert events[0]["request_id"] == body["request_id"]
    narrative = "".join(e["text"] for e in events if e["event"] == "narrative")
    assert [b["kind"] for b in final["blocks"]] == ["narrative", "result"]
    assert narrative == final["blocks"][0]["text"]
    assert f"{round(280 / 30, 1)} points per game" in narrative
    assert final["accounting"]["provider_calls"] == 2
    assert fallback.status_code == 200 and fallback.json() == final
    replay_events = sse_events(replayed.text)
    assert "phase" not in [e["event"] for e in replay_events]
    assert replay_events[-1]["response"] == final
    assert history.json()["turns"][0]["response"] == final
    # Acceptance failures are ordinary HTTP statuses, never a half-open stream.
    assert unauthorized.status_code in (401, 403)
    assert reused.status_code == 409
    assert oversized.status_code == 413


@pytest.mark.parametrize(
    ("route", "players", "teams", "message", "operation", "field", "entity"),
    [
        (
            "/players/1630567",
            ["1630567"],
            [],
            "Show his profile",
            "profile",
            "player_id",
            "1630567",
        ),
        (
            "/teams/1610612761",
            [],
            ["1610612761"],
            "Show this team",
            "team",
            "team_id",
            "1610612761",
        ),
    ],
)
def test_ar07_page_referents_execute_real_results(
    postgres_conversation, route, players, teams, message, operation, field, entity
):
    from courtload.domain.hybrid_assistant import AssistantPageContext

    session, context = postgres_conversation
    payloads = []

    class Provider:
        def plan(self, payload, *, timeout_seconds):
            payloads.append(json.loads(payload))
            return PlanningOutput(
                AnalysisPlan(
                    steps=[
                        OperationStep(
                            step_id="page", operation=operation, arguments={field: entity}
                        )
                    ]
                ).model_dump(mode="json")
            )

    turn = HybridTurnRequest(
        request_id=uuid4(),
        message=message,
        page_context=AssistantPageContext(
            route=route,
            player_ids=players,
            team_ids=teams,
            selections=ConversationContext(release_id=context.release_id, season="2024-25"),
        ),
    )
    answer = run_hybrid_turn(session, turn, provider=Provider())
    assert answer.status == "answered", answer.model_dump_json()
    assert answer.plan.steps[0].arguments[field] == entity
    assert payloads[0]["page_referents"][field] == entity
    assert entity in payloads[0]["message"]
    assert answer.scope.selections.release_id == context.release_id
    assert any("Resolved page reference" in value for value in answer.scope.assumptions)
    assert any(block.kind == "result" for block in answer.blocks)


def test_ar07_ambiguous_compare_reference_clarifies_without_provider(postgres_conversation):
    from courtload.domain.hybrid_assistant import AssistantPageContext

    session, context = postgres_conversation
    turn = HybridTurnRequest(
        request_id=uuid4(),
        message="Show his profile",
        page_context=AssistantPageContext(
            route="/compare",
            player_ids=["1630567", "2"],
            selections=ConversationContext(release_id=context.release_id, season="2024-25"),
        ),
    )
    answer = run_hybrid_turn(session, turn)
    assert answer.status == "clarification_required"
    assert "Which player" in answer.blocks[0].text
    assert answer.accounting.provider_calls == 0


def test_ar07_wrong_page_referent_gets_one_repair(postgres_conversation):
    from courtload.domain.hybrid_assistant import AssistantPageContext

    session, context = postgres_conversation
    payloads = []

    class Provider:
        def plan(self, payload, *, timeout_seconds):
            payloads.append(json.loads(payload))
            return PlanningOutput(
                AnalysisPlan(
                    steps=[
                        OperationStep(
                            step_id="page",
                            operation="profile",
                            arguments={"player_id": "2" if len(payloads) == 1 else "1630567"},
                        )
                    ]
                ).model_dump(mode="json")
            )

    turn = HybridTurnRequest(
        request_id=uuid4(),
        message="Show his profile",
        page_context=AssistantPageContext(
            route="/players/1630567",
            player_ids=["1630567"],
            selections=ConversationContext(release_id=context.release_id, season="2024-25"),
        ),
    )
    answer = run_hybrid_turn(session, turn, provider=Provider())
    assert answer.status == "answered", answer.model_dump_json()
    assert answer.plan.steps[0].arguments["player_id"] == "1630567"
    assert "page referent" in payloads[1]["rejected_previous_attempt"]


def test_ar07_compare_pair_uses_both_canonical_page_selections(postgres_conversation):
    from courtload.domain.hybrid_assistant import AssistantPageContext

    session, context = postgres_conversation

    class Provider:
        def plan(self, payload, *, timeout_seconds):
            body = json.loads(payload)
            assert body["page_referents"] == {"player_a": "1630567", "player_b": "2"}
            return PlanningOutput(
                AnalysisPlan(
                    steps=[
                        OperationStep(
                            step_id="pair", operation="compare", arguments=body["page_referents"]
                        )
                    ]
                ).model_dump(mode="json")
            )

    answer = run_hybrid_turn(
        session,
        HybridTurnRequest(
            request_id=uuid4(),
            message="Compare these players",
            page_context=AssistantPageContext(
                route="/compare",
                player_ids=["1630567", "2"],
                selections=ConversationContext(release_id=context.release_id, season="2024-25"),
            ),
        ),
        provider=Provider(),
    )
    assert answer.status == "answered", answer.model_dump_json()
    assert answer.plan.steps[0].arguments["player_a"] == "1630567"
    assert answer.plan.steps[0].arguments["player_b"] == "2"
