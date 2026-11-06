"""Draft Classes runner (`courtlens-draft-value-v1`, R09). Descriptive; no prospect model (D4).

Realized value of every pick is read from complete NBA regular-season totals: win shares and
minutes over the first four seasons after the draft (the comparable window), career to date, and
seconds-weighted 1Y RAPM over the window where RAPM exists. From those, with every rule fixed in
the registration before anything is summarized:

- value by pick: mean value per slot 1-60 by era, with a seeded bootstrap over the players at
  each slot (and a few registered slot-band differences);
- class retrospectives: each complete class redrafted by realized value, with each pick's surplus
  over its slot's leave-one-class-out expectation, and the biggest steals and misses;
- combine measurements beside window value: Pearson r with bootstrap intervals, descriptive;
- the rookie comparison rule (`rookie_comparison`) the API applies to 2026-27 rookies.

Recent classes are censored: 2023-25 have fewer than four seasons and are never redrafted or
scored as steals or misses; 2026 is the rookie class. Subcommands: `test` (one read; refused once
results exist) and `reproduce` (recompute and compare hashes).
"""

from __future__ import annotations

import argparse
import json
import math
from collections import defaultdict
from collections.abc import Mapping, Sequence
from pathlib import Path
from typing import Any

import numpy as np

from courtlens.domain.research_registry import load_registration, registration_receipt
from courtlens.evaluation import draft_value_data as data
from courtlens.ingestion.native_reconstruction import content_hash

REGISTRATION = data.REGISTRATION
RESULTS_PATH = Path("evaluation/research/frozen/courtlens-draft-value-v1.json")
SEED = 909
REPLICATES = 2000
INTERVAL = (2.5, 97.5)
WINDOW_SEASONS = 4
SLOTS = 60
LAST_COMPLETE_YEAR = 2025  # 2025-26
WINDOW_CLASSES = (1966, 2022)
CAREER_CLASSES = (1966, 2005)
RAPM_CLASSES = (2014, 2022)
CENSORED_CLASSES = (2023, 2025)
ROOKIE_CLASS = 2026
ERAS: dict[str, tuple[int, int]] = {
    "all": (1966, 2022),
    "multi_round": (1966, 1988),
    "two_round": (1989, 2022),
}
CAREER_ERAS: dict[str, tuple[int, int]] = {
    "all": (1966, 2005),
    "multi_round": (1966, 1988),
    "two_round": (1989, 2005),
}
MEASURES = ("ws", "min")
BANDS: tuple[tuple[str, tuple[int, int], tuple[int, int]], ...] = (
    ("pick_1_vs_2", (1, 1), (2, 2)),
    ("top_3_vs_4_to_10", (1, 3), (4, 10)),
    ("top_10_vs_11_to_30", (1, 10), (11, 30)),
    ("21_to_30_vs_31_to_40", (21, 30), (31, 40)),
    ("31_to_45_vs_46_to_60", (31, 45), (46, 60)),
)
STEALS_PER_CLASS = 10
TOP_LIST = 25
COMBINE_CLASSES = (2000, 2022)
COMBINE_MEASURES = (
    "height",
    "wingspan",
    "wingspan_minus_height",
    "standing_reach",
    "weight",
    "max_vertical",
    "lane_agility",
    "sprint",
)
ROOKIE_POOL = (1983, 2025)
SMALL_SAMPLE_MINUTES = 100
ROOKIE_STATS = ("mpg", "pts36", "reb36", "ast36", "stl36", "blk36", "tov36", "ts")

