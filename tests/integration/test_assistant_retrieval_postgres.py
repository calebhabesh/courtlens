"""External support remains durable independently of cache/provider state and warehouse inputs."""

from threading import Event
from unittest.mock import patch
from uuid import uuid4

from sqlalchemy import select
from sqlalchemy.orm import Session
from test_conversation_postgres import postgres_conversation as _postgres_fixture

from courtload.assistant_history_models import AssistantTurnInput
from courtload.domain.hybrid_assistant import HybridTurnRequest
from courtload.services.assistant import history, retrieval

postgres_conversation = _postgres_fixture

RAW = (
    b'<div class="post__content"><p>Released for the 2023-24 regular season.</p>'
    b"<p>The 78th NBA regular season will tip off on Tuesday, Oct. 24, 2023</p></div>"
)


def test_external_support_survives_cache_expiry_and_independent_session(postgres_conversation):
    session, _ = postgres_conversation
    retrieval.clear_cache()
    req = HybridTurnRequest(
        request_id=uuid4(), message="When did NBA 2023-24 regular season start?"
    )

    def fetched(spec, budget):
        budget.request()
        return RAW

    with patch.object(retrieval, "fetch", side_effect=fetched) as fetch:
        answer = history.run_durable_turn(session, req)
    assert fetch.call_count == 1 and answer.status == "answered"
    assert answer.accounting.source_requests == 1
    assert answer.sources[0].facts[0].value == "2023-10-24"
    assert not answer.saveable
    retrieval.clear_cache()
    with (
        Session(session.get_bind()) as fresh,
        patch.object(retrieval, "fetch", side_effect=RuntimeError("offline")) as offline,
    ):
        assert history.run_durable_turn(fresh, req) == answer
        retained = history.list_turns(fresh, answer.thread_id).turns[0]
        assert retained.response == answer
        assert retained.response.sources[0].excerpt == answer.sources[0].excerpt
        assert (
            fresh.scalar(
                select(AssistantTurnInput).where(AssistantTurnInput.turn_id == str(answer.turn_id))
            )
            is None
        )
        assert offline.call_count == 0
    retrieval.clear_cache()


def test_cancel_during_external_read_fences_late_verified_source(postgres_conversation):
    from concurrent.futures import ThreadPoolExecutor

    session, _ = postgres_conversation
    retrieval.clear_cache()
    req = HybridTurnRequest(
        request_id=uuid4(), message="When did NBA 2023-24 regular season start?"
    )
    accepted = history.accept(session, req)
    entered, release = Event(), Event()

    def fetched(spec, budget):
        budget.request()
        entered.set()
        assert release.wait(5)
        return RAW

    def execute():
        with Session(session.get_bind()) as fresh:
            return history.run_durable_turn(fresh, req)

    with patch.object(retrieval, "fetch", side_effect=fetched), ThreadPoolExecutor() as pool:
        future = pool.submit(execute)
        try:
            assert entered.wait(5)
            stopped = history.cancel_turn(session, accepted.thread_id, accepted.turn_id)
        finally:
            release.set()
        answer = future.result(timeout=5)
    assert answer.status == "cancelled" and answer == stopped.response
    assert not answer.sources
    assert history.list_turns(session, accepted.thread_id).turns[0].response == answer
    retrieval.clear_cache()


def test_external_excerpt_and_binding_survive_actual_dump_restore(postgres_conversation, tmp_path):
    import os
    import shutil
    import subprocess

    from sqlalchemy import text

    session, _ = postgres_conversation
    retrieval.clear_cache()
    req = HybridTurnRequest(
        request_id=uuid4(), message="When did NBA 2023-24 regular season start?"
    )
    with patch.object(retrieval, "fetch", return_value=RAW):
        answer = history.run_durable_turn(session, req)
    assert answer.status == "answered"
    before = history.history_inventory(session)
    schema = session.execute(text("SELECT current_schema()")).scalar_one()
    assert schema.startswith("b33_") and len(schema) == 36
    session.rollback()
    url = session.get_bind().url
    env = dict(os.environ, PGPASSWORD=url.password)
    arguments = ["-h", url.host, "-U", url.username, "-d", url.database]
    if shutil.which("pg_dump") and shutil.which("psql"):
        dump_command = ["pg_dump", *arguments, "--schema", schema]
        restore_command = ["psql", *arguments, "-v", "ON_ERROR_STOP=1"]
    else:
        prefix = ["docker", "exec", "-i", "courtload-db-1"]
        local_arguments = ["-U", url.username, "-d", url.database]
        dump_command = [*prefix, "pg_dump", *local_arguments, "--schema", schema]
        restore_command = [*prefix, "psql", *local_arguments, "-v", "ON_ERROR_STOP=1"]
    dump = subprocess.run(dump_command, env=env, capture_output=True, check=True).stdout
    (tmp_path / "external-history.sql").write_bytes(dump)
    with session.get_bind().begin() as connection:
        connection.execute(text(f"DROP SCHEMA {schema} CASCADE"))
    subprocess.run(restore_command, input=dump, env=env, capture_output=True, check=True)
    session.expire_all()
    retrieval.clear_cache()
    assert history.history_inventory(session) == before
    assert history.run_durable_turn(session, req) == answer
    assert history.list_turns(session, answer.thread_id).turns[0].response == answer
