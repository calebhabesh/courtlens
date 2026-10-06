"""Read-only independent fact reconciliation for PF03 lookup identity."""

from __future__ import annotations

import json
import time
from pathlib import Path

from fastapi.testclient import TestClient
from sqlalchemy import event, text

from courtload.api.app import create_app
from courtload.database import SessionLocal, get_db
from courtload.services.entity_lookup import clear_lookup_caches
from courtload.services.workbench_analytics import resolve_workbench_context


def main() -> None:
    clear_lookup_caches()
    checks = []
    timings = []
    with SessionLocal() as session:
        session.execute(text("SET TRANSACTION READ ONLY"))
        context = resolve_workbench_context(session)
        app = create_app()
        app.dependency_overrides[get_db] = lambda: session
        with TestClient(app) as client:
            for season, phase, cutoff in [
                ("2023-24", "regular_season", "2024-06-30"),
                ("2024-25", "regular_season", "2025-02-02"),
                ("2024-25", "regular_season", "2025-06-30"),
                ("2024-25", "playoffs", "2025-06-30"),
                ("2025-26", "regular_season", "2026-06-30"),
                ("2026-27", "regular_season", "2027-01-01"),
            ]:
                for player, name in [("1629029", "doncic"), ("1630567", "scottie")]:
                    rows = session.execute(
                        text("""
                        SELECT team_id, max(game_date) AS latest
                        FROM workbench_player_games
                        WHERE dataset_id=:dataset AND player_id=:player
                          AND season=:season AND phase=:phase AND game_date < :cutoff
                          AND appearance='appeared' GROUP BY team_id ORDER BY team_id
                    """),
                        {
                            "dataset": context.dataset_id,
                            "player": player,
                            "season": season,
                            "phase": phase,
                            "cutoff": cutoff,
                        },
                    ).all()
                    params = {
                        "q": name,
                        "releaseId": context.release_id,
                        "season": season,
                        "phase": phase,
                        "before_date": cutoff,
                    }
                    started = time.perf_counter()
                    response = client.get("/api/workbench/lookup", params=params)
                    timings.append((time.perf_counter() - started) * 1000)
                    assert response.status_code == 200, response.text
                    item = next(i for i in response.json()["items"] if i["id"] == player)
                    # Admitted real source stores literal observed tricodes.
                    assert item["team_association"]["teams"] == sorted({r.team_id for r in rows})
                    assert item["team_association"]["observed_through"] == (
                        max(r.latest for r in rows).isoformat() if rows else None
                    )
                    checks.append(
                        {
                            "params": params,
                            "player_id": player,
                            "association": item["team_association"],
                        }
                    )
            unscoped = client.get("/api/workbench/lookup", params={"q": "doncic"}).json()["items"][
                0
            ]
            assert unscoped["team_association"]["basis"] == "last_observed"
            assert "Last observed" in unscoped["subtitle"]
            warm = []
            warm_sql = []

            def record_sql(_conn, _cursor, statement, _parameters, _context, _many):
                warm_sql.append(statement)

            event.listen(session.connection(), "before_cursor_execute", record_sql)
            for _ in range(20):
                started = time.perf_counter()
                assert client.get("/api/workbench/lookup", params=params).status_code == 200
                warm.append((time.perf_counter() - started) * 1000)
            assert not any("workbench_player_games" in sql for sql in warm_sql)
            event.remove(session.connection(), "before_cursor_execute", record_sql)
            invalid = client.get(
                "/api/workbench/lookup", params={"q": "doncic", "release_id": "missing-pf03"}
            )
            assert invalid.status_code == 404
        session.rollback()
    report = {
        "environment": "FastAPI TestClient + retained read-only PostgreSQL",
        "release_id": context.release_id,
        "dataset_id": context.dataset_id,
        "checks": checks,
        "unscoped": unscoped,
        "http_cold_or_scope_ms": timings,
        "http_warm_ms": warm,
        "http_warm_p95_ms": sorted(warm)[18],
        "warm_player_fact_queries": 0,
        "invalid_release_status": invalid.status_code,
    }
    Path("docs/evidence/pf03-branding/identity.json").write_text(
        json.dumps(report, indent=2) + "\n"
    )
    print(json.dumps({"verified_scopes": len(checks), "warm_p95_ms": report["http_warm_p95_ms"]}))


if __name__ == "__main__":
    main()
