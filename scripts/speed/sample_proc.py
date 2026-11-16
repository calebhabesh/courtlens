#!/usr/bin/env python3
"""Sample resident memory and CPU of processes from /proc (speed plan SP02).

Locally there is no `docker stats`; this reads `VmRSS` from /proc/<pid>/status and utime+stime from
/proc/<pid>/stat (all threads; children are added with --children) every `--interval` seconds until
the file named by `--stop-file` exists or `--seconds` pass. CPU is percent of one core over each
interval (200 = two cores busy). Writes JSON with every sample and each process's peak.

    scripts/speed/sample_proc.py --pid api=1234 --pid dashboard=5678 --out samples.json \
        --stop-file "$SCRATCH/stop"
"""

from __future__ import annotations

import argparse
import json
import os
import time
from pathlib import Path
from typing import Any

TICKS = os.sysconf("SC_CLK_TCK")


def children(pid: int) -> list[int]:
    found: list[int] = []
    for task in Path(f"/proc/{pid}/task").glob("*/children"):
        try:
            found += [int(child) for child in task.read_text().split()]
        except OSError:
            continue
    return found + [grand for child in found for grand in children(child)]


def rss_kib(pid: int) -> int:
    for line in Path(f"/proc/{pid}/status").read_text().splitlines():
        if line.startswith("VmRSS:"):
            return int(line.split()[1])
    return 0


def cpu_ticks(pid: int) -> int:
    fields = Path(f"/proc/{pid}/stat").read_text().rsplit(")", 1)[1].split()
    return int(fields[11]) + int(fields[12])  # utime, stime


def measure(pids: list[int]) -> tuple[int, int]:
    rss = ticks = 0
    for pid in pids:
        try:
            rss += rss_kib(pid)
            ticks += cpu_ticks(pid)
        except (OSError, IndexError, ValueError):
            continue
    return rss, ticks


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--pid", action="append", required=True, help="name=pid")
    parser.add_argument("--children", action="store_true", help="include child processes")
    parser.add_argument("--interval", type=float, default=0.5)
    parser.add_argument("--seconds", type=float, default=3600)
    parser.add_argument("--stop-file", type=Path)
    parser.add_argument("--out", type=Path, required=True)
    args = parser.parse_args()
    targets = {name: int(pid) for name, pid in (item.split("=", 1) for item in args.pid)}

    def group(pid: int) -> list[int]:
        return [pid, *children(pid)] if args.children else [pid]

    last = {name: measure(group(pid)) for name, pid in targets.items()}
    began = previous = time.monotonic()
    samples: list[dict[str, Any]] = []
    while time.monotonic() - began < args.seconds:
        if args.stop_file and args.stop_file.exists():
            break
        time.sleep(args.interval)
        now = time.monotonic()
        row: dict[str, Any] = {"t": round(now - began, 2)}
        for name, pid in targets.items():
            rss, ticks = measure(group(pid))
            cpu = (ticks - last[name][1]) / TICKS / (now - previous) * 100
            row[name] = {"rss_mb": round(rss / 1024, 1), "cpu_pct": round(cpu, 1)}
            last[name] = (rss, ticks)
        previous = now
        samples.append(row)
    peaks = {
        name: {
            "peak_rss_mb": max((s[name]["rss_mb"] for s in samples), default=None),
            "peak_cpu_pct": max((s[name]["cpu_pct"] for s in samples), default=None),
            "start_rss_mb": samples[0][name]["rss_mb"] if samples else None,
            "end_rss_mb": samples[-1][name]["rss_mb"] if samples else None,
        }
        for name in targets
    }
    out = {"interval": args.interval, "pids": targets, "peaks": peaks, "samples": samples}
    args.out.write_text(json.dumps(out, indent=1) + "\n")
    print(json.dumps(peaks))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
