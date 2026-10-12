from __future__ import annotations

import json
from collections.abc import Generator
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import Engine, create_engine
from sqlalchemy.orm import Session
from sqlalchemy.pool import StaticPool

from courtlens.api.app import create_app
from courtlens.database import Base, engine, get_db
from courtlens.demo import DEMO_EMAIL, DEMO_PASSWORD, DEMO_WEEK_START, fixture_documents
from courtlens.domain.scoring import DEFAULT_POINTS_RULES, scoring_rules_hash
from courtlens.ingestion.loader import IngestionService
from courtlens.ingestion.raw_store import RawStore
from courtlens.models import (
    FantasyLeague,
    FantasyRosterEntry,
    FantasyWatchlistEntry,
    FantasyWeekState,
    User,
)
from courtlens.security import hash_password


@pytest.fixture(scope="session", autouse=True)
def close_application_pool() -> Generator[None, None, None]:
    """Release the shared API/CLI pool before pytest's final garbage collection."""
    yield
    engine.dispose()


@pytest.fixture(autouse=True)
def fresh_stats_cohort_cache() -> Generator[None, None, None]:
    """Tests reuse synthetic dataset IDs; never serve one test's cohort to another."""
    from courtlens.services import stats_cohort_cache

    stats_cohort_cache.clear()
    yield
    stats_cohort_cache.clear()


@pytest.fixture
def test_engine() -> Generator[Engine, None, None]:
    engine = create_engine(
        "sqlite+pysqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(engine)
    yield engine
    Base.metadata.drop_all(engine)
    engine.dispose()


@pytest.fixture
def session(test_engine: Engine) -> Generator[Session, None, None]:
    with Session(test_engine, expire_on_commit=False) as database_session:
        yield database_session


def load_demo(session: Session, temporary_path: Path) -> FantasyLeague:
    paths: list[Path] = []
    for index, document in enumerate(fixture_documents()):
        path = temporary_path / f"{index:02d}-{document['resource']}.json"
        path.write_text(json.dumps(document), encoding="utf-8")
        paths.append(path)
    IngestionService(session, RawStore(temporary_path / "raw")).load_fixture_pages(paths)

    user = User(email=DEMO_EMAIL, password_hash=hash_password(DEMO_PASSWORD))
    session.add(user)
    session.flush()
    league = FantasyLeague(
        owner_id=user.id,
        name="Fixture Points League",
        timezone="America/Toronto",
        week_starts_on=0,
        lineup_mode="daily",
        lineup_slots_json={"G": 1, "F": 1, "UTIL": 1},
        acquisition_limit=4,
        scoring_mode="points",
        scoring_rules_json=DEFAULT_POINTS_RULES,
        scoring_rules_version=scoring_rules_hash(DEFAULT_POINTS_RULES),
        roster_version=1,
    )
    session.add(league)
    session.flush()
    for player_id, eligibility in (
        (9101, ["PG", "G"]),
        (9102, ["SG", "G"]),
        (9103, ["SF", "F"]),
        (9105, ["C"]),
        (9107, ["PF", "F"]),
        (9108, ["C"]),
    ):
        session.add(
            FantasyRosterEntry(
                league_id=league.id,
                player_key=player_id,
                eligible_slot_types_json=eligibility,
                roster_version=1,
            )
        )
    for player_id in (9104, 9106):
        session.add(
            FantasyWatchlistEntry(
                league_id=league.id,
                player_key=player_id,
                label="Fixture comparison candidate",
            )
        )
    session.add(
        FantasyWeekState(
            league_id=league.id,
            week_start=DEMO_WEEK_START,
            acquisitions_used=1,
        )
    )
    session.commit()
    return league


@pytest.fixture
def demo_league(session: Session, tmp_path: Path) -> FantasyLeague:
    return load_demo(session, tmp_path)


@pytest.fixture
def api_client(session: Session) -> Generator[TestClient, None, None]:
    application = create_app()

    def override_database() -> Generator[Session, None, None]:
        yield session

    application.dependency_overrides[get_db] = override_database
    with TestClient(application) as client:
        yield client


def pytest_sessionstart(session: pytest.Session) -> None:
    """Refuse to write test fixtures into a database that holds published data.

    Disposable test databases start empty. A ``published_snapshots`` row means the URL
    points at a real database (for example the local development one), where tests
    would leave permanent rows in append-only tables. Published-data runs
    (``-m requires_published_data``) are explicit and exempt.
    """
    import os

    from sqlalchemy import text
    from sqlalchemy.exc import SQLAlchemyError

    url = os.environ.get("COURTLENS_TEST_POSTGRES_URL")
    markers = session.config.getoption("markexpr", default="") or ""
    if not url or markers.strip() == "requires_published_data":
        return
    guard = create_engine(url)
    try:
        with guard.connect() as connection:
            table = connection.execute(text("SELECT to_regclass('public.published_snapshots')"))
            populated = table.scalar() is not None and bool(
                connection.execute(
                    text("SELECT EXISTS (SELECT 1 FROM published_snapshots)")
                ).scalar()
            )
    except SQLAlchemyError:
        return  # Unreachable databases fail in the tests that need them.
    finally:
        guard.dispose()
    if populated:
        pytest.exit(
            "COURTLENS_TEST_POSTGRES_URL points at a database with published snapshots; "
            "use make test-python for a disposable database.",
            returncode=4,
        )


@pytest.fixture
def workbench_db(request: pytest.FixtureRequest) -> Generator[Session, None, None]:
    """Serve HTTP and SQL from the same isolated seeded schema (or an explicit backup)."""
    import os
    from uuid import uuid4

    from fixture_data import add_workbench_dataset
    from sqlalchemy import text

    url = os.environ.get("COURTLENS_TEST_POSTGRES_URL")
    if not url:
        if os.environ.get("CI") or os.environ.get("COURTLENS_REQUIRE_POSTGRES_TESTS"):
            pytest.fail("Use make test-python to supply disposable PostgreSQL fixtures")
        pytest.skip("disposable PostgreSQL fixtures required; use make test-python")
    root_engine = create_engine(url)
    published = request.node.get_closest_marker("requires_published_data") is not None
    schema = None if published else "qa_" + uuid4().hex
    if schema:
        with root_engine.begin() as connection:
            connection.execute(text(f"CREATE SCHEMA {schema}"))
        fixture_engine = create_engine(url, connect_args={"options": f"-csearch_path={schema}"})
        Base.metadata.create_all(fixture_engine)
    else:
        fixture_engine = root_engine
    try:
        with Session(fixture_engine, expire_on_commit=False) as database_session:
            if schema:
                add_workbench_dataset(database_session)
            yield database_session
    finally:
        fixture_engine.dispose()
        if schema:
            with root_engine.begin() as connection:
                connection.execute(text(f"DROP SCHEMA {schema} CASCADE"))
        root_engine.dispose()
