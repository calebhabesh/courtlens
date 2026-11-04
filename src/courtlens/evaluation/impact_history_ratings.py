"""R01 ratings over twelve regular seasons: time-decay RAPM, game-bootstrap intervals,
six-factor reconstruction R2 and dated rating snapshots.

Registrations (evaluation/research/registrations/): `courtlens-rapm-time-decay-v1`,
`courtlens-impact-intervals-v1`, `courtlens-six-factor-reconstruction-v1` and
`courtlens-rating-snapshots-v1`. Every artifact records the receipts of the registrations it
was fitted under. Cohorts and the 1Y IM04-method fits come from `impact_history_fits.py`.

These stages need many fits over many seasons, so they run on a compact array form of the same
stints (`Compact`); `check_compact` proves that form reproduces every pinned 1Y fit, and each
bootstrap re-derives its point fit before resampling.
"""

from __future__ import annotations

import argparse
import json
import math
import time
from collections.abc import Mapping
from dataclasses import dataclass
from datetime import date
from pathlib import Path
from typing import Any

import numpy as np
from scipy.sparse import csr_matrix  # type: ignore[import-untyped]
from sklearn.model_selection import KFold  # type: ignore[import-untyped]
from threadpoolctl import threadpool_limits  # type: ignore[import-untyped]

from courtlens.domain.research_registry import registration_receipt
from courtlens.evaluation.impact_history_fits import (
    FIRST_YEAR,
    OUTPUT,
    TARGETS,
    Cohorts,
    dependencies,
    one_year_artifacts,
    season_label,
)
from courtlens.evaluation.impact_rating_inputs import (
    write_artifact,
)
from courtlens.evaluation.impact_ratings import (
    SEED,
    ridge,
)
from courtlens.ingestion.native_reconstruction import content_hash
from courtlens.ingestion.sportsdataverse import hash_file

FIELDS = ("points", "controls", "fga", "fta", "turnovers", "orb", "orb_opportunities")
TIME_DECAY = "courtlens-rapm-time-decay-v1"
INTERVALS = "courtlens-impact-intervals-v1"
RECONSTRUCTION = "courtlens-six-factor-reconstruction-v1"
SNAPSHOTS = "courtlens-rating-snapshots-v1"


def implementation() -> dict[str, str]:
    return {
        p: hash_file(Path(p))[0]
        for p in (
            "src/courtlens/evaluation/impact_ratings.py",
            "src/courtlens/evaluation/impact_history_fits.py",
            "src/courtlens/evaluation/impact_history_ratings.py",
        )
    }


# ---------------------------------------------------------------------------------------------
# Compact stints: the same rows as numpy arrays for many fits.


@dataclass
class Compact:
    players: list[str]  # global player ids, in first-seen order
    games: list[str]  # global game ids, sorted
    game_sha: list[str]
    season: np.ndarray  # starting year per stint
    day: np.ndarray  # date ordinal per stint
    game: np.ndarray  # global game index per stint
    lineups: np.ndarray  # [n, 2, 5] global player index, side 0 home
    seconds: np.ndarray
    counts: np.ndarray  # [n, 2, len(FIELDS)], side 0 home offense

    def take(self, idx: np.ndarray) -> Compact:
        return Compact(
            self.players,
            self.games,
            self.game_sha,
            self.season[idx],
            self.day[idx],
            self.game[idx],
            self.lineups[idx],
            self.seconds[idx],
            self.counts[idx],
        )


def compact_all(cohorts: Mapping[str, dict[str, Any]]) -> Compact:
    players: dict[str, int] = {}
    game_rows: list[tuple[str, str]] = []
    parts: list[tuple[Any, ...]] = []
    for key in cohorts:
        cohort = cohorts[key]
        year = int(cohort["season"][:4])
        game_rows.extend((g, v["sha256"]) for g, v in cohort["games"].items())
        stints = cohort["stints"]
        lineups = np.array(
            [
                [[players.setdefault(p, len(players)) for p in side] for side in (s.home, s.away)]
                for s in stints
            ],
            dtype=np.int32,
        )
        counts = np.array(
            [
                [
                    [points, controls, *(f[k] for k in FIELDS[2:])]
                    for points, controls, f in ((s.hp, s.hx, s.hf), (s.ap, s.ax, s.af))
                ]
                for s in stints
            ],
            dtype=np.float64,
        )
        parts.append(
            (
                np.full(len(stints), year, dtype=np.int16),
                np.array([date.fromisoformat(s.day).toordinal() for s in stints], dtype=np.int32),
                [s.game for s in stints],
                lineups,
                np.array([s.seconds for s in stints], dtype=np.float64),
                counts,
            )
        )
        print("compact", cohort["season"], len(stints), flush=True)
    game_rows.sort()
    games = [g for g, _ in game_rows]
    index = {g: i for i, g in enumerate(games)}
    return Compact(
        list(players),
        games,
        [s for _, s in game_rows],
        np.concatenate([p[0] for p in parts]),
        np.concatenate([p[1] for p in parts]),
        np.array([index[g] for p in parts for g in p[2]], dtype=np.int32),
        np.concatenate([p[3] for p in parts]),
        np.concatenate([p[4] for p in parts]),
        np.concatenate([p[5] for p in parts]),
    )


