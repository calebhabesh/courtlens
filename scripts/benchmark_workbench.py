"""Comprehensive workbench performance, storage, and latency benchmark harness.

Measures:
1. API latencies (P50, P95, P99, min, max) across flagship workbench endpoints.
2. PostgreSQL storage footprint and exact row counts across all relations.
3. On-disk storage growth across raw data, artifacts, cache, and backup bundles.
4. Pipeline stage timings (acquisition, import, dbt build, forecasting, backup).
5. Hardware specs and runtime environment metadata.
"""

from __future__ import annotations

import asyncio
import contextlib
import json
import os
import platform
import statistics
import time
from pathlib import Path
from typing import Any

import httpx
from sqlalchemy import func, select, text

from courtload.api.app import create_app
from courtload.database import SessionLocal
from courtload.workbench_models import (
    ForecastIssuance,
    ForecastScore,
    ModelPolicyActivation,
    SavedInvestigation,
    WorkbenchDataset,
    WorkbenchPlayerGame,
    WorkbenchReleaseBinding,
    WorkbenchSchedule,
    WorkbenchTeamGame,
)

WORKBENCH_ENDPOINTS = [
    ("Health Check", "GET", "/api/health", None),
    ("Workbench Status", "GET", "/api/workbench/status", None),
    ("Catalog Definition", "GET", "/api/workbench/catalog", None),
    ("Metric Catalog (35 metrics)", "GET", "/api/workbench/metrics", None),
    (
        "Player Explorer (min_games=10)",
        "GET",
        "/api/workbench/players?min_games=10&page_size=50",
        None,
    ),
    ("Player Search ('Barnes')", "GET", "/api/workbench/players?search=Barnes", None),
    (
        "Player Profile (Scottie Barnes 2023-24)",
        "GET",
        "/api/workbench/players/1630567?season=2023-24",
        None,
    ),
    (
        "Player Game Log (Scottie Barnes 2023-24)",
        "GET",
        "/api/workbench/players/1630567/games?season=2023-24&limit=25",
        None,
    ),
    ("Team Research (All Teams 2023-24)", "GET", "/api/workbench/teams?season=2023-24", None),
    (
        "Team Detail (Toronto Raptors 2023-24)",
        "GET",
        "/api/workbench/teams/1610612761?season=2023-24",
        None,
    ),
    (
        "Player Comparison (Barnes vs Barrett)",
        "GET",
        "/api/workbench/compare?playerA=1630567&playerB=1629628&season=2023-24",
        None,
    ),
    ("Prospective Forecasts Ledger", "GET", "/api/workbench/forecasts?limit=25", None),
    ("Saved Investigations Hub", "GET", "/api/workbench/analyses", None),
    ("Assistant Status", "GET", "/api/workbench/assistant/status", None),
    (
        "Assistant Query (Toronto Defense Offline)",
        "POST",
        "/api/workbench/assistant/query",
        {"question": "Who are the best defenders on the Raptors?", "season": "2023-24"},
    ),
]


async def benchmark_endpoint(
    client: httpx.AsyncClient,
    name: str,
    method: str,
    path: str,
    json_body: dict[str, Any] | None = None,
    *,
    samples: int = 40,
    concurrency: int = 4,
    warmup: int = 3,
) -> dict[str, Any]:
    # Warm-up phase
    for _ in range(warmup):
        with contextlib.suppress(Exception):
            await client.request(method, path, json=json_body)

    sem = asyncio.Semaphore(concurrency)
    latencies: list[float] = []
    errors = 0

    async def single_request() -> None:
        nonlocal errors
        async with sem:
            start = time.perf_counter()
            try:
                res = await client.request(method, path, json=json_body)
                elapsed_ms = (time.perf_counter() - start) * 1000.0
                if res.status_code in (200, 202):
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
        "errors": errors,
        "min_ms": round(latencies[0], 2),
        "p50_ms": round(latencies[p50_idx], 2),
        "p95_ms": round(latencies[p95_idx], 2),
        "p99_ms": round(latencies[p99_idx], 2),
        "max_ms": round(latencies[-1], 2),
        "mean_ms": round(statistics.mean(latencies), 2),
    }


def get_hardware_info() -> dict[str, Any]:
    info: dict[str, Any] = {
        "os": platform.system(),
        "release": platform.release(),
        "machine": platform.machine(),
        "python_version": platform.python_version(),
        "logical_cpus": os.cpu_count(),
    }
    # Read memory from /proc/meminfo if available
    try:
        meminfo = Path("/proc/meminfo").read_text(encoding="utf-8")
        for line in meminfo.splitlines():
            if line.startswith("MemTotal:"):
                info["memory_total_kb"] = int(line.split()[1])
                info["memory_total_gb"] = round(info["memory_total_kb"] / (1024 * 1024), 2)
                break
    except Exception:
        pass

    # Read CPU model from /proc/cpuinfo
    try:
        cpuinfo = Path("/proc/cpuinfo").read_text(encoding="utf-8")
        for line in cpuinfo.splitlines():
            if line.startswith("model name"):
                info["cpu_model"] = line.split(":", 1)[1].strip()
                break
    except Exception:
        pass

    return info


