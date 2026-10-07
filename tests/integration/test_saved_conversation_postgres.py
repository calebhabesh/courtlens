"""B35a real PostgreSQL durable saving, complete exports and mutation boundaries."""

import csv
import importlib.util
import io
import json
from pathlib import Path
from unittest.mock import patch
from uuid import uuid4

import pytest
from alembic.migration import MigrationContext
from alembic.operations import Operations
from fastapi import HTTPException
from fastapi.testclient import TestClient
from sqlalchemy import func, select, text
from sqlalchemy.exc import DBAPIError
from test_conversation_postgres import (
    postgres_conversation as postgres_conversation,
)
from test_conversation_postgres import request

from courtlens.api.app import create_app
from courtlens.conversation_models import SavedConversationAnalysis, SavedConversationInput
from courtlens.database import get_db
from courtlens.domain.conversation import OperationStep, SaveConversationRequest
from courtlens.services.assistant import saved
from courtlens.services.assistant.conversations import clear_conversation, run_conversation_turn
from courtlens.services.workbench_analytics import canonical_hash
from courtlens.workbench_models import WorkbenchIdentity, WorkbenchPlayerGame


def save_request(answer, **updates):
    return SaveConversationRequest(
        request_id=uuid4(),
        conversation_id=answer.conversation_id,
        turn_id=answer.turn_id,
        context_fingerprint=answer.context_fingerprint,
        title="=SUM(A1)",
        **updates,
    )


@pytest.mark.parametrize(
    "operation,arguments",
    [
        ("definition", {"metric": "pts"}),
        ("query", {"page": {"limit": 2}}),
        ("profile", {"player_id": "1630567"}),
        ("compare", {"player_a": "1630567", "player_b": "1"}),
        ("team", {"team_id": "1610612761"}),
        ("forecast", {"player_id": "1630567"}),
        ("distribution", {"player_id": "1630567", "metric": "pts"}),
        ("compare_periods", {"player_id": "1630567", "metrics": ["pts_per_game"]}),
        ("splits", {"player_id": "1630567"}),
        ("similarity", {"target_player_id": "1630567"}),
        ("workload_shifts", {}),
    ],
)
def test_save_clear_reproduce_export_all_supported_types(
    postgres_conversation, operation, arguments
):
    session, context = postgres_conversation
    with patch(
        "courtlens.services.assistant.conversations.GeminiPlanProvider",
        side_effect=AssertionError("AI forbidden"),
    ):
        answer = run_conversation_turn(
            session,
            request(
                context, [OperationStep(step_id="a", operation=operation, arguments=arguments)]
            ),
        )
        assert answer.manifest is not None, answer.model_dump_json()
        assert session.scalar(select(func.count()).select_from(SavedConversationAnalysis)) == 0
        payload = save_request(answer)
        retained = saved.save_conversation(session, payload)
        assert retained["metadata"] == {"question_saved": False, "question": None}
        assert canonical_hash(retained["manifest"]) == retained["manifest_sha256"]
        assert clear_conversation(answer.conversation_id)
        assert saved.save_conversation(session, payload)["id"] == retained["id"]
        report = saved.reproduce_saved(session, retained["id"])
        assert report["match"], report
        assert report["provider_calls"] == 0
        assert json.loads(saved.export_saved(session, retained["id"], "json")[0]) == retained
        rows = list(csv.reader(io.StringIO(saved.export_saved(session, retained["id"], "csv")[0])))
        assert rows[1] == ["title", "'=SUM(A1)"]
        parts = [json.loads(row[2]) for row in rows if row[0] == "manifest_json_part"]
        assert json.loads("".join(parts)) == retained["manifest"]
        assert saved.list_saved(session)[0]["id"] == retained["id"]
        assert saved.saved_inventory(session) == [
            {"id": retained["id"], "manifest_sha256": retained["manifest_sha256"]}
        ]


