"""Bounded opt-in real-source/HTTP smoke. Retains observations; releases only its own demand.

Usage: .venv/bin/python scripts/verify_b31_live.py NEW_EVIDENCE_PATH
Requires migrated local PostgreSQL. Makes at most two real scoreboard acquisitions in 65 seconds.
"""

import hashlib
import json
import os
import platform
import resource
import subprocess
import sys
import time
from datetime import UTC, datetime
from pathlib import Path
from zoneinfo import ZoneInfo

import httpx
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from courtlens.config import get_settings
from courtlens.database import engine
from courtlens.live_models import LiveContent, LiveObservation
from courtlens.services.live import poll_once
from courtlens.services.live_provider import ESPNLiveProvider
from courtlens.warehouse_models import PublishedSnapshot


def integrity():
    with engine.connect() as conn:
        from sqlalchemy import text

        pointer = conn.execute(
            select(PublishedSnapshot.channel, PublishedSnapshot.snapshot_id).order_by(
                PublishedSnapshot.channel
            )
        ).all()
        books = conn.execute(
            text("SELECT id, content_sha256 FROM finance_releases ORDER BY id")
        ).all()
        return {
            "public_snapshot": next(
                (r.snapshot_id for r in pointer if r.channel == "public"), None
            ),
            "pointer_count": len(pointer),
            "pointers_sha256": hashlib.sha256(
                json.dumps([list(r) for r in pointer]).encode()
            ).hexdigest(),
            "books": [list(r) for r in books],
        }


def main():
    output = Path(sys.argv[1])
    if output.exists():
        raise ValueError("New evidence path required; refusing overwrite")
    before = integrity()
    settings = get_settings()
    port = 8011
    base = f"http://127.0.0.1:{port}"
    env = {**os.environ, "COURTLENS_LIVE_ENABLED": "true"}
    with Path("/tmp/b31-smoke-server.log").open("w") as logs:
        server = subprocess.Popen(
            [
                str(Path(".venv/bin/uvicorn")),
                "courtlens.api.app:create_app",
                "--factory",
                "--host",
                "127.0.0.1",
                "--port",
                str(port),
            ],
            env=env,
            stdout=logs,
            stderr=logs,
        )
        leases = []
        slate = datetime.now(ZoneInfo("America/New_York")).date().isoformat()
        headers = {"X-Operator-Token": settings.operator_token.get_secret_value()}
        result = {}
        try:
            with httpx.Client(base_url=base, timeout=10) as client:
                for _ in range(100):
                    if server.poll() is not None:
                        raise RuntimeError("Smoke server failed; inspect local /tmp log")
                    try:
                        response = client.get("/api/live", params={"slate_date": slate})
                        if response.status_code == 200:
                            break
                    except httpx.HTTPError:
                        pass
                    time.sleep(0.1)
                else:
                    raise RuntimeError("Smoke server not ready")
                initial = response.json()
                for _ in range(12):
                    lease = client.post(
                        "/api/live/subscriptions", headers=headers, json={"slate_date": slate}
                    )
                    lease.raise_for_status()
                    leases.append(lease.json()["id"])
                provider = ESPNLiveProvider()
                baseline_cpu = time.process_time()
                baseline_rss = resource.getrusage(resource.RUSAGE_SELF).ru_maxrss
                started = time.monotonic()
                calls = 0
                ticks = 0
                while time.monotonic() - started < 65:
                    calls += poll_once(engine, provider)
                    ticks += 1
                    time.sleep(min(5, max(0, 65 - (time.monotonic() - started))))
                wall = time.monotonic() - started
                poller_cpu = time.process_time() - baseline_cpu
                incremental_rss = resource.getrusage(resource.RUSAGE_SELF).ru_maxrss - baseline_rss
                latencies = []
                for _ in range(200):
                    at = time.monotonic()
                    response = client.get("/api/live", params={"slate_date": slate})
                    response.raise_for_status()
                    latencies.append((time.monotonic() - at) * 1000)
                final = response.json()
                assert final["data"] is not None, final
                assert final["active_leases"] == 12, final
                assert calls <= 2, calls
                for lease_id in leases:
                    response = client.delete(f"/api/live/subscriptions/{lease_id}", headers=headers)
                    response.raise_for_status()
                leases.clear()
                assert poll_once(engine, provider) == 0
                response = client.get("/api/live", params={"slate_date": slate})
                response.raise_for_status()
                assert response.json()["paused"]
                p95 = sorted(latencies)[189]
                assert p95 <= 100, p95
                assert poller_cpu / wall * 100 <= 2
                assert incremental_rss <= 128 * 1024
                with Session(engine) as session:
                    stored_bytes = (
                        session.scalar(select(func.sum(func.length(LiveContent.raw_bytes)))) or 0
                    )
                    observations = session.scalar(select(func.count()).select_from(LiveObservation))
                result = {
                    "measured_at": datetime.now(UTC).isoformat(),
                    "scope": (
                        "real ESPN scheduled observations; "
                        "uvicorn/FastAPI/PostgreSQL HTTP cache; 12 leases; no browser UI"
                    ),
                    "hardware": {
                        "platform": platform.platform(),
                        "cpu": platform.processor(),
                        "logical_cores": os.cpu_count(),
                    },
                    "wall_seconds": wall,
                    "poller_ticks": ticks,
                    "upstream_requests": calls,
                    "feed_requests_before": initial["requests"],
                    "feed_requests_after": final["requests"],
                    "bytes_this_probe": final["bytes_received"] - initial["bytes_received"],
                    "observation_id": final["observation_id"],
                    "content_sha256": final["content_sha256"],
                    "source_states": [g["status"] for g in final["data"]["games"]],
                    "source_time": final["source_time"],
                    "http_date": final["http_date"],
                    "cache_http_p95_ms": p95,
                    "cache_reads": len(latencies),
                    "poller_cpu_seconds": poller_cpu,
                    "mean_one_core_cpu_percent": poller_cpu / wall * 100,
                    "incremental_peak_rss_kib": incremental_rss,
                    "retained_raw_bytes": stored_bytes,
                    "retained_observations": observations,
                    "idle_acquisitions": 0,
                    "in_game_freshness": "not_yet_observed",
                    "final_reconciliation": "simulation_only",
                    "estimated_hourly_traffic_from_sample_bytes": (
                        final["bytes_received"] - initial["bytes_received"]
                    )
                    / calls
                    * 60
                    if calls
                    else None,
                    "integrity_before": before,
                    "integrity_after": integrity(),
                }
                assert result["integrity_after"] == before
                output.write_text(json.dumps(result, indent=2) + "\n")
                print(json.dumps(result, indent=2))
        finally:
            if leases:
                with httpx.Client(base_url=base, timeout=5) as client:
                    for lease_id in leases:
                        client.delete(f"/api/live/subscriptions/{lease_id}", headers=headers)
            server.terminate()
            server.wait(timeout=10)


if __name__ == "__main__":
    main()
