"""The frozen PC05 migration upgrades and downgrades in a disposable schema."""

import importlib.util
from pathlib import Path
from uuid import uuid4

import pytest
from alembic.migration import MigrationContext
from alembic.operations import Operations
from sqlalchemy import inspect, text
from sqlalchemy.orm import Session

from courtlens.workbench_models import WorkbenchAcquisition, WorkbenchArtifact

pytestmark = pytest.mark.postgres


def test_pc05_migration_round_trip(workbench_db: Session) -> None:
    path = (
        Path(__file__).resolve().parents[2] / "migrations/versions/11b810a4f009_player_context.py"
    )
    spec = importlib.util.spec_from_file_location("pc05_migration", path)
    assert spec is not None and spec.loader is not None
    migration = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(migration)
    connection = workbench_db.connection()
    schema = "pc05_migration_" + uuid4().hex
    original = connection.scalar(text("SHOW search_path"))
    connection.execute(text(f'CREATE SCHEMA "{schema}"'))
    connection.execute(text(f'SET LOCAL search_path TO "{schema}"'))
    try:
        WorkbenchArtifact.__table__.create(connection)
        WorkbenchAcquisition.__table__.create(connection)
        with Operations.context(MigrationContext.configure(connection)):
            migration.upgrade()
        assert {
            "player_context_datasets",
            "player_context_versions",
            "player_context_members",
        }.issubset(inspect(connection).get_table_names(schema=schema))
        assert (
            len(inspect(connection).get_foreign_keys("player_context_members", schema=schema)) == 2
        )
        with Operations.context(MigrationContext.configure(connection)):
            migration.downgrade()
        assert not any(
            name.startswith("player_context_")
            for name in inspect(connection).get_table_names(schema=schema)
        )
    finally:
        connection.execute(text(f"SET LOCAL search_path TO {original}"))
        connection.execute(text(f'DROP SCHEMA "{schema}" CASCADE'))
