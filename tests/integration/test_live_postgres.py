"""Real PostgreSQL migration, feed ownership, demand concurrency and sealed evidence."""

import importlib.util
import os
from concurrent.futures import ThreadPoolExecutor
from datetime import timedelta
from pathlib import Path
from threading import Event
from uuid import uuid4

import pytest
from alembic.migration import MigrationContext
from alembic.operations import Operations
from fastapi import HTTPException
from live_fakes import NOW, SLATE, FakeProvider
from sqlalchemy import create_engine, func, select, text
from sqlalchemy.exc import DBAPIError
from sqlalchemy.orm import Session

from courtlens.database import Base
from courtlens.domain.live import LiveSubscription
from courtlens.live_models import LiveFeed, LiveLease, LiveObservation
from courtlens.services.live import poll_once, subscribe


@pytest.fixture
def live_engine():
    url = os.environ.get("COURTLENS_TEST_POSTGRES_URL")
    if not url:
        pytest.skip("disposable PostgreSQL URL required")
    root = create_engine(url)
    schema = "b31_" + uuid4().hex
    with root.begin() as conn:
        conn.execute(text(f"CREATE SCHEMA {schema}"))
    engine = create_engine(
        url, connect_args={"options": f"-csearch_path={schema}"}, isolation_level="REPEATABLE READ"
    )
    Base.metadata.create_all(engine)
    spec = importlib.util.spec_from_file_location(
        "b31", Path("migrations/versions/31b810a4f002_shared_live.py")
    )
    assert spec and spec.loader
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    # Exercise actual migration up/down/up over disposable relational dependencies.
    with engine.begin() as conn:
        for table in (
            "live_reconciliations",
            "live_observations",
            "live_contents",
            "live_leases",
            "live_feeds",
        ):
            conn.execute(text(f"DROP TABLE {table}"))
        with Operations.context(MigrationContext.configure(conn)):
            module.upgrade()
            module.downgrade()
            module.upgrade()
    try:
        yield engine
    finally:
        engine.dispose()
        with root.begin() as conn:
            conn.execute(text(f"DROP SCHEMA {schema} CASCADE"))
        root.dispose()


def test_shared_feed_lock_survives_competing_worker(live_engine):
    entered = Event()
    finish = Event()

    class Blocking(FakeProvider):
        def fetch(self, *args):
            entered.set()
            assert finish.wait(5)
            return super().fetch(*args)

    with Session(live_engine) as session:
        subscribe(session, LiveSubscription(slate_date=SLATE), now=NOW)
    provider = Blocking()
    with ThreadPoolExecutor(max_workers=2) as pool:
        first = pool.submit(poll_once, live_engine, provider, now=NOW)
        assert entered.wait(5)
        assert poll_once(live_engine, FakeProvider(), now=NOW) == 0
        finish.set()
        assert first.result(timeout=5) == 1
    assert poll_once(live_engine, FakeProvider(), now=NOW + timedelta(seconds=59)) == 0
    assert poll_once(live_engine, FakeProvider(), now=NOW + timedelta(seconds=60)) == 1


def test_many_concurrent_leases_remain_bounded(live_engine):
    def add(_):
        try:
            with Session(live_engine) as session:
                subscribe(session, LiveSubscription(slate_date=SLATE), now=NOW)
            return True
        except HTTPException as e:
            assert e.status_code == 429
            return False

    with ThreadPoolExecutor(max_workers=8) as pool:
        results = list(pool.map(add, range(80)))
    assert sum(results) == 64
    with Session(live_engine) as session:
        assert session.scalar(select(func.count()).select_from(LiveLease)) == 64


@pytest.mark.parametrize(
    "statement",
    [
        "UPDATE live_contents SET parser_version='changed'",
        "DELETE FROM live_observations",
        "TRUNCATE live_contents CASCADE",
        "UPDATE live_reconciliations SET result_json='{}'",
    ],
)
def test_source_evidence_is_database_sealed(live_engine, statement):
    with Session(live_engine) as session:
        subscribe(session, LiveSubscription(slate_date=SLATE), now=NOW)
    assert poll_once(live_engine, FakeProvider(), now=NOW) == 1
    with live_engine.connect() as conn, pytest.raises(DBAPIError, match="append-only"):
        conn.execute(text(statement))


