"""PC06 real PostgreSQL sealing, scope binding, temporal and read-only invariants."""

import importlib.util
import json
from datetime import timedelta
from pathlib import Path

import pytest
from alembic.migration import MigrationContext
from alembic.operations import Operations
from fastapi import HTTPException
from finance_source_fixtures import THRESHOLDS, finance_capture, roster_capture
from sqlalchemy import select, text
from sqlalchemy.exc import DBAPIError

from courtlens.domain.query_spec import QuerySpec
from courtlens.domain.rich_sources import compute_payload_hash
from courtlens.finance_context_models import FinanceRefresh
from courtlens.services.finance_refresh import (
    admit_refresh,
    import_thresholds,
    refresh_info,
    verify_refresh,
)
from courtlens.services.stats_engine import execute_stats_query
from courtlens.services.workbench_analytics import resolve_workbench_context
from courtlens.warehouse_models import PublishedSnapshot

pytestmark = pytest.mark.postgres


@pytest.fixture
def admitted(workbench_db, tmp_path, monkeypatch):
    monkeypatch.setattr("courtlens.services.source_acquisition.time.sleep", lambda _: None)
    roster = roster_capture(workbench_db, tmp_path)
    receipt = finance_capture(workbench_db, tmp_path)
    path = tmp_path / "thresholds.json"
    path.write_text(json.dumps(THRESHOLDS))
    threshold = import_thresholds(workbench_db, path)
    workbench_db.commit()
    refresh = admit_refresh(workbench_db, [receipt.id], roster.id, threshold.id, tmp_path, tmp_path)
    workbench_db.commit()
    return refresh, receipt


@pytest.mark.parametrize(
    "statement",
    [
        "UPDATE finance_refreshes SET payload_json='{}' WHERE id=:id",
        "DELETE FROM finance_refresh_sources WHERE refresh_id=:id",
        "TRUNCATE finance_refreshes CASCADE",
        "UPDATE finance_thresholds SET source_bytes='modified'",
        "DELETE FROM finance_thresholds",
        "TRUNCATE finance_thresholds CASCADE",
        "INSERT INTO finance_refresh_sources (refresh_id,acquisition_id) VALUES (:id,:acquisition)",
        "UPDATE workbench_acquisitions SET source_url='modified' WHERE id=:acquisition",
        "DELETE FROM workbench_acquisitions WHERE id=:acquisition",
        "UPDATE workbench_artifacts SET sha256='modified' WHERE id=:artifact",
        "UPDATE workbench_artifacts SET source_attribution='modified' "
        "WHERE resource='finance_robots'",
        "TRUNCATE workbench_artifacts CASCADE",
    ],
)
def test_sql_mutation_or_extension_rejects(workbench_db, admitted, statement):
    refresh, receipt = admitted
    with pytest.raises(DBAPIError, match=r"append-only|sealed"), workbench_db.begin_nested():
        workbench_db.execute(
            text(statement),
            {"id": refresh.id, "acquisition": receipt.id, "artifact": receipt.artifact_id},
        )


def test_wrong_season_or_non_finance_acquisition_rejects_at_database(workbench_db, admitted):
    refresh, _receipt = admitted
    with pytest.raises(DBAPIError, match="roster scope mismatch"), workbench_db.begin_nested():
        workbench_db.execute(
            text("""INSERT INTO finance_refreshes
              (id,input_sha256,content_sha256,season,roster_dataset_id,threshold_id,book_id,
               observed_at,parser_version,admission_transaction,payload_json)
              SELECT 'bad', 'new', 'new', '2025-26', roster_dataset_id,NULL,NULL,
               now(),parser_version,txid_current()::text,'{}'
               FROM finance_refreshes WHERE id=:id"""),
            {"id": refresh.id},
        )
    with pytest.raises(DBAPIError, match="acquisition scope mismatch"), workbench_db.begin_nested():
        workbench_db.execute(
            text("""INSERT INTO finance_refreshes
          (id,input_sha256,content_sha256,season,roster_dataset_id,threshold_id,book_id,
           observed_at,parser_version,admission_transaction,payload_json)
          SELECT 'bad', 'new', 'new', season,roster_dataset_id,NULL,NULL,
           now(),parser_version,txid_current()::text,'{}'
           FROM finance_refreshes WHERE id=:id"""),
            {"id": refresh.id},
        )
        workbench_db.execute(
            text("""INSERT INTO finance_refresh_sources (refresh_id,acquisition_id)
          SELECT 'bad', acquisition_id FROM player_context_datasets WHERE id=:id"""),
            {"id": refresh.roster_dataset_id},
        )


def test_refresh_append_does_not_change_stats_or_prior_book(workbench_db, tmp_path, admitted):
    first, receipt = admitted
    pointers_before = list(
        workbench_db.execute(select(PublishedSnapshot.channel, PublishedSnapshot.snapshot_id))
    )
    context = resolve_workbench_context(workbench_db, requested_season="2025-26")
    spec = QuerySpec(season="2025-26", before_date=context.before_date)
    before = compute_payload_hash(execute_stats_query(workbench_db, context, spec)[0])
    original = refresh_info(workbench_db, first.id).model_dump()
    assert verify_refresh(workbench_db, first.id, tmp_path)["status"] == "verified"
    assert (
        admit_refresh(
            workbench_db,
            [receipt.id],
            first.roster_dataset_id,
            first.threshold_id,
            tmp_path,
            tmp_path,
        ).id
        == first.id
    )
    later = finance_capture(workbench_db, tmp_path)
    second = admit_refresh(
        workbench_db, [later.id], first.roster_dataset_id, first.threshold_id, tmp_path, tmp_path
    )
    workbench_db.commit()
    assert second.id != first.id and second.book_id != first.book_id
    assert refresh_info(workbench_db, first.id).model_dump() == original
    assert compute_payload_hash(execute_stats_query(workbench_db, context, spec)[0]) == before
    assert (
        list(workbench_db.execute(select(PublishedSnapshot.channel, PublishedSnapshot.snapshot_id)))
        == pointers_before
    )
    with pytest.raises(HTTPException, match="observed after knownAt"):
        refresh_info(workbench_db, second.id, second.observed_at - timedelta(seconds=1))


def test_frozen_migration_upgrade_downgrade(workbench_db):
    spec = importlib.util.spec_from_file_location(
        "pc06_migration", Path("migrations/versions/12b810a4f010_finance_context.py")
    )
    assert spec and spec.loader
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    connection = workbench_db.connection()
    with Operations.context(MigrationContext.configure(connection)):
        module.downgrade()
        assert connection.scalar(text("SELECT to_regclass('finance_refreshes')")) is None
        module.upgrade()
    assert connection.scalar(text("SELECT to_regclass('finance_refreshes')")) is not None
    # ORM definitions and the frozen migration agree on retained columns.
    assert set(
        connection.execute(
            text(
                "SELECT column_name FROM information_schema.columns "
                "WHERE table_schema=current_schema() AND table_name='finance_refreshes'"
            )
        ).scalars()
    ) == set(FinanceRefresh.__table__.columns.keys())
