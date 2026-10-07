"""B35a explicit save/restart/reproduce/export acceptance against real local services.

Usage: .venv/bin/python scripts/verify_b35_saved.py NEW_EVIDENCE_JSON --save
Creates retained investigations deliberately; never deletes their records or source evidence.
"""

import csv
import io
import json
import os
import subprocess
import sys
import time
from hashlib import sha256
from pathlib import Path
from uuid import uuid4

import httpx
from sqlalchemy.orm import Session
from verify_b31_live import integrity

from courtlens.database import engine
from courtlens.services.assistant.saved import saved_inventory
from courtlens.services.workbench_analytics import canonical_hash, resolve_workbench_context


def main():
    if len(sys.argv) != 3 or sys.argv[2] != "--save":
        raise ValueError("Explicit --save opt-in and a new evidence path required")
    output = Path(sys.argv[1])
    if output.exists():
        raise ValueError("Refusing to overwrite retained evidence")
    before = integrity()
    with Session(engine) as session:
        context = resolve_workbench_context(session, requested_season="2024-25")
        inventory_before = saved_inventory(session)
    pinned = {
        k: context.to_dict()[k] for k in ("release_id", "season", "phase", "before_date", "window")
    }
    api = None
    records = []
    with Path("/tmp/b35a-api.log").open("w") as log:

        def start():
            process = subprocess.Popen(
                [
                    ".venv/bin/uvicorn",
                    "courtlens.api.app:create_app",
                    "--factory",
                    "--host",
                    "127.0.0.1",
                    "--port",
                    "8035",
                ],
                env={**os.environ, "COURTLENS_GEMINI_API_KEY": ""},
                stdout=log,
                stderr=log,
            )
            for _ in range(100):
                try:
                    if httpx.get("http://127.0.0.1:8035/api/health").status_code == 200:
                        return process
                except httpx.HTTPError:
                    pass
                time.sleep(0.1)
            process.terminate()
            process.wait(timeout=10)
            raise RuntimeError("API startup failed")

        try:
            api = start()
            with httpx.Client(base_url="http://127.0.0.1:8035", timeout=60) as client:
                plans = [
                    (
                        "query",
                        {"page": {"limit": 10}, "metric_selectors": [{"key": "pts_per_game"}]},
                    ),
                    ("definition", {"metric": "ts_pct"}),
                    ("profile", {"player_id": "1630567"}),
                    ("compare", {"player_a": "1630567", "player_b": "1628369"}),
                    ("team", {"team_id": "1610612761"}),
                    ("forecast", {"player_id": "1630567"}),
                    ("distribution", {"player_id": "1630567", "metric": "pts"}),
                    (
                        "compare_periods",
                        {"player_id": "1630567", "metrics": ["pts_per_game", "min_per_game"]},
                    ),
                    ("splits", {"player_id": "1630567", "split_type": "venue"}),
                    ("similarity", {"target_player_id": "1630567"}),
                    ("workload_shifts", {}),
                ]
                books = client.get("/api/workbench/operations/finance/books").json()
                if not books:
                    raise RuntimeError(
                        "Retained finance book required for complete registry verification"
                    )
                # A retained explicit book; no acquisition/import/correction occurs here.
                book = client.get(
                    "/api/workbench/operations/finance/books/" + books[0]["book_id"]
                ).json()
                plans.append(
                    (
                        "finance",
                        {
                            "book_id": book["book_id"],
                            "financial_season": "2025-26",
                            "known_at": book["latest_observed_at"],
                            "effective_on": "2025-02-12",
                        },
                    )
                )
                for operation, args in plans:
                    tick = time.monotonic()
                    turn = client.post(
                        "/api/workbench/assistant/turn",
                        json={
                            "request_id": str(uuid4()),
                            "message": "B35a explicit manual verification",
                            "context": pinned,
                            "plan": {
                                "steps": [
                                    {"step_id": "a", "operation": operation, "arguments": args}
                                ]
                            },
                        },
                    )
                    assert turn.status_code == 200, turn.text
                    answer = turn.json()
                    assert answer["manifest"] and answer["accounting"]["provider_calls"] == 0, (
                        answer["status"]
                    )
                    payload = {
                        "request_id": str(uuid4()),
                        "conversation_id": answer["conversation_id"],
                        "turn_id": answer["turn_id"],
                        "context_fingerprint": answer["context_fingerprint"],
                        "title": "B35a verification: " + operation,
                    }
                    response = client.post("/api/workbench/assistant/investigations", json=payload)
                    assert response.status_code == 201, response.text
                    retained = response.json()
                    assert canonical_hash(retained["manifest"]) == retained["manifest_sha256"]
                    assert retained["metadata"] == {"question_saved": False, "question": None}
                    for result in retained["manifest"]["results"]:
                        assert canonical_hash(result["data"]) == result["result_hash"]
                        if operation == "query":
                            assert len(result["rows"]) == result["eligible_count"] > 100
                        else:
                            assert result["result_hash"] == answer["results"][0]["result_hash"]
                    assert client.delete(
                        "/api/workbench/assistant/conversations/" + answer["conversation_id"]
                    ).json()["cleared"]
                    records.append(
                        {
                            "operation": operation,
                            "id": retained["id"],
                            "manifest_sha256": retained["manifest_sha256"],
                            "arguments": retained["manifest"]["plan"]["steps"][0]["arguments"],
                            "result_hash": retained["manifest"]["results"][0]["result_hash"],
                            "rows": len(retained["manifest"]["results"][0]["rows"]),
                            "evidence_cells": len(retained["manifest"]["results"][0]["evidence"]),
                            "open_url": retained["manifest"]["results"][0]["open_url"],
                            "execute_and_save_ms": round((time.monotonic() - tick) * 1000, 3),
                            "request": payload,
                        }
                    )
                api.terminate()
                api.wait(timeout=10)
                api = start()
                for record in records:
                    base = "/api/workbench/assistant/investigations/" + record["id"]
                    tick = time.monotonic()
                    report = client.get(base + "/reproduce").json()
                    assert report["match"] and report["provider_calls"] == 0, report
                    record["reproduction"] = report
                    record["reproduce_ms"] = round((time.monotonic() - tick) * 1000, 3)
                    # Retry survives process restart without retaining active conversations.
                    retried = client.post(
                        "/api/workbench/assistant/investigations", json=record.pop("request")
                    )
                    assert retried.status_code == 201 and retried.json()["id"] == record["id"]
                    saved = client.get(base).json()
                    exports = {}
                    for fmt in ("json", "csv"):
                        exported = client.get(base + "/export?format=" + fmt)
                        assert (
                            exported.status_code == 200
                            and exported.headers["cache-control"] == "no-store"
                        )
                        if fmt == "json":
                            assert exported.json() == saved
                        else:
                            rows = list(csv.reader(io.StringIO(exported.text)))
                            parts = [
                                json.loads(row[2]) for row in rows if row[0] == "manifest_json_part"
                            ]
                            assert json.loads("".join(parts)) == saved["manifest"]
                        exports[fmt] = {
                            "bytes": len(exported.content),
                            "sha256": sha256(exported.content).hexdigest(),
                        }
                    record["exports"] = exports
            after = integrity()
            assert before == after, "Publication/finance input integrity changed"
            with Session(engine) as session:
                inventory_after = saved_inventory(session)
            assert len(inventory_after) - len(inventory_before) == len(records)
            output.write_text(
                json.dumps(
                    {
                        "block": "B35a",
                        "context": context.to_dict(),
                        "workflows": records,
                        "provider_calls": 0,
                        "process_restart_verified": True,
                        "integrity_before": before,
                        "integrity_after": after,
                        "retained_before": inventory_before,
                        "retained_after": inventory_after,
                        "limits": [
                            "Backend-only acceptance; "
                            "B35b UI/content/installability remain pending.",
                            "Forecast absence is not successful prospective issuance or accuracy.",
                        ],
                    },
                    indent=2,
                )
                + "\n"
            )
        finally:
            if api and api.poll() is None:
                api.terminate()
                api.wait(timeout=10)


if __name__ == "__main__":
    main()
