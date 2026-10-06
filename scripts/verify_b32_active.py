"""Bounded real changing-game acceptance; preserves sources and releases owned leases.

Usage: .venv/bin/python scripts/verify_b32_active.py NEW_DIRECTORY \
    --frontend-root PATH_TO_PACKAGED_STANDALONE --games ESPN_ID ESPN_ID
Requires migrated PostgreSQL and packaged Next assets. No synthetic time or sources.
The 200-second browser window uses the ordinary shared poller and at most three boxes.
Final reconciliation/corrections and full three-box load are separate acceptance gates.
"""

import argparse
import hashlib
import json
import os
import platform
import subprocess
import sys
import time
from datetime import UTC, datetime
from itertools import pairwise
from pathlib import Path
from threading import Event, Thread

import httpx
from sqlalchemy import func, select, text
from sqlalchemy.orm import Session
from verify_b31_live import integrity

from courtload.config import get_settings
from courtload.database import engine
from courtload.domain.live import LIVE_PARSER_VERSION
from courtload.live_models import LiveContent, LiveFeed, LiveLease, LiveObservation
from courtload.services.live import poll_once, release
from courtload.services.live_provider import ESPNLiveProvider


def write(path, value):
    with path.open("x") as file:
        file.write(json.dumps(value, indent=2, default=str) + "\n")


def snapshot():
    with Session(engine) as session:
        feed = session.get(LiveFeed, "espn")
        return {
            "at": datetime.now(UTC).isoformat(),
            "requests": feed.requests if feed else 0,
            "bytes": feed.bytes_received if feed else 0,
            "status": feed.status if feed else None,
            "error": feed.error if feed else None,
            "contents": session.scalar(select(func.count()).select_from(LiveContent)),
            "observations": session.scalar(select(func.count()).select_from(LiveObservation)),
            "leases": session.scalar(select(func.count()).select_from(LiveLease)),
            "logical_bytes": session.scalar(
                text(
                    "SELECT COALESCE(sum(octet_length(raw_bytes) + "
                    "octet_length(normalized_json::text)),0) FROM live_contents"
                )
            ),
            "physical_bytes": dict(
                session.execute(
                    text(
                        "SELECT name, pg_total_relation_size(name::regclass) FROM "
                        "(VALUES ('live_contents'), ('live_observations'), ('live_leases'), "
                        "('live_feeds'), ('live_reconciliations')) AS tables(name)"
                    )
                ).all()
            ),
        }


