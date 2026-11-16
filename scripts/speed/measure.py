#!/usr/bin/env python3
"""Time every page and API read in urls.json (speed plan SP00).

GETs only, one request at a time, so it is safe against the shared VPS. Each URL is requested
`--runs` times in a row (default 5) with a fresh curl process, so every run opens its own
connection, as a first click from a new tab would. For each run it records first byte, total,
wire bytes (the body as sent, compressed), decoded bytes, status and the cache headers
(`x-cache`, `cf-cache-status`, `cache-control`, `server-timing`).

    scripts/speed/measure.py --base https://courtlens.calebhabesh.com --label live
    scripts/speed/measure.py --base http://localhost:3180 --api-base http://localhost:8180 \
        --label local

The `static` section (SP06) holds one file of each kind the pages load: a portrait at both API
paths, a team logo, an era logo and a flag. An entry with `"origin": "api"` is requested from the
API origin, the others from the dashboard; their `cache-control` and `cf-cache-status` are the
point.

`{releaseId}`, `{season}` and `{beforeDate}` in urls.json are filled from the target's
`/api/workbench/catalog` (its release and default scope) before the first request, and recorded
in the output. Writes JSON to `--out-dir` and prints a Markdown table of medians.
"""

from __future__ import annotations

import argparse
import json
import platform
import statistics
import subprocess
import sys
import tempfile
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

HERE = Path(__file__).resolve().parent
REPO = HERE.parent.parent
USER_AGENT = "courtlens-speed-measure/1"
WATCHED_HEADERS = (
    "x-cache",
    "cf-cache-status",
    "cache-control",
    "server-timing",
    "content-encoding",
)
WRITE_OUT = (
    '{"status":%{http_code},"ttfb":%{time_starttransfer},"total":%{time_total},'
    '"connect":%{time_connect},"tls":%{time_appconnect},"wire_bytes":%{size_download},'
    '"http_version":"%{http_version}"}'
)


def fetch(url: str, timeout: float, expect: str | None = None) -> dict[str, Any]:
    with tempfile.TemporaryDirectory(prefix="speed-measure-") as scratch:
        body, headers = Path(scratch) / "body", Path(scratch) / "headers"
        completed = subprocess.run(
            [
                "curl", "--silent", "--show-error", "--compressed",
                "--max-time", str(timeout),
                "--user-agent", USER_AGENT,
                "--output", str(body), "--dump-header", str(headers),
                "--write-out", WRITE_OUT, url,
            ],
            capture_output=True, text=True, check=False,
        )  # fmt: skip
        if completed.returncode != 0:
            return {"error": completed.stderr.strip() or f"curl exit {completed.returncode}"}
        result: dict[str, Any] = json.loads(completed.stdout)
        result["decoded_bytes"] = body.stat().st_size if body.exists() else 0
        if expect is not None:
            # A page whose reads failed still answers 200 with its fallback; this catches it.
            result["rendered"] = body.exists() and expect.encode() in body.read_bytes()
        result["headers"] = read_headers(headers.read_text("latin-1"))
    for key in ("ttfb", "total", "connect", "tls"):
        result[key] = round(result[key], 4)
    return result


def read_headers(text: str) -> dict[str, str]:
    """The watched headers of the final response (after any redirect curl did not follow)."""
    blocks = [block for block in text.replace("\r\n", "\n").split("\n\n") if block.strip()]
    found: dict[str, str] = {}
    for line in blocks[-1].splitlines()[1:] if blocks else []:
        name, _, value = line.partition(":")
        if name.strip().lower() in WATCHED_HEADERS:
            found[name.strip().lower()] = value.strip()
    return found


def resolve_scope(api_base: str, timeout: float) -> dict[str, str]:
    completed = subprocess.run(
        ["curl", "--silent", "--fail", "--compressed", "--max-time", str(timeout),
         "--user-agent", USER_AGENT, f"{api_base}/api/workbench/catalog"],
        capture_output=True, text=True, check=False,
    )  # fmt: skip
    if completed.returncode != 0:
        raise SystemExit(f"cannot read {api_base}/api/workbench/catalog: {completed.stderr}")
    catalog = json.loads(completed.stdout)
    return {
        "releaseId": catalog["release_id"],
        "season": catalog["default_season"],
        "beforeDate": catalog["default_before_date"],
    }


def fill(path: str, scope: dict[str, str]) -> str:
    for key, value in scope.items():
        path = path.replace("{" + key + "}", value)
    if "{" in path:
        raise SystemExit(f"unfilled placeholder in {path}")
    return path


def curl_version() -> str:
    completed = subprocess.run(["curl", "--version"], capture_output=True, text=True, check=False)
    return completed.stdout.splitlines()[0]


def median(values: list[float]) -> float | None:
    return round(statistics.median(values), 4) if values else None