PARAMETERS: dict[str, Any] = {
    "seed": SEED,
    "replicates": REPLICATES,
    "interval_percentiles": list(INTERVAL),
    "window_seasons": WINDOW_SEASONS,
    "slots": SLOTS,
    "last_complete_season": data.LAST_COMPLETE_SEASON,
    "window_classes": list(WINDOW_CLASSES),
    "career_classes": list(CAREER_CLASSES),
    "rapm_classes": list(RAPM_CLASSES),
    "censored_classes": list(CENSORED_CLASSES),
    "rookie_class": ROOKIE_CLASS,
    "eras": {k: list(v) for k, v in ERAS.items()},
    "career_eras": {k: list(v) for k, v in CAREER_ERAS.items()},
    "measures": list(MEASURES),
    "bands": [[name, list(a), list(b)] for name, a, b in BANDS],
    "steals_per_class": STEALS_PER_CLASS,
    "top_list": TOP_LIST,
    "combine_classes": list(COMBINE_CLASSES),
    "combine_measures": list(COMBINE_MEASURES),
    "rookie_pool_classes": list(ROOKIE_POOL),
    "rookie_stats": list(ROOKIE_STATS),
    "small_sample_minutes": SMALL_SAMPLE_MINUTES,
    "name_rule_seasons": data.NAME_RULE_SEASONS,
}


def check_registration(parameters: Mapping[str, Any], seed: int) -> None:
    for key, value in PARAMETERS.items():
        if parameters.get(key) != value:
            raise SystemExit(f"module constant {key} differs from the registration")
    if seed != SEED:
        raise SystemExit("seed differs from the registration")


def rng_for(*keys: int) -> np.random.Generator:
    return np.random.default_rng(np.random.SeedSequence([SEED, *keys]))


def r6(value: float | None) -> float | None:
    return None if value is None or not math.isfinite(value) else round(float(value), 6)


# ---------------------------------------------------------------------------------------------
# Per-pick realized value


def pick_values(
    picks: Sequence[Mapping[str, Any]],
    seasons: Mapping[str, Mapping[str, Any]],
    rapm: Mapping[str, Mapping[str, Any]],
) -> list[dict[str, Any]]:
    """Window, career-to-date and RAPM value of every pick.

    A pick with no regular-season row in the complete league totals played 0 NBA minutes and
    earned 0 win shares: that is a recorded absence from a complete table, not a missing box.
    A season row without win shares makes the player's win shares unknown (None).
    """
    out = []
    for pick in picks:
        year = pick["year"]
        rows = seasons.get(pick["season_id"] or "", {})
        window = [data.season_label(year + k) for k in range(WINDOW_SEASONS)]
        elapsed = max(0, min(WINDOW_SEASONS, LAST_COMPLETE_YEAR - year + 1))

        def total(keys: Sequence[str], field: str, rows: Mapping[str, Any] = rows) -> float | None:
            values = [rows[s][field] for s in keys if s in rows]
            if any(v is None for v in values):
                return None
            return float(sum(values))

        career_keys = [s for s in rows if data.season_start(s) >= year]
        window_keys = [s for s in window if s in rows]
        rapm_value = rapm_seconds = None
        if RAPM_CLASSES[0] <= year <= RAPM_CLASSES[1] and pick["player_id"]:
            fits = rapm.get(pick["player_id"], {})
            fit_rows = [fits[s] for s in window if s in fits and fits[s]["seconds"] > 0]
            if fit_rows:
                rapm_seconds = sum(r["seconds"] for r in fit_rows)
                rapm_value = sum(r["rapm"] * r["seconds"] for r in fit_rows) / rapm_seconds
        out.append(
            {
                **pick,
                "window_elapsed": elapsed,
                "window_ws": total(window_keys, "ws"),
                "window_min": total(window_keys, "min"),
                "window_seasons_played": len(window_keys),
                "career_ws": total(career_keys, "ws"),
                "career_min": total(career_keys, "min"),
                "career_seasons": len(career_keys),
                "active": data.LAST_COMPLETE_SEASON in rows,
                "played": bool(rows),
                "window_rapm": r6(rapm_value),
                "window_rapm_seconds": r6(rapm_seconds),
            }
        )
    return out


# ---------------------------------------------------------------------------------------------
# Value by pick