@pytest.mark.parametrize("extra_players", [120, 2000])
def test_full_stats_export_beyond_page_and_one_hundred(postgres_conversation, extra_players):
    session, context = postgres_conversation
    original = session.scalar(select(WorkbenchPlayerGame).limit(1))
    for n in range(extra_players):
        pid = str(10000 + n)
        session.add(
            WorkbenchIdentity(
                namespace="nba", kind="player", external_id=pid, display_name=f"Player {n}"
            )
        )
        session.add(
            WorkbenchPlayerGame(
                dataset_id=context.dataset_id,
                game_id=original.game_id,
                player_id=pid,
                team_id=original.team_id,
                opponent_id=original.opponent_id,
                game_date=original.game_date,
                season=context.season,
                phase=context.phase,
                appearance="appeared",
                minutes_original="20",
                minutes_seconds=1200,
                points=n,
                stats_json={"points": n},
                source_version_id=original.source_version_id,
                source_observation_id=original.source_observation_id,
            )
        )
    session.commit()
    answer = run_conversation_turn(
        session,
        request(
            context,
            [OperationStep(step_id="a", operation="query", arguments={"page": {"limit": 2}})],
        ),
    )
    assert len(answer.results[0].rows) == 2
    if extra_players == 2000:
        with pytest.raises(HTTPException) as exc:
            saved.save_conversation(session, save_request(answer))
        assert exc.value.status_code == 413
        assert session.scalar(select(func.count()).select_from(SavedConversationAnalysis)) == 0
        return
    retained = saved.save_conversation(session, save_request(answer))
    result = retained["manifest"]["results"][0]
    assert len(result["rows"]) == result["eligible_count"] == 123
    assert result["data"]["has_more"] is False and result["data"]["next_cursor"] is None
    assert len({row["player_id"] for row in result["rows"]}) == 123
    assert saved.reproduce_saved(session, retained["id"])["match"]


def test_http_save_privacy_idempotence_and_client_write_rejection(postgres_conversation):
    session, context = postgres_conversation
    app = create_app()
    app.dependency_overrides[get_db] = lambda: session
    client = TestClient(app)
    answer = run_conversation_turn(
        session,
        request(
            context,
            [OperationStep(step_id="a", operation="definition", arguments={"metric": "pts"})],
        ),
    )
    payload = save_request(answer, include_question=True).model_dump(mode="json")
    base = "/api/workbench/assistant/investigations"
    assert client.post(base, json={**payload, "results": [{"value": 999}]}).status_code == 422
    response = client.post(base, json=payload)
    assert response.status_code == 201, response.text
    retained = response.json()
    assert retained["metadata"] == {"question_saved": True, "question": "Manual read"}
    assert client.post(base, json={**payload, "title": "Other"}).status_code == 409
    assert client.get(base + "/" + retained["id"]).json() == retained
    assert client.get(base + "/" + retained["id"] + "/reproduce").json()["match"]
    export = client.get(base + "/" + retained["id"] + "/export?format=json")
    assert export.headers["cache-control"] == "no-store" and export.json() == retained
    assert client.get(base + "?limit=0").status_code == 422
    assert client.get(base + "/" + str(uuid4())).status_code == 404
    assert client.get(base + "/" + retained["id"] + "/export?format=exe").status_code == 422


def test_expired_changed_failed_and_oversized_results_do_not_save(postgres_conversation):
    session, context = postgres_conversation
    answer = run_conversation_turn(
        session,
        request(
            context,
            [OperationStep(step_id="a", operation="definition", arguments={"metric": "pts"})],
        ),
    )
    payload = save_request(answer)
    for updates, status in [({"context_fingerprint": "f" * 64}, 409), ({"turn_id": uuid4()}, 410)]:
        with pytest.raises(HTTPException) as exc:
            saved.save_conversation(session, payload.model_copy(update=updates))
        assert exc.value.status_code == status
    with patch.object(saved, "MAX_MANIFEST_BYTES", 1), pytest.raises(HTTPException) as exc:
        saved.save_conversation(session, payload)
    assert exc.value.status_code == 413
    with (
        patch.object(saved, "execute_bounded", return_value={"changed": True}),
        pytest.raises(HTTPException) as exc,
    ):
        saved.save_conversation(session, payload)
    assert exc.value.status_code == 409
    clear_conversation(answer.conversation_id)
    with pytest.raises(HTTPException) as exc:
        saved.save_conversation(session, payload)
    assert exc.value.status_code == 410
    assert session.scalar(select(func.count()).select_from(SavedConversationAnalysis)) == 0


