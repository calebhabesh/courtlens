"""Repeatable API latency benchmarking harness for CourtLoad (M8)."""

from __future__ import annotations

import asyncio
import json
import statistics
import time
from typing import Any

import httpx

from courtload.api.app import create_app

ENDPOINTS = [
    ("Health Check", "GET", "/api/health"),
    ("Data Status", "GET", "/api/data-status"),
    ("Analytics Catalog", "GET", "/api/analytics/catalog"),
    ("Player Search", "GET", "/api/analytics/players?query=LeBron"),
    ("Player Profile (LeBron 2023-01-09)", "GET", "/api/analytics/players/2544?date=2023-01-09"),
    ("Player Game Log", "GET", "/api/analytics/players/2544/games?date=2023-01-09&limit=20"),
    (
        "Two-Player Comparison (LeBron vs Curry 2023-11-15)",
        "GET",
        "/api/analytics/compare?playerA=2544&playerB=201939&date=2023-11-15",
    ),
    ("Evaluation Report", "GET", "/api/analytics/evaluations"),
]


async def benchmark_endpoint(
    client: httpx.AsyncClient,
    name: str,
    method: str,
    path: str,
    *,
    samples: int = 50,
    concurrency: int = 5,
    warmup: int = 5,
) -> dict[str, Any]:
    # Warm-up phase
    for _ in range(warmup):
        resp = await client.request(method, path)
        if resp.status_code not in (200, 422):
            print(f"Warning: {name} warmup returned {resp.status_code}: {resp.text[:100]}")

    sem = asyncio.Semaphore(concurrency)
    latencies: list[float] = []
    errors = 0

    async def single_request() -> None:
        nonlocal errors
        async with sem:
            start = time.perf_counter()
            try:
                res = await client.request(method, path)
                elapsed_ms = (time.perf_counter() - start) * 1000.0
                if res.status_code == 200:
                    latencies.append(elapsed_ms)
                else:
                    errors += 1
            except Exception:
                errors += 1

    tasks = [asyncio.create_task(single_request()) for _ in range(samples)]
    await asyncio.gather(*tasks)

    latencies.sort()
    count = len(latencies)
    if not count:
        return {
            "name": name,
            "path": path,
            "samples": samples,
            "concurrency": concurrency,
            "errors": errors,
            "p50_ms": None,
            "p95_ms": None,
            "p99_ms": None,
            "min_ms": None,
            "max_ms": None,
            "mean_ms": None,
        }

    p50_idx = int(0.50 * count)
    p95_idx = min(int(0.95 * count), count - 1)
    p99_idx = min(int(0.99 * count), count - 1)

    return {
        "name": name,
        "path": path,
        "samples": samples,
        "concurrency": concurrency,
        "errors": errors,
        "min_ms": round(latencies[0], 2),
        "p50_ms": round(latencies[p50_idx], 2),
        "p95_ms": round(latencies[p95_idx], 2),
        "p99_ms": round(latencies[p99_idx], 2),
        "max_ms": round(latencies[-1], 2),
        "mean_ms": round(statistics.mean(latencies), 2),
    }


async def main() -> None:
    app = create_app()
    transport = httpx.ASGITransport(app=app)
    results = []

    print("Running CourtLoad API Latency Benchmark (M8)...")
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        for name, method, path in ENDPOINTS:
            res = await benchmark_endpoint(client, name, method, path, samples=100, concurrency=5)
            results.append(res)
            p50 = res["p50_ms"]
            p95 = res["p95_ms"]
            errs = res["errors"]
            print(f"{name:50s} | p50: {p50:6.2f} ms | p95: {p95:6.2f} ms | errors: {errs}")

    print("\nComplete Benchmark Results (JSON):")
    print(json.dumps(results, indent=2))


if __name__ == "__main__":
    asyncio.run(main())