def bootstrap_mean(values: Sequence[float], rng: np.random.Generator) -> tuple[float, float]:
    x = np.asarray(values, dtype=float)
    draws = x[rng.integers(0, len(x), size=(REPLICATES, len(x)))].mean(axis=1)
    lo, hi = np.percentile(draws, INTERVAL)
    return float(lo), float(hi)


def slot_summary(
    values: Sequence[float], played: Sequence[bool], rng: np.random.Generator
) -> dict[str, Any]:
    if not values:
        return {"n": 0, "mean": None, "lo": None, "hi": None, "median": None, "played_share": None}
    lo, hi = bootstrap_mean(values, rng)
    return {
        "n": len(values),
        "mean": r6(float(np.mean(values))),
        "lo": r6(lo),
        "hi": r6(hi),
        "median": r6(float(np.median(values))),
        "p90": r6(float(np.percentile(values, 90))),
        "played_share": r6(sum(played) / len(played)),
    }


def value_by_pick(values: Sequence[Mapping[str, Any]]) -> dict[str, Any]:
    out: dict[str, Any] = {"window": {}, "career": {}, "rapm": {}}
    for era_index, (era, (first, last)) in enumerate(ERAS.items()):
        out["window"][era] = {}
        for measure_index, measure in enumerate(MEASURES):
            rows = []
            for slot in range(1, SLOTS + 1):
                picked = [v for v in values if first <= v["year"] <= last and v["pick"] == slot]
                known = [v for v in picked if v[f"window_{measure}"] is not None]
                rng = rng_for(1, era_index, measure_index, slot)
                rows.append(
                    {
                        "slot": slot,
                        "unknown": len(picked) - len(known),
                        **slot_summary(
                            [v[f"window_{measure}"] for v in known],
                            [v["played"] for v in known],
                            rng,
                        ),
                    }
                )
            out["window"][era][measure] = rows
    for era_index, (era, (first, last)) in enumerate(CAREER_ERAS.items()):
        out["career"][era] = {}
        for measure_index, measure in enumerate(MEASURES):
            rows = []
            for slot in range(1, SLOTS + 1):
                picked = [v for v in values if first <= v["year"] <= last and v["pick"] == slot]
                known = [v for v in picked if v[f"career_{measure}"] is not None]
                rng = rng_for(2, era_index, measure_index, slot)
                rows.append(
                    {
                        "slot": slot,
                        "unknown": len(picked) - len(known),
                        "active": sum(v["active"] for v in known),
                        **slot_summary(
                            [v[f"career_{measure}"] for v in known],
                            [v["played"] for v in known],
                            rng,
                        ),
                    }
                )
            out["career"][era][measure] = rows
    rows = []
    for slot in range(1, SLOTS + 1):
        picked = [
            v
            for v in values
            if RAPM_CLASSES[0] <= v["year"] <= RAPM_CLASSES[1] and v["pick"] == slot
        ]
        rated = [v for v in picked if v["window_rapm"] is not None]
        rng = rng_for(3, slot)
        summary = slot_summary([v["window_rapm"] for v in rated], [True] * len(rated), rng)
        summary.pop("played_share", None)
        rows.append(
            {"slot": slot, "picks": len(picked), "no_rapm": len(picked) - len(rated), **summary}
        )
    out["rapm"] = rows
    return out


