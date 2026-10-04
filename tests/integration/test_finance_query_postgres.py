"""B29 read-only HTTP operations on sealed PostgreSQL books in disposable schemas."""

import hashlib
import importlib.util
import json
import os
from datetime import UTC, date, datetime
from pathlib import Path
from uuid import uuid4

import pytest
from alembic.migration import MigrationContext
from alembic.operations import Operations
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, text
from sqlalchemy.orm import Session

from courtload.api.app import create_app
from courtload.database import get_db
from courtload.domain.finance import FinanceRow, export_csv
from courtload.services.finance_import import admit_bundle, verify_release
from courtload.workbench_models import WorkbenchIdentity


@pytest.fixture
def query_postgres():
    url = os.environ.get("COURTLOAD_TEST_POSTGRES_URL")
    if not url:
        pytest.skip("disposable PostgreSQL URL required")
    engine = create_engine(url)
    schema = "b29_" + uuid4().hex
    with engine.connect() as connection:
        connection.execute(text(f"CREATE SCHEMA {schema}"))
        connection.execute(text(f"SET search_path TO {schema}"))
        WorkbenchIdentity.__table__.create(connection)
        spec = importlib.util.spec_from_file_location(
            "b29_finance", Path("migrations/versions/27b810a4f001_finance_books.py")
        )
        assert spec and spec.loader
        migration = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(migration)
        with Operations.context(MigrationContext.configure(connection)):
            migration.upgrade()
        connection.commit()
        try:
            with Session(connection) as session:
                yield session
        finally:
            connection.rollback()
            connection.execute(text("SET search_path TO public"))
            connection.execute(text(f"DROP SCHEMA {schema} CASCADE"))
            connection.commit()
    engine.dispose()


@pytest.mark.parametrize(
    "value,expected", [("0", "0"), ("123456789.01", "12345678901"), (None, None)]
)
def test_postgres_sealed_book_http_cents_and_provenance(query_postgres, tmp_path, value, expected):
    session = query_postgres
    now = datetime(2026, 10, 3, tzinfo=UTC)
    source = b"B29 synthetic seasonal salary test; no real salary claim"
    sha = hashlib.sha256(source).hexdigest()
    observation = FinanceRow(
        row_id="salary",
        kind="amount",
        source_namespace="nba",
        source_entity_id="1627742",
        nba_player_id="1627742",
        contract_id="synthetic",
        financial_season="2025-26",
        effective_date=date(2025, 7, 1),
        observed_at=now,
        source_sha256=sha,
        source_locator="synthetic",
        original_label="synthetic salary",
        amount_kind="base_salary",
        currency="USD",
        value=value,
    )
    raw = export_csv((observation,))
    (tmp_path / "observations.csv").write_bytes(raw)
    (tmp_path / "sources").mkdir()
    (tmp_path / "sources" / sha).write_bytes(source)
    (tmp_path / "manifest.json").write_text(
        json.dumps(
            dict(
                csv_sha256=hashlib.sha256(raw).hexdigest(),
                coverage_note="one synthetic contract",
                sources=[
                    dict(
                        sha256=sha,
                        url="https://example.com/synthetic",
                        observed_at=now.isoformat(),
                        attribution="synthetic",
                        use_basis="synthetic",
                    )
                ],
                mappings=[
                    dict(
                        source_namespace="nba",
                        source_entity_id="1627742",
                        nba_player_id="1627742",
                        evidence_sha256=sha,
                        method="direct_nba_id",
                    )
                ],
            )
        )
    )
    session.add(
        WorkbenchIdentity(
            namespace="nba",
            kind="player",
            external_id="1627742",
            display_name="Synthetic test identity",
        )
    )
    session.commit()
    release = admit_bundle(session, tmp_path)
    session.commit()
    before = verify_release(session, release.id)
    app = create_app()
    app.dependency_overrides[get_db] = lambda: session
    with TestClient(app) as client:
        response = client.post(
            "/api/workbench/operations/finance",
            json=dict(
                book_id=release.id,
                financial_season="2025-26",
                known_at=now.isoformat(),
                effective_on="2026-10-03",
            ),
        )
        assert response.status_code == 200, response.text
        result = response.json()
        assert result["subtotal"]["known_subtotal_cents"] == expected
        assert result["contracts"][0]["observations"][0]["source"]["sha256"] == sha
        assert result["subtotal"]["threshold_status"] == "threshold_status_pending"
    assert verify_release(session, release.id) == before
    assert not session.new and not session.dirty and not session.deleted
