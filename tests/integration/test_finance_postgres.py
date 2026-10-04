"""B28 migration and real SQL sealing in disposable PostgreSQL schemas."""

import importlib.util
import os
from pathlib import Path
from uuid import uuid4

import pytest
from alembic.migration import MigrationContext
from alembic.operations import Operations
from sqlalchemy import create_engine, text
from sqlalchemy.exc import DBAPIError


@pytest.fixture
def finance_connection():
    url = os.environ.get("COURTLOAD_TEST_POSTGRES_URL")
    if not url:
        pytest.skip("disposable PostgreSQL URL required")
    engine = create_engine(url)
    schema = "b28_" + uuid4().hex
    with engine.connect() as c:
        c.execute(text(f"CREATE SCHEMA {schema}"))
        c.execute(text(f"SET search_path TO {schema}"))
        c.execute(text("CREATE TABLE workbench_identities (id varchar(36) PRIMARY KEY)"))
        c.execute(text("INSERT INTO workbench_identities VALUES ('player')"))
        spec = importlib.util.spec_from_file_location(
            "b28", Path("migrations/versions/27b810a4f001_finance_books.py")
        )
        assert spec and spec.loader
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        with Operations.context(MigrationContext.configure(c)):
            module.upgrade()
        c.execute(
            text(
                "INSERT INTO finance_releases VALUES "
                "('r',:hash,NULL,'{}','raw',txid_current()::text,now())"
            ),
            {"hash": "a" * 64},
        )
        c.execute(
            text("INSERT INTO finance_sources VALUES ('r',:hash,'evidence','{}')"),
            {"hash": "b" * 64},
        )
        c.execute(
            text(
                "INSERT INTO finance_observations VALUES "
                "('o','r',:hash,'player','amount',10001,NULL,NULL,'{}')"
            ),
            {"hash": "c" * 64},
        )
        c.execute(text("INSERT INTO finance_members VALUES ('r','o',:hash)"), {"hash": "d" * 64})
        c.commit()
        try:
            yield c
        finally:
            c.rollback()
            c.execute(text("SET search_path TO public"))
            c.execute(text(f"DROP SCHEMA {schema} CASCADE"))
            c.commit()
    engine.dispose()


@pytest.mark.parametrize(
    "statement",
    [
        "UPDATE finance_releases SET manifest_json='{}'",
        "DELETE FROM finance_sources",
        "TRUNCATE finance_members",
        "UPDATE finance_observations SET amount_cents=0",
        "INSERT INTO finance_sources VALUES ('r','new','later','{}')",
        "INSERT INTO finance_members VALUES ('r','o','new')",
        "INSERT INTO finance_observations VALUES "
        "('new','r','hash','player','amount',0,NULL,NULL,'{}')",
    ],
)
def test_sealed_finance_rejects_mutation_and_extension(finance_connection, statement):
    with pytest.raises(DBAPIError, match=r"append-only|already sealed"):
        finance_connection.execute(text(statement))


def test_migration_downgrade_and_exact_cents(finance_connection):
    assert finance_connection.scalar(text("SELECT amount_cents FROM finance_observations")) == 10001
    spec = importlib.util.spec_from_file_location(
        "b28", Path("migrations/versions/27b810a4f001_finance_books.py")
    )
    assert spec and spec.loader
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    with Operations.context(MigrationContext.configure(finance_connection)):
        module.downgrade()
    assert finance_connection.scalar(text("SELECT to_regclass('finance_releases')")) is None