def band_differences(values: Sequence[Mapping[str, Any]]) -> list[dict[str, Any]]:
    """Band A mean minus band B mean, players resampled within each band independently."""
    out = []
    for era_index, (era, (first, last)) in enumerate(ERAS.items()):
        for measure_index, measure in enumerate(MEASURES):
            for band_index, (name, a, b) in enumerate(BANDS):

                def members(
                    band: tuple[int, int],
                    measure: str = measure,
                    first: int = first,
                    last: int = last,
                ) -> np.ndarray:
                    return np.asarray(
                        [
                            v[f"window_{measure}"]
                            for v in values
                            if first <= v["year"] <= last
                            and band[0] <= v["pick"] <= band[1]
                            and v[f"window_{measure}"] is not None
                        ],
                        dtype=float,
                    )

                xa, xb = members(a), members(b)
                if not len(xa) or not len(xb):
                    raise ValueError(f"band {name} is empty in era {era}")
                rng = rng_for(4, era_index, measure_index, band_index)
                da = xa[rng.integers(0, len(xa), size=(REPLICATES, len(xa)))].mean(axis=1)
                db = xb[rng.integers(0, len(xb), size=(REPLICATES, len(xb)))].mean(axis=1)
                lo, hi = np.percentile(da - db, INTERVAL)
                diff = float(xa.mean() - xb.mean())
                verdict = "higher" if lo > 0 else "lower" if hi < 0 else "no difference"
                out.append(
                    {
                        "band": name,
                        "a": list(a),
                        "b": list(b),
                        "era": era,
                        "measure": measure,
                        "n_a": len(xa),
                        "n_b": len(xb),
                        "mean_a": r6(float(xa.mean())),
                        "mean_b": r6(float(xb.mean())),
                        "diff": r6(diff),
                        "lo": r6(float(lo)),
                        "hi": r6(float(hi)),
                        "verdict": verdict,
                    }
                )
    return out


# ---------------------------------------------------------------------------------------------
# Class retrospectives


def era_of(year: int) -> str:
    return "multi_round" if year <= ERAS["multi_round"][1] else "two_round"


def slot_key(pick: int) -> str:
    return str(pick) if pick <= SLOTS else f"{SLOTS + 1}+"


def expectations(values: Sequence[Mapping[str, Any]]) -> dict[tuple[str, str, int], float]:
    """Leave-one-class-out mean window WS by (era, slot bucket) for every complete class."""
    sums: dict[tuple[str, str], list[tuple[int, float]]] = defaultdict(list)
    for v in values:
        if WINDOW_CLASSES[0] <= v["year"] <= WINDOW_CLASSES[1] and v["window_ws"] is not None:
            sums[(era_of(v["year"]), slot_key(v["pick"]))].append((v["year"], v["window_ws"]))
    out: dict[tuple[str, str, int], float] = {}
    for (era, key), entries in sums.items():
        total = sum(x for _, x in entries)
        by_class: dict[int, list[float]] = defaultdict(list)
        for year, x in entries:
            by_class[year].append(x)
        for year, own in by_class.items():
            rest = len(entries) - len(own)
            if rest:
                out[(era, key, year)] = (total - sum(own)) / rest
    return out


def redraft(rows: Sequence[Mapping[str, Any]], measure: str) -> dict[tuple[int, int], int]:
    """Rank by the measure (unknown last), then minutes, then the original pick."""
    ordered = sorted(
        rows,
        key=lambda r: (
            r[measure] is None,
            -(r[measure] or 0.0),
            -(r[measure.replace("_ws", "_min")] or 0.0),
            r["pick"],
        ),
    )
    return {(r["year"], r["pick"]): rank for rank, r in enumerate(ordered, 1)}


def class_status(year: int) -> str:
    if year <= WINDOW_CLASSES[1]:
        return "complete"
    if year <= CENSORED_CLASSES[1]:
        return "censored"
    return "rookies"


