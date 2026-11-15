"""summarise.py <rounds dir>: per build, medians across rounds (navigation, warm, LCP, CLS)."""

import json
import statistics
import sys
from pathlib import Path
from typing import Any

rounds = Path(sys.argv[1])


def load(pattern: str) -> list[Any]:
    return [json.loads(f.read_text()) for f in sorted(rounds.glob(pattern))]


out: dict[str, Any] = {}
for build in ("before", "after"):
    nav: dict[str, list[float]] = {}
    for doc in load(f"nav-{build}-*.json"):
        for result in doc["results"]:
            nav.setdefault(result["journey"], []).append(result["ms"])
    warm: dict[str, list[float]] = {}
    for doc in load(f"measure-warm-{build}-*.json"):
        for result in doc["results"]:
            if result["kind"] != "file":
                key = f"{result['kind']}:{result['name']}"
                warm.setdefault(key, []).append(result["median"]["total"])
    lcp: dict[str, dict[str, Any]] = {}
    for doc in load(f"lcp-{build}-*.json"):
        for page in doc["pages"]:
            entry = lcp.setdefault(page["path"], {"times": [], "els": {}, "cls": [], "shifts": 0})
            for run in page["runs"]:
                element = run["lcp"]["el"]
                name = f"{element['tag']}.{(element['cls'] or ' ').split()[0]}"
                entry["times"].append(run["lcp"]["time"])
                entry["els"][name] = entry["els"].get(name, 0) + 1
                entry["cls"].append(run["cls"])
                entry["shifts"] += bool(run["shifts"])
    out[build] = {
        "navigation_median_ms": {k: statistics.median(v) for k, v in nav.items()},
        "navigation_runs": {k: len(v) for k, v in nav.items()},
        "warm_total_ms_median_of_round_medians": {
            k: round(statistics.median(v) * 1000, 1) for k, v in warm.items()
        },
        "lcp": {
            path: {
                "median_ms": statistics.median(e["times"]),
                "min": min(e["times"]),
                "max": max(e["times"]),
                "elements": e["els"],
                "max_cls": max(e["cls"]),
                "runs_with_shift": e["shifts"],
                "runs": len(e["times"]),
            }
            for path, e in lcp.items()
        },
    }
print(json.dumps(out, indent=1))