def summarise(runs: list[dict[str, Any]]) -> dict[str, Any]:
    good = [run for run in runs if "error" not in run]
    return {
        "ok_runs": len(good),
        "ttfb": median([run["ttfb"] for run in good]),
        "total": median([run["total"] for run in good]),
        "total_min": min((run["total"] for run in good), default=None),
        "total_max": max((run["total"] for run in good), default=None),
        "wire_bytes": median([run["wire_bytes"] for run in good]),
        "decoded_bytes": median([run["decoded_bytes"] for run in good]),
        "statuses": sorted({run["status"] for run in good}),
        "failed_runs": len(runs)
        - len(good)
        + sum(1 for run in good if run.get("rendered") is False),
    }


def table(results: list[dict[str, Any]]) -> str:
    lines = [
        "| Kind | Name | Median first byte | Median total | Min to max total | Wire | Decoded "
        "| Cache |",
        "| --- | --- | --- | --- | --- | --- | --- | --- |",
    ]
    for item in results:
        summary = item["median"]
        last: dict[str, Any] = next((r for r in reversed(item["runs"]) if "error" not in r), {})
        cache = last.get("headers", {})
        tag = cache.get("x-cache") or cache.get("cf-cache-status") or ""
        if item["kind"] == "file":
            tag = " ".join(filter(None, (cache.get("cf-cache-status"), cache.get("cache-control"))))
        if summary["failed_runs"]:
            tag = f"**{summary['failed_runs']} FAILED** {tag}".strip()

        def seconds(value: float | None) -> str:
            return "—" if value is None else f"{value:.3f} s"

        def size(value: float | None) -> str:
            return "—" if value is None else f"{value / 1000:,.1f} KB"

        spread = f"{seconds(summary['total_min'])} to {seconds(summary['total_max'])}"
        lines.append(
            f"| {item['kind']} | {item['name']} | {seconds(summary['ttfb'])} | "
            f"{seconds(summary['total'])} | {spread} | {size(summary['wire_bytes'])} | "
            f"{size(summary['decoded_bytes'])} | {tag} |"
        )
    return "\n".join(lines)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--base", required=True, help="dashboard origin")
    parser.add_argument("--api-base", help="API origin (defaults to --base, as on the live site)")
    parser.add_argument("--label", required=True, help="names the output file, e.g. live, local")
    parser.add_argument("--urls", type=Path, default=HERE / "urls.json")
    parser.add_argument("--runs", type=int, default=5)
    parser.add_argument("--timeout", type=float, default=60)
    parser.add_argument("--out-dir", type=Path, default=REPO / "docs/evidence/speed")
    parser.add_argument(
        "--only", choices=("pages", "api", "static"), help="measure one section only"
    )
    args = parser.parse_args()

    base, api_base = args.base.rstrip("/"), (args.api_base or args.base).rstrip("/")
    spec = json.loads(args.urls.read_text())
    scope = resolve_scope(api_base, args.timeout)
    targets: list[tuple[str, str, str, str | None]] = []
    for kind, section in (("page", "pages"), ("api", "api"), ("file", "static")):
        if args.only and args.only != section:
            continue
        for entry in spec.get(section, []):
            origin = api_base if kind == "api" or entry.get("origin") == "api" else base
            expect = fill(entry["expect"], scope) if "expect" in entry else None
            targets.append((kind, entry["name"], origin + fill(entry["path"], scope), expect))

    started = datetime.now(UTC)
    results: list[dict[str, Any]] = []
    for kind, name, url, expect in targets:
        runs = [fetch(url, args.timeout, expect) for _ in range(args.runs)]
        summary = summarise(runs)
        results.append({"kind": kind, "name": name, "url": url, "runs": runs, "median": summary})
        print(f"{kind:<4} {name:<36} {summary['total'] or 0:7.3f} s", file=sys.stderr)
    document = {
        "tool": "scripts/speed/measure.py",
        "version": spec["version"],
        "label": args.label,
        "base": base,
        "api_base": api_base,
        "scope": scope,
        "runs_per_url": args.runs,
        "started_at": started.isoformat(timespec="seconds"),
        "finished_at": datetime.now(UTC).isoformat(timespec="seconds"),
        "client": {"curl": curl_version(), "python": platform.python_version()},
        "results": results,
    }
    args.out_dir.mkdir(parents=True, exist_ok=True)
    stamp = started.strftime("%Y%m%dT%H%M%SZ")
    out = args.out_dir / f"measure-{args.label}-{stamp}.json"
    out.write_text(json.dumps(document, indent=2) + "\n")
    print(table(results))
    failed = [item["name"] for item in results if item["median"]["failed_runs"]]
    if failed:
        print(f"failed or unrendered runs: {', '.join(failed)}", file=sys.stderr)
    print(f"\nwrote {out.relative_to(REPO) if out.is_relative_to(REPO) else out}", file=sys.stderr)
    return 1 if failed else 0


if __name__ == "__main__":
    raise SystemExit(main())
