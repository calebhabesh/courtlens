"""Research → Six-Factor RAPM: the page's table, composites, archetypes and Impact Tree.

Reads the served impact bundle and copies values through unrounded, so the page can be checked
against the bundle exactly. It fits nothing. Intervals are `courtlens-impact-intervals-v1`, the
regression weights `courtlens-six-factor-reconstruction-v1`.

A value is shown only when the bundle serves it. The bundle keeps an interval for estimates below
display qualification but no value, so such a node stays wholly unknown: an interval around a
hidden estimate would reveal it. Playoff fits have no registered intervals or weights, so their
intervals, composites and archetypes are unknown.
"""

from __future__ import annotations

import json
from functools import lru_cache
from pathlib import Path
from statistics import median
from typing import Any

from courtlens.domain.teams import get_team_info
from courtlens.services.impact_serving import VERSION, load_impact_store, served_path

RECONSTRUCTION_PATH = Path("evaluation/research/frozen/courtlens-six-factor-reconstruction-v1.json")
OFFENSE_FACTORS = ("o_ts", "o_tov", "o_reb")
DEFENSE_FACTORS = ("d_ts", "d_tov", "d_reb")
FACTORS = (*OFFENSE_FACTORS, *DEFENSE_FACTORS)
RATINGS = ("rapm", "orapm", "drapm")
NODES = (*RATINGS, *FACTORS)
EFFICIENCY_FACTORS = ("o_ts", "d_ts")
POSSESSION_FACTORS = ("o_tov", "o_reb", "d_tov", "d_reb")

ESTIMATE = "estimate"
NO_INTERVAL = "no_interval"
BELOW_QUALIFICATION = "below_qualification"
NOT_IN_FIT = "not_in_fit"


def _percentile(support: dict[str, Any], key: str) -> float | None:
    if key == "rapm":
        return support.get("total_percentile")
    side = "offense" if key == "orapm" or key.startswith("o_") else "defense"
    return support.get(f"{side}_percentile")


def build_node(
    player: dict[str, Any] | None, intervals: dict[str, Any] | None, key: str
) -> dict[str, Any]:
    """One value and its 80% interval, or an explicit unknown. Never a zero, never an estimate."""
    unknown = {"value": None, "low": None, "high": None, "replicates": None, "percentile": None}
    if player is None:
        return {**unknown, "status": NOT_IN_FIT}
    value = player["metrics"].get(key)
    if value is None:
        return {**unknown, "status": BELOW_QUALIFICATION}
    support = player["support"].get(key) or {}
    interval = (intervals or {}).get(key)
    low, high = (interval.get("p10"), interval.get("p90")) if interval else (None, None)
    known = low is not None and high is not None
    return {
        "value": value,
        "low": low if known else None,
        "high": high if known else None,
        "replicates": interval.get("replicates") if interval and known else None,
        "percentile": _percentile(support, key),
        "status": ESTIMATE if known else NO_INTERVAL,
    }


def load_reconstruction() -> dict[str, Any] | None:
    """The committed copy of R01's evidence file; None leaves R² and the weights unknown."""
    try:
        body: dict[str, Any] = json.loads(RECONSTRUCTION_PATH.read_text())
    except (OSError, ValueError):
        return None
    return body


def season_weights(reconstruction: dict[str, Any] | None, season: str) -> dict[str, float] | None:
    """Second-stage coefficients of RAPM on the six factors for one season, by factor."""
    row = (reconstruction or {}).get("seasons", {}).get(season)
    if row is None:
        return None
    intercept, *slopes = row["rapm_on_six"]["coefficients"]
    return {"intercept": intercept, **dict(zip(FACTORS, slopes, strict=True))}


def composites(
    metrics: dict[str, Any], weights: dict[str, float] | None
) -> dict[str, float | None]:
    """Net Efficiency and Possession Control, in RAPM points; both need every factor they use.

    They add to the reconstructed RAPM (with the intercept) by construction. No interval is served
    for a sum of factors, because the bundle keeps no replicates to combine.
    """
    unknown: dict[str, float | None] = {
        "net_efficiency": None,
        "possession_control": None,
        "reconstructed_rapm": None,
    }
    if weights is None:
        return unknown

    def weighted(keys: tuple[str, ...]) -> float | None:
        total = 0.0
        for key in keys:
            value = metrics.get(key)
            if value is None:
                return None
            total += weights[key] * value
        return total

    efficiency, possession = weighted(EFFICIENCY_FACTORS), weighted(POSSESSION_FACTORS)
    return {
        "net_efficiency": efficiency,
        "possession_control": possession,
        "reconstructed_rapm": (
            None
            if efficiency is None or possession is None
            else weights["intercept"] + efficiency + possession
        ),
    }


