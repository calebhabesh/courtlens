"""PostgreSQL mutation/extension guards; every schema created here is isolated and removed."""

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
def sealed_connection():
    url = os.environ.get("COURTLENS_TEST_POSTGRES_URL")
    if not url:
        pytest.skip("disposable PostgreSQL URL required")
    engine = create_engine(url)
    schema = "b26_sealed_" + uuid4().hex
    with engine.connect() as connection:
        connection.execute(text(f"CREATE SCHEMA {schema}"))
        connection.commit()
        connection.execute(text(f"SET search_path TO {schema}"))
        connection.commit()
        spec = importlib.util.spec_from_file_location(
            "b26_sealing", Path("migrations/versions/0af4286cb194_append_only_research_inputs.py")
        )
        assert spec and spec.loader
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        with Operations.context(MigrationContext.configure(connection)):
            module.upgrade()
        connection.execute(
            text(
                "INSERT INTO research_datasets VALUES "
                "('d',:hash,:hash,:hash,:hash,txid_current()::text,'{}',now())"
            ),
            {"hash": "a" * 64},
        )
        connection.execute(
            text(
                "INSERT INTO research_games VALUES "
                "('d','0022500001','2025-26','2025-10-21',1,1,:hash,:hash)"
            ),
            {"hash": "b" * 64},
        )
        connection.execute(
            text("INSERT INTO research_shot_members VALUES ('d','0022500001',1,true,'{}')")
        )
        connection.commit()
        try:
            yield connection
        finally:
            connection.rollback()
            connection.execute(text("SET search_path TO public"))
            connection.commit()
            connection.execute(text(f"DROP SCHEMA {schema} CASCADE"))
            connection.commit()
    engine.dispose()


@pytest.mark.parametrize(
    "statement",
    [
        "UPDATE research_datasets SET content_sha256='b' WHERE id='d'",
        "DELETE FROM research_games WHERE dataset_id='d'",
        "TRUNCATE research_shot_members",
        "UPDATE research_shot_members SET payload_json='{}'",
        "INSERT INTO research_games VALUES ('d','0022500002','2025-26','2025-10-22',1,1,'x','x')",
        "INSERT INTO research_shot_members VALUES ('d','0022500001',2,true,'{}')",
        "INSERT INTO research_shot_members VALUES ('unknown','0022500001',1,true,'{}')",
    ],
)
def test_sealed_inputs_reject_sql_mutation_and_later_membership_extension(
    sealed_connection, statement
):
    with pytest.raises(DBAPIError, match=r"append-only|already sealed"):
        sealed_connection.execute(text(statement))
