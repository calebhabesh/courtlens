"""Durability and races use committed rows and independent PostgreSQL sessions."""

from concurrent.futures import ThreadPoolExecutor
from datetime import UTC, datetime, timedelta
from threading import Event
from unittest.mock import patch
from uuid import UUID, uuid4

import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient
from sqlalchemy import select, text
from sqlalchemy.orm import Session
from test_conversation_postgres import postgres_conversation as _postgres_fixture
from test_hybrid_assistant_postgres import request as analytical_request

from courtlens.api.app import create_app
from courtlens.assistant_history_models import AssistantTurn, AssistantTurnInput
from courtlens.config import get_settings
from courtlens.database import get_db
from courtlens.domain.hybrid_assistant import HybridTurnRequest
from courtlens.services.assistant import history
from courtlens.services.assistant.hybrid import run_hybrid_turn
from courtlens.services.assistant.planner import ProviderFailure

postgres_conversation = _postgres_fixture


class LegacyOnlyProvider:
    """These tests exercise retained v2 lifecycle behavior without contacting a live key."""

    def plan(self, payload, *, timeout_seconds):
        raise AssertionError("legacy lifecycle fixture must not call a provider")


def legacy_turn(session, request, *, provider=None):
    return history.run_durable_turn(session, request, provider=provider or LegacyOnlyProvider())


def question(thread_id=None, message="Explain pick and roll", **kwargs):
    return HybridTurnRequest(request_id=uuid4(), thread_id=thread_id, message=message, **kwargs)


def test_accept_committed_before_execution_and_process_state_is_irrelevant(postgres_conversation):
    session, _ = postgres_conversation
    req = question()
    with patch.object(history, "run_hybrid_turn", wraps=run_hybrid_turn) as execute:
        answer = legacy_turn(session, req)
        replay = legacy_turn(session, req)
    assert execute.call_count == 1
    assert replay.model_dump() == answer.model_dump()
    with Session(session.get_bind()) as fresh:
        row = fresh.scalar(
            select(AssistantTurn).where(AssistantTurn.request_id == str(req.request_id))
        )
        assert row.request_json["message"] == req.message
        assert history.record(row).response == answer
        assert history.list_turns(fresh, answer.thread_id).turns[0].response == answer


def test_request_identity_collision_including_thread_and_edit(postgres_conversation):
    session, _ = postgres_conversation
    req = question()
    answer = legacy_turn(session, req)
    for changed in [
        req.model_copy(update={"message": "Edited question"}),
        req.model_copy(update={"thread_id": answer.thread_id}),
    ]:
        with pytest.raises(HTTPException) as exc:
            legacy_turn(session, changed)
        assert exc.value.status_code == 409
    edit = question(answer.thread_id, message="Explain assists")
    assert legacy_turn(session, edit).turn_id != answer.turn_id


def test_duplicate_race_accepts_once_and_one_executor(postgres_conversation):
    session, _ = postgres_conversation
    engine = session.get_bind()
    req = question()
    entered, release = Event(), Event()

    def delayed(db, request, **kwargs):
        entered.set()
        assert release.wait(10)
        return run_hybrid_turn(db, request, **kwargs)

    def execute():
        with Session(engine) as independent:
            return legacy_turn(independent, req)

    with (
        patch.object(history, "run_hybrid_turn", side_effect=delayed) as executor,
        ThreadPoolExecutor() as pool,
    ):
        first = pool.submit(execute)
        assert entered.wait(10)
        with Session(engine) as independent:
            pending = independent.scalar(
                select(AssistantTurn).where(AssistantTurn.request_id == str(req.request_id))
            )
            assert pending.state == "running"
            assert pending.request_json["message"] == req.message
            independent.rollback()
            with pytest.raises(HTTPException) as exc:
                legacy_turn(independent, req)
            assert exc.value.status_code == 409
            with pytest.raises(HTTPException):
                history.accept(independent, question(UUID(pending.thread_id)))
        release.set()
        answer = first.result(timeout=10)
        assert executor.call_count == 1
    assert legacy_turn(session, req) == answer


