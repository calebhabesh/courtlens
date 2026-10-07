"""Comprehensive release performance, storage, and latency benchmark harness (B37).

Measures:
1. Real-service API latencies (P50, P95, P99, min, max, mean) across 31 replica endpoints.
2. PostgreSQL storage footprint, relation sizes, and exact row counts across all 78 tables.
3. Process memory (RSS) and CPU usage for FastAPI (uvicorn) and PostgreSQL container.
4. On-disk storage growth across raw data, artifacts, cache, backups, and Next build.
5. System hardware specifications and environment metadata.
"""

from __future__ import annotations

import asyncio
import contextlib
import json
import os
import platform
import statistics
import subprocess
import time
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

import httpx
from sqlalchemy import text

from courtlens.database import SessionLocal

# Flagship replica endpoints spanning all core and expanded surfaces
RELEASE_ENDPOINTS: list[tuple[str, str, str, dict[str, Any] | None]] = [
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
    ("Entity Lookup ('Barnes')", "GET", "/api/workbench/lookup?q=Barnes", None),
    (
        "Canonical QuerySpec (Scoring Leaders)",
        "POST",
        "/api/workbench/query",
        {
            "query": {
                "entity_kind": "player",
                "window": {"kind": "season", "season": "2023-24"},
                "sort": [{"field": "pts", "descending": True}],
                "paging": {"limit": 25},
            }
        },
    ),
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
    (
        "Player Comparison (Barnes vs Barrett)",
        "GET",
        "/api/workbench/compare?playerA=1630567&playerB=1629628&season=2023-24",
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
        "Distribution Analysis (Barnes PTS 2023-24)",
        "GET",
        "/api/workbench/operations/distribution?playerId=1630567&season=2023-24&metric=pts",
        None,
    ),
    (
        "Contextual Splits (Barnes 2023-24)",
        "GET",
        "/api/workbench/operations/splits?playerId=1630567&season=2023-24",
        None,
    ),
    (
        "Opponent Defensive Allowance (Raptors 2023-24)",
        "GET",
        "/api/workbench/operations/opponent-context?teamId=1610612761&season=2023-24",
        None,
    ),
    (
        "Statistical Peer Similarity (Barnes 2023-24)",
        "GET",
        "/api/workbench/operations/similarity?playerId=1630567&season=2023-24",
        None,
    ),
    (
        "Rank Operation (PTS Leaders 2023-24)",
        "GET",
        "/api/workbench/operations/rank?season=2023-24&metric=pts",
        None,
    ),
    ("Physical Measurements ('Barnes')", "GET", "/api/workbench/measurements?query=Barnes", None),
    (
        "Identity Crosswalk (ESPN -> NBA)",
        "GET",
        "/api/workbench/crosswalk?sourceNamespace=espn&sourceId=4433134",
        None,
    ),
    ("Backfill Status", "GET", "/api/workbench/backfill/status", None),
    (
        "Shared Floor WOWY (Barnes On-Off 2023-24)",
        "POST",
        "/api/workbench/operations/wowy",
        {
            "team_id": "1610612761",
            "season": "2023-24",
            "together": ["1630567"],
        },
    ),
    (
        "Shooting Profile (Barnes 2023-24)",
        "POST",
        "/api/workbench/operations/shot-profile",
        {
            "player_id": "1630567",
            "season": "2023-24",
            "min_attempts": 10,
        },
    ),
    ("Finance Salary Books", "GET", "/api/workbench/operations/finance/books", None),
    (
        "Finance Replay Query",
        "POST",
        "/api/workbench/operations/finance",
        {
            "book_id": "256f66b1-129d-4904-be30-7b946f6e92fc",
            "financial_season": "2024-25",
            "known_at": "2026-10-04T00:00:00Z",
            "effective_on": "2024-10-01",
        },
    ),
    ("Live Games Status", "GET", "/api/live?slate_date=2024-04-14", None),
    ("Prospective Forecasts Ledger", "GET", "/api/workbench/forecasts?limit=25", None),
    ("Saved Investigations Hub", "GET", "/api/workbench/analyses", None),
    ("Assistant Operations Catalog", "GET", "/api/workbench/assistant/operations", None),
    ("Assistant Saved Investigations", "GET", "/api/workbench/assistant/investigations", None),
    (
        "Assistant Query (Offline Deterministic)",
        "POST",
        "/api/workbench/assistant/query",
        {
            "question": "Who are the best defenders on the Raptors?",
            "season": "2023-24",
        },
    ),
]


