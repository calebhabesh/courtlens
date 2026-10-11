"""Read-only network/API and integrity checks for the retained PC06 admission."""

import json
import time
from pathlib import Path

import httpx
from sqlalchemy import func, select, text
from sqlalchemy.exc import DBAPIError

from courtlens.database import SessionLocal
from courtlens.finance_context_models import FinanceRefresh, FinanceRefreshSource, FinanceThreshold
from courtlens.finance_models import FinanceMember, FinanceObservation, FinanceRelease
from courtlens.services.finance_refresh import verify_refresh
from courtlens.warehouse_models import PublishedSnapshot
from courtlens.workbench_models import WorkbenchAcquisition, WorkbenchArtifact

ROOT = Path(__file__).resolve().parent


def state():
    with SessionLocal() as session:
        return {
            "pointers": [
                {
                    "channel": r.channel,
                    "snapshot_id": r.snapshot_id,
                    "published_at": r.published_at.isoformat(),
                }
                for r in session.scalars(
                    select(PublishedSnapshot).order_by(PublishedSnapshot.channel)
                )
            ],
            "counts": {
                m.__tablename__: session.scalar(select(func.count()).select_from(m))
                for m in (
                    FinanceRefresh,
                    FinanceRefreshSource,
                    FinanceThreshold,
                    FinanceRelease,
                    FinanceObservation,
                    FinanceMember,
                    WorkbenchAcquisition,
                    WorkbenchArtifact,
                )
            },
        }


def main():
    admission = json.loads((ROOT / "admission.json").read_text())
    before = state()
    measurements = []
    cases = [
        (
            "refresh-detail",
            f"/api/workbench/operations/finance/refreshes/{admission['refresh_id']}",
        ),
        ("refresh-catalog", "/api/workbench/operations/finance/refreshes"),
        ("thresholds", "/api/workbench/operations/finance/thresholds"),
        ("book-detail", f"/api/workbench/operations/finance/books/{admission['book_id']}"),
    ]
    with httpx.Client(base_url="http://127.0.0.1:8102", timeout=60) as client:
        for name, path in cases:
            start = time.perf_counter()
            response = client.get(path)
            elapsed = time.perf_counter() - start
            response.raise_for_status()
            result = response.json()
            assert "storage_path" not in response.text and "evidence_bytes" not in response.text
            if name == "refresh-detail":
                assert result["expected_players"] == 622
                assert result["salary_observed_players"] == 3 and result["unknown_players"] == 619
                assert len(result["coverage"]) == 622
                assert len({p["team_id"] for p in result["coverage"]}) == 30
                assert all(
                    (p["salary_cents"] is None) == (p["unknown_reason"] is not None)
                    for p in result["coverage"]
                )
                assert all(p["effective_date"] is None for p in result["coverage"])
                assert result["free_agents"] == [] and result["state"] == "verification_blocked"
            if name == "thresholds":
                assert len(result) == 1 and result[0]["cap_cents"] == "16496100000"
            (ROOT / f"{name}.json").write_text(json.dumps(result, indent=2) + "\n")
            measurements.append(
                {
                    "name": name,
                    "http_status": response.status_code,
                    "milliseconds": round(elapsed * 1000, 1),
                    "bytes": len(response.content),
                }
            )
        response = client.post(
            "/api/workbench/operations/finance",
            json={
                "book_id": admission["book_id"],
                "financial_season": "2026-27",
                "known_at": admission["observed_at"],
                "effective_on": "2026-10-11",
            },
        )
        response.raise_for_status()
        result = response.json()
        assert result["subtotal"]["known_subtotal_cents"] is None
        assert result["subtotal"]["threshold_status"] == "threshold_status_pending"
        (ROOT / "legacy-query.json").write_text(json.dumps(result, indent=2) + "\n")
    after = state()
    assert before == after
    original = json.loads((ROOT / "pointers-before.json").read_text())
    assert original == after["pointers"]
    (ROOT / "pointers-after.json").write_text(json.dumps(after["pointers"], indent=2) + "\n")
    (ROOT / "read-only-check.json").write_text(
        json.dumps({"before": before, "after": after}, indent=2) + "\n"
    )
    (ROOT / "api-measurements.json").write_text(json.dumps(measurements, indent=2) + "\n")
    with SessionLocal() as session:
        integrity = verify_refresh(session, admission["refresh_id"], Path("data/raw/finance"))
        (ROOT / "integrity.json").write_text(json.dumps(integrity, indent=2) + "\n")
        blocked = []
        for statement in (
            "UPDATE finance_refreshes SET payload_json='{}' WHERE id=:id",
            "DELETE FROM finance_refresh_sources WHERE refresh_id=:id",
            "UPDATE workbench_artifacts SET source_attribution='modified' "
            "WHERE resource='finance_robots'",
        ):
            try:
                with session.begin_nested():
                    session.execute(text(statement), {"id": admission["refresh_id"]})
            except DBAPIError as error:
                assert "append-only" in str(error)
                blocked.append({"statement": statement, "rejected": True})
            else:
                raise AssertionError("finance mutation was accepted")
        (ROOT / "sql-sealing.json").write_text(json.dumps(blocked, indent=2) + "\n")
        session.rollback()
    assert state() == after
    print(json.dumps(measurements, indent=2))
    print("All 161 pointers and ingestion counts unchanged by reads; SQL sealing verified.")


if __name__ == "__main__":
    main()
