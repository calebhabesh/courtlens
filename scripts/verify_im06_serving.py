"""Compare real read-only serving rows with sealed source artifacts, without projection helpers."""

from __future__ import annotations

import argparse
import gzip
import json
import math
import time
from pathlib import Path
from typing import Any
from urllib.request import Request, urlopen

from courtlens.domain.impact_catalog import IMPACT_CATALOG
from courtlens.ingestion.native_reconstruction import content_hash


def source_rows(root: Path) -> dict[tuple[str, str], dict[str, dict[str, Any]]]:
    scopes: dict[tuple[str, str], dict[str, dict[str, Any]]] = {}
    for block in ("im04", "im05"):
        seal = json.loads(gzip.decompress((root / block / "acceptance.json.gz").read_bytes()))
        for digest in seal["artifact_hashes"]:
            body = json.loads(
                gzip.decompress((root / block / "artifacts" / f"{digest}.json.gz").read_bytes())
            )
            assert content_hash(body) == digest
            inp = body["input"]
            season = inp["seasons"][-1] if block == "im04" else body["season"]
            phase = inp["phase"] if block == "im04" else body["phase"]
            rows = scopes.setdefault((season, phase), {})
            if block == "im05":
                for pid, row in body["players"].items():
                    rows.setdefault(pid, {}).update(
                        {k: s["value"] for k, s in row["metrics"].items()}
                    )
                continue
            years = len(inp["seasons"])
            suffix = "" if years == 1 else f"_{years}y"
            for family, keys in (
                ("rapm", ("orapm", "drapm", "rapm")),
                ("bpr", ("obpr", "dbpr", "bpr")),
            ):
                for pid in body["rapm"]["players"]:
                    sample = body[family]["players"][pid] if body[family] else {}
                    rows.setdefault(pid, {}).update(
                        {
                            key + suffix: sample[field] if sample.get("qualified") else None
                            for key, field in zip(
                                keys, ("offense", "defense", "total"), strict=True
                            )
                        }
                    )
            if years != 1:
                continue
            for target, fit in body["six_factor"].items():
                for pid, sample in fit["players"].items():
                    rows.setdefault(pid, {}).update(
                        {
                            f"{prefix}_{target}": sample[field] if sample["qualified"] else None
                            for prefix, field in (("o", "offense"), ("d", "defense"))
                        }
                    )
            refs: dict[str, list[dict[str, Any]]] = {}
            for key, record in body["on_off"].items():
                refs.setdefault(key.split(":")[0], []).append(record)
            for pid, records in refs.items():
                if len(records) != 1:
                    continue
                record = records[0]
                computed = {}
                for side in ("on", "off"):
                    sample = record[side]
                    offense = (
                        100 * sample["points"] / sample["off_controls"]
                        if sample["off_controls"]
                        else None
                    )
                    defense = (
                        100 * sample["allowed"] / sample["def_controls"]
                        if sample["def_controls"]
                        else None
                    )
                    computed[side] = {
                        "offensive": offense,
                        "defensive": defense,
                        "net": offense - defense
                        if offense is not None and defense is not None
                        else None,
                    }
                for label, on in computed["on"].items():
                    off = computed["off"][label]
                    rows.setdefault(pid, {})[f"on_{label}_rating"] = on
                    rows[pid][f"onoff_{label}_rating"] = (
                        on - off if on is not None and off is not None else None
                    )
    return scopes


def request(
    base: str, query: dict[str, Any], presentation: bool = False
) -> tuple[dict[str, Any], float]:
    body: dict[str, Any] = {"query": query}
    if presentation:
        body["presentation"] = {}
    started = time.monotonic()
    req = Request(
        base + "/api/workbench/query",
        data=json.dumps(body).encode(),
        headers={"Content-Type": "application/json"},
    )
    with urlopen(req, timeout=60) as response:
        result = json.load(response)
    return result, time.monotonic() - started


def verify(base: str, root: Path) -> dict[str, Any]:
    scopes = source_rows(root)
    report: dict[str, Any] = {
        "version": "courtlens-im06-real-serving-verification-v1",
        "cohorts": [],
        "matched_values": 0,
    }
    for (season, phase), expected in sorted(scopes.items()):
        cutoff = f"20{season[-2:]}-07-01"
        query: dict[str, Any] = {
            "season": season,
            "phase": phase,
            "before_date": cutoff,
            "window": {"kind": "season"},
            "view_state": {"columns": list(IMPACT_CATALOG)},
            "sort": [{"field": "rapm", "direction": "desc"}],
            "page": {"limit": 100},
        }
        seen: set[str] = set()
        durations = []
        while True:
            response, duration = request(base, query)
            durations.append(duration)
            assert response["impact"]["status"] == "available"
            for row in response["items"]:
                pid = row["player_id"]
                assert pid not in seen
                seen.add(pid)
                for key in IMPACT_CATALOG:
                    value = row["metrics"][key]
                    target = expected.get(pid, {}).get(key)
                    assert (value is None and target is None) or (
                        value is not None
                        and target is not None
                        and math.isclose(value, target, rel_tol=1e-10, abs_tol=1e-10)
                    ), (season, phase, pid, key, value, target)
                    report["matched_values"] += 1
            if not response["has_more"]:
                break
            query["page"]["cursor"] = response["next_cursor"]
        assert len(seen) == response["total_eligible_players"]
        report["cohorts"].append(
            {
                "season": season,
                "phase": phase,
                "players": len(seen),
                "page_seconds": durations,
                "artifact_hashes": [a["sha256"] for a in response["impact"]["artifacts"]],
            }
        )
    query = {
        "season": "2025-26",
        "phase": "regular_season",
        "before_date": "2026-07-01",
        "sort": [{"field": "rapm", "direction": "desc"}],
        "page": {"limit": 100},
    }
    complete, elapsed = request(base, query, True)
    query["name"] = "Victor"
    named, name_elapsed = request(base, query, True)
    victor = next(r for r in complete["items"] if r["player_id"] == "1641705")
    found = next(r for r in named["items"] if r["player_id"] == "1641705")
    assert victor["percentiles"] == found["percentiles"]
    assert victor["cohort_sample_sizes"] == found["cohort_sample_sizes"]
    query["before_date"] = "2026-01-01"
    early, _ = request(base, query)
    assert early["impact"]["status"] == "unavailable"
    assert all(row["metrics"]["rapm"] is None for row in early["items"])
    query["before_date"] = "2026-07-01"
    query["window"] = {"kind": "last_10"}
    short, _ = request(base, query)
    assert short["impact"]["status"] == "unavailable"
    report.update(
        {
            "victor_rapm": found["metrics"]["rapm"],
            "name_preserves_cohort": True,
            "exclusive_cutoff_gate": True,
            "short_window_gate": True,
            "presentation_seconds": elapsed,
            "named_presentation_seconds": name_elapsed,
        }
    )
    return report


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--api", default="http://127.0.0.1:8020")
    parser.add_argument("--evidence-root", type=Path, default=Path("docs/evidence"))
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    report = verify(args.api, args.evidence_root)
    args.output.write_text(json.dumps(report, indent=2) + "\n")
    print(
        json.dumps({"cohorts": len(report["cohorts"]), "matched_values": report["matched_values"]})
    )