def observations(c: Compact, target: str) -> tuple[np.ndarray, np.ndarray]:
    """`impact_ratings.observations` on compact rows (row 2i + side)."""
    f = {name: c.counts[:, :, i].reshape(-1) for i, name in enumerate(FIELDS)}
    tsa = f["fga"] + 0.44 * f["fta"]
    numerator, weight = {
        "rapm": (100 * f["points"], f["controls"]),
        "ts": (f["points"], 2 * tsa),
        "tov": (f["turnovers"], tsa + f["turnovers"]),
        "reb": (f["orb"], f["orb_opportunities"]),
    }[target]
    y = np.divide(numerator, weight, out=np.zeros(len(weight)), where=weight > 0)
    return y, weight


def vocabulary(c: Compact) -> np.ndarray:
    """Global indexes of the players present, sorted by player id (as the pinned design)."""
    present = np.unique(c.lineups)
    ids = np.array(c.players, dtype=object)[present]
    return present[np.argsort(ids, kind="stable")]


def design(c: Compact, vocab: np.ndarray, home: np.ndarray, columns: int) -> Any:
    """Offense/defense indicators plus signed home columns (`home` per stint, -1 = none)."""
    local = np.full(len(c.players), -1, dtype=np.int64)
    local[vocab] = np.arange(len(vocab))
    n = len(vocab)
    m = len(c.day)
    rows, cols, vals = [], [], []
    for side in (0, 1):
        row = 2 * np.arange(m) + side
        for offset, lineup in ((0, c.lineups[:, side, :]), (n, c.lineups[:, 1 - side, :])):
            mapped = local[lineup]
            keep = mapped >= 0
            rows.append(np.repeat(row, 5)[keep.reshape(-1)])
            cols.append((offset + mapped)[keep])
            vals.append(np.ones(int(keep.sum())))
        has_home = home >= 0
        rows.append(row[has_home])
        cols.append(2 * n + home[has_home])
        vals.append(np.full(int(has_home.sum()), 1.0 if side == 0 else -1.0))
    return csr_matrix(
        (np.concatenate(vals), (np.concatenate(rows), np.concatenate(cols))),
        shape=(2 * m, 2 * n + columns),
    )


def player_seconds(c: Compact, vocab: np.ndarray, weights: np.ndarray) -> np.ndarray:
    local = np.full(len(c.players), -1, dtype=np.int64)
    local[vocab] = np.arange(len(vocab))
    totals = np.zeros(len(vocab))
    mapped = local[c.lineups.reshape(len(c.day), 10)]
    np.add.at(totals, mapped.reshape(-1), np.repeat(c.seconds * weights, 10))
    return totals


def centered(
    coef: np.ndarray, n: int, seconds: np.ndarray, target: str
) -> tuple[np.ndarray, np.ndarray]:
    """Offense and defense per player in the pinned sign and scale conventions."""
    offense, defense = coef[:n].copy(), coef[n : 2 * n].copy()
    active = seconds > 0
    for values in (offense, defense):
        values -= np.average(values[active], weights=seconds[active])
    osign, dsign = (-1, 1) if target == "tov" else (1, -1)
    scale = 1 if target == "rapm" else 100
    return scale * osign * offense, scale * dsign * defense


