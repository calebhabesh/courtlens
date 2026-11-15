#!/usr/bin/env python3
"""Save, then compare, the API reads behind the speed set (speed plan SP00).

Speed never changes a number: before a block that touches an API read or a page's data flow,
save a snapshot; after it, compare. Any difference is a defect in the block.

    scripts/speed/snapshot.py --api http://localhost:8180 --out "$TMPDIR/before.json"
    scripts/speed/snapshot.py --api http://localhost:8180 --compare "$TMPDIR/before.json"

The sample is the `snapshot` section of urls.json: every read the pages in the set make,
including the `/api/workbench/query` POSTs. A new snapshot pins `{releaseId}`, `{season}` and
`{beforeDate}` to the API's current release and default scope (or `--release-id`,
`--season`, `--before-date`) and stores them; `--compare` reuses the stored pins, so a data
refresh between the two runs cannot cause a difference. Each read carries the release (as
`releaseId`, `snapshotId` or the query body's `release_id`) wherever its endpoint accepts one;
the few endpoints that accept none say why in `unpinned` and are listed on every run.

For each read it stores the status and the SHA-256 of the canonical JSON body (keys sorted,
no whitespace) and of the raw bytes. `--compare` exits 1 when any status or canonical hash
differs; `--bytes` also fails on raw-byte differences.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import sys
import time
import urllib.error
import urllib.request
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

HERE = Path(__file__).resolve().parent
USER_AGENT = "courtlens-speed-snapshot/1"
PLACEHOLDER = re.compile(r"\{(releaseId|season|beforeDate)\}")


def fill(value: Any, pins: dict[str, str]) -> Any:
    if isinstance(value, str):
        for key, pinned in pins.items():
            value = value.replace("{" + key + "}", pinned)
        return value
    if isinstance(value, list):
        return [fill(item, pins) for item in value]
    if isinstance(value, dict):
        return {key: fill(item, pins) for key, item in value.items()}
    return value


def canonical(payload: bytes) -> bytes:
    document = json.loads(payload)
    return json.dumps(document, sort_keys=True, separators=(",", ":"), ensure_ascii=False).encode()


def request(api: str, method: str, path: str, body: Any, timeout: float) -> tuple[int, bytes]:
    data = None if body is None else json.dumps(body).encode()
    headers = {
        "User-Agent": USER_AGENT,
        "Accept": "application/json",
        "Accept-Encoding": "identity",
    }
    if data is not None:
        headers["Content-Type"] = "application/json"
    call = urllib.request.Request(api + path, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(call, timeout=timeout) as response:
            return response.status, response.read()
    except urllib.error.HTTPError as error:
        return error.code, error.read()


def check_pinned(entry: dict[str, Any], path: str, body: Any, pins: dict[str, str]) -> str | None:
    """Why this read is not pinned to the release, or None when it is."""
    if PLACEHOLDER.search(path) or PLACEHOLDER.search(json.dumps(body)):
        return f"unfilled placeholder in {entry['name']}"
    if "unpinned" in entry:
        return None
    if body is not None:
        query = body.get("query", {}) if isinstance(body, dict) else {}
        if query.get("release_id") != pins["releaseId"] or not query.get("before_date"):
            return f"{entry['name']}: query body lacks release_id/before_date"
        return None
    if pins["releaseId"] not in path:
        return f"{entry['name']}: no release in {path} and no `unpinned` reason"
    return None


def take(
    api: str, entries: list[dict[str, Any]], pins: dict[str, str], timeout: float
) -> list[Any]:
    reads: list[dict[str, Any]] = []
    problems: list[str] = []
    for entry in entries:
        path, body = fill(entry["path"], pins), fill(entry.get("body"), pins)
        problem = check_pinned(entry, path, body, pins)
        if problem:
            problems.append(problem)
            continue
        started = time.perf_counter()
        status, payload = request(api, entry["method"], path, body, timeout)
        elapsed = time.perf_counter() - started
        try:
            canonical_sha = hashlib.sha256(canonical(payload)).hexdigest()
        except ValueError:
            canonical_sha = None
        reads.append(
            {
                "name": entry["name"],
                "method": entry["method"],
                "path": path,
                "body_sha256": None if body is None else hashlib.sha256(
                    json.dumps(body, sort_keys=True).encode()
                ).hexdigest(),
                "status": status,
                "bytes": len(payload),
                "canonical_sha256": canonical_sha,
                "raw_sha256": hashlib.sha256(payload).hexdigest(),
                "seconds": round(elapsed, 4),
            }
        )  # fmt: skip
        print(f"{status} {elapsed:6.3f} s  {entry['name']}", file=sys.stderr)
    if problems:
        raise SystemExit("sample is not pinned:\n  " + "\n  ".join(problems))
    return reads


def current_pins(api: str, args: argparse.Namespace) -> dict[str, str]:
    _, payload = request(api, "GET", "/api/workbench/catalog", None, args.timeout)
    catalog = json.loads(payload)
    return {
        "releaseId": args.release_id or catalog["release_id"],
        "season": args.season or catalog["default_season"],
        "beforeDate": args.before_date or catalog["default_before_date"],
    }


def compare(saved: dict[str, Any], fresh: list[dict[str, Any]], strict_bytes: bool) -> list[str]:
    before = {read["name"]: read for read in saved["reads"]}
    differences = []
    for read in fresh:
        old = before.pop(read["name"], None)
        if old is None:
            differences.append(f"{read['name']}: not in the saved snapshot")
            continue
        for field in ("path", "body_sha256", "status", "canonical_sha256"):
            if old[field] != read[field]:
                differences.append(f"{read['name']}: {field} {old[field]} -> {read[field]}")
        if strict_bytes and old["raw_sha256"] != read["raw_sha256"]:
            differences.append(
                f"{read['name']}: raw bytes differ ({old['bytes']} -> {read['bytes']})"
            )
    differences += [f"{name}: missing from this run" for name in before]
    return differences


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--api", required=True, help="API origin, e.g. http://localhost:8180")
    parser.add_argument("--urls", type=Path, default=HERE / "urls.json")
    mode = parser.add_mutually_exclusive_group(required=True)
    mode.add_argument("--out", type=Path, help="write a new snapshot here")
    mode.add_argument("--compare", type=Path, help="compare against this saved snapshot")
    parser.add_argument("--bytes", action="store_true", help="also fail on raw-byte differences")
    parser.add_argument("--release-id")
    parser.add_argument("--season")
    parser.add_argument("--before-date")
    parser.add_argument("--timeout", type=float, default=120)
    args = parser.parse_args()

    api = args.api.rstrip("/")
    entries = json.loads(args.urls.read_text())["snapshot"]
    unpinned = [f"{entry['name']}: {entry['unpinned']}" for entry in entries if "unpinned" in entry]

    if args.compare:
        saved = json.loads(args.compare.read_text())
        pins = saved["pins"]
        fresh = take(api, entries, pins, args.timeout)
        differences = compare(saved, fresh, args.bytes)
        print(f"pins {json.dumps(pins)}; {len(fresh)} reads; {len(unpinned)} without a release pin")
        if differences:
            print(f"{len(differences)} difference(s):")
            for line in differences:
                print(f"  {line}")
            return 1
        print("no differences" + (" (raw bytes too)" if args.bytes else ""))
        return 0

    pins = current_pins(api, args)
    reads = take(api, entries, pins, args.timeout)
    not_ok = [read["name"] for read in reads if read["status"] != 200]
    document = {
        "tool": "scripts/speed/snapshot.py",
        "taken_at": datetime.now(UTC).isoformat(timespec="seconds"),
        "api": api,
        "pins": pins,
        "unpinned": unpinned,
        "reads": reads,
    }
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(document, indent=2) + "\n")
    print(f"pins {json.dumps(pins)}; {len(reads)} reads -> {args.out}")
    print(f"{len(unpinned)} reads take no release pin:")
    for line in unpinned:
        print(f"  {line}")
    if not_ok:
        print(f"warning: not 200: {', '.join(not_ok)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
