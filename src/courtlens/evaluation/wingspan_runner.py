"""Wingspan beside DARKO D-DPM (`courtlens-wingspan-ddpm-v1`, R10). Descriptive association only.

From the pinned input tables (`wingspan_data`), with every rule fixed in the registration:

- one row per player: the latest NBA Draft Combine with both barefoot height and wingspan;
  position = the first listed position at that combine (PG, SG, SF, PF, C);
- career D-DPM: minutes-weighted mean of DARKO's season-end regular-season D-DPM over the
  player's regular seasons 2000-01 to 2025-26 with at least 500 logged minutes;
- Pearson r between height, wingspan, wingspan minus height and career D-DPM (all players and
  within each position) and D-DPM against wingspan with height partialled out, each with a
  seeded percentile bootstrap over players;
- positional averages with counts and bootstrap intervals;
- the z-score parameters the API's nearest-build search uses.

It is not a forecast and not a causal claim: DARKO's season-end boards are retrospective ratings
that include the season's own games. Subcommands: `test` (one read; refused once results exist)
and `reproduce` (recompute and compare hashes).
"""

from __future__ import annotations

import argparse
import json
import math
from collections.abc import Mapping, Sequence
from pathlib import Path
from typing import Any

import numpy as np

from courtlens.domain.research_registry import load_registration, registration_receipt
from courtlens.evaluation import wingspan_data as data
from courtlens.ingestion.native_reconstruction import content_hash

REGISTRATION = data.REGISTRATION
RESULTS_PATH = Path("evaluation/research/frozen/courtlens-wingspan-ddpm-v1.json")
SEED = 1010
REPLICATES = 2000
INTERVAL = (2.5, 97.5)
MIN_MINUTES = 500
POSITIONS = ("PG", "SG", "SF", "PF", "C")
VARIABLES = ("height", "wingspan", "diff", "d_dpm")
# Pairs among the measurements use every measured player; pairs with D-DPM the analysis population.
PAIRS = (
    ("diff", "d_dpm"),
    ("wingspan", "d_dpm"),
    ("height", "d_dpm"),
    ("height", "wingspan"),
    ("height", "diff"),
    ("wingspan", "diff"),
)
WITHIN_POSITION_PAIRS = (("diff", "d_dpm"), ("wingspan", "d_dpm"), ("height", "d_dpm"))
AVERAGED = ("height", "wingspan", "diff", "weight", "d_dpm")
NEAREST_INPUTS = ("height", "wingspan")
NEAREST_K = 5

