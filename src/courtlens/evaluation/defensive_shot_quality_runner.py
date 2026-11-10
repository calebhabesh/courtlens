"""Run `courtlens-defensive-shot-quality-v1` (Research R06, Part B).

For each defender and regular season: the field-goal points shooters scored in their matchups
against what those shooters' own season shooting predicts, leaving out their attempts against this
defender. Positive is good. Nothing is chosen from outcomes, so there is one pass; every constant
is checked against the registration.

    systemd-run --user --wait --collect -p MemoryMax=4G -p MemorySwapMax=0 \
      -E OMP_NUM_THREADS=1 -E OPENBLAS_NUM_THREADS=1 -E MKL_NUM_THREADS=1 \
      --working-directory=<directory with data/ and evaluation/> \
      .venv/bin/python -m courtlens.evaluation.defensive_shot_quality_runner run --out <file>
"""

from __future__ import annotations

import argparse
import hashlib
import json
import resource
import time
from collections.abc import Mapping
from itertools import pairwise
from pathlib import Path
from typing import Any

import numpy as np

from courtlens.domain.research_registry import load_registration, registration_receipt
from courtlens.evaluation import defensive_shot_quality_data as data
from courtlens.evaluation import expected_shot_v2_data as shots_data
from courtlens.evaluation.shot_decomposition_runner import (
    _check_threads,
    _rounded,
    canonical,
    weighted_corr,
)

REGISTRATION = "courtlens-defensive-shot-quality-v1"
FROZEN = Path("evaluation/research/frozen/courtlens-defensive-shot-quality-v1.json")
PART_A = Path("evaluation/research/frozen/courtlens-shot-decomposition-v1.json")
R03_FROZEN = Path("evaluation/research/frozen/courtlens-signal-noise-v1.json")
SEASONS = data.SEASONS
KINDS = ("all", "2pt", "3pt")
MIN_FGA = 300
MIN_TYPE_FGA = 100
KEY_MATCHUPS = 5
REPLICATES = 2000
LEVEL = 0.95
SEED = 7007
PART_A_METRICS = ("sq", "make", "ts")
PERSISTENCE_METRICS = ("dsq", "xpps", "pps")


def parameters() -> dict[str, Any]:
    registration = load_registration(REGISTRATION)
    params = registration.parameters
    checks: dict[str, Any] = {
        "seasons": list(SEASONS),
        "kinds": list(KINDS),
        "min_fga": MIN_FGA,
        "min_type_fga": MIN_TYPE_FGA,
        "key_matchups": KEY_MATCHUPS,
        "bootstrap_replicates": REPLICATES,
        "interval": LEVEL,
    }
    for key, value in checks.items():
        if params[key] != value:
            raise SystemExit(f"module constant {key} differs from the registration")
    if registration.seed != SEED:
        raise SystemExit("seed differs from the registration")
    return params


def load_table(season: str, expected_sha: str, root: Path = data.OUTPUT) -> dict[str, np.ndarray]:
    matches = sorted(root.glob(f"{season}.{expected_sha[:16]}.npz"))
    if len(matches) != 1:
        raise SystemExit(f"no pinned matchup table for {season}")
    with np.load(matches[0]) as stored:
        arrays = {name: stored[name] for name in stored.files}
    if shots_data.content_sha(arrays) != expected_sha:
        raise SystemExit(f"matchup table for {season} differs from the registration")
    return arrays


def priors(season: str, source: Mapping[str, Any]) -> dict[str, tuple[float, float]]:
    result = {}
    for name, stat in (("2pt", "fg2_pct"), ("3pt", "fg3_pct")):
        entry = source[stat][season]
        if not entry["converged"] or entry["on_bound"]:
            raise SystemExit(f"R03 prior {stat} {season} is not usable")
        result[name] = (float(entry["alpha"]), float(entry["beta"]))
    return result