def fit_compact(
    c: Compact,
    target: str,
    alpha: float,
    *,
    stint_weights: np.ndarray | None = None,
    home: np.ndarray | None = None,
    columns: int = 1,
    vocab: np.ndarray | None = None,
    x: Any = None,
) -> dict[str, Any]:
    weights = np.ones(len(c.day)) if stint_weights is None else stint_weights
    vocab = vocabulary(c) if vocab is None else vocab
    home = np.zeros(len(c.day), dtype=np.int64) if home is None else home
    x = design(c, vocab, home, columns) if x is None else x
    y, w = observations(c, target)
    coef, intercept = ridge(x, y, w * np.repeat(weights, 2), alpha)
    seconds = player_seconds(c, vocab, weights)
    offense, defense = centered(coef, len(vocab), seconds, target)
    return {
        "vocab": vocab,
        "offense": offense,
        "defense": defense,
        "seconds": seconds,
        "coef": coef,
        "intercept": intercept,
    }


def check_compact(c: Compact, artifacts: dict[str, dict[str, Any]]) -> dict[str, Any]:
    """The compact form reproduces every pinned 1Y fit (all four targets)."""
    result = {}
    for season, body in artifacts.items():
        sub = c.take(np.flatnonzero(c.season == int(season[:4])))
        worst = 0.0
        for target in TARGETS:
            fit = body["rapm"] if target == "rapm" else body["six_factor"][target]
            out = fit_compact(sub, target, fit["alpha"])
            ids = [c.players[i] for i in out["vocab"]]
            if set(ids) != set(fit["players"]):
                raise ValueError(f"{season} {target}: vocabulary differs from pinned fit")
            for i, p in enumerate(ids):
                worst = max(
                    worst,
                    abs(out["offense"][i] - fit["players"][p]["offense"]),
                    abs(out["defense"][i] - fit["players"][p]["defense"]),
                )
        result[season] = worst
        print("compact check", season, worst, flush=True)
    if max(result.values()) > 1e-6:
        raise ValueError(f"compact fits differ from pinned fits: {result}")
    return {"max_abs_difference": result, "tolerance": 1e-6}


# ---------------------------------------------------------------------------------------------
# Time-decay RAPM (courtlens-rapm-time-decay-v1).


def decay_parameters() -> dict[str, Any]:
    parameters: dict[str, Any] = registration_receipt(TIME_DECAY)["parameters"]
    return parameters


def decay_window(c: Compact, cutoff: str) -> tuple[Compact, np.ndarray, np.ndarray, int]:
    """Stints before the cutoff with weight >= min_weight; their decay weights and home columns."""
    p = decay_parameters()
    end = date.fromisoformat(cutoff).toordinal()
    max_age = math.floor(p["half_life_days"] * math.log2(1 / p["min_weight"]))
    idx = np.flatnonzero((c.day < end) & (end - c.day <= max_age))
    if len(idx) == 0:
        raise ValueError(f"no games before {cutoff}")
    sub = c.take(idx)
    weights = 0.5 ** ((end - sub.day) / p["half_life_days"])
    seasons = sorted(set(sub.season.tolist()))
    home = np.searchsorted(np.array(seasons), sub.season).astype(np.int64)
    bubble = date.fromisoformat(p["bubble_neutral_from"]).toordinal()
    home[(sub.season == 2019) & (sub.day >= bubble)] = -1
    return sub, weights, home, len(seasons)


def decay_alpha(
    sub: Compact, weights: np.ndarray, home: np.ndarray, columns: int
) -> tuple[float, dict[str, Any]]:
    p = decay_parameters()
    games = sorted({sub.games[g] for g in sub.game.tolist()})
    if len(games) < 3:
        raise ValueError("three games required for game-grouped CV")
    game_ids = np.array([sub.games[g] for g in sub.game], dtype=object)
    folds = list(KFold(p["cv_folds"], shuffle=True, random_state=SEED).split(games))
    y, w = observations(sub, "rapm")
    w = w * np.repeat(weights, 2)
    errors = dict.fromkeys(map(str, p["alpha_grid"]), 0.0)
    exposure = 0.0
    for _train_idx, test_idx in folds:
        test_games = {games[i] for i in test_idx}
        in_test = np.isin(game_ids, list(test_games))
        train, test = sub.take(np.flatnonzero(~in_test)), sub.take(np.flatnonzero(in_test))
        vocab = vocabulary(train)
        x = design(train, vocab, home[~in_test], columns)
        z = design(test, vocab, home[in_test], columns)
        ytr, wtr = y[np.repeat(~in_test, 2)], w[np.repeat(~in_test, 2)]
        yte, wte = y[np.repeat(in_test, 2)], w[np.repeat(in_test, 2)]
        valid = wte > 0
        exposure += float(wte[valid].sum())
        for alpha in p["alpha_grid"]:
            coef, intercept = ridge(x, ytr, wtr, float(alpha))
            prediction = z @ coef + intercept
            errors[str(alpha)] += float(np.sum(wte[valid] * (yte[valid] - prediction[valid]) ** 2))
    scores = {a: e / exposure for a, e in errors.items()}
    chosen = min(p["alpha_grid"], key=lambda a: (scores[str(a)], a))
    return float(chosen), {
        "alpha": chosen,
        "grid": p["alpha_grid"],
        "endpoint": bool(chosen in (min(p["alpha_grid"]), max(p["alpha_grid"]))),
        "seed": SEED,
        "scores": scores,
    }