def class_tables(values: Sequence[Mapping[str, Any]]) -> dict[str, Any]:
    expected = expectations(values)
    by_class: dict[int, list[Mapping[str, Any]]] = defaultdict(list)
    for v in values:
        by_class[v["year"]].append(v)
    classes: dict[str, Any] = {}
    steals_all: list[dict[str, Any]] = []
    misses_all: list[dict[str, Any]] = []
    for year in sorted(by_class):
        rows = sorted(by_class[year], key=lambda r: r["pick"])
        status = class_status(year)
        window_rank = redraft(rows, "window_ws") if status == "complete" else {}
        career_rank = redraft(rows, "career_ws") if status == "complete" else {}
        out_rows = []
        for r in rows:
            exp = (
                expected.get((era_of(year), slot_key(r["pick"]), year))
                if status == "complete"
                else None
            )
            surplus = None if exp is None or r["window_ws"] is None else r["window_ws"] - exp
            out_rows.append(
                {
                    "pick": r["pick"],
                    "round": r["round"],
                    "name": r["name"],
                    "source_name": r["source_name"],
                    "player_id": r["player_id"],
                    "identity": r["identity"],
                    "team": r["team"],
                    "team_name": r["team_name"],
                    "organization": r["organization"],
                    "played": r["played"],
                    "active": r["active"],
                    "window_ws": r6(r["window_ws"]),
                    "window_min": r6(r["window_min"]),
                    "window_seasons_played": r["window_seasons_played"],
                    "career_ws": r6(r["career_ws"]),
                    "career_min": r6(r["career_min"]),
                    "career_seasons": r["career_seasons"],
                    "window_rapm": r["window_rapm"],
                    "window_rapm_seconds": r["window_rapm_seconds"],
                    "redraft_window": window_rank.get((year, r["pick"])),
                    "redraft_career": career_rank.get((year, r["pick"])),
                    "expected_window_ws": r6(exp),
                    "surplus_window_ws": r6(surplus),
                }
            )
        scored = [r for r in out_rows if r["surplus_window_ws"] is not None]
        steals = sorted(scored, key=lambda r: (-r["surplus_window_ws"], r["pick"]))[
            :STEALS_PER_CLASS
        ]
        first_round = [r for r in scored if r["round"] == 1]
        misses = sorted(first_round, key=lambda r: (r["surplus_window_ws"], r["pick"]))[
            :STEALS_PER_CLASS
        ]
        for lst, target in ((steals, steals_all), (misses, misses_all)):
            target.extend({**r, "year": year} for r in lst)
        classes[str(year)] = {
            "status": status,
            "era": era_of(year),
            "seasons_elapsed": max(0, LAST_COMPLETE_YEAR - year + 1),
            "picks": len(rows),
            "played": sum(r["played"] for r in rows),
            "active": sum(r["active"] for r in rows),
            "steals": [r["pick"] for r in steals],
            "misses": [r["pick"] for r in misses],
            "rows": out_rows,
        }
    steals_all.sort(key=lambda r: (-r["surplus_window_ws"], r["year"], r["pick"]))
    misses_all.sort(key=lambda r: (r["surplus_window_ws"], r["year"], r["pick"]))
    return {
        "classes": classes,
        "steals": steals_all[:TOP_LIST],
        "misses": misses_all[:TOP_LIST],
    }


# ---------------------------------------------------------------------------------------------
# Combine


def combine_rows(
    values: Sequence[Mapping[str, Any]], combine: Sequence[Mapping[str, Any]]
) -> list[dict[str, Any]]:
    by_player = {(v["year"], v["player_id"]): v for v in values if v["player_id"]}
    out = []
    for row in combine:
        v = by_player.get((row["year"], row["player_id"]))
        if v is None or not COMBINE_CLASSES[0] <= row["year"] <= COMBINE_CLASSES[1]:
            continue
        span, height = row["wingspan"], row["height"]
        out.append(
            {
                "year": row["year"],
                "player_id": row["player_id"],
                "name": v["name"],
                "pick": v["pick"],
                "team": v["team"],
                "position": row["position"],
                **{k: row[k] for k in COMBINE_MEASURES if k in row},
                "wingspan_minus_height": None
                if span is None or height is None
                else r6(span - height),
                "window_ws": r6(v["window_ws"]),
                "window_min": r6(v["window_min"]),
            }
        )
    return sorted(out, key=lambda r: (r["year"], r["pick"]))


def pearson(x: np.ndarray, y: np.ndarray) -> float:
    return float(np.corrcoef(x, y)[0, 1])


