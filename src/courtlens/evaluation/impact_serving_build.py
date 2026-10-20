"""Projection of IM04 rating and IM05 extras artifacts into impact serving entries.

Shared by `scripts/build_impact_serving.py` (sealed seasons) and the weekly provisional run
(`services/season_impact.py`), so both project artifacts identically.
"""

from __future__ import annotations

from typing import Any

from courtlens.domain.impact_extras_catalog import RETIRED_METRICS


def coverage(provenance: dict[str, Any], season: str, phase: str) -> dict[str, Any]:
    summary = provenance["im02_summary"]
    counts = summary["quality_counts"]
    return {
        "season": season,
        "phase": phase,
        "scheduled_games": summary["scheduled_games"],
        "admitted_games": counts.get("clean", 0) + counts.get("patched", 0),
        "clean_games": counts.get("clean", 0),
        "patched_games": counts.get("patched", 0),
        "excluded_games": counts.get("excluded", 0),
        "patch_rate": counts.get("patched", 0)
        / max(1, counts.get("clean", 0) + counts.get("patched", 0)),
        "dataset": provenance["dataset"],
        "minute_diagnostic": summary["minutes_nonexcluded"],
        "plus_minus_diagnostic": summary["plus_minus_nonexcluded"],
        "estimate_within_two_percent": 100
        * provenance["box_estimate"]["within_two"]
        / provenance["box_estimate"]["comparisons"],
    }


def project_rating(body: dict[str, Any], digest: str, provenance: dict[str, Any]) -> dict[str, Any]:
    inp = body["input"]
    years = len(inp["seasons"])
    suffix = "" if years == 1 else f"_{years}y"
    players: dict[str, Any] = {}
    for pid, sample in body["rapm"]["players"].items():
        row: dict[str, Any] = {"metrics": {}, "support": {}, "on_off": {}}
        for family, names in (
            ("rapm", ("orapm", "drapm", "rapm")),
            ("bpr", ("obpr", "dbpr", "bpr")),
        ):
            fit = body[family]
            for name, field in zip(names, ("offense", "defense", "total"), strict=True):
                metric = name + suffix
                support = (
                    fit["players"][pid]
                    if fit
                    else {"qualified": False, "reason": body["bpr_prior"]["reason"]}
                )
                row["metrics"][metric] = support[field] if support.get("qualified") else None
                row["support"][metric] = {
                    **support,
                    "artifact_sha256": digest,
                    "years": years,
                    "cutoff": inp["cutoff"],
                    "covered_games": sample["games"],
                }
        if years == 1:
            for target in ("ts", "tov", "reb"):
                support = body["six_factor"][target]["players"][pid]
                for prefix, field in (("o", "offense"), ("d", "defense")):
                    metric = f"{prefix}_{target}"
                    row["metrics"][metric] = support[field] if support["qualified"] else None
                    row["support"][metric] = {
                        **support,
                        "artifact_sha256": digest,
                        "years": 1,
                        "cutoff": inp["cutoff"],
                        "covered_games": support["games"],
                    }
            row["on_off"] = {
                key.split(":")[1]: value
                for key, value in body["on_off"].items()
                if key.split(":")[0] == pid
            }
        players[pid] = row
    return {
        "kind": "ratings",
        "sha256": digest,
        "scope": {
            "season": inp["seasons"][-1],
            "seasons": inp["seasons"],
            "phase": inp["phase"],
            "years": years,
            "cutoff": inp["cutoff"],
            "last_included_date": max(g["day"] for g in inp["games"].values()),
        },
        "coverage": [
            coverage(provenance[f"{s}:{inp['phase']}"], s, inp["phase"]) for s in inp["seasons"]
        ],
        "players": players,
    }


def project_extras(body: dict[str, Any], digest: str, provenance: dict[str, Any]) -> dict[str, Any]:
    return {
        "kind": "extras",
        "sha256": digest,
        "scope": {
            "season": body["season"],
            "seasons": [body["season"]],
            "phase": body["phase"],
            "years": 1,
            "cutoff": body["cutoff"],
            "last_included_date": max(g["day"] for g in body["input"].values()),
        },
        "coverage": [coverage(provenance, body["season"], body["phase"])],
        "players": {
            pid: {
                "metrics": {k: s["value"] for k, s in r["metrics"].items()},
                "support": {
                    k: {**s, "artifact_sha256": digest, "cutoff": body["cutoff"]}
                    for k, s in r["metrics"].items()
                },
                "on_off": {},
            }
            for pid, r in body["players"].items()
        },
    }


def project_team_split(
    row: dict[str, Any], digest: str, cutoff: str, team_id: str
) -> dict[str, Any]:
    """The serving projection of one extras row (as build_impact_serving), for one team."""
    served = {k: s for k, s in row["metrics"].items() if k not in RETIRED_METRICS}
    return {
        "metrics": {k: s["value"] for k, s in served.items()},
        "support": {
            k: {**s, "artifact_sha256": digest, "cutoff": cutoff, "team_id": team_id}
            for k, s in served.items()
        },
    }