def expected_rates(
    t: Mapping[str, np.ndarray], attempts: str, makes: str, prior: tuple[float, float]
) -> np.ndarray:
    """Per row: the shooter's posterior make rate, leaving out his attempts on this defender."""
    alpha, beta = prior
    shooters, shooter_index = np.unique(t["shooter"], return_inverse=True)
    total_a = np.bincount(shooter_index, weights=t[attempts], minlength=len(shooters))
    total_m = np.bincount(shooter_index, weights=t[makes], minlength=len(shooters))
    pairs = np.column_stack([t["shooter"], t["defender"]])
    _, pair_index = np.unique(pairs, axis=0, return_inverse=True)
    pair_index = pair_index.reshape(-1)
    pair_a = np.bincount(pair_index, weights=t[attempts])[pair_index]
    pair_m = np.bincount(pair_index, weights=t[makes])[pair_index]
    rest_a = total_a[shooter_index] - pair_a
    rest_m = total_m[shooter_index] - pair_m
    return (alpha + rest_m) / (alpha + beta + rest_a)


def attempt_values(
    t: Mapping[str, np.ndarray], prior: Mapping[str, tuple[float, float]]
) -> dict[str, dict[str, np.ndarray]]:
    """n, actual and expected field-goal points per row, for all, 2PT and 3PT attempts."""
    fga2, fga3 = t["fga2"].astype(float), t["fga3"].astype(float)
    e2 = fga2 * 2 * expected_rates(t, "fga2", "fgm2", prior["2pt"])
    e3 = fga3 * 3 * expected_rates(t, "fga3", "fgm3", prior["3pt"])
    a2, a3 = 2.0 * t["fgm2"], 3.0 * t["fgm3"]
    values = {
        "2pt": {"n": fga2, "actual": a2, "expected": e2},
        "3pt": {"n": fga3, "actual": a3, "expected": e3},
        "all": {"n": fga2 + fga3, "actual": a2 + a3, "expected": e2 + e3},
    }
    for block in values.values():
        if not all(np.all(np.isfinite(v)) for v in block.values()):
            raise SystemExit("non-finite matchup value")
    return values


def season_result(
    season: str, t: Mapping[str, np.ndarray], prior: Mapping[str, Any]
) -> dict[str, Any]:
    values = attempt_values(t, prior)
    league = {}
    for kind in KINDS:
        v = values[kind]
        n = float(v["n"].sum())
        league[kind] = {
            "fga": n,
            "pps": float(v["actual"].sum()) / n,
            "xpps": float(v["expected"].sum()) / n,
            "term": (float(v["expected"].sum()) - float(v["actual"].sum())) / n,
        }
    defenders, index = np.unique(t["defender"], return_inverse=True)
    games, game_index = np.unique(t["game_id"], return_inverse=True)
    rows: list[dict[str, Any]] = []
    year = int(season[:4])
    for j, pid in enumerate(defenders):
        mine = np.flatnonzero(index == j)
        fga = float(values["all"]["n"][mine].sum())
        my_games = np.unique(game_index[mine])
        teams = t["defender_team"][mine]
        names, volume = np.unique(teams, return_counts=False), {}
        for name in names:
            volume[int(name)] = float(values["all"]["n"][mine][teams == name].sum())
        team = max(sorted(volume), key=lambda k: volume[k])
        entry: dict[str, Any] = {
            "player_id": str(int(pid)),
            "team_id": str(team),
            "games": len(my_games),
            "fga": fga,
            "status": "served" if fga >= MIN_FGA else "small_sample",
        }
        if fga >= MIN_FGA:
            entry["kinds"] = {}
            local = np.searchsorted(my_games, game_index[mine])
            for k, kind in enumerate(KINDS):
                entry["kinds"][kind] = kind_value(
                    values[kind],
                    mine,
                    local,
                    len(my_games),
                    league[kind]["term"],
                    [SEED, year, k, int(pid)],
                    MIN_FGA if kind == "all" else MIN_TYPE_FGA,
                )
            entry["key_matchups"] = key_matchups(t, values["all"], mine)
        rows.append(entry)
    served = [r for r in rows if r["status"] == "served"]
    if not served:
        raise SystemExit(f"{season}: no qualified defenders")
    excluding = [
        r
        for r in served
        if r["kinds"]["all"]["interval"][0] > 0 or r["kinds"]["all"]["interval"][1] < 0
    ]
    return {
        "season": season,
        "games": len(games),
        "table_rows": len(t["shooter"]),
        "league": league,
        "defenders": len(rows),
        "defenders_served": len(served),
        "interval_excludes_zero": len(excluding),
        "interval_excludes_zero_share": len(excluding) / len(served),
        "median_interval_width": float(
            np.median(
                [
                    r["kinds"]["all"]["interval"][1] - r["kinds"]["all"]["interval"][0]
                    for r in served
                ]
            )
        ),
        "players": rows,
    }