def test_crashed_cycle_reservation_prevents_restart_burst(live_engine):
    with Session(live_engine) as session:
        subscribe(session, LiveSubscription(slate_date=SLATE), now=NOW)

    class Crashed(FakeProvider):
        def fetch(self, *args):
            raise RuntimeError("worker process interruption")

    with pytest.raises(RuntimeError, match="interruption"):
        poll_once(live_engine, Crashed(), now=NOW)
    assert poll_once(live_engine, FakeProvider(), now=NOW + timedelta(seconds=60)) == 0
    assert poll_once(live_engine, FakeProvider(), now=NOW + timedelta(seconds=100)) == 1
    with Session(live_engine) as session:
        assert session.get(LiveFeed, "espn").requests == 2
        assert session.scalar(select(func.count()).select_from(LiveObservation)) == 1


def test_foreign_key_rejects_orphan_observation(live_engine):
    with Session(live_engine) as session:
        session.add(
            LiveObservation(resource="game:missing", content_sha256="missing", acquired_at=NOW)
        )
        with pytest.raises(DBAPIError):
            session.commit()


def seed_final_batch(session, *, points=100, game_date=SLATE):
    from courtlens.workbench_models import (
        WorkbenchAcquisition,
        WorkbenchArtifact,
        WorkbenchDataset,
        WorkbenchIdentity,
        WorkbenchObservation,
        WorkbenchSchedule,
        WorkbenchTeamGame,
        WorkbenchVersion,
    )

    artifact = WorkbenchArtifact(
        id="artifact",
        sha256="a" * 64,
        resource="test",
        bytes=1,
        storage_path="test",
        mime_type="json",
        source_attribution="fixture",
    )
    identity = WorkbenchIdentity(
        id="identity",
        namespace="nba",
        kind="game",
        external_id="0022600001",
        display_name="fixture",
    )
    session.add_all([artifact, identity])
    session.flush()
    session.add(
        WorkbenchAcquisition(
            id="acquisition",
            source_name="fixture",
            resource="test",
            source_url="https://example.test",
            status="succeeded",
            artifact_id="artifact",
        )
    )
    session.add(
        WorkbenchVersion(
            id="version",
            identity_id="identity",
            content_sha256="b" * 64,
            parser_version="fixture",
            payload_json={},
        )
    )
    session.flush()
    session.add(
        WorkbenchObservation(
            id="batch-observation",
            acquisition_id="acquisition",
            artifact_id="artifact",
            row_identifier="1",
            identity_id="identity",
            version_id="version",
            observation_order=1,
        )
    )
    session.add(
        WorkbenchDataset(
            id="dataset",
            content_sha256="c" * 64,
            membership_sha256="d" * 64,
            semantic_signature="e" * 64,
            source_namespace="fixture",
            parser_version="fixture",
            quality_version="fixture",
            seasons_json=["2026-27"],
            phases_json=["preseason"],
            manifest_json={},
            coverage_json={},
            exclusions_json={},
            status="ready",
        )
    )
    session.flush()
    session.add(
        WorkbenchSchedule(
            dataset_id="dataset",
            game_id="0022600001",
            season="2026-27",
            phase="preseason",
            game_date=game_date,
            home_team_id="1610612761",
            away_team_id="1610612748",
            game_status=3,
            source_version_id="version",
            source_observation_id="batch-observation",
        )
    )
    for team, opponent, side, score, opponent_score in [
        ("1610612761", "1610612748", "home", points, 0),
        ("1610612748", "1610612761", "away", 0, points),
    ]:
        session.add(
            WorkbenchTeamGame(
                dataset_id="dataset",
                game_id="0022600001",
                team_id=team,
                opponent_id=opponent,
                side=side,
                game_date=game_date,
                season="2026-27",
                phase="preseason",
                points=score,
                opponent_points=opponent_score,
                stats_json={},
                source_version_id="version",
                source_observation_id="batch-observation",
            )
        )
    session.commit()