@pytest.mark.parametrize("mutation", ["cancel", "delete", "clear"])
def test_stop_and_delete_fence_late_publication(postgres_conversation, mutation):
    session, _ = postgres_conversation
    engine = session.get_bind()
    req = question()
    entered, release = Event(), Event()

    def delayed(db, request, **kwargs):
        entered.set()
        assert release.wait(10)
        return run_hybrid_turn(db, request, **kwargs)

    def execute():
        with Session(engine) as independent:
            try:
                return legacy_turn(independent, req)
            except HTTPException as exc:
                return exc.status_code

    with (
        patch.object(history, "run_hybrid_turn", side_effect=delayed),
        ThreadPoolExecutor() as pool,
    ):
        work = pool.submit(execute)
        assert entered.wait(10)
        row = session.scalar(
            select(AssistantTurn).where(AssistantTurn.request_id == str(req.request_id))
        )
        tid, turn = UUID(row.thread_id), UUID(row.id)
        if mutation == "cancel":
            stopped = history.cancel_turn(session, tid, turn)
            assert stopped.state == "cancelled"
            assert stopped.response.saveable is False
        else:
            history.delete_history(session, tid if mutation == "delete" else None)
        release.set()
        result = work.result(timeout=10)
    if mutation == "cancel":
        assert result == stopped.response
        assert history.list_turns(session, tid).turns[0] == stopped
    else:
        assert result == 404
        assert not session.scalars(select(AssistantTurn)).all()


@pytest.mark.parametrize("state", ["pending", "running"])
def test_restart_recovery_lease_replay_and_explicit_retry(postgres_conversation, state):
    session, _ = postgres_conversation
    req = question()
    accepted = history.accept(session, req)
    row = session.get(AssistantTurn, str(accepted.turn_id))
    row.state = state
    session.commit()
    assert history.recover_interrupted(session) == 0  # Other workers must not cancel live work.
    row = session.get(AssistantTurn, str(accepted.turn_id))
    row.lease_until = datetime.now(UTC) - timedelta(seconds=1)
    session.commit()
    with Session(session.get_bind()) as restarted:
        assert history.recover_interrupted(restarted) == 1
        replay = legacy_turn(restarted, req)
        assert replay.status == "failed"
        assert "interrupted" in replay.blocks[0].text
        retry = question(accepted.thread_id, retry_of=accepted.turn_id)
        answer = legacy_turn(restarted, retry)
        assert answer.status == "answered"
        assert answer.turn_id != accepted.turn_id
        assert (
            history.list_turns(restarted, accepted.thread_id).turns[1].request.retry_of
            == accepted.turn_id
        )


def test_retry_failure_executes_again_but_transport_replays(postgres_conversation):
    session, context = postgres_conversation
    # AR09: a question the rule planner cannot plan, so the provider failure is retained.
    req = analytical_request(context, "Show me something interesting", plan=False)

    class Provider:
        calls = 0

        def plan(self, payload, *, timeout_seconds):
            self.calls += 1
            raise ProviderFailure("quota_exceeded")

    provider = Provider()
    failed = legacy_turn(session, req, provider=provider)
    assert failed.blocks[0].reason == "provider_quota"
    assert legacy_turn(session, req, provider=provider) == failed
    retry = req.model_copy(
        update={"request_id": uuid4(), "thread_id": failed.thread_id, "retry_of": failed.turn_id}
    )
    next_answer = legacy_turn(session, retry, provider=provider)
    assert next_answer.turn_id != failed.turn_id
    assert provider.calls == 2
    with pytest.raises(HTTPException):
        legacy_turn(session, question(failed.thread_id, retry_of=uuid4()))


def test_scope_segments_and_inputs_survive_guidance_and_restart(postgres_conversation):
    session, context = postgres_conversation
    req = analytical_request(context)
    first = legacy_turn(session, req)
    assert first.status == "answered", first.model_dump_json()
    before = first.model_dump_json()
    guidance = legacy_turn(session, question(first.thread_id))
    assert guidance.scope is None
    with Session(session.get_bind()) as fresh:
        changed = question(first.thread_id, "2025-26 playoffs", plan=req.plan)
        second = legacy_turn(fresh, changed)
        assert second.scope.selections.release_id == first.scope.selections.release_id
        assert second.scope.selections.season == "2025-26"
        assert second.scope.selections.phase == "playoffs"
        assert (
            history.list_turns(fresh, first.thread_id).turns[0].response.model_dump_json() == before
        )
        inputs = fresh.scalars(select(AssistantTurnInput)).all()
        assert len(inputs) == 1
        assert inputs[0].workbench_dataset_id == context.dataset_id


