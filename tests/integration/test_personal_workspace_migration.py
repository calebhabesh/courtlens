"""Exercise the workspace migration in disposable PostgreSQL schemas."""

import importlib.util
import os
from collections.abc import Generator
from pathlib import Path
from types import ModuleType
from uuid import uuid4

import pytest
import sqlalchemy as sa
from alembic.migration import MigrationContext
from alembic.operations import Operations
from sqlalchemy import Connection

from courtload.workbench_models import WorkbenchPersonalWorkspace

pytestmark = pytest.mark.postgres


@pytest.fixture
def migration() -> ModuleType:
    path = (
        Path(__file__).resolve().parents[2]
        / "migrations/versions/1b66214e7c08_personal_workspace_state.py"
    )
    spec = importlib.util.spec_from_file_location("workspace_migration", path)
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
    # Schema creation and all test changes are rolled back, including on failure.
    with engine.connect() as conn, conn.begin() as transaction:
        schema = "workspace_migration_" + uuid4().hex
        conn.exec_driver_sql(f'CREATE SCHEMA "{schema}"')
        conn.exec_driver_sql(f'SET LOCAL search_path TO "{schema}"')
        yield conn
        transaction.rollback()
    engine.dispose()


@pytest.mark.parametrize("precreated", [False, True])
def test_workspace_upgrade_preserves_existing_rows(
    connection: Connection, migration: ModuleType, precreated: bool
) -> None:
    table = WorkbenchPersonalWorkspace.__table__
    if precreated:
        table.create(connection)
        connection.execute(
            table.insert().values(id="retained", name="Retained workspace", favorites_json=["123"])
        )
    with Operations.context(MigrationContext.configure(connection)):
        migration.upgrade()
    columns = {column["name"]: column for column in sa.inspect(connection).get_columns(table.name)}
    assert columns["version"]["default"] == "1"
    assert columns["created_at"]["type"].timezone is True
    if precreated:
        row = connection.execute(sa.select(table)).mappings().one()
        assert row["id"] == "retained"
        assert row["favorites_json"] == ["123"]
        assert row["version"] == 1
    # A compatible table is also accepted if its server default already exists.
    with Operations.context(MigrationContext.configure(connection)):
        migration.upgrade()


@pytest.mark.parametrize(
    "ddl",
    [
        "ALTER TABLE workbench_personal_workspaces DROP COLUMN views_json",
        "ALTER TABLE workbench_personal_workspaces ALTER COLUMN name TYPE varchar(50)",
        "ALTER TABLE workbench_personal_workspaces ALTER COLUMN name DROP NOT NULL",
        "ALTER TABLE workbench_personal_workspaces "
        "DROP CONSTRAINT workbench_personal_workspaces_pkey",
        "ALTER TABLE workbench_personal_workspaces ALTER COLUMN version SET DEFAULT 2",
        "ALTER TABLE workbench_personal_workspaces "
        "ALTER COLUMN created_at TYPE timestamp without time zone",
    ],
)
def test_workspace_upgrade_rejects_schema_drift(
    connection: Connection, migration: ModuleType, ddl: str
) -> None:
    WorkbenchPersonalWorkspace.__table__.create(connection)
    connection.exec_driver_sql(ddl)
    with (
        Operations.context(MigrationContext.configure(connection)),
        pytest.raises(RuntimeError, match="incompatible schema"),
    ):
        migration.upgrade()
    # Validation must reject before adding the default or changing the schema.
    columns = sa.inspect(connection).get_columns("workbench_personal_workspaces")
    version = next(column for column in columns if column["name"] == "version")
    assert version["default"] == ("2" if "DEFAULT 2" in ddl else None)
