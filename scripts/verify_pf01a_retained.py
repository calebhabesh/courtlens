"""Compare retained reproduction to checksum-verified PF00 engine; time real DB HTTP."""

from __future__ import annotations

import hashlib
import json
import time
from pathlib import Path
from unittest.mock import patch

from fastapi.testclient import TestClient
from sqlalchemy import text

from courtload.api.app import create_app
from courtload.database import SessionLocal, get_db
from courtload.services.workbench_analytics import reproduce_investigation


def main() -> None:
    directory = Path("docs/evidence/pf01a-query-contract")
    source = (directory / "pf00-stats-engine.py.txt").read_text()
    expected = json.loads(Path("docs/evidence/pf00-baseline/starting-state.json").read_text())[
        "dirty_files"
    ]["src/courtload/services/stats_engine.py"]["sha256"]
    assert hashlib.sha256(source.encode()).hexdigest() == expected
    namespace: dict = {}
    exec(compile(source, "checksum-verified-pf00-stats-engine", "exec"), namespace)
    current = json.loads((directory / "real-database.json").read_text())
    baseline_results = []
    with SessionLocal() as session:
        session.execute(text("SET TRANSACTION READ ONLY"))
        with patch(
            "courtload.services.stats_engine.execute_stats_query", namespace["execute_stats_query"]
        ):
            for result in current["saved_reproduction"]:
                old = reproduce_investigation(session, result["id"])
                assert old == result
                baseline_results.append(old)
        app = create_app()
        app.dependency_overrides[get_db] = lambda: session
        with TestClient(app) as client:
            query = {
                "release_id": current["context"]["release_id"],
                "season": "2025-26",
                "phase": "regular_season",
                "before_date": "2026-06-30",
                "sort": [{"field": "pts_per_game"}],
                "page": {"limit": 50},
            }
            timings = []
            for _ in range(10):
                started = time.perf_counter()
                response = client.post(
                    "/api/workbench/query", json={"query": query, "presentation": {}}
                )
                timings.append(time.perf_counter() - started)
                assert response.status_code == 200, response.text
                data = response.json()
                assert data["total_eligible_players"] == data["total_output_players"] == 591
                assert len(data["items"]) == 50
                assert data["items"][0]["percentiles"]["pts_per_game"] is not None
        session.rollback()
    report = {
        "pf00_engine_sha256": expected,
        "unchanged_reproductions": len(baseline_results),
        "baseline_matches": sum(r["match"] for r in baseline_results),
        "baseline_mismatches": sum(not r["match"] for r in baseline_results),
        "http_environment": "In-process FastAPI HTTP; retained PostgreSQL; read-only",
        "http_seconds": timings,
        "http_p95_seconds": sorted(timings)[-1],
        "baseline_reproduction": baseline_results,
    }
    (directory / "retained-comparison.json").write_text(json.dumps(report, indent=2) + "\n")
    print(
        json.dumps({key: value for key, value in report.items() if key != "baseline_reproduction"})
    )


if __name__ == "__main__":
    main()
