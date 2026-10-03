"""Exercise the B14 migration (crosswalk, dated metadata, measurements, draft) in test schemas."""

import importlib.util
import os
from collections.abc import Generator
from datetime import UTC, date, datetime
from pathlib import Path
from types import ModuleType
from uuid import uuid4

import pytest
import sqlalchemy as sa
from alembic.migration import MigrationContext
from alembic.operations import Operations
from sqlalchemy import Connection

from courtload.workbench_models import (
    WorkbenchDatedMetadata,
    WorkbenchIdentityCrosswalk,
    WorkbenchPlayerDraft,
    WorkbenchPlayerMeasurement,
)

pytestmark = pytest.mark.postgres


@pytest.fixture
def migration() -> ModuleType:
    path = (
        Path(__file__).resolve().parents[2]
        / "migrations/versions/c7e21a084f91_identity_crosswalk_and_measurements.py"
    )
    spec = importlib.util.spec_from_file_location("b14_migration", path)
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


@pytest.fixture
def connection() -> Generator[Connection, None, None]:
    url = os.getenv("COURTLOAD_TEST_POSTGRES_URL")
    if not url:
        if os.getenv("CI") or os.getenv("COURTLOAD_REQUIRE_POSTGRES_TESTS"):
            pytest.fail("COURTLOAD_TEST_POSTGRES_URL must be configured")
        pytest.skip("PostgreSQL URL is not configured")
    engine = sa.create_engine(url)
    with engine.connect() as conn, conn.begin() as transaction:
        schema = "b14_migration_" + uuid4().hex
        conn.exec_driver_sql(f'CREATE SCHEMA "{schema}"')
        conn.exec_driver_sql(f'SET LOCAL search_path TO "{schema}"')
        yield conn
        transaction.rollback()
    engine.dispose()


def test_b14_migration_upgrade_and_downgrade(connection: Connection, migration: ModuleType) -> None:
    with Operations.context(MigrationContext.configure(connection)):
        migration.upgrade()

    tables = set(sa.inspect(connection).get_table_names())
    assert "workbench_identity_crosswalks" in tables
    assert "workbench_dated_metadata" in tables
    assert "workbench_player_measurements" in tables
    assert "workbench_player_drafts" in tables

    # Insert test row into each table
    now = datetime.now(UTC)
    connection.execute(
        WorkbenchIdentityCrosswalk.__table__.insert().values(
            id=str(uuid4()),
            source_namespace="espn",
            source_id="4066261",
            target_namespace="nba",
            target_id="1628389",
            kind="player",
            confidence="verified",
            mapping_method="exact_match",
            evidence_json={"source": "manual_audit"},
            created_at=now,
            updated_at=now,
        )
    )

    connection.execute(
        WorkbenchDatedMetadata.__table__.insert().values(
            id=str(uuid4()),
            identity_id="1628389",
            namespace="nba",
            kind="player",
            category="position",
            effective_season="2025-26",
            effective_date=date(2025, 10, 20),
            observed_at=now,
            source_name="sportsdataverse",
            data_json={"listed_position": "C-F"},
            created_at=now,
        )
    )

    connection.execute(
        WorkbenchPlayerMeasurement.__table__.insert().values(
            id=str(uuid4()),
            player_id="1628389",
            source_name="draft_combine",
            measurement_type="combine",
            draft_year=2017,
            height_no_shoes_inches=80.75,
            height_shoes_inches=81.75,
            wingspan_inches=86.75,
            standing_reach_inches=108.0,
            weight_lbs=243.0,
            wingspan_to_height_ratio=1.06,
            data_source_evidence_json={"combine_event": "2017 NBA Draft Combine"},
            created_at=now,
        )
    )

    connection.execute(
        WorkbenchPlayerDraft.__table__.insert().values(
            id=str(uuid4()),
            player_id="1628389",
            draft_year=2017,
            round_number=1,
            pick_overall=14,
            drafting_team_id="MIA",
            drafting_team_name="Miami Heat",
            draft_type="draft",
            college_or_prior_team="Kentucky",
            data_source_evidence_json={"official_draft": True},
            created_at=now,
        )
    )

    # Verify rows exist
    res = connection.execute(
        sa.select(WorkbenchIdentityCrosswalk.__table__.c.target_id).where(
            WorkbenchIdentityCrosswalk.__table__.c.source_id == "4066261"
        )
    ).scalar()
    assert res == "1628389"

    meas = connection.execute(
        sa.select(WorkbenchPlayerMeasurement.__table__.c.wingspan_inches).where(
            WorkbenchPlayerMeasurement.__table__.c.player_id == "1628389"
        )
    ).scalar()
    assert meas == 86.75

    # Test downgrade
    with Operations.context(MigrationContext.configure(connection)):
        migration.downgrade()
    tables_after = set(sa.inspect(connection).get_table_names())
    assert "workbench_identity_crosswalks" not in tables_after
    assert "workbench_dated_metadata" not in tables_after
    assert "workbench_player_measurements" not in tables_after
    assert "workbench_player_drafts" not in tables_after