PARAMETERS: dict[str, Any] = {
    "seed": SEED,
    "replicates": REPLICATES,
    "interval_percentiles": list(INTERVAL),
    "seasons": [data.FIRST_SEASON, data.LAST_SEASON],
    "min_season_minutes": MIN_MINUTES,
    "positions": list(POSITIONS),
    "pairs": [list(p) for p in PAIRS],
    "within_position_pairs": [list(p) for p in WITHIN_POSITION_PAIRS],
    "averaged": list(AVERAGED),
    "nearest_inputs": list(NEAREST_INPUTS),
    "nearest_k": NEAREST_K,
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
# One row per player


def chosen_combine(rows: Sequence[Mapping[str, Any]]) -> Mapping[str, Any]:
    """The latest combine with both barefoot height and wingspan, else the latest combine."""
    measured = [
        r
        for r in rows
        if r["height_no_shoes_inches"] is not None and r["wingspan_inches"] is not None
    ]
    return max(measured or rows, key=lambda r: r["draft_year"])


def position_of(label: str | None) -> str | None:
    first = (label or "").split("-")[0].strip().upper()
    return first if first in POSITIONS else None


def career(seasons: Mapping[str, Mapping[str, Any]]) -> dict[str, Any]:
    """Minutes-weighted D-DPM over qualifying seasons; why a player has none, when he has none."""
    logged = {s: v for s, v in seasons.items() if v["minutes"]}
    qualifying = {
        s: v for s, v in logged.items() if v["minutes"] >= MIN_MINUTES and v["d_dpm"] is not None
    }
    latest_logged = max(logged) if logged else None
    if qualifying:
        weight = sum(v["minutes"] for v in qualifying.values())
        value = sum(v["minutes"] * v["d_dpm"] for v in qualifying.values()) / weight
        latest = max(qualifying)
        return {
            "d_dpm": value,
            "seasons": len(qualifying),
            "minutes": weight,
            "first_season": min(qualifying),
            "last_season": latest,
            "photo_season": latest,
            "photo_team": qualifying[latest]["team"],
            "reason": None,
        }
    if not logged:
        reason = "no_nba_minutes"
    elif not any(v["minutes"] >= MIN_MINUTES for v in logged.values()):
        reason = "no_season_at_min_minutes"
    else:
        reason = "no_darko_rating_in_qualifying_seasons"
    return {
        "d_dpm": None,
        "seasons": 0,
        "minutes": sum(v["minutes"] for v in logged.values()),
        "first_season": None,
        "last_season": None,
        "photo_season": latest_logged,
        "photo_team": logged[latest_logged]["team"] if latest_logged else None,
        "reason": reason,
    }


def player_rows(tables: Mapping[str, Any]) -> list[dict[str, Any]]:
    seasons = tables["seasons"]["players"]
    out = []
    for pid, rows in tables["combine"]["players"].items():
        chosen = chosen_combine(rows)
        height, span = chosen["height_no_shoes_inches"], chosen["wingspan_inches"]
        measured = height is not None and span is not None
        c = career(seasons.get(pid, {}))
        reason = "not_measured" if not measured else c["reason"]
        out.append(
            {
                "player_id": pid,
                "name": chosen["name"],
                "combine_year": chosen["draft_year"],
                "combines": len(rows),
                "position_label": chosen["position"],
                "position": position_of(chosen["position"]),
                "height": height,
                "height_shoes": chosen["height_shoes_inches"],
                "wingspan": span,
                "diff": None if not measured else span - height,
                "weight": chosen["weight_lbs"],
                "standing_reach": chosen["standing_reach_inches"],
                "measured": measured,
                "career": {k: v for k, v in c.items() if k != "reason"},
                "d_dpm": c["d_dpm"] if measured else None,
                "in_population": measured and c["d_dpm"] is not None,
                "exclusion": reason,
            }
        )
    return out


# ---------------------------------------------------------------------------------------------
# Statistics


def pearson(x: np.ndarray, y: np.ndarray) -> float:
    if len(x) < 3 or np.std(x) == 0 or np.std(y) == 0:
        return float("nan")
    return float(np.corrcoef(x, y)[0, 1])


def partial(x: np.ndarray, y: np.ndarray, z: np.ndarray) -> float:
    """r between x and y after removing a straight-line fit on z from each."""

    def residual(a: np.ndarray) -> np.ndarray:
        slope, intercept = np.polyfit(z, a, 1)
        return np.asarray(a - (slope * z + intercept))

    return pearson(residual(x), residual(y))


def boot_interval(
    stat: Any, columns: Sequence[np.ndarray], rng: np.random.Generator
) -> tuple[float | None, float | None]:
    n = len(columns[0])
    if n < 3:
        return None, None
    values = []
    for _ in range(REPLICATES):
        idx = rng.integers(0, n, n)
        v = stat(*(c[idx] for c in columns))
        if math.isfinite(v):
            values.append(v)
    if not values:
        return None, None
    lo, hi = np.percentile(values, INTERVAL)
    return float(lo), float(hi)


def verdict(lo: float | None, hi: float | None) -> str:
    if lo is None or hi is None:
        return "unknown"
    if lo > 0:
        return "positive"
    if hi < 0:
        return "negative"
    return "not_distinguishable_from_zero"


def correlation(
    rows: Sequence[Mapping[str, Any]], x: str, y: str, keys: Sequence[int]
) -> dict[str, Any]:
    pairs = [(r[x], r[y]) for r in rows if r[x] is not None and r[y] is not None]
    xs = np.array([p[0] for p in pairs], dtype=float)
    ys = np.array([p[1] for p in pairs], dtype=float)
    r = pearson(xs, ys) if len(pairs) else float("nan")
    lo, hi = boot_interval(pearson, [xs, ys], rng_for(*keys))
    return {
        "x": x,
        "y": y,
        "n": len(pairs),
        "r": r6(r),
        "low": r6(lo),
        "high": r6(hi),
        "verdict": verdict(lo, hi),
    }


def mean_with_interval(values: Sequence[float], keys: Sequence[int]) -> dict[str, Any]:
    arr = np.array(values, dtype=float)
    if not len(arr):
        return {"n": 0, "mean": None, "low": None, "high": None}
    lo, hi = boot_interval(lambda a: float(np.mean(a)), [arr], rng_for(*keys))
    return {"n": len(arr), "mean": r6(float(np.mean(arr))), "low": r6(lo), "high": r6(hi)}


def percentile_of(values: Sequence[float]) -> list[float]:
    """Mid-rank percentile (0-100) of each value within the list."""
    arr = np.array(values, dtype=float)
    out = []
    for v in arr:
        below = float(np.sum(arr < v))
        equal = float(np.sum(arr == v))
        out.append(round(100 * (below + 0.5 * equal) / len(arr), 1))
    return out


def summarize(players: list[dict[str, Any]]) -> dict[str, Any]:
    measured = [p for p in players if p["measured"]]
    population = [p for p in measured if p["in_population"]]
    correlations = []
    for i, (x, y) in enumerate(PAIRS):
        group = population if "d_dpm" in (x, y) else measured
        correlations.append(
            {
                **correlation(group, x, y, (1, i)),
                "population": "analysis" if group is population else "measured",
            }
        )
    within = []
    for j, pos in enumerate(POSITIONS):
        group = [p for p in population if p["position"] == pos]
        for i, (x, y) in enumerate(WITHIN_POSITION_PAIRS):
            within.append({"position": pos, **correlation(group, x, y, (2, j, i))})
    h = np.array([p["height"] for p in population], dtype=float)
    w = np.array([p["wingspan"] for p in population], dtype=float)
    d = np.array([p["d_dpm"] for p in population], dtype=float)
    pr = partial(w, d, h) if len(population) >= 3 else float("nan")
    lo, hi = boot_interval(partial, [w, d, h], rng_for(3))
    partial_result = {
        "x": "wingspan",
        "y": "d_dpm",
        "controlling_for": "height",
        "n": len(population),
        "r": r6(pr),
        "low": r6(lo),
        "high": r6(hi),
        "verdict": verdict(lo, hi),
    }
    averages = []
    groups: list[tuple[str, list[dict[str, Any]], list[dict[str, Any]]]] = [
        ("ALL", measured, population)
    ]
    groups += [
        (
            pos,
            [p for p in measured if p["position"] == pos],
            [p for p in population if p["position"] == pos],
        )
        for pos in POSITIONS
    ]
    for g, (pos, m_group, a_group) in enumerate(groups):
        entry: dict[str, Any] = {"position": pos}
        for k, var in enumerate(AVERAGED):
            group = a_group if var == "d_dpm" else m_group
            entry[var] = mean_with_interval(
                [p[var] for p in group if p[var] is not None], (4, g, k)
            )
        averages.append(entry)
    unassigned = [p["player_id"] for p in measured if p["position"] is None]
    params = {}
    for var in NEAREST_INPUTS:
        arr = np.array([p[var] for p in measured], dtype=float)
        params[var] = {"mean": r6(float(np.mean(arr))), "sd": r6(float(np.std(arr)))}
    for var in ("height", "wingspan", "diff"):
        ranks = percentile_of([p[var] for p in measured])
        for p, rank in zip(measured, ranks, strict=True):
            p.setdefault("percentiles", {})[var] = rank
    ranks = percentile_of([p["d_dpm"] for p in population])
    for p, rank in zip(population, ranks, strict=True):
        p.setdefault("percentiles", {})["d_dpm"] = rank
    for p in players:
        p.setdefault("percentiles", {})
    return {
        "population": {
            "players_with_person_id": len(players),
            "measured": len(measured),
            "analysis": len(population),
            "position_unassigned": unassigned,
            "exclusions": {
                reason: sum(1 for p in players if p["exclusion"] == reason)
                for reason in sorted({p["exclusion"] for p in players if p["exclusion"]})
            },
        },
        "correlations": correlations,
        "within_position": within,
        "partial": partial_result,
        "positional_averages": averages,
        "nearest": {"inputs": list(NEAREST_INPUTS), "k": NEAREST_K, "scaling": params},
    }


def clean(row: Mapping[str, Any]) -> dict[str, Any]:
    def rounded(v: Any) -> Any:
        if isinstance(v, float):
            return r6(v)
        if isinstance(v, dict):
            return {k: rounded(x) for k, x in v.items()}
        return v

    return {k: rounded(v) for k, v in row.items()}


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
    if tables["seasons"]["dataset_id"] != params["game_log_dataset_id"]:
        raise SystemExit("the seasons table was built from another game-log dataset")
    if tables["seasons"]["darko_bundle_sha256"] != params["darko_bundle_sha256"]:
        raise SystemExit("the seasons table was built from another DARKO bundle")
    return tables, registration_receipt(REGISTRATION)


def run(tables: Mapping[str, Any], receipt: Mapping[str, Any]) -> dict[str, Any]:
    players = player_rows(tables)
    summary = summarize(players)
    results: dict[str, Any] = {
        "version": REGISTRATION,
        "registration": dict(receipt),
        "tables": dict(receipt["parameters"]["table_sha256"]),
        "darko_boards": tables["seasons"]["boards"],
        **summary,
        "players": [clean(p) for p in sorted(players, key=lambda p: p["player_id"])],
    }
    results["results_sha256"] = content_hash(results)
    return results


EXPECTED_KEYS = (
    "version",
    "registration",
    "tables",
    "darko_boards",
    "population",
    "correlations",
    "within_position",
    "partial",
    "positional_averages",
    "nearest",
    "players",
    "results_sha256",
)


def write_json(path: Path, body: Mapping[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(body, indent=1, sort_keys=True) + "\n")


def command_test(output: Path, results_path: Path) -> dict[str, Any]:
    if results_path.exists():
        raise SystemExit("the results have been read; `reproduce` recomputes them, a change is v2")
    tables, receipt = checked_inputs(output)
    results = run(tables, receipt)
    missing = [k for k in EXPECTED_KEYS if k not in results]
    if missing:
        raise SystemExit(f"results lack {missing}")
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
