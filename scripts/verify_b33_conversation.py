"""Read-only real HTTP/PostgreSQL canonical-plan acceptance; no provider/key calls.

Usage: .venv/bin/python scripts/verify_b33_conversation.py NEW_EVIDENCE_JSON
"""

import json
import subprocess
import sys
import time
from pathlib import Path
from uuid import uuid4

import httpx
from sqlalchemy.orm import Session
from verify_b31_live import integrity

from courtload.database import engine
from courtload.services.workbench_analytics import canonical_hash, resolve_workbench_context


def main():
    output = Path(sys.argv[1])
    if output.exists():
        raise ValueError("Refusing to overwrite retained evidence")
    before = integrity()
    with Session(engine) as session:
        context = resolve_workbench_context(session, requested_season="2024-25")
    pinned = {
        k: context.to_dict()[k] for k in ("release_id", "season", "phase", "before_date", "window")
    }
    records = []
    with Path("/tmp/b33-api.log").open("w") as log:
        api = subprocess.Popen(
            [
                ".venv/bin/uvicorn",
                "courtload.api.app:create_app",
                "--factory",
                "--host",
                "127.0.0.1",
                "--port",
                "8013",
            ],
            stdout=log,
            stderr=log,
        )
        try:
            with httpx.Client(base_url="http://127.0.0.1:8013", timeout=45) as client:
                for _ in range(100):
                    try:
                        if client.get("/api/health").status_code == 200:
                            break
                    except httpx.HTTPError:
                        pass
                    time.sleep(0.1)
                else:
                    raise RuntimeError("API did not become ready")
                plans = [
                    {
                        "steps": [
                            {"step_id": "shifts", "operation": "workload_shifts", "arguments": {}}
                        ]
                    },
                    {
                        "steps": [
                            {
                                "step_id": "peers",
                                "operation": "similarity",
                                "arguments": {"target_player_id": "1630567"},
                            }
                        ]
                    },
                    {
                        "steps": [
                            {
                                "step_id": "points",
                                "operation": "distribution",
                                "arguments": {"player_id": "1630567", "metric": "pts"},
                            },
                            {
                                "step_id": "minutes",
                                "operation": "distribution",
                                "arguments": {"player_id": "1630567", "metric": "min_per_game"},
                            },
                        ]
                    },
                    {
                        "steps": [
                            {
                                "step_id": "query",
                                "operation": "query",
                                "arguments": {
                                    "metric_selectors": [{"key": "pts_per_game"}],
                                    "page": {"limit": 10},
                                },
                            }
                        ]
                    },
                ]
                books = client.get("/api/workbench/operations/finance/books").json()
                if books:
                    book = client.get(
                        "/api/workbench/operations/finance/books/256f66b1-129d-4904-be30-7b946f6e92fc"
                    ).json()
                    plans.append(
                        {
                            "steps": [
                                {
                                    "step_id": "finance",
                                    "operation": "finance",
                                    "arguments": {
                                        "book_id": book["book_id"],
                                        "financial_season": "2025-26",
                                        "known_at": book["latest_observed_at"],
                                        "effective_on": "2025-02-12",
                                    },
                                }
                            ]
                        }
                    )
                plans.append(
                    {
                        "steps": [
                            {
                                "step_id": "comparison",
                                "operation": "compare",
                                "arguments": {"player_a": "1630567", "player_b": "1628369"},
                            }
                        ]
                    }
                )
                for plan in plans:
                    start = time.monotonic()
                    response = client.post(
                        "/api/workbench/assistant/turn",
                        json={
                            "message": "Explicit canonical manual plan",
                            "request_id": str(uuid4()),
                            "context": pinned,
                            "plan": plan,
                        },
                    )
                    assert response.status_code == 200, response.status_code
                    answer = response.json()
                    assert answer["status"] in ("answered", "no_data", "insufficient_sample"), (
                        answer["status"]
                    )
                    assert answer["accounting"]["provider_calls"] == 0
                    equivalent = []
                    for result in answer["results"]:
                        assert result["result_hash"] == canonical_hash(result["data"])
                        if result["operation"] == "finance":
                            manual = client.post(
                                "/api/workbench/operations/finance", json=result["arguments"]
                            )
                            assert manual.status_code == 200
                            assert manual.json() == result["data"]
                            equivalent.append("finance")
                        if result["open_url"] and result["open_url"].startswith("/api/"):
                            manual = client.get(result["open_url"])
                            assert manual.status_code == 200
                            assert manual.json() == result["data"]
                            equivalent.append(result["operation"])
                    records.append(
                        {
                            "response": answer,
                            "network_elapsed_ms": round((time.monotonic() - start) * 1000, 3),
                            "response_bytes": len(response.content),
                            "equivalent_manual_operations": equivalent,
                        }
                    )
                    if plan == plans[3]:
                        repeated = client.post(
                            "/api/workbench/assistant/turn",
                            json={
                                "message": "Repeat",
                                "request_id": str(uuid4()),
                                "conversation_id": answer["conversation_id"],
                                "context_fingerprint": answer["context_fingerprint"],
                                "plan": plan,
                            },
                        ).json()
                        assert (
                            repeated["accounting"]["cache_hits"] == 1
                            and repeated["accounting"]["tool_calls"] == 0
                        )
                        records.append(
                            {
                                "repeat_accounting": repeated["accounting"],
                                "manifest_unchanged": repeated["manifest"] == answer["manifest"],
                            }
                        )
                    clear = client.delete(
                        "/api/workbench/assistant/conversations/" + answer["conversation_id"]
                    )
                    assert clear.status_code == 200 and clear.json()["cleared"]
        finally:
            api.terminate()
            api.wait(timeout=10)
    after = integrity()
    assert before == after
    output.write_text(
        json.dumps(
            {
                "scope": (
                    "Real HTTP/PostgreSQL manual canonical execution. "
                    "No Gemini calls or language-understanding claims."
                ),
                "records": records,
                "publication_and_finance_integrity_unchanged": before == after,
            },
            indent=2,
        )
        + "\n"
    )


if __name__ == "__main__":
    main()
