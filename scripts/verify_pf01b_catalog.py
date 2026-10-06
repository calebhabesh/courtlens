"""Verify every observed Stats catalog default with real, read-only PostgreSQL HTTP."""

from __future__ import annotations

import json
import time
from pathlib import Path

from fastapi.testclient import TestClient
from sqlalchemy import text

from courtload.api.app import create_app
from courtload.database import SessionLocal, get_db


def main() -> None:
    report = []
    with SessionLocal() as session:
        session.execute(text("SET TRANSACTION READ ONLY"))
        app = create_app()
        app.dependency_overrides[get_db] = lambda: session
        with TestClient(app) as client:
            catalog_response = client.get("/api/workbench/catalog")
            assert catalog_response.status_code == 200
            catalog = catalog_response.json()
            for scope in catalog["stats_scopes"]:
                query = {
                    "release_id": catalog["release_id"],
                    "season": scope["season"],
                    "phase": scope["phase"],
                    "before_date": scope["default_before_date"],
                    "sort": [{"field": "pts_per_game", "direction": "desc"}],
                    "page": {"limit": 25},
                }
                started = time.perf_counter()
                response = client.post(
                    "/api/workbench/query", json={"query": query, "presentation": {}}
                )
                elapsed = time.perf_counter() - started
                assert response.status_code == 200, response.text
                data = response.json()
                assert data["total_eligible_players"] > 0
                assert data["total_output_players"] == data["total_eligible_players"]
                report.append(
                    {
                        "scope": scope,
                        "eligible": data["total_eligible_players"],
                        "output": data["total_output_players"],
                        "rows": len(data["items"]),
                        "seconds": elapsed,
                    }
                )
        session.rollback()
    destination = Path("docs/evidence/pf01b-dashboard/catalog-scopes.json")
    destination.write_text(json.dumps(report, indent=2) + "\n")
    print(json.dumps({"verified_scopes": len(report)}))


if __name__ == "__main__":
    main()