def test_pagination_deletion_and_saved_findings_independence(postgres_conversation):
    session, _ = postgres_conversation
    first = legacy_turn(session, question())
    second = legacy_turn(session, question(first.thread_id))
    third = legacy_turn(session, question(first.thread_id))
    page = history.list_turns(session, first.thread_id, 1)
    assert page.turns[0].turn_id == first.turn_id
    next_page = history.list_turns(session, first.thread_id, 1, int(page.next_cursor))
    assert next_page.turns[0].turn_id == second.turn_id
    assert (
        history.list_turns(session, first.thread_id, 1, int(next_page.next_cursor)).turns[0].turn_id
        == third.turn_id
    )
    for _ in range(3):
        history.create_thread(session)
    threads = history.list_threads(session, 2)
    more = history.list_threads(session, 2, UUID(threads.next_cursor))
    assert len({t.thread_id for t in threads.threads + more.threads}) == 4
    saved_before = session.execute(
        text("SELECT count(*) FROM saved_conversation_analyses")
    ).scalar_one()
    inventory = history.history_inventory(session)
    assert len(inventory["turns"]) == 3
    history.delete_history(session, first.thread_id)
    assert len(history.list_threads(session).threads) == 3
    history.delete_history(session)
    assert history.history_inventory(session) == {"threads": [], "turns": [], "inputs": []}
    assert (
        session.execute(text("SELECT count(*) FROM saved_conversation_analyses")).scalar_one()
        == saved_before
    )


def test_api_history_auth_lifecycle_and_page_bounds(postgres_conversation, monkeypatch):
    session, _ = postgres_conversation
    # Exercise the historical v2 API response through the retained compatibility seam.
    monkeypatch.setattr("courtlens.api.routers.conversation.run_durable_turn", legacy_turn)
    app = create_app()
    app.dependency_overrides[get_db] = lambda: session
    token = {"X-Operator-Token": get_settings().operator_token.get_secret_value()}
    with TestClient(app) as client:
        base = "/api/workbench/assistant/v2"
        assert client.post(base + "/threads").status_code == 401
        assert (
            client.post(base + "/turn", json=question().model_dump(mode="json")).status_code == 401
        )
        assert client.delete(base + "/threads").status_code == 401
        new = client.post(base + "/threads", headers=token)
        assert new.status_code == 201
        tid = UUID(new.json()["thread_id"])
        req = question(tid)
        answer = client.post(base + "/turn", json=req.model_dump(mode="json"), headers=token)
        assert answer.status_code == 200
        assert (
            client.get(base + f"/threads/{tid}/turns").json()["turns"][0]["response"]
            == answer.json()
        )
        assert client.get(base + "/threads?limit=101").status_code == 422
        assert client.get(base + f"/threads/{tid}/turns?cursor=-1").status_code == 422
        assert (
            client.post(
                base + f"/threads/{tid}/turns/{answer.json()['turn_id']}/cancel", headers=token
            ).json()["state"]
            == "completed"
        )
        assert client.delete(base + f"/threads/{tid}", headers=token).status_code == 200
        assert client.get(base + f"/threads/{tid}/turns").status_code == 404


def test_additive_migration_upgrade_downgrade_and_schema_parity(postgres_conversation):
    import importlib.util
    from pathlib import Path

    from alembic.migration import MigrationContext
    from alembic.operations import Operations
    from sqlalchemy import inspect

    from courtlens.assistant_history_models import AssistantThread

    session, _ = postgres_conversation
    session.rollback()
    engine = session.get_bind()
    path = Path("migrations/versions/07b810a4f005_assistant_history.py")
    spec = importlib.util.spec_from_file_location("history_migration", path)
    migration = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(migration)
    from courtlens.assistant_history_models import AssistantAgentTranscript

    tables = [AssistantTurnInput.__table__, AssistantTurn.__table__, AssistantThread.__table__]
    with engine.begin() as connection:
        AssistantAgentTranscript.__table__.drop(connection)
        for table in tables:
            table.drop(connection)
        with Operations.context(MigrationContext.configure(connection)):
            migration.upgrade()
        inspector = inspect(connection)
        for table in tables:
            assert {c["name"] for c in inspector.get_columns(table.name)} == set(
                table.columns.keys()
            )
        with Operations.context(MigrationContext.configure(connection)):
            migration.downgrade()
            migration.upgrade()
        AssistantAgentTranscript.__table__.create(connection)
    answer = legacy_turn(session, question())
    assert answer.status == "answered"