def main_team(player: dict[str, Any] | None) -> str | None:
    """The team the player spent the most on-court seconds with in this fit."""
    records = (player or {}).get("on_off") or {}
    if not records:
        return None
    team_id = max(sorted(records), key=lambda key: records[key]["on"].get("seconds") or 0)
    info = get_team_info(team_id)
    return info.tricode if info else None


def _sample(player: dict[str, Any] | None) -> dict[str, float | None]:
    support = ((player or {}).get("support") or {}).get("rapm") or {}
    seconds = support.get("seconds")
    return {"games": support.get("games"), "minutes": None if seconds is None else seconds / 60}


def find_entry(store: dict[str, Any], season: str, phase: str) -> dict[str, Any] | None:
    for entry in store["entries"]:
        scope = entry["scope"]
        if (
            entry["kind"] == "ratings"
            and scope["years"] == 1
            and scope["season"] == season
            and scope["phase"] == phase
        ):
            found: dict[str, Any] = entry
            return found
    return None


def available_scopes(store: dict[str, Any]) -> list[dict[str, str]]:
    scopes = [
        {"season": entry["scope"]["season"], "phase": entry["scope"]["phase"]}
        for entry in store["entries"]
        if entry["kind"] == "ratings" and entry["scope"]["years"] == 1
    ]
    return sorted(scopes, key=lambda s: (s["season"], s["phase"] == "regular_season"), reverse=True)


def _weighted(row: dict[str, Any], weights: dict[str, float], key: str) -> float:
    value: float = weights[key] * row["metrics"][key]["value"]
    return value


def pick_archetypes(
    rows: list[dict[str, Any]], weights: dict[str, float] | None
) -> list[dict[str, Any]]:
    """Fixed rules over one season's fit. Largest estimate is a selection rule, not a verdict.

    Each card takes the largest score among players with all nine values, or the next player if
    that one already has a card.
    """
    if weights is None:
        return []
    eligible = [
        row
        for row in rows
        if all(row["metrics"][key]["value"] is not None for key in NODES)
        and row["composites"]["net_efficiency"] is not None
    ]
    if not eligible:
        return []
    efficiency = median(row["composites"]["net_efficiency"] for row in eligible)
    possession = median(row["composites"]["possession_control"] for row in eligible)
    specs: list[dict[str, Any]] = [
        {
            "key": "efficiency_engine",
            "label": "Efficiency Engine",
            "rule": "Largest Net Efficiency with Possession Control at or below the median",
            "factors": ["o_ts", "d_ts"],
            "score": lambda row: row["composites"]["net_efficiency"],
            "keep": lambda row: row["composites"]["possession_control"] <= possession,
        },
        {
            "key": "possession_controller",
            "label": "Possession Controller",
            "rule": "Largest Possession Control with Net Efficiency at or below the median",
            "factors": ["o_tov", "o_reb", "d_tov", "d_reb"],
            "score": lambda row: row["composites"]["possession_control"],
            "keep": lambda row: row["composites"]["net_efficiency"] <= efficiency,
        },
        {
            "key": "two_way_balance",
            "label": "Balanced Impact",
            "rule": "Largest smaller value of Net Efficiency and Possession Control",
            "factors": ["o_ts", "d_ts", "o_tov", "d_tov"],
            "score": lambda row: min(
                row["composites"]["net_efficiency"], row["composites"]["possession_control"]
            ),
        },
        {
            "key": "shot_suppressor",
            "label": "Shot Suppressor",
            "rule": "Largest dTS",
            "factors": ["d_ts"],
            "score": lambda row: row["metrics"]["d_ts"]["value"],
        },
        {
            "key": "disruptor",
            "label": "Disruptor",
            "rule": "Largest dTOV",
            "factors": ["d_tov"],
            "score": lambda row: row["metrics"]["d_tov"]["value"],
        },
        {
            "key": "glass_cleaner",
            "label": "Glass Cleaner",
            "rule": "Largest weighted oREB plus dREB",
            "factors": ["o_reb", "d_reb"],
            "score": lambda row: (
                _weighted(row, weights, "o_reb") + _weighted(row, weights, "d_reb")
            ),
        },
    ]
    cards, used = [], set()
    for spec in specs:
        keep = spec.get("keep", lambda _row: True)
        pool = [row for row in eligible if row["player_id"] not in used and keep(row)]
        if not pool:
            continue
        chosen = max(pool, key=lambda row: (spec["score"](row), row["player_id"]))
        used.add(chosen["player_id"])
        cards.append(
            {
                "key": spec["key"],
                "label": spec["label"],
                "rule": spec["rule"],
                "factors": spec["factors"],
                "player_id": chosen["player_id"],
            }
        )
    return cards