@pytest.mark.parametrize(
    "points,offset,mapping,expected",
    [
        (100, 0, True, "matched"),
        (99, 0, True, "score_mismatch"),
        (100, 1, True, "identity_mismatch"),
        (100, 0, False, "awaiting_crosswalk"),
    ],
)
def test_final_reconciles_to_independently_admitted_facts(
    live_engine, points, offset, mapping, expected
):
    from live_fakes import event

    from courtlens.services.live_reconciliation import reconcile_final
    from courtlens.workbench_models import WorkbenchIdentityCrosswalk, WorkbenchTeamGame

    with Session(live_engine) as session:
        seed_final_batch(session, points=points, game_date=SLATE + timedelta(days=offset))
        for kind, source, target in [("team", "28", "TOR"), ("team", "14", "MIA")] + (
            [("game", "1", "0022600001")] if mapping else []
        ):
            session.add(
                WorkbenchIdentityCrosswalk(
                    source_namespace="espn",
                    source_id=source,
                    target_namespace="nba",
                    target_id=target,
                    kind=kind,
                    confidence="verified",
                )
            )
        session.commit()
        subscribe(session, LiveSubscription(slate_date=SLATE, game_id="1"), now=NOW)
    provider = FakeProvider([event("1", "post", completed=True, score="100")])
    assert poll_once(live_engine, provider, now=NOW) == 2
    with Session(live_engine) as session:
        observation = session.scalar(
            select(LiveObservation).where(LiveObservation.resource == "game:1")
        )
        result = reconcile_final(session, observation.id, "dataset")
        assert result["status"] == expected
        assert result["player_boxes"] == "not_reconciled"
        assert result["publication"] == "none"
        assert (
            session.scalar(select(WorkbenchTeamGame.points).where(WorkbenchTeamGame.side == "home"))
            == points
        )


def test_blocking_pipeline_cannot_stop_live_observations(live_engine, monkeypatch):
    import courtlens.services.live as service
    import courtlens.services.live_provider as provider_module
    import courtlens.worker as worker_module
    from courtlens.worker import CourtLensWorker

    job_started = Event()
    release_job = Event()
    source_completed = Event()

    class IndependentProvider(FakeProvider):
        def fetch(self, *args):
            assert job_started.wait(5)
            result = super().fetch(*args)
            source_completed.set()
            return result

    with Session(live_engine) as session:
        subscribe(session, LiveSubscription(slate_date=SLATE), now=NOW)
    monkeypatch.setattr(worker_module, "engine", live_engine)
    monkeypatch.setattr(provider_module, "ESPNLiveProvider", IndependentProvider)
    real_poll = service.poll_once
    monkeypatch.setattr(service, "poll_once", lambda e, p: real_poll(e, p, now=NOW))
    monkeypatch.setattr(worker_module.signal, "signal", lambda *a: None)
    worker = CourtLensWorker("b31-blocking-pipeline")
    worker.settings = worker.settings.model_copy(update={"live_enabled": True})
    monkeypatch.setattr(worker, "startup", lambda: None)
    monkeypatch.setattr(worker, "_is_refresh_due", lambda: False)

    def blocking_job():
        job_started.set()
        assert release_job.wait(5)
        worker.should_stop = True
        return True

    monkeypatch.setattr(worker, "run_next_job", blocking_job)
    with ThreadPoolExecutor(max_workers=1) as pool:
        running = pool.submit(worker.run_loop)
        try:
            assert source_completed.wait(5)
            assert not running.done()
        finally:
            release_job.set()
        running.result(timeout=5)
    with Session(live_engine) as session:
        assert session.scalar(select(func.count()).select_from(LiveObservation)) == 1