def decay_fit(c: Compact, cutoff: str) -> dict[str, Any]:
    """One time-decay fit as of `cutoff` (exclusive), its support and input identities."""
    p = decay_parameters()
    sub, weights, home, columns = decay_window(c, cutoff)
    alpha, cv = decay_alpha(sub, weights, home, columns)
    vocab = vocabulary(sub)
    fit = fit_compact(
        sub, "rapm", alpha, stint_weights=weights, home=home, columns=columns, vocab=vocab
    )
    end = date.fromisoformat(cutoff).toordinal()
    q = p["qualification"]
    recent = sub.take(np.flatnonzero(end - sub.day <= q["recent_days"]))
    support = {}
    local = {int(g): i for i, g in enumerate(vocab)}
    recent_games: dict[int, set[int]] = {}
    recent_controls = np.zeros((len(vocab), 2))
    for i in range(len(recent.day)):
        for side in (0, 1):
            for player in recent.lineups[i, side]:
                j = local[int(player)]
                recent_games.setdefault(j, set()).add(int(recent.game[i]))
                recent_controls[j, 0] += recent.counts[i, side, 1]
                recent_controls[j, 1] += recent.counts[i, 1 - side, 1]
    for j, g in enumerate(vocab):
        games = len(recent_games.get(j, ()))
        support[c.players[int(g)]] = {
            "orapm": float(fit["offense"][j]),
            "drapm": float(fit["defense"][j]),
            "rapm": float(fit["offense"][j] + fit["defense"][j]),
            "decayed_seconds": float(fit["seconds"][j]),
            "recent_games": games,
            "recent_off_controls": float(recent_controls[j, 0]),
            "recent_def_controls": float(recent_controls[j, 1]),
            "qualified": bool(
                games >= q["min_games"] and min(recent_controls[j]) >= q["min_controls_each_side"]
            ),
        }
    window_games = sorted({int(g) for g in sub.game})
    seasons = sorted(set(sub.season.tolist()))
    n = len(vocab)
    return {
        "cutoff": cutoff,
        "window_start": date.fromordinal(int(sub.day.min())).isoformat(),
        "latest_game_date": date.fromordinal(int(sub.day.max())).isoformat(),
        "games": len(window_games),
        "games_sha256": content_hash({c.games[g]: c.game_sha[g] for g in window_games}),
        "stints": len(sub.day),
        "alpha": alpha,
        "cv": cv,
        "intercept": fit["intercept"],
        "home_coefficients": {
            season_label(s): float(fit["coef"][2 * n + i]) for i, s in enumerate(seasons)
        },
        "players": support,
        "_fit": (sub, weights, home, columns, vocab, fit),
    }


def decay_artifact(result: dict[str, Any], kind: str) -> dict[str, Any]:
    return {
        "version": TIME_DECAY,
        "kind": kind,
        "registrations": [registration_receipt(TIME_DECAY)]
        + ([registration_receipt(SNAPSHOTS)] if kind == "snapshot" else []),
        "claim": "descriptive model estimate under lineup confounding",
        "implementation": implementation(),
        "dependencies": dependencies(),
        **{k: v for k, v in result.items() if not k.startswith("_")},
    }


def stint_margin_rmse(test: Compact, prediction: np.ndarray) -> float:
    hx, ax = test.counts[:, 0, 1], test.counts[:, 1, 1]
    mean = (hx + ax) / 2
    truth = (test.counts[:, 0, 0] - test.counts[:, 1, 0]) * 100 / mean
    margin = (prediction[0::2] * hx - prediction[1::2] * ax) / mean
    return float(np.sqrt(np.average((truth - margin) ** 2, weights=mean)))


