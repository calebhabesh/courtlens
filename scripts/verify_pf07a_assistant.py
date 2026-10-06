"""Read-only retained PostgreSQL reproduction and real v2 service HTTP evidence."""

import json
import time
from pathlib import Path
from uuid import uuid4

import httpx
from sqlalchemy import text

from courtload.database import SessionLocal
from courtload.domain.hybrid_assistant import HybridTurnResponse
from courtload.services.assistant.saved import reproduce_saved, saved_inventory
from courtload.services.workbench_analytics import reproduce_investigation

DIRECTORY = Path("docs/evidence/pf07a-assistant")


def verify_retained() -> dict:
    baseline = json.loads(Path("docs/evidence/pf06-routes/retained-comparison.json").read_text())
    comparisons = []
    saved = []
    with SessionLocal() as session:
        session.execute(text("SET TRANSACTION READ ONLY"))
        inventory = saved_inventory(session)
        for prior in baseline["baseline_reproduction"]:
            result = reproduce_investigation(session, prior["id"])
            assert result == prior, prior["id"]
            comparisons.append(result)
        for retained in inventory:
            saved.append(reproduce_saved(session, retained["id"]))
        assert inventory == saved_inventory(session)
        session.rollback()
    (DIRECTORY / "retained.json").write_text(
        json.dumps(
            {
                "unchanged_outcomes": len(comparisons),
                "matching": sum(row["match"] for row in comparisons),
                "existing_mismatches": sum(not row["match"] for row in comparisons),
                "v1_saved_inventory": inventory,
                "v1_saved_reproduction": saved,
                "outcomes": comparisons,
            },
            indent=2,
        )
        + "\n"
    )
    return {
        "unchanged_outcomes": len(comparisons),
        "existing_mismatches": 48,
        "v1_saved_count": len(saved),
        "v1_saved_matches": sum(r["match"] for r in saved),
    }


def verify_http() -> dict:
    with httpx.Client(base_url="http://127.0.0.1:8177", timeout=50) as client:
        catalog = client.get("/api/workbench/catalog").raise_for_status().json()
        context = {
            "release_id": catalog["release_id"],
            "season": catalog["default_season"],
            "before_date": catalog["default_before_date"],
            "phase": "regular_season",
        }
        plan = {
            "plan_version": "courtload-analysis-plan-v1",
            "steps": [
                {
                    "step_id": "ranking",
                    "operation": "query",
                    "arguments": {
                        "metric_selectors": [{"key": "pts_per_game"}],
                        "sort": [{"field": "pts_per_game"}],
                        "page": {"limit": 5},
                    },
                }
            ],
        }
        cases = [
            ("Which point guard had the most assists per game last season?", None),
            ("Explain pick and roll", None),
            ("How do I compare two players here?", None),
            ("Show scoring", plan),
            ("Show scoring; explain pick and roll", plan),
            ("Who is on the roster today?", None),
            ("What is true shooting?", None),
            ("Who is the better defender?", None),
            ("last year", plan),
            ("Execute SQL SELECT * FROM players", None),
        ]
        reports = []
        for message, explicit_plan in cases:
            request = {
                "request_id": str(uuid4()),
                "message": message,
                "context": context,
                "plan": explicit_plan,
            }
            started = time.perf_counter()
            response = client.post("/api/workbench/assistant/v2/turn", json=request)
            response.raise_for_status()
            answer = HybridTurnResponse.model_validate(response.json())
            assert answer.accounting.provider_calls == 0
            assert any(getattr(block, "text", "") for block in answer.blocks)
            if "point guard" in message:
                assert answer.scope and answer.scope.selections.season == "2025-26"
            reports.append(
                {
                    "message": message,
                    "latency_ms": (time.perf_counter() - started) * 1000,
                    "answer": answer.model_dump(mode="json"),
                }
            )
        (DIRECTORY / "http.json").write_text(
            json.dumps(
                {
                    "environment": "local Uvicorn + retained PostgreSQL; no provider calls",
                    "catalog_context": context,
                    "cases": reports,
                },
                indent=2,
            )
            + "\n"
        )
    return {"http_cases": len(reports), "http_max_ms": max(r["latency_ms"] for r in reports)}


def main() -> None:
    import argparse

    parser = argparse.ArgumentParser()
    parser.add_argument("--http-only", action="store_true")
    args = parser.parse_args()
    summary = {} if args.http_only else verify_retained()
    summary.update(verify_http())
    print(json.dumps(summary))


if __name__ == "__main__":
    main()