def combine_correlations(rows: Sequence[Mapping[str, Any]]) -> list[dict[str, Any]]:
    out = []
    for mi, measure in enumerate(COMBINE_MEASURES):
        for oi, outcome in enumerate(("window_ws", "window_min")):
            pairs = [
                (r[measure], r[outcome])
                for r in rows
                if r.get(measure) is not None and r[outcome] is not None
            ]
            x = np.asarray([p[0] for p in pairs], dtype=float)
            y = np.asarray([p[1] for p in pairs], dtype=float)
            entry: dict[str, Any] = {"measure": measure, "outcome": outcome, "n": len(x)}
            if len(x) < 3 or x.std() == 0 or y.std() == 0:
                out.append({**entry, "r": None, "lo": None, "hi": None})
                continue
            rng = rng_for(5, mi, oi)
            idx = rng.integers(0, len(x), size=(REPLICATES, len(x)))
            draws = np.asarray(
                [pearson(x[i], y[i]) for i in idx if x[i].std() > 0 and y[i].std() > 0]
            )
            lo, hi = np.percentile(draws, INTERVAL)
            out.append({**entry, "r": r6(pearson(x, y)), "lo": r6(float(lo)), "hi": r6(float(hi))})
    return out


# ---------------------------------------------------------------------------------------------
# Rookie comparison rule (applied by the API to 2026-27 rookies)

COLUMNS = (
    "date",
    "game_id",
    "seconds",
    "points",
    "rebounds_total",
    "assists",
    "steals",
    "blocks",
    "turnovers",
    "field_goals_made",
    "field_goals_attempted",
    "three_pointers_made",
    "three_pointers_attempted",
    "free_throws_made",
    "free_throws_attempted",
)


def rookie_line(games: Sequence[Sequence[Any]]) -> dict[str, float | None]:
    """Per-game minutes, per-36 box and TS% over the given games (rows in COLUMNS order)."""
    k = len(games)
    tot = {c: sum(float(g[i]) for g in games) for i, c in enumerate(COLUMNS) if i >= 2}
    seconds = tot["seconds"]
    per36 = (lambda v: v * 2160.0 / seconds) if seconds > 0 else (lambda v: None)
    tsa = 2.0 * (tot["field_goals_attempted"] + 0.44 * tot["free_throws_attempted"])
    return {
        "games": k,
        "minutes": r6(seconds / 60.0),
        "mpg": r6(seconds / 60.0 / k) if k else None,
        "pts36": r6(per36(tot["points"])),
        "reb36": r6(per36(tot["rebounds_total"])),
        "ast36": r6(per36(tot["assists"])),
        "stl36": r6(per36(tot["steals"])),
        "blk36": r6(per36(tot["blocks"])),
        "tov36": r6(per36(tot["turnovers"])),
        "ts": r6(tot["points"] / tsa) if tsa > 0 else None,
    }


def percentile_rank(value: float, pool: Sequence[float]) -> float | None:
    if not pool:
        return None
    below = sum(p < value for p in pool)
    ties = sum(p == value for p in pool)
    return r6(100.0 * (below + 0.5 * ties) / len(pool))


def rookie_comparison(
    current: Sequence[Sequence[Any]],
    pool: Mapping[str, Mapping[str, Any]],
) -> dict[str, Any]:
    """One rookie's line after his g appearances against each same-pick past rookie's first
    min(g, G) first-season appearances. `current` holds only games on or before the comparison
    date; past rookies' later games are never read."""
    g = len(current)
    mine = rookie_line(current)
    lines = {}
    reached = 0
    for pid, entry in sorted(pool.items()):
        games = entry["games"][:g]
        if not games:
            continue
        reached += len(entry["games"]) >= g
        lines[pid] = rookie_line(games)
    stats = {}
    for stat in ROOKIE_STATS:
        values = [float(v) for line in lines.values() if (v := line[stat]) is not None]
        mine_value = mine[stat]
        stats[stat] = {
            "value": mine_value,
            "n": len(values),
            "median": r6(float(np.median(values))) if values else None,
            "p10": r6(float(np.percentile(values, 10))) if values else None,
            "p90": r6(float(np.percentile(values, 90))) if values else None,
            "percentile": None if mine_value is None else percentile_rank(mine_value, values),
        }
    return {
        "line": mine,
        "pool": len(lines),
        "reached_games": reached,
        "small_sample": (mine["minutes"] or 0) < SMALL_SAMPLE_MINUTES,
        "stats": stats,
        "comparisons": lines,
    }