def test_version_unavailable_still_exports_and_orm_sealed(postgres_conversation):
    session, context = postgres_conversation
    answer = run_conversation_turn(
        session,
        request(
            context,
            [OperationStep(step_id="a", operation="definition", arguments={"metric": "pts"})],
        ),
    )
    retained = saved.save_conversation(session, save_request(answer))
    with patch.object(saved, "METRIC_CATALOG_VERSION", "future"):
        report = saved.reproduce_saved(session, retained["id"])
        assert not report["match"] and "version" in report["reason"]
        assert json.loads(saved.export_saved(session, retained["id"], "json")[0]) == retained
    row = session.get(SavedConversationAnalysis, retained["id"])
    row.title = "mutated"
    with pytest.raises(RuntimeError, match="append-only"):
        session.commit()
    session.rollback()
    assert saved.get_saved(session, retained["id"])["title"] == "=SUM(A1)"


def test_paired_results_and_opt_in_question_have_separate_identity(postgres_conversation):
    session, context = postgres_conversation
    answer = run_conversation_turn(
        session,
        request(
            context,
            [
                OperationStep(
                    step_id="points",
                    operation="distribution",
                    arguments={"player_id": "1630567", "metric": "pts"},
                ),
                OperationStep(
                    step_id="minutes",
                    operation="distribution",
                    arguments={"player_id": "1630567", "metric": "min_per_game"},
                ),
            ],
        ),
    )
    private = saved.save_conversation(session, save_request(answer))
    opted = saved.save_conversation(session, save_request(answer, include_question=True))
    assert private["id"] != opted["id"]
    assert private["manifest_sha256"] == opted["manifest_sha256"]
    assert private["metadata"]["question"] is None
    assert opted["metadata"]["question"] == "Manual read"
    assert [r["data"]["summary"]["mean"] for r in private["manifest"]["results"]] == [9, 25]
    clear_conversation(answer.conversation_id)
    assert saved.reproduce_saved(session, private["id"])["match"]


def test_recovery_inventory_mismatch_and_tampered_artifact_rejected(
    postgres_conversation, tmp_path
):
    from courtlens.services.backup_restore import verify_restored_state

    session, context = postgres_conversation
    answer = run_conversation_turn(
        session,
        request(
            context,
            [OperationStep(step_id="a", operation="definition", arguments={"metric": "pts"})],
        ),
    )
    retained = saved.save_conversation(session, save_request(answer))
    with pytest.raises(ValueError, match="inventory differs"):
        verify_restored_state(session, artifacts_dir=tmp_path, expected_saved_conversations=[])
    # Only this disposable fixture lacks SQL sealing, to simulate damaged restoration bytes.
    session.execute(
        text("UPDATE saved_conversation_analyses SET manifest_sha256=:hash"), {"hash": "f" * 64}
    )
    session.commit()
    with pytest.raises(HTTPException) as exc:
        saved.get_saved(session, retained["id"])
    assert exc.value.status_code == 409


def test_migration_seals_sql_mutations_and_has_valid_foreign_keys(postgres_conversation):
    session, context = postgres_conversation
    session.execute(text("DROP TABLE saved_conversation_inputs"))
    session.execute(text("DROP TABLE saved_conversation_analyses"))
    spec = importlib.util.spec_from_file_location(
        "b35", Path("migrations/versions/35b810a4f003_saved_conversations.py")
    )
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    with Operations.context(MigrationContext.configure(session.connection())):
        module.upgrade()
    session.commit()
    answer = run_conversation_turn(
        session,
        request(
            context,
            [OperationStep(step_id="a", operation="definition", arguments={"metric": "pts"})],
        ),
    )
    retained = saved.save_conversation(session, save_request(answer))
    for sql in [
        "UPDATE saved_conversation_analyses SET title='bad'",
        "DELETE FROM saved_conversation_analyses",
        "TRUNCATE saved_conversation_analyses CASCADE",
        "UPDATE saved_conversation_inputs SET step_id='bad'",
        "DELETE FROM saved_conversation_inputs",
    ]:
        with pytest.raises(DBAPIError, match="append-only"):
            session.execute(text(sql))
        session.rollback()
    assert saved.get_saved(session, retained["id"])
    assert session.scalar(select(func.count()).select_from(SavedConversationInput)) == 1
    with Operations.context(MigrationContext.configure(session.connection())):
        module.downgrade()
    session.commit()