def rss_kib():
    return next(
        int(line.split()[1])
        for line in Path("/proc/self/status").read_text().splitlines()
        if line.startswith("VmRSS:")
    )


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("output", type=Path)
    parser.add_argument("--frontend-root", required=True, type=Path)
    parser.add_argument("--games", required=True, nargs="+")
    args = parser.parse_args()
    if args.output.exists():
        raise ValueError("New evidence directory required; refusing overwrite")
    if not 1 <= len(args.games) <= 3 or len(set(args.games)) != len(args.games):
        raise ValueError("Select one to three distinct source game IDs")
    if any(not game.isdigit() or len(game) > 20 for game in args.games):
        raise ValueError("Numeric ESPN IDs required")
    root = args.frontend_root.resolve()
    if not (root / "server.js").is_file() or not (root / ".next/static").is_dir():
        raise ValueError("Packaged standalone server/static assets required")
    before = snapshot()
    if before["leases"]:
        raise RuntimeError("Acceptance requires no existing leases")
    protected = integrity()
    with Session(engine) as session:
        old_contents = {row.sha256 for row in session.scalars(select(LiveContent))}
    args.output.mkdir(parents=True)
    write(args.output / "before.json", before)
    env = {
        **os.environ,
        "COURTLOAD_LIVE_ENABLED": "true",
        "COURTLOAD_API_INTERNAL_URL": "http://127.0.0.1:8038",
        "COURTLOAD_OPERATOR_TOKEN": get_settings().operator_token.get_secret_value(),
        "PLAYWRIGHT_BASE_URL": "http://127.0.0.1:3142",
        "HOSTNAME": "127.0.0.1",
        "PORT": "3142",
        "B32_GAMES": ",".join(args.games),
    }
    stop = Event()
    ticks, fetches, errors, memory = [], [], [], []

    class MeasuredProvider(ESPNLiveProvider):
        def fetch(self, slate, game_id=None):
            started = time.monotonic()
            result = super().fetch(slate, game_id)
            fetches.append(
                {
                    "at": datetime.now(UTC).isoformat(),
                    "started_monotonic": started,
                    "duration_seconds": time.monotonic() - started,
                    "game_id": game_id,
                    "bytes": len(result.raw),
                    "raw_sha256": hashlib.sha256(result.raw).hexdigest(),
                    "http_date": result.http_date,
                    "source_time": result.source_time,
                }
            )
            return result

    def poll():
        provider = MeasuredProvider()
        while not stop.is_set():
            try:
                count = poll_once(engine, provider)
                ticks.append(count)
                memory.append(rss_kib())
                if count:
                    state = snapshot()
                    print(json.dumps({"poll_requests": count, "state": state}), flush=True)
                    if state["status"] != "observed":
                        raise RuntimeError("Provider cycle failed: " + str(state["error"]))
            except Exception as error:
                errors.append(type(error).__name__ + ": " + str(error))
                stop.set()
            stop.wait(5)

    servers = []
    thread = Thread(target=poll, daemon=True)
    started = baseline_cpu = baseline_rss = None
    try:
        with (
            (args.output / "api.log").open("x") as api_log,
            (args.output / "next.log").open("x") as next_log,
        ):
            servers.append(
                subprocess.Popen(
                    [
                        sys.executable,
                        "-m",
                        "uvicorn",
                        "courtload.api.app:create_app",
                        "--factory",
                        "--host",
                        "127.0.0.1",
                        "--port",
                        "8038",
                    ],
                    env=env,
                    stdout=api_log,
                    stderr=api_log,
                )
            )
            servers.append(
                subprocess.Popen(
                    ["node", "server.js"], cwd=root, env=env, stdout=next_log, stderr=next_log
                )
            )
            with httpx.Client(timeout=2) as client:
                for _ in range(100):
                    if any(server.poll() is not None for server in servers):
                        raise RuntimeError("Isolated acceptance server failed")
                    try:
                        if (
                            client.get(
                                "http://127.0.0.1:8038/api/live",
                                params={
                                    "slate_date": datetime.now(UTC).date().isoformat(),
                                },
                            ).status_code
                            == 200
                            and client.get("http://127.0.0.1:3142/live").status_code == 200
                        ):
                            break
                    except httpx.HTTPError:
                        pass
                    time.sleep(0.2)
                else:
                    raise RuntimeError("Acceptance servers not ready")
            baseline_rss, baseline_cpu, started = rss_kib(), time.process_time(), time.monotonic()
            thread.start()
            with (args.output / "browser.log").open("x") as browser_log:
                subprocess.run(
                    ["node", "scripts/verify_b32_active_browser.cjs", str(args.output / "browser")],
                    env=env,
                    stdout=browser_log,
                    stderr=browser_log,
                    check=True,
                    timeout=260,
                )
    finally:
        stop.set()
        if thread.is_alive():
            thread.join(timeout=15)
        leases = args.output / "browser/owned-leases.json"
        if leases.exists():
            with Session(engine) as session:
                for identifier in json.loads(leases.read_text()):
                    release(session, identifier)
        for server in servers:
            server.terminate()
            server.wait(timeout=15)
        write(args.output / "poller.json", {"ticks": ticks, "fetches": fetches, "errors": errors})
    assert not thread.is_alive() and not errors, errors
    wall, cpu = time.monotonic() - started, time.process_time() - baseline_cpu
    after = snapshot()
    assert after["leases"] == 0
    assert poll_once(engine, ESPNLiveProvider()) == 0
    assert integrity() == protected
    with Session(engine) as session:
        assert old_contents <= {row.sha256 for row in session.scalars(select(LiveContent))}
        observations = list(
            session.scalars(
                select(LiveObservation)
                .where(LiveObservation.acquired_at >= datetime.fromisoformat(before["at"]))
                .order_by(LiveObservation.acquired_at)
            )
        )
        records = []
        for observation in observations:
            content = session.get(LiveContent, observation.content_sha256)
            assert content.parser_version == LIVE_PARSER_VERSION
            expected = hashlib.sha256(
                content.raw_bytes
                + content.parser_version.encode()
                + json.dumps(content.normalized_json, sort_keys=True).encode()
            ).hexdigest()
            assert expected == content.sha256
            records.append(
                {
                    "id": observation.id,
                    "resource": observation.resource,
                    "acquired_at": observation.acquired_at,
                    "content_sha256": content.sha256,
                    "parser_version": content.parser_version,
                    "normalized": content.normalized_json,
                }
            )
    write(args.output / "observations.json", records)
    cycles = [count for count in ticks if count]
    assert 2 <= len(cycles) <= 4 and all(count <= 4 for count in cycles), cycles
    assert after["requests"] - before["requests"] == len(fetches) == sum(cycles)
    assert after["bytes"] - before["bytes"] == sum(fetch["bytes"] for fetch in fetches)
    boards = [fetch["started_monotonic"] for fetch in fetches if fetch["game_id"] is None]
    assert all(right - left >= 60 for left, right in pairwise(boards))
    cpu_percent = cpu / wall * 100
    incremental_rss = max([*memory, rss_kib()]) - baseline_rss
    assert cpu_percent <= 2 and incremental_rss <= 128 * 1024
    write(
        args.output / "verification.json",
        {
            "block": "B32a",
            "measured_at": datetime.now(UTC).isoformat(),
            "scope": "real preseason changing source, two selected boxes; no mocked responses",
            "hardware": {"platform": platform.platform(), "logical_cores": os.cpu_count()},
            "games": args.games,
            "before": before,
            "after": after,
            "cycles": cycles,
            "requests": len(fetches),
            "transferred_bytes": sum(fetch["bytes"] for fetch in fetches),
            "wall_seconds": wall,
            "harness_cpu_seconds": cpu,
            "one_core_cpu_percent": cpu_percent,
            "baseline_rss_kib": baseline_rss,
            "incremental_peak_sampled_rss_kib": incremental_rss,
            "idle_acquisitions": 0,
            "integrity_before": protected,
            "integrity_after": integrity(),
            "final_reconciliation": "not_yet_observed",
            "real_corrections": "not_yet_observed",
            "three_box_load": "not_measured" if len(args.games) < 3 else "measured",
            "full_replica_complete": False,
        },
    )
    print("B32 active observation acceptance passed", flush=True)


if __name__ == "__main__":
    main()