def rookie_pool(
    picks: Sequence[Mapping[str, Any]], rookies: Mapping[str, Mapping[str, Any]]
) -> dict[int, dict[str, Any]]:
    """Past rookies by overall pick: classes 1983-2025 with a logged first season."""
    out: dict[int, dict[str, Any]] = defaultdict(dict)
    for p in picks:
        if ROOKIE_POOL[0] <= p["year"] <= ROOKIE_POOL[1] and p["player_id"] in rookies:
            out[p["pick"]][p["player_id"]] = {
                **rookies[p["player_id"]],
                "year": p["year"],
                "name": p["name"],
            }
    return out


# ---------------------------------------------------------------------------------------------
# Run


def load_tables(output: Path, pinned: Mapping[str, str]) -> dict[str, Any]:
    tables = {}
    for name in data.TABLES:
        body = data.read_table(output, pinned[name])
        if body.get("version") != REGISTRATION:
            raise SystemExit(f"table {name} is not this registration's")
        tables[name] = body
    return tables


def checked_inputs(output: Path) -> tuple[dict[str, Any], dict[str, Any]]:
    registration = load_registration(REGISTRATION)
    params = registration.parameters
    check_registration(params, registration.seed)
    tables = load_tables(output, params["table_sha256"])
    if tables["picks"]["draft_bundle"] != params["draft_history_bundle_sha256"]:
        raise SystemExit("the picks table was built from another draft-history bundle")
    if tables["rookies"]["dataset_id"] != params["game_log_dataset_id"]:
        raise SystemExit("the rookies table was built from another game-log dataset")
    return tables, registration_receipt(REGISTRATION)


def run(tables: Mapping[str, Any], receipt: Mapping[str, Any]) -> dict[str, Any]:
    values = pick_values(
        tables["picks"]["rows"], tables["seasons"]["players"], tables["rapm"]["players"]
    )
    retro = class_tables(values)
    combine = combine_rows(values, tables["combine"]["rows"])
    pool = rookie_pool(tables["picks"]["rows"], tables["rookies"]["players"])
    results: dict[str, Any] = {
        "version": REGISTRATION,
        "registration": dict(receipt),
        "tables": dict(receipt["parameters"]["table_sha256"]),
        "value_by_pick": value_by_pick(values),
        "bands": band_differences(values),
        **retro,
        "combine": {"rows": combine, "correlations": combine_correlations(combine)},
        "rookie_pool": {str(k): len(v) for k, v in sorted(pool.items())},
    }
    results["results_sha256"] = content_hash(results)
    return results


def write_json(path: Path, body: Mapping[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(body, indent=1, sort_keys=True) + "\n")


def command_test(output: Path, results_path: Path) -> dict[str, Any]:
    if results_path.exists():
        raise SystemExit("the results have been read; `reproduce` recomputes them, a change is v2")
    tables, receipt = checked_inputs(output)
    results = run(tables, receipt)
    write_json(results_path, results)
    return {"results_sha256": results["results_sha256"]}


def command_reproduce(output: Path, results_path: Path) -> dict[str, Any]:
    tables, receipt = checked_inputs(output)
    again = run(tables, receipt)
    frozen = json.loads(results_path.read_text())
    return {
        "frozen": frozen["results_sha256"],
        "recomputed": again["results_sha256"],
        "identical": frozen["results_sha256"] == again["results_sha256"],
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("command", choices=("test", "reproduce"))
    parser.add_argument("--output", type=Path, default=data.OUTPUT)
    parser.add_argument("--results", type=Path, default=RESULTS_PATH)
    args = parser.parse_args()
    if args.command == "test":
        out = command_test(args.output, args.results)
    else:
        out = command_reproduce(args.output, args.results)
    print(json.dumps(out, indent=1))


if __name__ == "__main__":
    main()
