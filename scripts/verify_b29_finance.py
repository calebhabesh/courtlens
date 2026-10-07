"""Reconcile retained B28 books through the B29 HTTP handler without database writes.

Usage: .venv/bin/python scripts/verify_b29_finance.py OUTPUT.json
Output is exclusively created. Requires the local PostgreSQL settings and retained B28 books.
"""

import json
import sys
from datetime import UTC, datetime, timedelta
from pathlib import Path
from time import perf_counter

from fastapi.testclient import TestClient
from sqlalchemy import select, text
from sqlalchemy.orm import Session

from courtlens.api.app import create_app
from courtlens.database import build_engine, get_db
from courtlens.services.finance_import import release_rows, verify_release
from courtlens.warehouse_models import PublishedSnapshot


def main() -> None:
    output = Path(sys.argv[1])
    if output.exists():
        raise SystemExit("output exists; refusing overwrite")
    b28 = json.loads(Path("docs/evidence/b28-finance-import.json").read_text())
    initial, corrected = [c["release_id"] for c in b28["checks"]]
    engine = build_engine()
    if engine.dialect.name != "postgresql":
        raise SystemExit("PostgreSQL required")
    with Session(engine) as session:
        session.execute(text("SET TRANSACTION READ ONLY"))
        pointers_before = dict(
            session.execute(select(PublishedSnapshot.channel, PublishedSnapshot.snapshot_id)).all()
        )
        checks_before = [verify_release(session, book) for book in (initial, corrected)]
        original_cutoff = max(r.observed_at for _, r in release_rows(session, initial))
        corrected_cutoff = max(
            r.observed_at for _, r in release_rows(session, corrected)
        ) + timedelta(seconds=1)
        app = create_app()
        app.dependency_overrides[get_db] = lambda: session
        results = {}
        with TestClient(app) as client:
            cases = {
                "original": (initial, corrected_cutoff),
                "corrected": (corrected, corrected_cutoff),
                "correction_as_of_original": (corrected, original_cutoff),
                "not_known_in_2025": (corrected, datetime(2025, 2, 12, tzinfo=UTC)),
            }
            for name, (book, known_at) in cases.items():
                start = perf_counter()
                response = client.post(
                    "/api/workbench/operations/finance",
                    json={
                        "book_id": book,
                        "financial_season": "2025-26",
                        "effective_on": "2025-02-12",
                        "known_at": known_at.isoformat(),
                        "team_id": "1610612761",
                    },
                )
                assert response.status_code == 200, response.text
                results[name] = dict(
                    result=response.json(),
                    http_status=response.status_code,
                    duration_ms=round((perf_counter() - start) * 1000, 3),
                    response_bytes=len(response.content),
                )
        assert results["corrected"]["result"]["contracts"][0]["derived_aav_usd"] == "40000000"
        for name in ("original", "correction_as_of_original"):
            assert results[name]["result"]["contracts"][0]["derived_aav_usd"] is None
        for value in results.values():
            result = value["result"]
            assert result["subtotal"]["known_subtotal_cents"] is None
            assert result["subtotal"]["threshold_status"] == "threshold_status_pending"
            assert (
                sum(result["status_groups_filtered"].values()) == result["filtered_contract_count"]
            )
        assert results["not_known_in_2025"]["result"]["contracts"] == []
        assert results["corrected"]["result"]["historical_reconstruction"]
        assert [verify_release(session, book) for book in (initial, corrected)] == checks_before
        pointers_after = dict(
            session.execute(select(PublishedSnapshot.channel, PublishedSnapshot.snapshot_id)).all()
        )
        assert pointers_before == pointers_after
        evidence = dict(
            schema_version="b29-real-query-evidence-v1",
            capture_kind=(
                "in-process HTTP with real PostgreSQL; no browser/network-server acceptance"
            ),
            transaction_read_only=session.scalar(text("SHOW transaction_read_only")),
            isolation=session.scalar(text("SHOW transaction_isolation")),
            books_verified_unchanged=checks_before,
            publication_pointers_unchanged=pointers_after,
            cases=results,
        )
        session.rollback()
    engine.dispose()
    with output.open("x") as stream:
        json.dump(evidence, stream, indent=2)
        stream.write("\n")


if __name__ == "__main__":
    main()