def decay_diagnostic(c: Compact, season: str, one_year: dict[str, Any]) -> dict[str, Any]:
    """Held-out stint margin RMSE on the season's last 20% of dates, against the 1Y method."""
    year = int(season[:4])
    days = sorted(set(c.day[c.season == year].tolist()))
    boundary = days[max(1, int(0.8 * len(days)))]
    cutoff = date.fromordinal(boundary).isoformat()
    if one_year["margin_diagnostic"]["holdout_start"] != cutoff:
        raise ValueError("diagnostic boundary differs from the 1Y margin diagnostic")
    result = decay_fit(c, cutoff)
    sub, _, _, columns, vocab, fit = result["_fit"]
    seasons = sorted(set(sub.season.tolist()))
    test_idx = np.flatnonzero(
        (c.season == year) & (c.day >= boundary) & (c.counts[:, 0, 1] > 0) & (c.counts[:, 1, 1] > 0)
    )
    test = c.take(test_idx)
    home = np.full(len(test.day), seasons.index(year), dtype=np.int64)
    bubble = date.fromisoformat(decay_parameters()["bubble_neutral_from"]).toordinal()
    home[(test.season == 2019) & (test.day >= bubble)] = -1
    z = design(test, vocab, home, columns)
    rmse = stint_margin_rmse(test, z @ fit["coef"] + fit["intercept"])
    pinned = one_year["margin_diagnostic"]
    if len(test.day) != pinned["evaluated_stints"]:
        raise ValueError("diagnostic test stints differ from the 1Y margin diagnostic")
    return {
        "season": season,
        "holdout_start": cutoff,
        "evaluated_stints": len(test.day),
        "time_decay_alpha": result["alpha"],
        "rmse_per100": {
            "time_decay": rmse,
            "one_year_player": pinned["rmse_per100"]["player"],
            "team_context": pinned["rmse_per100"]["team"],
        },
    }


# ---------------------------------------------------------------------------------------------
# Game bootstrap (courtlens-impact-intervals-v1).


def bootstrap(
    c: Compact,
    fits: dict[str, float],
    *,
    stint_weights: np.ndarray,
    home: np.ndarray,
    columns: int,
    seed: list[int],
    point: dict[str, dict[str, np.ndarray]] | None = None,
) -> dict[str, Any]:
    """Resample games with replacement; refit each target with its fixed alpha."""
    p = registration_receipt(INTERVALS)["parameters"]
    vocab = vocabulary(c)
    x = design(c, vocab, home, columns)
    order = sorted({int(g) for g in c.game}, key=lambda g: c.games[g])
    position = {g: i for i, g in enumerate(order)}
    game_local = np.array([position[int(g)] for g in c.game])
    check = {}
    for target, alpha in fits.items():
        fit = fit_compact(
            c,
            target,
            alpha,
            stint_weights=stint_weights,
            home=home,
            columns=columns,
            vocab=vocab,
            x=x,
        )
        if point is not None:
            check[target] = float(
                max(
                    np.max(np.abs(fit["offense"] - point[target]["offense"])),
                    np.max(np.abs(fit["defense"] - point[target]["defense"])),
                )
            )
    rng = np.random.default_rng(np.random.SeedSequence(seed))
    draws = {t: np.full((p["replicates"], 2, len(vocab)), np.nan) for t in fits}
    for r in range(p["replicates"]):
        multiplicity = np.bincount(rng.integers(0, len(order), len(order)), minlength=len(order))
        weights = stint_weights * multiplicity[game_local]
        for target, alpha in fits.items():
            fit = fit_compact(
                c,
                target,
                alpha,
                stint_weights=weights,
                home=home,
                columns=columns,
                vocab=vocab,
                x=x,
            )
            exposed = fit["seconds"] > 0
            draws[target][r, 0, exposed] = fit["offense"][exposed]
            draws[target][r, 1, exposed] = fit["defense"][exposed]
    low, high = p["percentiles"]
    players: dict[str, dict[str, Any]] = {}
    for target, values in draws.items():
        totals = values[:, 0, :] + values[:, 1, :]
        for j, g in enumerate(vocab):
            entry = players.setdefault(c.players[int(g)], {})
            stats = {"offense": values[:, 0, j], "defense": values[:, 1, j]}
            if target == "rapm":
                stats["total"] = totals[:, j]
            for metric, series in stats.items():
                seen = series[~np.isnan(series)]
                entry[f"{target}_{metric}"] = (
                    {
                        f"p{low}": float(np.percentile(seen, low)),
                        f"p{high}": float(np.percentile(seen, high)),
                        "sd": float(np.std(seen, ddof=1)),
                        "replicates": len(seen),
                    }
                    if len(seen) >= 2
                    else None
                )
    return {"replicates": p["replicates"], "seed": seed, "point_check": check, "players": players}


