"""B30 discovery exposes bounded labels without substituting financial context."""

import pytest
from fastapi.testclient import TestClient
from test_finance_import import bundle, identity, row

from courtlens.api.app import create_app
from courtlens.database import get_db
from courtlens.services.finance_import import admit_bundle, verify_release


def test_book_discovery_retains_parent_scope_and_is_read_only(session, tmp_path):
    identity(session)
    original = admit_bundle(session, bundle(tmp_path / "original", (row(),)))
    session.commit()
    before = verify_release(session, original.id)
    app = create_app()
    app.dependency_overrides[get_db] = lambda: session
    with TestClient(app) as client:
        books = client.get("/api/workbench/operations/finance/books")
        assert books.status_code == 200
        assert books.json()[0]["book_id"] == original.id
        assert "csv_bytes" not in books.json()[0]
        response = client.get(f"/api/workbench/operations/finance/books/{original.id}")
        assert response.status_code == 200
        detail = response.json()
        assert detail["financial_seasons"] == ["2025-26"]
        assert detail["player_labels"] == {"1627742": "Brandon Ingram"}
        assert "not dated financial evidence" in detail["label_scope"]
        assert detail["parent_book_id"] is None
        assert detail["book_sha256"] == original.content_sha256
        assert client.get("/api/workbench/operations/finance/books/invalid").status_code == 422
        missing = "00000000-0000-4000-8000-000000000000"
        assert client.get(f"/api/workbench/operations/finance/books/{missing}").status_code == 404
    assert verify_release(session, original.id) == before


def test_book_discovery_empty_and_bound(session):
    from courtlens.finance_models import FinanceRelease
    from courtlens.services.finance_catalog import list_books

    assert list_books(session) == ()
    for index in range(101):
        session.add(
            FinanceRelease(
                content_sha256=f"{index:064x}",
                manifest_json={"coverage_note": "synthetic bound check"},
                csv_bytes=b"",
                admission_transaction="unit",
            )
        )
    session.commit()
    with pytest.raises(Exception, match="Book discovery bound exceeded"):
        list_books(session)
