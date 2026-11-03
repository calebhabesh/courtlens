"""Real PostgreSQL migrations, shared on-demand fetches and sealed final evidence."""

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
from live_fakes import NOW, SLATE, FakeProvider, event
from sqlalchemy import create_engine, func, select, text
from sqlalchemy.exc import DBAPIError
from sqlalchemy.orm import Session

from courtlens.database import Base
from courtlens.live_models import LiveCurrent, LiveObservation
from courtlens.services.live import read


def migration(name):
    spec = importlib.util.spec_from_file_location(name, Path(f"migrations/versions/{name}.py"))
    assert spec and spec.loader
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


@pytest.fixture
def live_engine():
    url = os.environ.get("COURTLENS_TEST_POSTGRES_URL")
    if not url:
        pytest.skip("disposable PostgreSQL URL required")
    root = create_engine(url)
    schema = "live_" + uuid4().hex
    with root.begin() as conn:
        conn.execute(text(f"CREATE SCHEMA {schema}"))
    engine = create_engine(
        url, connect_args={"options": f"-csearch_path={schema}"}, isolation_level="REPEATABLE READ"
    )
    Base.metadata.create_all(engine)
    shared, on_demand = (
        migration("31b810a4f002_shared_live"),
        migration("19b810a4f017_live_on_demand"),
    )
    # Exercise both migrations up/down/up over disposable relational dependencies.
    with engine.begin() as conn:
        for table in ("live_reconciliations", "live_observations", "live_contents", "live_current"):
            conn.execute(text(f"DROP TABLE {table}"))
        with Operations.context(MigrationContext.configure(conn)):
            shared.upgrade()
            on_demand.upgrade()
            on_demand.downgrade()
            on_demand.upgrade()
    try:
        yield engine
    finally:
        engine.dispose()
        with root.begin() as conn:
            conn.execute(text(f"DROP SCHEMA {schema} CASCADE"))
        root.dispose()


def test_concurrent_readers_share_one_fetch(live_engine):
    entered, finish = Event(), Event()

    class Blocking(FakeProvider):
        def fetch(self, *args):
            entered.set()
            assert finish.wait(5)
            return super().fetch(*args)

    provider = Blocking([event("1", "in")])

    def reader():
        with Session(live_engine) as session:
            return read(session, provider, SLATE, now=NOW)

    with ThreadPoolExecutor(max_workers=2) as pool:
        first = pool.submit(reader)
        assert entered.wait(5)
        # The lock is taken: the second reader serves the (empty) cache instead of fetching.
        assert reader()["status"] == "unavailable"
        finish.set()
        assert first.result(timeout=5)["status"] == "observed"
    assert len(provider.calls) == 1
    with Session(live_engine) as session:
        assert read(session, provider, SLATE, now=NOW)["data"]["games"][0]["source_id"] == "1"
        assert session.scalar(select(func.count()).select_from(LiveCurrent)) == 1


@pytest.mark.parametrize(
    "statement",
    [
        "UPDATE live_contents SET parser_version='changed'",
        "DELETE FROM live_observations",
        "TRUNCATE live_contents CASCADE",
        "UPDATE live_reconciliations SET result_json='{}'",
    ],
)
def test_final_evidence_is_database_sealed(live_engine, statement):
    with Session(live_engine) as session:
        read(
            session, FakeProvider([event("1", "post", completed=True, score="100")]), SLATE, now=NOW
        )
        assert session.scalar(select(func.count()).select_from(LiveObservation)) == 1
    with live_engine.connect() as conn, pytest.raises(DBAPIError, match="append-only"):
        conn.execute(text(statement))


def test_current_cache_is_mutable(live_engine):
    provider = FakeProvider([event("1", "in")])
    with Session(live_engine) as session:
        read(session, provider, SLATE, now=NOW)
        read(session, provider, SLATE, now=NOW.replace(minute=5))
        assert len(provider.calls) == 2
        assert session.scalar(select(func.count()).select_from(LiveObservation)) == 0


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
    provider = FakeProvider([event("1", "post", completed=True, score="100")])
    with Session(live_engine) as session:
        assert read(session, provider, SLATE, "1", now=NOW)["final"] is True
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