def interval_summary(
    intervals: dict[str, Any], fits: dict[str, dict[str, Any]], low: int, high: int
) -> dict[str, Any]:
    """Median 80% width and share excluding zero among qualified players, per metric."""
    summary = {}
    for key, entries in intervals.items():
        target, _metric = key.split(":")
        widths, excludes = [], []
        for player, support in fits[target].items():
            band = entries.get(player)
            if not support["qualified"] or band is None:
                continue
            widths.append(band[f"p{high}"] - band[f"p{low}"])
            excludes.append(band[f"p{low}"] > 0 or band[f"p{high}"] < 0)
        summary[key] = {
            "qualified": len(widths),
            "median_width": float(np.median(widths)) if widths else None,
            "share_excluding_zero": float(np.mean(excludes)) if excludes else None,
        }
    return summary


def one_year_intervals(c: Compact, season: str, body: dict[str, Any]) -> dict[str, Any]:
    year = int(season[:4])
    sub = c.take(np.flatnonzero(c.season == year))
    vocab = vocabulary(sub)
    ids = [c.players[int(g)] for g in vocab]
    fits = {"rapm": body["rapm"], **body["six_factor"]}
    point = {
        t: {
            "offense": np.array([f["players"][p]["offense"] for p in ids]),
            "defense": np.array([f["players"][p]["defense"] for p in ids]),
        }
        for t, f in fits.items()
    }
    result = bootstrap(
        sub,
        {t: f["alpha"] for t, f in fits.items()},
        stint_weights=np.ones(len(sub.day)),
        home=np.zeros(len(sub.day), dtype=np.int64),
        columns=1,
        seed=[SEED, year, 1],
        point=point,
    )
    if max(result["point_check"].values()) > 1e-6:
        raise ValueError(f"bootstrap point fit differs from the artifact: {result['point_check']}")
    low, high = registration_receipt(INTERVALS)["parameters"]["percentiles"]
    by_metric = {
        f"{t}:{m}": {p: v[f"{t}_{m}"] for p, v in result["players"].items()}
        for t in fits
        for m in (("offense", "defense", "total") if t == "rapm" else ("offense", "defense"))
    }
    return {
        "version": INTERVALS,
        "registration": registration_receipt(INTERVALS),
        "fit": {"kind": "one_year", "season": season, "artifact_sha256": content_hash(body)},
        "implementation": implementation(),
        "dependencies": dependencies(),
        "point_check": result["point_check"],
        "replicates": result["replicates"],
        "seed": result["seed"],
        "summary": interval_summary(
            by_metric,
            {t: f["players"] for t, f in fits.items()},
            low,
            high,
        ),
        "players": result["players"],
    }


def decay_intervals(c: Compact, season: str, artifact: dict[str, Any], fit: Any) -> dict[str, Any]:
    sub, weights, home, columns, _vocab, point_fit = fit
    year = int(season[:4])
    result = bootstrap(
        sub,
        {"rapm": float(artifact["alpha"])},
        stint_weights=weights,
        home=home,
        columns=columns,
        seed=[SEED, year, 2],
        point={"rapm": {"offense": point_fit["offense"], "defense": point_fit["defense"]}},
    )
    if result["point_check"]["rapm"] > 1e-9:
        raise ValueError("time-decay bootstrap point fit differs")
    low, high = registration_receipt(INTERVALS)["parameters"]["percentiles"]
    support = artifact["players"]
    by_metric = {
        f"rapm:{m}": {p: v[f"rapm_{m}"] for p, v in result["players"].items()}
        for m in ("offense", "defense", "total")
    }
    return {
        "version": INTERVALS,
        "registration": registration_receipt(INTERVALS),
        "fit": {
            "kind": "time_decay_season_end",
            "season": season,
            "artifact_sha256": content_hash(artifact),
        },
        "implementation": implementation(),
        "dependencies": dependencies(),
        "point_check": result["point_check"],
        "replicates": result["replicates"],
        "seed": result["seed"],
        "summary": interval_summary(by_metric, {"rapm": support}, low, high),
        "players": result["players"],
    }


# ---------------------------------------------------------------------------------------------
# Six-factor reconstruction R2 (courtlens-six-factor-reconstruction-v1).

FACTORS = ("o_ts", "o_tov", "o_reb", "d_ts", "d_tov", "d_reb")