def test_retained_forecast_pins_issuance_after_later_policy_and_score(postgres_conversation):
    from datetime import UTC, date, datetime

    from courtlens.workbench_models import ForecastIssuance, ForecastScore, ModelPolicyActivation

    session, context = postgres_conversation

    def issuance(hour, points):
        policy = ModelPolicyActivation(
            policy_name=f"synthetic-{hour}",
            target_metric="pts",
            estimator_identity="synthetic",
            calibration_identity="synthetic",
        )
        session.add(policy)
        session.flush()
        row = ForecastIssuance(
            policy_id=policy.id,
            player_id="1630567",
            target_game_id="0022409999",
            target_game_date=date(2025, 4, 15),
            target_opponent_id="1610612738",
            issued_at_utc=datetime(2025, 4, 14, hour, tzinfo=UTC),
            dataset_id=context.dataset_id,
            features_hash="e" * 64,
            features_json={},
            schedule_evidence_json={},
            team_evidence_json={},
            point_estimate=points,
            interval_lower=0,
            interval_upper=30,
        )
        session.add(row)
        session.commit()
        return row

    original = issuance(12, 10)
    answer = run_conversation_turn(
        session,
        request(
            context,
            [OperationStep(step_id="a", operation="forecast", arguments={"player_id": "1630567"})],
        ),
    )
    retained = saved.save_conversation(session, save_request(answer))
    assert retained["manifest"]["plan"]["steps"][0]["arguments"]["issuance_id"] == original.id
    assert session.get(SavedConversationInput, (retained["id"], "a")).issuance_id == original.id
    later = issuance(13, 25)
    session.add(
        ForecastScore(
            issuance_id=original.id,
            observed_points=999,
            scoring_policy_id="synthetic",
            score_status="scored",
            absolute_error=989,
            interval_hit=False,
        )
    )
    session.commit()
    assert saved.reproduce_saved(session, retained["id"])["match"]
    assert retained["manifest"]["results"][0]["data"]["point_estimate"] == 10
    assert "scores" not in retained["manifest"]["results"][0]["data"]
    # Clear the read cache to observe the newly added synthetic issuance independently.
    from courtlens.services.assistant.conversations import reset_local_state

    reset_local_state()
    fresh = run_conversation_turn(
        session,
        request(
            context,
            [OperationStep(step_id="b", operation="forecast", arguments={"player_id": "1630567"})],
        ),
    )
    assert fresh.results[0].data["id"] == later.id


def test_pointer_resolved_timestamp_is_retained_without_requiring_current_pointer(
    postgres_conversation,
):
    """Current-pointer provenance differs from explicit-release resolution on replay."""
    from dataclasses import replace

    session, context = postgres_conversation
    published = replace(context, published_at="2026-10-01T17:47:29+00:00")
    # The active turn resolved the public pointer. Subsequent save/reproduce must
    # resolve the immutable release and keep its observed publication provenance.
    with patch(
        "courtlens.services.assistant.conversations.resolve_workbench_context",
        return_value=published,
    ):
        answer = run_conversation_turn(
            session,
            request(
                context,
                [OperationStep(step_id="a", operation="definition", arguments={"metric": "pts"})],
            ),
        )
    retained = saved.save_conversation(session, save_request(answer))
    assert retained["manifest"]["context"]["published_at"] == published.published_at
    assert saved.reproduce_saved(session, retained["id"])["match"]
    # Only pointer provenance may differ; immutable identity mismatches still fail.
    with pytest.raises(HTTPException) as exc:
        saved._context(session, {**answer.context, "semantic_signature": "f" * 64})
    assert exc.value.status_code == 409
