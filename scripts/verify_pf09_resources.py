"""Bounded loopback measurements against production API, preserving raw samples."""

from __future__ import annotations

import json
import math
import subprocess
import time
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import httpx

API = "http://127.0.0.1:8191"
OUT = Path("docs/evidence/pf09-freeze-acceptance")


def request(path: str, body: dict | None = None) -> dict:
    started = time.perf_counter()
    with httpx.Client(timeout=50) as client:
        response = client.get(API + path) if body is None else client.post(API + path, json=body)
    payload = response.json()
    return {
        "ms": (time.perf_counter() - started) * 1000,
        "status": response.status_code,
        "bytes": len(response.content),
        "rows": len(payload.get("items", [])),
        "service_ms": payload.get("latency_ms"),
    }


def main() -> None:
    catalog = httpx.get(API + "/api/workbench/catalog").raise_for_status().json()
    query = {
        "query": {
            "release_id": catalog["release_id"],
            "season": catalog["default_season"],
            "phase": catalog["default_phase"],
            "before_date": catalog["default_before_date"],
            "sort": [{"field": "pts_per_game"}],
            "page": {"limit": 50},
        },
        "presentation": {},
    }
    scopes = [
        (
            "lookup",
            "/api/workbench/lookup?q=a&season=2024-25&phase=regular_season&before_date=2025-06-30&kinds=player&limit=20",
            None,
        ),
        ("catalog", "/api/workbench/catalog", None),
        ("query", "/api/workbench/query", query),
        ("history", "/api/workbench/assistant/v2/threads?limit=20", None),
    ]
    report = {
        "environment": (
            "Loopback HTTP, standalone FastAPI/PostgreSQL; includes HTTP client setup; "
            "co-resident checks/backup noted separately"
        ),
        "first": {},
        "warm": [],
    }
    for name, path, body in scopes:
        report["first"][name] = request(path, body)
        for concurrency in [1, 2, 4]:
            with ThreadPoolExecutor(max_workers=concurrency) as pool:
                samples = list(
                    pool.map(lambda _, path=path, body=body: request(path, body), range(20))
                )
            ordered = sorted(row["ms"] for row in samples)
            item = {
                "endpoint": name,
                "clients": concurrency,
                "samples": samples,
                "p95_ms": ordered[math.ceil(len(ordered) * 0.95) - 1],
                "errors": sum(row["status"] != 200 for row in samples),
            }
            if name == "lookup":
                service = sorted(row["service_ms"] for row in samples)
                item["service_p95_ms"] = service[math.ceil(len(service) * 0.95) - 1]
                item["bounds_pass"] = all(
                    row["bytes"] <= 25 * 1024 and row["rows"] <= 20 for row in samples
                )
                item["service_budget_pass"] = item["service_p95_ms"] <= 50
            report["warm"].append(item)
            (OUT / "resources.json").write_text(json.dumps(report, indent=2) + "\n")
            print(name, concurrency, item["p95_ms"], item["errors"], flush=True)
    report["process_sample"] = subprocess.check_output(
        ["ps", "-eo", "pid,comm,pcpu,rss,args"], text=True
    ).splitlines()
    report["process_sample"] = [
        row
        for row in report["process_sample"]
        if "8191" in row or "/tmp/courtload-pf09-real/server.js" in row
    ]
    (OUT / "resources.json").write_text(json.dumps(report, indent=2) + "\n")
    assert all(item["errors"] == 0 for item in report["warm"])
    assert all(
        item.get("bounds_pass", True) and item.get("service_budget_pass", True)
        for item in report["warm"]
    )


if __name__ == "__main__":
    main()