def factor_table(body: dict[str, Any]) -> tuple[list[str], np.ndarray, dict[str, np.ndarray]]:
    rapm = body["rapm"]["players"]
    factors = body["six_factor"]
    ids = sorted(
        p
        for p, r in rapm.items()
        if r["qualified"] and all(factors[t]["players"][p]["qualified"] for t in factors)
    )
    x = np.array(
        [
            [
                factors[t]["players"][p][side]
                for side in ("offense", "defense")
                for t in ("ts", "tov", "reb")
            ]
            for p in ids
        ]
    )
    # Columns follow FACTORS: oTS, oTOV, oREB, dTS, dTOV, dREB.
    y = {m: np.array([rapm[p][m] for p in ids]) for m in ("total", "offense", "defense")}
    y["seconds"] = np.array([rapm[p]["seconds"] for p in ids])
    return ids, x, y


def wls(x: np.ndarray, y: np.ndarray, w: np.ndarray) -> np.ndarray:
    design_matrix = np.column_stack([np.ones(len(y)), x])
    root = np.sqrt(w)
    beta, *_ = np.linalg.lstsq(design_matrix * root[:, None], y * root, rcond=None)
    return np.asarray(beta)


def r2(y: np.ndarray, prediction: np.ndarray, w: np.ndarray) -> float:
    mean = np.average(y, weights=w)
    return float(1 - np.sum(w * (y - prediction) ** 2) / np.sum(w * (y - mean) ** 2))


def predict(beta: np.ndarray, x: np.ndarray) -> np.ndarray:
    return np.asarray(beta[0] + x @ beta[1:])


def reconstruction_values(
    x: np.ndarray, y: np.ndarray, w: np.ndarray, folds: int, previous: tuple[Any, ...] | None
) -> dict[str, float | None]:
    beta = wls(x, y, w)
    cv_prediction = np.zeros(len(y))
    for train, test in KFold(folds, shuffle=True, random_state=SEED).split(x):
        cv_prediction[test] = predict(wls(x[train], y[train], w[train]), x[test])
    return {
        "in_sample": r2(y, predict(beta, x), w),
        "cross_validated": r2(y, cv_prediction, w),
        "cross_season": r2(y, predict(previous[0], x), w) if previous is not None else None,
    }


def reconstruction(artifacts: dict[str, dict[str, Any]]) -> dict[str, Any]:
    p = registration_receipt(RECONSTRUCTION)["parameters"]
    rng = np.random.default_rng(np.random.SeedSequence([SEED, 3]))
    seasons: dict[str, Any] = {}
    previous: dict[str, tuple[Any, ...]] = {}
    for season, body in artifacts.items():
        ids, x, y = factor_table(body)
        w = y["seconds"]
        entry: dict[str, Any] = {"players": len(ids), "artifact_sha256": content_hash(body)}
        for label, target, columns in (
            ("rapm_on_six", "total", slice(0, 6)),
            ("orapm_on_offense", "offense", slice(0, 3)),
            ("drapm_on_defense", "defense", slice(3, 6)),
        ):
            xs = x[:, columns]
            prior = previous.get(label)
            values = reconstruction_values(xs, y[target], w, p["cv_folds"], prior)
            draws: dict[str, list[float]] = {k: [] for k in values if values[k] is not None}
            for _ in range(200):
                pick = rng.integers(0, len(ids), len(ids))
                sample = reconstruction_values(
                    xs[pick], y[target][pick], w[pick], p["cv_folds"], prior
                )
                for k in draws:
                    value = sample[k]
                    if value is not None:
                        draws[k].append(value)
            entry[label] = {
                "coefficients": wls(xs, y[target], w).tolist(),
                **{
                    k: {
                        "value": v,
                        "p10": float(np.percentile(draws[k], 10)) if v is not None else None,
                        "p90": float(np.percentile(draws[k], 90)) if v is not None else None,
                    }
                    for k, v in values.items()
                },
            }
            previous[label] = (wls(xs, y[target], w),)
        seasons[season] = entry
        print(
            "R2",
            season,
            len(ids),
            {
                k: round(entry["rapm_on_six"][k]["value"] or 0, 4)
                for k in ("in_sample", "cross_validated", "cross_season")
            },
            flush=True,
        )
    return {
        "version": RECONSTRUCTION,
        "registration": registration_receipt(RECONSTRUCTION),
        "factor_columns": list(FACTORS),
        "weights": "player seconds",
        "bootstrap": {"resamples": 200, "unit": "qualified player", "seed": [SEED, 3]},
        "seasons": seasons,
    }