def test_dump_restore_history_and_provenance(postgres_conversation, tmp_path):
    """Actual PostgreSQL 17 dump/restore, restricted to the fixture's disposable schema."""
    import os
    import shutil
    import subprocess

    session, context = postgres_conversation
    answer = legacy_turn(session, analytical_request(context))
    assert answer.status == "answered"
    legacy_turn(session, question(answer.thread_id))
    before = history.history_inventory(session)
    schema = session.execute(text("SELECT current_schema()")).scalar_one()
    assert schema.startswith("b33_") and len(schema) == 36
    session.rollback()
    url = session.get_bind().url
    env = dict(os.environ, PGPASSWORD=url.password or "")
    arguments = [
        "-h",
        url.host,
        "-p",
        str(url.port or 5432),
        "-U",
        url.username,
        "-d",
        url.database,
    ]
    if shutil.which("pg_dump") and shutil.which("psql"):
        dump_command = ["pg_dump", *arguments, "--schema", schema]
        restore_command = ["psql", *arguments, "-v", "ON_ERROR_STOP=1"]
    else:
        # Never assume the application container owns the disposable fixture schema.
        container = os.getenv("COURTLENS_TEST_POSTGRES_CONTAINER")
        if not container:
            pytest.fail(
                "Install pg_dump/psql or set COURTLENS_TEST_POSTGRES_CONTAINER "
                "to the disposable container backing COURTLENS_TEST_POSTGRES_URL"
            )
        prefix = ["docker", "exec", "-i", "-e", "PGPASSWORD", container]
        local_arguments = ["-U", url.username, "-d", url.database]
        dump_command = [*prefix, "pg_dump", *local_arguments, "--schema", schema]
        restore_command = [*prefix, "psql", *local_arguments, "-v", "ON_ERROR_STOP=1"]
    dump = subprocess.run(dump_command, env=env, capture_output=True, check=True).stdout
    (tmp_path / "history.sql").write_bytes(dump)
    with session.get_bind().begin() as connection:
        connection.execute(text(f"DROP SCHEMA {schema} CASCADE"))
    subprocess.run(restore_command, input=dump, env=env, capture_output=True, check=True)
    session.expire_all()
    assert history.history_inventory(session) == before
    assert history.list_turns(session, answer.thread_id).turns[0].response == answer


def test_backup_lock_fences_history_writes_and_restore_rejects_drift(
    postgres_conversation, tmp_path
):
    from courtlens.services.backup_restore import verify_restored_state

    session, _ = postgres_conversation
    engine = session.get_bind()
    begun, finished = Event(), Event()

    def write():
        begun.set()
        with Session(engine) as independent:
            history.create_thread(independent)
        finished.set()

    with ThreadPoolExecutor() as pool:
        with history.history_backup_lock(session):
            task = pool.submit(write)
            assert begun.wait(5)
            assert not finished.wait(0.1)
            assert history.history_inventory(session)["threads"] == []
        task.result(timeout=5)
    session.rollback()
    assert len(history.history_inventory(session)["threads"]) == 1
    with pytest.raises(ValueError, match="assistant history differs"):
        verify_restored_state(session, artifacts_dir=tmp_path, expected_assistant_history={})


def test_history_clear_preserves_a_real_separately_saved_finding(postgres_conversation):
    from test_conversation_postgres import request as v1_request
    from test_saved_conversation_postgres import save_request

    from courtlens.domain.conversation import OperationStep
    from courtlens.services.assistant.conversations import run_conversation_turn
    from courtlens.services.assistant.saved import (
        reproduce_saved,
        save_conversation,
        saved_inventory,
    )

    session, context = postgres_conversation
    v1 = run_conversation_turn(
        session,
        v1_request(
            context,
            [OperationStep(step_id="stats", operation="query", arguments={"page": {"limit": 10}})],
        ),
    )
    saved = save_conversation(session, save_request(v1))
    inventory = saved_inventory(session)
    reproduction = reproduce_saved(session, saved["id"])
    assert reproduction["match"]
    legacy_turn(session, analytical_request(context))
    history.delete_history(session)
    assert saved_inventory(session) == inventory
    assert reproduce_saved(session, saved["id"]) == reproduction


def test_drawer_guidance_retains_page_scope_for_first_analytical_followup(postgres_conversation):
    session, context = postgres_conversation
    local = analytical_request(context)
    first = legacy_turn(session, question(context=local.context))
    assert first.scope is None
    second = legacy_turn(session, question(first.thread_id, "Show scoring", plan=local.plan))
    assert second.status == "answered"
    assert second.scope.selections.release_id == context.release_id
    assert second.scope.selections.season == "2024-25"


def test_new_request_recovers_expired_prior_turn_without_polling(postgres_conversation):
    session, _ = postgres_conversation
    accepted = history.accept(session, question())
    row = session.get(AssistantTurn, str(accepted.turn_id))
    row.lease_until = datetime.now(UTC) - timedelta(seconds=1)
    session.commit()
    answer = legacy_turn(session, question(accepted.thread_id))
    assert answer.status == "answered"
    turns = history.list_turns(session, accepted.thread_id).turns
    assert [turn.state for turn in turns] == ["failed", "completed"]
