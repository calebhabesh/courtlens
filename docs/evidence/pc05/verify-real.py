"""Read-only PC05 verification against the local API and retained published database."""

from __future__ import annotations

import json
import time
from pathlib import Path

import httpx
from sqlalchemy import func, select

from courtlens.database import SessionLocal
from courtlens.player_context_models import PlayerContextDataset, PlayerContextVersion
from courtlens.warehouse_models import PublishedSnapshot
from courtlens.workbench_models import WorkbenchAcquisition

ROOT = Path(__file__).resolve().parent


def database_state() -> dict[str, object]:
    with SessionLocal() as session:
        pointers = [
            {
                "channel": row.channel,
                "snapshot_id": row.snapshot_id,
                "published_at": row.published_at.isoformat(),
            }
            for row in session.scalars(
                select(PublishedSnapshot).order_by(PublishedSnapshot.channel)
            )
        ]
        return {
            "pointers": pointers,
            "counts": {
                model.__tablename__: session.scalar(select(func.count()).select_from(model))
                for model in (PlayerContextDataset, PlayerContextVersion, WorkbenchAcquisition)
            },
        }


def main() -> None:
    info = json.loads((ROOT / "admission.json").read_text())
    dataset_id = info["dataset_id"]
    before = database_state()
    release = next(row["snapshot_id"] for row in before["pointers"] if row["channel"] == "public")
    cases = [
        ("catalog", "/api/workbench/player-context/catalog", {}),
        (
            "roster-all",
            "/api/workbench/player-context/rosters",
            {"datasetId": dataset_id, "statisticsReleaseId": release},
        ),
        (
            "roster-tor",
            "/api/workbench/player-context/rosters",
            {"datasetId": dataset_id, "teamId": "TOR", "statisticsReleaseId": release},
        ),
        ("index-page", f"/api/workbench/player-context/datasets/{dataset_id}", {"limit": 100}),
    ]
    measurements = []
    with httpx.Client(base_url="http://127.0.0.1:8101", timeout=60) as client:
        for name, path, params in cases:
            start = time.perf_counter()
            response = client.get(path, params=params)
            elapsed = time.perf_counter() - start
            response.raise_for_status()
            result = response.json()
            rows = result.get("players", result.get("rows", []))
            if name == "roster-all":
                assert len(rows) == 622 and len({row["team_id"] for row in rows}) == 30
                assert result["current_season_appearances_in_release"] == 0
                assert sum(row["reference"] is not None for row in rows) == 486
                assert all(
                    row["reference"] is None or row["reference"]["season"] == "2025-26"
                    for row in rows
                )
                assert all(
                    row["reference"] is None or len(row["reference"]["metrics"]) == 5
                    for row in rows
                )
            if name == "index-page":
                assert len(rows) == 100 and result["next_offset"] == 100
                assert "storage_path" not in response.text
            (ROOT / f"{name}.json").write_text(json.dumps(result, indent=2) + "\n")
            measurements.append(
                {
                    "name": name,
                    "http_status": response.status_code,
                    "milliseconds": round(elapsed * 1000, 1),
                    "bytes": len(response.content),
                    "rows": len(rows),
                    "with_reference": sum(row.get("reference") is not None for row in rows),
                }
            )
    after = database_state()
    assert before == after
    original = json.loads((ROOT / "pointers-before.json").read_text())
    assert sorted(original, key=lambda row: row["channel"]) == after["pointers"]
    (ROOT / "api-measurements.json").write_text(json.dumps(measurements, indent=2) + "\n")
    (ROOT / "read-only-check.json").write_text(
        json.dumps({"before": before, "after": after}, indent=2) + "\n"
    )
    print(json.dumps(measurements, indent=2))
    print("All retained pointers and ingestion counts unchanged by API reads.")


if __name__ == "__main__":
    main()