# ---------------------------------------------------------------------------------------------
# Snapshots (courtlens-rating-snapshots-v1).


def snapshot_cutoffs(c: Compact, years: range | None = None) -> dict[str, list[str]]:
    p = registration_receipt(SNAPSHOTS)["parameters"]
    result = {}
    for year in years or range(p["first_season_start_year"], p["last_season_start_year"] + 1):
        days = c.day[c.season == year]
        opener, last = date.fromordinal(int(days.min())), date.fromordinal(int(days.max()))
        cutoffs = [opener]
        month = date(opener.year + opener.month // 12, opener.month % 12 + 1, 1)
        while True:
            cutoffs.append(month)
            if month > last:
                break
            month = date(month.year + month.month // 12, month.month % 12 + 1, 1)
        result[season_label(year)] = [d.isoformat() for d in cutoffs]
    return result


def snapshot_index(root: Path) -> dict[str, Any]:
    """Every snapshot by cutoff; fails if a registered cutoff is missing or leaks."""
    entries = {}
    for path in sorted(root.glob("*.json")):
        body = json.loads(path.read_bytes())
        if content_hash(body) != path.stem or body["kind"] != "snapshot":
            raise ValueError(f"changed snapshot {path}")
        if not body["latest_game_date"] < body["cutoff"]:
            raise ValueError(f"snapshot {path} uses games on or after its cutoff")
        if body["cutoff"] in entries:
            raise ValueError(f"duplicate snapshot cutoff {body['cutoff']}")
        entries[body["cutoff"]] = {
            "sha256": path.stem,
            "window_start": body["window_start"],
            "latest_game_date": body["latest_game_date"],
            "games": body["games"],
            "alpha": body["alpha"],
            "alpha_at_grid_endpoint": body["cv"]["endpoint"],
            "qualified_players": sum(p["qualified"] for p in body["players"].values()),
        }
    return {
        "version": SNAPSHOTS,
        "registration": registration_receipt(SNAPSHOTS),
        "rule": "use the latest snapshot whose cutoff is on or before the game date",
        "snapshots": dict(sorted(entries.items())),
    }


# ---------------------------------------------------------------------------------------------
# Command line.


def save(root: Path, body: dict[str, Any]) -> tuple[Path, str]:
    path, digest = write_artifact(root, body)
    print("saved", root.name, digest, flush=True)
    return path, digest


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "command",
        choices=(
            "check",
            "intervals",
            "time-decay",
            "snapshots",
            "snapshot-index",
            "reconstruction",
        ),
    )
    parser.add_argument("--output", type=Path, default=OUTPUT)
    parser.add_argument("--season", action="append")
    args = parser.parse_args()
    started = time.monotonic()
    artifacts = one_year_artifacts(args.output)
    if args.command == "snapshot-index":
        save(args.output / "snapshot-index", snapshot_index(args.output / "snapshots"))
        return
    if args.command == "reconstruction":
        save(args.output / "reconstruction", reconstruction(artifacts))
        return
    compact = compact_all(Cohorts())
    seasons = args.season or list(artifacts)
    with threadpool_limits(limits=1):
        if args.command == "check":
            save(
                args.output / "checks", {"compact_reproduction": check_compact(compact, artifacts)}
            )
        elif args.command == "intervals":
            for season in seasons:
                save(
                    args.output / "intervals",
                    one_year_intervals(compact, season, artifacts[season]),
                )
        elif args.command == "time-decay":
            for season in seasons:
                last = int(compact.day[compact.season == int(season[:4])].max())
                cutoff = date.fromordinal(last + 1).isoformat()  # rule H3, as `season_end`
                result = decay_fit(compact, cutoff)
                artifact = decay_artifact(result, "season_end")
                save(args.output / "time-decay", artifact)
                save(
                    args.output / "intervals",
                    decay_intervals(compact, season, artifact, result["_fit"]),
                )
                if int(season[:4]) > FIRST_YEAR:
                    save(
                        args.output / "time-decay-diagnostics",
                        decay_diagnostic(compact, season, artifacts[season]),
                    )
        elif args.command == "snapshots":
            cutoffs = snapshot_cutoffs(compact)
            for season in args.season or list(cutoffs):
                for cutoff in cutoffs[season]:
                    result = decay_fit(compact, cutoff)
                    save(args.output / "snapshots", decay_artifact(result, "snapshot"))
    print(json.dumps({"elapsed_seconds": round(time.monotonic() - started, 3)}), flush=True)


if __name__ == "__main__":
    main()