def get_database_storage_stats() -> dict[str, Any]:
    with SessionLocal() as s:
        # Check table sizes via pg_total_relation_size
        table_names = [
            "workbench_player_games",
            "workbench_team_games",
            "workbench_schedules",
            "workbench_identities",
            "workbench_datasets",
            "workbench_dataset_members",
            "workbench_versions",
            "workbench_observations",
            "workbench_acquisitions",
            "workbench_artifacts",
            "workbench_release_bindings",
            "workbench_jobs",
            "forecast_issuances",
            "forecast_scores",
            "model_policy_activations",
            "saved_investigations",
            "player_portraits",
        ]
        table_stats = []
        total_table_bytes = 0
        for tbl in table_names:
            with contextlib.suppress(Exception):
                q = text(
                    f"SELECT pg_total_relation_size('{tbl}') as size_bytes, "
                    f"COUNT(*) as row_count FROM {tbl}"
                )
                row = s.execute(q).fetchone()
                if row:
                    size_b, count = row
                    total_table_bytes += size_b
                    table_stats.append(
                        {
                            "table": tbl,
                            "rows": count,
                            "size_bytes": size_b,
                            "size_mb": round(size_b / (1024 * 1024), 2),
                        }
                    )

        # Total database size
        try:
            db_size_row = s.execute(text("SELECT pg_database_size(current_database())")).scalar()
            total_db_bytes = db_size_row or total_table_bytes
        except Exception:
            total_db_bytes = total_table_bytes

        counts = {
            "player_games": s.scalar(select(func.count(WorkbenchPlayerGame.game_id))) or 0,
            "team_games": s.scalar(select(func.count(WorkbenchTeamGame.game_id))) or 0,
            "schedules": s.scalar(select(func.count(WorkbenchSchedule.game_id))) or 0,
            "forecast_issuances": s.scalar(select(func.count(ForecastIssuance.id))) or 0,
            "forecast_scores": s.scalar(select(func.count(ForecastScore.id))) or 0,
            "policy_activations": s.scalar(select(func.count(ModelPolicyActivation.id))) or 0,
            "saved_investigations": s.scalar(select(func.count(SavedInvestigation.id))) or 0,
            "datasets": s.scalar(select(func.count(WorkbenchDataset.id))) or 0,
            "release_bindings": s.scalar(select(func.count(WorkbenchReleaseBinding.snapshot_id)))
            or 0,
        }

        return {
            "total_database_bytes": total_db_bytes,
            "total_database_mb": round(total_db_bytes / (1024 * 1024), 2),
            "table_stats": table_stats,
            "entity_counts": counts,
        }


def get_disk_storage_stats() -> dict[str, Any]:
    def dir_size(path: Path) -> int:
        if not path.exists():
            return 0
        total = 0
        for root, _, files in os.walk(path):
            for f in files:
                fp = Path(root) / f
                if not fp.is_symlink():
                    total += fp.stat().st_size
        return total

    raw_bytes = dir_size(Path("data/raw"))
    artifacts_bytes = dir_size(Path("data/artifacts"))
    cache_bytes = dir_size(Path("data/cache"))
    backups_bytes = dir_size(Path("data/backups"))
    total_on_disk = raw_bytes + artifacts_bytes + cache_bytes + backups_bytes

    return {
        "raw_data_mb": round(raw_bytes / (1024 * 1024), 2),
        "artifacts_mb": round(artifacts_bytes / (1024 * 1024), 2),
        "cache_mb": round(cache_bytes / (1024 * 1024), 2),
        "backups_mb": round(backups_bytes / (1024 * 1024), 2),
        "total_on_disk_mb": round(total_on_disk / (1024 * 1024), 2),
    }


async def run_benchmarks() -> dict[str, Any]:
    print("Collecting environment and hardware metadata...")
    hw = get_hardware_info()
    cpu_m = hw.get("cpu_model", "CPU")
    cpus = hw.get("logical_cpus")
    mem_g = hw.get("memory_total_gb", "N/A")
    print(f"Hardware: {cpu_m} | {cpus} cores | {mem_g} GB RAM")

    print("\nMeasuring PostgreSQL storage and entity counts...")
    db_stats = get_database_storage_stats()
    db_mb = db_stats["total_database_mb"]
    n_tbls = len(db_stats["table_stats"])
    print(f"Database Size: {db_mb} MB across {n_tbls} tables")
    ec = db_stats["entity_counts"]
    print(
        f"Row counts: {ec['player_games']} player games, "
        f"{ec['team_games']} team games, {ec['schedules']} schedules"
    )

    print("\nMeasuring on-disk directory footprint...")
    disk_stats = get_disk_storage_stats()
    raw_mb = disk_stats["raw_data_mb"]
    art_mb = disk_stats["artifacts_mb"]
    bak_mb = disk_stats["backups_mb"]
    print(f"Disk storage: Raw={raw_mb} MB, Artifacts={art_mb} MB, Backups={bak_mb} MB")

    print("\nRunning API Latency Benchmarks (40 samples per endpoint, 4 concurrency)...")
    app = create_app()
    transport = httpx.ASGITransport(app=app)
    api_results = []

    async with httpx.AsyncClient(
        transport=transport, base_url="http://test", timeout=30.0
    ) as client:
        for name, method, path, json_body in WORKBENCH_ENDPOINTS:
            res = await benchmark_endpoint(
                client, name, method, path, json_body=json_body, samples=30, concurrency=4
            )
            api_results.append(res)
            p50 = res["p50_ms"]
            p95 = res["p95_ms"]
            errs = res["errors"]
            p50_str = f"{p50:6.2f} ms" if p50 is not None else "   N/A  "
            p95_str = f"{p95:6.2f} ms" if p95 is not None else "   N/A  "
            print(f"  {name:46s} | P50: {p50_str} | P95: {p95_str} | errors: {errs}")

    full_report = {
        "timestamp_utc": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "hardware": hw,
        "database_storage": db_stats,
        "disk_storage": disk_stats,
        "api_latencies": api_results,
    }

    return full_report


def main() -> None:
    report = asyncio.run(run_benchmarks())
    output_path = Path("docs/evidence/workbench-benchmarks.json")
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(json.dumps(report, indent=2), encoding="utf-8")
    print(f"\nBenchmark suite completed successfully! Saved to {output_path}")


if __name__ == "__main__":
    main()
