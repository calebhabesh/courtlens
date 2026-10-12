"""PC07 real PostgreSQL sealing, provenance, catalog and frozen migration invariants."""

import importlib.util
from pathlib import Path

import pytest
from alembic.migration import MigrationContext
from alembic.operations import Operations
from sqlalchemy import select, text
from sqlalchemy.exc import DBAPIError
from stats_feed_fixtures import fetch_and_admit, synergy_body

from courtlens.domain.query_spec import QuerySpec
from courtlens.domain.rich_sources import compute_payload_hash
from courtlens.services.stats_engine import execute_stats_query
from courtlens.services.stats_feed_ingestion import feed_capabilities, verify_feed
from courtlens.services.workbench_analytics import resolve_workbench_context
from courtlens.stats_feed_models import StatsFeedDataset
from courtlens.warehouse_models import PublishedSnapshot

pytestmark = pytest.mark.postgres


@pytest.fixture
def admitted(workbench_db, tmp_path, monkeypatch):
    monkeypatch.setattr("courtlens.services.source_acquisition.time.sleep", lambda _: None)
    return fetch_and_admit(workbench_db, tmp_path, synergy_body())


@pytest.mark.parametrize(
    "statement",
    [
        "UPDATE stats_feed_datasets SET coverage_json='{}' WHERE id=:id",
        "DELETE FROM stats_feed_versions",
        "UPDATE stats_feed_members SET row_locator='x' WHERE dataset_id=:id",
        "TRUNCATE stats_feed_members",
        "TRUNCATE stats_feed_datasets CASCADE",
        "INSERT INTO stats_feed_members (dataset_id,entity_key,source_name,feed,season,"
        "version_id,row_locator) SELECT dataset_id,'extra',source_name,feed,season,"
        "version_id,'row:9' FROM stats_feed_members WHERE dataset_id=:id",
        "UPDATE workbench_acquisitions SET source_url='modified' WHERE id=:acquisition",
        "DELETE FROM workbench_acquisitions WHERE id=:acquisition",
        "UPDATE workbench_artifacts SET sha256='modified' WHERE id=:artifact",
    ],
)
def test_sql_mutation_or_extension_rejects(workbench_db, admitted, statement):
    receipt_id = admitted.acquisition_id
    artifact = workbench_db.scalar(
        text("SELECT artifact_id FROM workbench_acquisitions WHERE id=:id"), {"id": receipt_id}
    )
    with pytest.raises(DBAPIError, match=r"append-only|sealed"), workbench_db.begin_nested():
        workbench_db.execute(
            text(statement),
            {"id": admitted.id, "acquisition": receipt_id, "artifact": artifact},
        )


def test_feed_admission_leaves_stats_and_pointers_unchanged(workbench_db, tmp_path, admitted):
    pointers = list(
        workbench_db.execute(select(PublishedSnapshot.channel, PublishedSnapshot.snapshot_id))
    )
    context = resolve_workbench_context(workbench_db, requested_season="2025-26")
    spec = QuerySpec(season="2025-26", before_date=context.before_date)
    before = compute_payload_hash(execute_stats_query(workbench_db, context, spec)[0])
    fetch_and_admit(workbench_db, tmp_path, synergy_body(rows=[]))
    assert compute_payload_hash(execute_stats_query(workbench_db, context, spec)[0]) == before
    assert (
        list(workbench_db.execute(select(PublishedSnapshot.channel, PublishedSnapshot.snapshot_id)))
        == pointers
    )
    assert verify_feed(workbench_db, admitted.id, tmp_path)["verified"] is True
    entry = feed_capabilities(workbench_db)["play_types"]
    assert any("zero rows" in line for line in entry.limitations)


def test_frozen_migration_upgrade_downgrade(workbench_db):
    spec = importlib.util.spec_from_file_location(
        "pc07_migration", Path("migrations/versions/13b810a4f011_stats_feeds.py")
    )
    assert spec and spec.loader
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    connection = workbench_db.connection()
    with Operations.context(MigrationContext.configure(connection)):
        module.downgrade()
        assert connection.scalar(text("SELECT to_regclass('stats_feed_datasets')")) is None
        module.upgrade()
    assert connection.scalar(text("SELECT to_regclass('stats_feed_datasets')")) is not None
    assert set(
        connection.execute(
            text(
                "SELECT column_name FROM information_schema.columns "
                "WHERE table_schema=current_schema() AND table_name='stats_feed_datasets'"
            )
        ).scalars()
    ) == set(StatsFeedDataset.__table__.columns.keys())
