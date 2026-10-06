"""Bounded real-service HTTP measurements; no provider or persistent mutations."""

from __future__ import annotations

import json
import math
import time
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from urllib.request import urlopen

URL = (
    "http://127.0.0.1:8000/api/workbench/lookup?q=a&season=2024-25"
    "&phase=regular_season&before_date=2025-06-30&kinds=player&limit=20"
)


def request() -> dict:
    start = time.perf_counter()
    with urlopen(URL, timeout=10) as response:
        raw = response.read()
    payload = json.loads(raw)
    assert len(payload["items"]) <= 20
    assert len(raw) <= 25 * 1024, len(raw)
    return {
        "http_ms": (time.perf_counter() - start) * 1000,
        "service_ms": payload["latency_ms"],
        "bytes": len(raw),
        "rows": len(payload["items"]),
    }


def main() -> None:
    cold = request()
    measurements = []
    for concurrency in (1, 2, 4):
        with ThreadPoolExecutor(max_workers=concurrency) as pool:
            rows = list(pool.map(lambda _: request(), range(20)))
        ordered = sorted(row["http_ms"] for row in rows)
        measurements.append(
            {
                "clients": concurrency,
                "requests": rows,
                "http_p95_ms": ordered[math.ceil(len(ordered) * 0.95) - 1],
            }
        )
    report = {
        "environment": "loopback HTTP to existing FastAPI/PostgreSQL service",
        "first_query": cold,
        "warm": measurements,
        "note": (
            "First query is this exact key, not a process-cold server; "
            "concurrent read-only clients."
        ),
    }
    Path("docs/evidence/pf03-branding/lookup-budget.json").write_text(
        json.dumps(report, indent=2) + "\n"
    )
    print(json.dumps({"first_query": cold, "warm_p95": [r["http_p95_ms"] for r in measurements]}))


if __name__ == "__main__":
    main()
