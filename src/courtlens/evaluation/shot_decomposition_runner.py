"""Run `courtlens-shot-decomposition-v1` (Research R06, Part A).

Four parallel ridge regressions on the R01 possessions (Databallr's ShotQuality RAPM method, on
CourtLens's own expected-shot model): TS, SQ, MAKE and FT, offence and defence, one regular
season at a time, with one fixed penalty for all four targets. Then game-bootstrap intervals,
the second-stage WLS check (oTS on oSQ + oMake + oFT) and the registered persistence check
(does oMake carry over from one season to the next less than oSQ?). Nothing is chosen from
outcomes, so there is one pass. Every constant is checked against the registration.

    systemd-run --user --wait --collect -p MemoryMax=4G -p MemorySwapMax=0 \
      -E OMP_NUM_THREADS=1 -E OPENBLAS_NUM_THREADS=1 -E MKL_NUM_THREADS=1 \
      --working-directory=<directory with data/ and evaluation/> \
      .venv/bin/python -m courtlens.evaluation.shot_decomposition_runner run --out <file>
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import resource
import time
from collections import Counter
from collections.abc import Mapping
from itertools import pairwise
from pathlib import Path
from typing import Any

import numpy as np
from scipy import linalg, sparse  # type: ignore[import-untyped]

from courtlens.domain import shot_decomposition as sd
from courtlens.domain.research_registry import load_registration, registration_receipt
from courtlens.evaluation import expected_shot_v2_data as shots_data
from courtlens.evaluation import shot_decomposition_data as data

REGISTRATION = "courtlens-shot-decomposition-v1"
FROZEN = Path("evaluation/research/frozen/courtlens-shot-decomposition-v1.json")
TABLES = data.OUTPUT
SEASONS = data.SEASONS
TARGETS = ("ts", "sq", "make", "ft")
SIDES = ("offense", "defense")
ALPHA = 3000.0
SCALE = 100.0
MIN_GAMES = 20
MIN_SHOTS = 1000
REPLICATES = 200
PERCENTILES = (10, 90)
PERSISTENCE_REPLICATES = 2000
PERSISTENCE_LEVEL = 0.95
SEED = 6006
SOLVE_TOLERANCE = 1e-9
ADDITIVITY_TOLERANCE = 1e-6


def parameters(identity: str = REGISTRATION) -> dict[str, Any]:
    registration = load_registration(identity)
    params = registration.parameters
    checks: dict[str, Any] = {
        "seasons": list(SEASONS),
        "targets": list(TARGETS),
        "alpha": ALPHA,
        "scale": SCALE,
        "min_games": MIN_GAMES,
        "min_shots_each_side": MIN_SHOTS,
        "bootstrap_replicates": REPLICATES,
        "percentiles": list(PERCENTILES),
        "persistence_replicates": PERSISTENCE_REPLICATES,
        "persistence_interval": PERSISTENCE_LEVEL,
        "ft_history_seasons": data.HISTORY_SEASONS,
        "trip_sizes": dict(sd.TRIP_SIZE),
        "solve_tolerance": SOLVE_TOLERANCE,
        "additivity_tolerance": ADDITIVITY_TOLERANCE,
    }
    for key, value in checks.items():
        if params[key] != value:
            raise SystemExit(f"module constant {key} differs from the registration")
    if registration.seed != SEED:
        raise SystemExit("seed differs from the registration")
    return params


def _check_threads() -> None:
    for name in ("OMP_NUM_THREADS", "OPENBLAS_NUM_THREADS", "MKL_NUM_THREADS"):
        if os.environ.get(name) != "1":
            raise SystemExit(f"{name}=1 is required (registered budget: one thread)")


def load_table(season: str, expected_sha: str, root: Path = TABLES) -> dict[str, np.ndarray]:
    matches = sorted(root.glob(f"{season}.{expected_sha[:16]}.npz"))
    if len(matches) != 1:
        raise SystemExit(f"no pinned attempt table for {season}")
    with np.load(matches[0]) as stored:
        arrays = {name: stored[name] for name in stored.files}
    if shots_data.content_sha(arrays) != expected_sha:
        raise SystemExit(f"attempt table for {season} differs from the registration")
    return arrays


# ---- Targets ------------------------------------------------------------------------------------


def targets(t: Mapping[str, np.ndarray]) -> dict[str, Any]:
    """Shots and the four per-attempt values; TS = SQ + MAKE + FT on every row."""
    kind = t["kind"]
    fga = kind == sd.FGA
    if not fga.any():
        raise SystemExit("no field-goal attempts")
    if np.isnan(t["expected_points"][fga]).any() or np.isnan(t["ft_probability"][~fga]).any():
        raise SystemExit("an attempt has no expected value")
    avg_points = float(np.mean(t["actual"][fga]))
    shift = avg_points - float(np.mean(t["expected_points"][fga]))
    size = np.zeros(len(kind))
    for name, n in sd.TRIP_SIZE.items():
        size[kind == name] = n
    trip = size > 0
    shots = np.where(fga, 1.0, np.where(trip, 1.0 / np.where(trip, size, 1.0), 0.0))
    ft_value = np.where(fga, 0.0, t["ft_probability"])
    ts = np.where(fga, t["actual"], ft_value)
    sq = np.where(
        fga,
        t["expected_points"] + shift,
        np.where(trip, avg_points / np.where(trip, size, 1.0), 0.0),
    )
    make = np.where(fga, ts - sq, 0.0)
    ft = np.where(fga, 0.0, ts - sq)
    values = np.column_stack([ts, sq, make, ft])
    if not np.all(np.isfinite(values)):
        raise SystemExit("non-finite target")
    residual = float(np.max(np.abs(ts - (sq + make + ft))))
    # The vectorised values must equal the domain rule row by row (first and last 500 rows).
    for i in [*range(min(500, len(kind))), *range(max(0, len(kind) - 500), len(kind))]:
        rule = sd.attempt_targets(
            str(kind[i]),
            points=float(t["actual"][i]),
            expected_points=float(t["expected_points"][i] + shift) if fga[i] else 0.0,
            ft_probability=float(t["ft_probability"][i]) if not fga[i] else 0.0,
            avg_points=avg_points,
        )
        expected = (rule.shots, rule.ts, rule.sq, rule.make, rule.ft)
        if not np.allclose([shots[i], *values[i]], expected, rtol=0, atol=1e-12):
            raise SystemExit(f"vectorised targets differ from the domain rule at row {i}")
    unknown = sorted(set(map(str, kind)) - set(sd.KINDS))
    if unknown:
        raise SystemExit(f"unknown attempt kinds {unknown}")
    return {
        "shots": shots,
        "values": values,
        "avg_points": avg_points,
        "shift": shift,
        "row_additivity_residual": residual,
    }


# ---- Groups and design --------------------------------------------------------------------------


def groups(t: Mapping[str, np.ndarray], shots: np.ndarray, values: np.ndarray) -> dict[str, Any]:
    """Sum attempts with the same game, offence five, defence five and home side.

    Weighted least squares on these sums (weight = shots, value = sum / shots) gives exactly the
    same ridge coefficients as one row per attempt; groups with no shots carry no weight.
    """
    games, game_index = np.unique(t["game_id"], return_inverse=True)
    keys = np.column_stack([game_index, t["off"], t["def"], t["offense_home"]])
    unique, inverse = np.unique(keys, axis=0, return_inverse=True)
    inverse = inverse.reshape(-1)
    count = len(unique)
    weight = np.bincount(inverse, weights=shots, minlength=count)
    sums = np.column_stack(
        [
            np.bincount(inverse, weights=values[:, k], minlength=count)
            for k in range(values.shape[1])
        ]
    )
    keep = weight > 0
    dropped = sums[~keep].sum(axis=0)
    return {
        "games": games,
        "game": unique[keep, 0].astype(np.int64),
        "off": unique[keep, 1:6].astype(np.int64),
        "def": unique[keep, 6:11].astype(np.int64),
        "home": unique[keep, 11].astype(np.int64),
        "weight": weight[keep],
        "y": sums[keep] / weight[keep, None],
        "zero_shot_groups": int((~keep).sum()),
        "zero_shot_group_values": {name: float(dropped[k]) for k, name in enumerate(TARGETS)},
    }


def design(g: Mapping[str, Any]) -> tuple[np.ndarray, sparse.csr_matrix]:
    """Offence and defence indicator blocks plus a signed home column, as the sealed fits."""
    players = np.unique(np.concatenate([g["off"].reshape(-1), g["def"].reshape(-1)]))
    n = len(players)
    rows = len(g["weight"])
    off = np.searchsorted(players, g["off"])
    defense = np.searchsorted(players, g["def"]) + n
    r = np.repeat(np.arange(rows), 11)
    c = np.column_stack([off, defense, np.full(rows, 2 * n)]).reshape(-1)
    v = np.column_stack(
        [np.ones((rows, 10)), np.where(g["home"] == 1, 1.0, -1.0)[:, None]]
    ).reshape(-1)
    x = sparse.csr_matrix((v, (r, c)), shape=(rows, 2 * n + 1))
    return players, x


def ridge(
    x: sparse.csr_matrix, y: np.ndarray, w: np.ndarray, alpha: float
) -> tuple[np.ndarray, np.ndarray]:
    """Weighted ridge with an unpenalised intercept, solved exactly (sklearn Ridge's objective).

    One solve for every target column, so the coefficients are linear in the target.
    """
    total = float(w.sum())
    if total <= 0:
        raise SystemExit("no weight")
    xw = x.multiply(w[:, None]).tocsr()
    mean_x = np.asarray(xw.sum(axis=0)).reshape(-1) / total
    mean_y = (w @ y) / total
    gram = np.asarray((x.T @ xw).todense()) - total * np.outer(mean_x, mean_x)
    gram[np.diag_indices_from(gram)] += alpha
    rhs = np.asarray(xw.T @ y) - total * np.outer(mean_x, mean_y)
    coef = linalg.solve(gram, rhs, assume_a="pos")
    error = float(np.linalg.norm(gram @ coef - rhs) / max(np.linalg.norm(rhs), 1e-300))
    if not np.all(np.isfinite(coef)) or error > SOLVE_TOLERANCE:
        raise SystemExit(f"ridge solve did not converge (relative residual {error})")
    intercept = mean_y - mean_x @ coef
    return coef, intercept


def exposure(g: Mapping[str, Any], players: np.ndarray, weight: np.ndarray) -> np.ndarray:
    """Shots on offence (column 0) and on defence (column 1) per player."""
    result = np.zeros((len(players), 2))
    for side, key in enumerate(("off", "def")):
        idx = np.searchsorted(players, g[key])
        np.add.at(result[:, side], idx.reshape(-1), np.repeat(weight, 5))
    return result


def ratings(coef: np.ndarray, players: np.ndarray, shots: np.ndarray) -> dict[str, np.ndarray]:
    """Per player and target, centred on the shot-weighted average player, per 100 shots;
    defence sign flipped so that positive is always good."""
    n = len(players)
    result = {}
    for side, sign in ((0, 1.0), (1, -1.0)):
        block = coef[side * n : (side + 1) * n, :].copy()
        active = shots[:, side] > 0
        block -= np.average(block[active], axis=0, weights=shots[active, side])
        block[~active] = np.nan
        result[SIDES[side]] = sign * SCALE * block
    return result


def fit(g: Mapping[str, Any], weight: np.ndarray | None = None) -> dict[str, Any]:
    players, x = design(g)
    w = g["weight"] if weight is None else weight
    coef, intercept = ridge(x, g["y"], w, ALPHA)
    shots = exposure(g, players, w)
    return {
        "players": players,
        "ratings": ratings(coef, players, shots),
        "intercept": intercept,
        "home": coef[-1, :],
        "shots": shots,
        "x": x,
    }


def bootstrap(
    g: Mapping[str, Any], point: Mapping[str, Any], seed: list[int]
) -> dict[str, np.ndarray]:
    """Resample games with replacement and refit; draws[side][replicate, player, target]."""
    players, x = point["players"], point["x"]
    games = len(g["games"])
    rng = np.random.default_rng(np.random.SeedSequence(seed))
    draws = {
        s: np.full((REPLICATES, len(players), len(TARGETS)), np.nan) for s in (*SIDES, "combined")
    }
    for r in range(REPLICATES):
        counts = np.bincount(rng.integers(0, games, games), minlength=games)
        w = g["weight"] * counts[g["game"]]
        coef, _ = ridge(x, g["y"], w, ALPHA)
        rated = ratings(coef, players, exposure(g, players, w))
        for side in SIDES:
            draws[side][r] = rated[side]
        draws["combined"][r] = rated["offense"] + rated["defense"]
    return draws


def band(series: np.ndarray) -> list[float] | None:
    seen = series[~np.isnan(series)]
    if len(seen) < 2:
        return None
    return [float(np.percentile(seen, PERCENTILES[0])), float(np.percentile(seen, PERCENTILES[1]))]


def wls(x: np.ndarray, y: np.ndarray, w: np.ndarray) -> dict[str, Any]:
    """y ~ x without intercept, weighted; coefficients and R^2 about the weighted mean."""
    sw = np.sqrt(w)
    beta, *_ = np.linalg.lstsq(x * sw[:, None], y * sw, rcond=None)
    prediction = x @ beta
    mean = np.average(y, weights=w)
    total = float(np.sum(w * (y - mean) ** 2))
    r2 = 1.0 - float(np.sum(w * (y - prediction) ** 2)) / total if total > 0 else float("nan")
    return {"coefficients": [float(b) for b in beta], "r2": r2}


def season_result(season: str, t: Mapping[str, np.ndarray], index: int) -> dict[str, Any]:
    started = time.monotonic()
    tg = targets(t)
    g = groups(t, tg["shots"], tg["values"])
    point = fit(g)
    players, rated, shots = point["players"], point["ratings"], point["shots"]
    draws = bootstrap(g, point, [SEED, int(season[:4]), index])

    games_by_player: dict[int, set[int]] = {}
    for key in ("off", "def"):
        for row, lineup in zip(g["game"], g[key], strict=True):
            for p in lineup:
                games_by_player.setdefault(int(p), set()).add(int(row))
    team_shots: dict[tuple[int, int], float] = {}
    off_rows = t["off"]
    for k in range(5):
        for p, team, s in zip(off_rows[:, k], t["offense_team"], tg["shots"], strict=True):
            if s > 0:
                team_shots[(int(p), int(team))] = team_shots.get((int(p), int(team)), 0.0) + float(
                    s
                )
    primary: dict[int, int] = {}
    for (p, team), s in sorted(team_shots.items()):
        if p not in primary or s > team_shots[(p, primary[p])]:
            primary[p] = team

    rows = []
    qualified = np.zeros(len(players), dtype=bool)
    for j, pid in enumerate(players):
        games = len(games_by_player.get(int(pid), ()))
        ok = games >= MIN_GAMES and shots[j, 0] >= MIN_SHOTS and shots[j, 1] >= MIN_SHOTS
        qualified[j] = ok
        entry: dict[str, Any] = {
            "player_id": str(int(pid)),
            "team_id": str(primary[int(pid)]) if int(pid) in primary else None,
            "games": games,
            "offense_shots": float(shots[j, 0]),
            "defense_shots": float(shots[j, 1]),
            "qualified": bool(ok),
        }
        entry["status"] = "served" if ok else "small_sample"
        if ok:
            for side in (*SIDES, "combined"):
                values = (
                    rated["offense"][j] + rated["defense"][j]
                    if side == "combined"
                    else rated[side][j]
                )
                entry[side] = {name: float(values[k]) for k, name in enumerate(TARGETS)}
                entry[f"{side}_interval"] = {
                    name: band(draws[side][:, j, k]) for k, name in enumerate(TARGETS)
                }
        rows.append(entry)

    if not qualified.any():
        raise SystemExit(f"{season}: no qualified players")
    additivity = {}
    second_stage = {}
    widths: dict[str, dict[str, float | None]] = {}
    for side in (*SIDES, "combined"):
        values = rated["offense"] + rated["defense"] if side == "combined" else rated[side]
        finite = ~np.isnan(values).any(axis=1)
        additivity[side] = float(np.max(np.abs(values[finite, 0] - values[finite, 1:].sum(axis=1))))
        if additivity[side] > ADDITIVITY_TOLERANCE:
            raise SystemExit(f"{season} {side}: coefficients are not additive ({additivity[side]})")
        q = qualified & finite
        weight = (
            shots[q, 0]
            if side == "offense"
            else shots[q, 1]
            if side == "defense"
            else shots[q].sum(axis=1)
        )
        second_stage[side] = {"players": int(q.sum()), **wls(values[q, 1:], values[q, 0], weight)}
        widths[side] = {}
        for k, name in enumerate(TARGETS):
            spans = [
                b[1] - b[0]
                for b in (band(draws[side][:, j, k]) for j in np.flatnonzero(q))
                if b is not None
            ]
            widths[side][name] = float(np.median(spans)) if spans else None
    league = {
        name: float(SCALE * np.sum(tg["values"][:, k]) / np.sum(tg["shots"]))
        for k, name in enumerate(TARGETS)
    }
    kinds = Counter(map(str, t["kind"]))
    return {
        "season": season,
        "attempts": len(t["kind"]),
        "kinds": dict(sorted(kinds.items())),
        "shots": float(np.sum(tg["shots"])),
        "avg_points": tg["avg_points"],
        "expected_shift": tg["shift"],
        "league_per_100_shots": league,
        "row_additivity_residual": tg["row_additivity_residual"],
        "groups": len(g["weight"]),
        "games": len(g["games"]),
        "zero_shot_groups": g["zero_shot_groups"],
        "zero_shot_group_values": g["zero_shot_group_values"],
        "players_rated": len(players),
        "players_qualified": int(qualified.sum()),
        "home_coefficient_per_100": {
            name: float(SCALE * point["home"][k]) for k, name in enumerate(TARGETS)
        },
        "coefficient_additivity_residual": additivity,
        "second_stage": second_stage,
        "median_interval_width": widths,
        "bootstrap": {
            "replicates": REPLICATES,
            "seed": [SEED, int(season[:4]), index],
            "percentiles": list(PERCENTILES),
        },
        "players": rows,
        "_seconds": round(time.monotonic() - started, 1),
    }


# ---- Persistence --------------------------------------------------------------------------------


def weighted_corr(x: np.ndarray, y: np.ndarray, w: np.ndarray) -> float:
    mx, my = np.average(x, weights=w), np.average(y, weights=w)
    cov = np.average((x - mx) * (y - my), weights=w)
    vx, vy = np.average((x - mx) ** 2, weights=w), np.average((y - my) ** 2, weights=w)
    return float(cov / np.sqrt(vx * vy))


PERSISTENCE_METRICS = (
    ("offense", "ts"),
    ("offense", "sq"),
    ("offense", "make"),
    ("offense", "ft"),
    ("defense", "ts"),
    ("defense", "sq"),
    ("defense", "make"),
    ("defense", "ft"),
)


def persistence(seasons: Mapping[str, Mapping[str, Any]]) -> dict[str, Any]:
    """Pooled consecutive-season correlations among players qualified in both seasons.

    Registered statistic: r(oSQ) - r(oMake), with a player-cluster bootstrap interval.
    """
    rows: list[tuple[str, dict[str, float], dict[str, float], float, float]] = []
    pair_counts = {}
    ordered = sorted(seasons)
    for a, b in pairwise(ordered):
        first = {p["player_id"]: p for p in seasons[a]["players"] if p["qualified"]}
        second = {p["player_id"]: p for p in seasons[b]["players"] if p["qualified"]}
        common = sorted(set(first) & set(second))
        pair_counts[f"{a}->{b}"] = len(common)
        for pid in common:
            x = {f"{s}:{m}": first[pid][s][m] for s, m in PERSISTENCE_METRICS}
            y = {f"{s}:{m}": second[pid][s][m] for s, m in PERSISTENCE_METRICS}
            wo = 2 / (1 / first[pid]["offense_shots"] + 1 / second[pid]["offense_shots"])
            wd = 2 / (1 / first[pid]["defense_shots"] + 1 / second[pid]["defense_shots"])
            rows.append((pid, x, y, wo, wd))
    if len(rows) < 3:
        raise SystemExit("too few player pairs for persistence")
    ids = sorted({r[0] for r in rows})
    position = {p: i for i, p in enumerate(ids)}
    cluster = np.array([position[r[0]] for r in rows])

    columns = {
        f"{s}:{m}": (
            np.array([r[1][f"{s}:{m}"] for r in rows]),
            np.array([r[2][f"{s}:{m}"] for r in rows]),
            np.array([r[3] if s == "offense" else r[4] for r in rows]),
        )
        for s, m in PERSISTENCE_METRICS
    }

    def correlations(sel: np.ndarray) -> dict[str, float]:
        out = {k: weighted_corr(x[sel], y[sel], w[sel]) for k, (x, y, w) in columns.items()}
        out["offense:sq_minus_make"] = out["offense:sq"] - out["offense:make"]
        out["defense:sq_minus_make"] = out["defense:sq"] - out["defense:make"]
        return out

    point = correlations(np.arange(len(rows)))
    members = [np.flatnonzero(cluster == c) for c in range(len(ids))]
    rng = np.random.default_rng(SEED)
    draws: dict[str, list[float]] = {k: [] for k in point}
    for _ in range(PERSISTENCE_REPLICATES):
        chosen = rng.integers(0, len(ids), len(ids))
        sel = np.concatenate([members[c] for c in chosen])
        for k, v in correlations(sel).items():
            draws[k].append(v)
    tail = (1 - PERSISTENCE_LEVEL) / 2 * 100
    intervals = {
        k: [float(np.percentile(v, tail)), float(np.percentile(v, 100 - tail))]
        for k, v in draws.items()
    }
    low, high = intervals["offense:sq_minus_make"]
    verdict = (
        "oMake persists less than oSQ"
        if low > 0
        else "oMake persists more than oSQ"
        if high < 0
        else "no clear difference"
    )
    return {
        "pairs": len(rows),
        "players": len(ids),
        "pairs_by_season": pair_counts,
        "correlations": {k: {"r": point[k], "interval": intervals[k]} for k in point},
        "registered_statistic": "offense:sq_minus_make",
        "verdict": verdict,
        "replicates": PERSISTENCE_REPLICATES,
        "seed": SEED,
        "interval": PERSISTENCE_LEVEL,
    }


# ---- Run ----------------------------------------------------------------------------------------


def run(
    tables: Mapping[str, Mapping[str, np.ndarray]],
    receipts: Mapping[str, Any],
    receipt: Mapping[str, Any],
) -> dict[str, Any]:
    seasons = {}
    timings = {}
    for index, season in enumerate(sorted(tables)):
        result = season_result(season, tables[season], index)
        timings[season] = result.pop("_seconds")
        seasons[season] = result
        print(f"fitted {season} in {timings[season]} s", flush=True)
    body = {
        "registration": dict(receipt),
        "data": dict(receipts),
        "seasons": seasons,
        "persistence": persistence(seasons),
    }
    rounded = dict(_rounded(body))
    rounded["results_sha256"] = hashlib.sha256(canonical(rounded)).hexdigest()
    return {"result": rounded, "timings": timings}


def _rounded(value: Any) -> Any:
    if isinstance(value, float):
        if not np.isfinite(value):
            raise SystemExit("non-finite value in results")
        return round(value, 9)
    if isinstance(value, dict):
        return {str(k): _rounded(v) for k, v in value.items()}
    if isinstance(value, list | tuple):
        return [_rounded(v) for v in value]
    if isinstance(value, np.integer):
        return int(value)
    if isinstance(value, np.floating):
        return _rounded(float(value))
    return value


def canonical(payload: Mapping[str, Any]) -> bytes:
    return json.dumps(payload, sort_keys=True, separators=(",", ":"), ensure_ascii=True).encode()


def data_receipts(root: Path = TABLES) -> dict[str, Any]:
    result = {}
    for season in SEASONS:
        body = json.loads((root / f"{season}.receipt.json").read_text())
        body.pop("table", None)
        result[season] = body
    return result


EVIDENCE_SECTIONS = ("registration", "data", "persistence", "results_sha256")


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
    tables = {s: load_table(s, params["table_sha256"][s]) for s in SEASONS}
    output = run(tables, data_receipts(), registration_receipt(REGISTRATION))
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(output["result"], indent=1, sort_keys=True) + "\n")
    log = {
        "results_sha256": output["result"]["results_sha256"],
        "season_seconds": output["timings"],
        "wall_seconds": round(time.monotonic() - started, 1),
        "peak_rss_mib": round(resource.getrusage(resource.RUSAGE_SELF).ru_maxrss / 1024, 1),
    }
    if args.log:
        args.log.write_text(json.dumps(log, indent=1) + "\n")
    print(json.dumps(log), flush=True)


if __name__ == "__main__":
    main()