async def benchmark_endpoint(
    client: httpx.AsyncClient,
    name: str,
    method: str,
    path: str,
    json_body: dict[str, Any] | None = None,
    *,
    samples: int = 30,
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
                if res.status_code in (200, 201, 202):
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
            "method": method,
            "path": path,
            "samples": samples,
            "errors": errors,
            "min_ms": None,
            "p50_ms": None,
            "p95_ms": None,
            "p99_ms": None,
            "max_ms": None,
            "mean_ms": None,
        }

    p50_idx = int(0.50 * count)
    p95_idx = min(int(0.95 * count), count - 1)
    p99_idx = min(int(0.99 * count), count - 1)

    return {
        "name": name,
        "method": method,
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
    with contextlib.suppress(Exception):
        meminfo = Path("/proc/meminfo").read_text(encoding="utf-8")
        for line in meminfo.splitlines():
            if line.startswith("MemTotal:"):
                info["memory_total_kb"] = int(line.split()[1])
                info["memory_total_gb"] = round(info["memory_total_kb"] / (1024 * 1024), 2)
                break
    with contextlib.suppress(Exception):
        cpuinfo = Path("/proc/cpuinfo").read_text(encoding="utf-8")
        for line in cpuinfo.splitlines():
            if line.startswith("model name"):
                info["cpu_model"] = line.split(":", 1)[1].strip()
                break
    return info


def get_process_resource_stats() -> dict[str, Any]:
    stats: dict[str, Any] = {}
    # Uvicorn FastAPI process
    try:
        pids = (
            subprocess.check_output(["pgrep", "-f", "uvicorn.*courtlens"], text=True)
            .strip()
            .splitlines()
        )
        for pid_str in pids:
            pid = int(pid_str)
            status_file = Path(f"/proc/{pid}/status")
            if status_file.exists():
                info: dict[str, str] = {}
                for line in status_file.read_text(encoding="utf-8").splitlines():
                    if ":" in line:
                        k, v = line.split(":", 1)
                        info[k.strip()] = v.strip()
                if info.get("Name") == "uvicorn":
                    rss_kb = int(info.get("VmRSS", "0 kB").split()[0])
                    stats["uvicorn_api"] = {
                        "pid": pid,
                        "name": info.get("Name"),
                        "rss_mb": round(rss_kb / 1024, 2),
                        "threads": int(info.get("Threads", 1)),
                    }
                    break
    except Exception as e:
        stats["uvicorn_api"] = {"error": str(e)}

    # PostgreSQL container stats
    try:
        raw = subprocess.check_output(
            ["docker", "stats", "courtlens-db-1", "--no-stream", "--format", "{{json .}}"],
            text=True,
        ).strip()
        stats["postgres_container"] = json.loads(raw)
    except Exception as e:
        stats["postgres_container"] = {"error": str(e)}

    return stats


def get_database_storage_stats() -> dict[str, Any]:
    with SessionLocal() as s:
        # Total database cluster size
        try:
            db_size_bytes = (
                s.execute(text("SELECT pg_database_size(current_database())")).scalar() or 0
            )
        except Exception:
            db_size_bytes = 0

        # Query all public base tables
        q = text("""
            SELECT table_name,
                   pg_total_relation_size(quote_ident(table_name)) as size_bytes,
                   pg_relation_size(quote_ident(table_name)) as table_bytes,
                   pg_indexes_size(quote_ident(table_name)) as index_bytes
            FROM information_schema.tables
            WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
            ORDER BY size_bytes DESC
        """)
        rows = s.execute(q).fetchall()
        table_stats = []
        total_table_bytes = 0

        for tbl, sz, t_sz, i_sz in rows:
            total_table_bytes += sz
            with contextlib.suppress(Exception):
                count = s.execute(text(f"SELECT count(*) FROM {tbl}")).scalar() or 0
                table_stats.append(
                    {
                        "table": tbl,
                        "rows": count,
                        "total_bytes": sz,
                        "total_mb": round(sz / (1024 * 1024), 2),
                        "table_mb": round(t_sz / (1024 * 1024), 2),
                        "index_mb": round(i_sz / (1024 * 1024), 2),
                    }
                )

        return {
            "total_database_bytes": db_size_bytes,
            "total_database_mb": round(db_size_bytes / (1024 * 1024), 2),
            "table_count": len(table_stats),
            "total_tables_mb": round(total_table_bytes / (1024 * 1024), 2),
            "table_stats": table_stats,
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
                    with contextlib.suppress(OSError):
                        total += fp.stat().st_size
        return total

    raw_bytes = dir_size(Path("data/raw"))
    artifacts_bytes = dir_size(Path("data/artifacts"))
    cache_bytes = dir_size(Path("data/cache"))
    backups_bytes = dir_size(Path("data/backups"))
    next_bytes = dir_size(Path("dashboard/.next"))

    artifacts_path = Path("data/artifacts")
    artifacts_subdirs: dict[str, float] = {}
    if artifacts_path.exists():
        for sub in sorted(artifacts_path.iterdir()):
            if sub.is_dir():
                artifacts_subdirs[sub.name] = round(dir_size(sub) / (1024 * 1024), 2)

    total_on_disk = raw_bytes + artifacts_bytes + cache_bytes + backups_bytes

    return {
        "raw_data_mb": round(raw_bytes / (1024 * 1024), 2),
        "artifacts_mb": round(artifacts_bytes / (1024 * 1024), 2),
        "artifacts_breakdown_mb": artifacts_subdirs,
        "cache_mb": round(cache_bytes / (1024 * 1024), 2),
        "backups_mb": round(backups_bytes / (1024 * 1024), 2),
        "next_build_mb": round(next_bytes / (1024 * 1024), 2),
        "total_data_tree_mb": round(total_on_disk / (1024 * 1024), 2),
    }


async def run_benchmarks(base_url: str = "http://127.0.0.1:8000") -> dict[str, Any]:
    print("=" * 80)
    print("CourtLens B37 Release Performance, Storage, & Latency Benchmark Harness")
    print("=" * 80)

    print("\n1. Collecting system and hardware metadata...")
    hw = get_hardware_info()
    cpu_m = hw.get("cpu_model", "CPU")
    cpus = hw.get("logical_cpus")
    mem_g = hw.get("memory_total_gb", "N/A")
    print(f"   Hardware: {cpu_m} | {cpus} cores | {mem_g} GB RAM")

    print("\n2. Measuring running process resources (FastAPI & PostgreSQL)...")
    proc_stats = get_process_resource_stats()
    uvicorn = proc_stats.get("uvicorn_api", {})
    pg_c = proc_stats.get("postgres_container", {})
    uv_pid = uvicorn.get("pid")
    uv_rss = uvicorn.get("rss_mb")
    uv_th = uvicorn.get("threads")
    print(f"   FastAPI Uvicorn: PID {uv_pid} | RSS: {uv_rss} MB | Threads: {uv_th}")
    pg_mem = pg_c.get("MemUsage")
    pg_cpu = pg_c.get("CPUPerc")
    pg_net = pg_c.get("NetIO")
    print(f"   PostgreSQL Container: Mem: {pg_mem} | CPU: {pg_cpu} | Net I/O: {pg_net}")

    print("\n3. Measuring PostgreSQL storage footprint & relation row counts...")
    db_stats = get_database_storage_stats()
    db_mb = db_stats["total_database_mb"]
    n_tbls = db_stats["table_count"]
    print(f"   Total DB Size: {db_mb} MB across {n_tbls} relations")
    top_5 = db_stats["table_stats"][:5]
    for t in top_5:
        print(f"     - {t['table']:<32} : {t['rows']:>8} rows, {t['total_mb']:>8.2f} MB")

    print("\n4. Measuring on-disk filesystem footprint...")
    disk_stats = get_disk_storage_stats()
    rw_mb = disk_stats["raw_data_mb"]
    ar_mb = disk_stats["artifacts_mb"]
    bk_mb = disk_stats["backups_mb"]
    nx_mb = disk_stats["next_build_mb"]
    dt_mb = disk_stats["total_data_tree_mb"]
    print(f"   Raw Data: {rw_mb} MB | Artifacts: {ar_mb} MB | Backups: {bk_mb} MB")
    print(f"   Next.js Build: {nx_mb} MB | Total Data Tree: {dt_mb} MB")

    print(f"\n5. Running real-service API latency benchmarks against {base_url}...")
    print(f"   {len(RELEASE_ENDPOINTS)} endpoints | 30 samples/endpoint | C=4 | 3 warmups")
    print("-" * 80)

    api_results: list[dict[str, Any]] = []

    async with httpx.AsyncClient(base_url=base_url, timeout=30.0) as client:
        for name, method, path, json_body in RELEASE_ENDPOINTS:
            res = await benchmark_endpoint(
                client,
                name,
                method,
                path,
                json_body=json_body,
                samples=30,
                concurrency=4,
                warmup=3,
            )
            api_results.append(res)
            p50 = res["p50_ms"]
            p95 = res["p95_ms"]
            mean = res["mean_ms"]
            errs = res["errors"]
            p50_str = f"{p50:6.2f} ms" if p50 is not None else "   N/A  "
            p95_str = f"{p95:6.2f} ms" if p95 is not None else "   N/A  "
            mean_str = f"{mean:6.2f} ms" if mean is not None else "   N/A  "
            status_flag = "PASS" if errs == 0 else f"FAIL ({errs} errs)"
            print(
                f"  {name:<46} | P50: {p50_str} | P95: {p95_str} | "
                f"Mean: {mean_str} | [{status_flag}]"
            )

    print("-" * 80)

    total_samples = sum(r["samples"] for r in api_results)
    total_errors = sum(r["errors"] for r in api_results)
    mean_p50 = round(
        statistics.mean([r["p50_ms"] for r in api_results if r["p50_ms"] is not None]), 2
    )
    mean_p95 = round(
        statistics.mean([r["p95_ms"] for r in api_results if r["p95_ms"] is not None]), 2
    )
    print(f"Summary: {len(api_results)} endpoints ({total_samples} requests, {total_errors} errs)")
    print(f"Across all endpoints: Average P50 = {mean_p50} ms, Average P95 = {mean_p95} ms")

    report: dict[str, Any] = {
        "benchmark_block": "B37",
        "recorded_at": datetime.now(UTC).isoformat(),
        "base_url": base_url,
        "summary": {
            "total_endpoints": len(api_results),
            "total_requests": total_samples,
            "total_errors": total_errors,
            "average_p50_ms": mean_p50,
            "average_p95_ms": mean_p95,
        },
        "hardware": hw,
        "process_resources": proc_stats,
        "database_storage": db_stats,
        "disk_storage": disk_stats,
        "api_latencies": api_results,
    }

    return report


def main() -> None:
    report = asyncio.run(run_benchmarks())
    output_path = Path("docs/evidence/b37-release-benchmarks.json")
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(json.dumps(report, indent=2), encoding="utf-8")
    print(f"\n[OK] Benchmark evidence saved to {output_path}")


if __name__ == "__main__":
    main()