def kind_value(
    v: Mapping[str, np.ndarray],
    mine: np.ndarray,
    local: np.ndarray,
    games: int,
    term: float,
    seed: list[int],
    minimum: int,
) -> dict[str, Any]:
    n = float(v["n"][mine].sum())
    if n < minimum:
        return {
            "status": "small_sample",
            "fga": n,
            "pps": None,
            "xpps": None,
            "dsq": None,
            "interval": None,
        }
    actual, expected = float(v["actual"][mine].sum()), float(v["expected"][mine].sum())
    sums = [
        np.bincount(local, weights=v[key][mine], minlength=games)
        for key in ("n", "actual", "expected")
    ]
    rng = np.random.default_rng(np.random.SeedSequence(seed))
    counts = rng.multinomial(games, np.full(games, 1.0 / games), size=REPLICATES)
    n_rep, a_rep, e_rep = (counts @ s for s in sums)
    valid = n_rep > 0
    draws = 100.0 * ((e_rep[valid] - a_rep[valid]) / n_rep[valid] - term)
    tail = (1 - LEVEL) / 2 * 100
    return {
        "status": "served",
        "fga": n,
        "pps": actual / n,
        "xpps": expected / n,
        "dsq": 100.0 * ((expected - actual) / n - term),
        "interval": [float(np.percentile(draws, tail)), float(np.percentile(draws, 100 - tail))],
    }


def key_matchups(
    t: Mapping[str, np.ndarray], v: Mapping[str, np.ndarray], mine: np.ndarray
) -> list[dict[str, Any]]:
    shooters = t["shooter"][mine]
    result: list[dict[str, Any]] = []
    for shooter in np.unique(shooters):
        rows = mine[shooters == shooter]
        n = float(v["n"][rows].sum())
        result.append(
            {
                "player_id": str(int(shooter)),
                "team_id": str(int(t["shooter_team"][rows[-1]])),
                "fga": n,
                "pps": float(v["actual"][rows].sum()) / n,
                "xpps": float(v["expected"][rows].sum()) / n,
            }
        )
    result.sort(key=lambda m: (-float(m["fga"]), str(m["player_id"])))
    return result[:KEY_MATCHUPS]


def cluster_correlations(
    rows: list[dict[str, Any]], metrics: tuple[str, ...], seed: int
) -> dict[str, Any]:
    """Pooled weighted correlations with a player-cluster bootstrap. A row is one pair of values."""
    if len(rows) < 3:
        return {
            "pairs": len(rows),
            "players": len({r["player"] for r in rows}),
            "correlations": None,
        }
    ids = sorted({r["player"] for r in rows})
    position = {p: i for i, p in enumerate(ids)}
    cluster = np.array([position[r["player"]] for r in rows])
    members = [np.flatnonzero(cluster == c) for c in range(len(ids))]
    weight = np.array([r["weight"] for r in rows])
    arrays = {
        m: (np.array([r[m][0] for r in rows]), np.array([r[m][1] for r in rows])) for m in metrics
    }
    rng = np.random.default_rng(seed)
    draws: dict[str, list[float]] = {m: [] for m in metrics}
    for _ in range(REPLICATES):
        chosen = rng.integers(0, len(ids), len(ids))
        sel = np.concatenate([members[c] for c in chosen])
        for m, (x, y) in arrays.items():
            draws[m].append(weighted_corr(x[sel], y[sel], weight[sel]))
    tail = (1 - LEVEL) / 2 * 100
    return {
        "pairs": len(rows),
        "players": len(ids),
        "correlations": {
            m: {
                "r": weighted_corr(arrays[m][0], arrays[m][1], weight),
                "interval": [
                    float(np.percentile(draws[m], tail)),
                    float(np.percentile(draws[m], 100 - tail)),
                ],
            }
            for m in metrics
        },
    }


