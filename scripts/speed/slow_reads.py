#!/usr/bin/env python3
"""Time every read in the snapshot sample from the API's Server-Timing (speed plan SP04).

Run it against an API started with `COURTLENS_READ_CACHE=false`, so each request does the
read's full work. Each read in the `snapshot` section of urls.json is requested `--runs` times
in a row (default 5); the table gives the median of the handler's total time, its database time
and its query count, and the first run on its own (on a fresh API process that is the read's
cold cost: files loaded, memos empty).

    scripts/speed/slow_reads.py --api http://localhost:8180 --out <file.json>

Pins are taken from a saved snapshot (`--pins <snapshot.json>`) or from the API's catalog, as
snapshot.py does. Writes JSON and prints a Markdown table, slowest median first.
"""

from __future__ import annotations

import argparse
import json
import re
import statistics
import sys
import time
import urllib.error
import urllib.request
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))

from snapshot import current_pins, fill  # noqa: E402

TIMING = re.compile(r"(total|db);dur=([0-9.]+)")
QUERIES = re.compile(r'queries;desc="(\d+)"')


def timed(api: str, method: str, path: str, body: Any, timeout: float) -> dict[str, Any]:
    data = None if body is None else json.dumps(body).encode()
    headers = {"User-Agent": "courtlens-speed-slow-reads/1", "Accept-Encoding": "identity"}
    if data is not None:
        headers["Content-Type"] = "application/json"
    call = urllib.request.Request(api + path, data=data, headers=headers, method=method)
    started = time.perf_counter()
    try:
        with urllib.request.urlopen(call, timeout=timeout) as response:
            status, payload, server = response.status, response.read(), response.headers
    except urllib.error.HTTPError as error:
        status, payload, server = error.code, error.read(), error.headers
    elapsed = time.perf_counter() - started
    header = server.get("server-timing", "")
    durations = dict(TIMING.findall(header))
    queries = QUERIES.search(header)
    return {
        "status": status,
        "bytes": len(payload),
        "wall_ms": round(elapsed * 1000, 1),
        "total_ms": float(durations.get("total", "nan")),
        "db_ms": float(durations.get("db", "nan")),
        "queries": int(queries.group(1)) if queries else None,
        "x_cache": server.get("x-cache"),
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--api", required=True)
    parser.add_argument("--urls", type=Path, default=HERE / "urls.json")
    parser.add_argument("--pins", type=Path, help="reuse the pins of a saved snapshot")
    parser.add_argument("--runs", type=int, default=5)
    parser.add_argument("--only", help="comma-separated read names")
    parser.add_argument("--out", type=Path, required=True)
    parser.add_argument("--timeout", type=float, default=120)
    args = parser.parse_args()

    api = args.api.rstrip("/")
    entries = json.loads(args.urls.read_text())["snapshot"]
    if args.only:
        wanted = set(args.only.split(","))
        entries = [entry for entry in entries if entry["name"] in wanted]
    if args.pins:
        pins = json.loads(args.pins.read_text())["pins"]
    else:
        pins = current_pins(
            api,
            argparse.Namespace(
                release_id=None, season=None, before_date=None, timeout=args.timeout
            ),
        )
    rows = []
    for entry in entries:
        path, body = fill(entry["path"], pins), fill(entry.get("body"), pins)
        runs = [timed(api, entry["method"], path, body, args.timeout) for _ in range(args.runs)]
        if any(run["x_cache"] == "hit" for run in runs):
            raise SystemExit(
                f"{entry['name']}: served from the read cache; start the API "
                "with COURTLENS_READ_CACHE=false"
            )
        row = {
            "name": entry["name"],
            "method": entry["method"],
            "path": path,
            "status": runs[0]["status"],
            "first_total_ms": runs[0]["total_ms"],
            "median_total_ms": statistics.median(run["total_ms"] for run in runs),
            "median_db_ms": statistics.median(run["db_ms"] for run in runs),
            "queries": runs[-1]["queries"],
            "bytes": runs[-1]["bytes"],
            "runs": runs,
        }
        rows.append(row)
        print(f"{row['median_total_ms']:8.1f} ms  {entry['name']}", file=sys.stderr)
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(
        json.dumps(
            {
                "tool": "scripts/speed/slow_reads.py",
                "taken_at": datetime.now(UTC).isoformat(timespec="seconds"),
                "api": api,
                "pins": pins,
                "runs": args.runs,
                "reads": rows,
            },
            indent=2,
        )
        + "\n"
    )
    print("| Read | Median total | Median db | Queries | First run | Bytes |")
    print("| --- | --- | --- | --- | --- | --- |")
    for row in sorted(rows, key=lambda item: -item["median_total_ms"]):
        print(
            f"| {row['name']} | {row['median_total_ms']:.0f} ms | {row['median_db_ms']:.0f} ms | "
            f"{row['queries']} | {row['first_total_ms']:.0f} ms | {row['bytes']:,} |"
        )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