def _reconstruction_summary(
    reconstruction: dict[str, Any] | None, season: str
) -> dict[str, Any] | None:
    if reconstruction is None:
        return None
    row = reconstruction["seasons"].get(season)
    if row is None:
        return None
    every = reconstruction["seasons"].values()
    in_sample = [item["rapm_on_six"]["in_sample"]["value"] for item in every]
    held_out = [item["rapm_on_six"]["cross_validated"]["value"] for item in every]
    registration = reconstruction["registration"]
    return {
        "registration": registration["identity"],
        "registration_sha256": registration["content_sha256"],
        "players": row["players"],
        "in_sample": row["rapm_on_six"]["in_sample"],
        "cross_validated": row["rapm_on_six"]["cross_validated"],
        "cross_season": row["rapm_on_six"]["cross_season"],
        "orapm_in_sample": row["orapm_on_offense"]["in_sample"],
        "drapm_in_sample": row["drapm_on_defense"]["in_sample"],
        "weights": season_weights(reconstruction, season),
        "range_in_sample": [min(in_sample), max(in_sample)],
        "range_cross_validated": [min(held_out), max(held_out)],
        "seasons": len(in_sample),
    }


def _provenance(store: dict[str, Any], entry: dict[str, Any], manifest: str) -> dict[str, Any]:
    intervals = store.get("intervals", {}).get(entry["sha256"])
    scope = entry["scope"]
    return {
        "version": VERSION,
        "manifest_sha256": manifest,
        "artifact_sha256": entry["sha256"],
        "cutoff": scope["cutoff"],
        "last_included_date": scope["last_included_date"],
        "interval_sha256": intervals["interval_sha256"] if intervals else None,
        "interval_registration": intervals["registration"]["identity"] if intervals else None,
    }


def _row(
    player_id: str,
    player: dict[str, Any] | None,
    intervals: dict[str, Any] | None,
    weights: dict[str, float] | None,
) -> dict[str, Any]:
    return {
        "player_id": player_id,
        "team": main_team(player),
        **_sample(player),
        "metrics": {key: build_node(player, intervals, key) for key in NODES},
        "composites": composites((player or {}).get("metrics") or {}, weights),
    }


@lru_cache(maxsize=32)
def _season_page(manifest: str, season: str, phase: str) -> dict[str, Any] | None:
    store = load_impact_store()
    entry = find_entry(store, season, phase) if store else None
    if store is None or entry is None:
        return None
    reconstruction = load_reconstruction() if phase == "regular_season" else None
    weights = season_weights(reconstruction, season)
    intervals = store.get("intervals", {}).get(entry["sha256"], {}).get("players", {})
    players = entry["players"]
    rows = [
        _row(pid, players[pid], intervals.get(pid), weights)
        for pid in sorted(players)
        if any(players[pid]["metrics"].get(key) is not None for key in NODES)
    ]
    coverage = next(
        (c for c in entry["coverage"] if c["season"] == season and c["phase"] == phase), None
    )
    return {
        "status": "available",
        "season": season,
        "phase": phase,
        "scopes": available_scopes(store),
        "provenance": _provenance(store, entry, manifest),
        "intervals_available": bool(intervals),
        "coverage": (
            {
                "admitted_games": coverage["admitted_games"],
                "scheduled_games": coverage["scheduled_games"],
            }
            if coverage
            else None
        ),
        "fit_players": len(players),
        "reconstruction": _reconstruction_summary(reconstruction, season),
        "archetypes": pick_archetypes(rows, weights),
        "players": rows,
    }


def season_page(season: str, phase: str) -> dict[str, Any] | None:
    """The page's data; a scope without a fit still lists the scopes that have one."""
    path, store = served_path(), load_impact_store()
    if path is None or store is None:
        return None
    return _season_page(path.stem, season, phase) or {
        "status": "unavailable",
        "season": season,
        "phase": phase,
        "scopes": available_scopes(store),
    }


def impact_tree(player_id: str, season: str, phase: str) -> dict[str, Any] | None:
    """RAPM → ORAPM/DRAPM → six factors for one player, whatever data they have."""
    path, store = served_path(), load_impact_store()
    entry = find_entry(store, season, phase) if store else None
    if path is None or store is None or entry is None:
        return None
    player = entry["players"].get(player_id)
    intervals = store.get("intervals", {}).get(entry["sha256"], {}).get("players", {})
    reconstruction = load_reconstruction() if phase == "regular_season" else None
    row = _row(player_id, player, intervals.get(player_id), season_weights(reconstruction, season))
    fits = [
        e
        for e in store["entries"]
        if e["kind"] == "ratings" and e["scope"]["years"] == 1 and e["scope"]["phase"] == phase
    ]
    return {
        **row,
        "status": "available",
        "season": season,
        "phase": phase,
        "in_fit": player is not None,
        "rated_seasons": sorted(
            e["scope"]["season"]
            for e in fits
            if (e["players"].get(player_id) or {}).get("metrics", {}).get("rapm") is not None
        ),
        "provenance": _provenance(store, entry, path.stem),
    }
