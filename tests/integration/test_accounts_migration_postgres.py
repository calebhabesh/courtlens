"""F04 accounts migration on PostgreSQL: additive, and pre-F04 users stay disabled."""

from __future__ import annotations

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

pytestmark = pytest.mark.postgres


@pytest.fixture
def migration() -> ModuleType:
    path = (
        Path(__file__).resolve().parents[2]
        / "migrations/versions/3c4d9e1f0a21_accounts_and_favorites.py"
    )
    spec = importlib.util.spec_from_file_location("accounts_migration", path)
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


@pytest.fixture
def connection() -> Generator[Connection, None, None]:
    url = os.getenv("COURTLENS_TEST_POSTGRES_URL")
    if not url:
        if os.getenv("CI") or os.getenv("COURTLENS_REQUIRE_POSTGRES_TESTS"):
            pytest.fail("COURTLENS_TEST_POSTGRES_URL must be configured")
        pytest.skip("PostgreSQL URL is not configured")
    engine = sa.create_engine(url)
    with engine.connect() as conn, conn.begin() as transaction:
        schema = "accounts_migration_" + uuid4().hex
        conn.exec_driver_sql(f'CREATE SCHEMA "{schema}"')
        conn.exec_driver_sql(f'SET LOCAL search_path TO "{schema}"')
        # The users table as it stood before F04.
        conn.exec_driver_sql(
            "CREATE TABLE users (id varchar(36) PRIMARY KEY, email varchar(320) UNIQUE NOT NULL,"
            " password_hash varchar(255) NOT NULL, created_at timestamptz)"
        )
        conn.exec_driver_sql("INSERT INTO users VALUES ('u1', 'demo@courtlens.dev', 'x', now())")
        yield conn
        transaction.rollback()
    engine.dispose()


def test_existing_users_are_kept_and_cannot_sign_in(
    connection: Connection, migration: ModuleType
) -> None:
    with Operations.context(MigrationContext.configure(connection)):
        migration.upgrade()
    row = connection.exec_driver_sql("SELECT * FROM users").mappings().one()
    assert row["email"] == "demo@courtlens.dev"
    assert row["account_enabled"] is False
    assert row["is_demo"] is False
    assert row["session_version"] == 1
    assert row["display_name"] is None


def test_favourites_go_with_their_user(connection: Connection, migration: ModuleType) -> None:
    with Operations.context(MigrationContext.configure(connection)):
        migration.upgrade()
    connection.exec_driver_sql("INSERT INTO user_favorite_players VALUES ('u1', '203999', now())")
    with pytest.raises(sa.exc.IntegrityError), connection.begin_nested():
        connection.exec_driver_sql(
            "INSERT INTO user_favorite_players VALUES ('u1', '203999', now())"
        )
    connection.exec_driver_sql("DELETE FROM users WHERE id = 'u1'")
    assert connection.exec_driver_sql("SELECT count(*) FROM user_favorite_players").scalar() == 0


def test_downgrade_restores_the_old_table(connection: Connection, migration: ModuleType) -> None:
    with Operations.context(MigrationContext.configure(connection)):
        migration.upgrade()
        migration.downgrade()
    columns = {c["name"] for c in sa.inspect(connection).get_columns("users")}
    assert columns == {"id", "email", "password_hash", "created_at"}


def _load(name: str) -> ModuleType:
    path = Path(__file__).resolve().parents[2] / "migrations/versions" / name
    spec = importlib.util.spec_from_file_location(name.removesuffix(".py"), path)
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def test_sign_up_migration_confirms_only_enabled_accounts(
    connection: Connection, migration: ModuleType
) -> None:
    """Accounts plan: operator-enabled accounts count as confirmed; seed users stay unconfirmed."""
    sign_up = _load("5e6f7a8b9c03_accounts_sign_up_google.py")
    with Operations.context(MigrationContext.configure(connection)):
        migration.upgrade()
        connection.exec_driver_sql(
            "INSERT INTO users (id, email, password_hash, created_at, account_enabled) "
            "VALUES ('u2', 'owner@example.com', 'x', now(), true)"
        )
        sign_up.upgrade()
        rows = dict(
            connection.exec_driver_sql("SELECT id, email_verified_at IS NOT NULL FROM users").all()
        )
        assert rows == {"u1": False, "u2": True}
        connection.exec_driver_sql(
            "INSERT INTO users (id, email, created_at) VALUES ('u3', 'g@example.com', now())"
        )
        connection.exec_driver_sql(
            "INSERT INTO user_identities VALUES ('i1', 'u3', 'google', 'sub', null, now())"
        )
        with pytest.raises(sa.exc.IntegrityError), connection.begin_nested():
            connection.exec_driver_sql(
                "INSERT INTO user_identities VALUES ('i2', 'u2', 'google', 'sub', null, now())"
            )
        sign_up.downgrade()
    password = connection.exec_driver_sql("SELECT password_hash FROM users WHERE id = 'u3'")
    assert password.scalar() == "!"