def persistence(seasons: Mapping[str, Mapping[str, Any]]) -> dict[str, Any]:
    rows, by_pair = [], {}
    for a, b in pairwise(sorted(seasons)):
        first = {p["player_id"]: p for p in seasons[a]["players"] if p["status"] == "served"}
        second = {p["player_id"]: p for p in seasons[b]["players"] if p["status"] == "served"}
        common = sorted(set(first) & set(second))
        by_pair[f"{a}->{b}"] = len(common)
        for pid in common:
            x, y = first[pid], second[pid]
            row: dict[str, Any] = {"player": pid, "weight": 2 / (1 / x["fga"] + 1 / y["fga"])}
            for m in PERSISTENCE_METRICS:
                row[m] = (x["kinds"]["all"][m], y["kinds"]["all"][m])
            rows.append(row)
    return {**cluster_correlations(rows, PERSISTENCE_METRICS, SEED), "pairs_by_season": by_pair}


def agreement(
    seasons: Mapping[str, Mapping[str, Any]], part_a: Mapping[str, Any]
) -> dict[str, Any]:
    """Matchup D-SQ against Part A's defensive RAPM values, same player and season."""
    rows = []
    for season, block in part_a["seasons"].items():
        served = {p["player_id"]: p for p in block["players"] if p["status"] == "served"}
        for p in seasons[season]["players"] if season in seasons else []:
            other = served.get(p["player_id"])
            if p["status"] != "served" or other is None:
                continue
            row: dict[str, Any] = {
                "player": p["player_id"],
                "weight": 2 / (1 / p["fga"] + 1 / other["defense_shots"]),
            }
            for m in PART_A_METRICS:
                row[m] = (p["kinds"]["all"]["dsq"], other["defense"][m])
            rows.append(row)
    return cluster_correlations(rows, PART_A_METRICS, SEED + 1)


def run(
    tables: Mapping[str, Mapping[str, np.ndarray]],
    prior_source: Mapping[str, Any],
    part_a: Mapping[str, Any],
    receipts: Mapping[str, Any],
    receipt: Mapping[str, Any],
) -> dict[str, Any]:
    seasons = {s: season_result(s, tables[s], priors(s, prior_source)) for s in sorted(tables)}
    served = sum(b["defenders_served"] for b in seasons.values())
    excluding = sum(b["interval_excludes_zero"] for b in seasons.values())
    body = {
        "registration": dict(receipt),
        "data": dict(receipts),
        "part_a_results_sha256": part_a["results_sha256"],
        "seasons": seasons,
        "signal": {
            "defender_seasons": served,
            "interval_excludes_zero": excluding,
            "share": excluding / served,
            "share_expected_if_no_signal": 1 - LEVEL,
        },
        "persistence": persistence(seasons),
        "agreement_with_rapm": agreement(seasons, part_a),
    }
    rounded = dict(_rounded(body))
    rounded["results_sha256"] = hashlib.sha256(canonical(rounded)).hexdigest()
    return rounded


EVIDENCE_SECTIONS = (
    "registration",
    "data",
    "signal",
    "persistence",
    "agreement_with_rapm",
    "results_sha256",
)


def evidence_extract(result: Mapping[str, Any]) -> dict[str, Any]:
    out: dict[str, Any] = {k: result[k] for k in EVIDENCE_SECTIONS}
    out["seasons"] = {
        s: {k: v for k, v in body.items() if k != "players"}
        for s, body in result["seasons"].items()
    }
    return out


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("command", choices=("run",))
    parser.add_argument("--out", type=Path, default=FROZEN)
    parser.add_argument("--log", type=Path)
    args = parser.parse_args()
    _check_threads()
    params = parameters()
    started = time.monotonic()
    part_a = json.loads(PART_A.read_text())
    if part_a["results_sha256"] != params["part_a_results_sha256"]:
        raise SystemExit("Part A results differ from the registration")
    tables = {s: load_table(s, params["table_sha256"][s]) for s in SEASONS}
    receipts = {s: json.loads((data.OUTPUT / f"{s}.receipt.json").read_text()) for s in SEASONS}
    result = run(
        tables,
        json.loads(R03_FROZEN.read_text())["priors"],
        part_a,
        receipts,
        registration_receipt(REGISTRATION),
    )
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(result, sort_keys=True, separators=(",", ":")) + "\n")
    log = {
        "results_sha256": result["results_sha256"],
        "wall_seconds": round(time.monotonic() - started, 1),
        "peak_rss_mib": round(resource.getrusage(resource.RUSAGE_SELF).ru_maxrss / 1024, 1),
    }
    if args.log:
        args.log.write_text(json.dumps(log, indent=1) + "\n")
    print(json.dumps(log), flush=True)


if __name__ == "__main__":
    main()
