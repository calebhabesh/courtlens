"""Descriptive ridge ratings; independent of forecasts and frozen experiments."""

from __future__ import annotations

from collections import Counter, defaultdict
from dataclasses import dataclass
from typing import Any

import numpy as np
from scipy.sparse import csr_matrix  # type: ignore[import-untyped]
from sklearn.linear_model import Ridge  # type: ignore[import-untyped]
from sklearn.model_selection import KFold  # type: ignore[import-untyped]

ALPHAS = (10.0, 100.0, 1000.0)
SEED = 2501
TARGETS = ("rapm", "ts", "tov", "reb")


@dataclass(frozen=True)
class Stint:
    game: str
    day: str
    season: str
    home_team: str
    away_team: str
    home: tuple[str, ...]
    away: tuple[str, ...]
    seconds: float
    hp: float
    ap: float
    hx: float
    ax: float
    hf: dict[str, float]
    af: dict[str, float]

    def __post_init__(self) -> None:
        if len(set(self.home)) != 5 or len(set(self.away)) != 5 or set(self.home) & set(self.away):
            raise ValueError("ratings require disjoint five-player lineups")
        values = [
            self.seconds,
            self.hp,
            self.ap,
            self.hx,
            self.ax,
            *self.hf.values(),
            *self.af.values(),
        ]
        if any(not np.isfinite(v) or v < 0 for v in values):
            raise ValueError("invalid rating count")


def outcome(s: Stint, side: int, target: str) -> tuple[float, float]:
    points, exposure, factors = (s.hp, s.hx, s.hf) if side == 0 else (s.ap, s.ax, s.af)
    tsa = factors["fga"] + 0.44 * factors["fta"]
    if target == "rapm":
        return 100 * points, exposure
    if target == "ts":
        return points, 2 * tsa
    if target == "tov":
        return factors["turnovers"], tsa + factors["turnovers"]
    if target == "reb":
        return factors["orb"], factors["orb_opportunities"]
    raise ValueError("unknown rating target")


def vocabulary(stints: list[Stint], teams: bool = False) -> list[str]:
    return sorted(
        {p for s in stints for p in ((s.home_team, s.away_team) if teams else (*s.home, *s.away))}
    )


def design(stints: list[Stint], ids: list[str], teams: bool = False) -> Any:
    index = {p: i for i, p in enumerate(ids)}
    rows, cols, values = [], [], []
    for i, s in enumerate(stints):
        for side, (off, defense) in enumerate(((s.home, s.away), (s.away, s.home))):
            if teams:
                off = (s.home_team,) if side == 0 else (s.away_team,)
                defense = (s.away_team,) if side == 0 else (s.home_team,)
            for offset, players in ((0, off), (len(ids), defense)):
                for p in players:
                    if p in index:
                        rows.append(2 * i + side)
                        cols.append(offset + index[p])
                        values.append(1.0)
            rows.append(2 * i + side)
            cols.append(2 * len(ids))
            values.append(1.0 if side == 0 else -1.0)
    return csr_matrix((values, (rows, cols)), shape=(2 * len(stints), 2 * len(ids) + 1))


def observations(stints: list[Stint], target: str) -> tuple[Any, Any, Any]:
    pairs = np.array([outcome(s, side, target) for s in stints for side in (0, 1)])
    weights = pairs[:, 1]
    valid = weights > 0
    y = np.divide(pairs[:, 0], weights, out=np.zeros(len(weights)), where=valid)
    return y, weights, valid


def ridge(x: Any, y: Any, weights: Any, alpha: float, prior: Any = None) -> tuple[Any, float]:
    valid = weights > 0
    if not valid.any():
        raise ValueError("no positive denominator observations")
    residual = y if prior is None else y - x @ prior
    model = Ridge(alpha=alpha, solver="lsqr", tol=1e-10, max_iter=10000)
    model.fit(x[valid], residual[valid], sample_weight=weights[valid])
    if int(np.max(model.n_iter_)) >= 10000:
        raise ValueError("ridge iteration limit reached")
    coef = np.array(model.coef_, dtype=float)
    if prior is not None:
        coef += prior
    return coef, float(model.intercept_)


def choose_alpha(stints: list[Stint], targets: tuple[str, ...]) -> tuple[float, dict[str, Any]]:
    games = sorted({s.game for s in stints})
    if len(games) < 3:
        raise ValueError("three games required for game-grouped CV")
    folds = list(KFold(3, shuffle=True, random_state=SEED).split(games))
    errors = {str(a): dict.fromkeys(targets, 0.0) for a in ALPHAS}
    baselines = dict.fromkeys(targets, 0.0)
    exposures = dict.fromkeys(targets, 0.0)
    fold_games = []
    unknown = []
    for train_indices, test_indices in folds:
        train_games = {games[i] for i in train_indices}
        test_games = {games[i] for i in test_indices}
        fold_games.append(sorted(test_games))
        train = [s for s in stints if s.game in train_games]
        test = [s for s in stints if s.game in test_games]
        ids = vocabulary(train)
        unknown.append(len(set(vocabulary(test)) - set(ids)))
        x, z = design(train, ids), design(test, ids)
        for target in targets:
            y, w, valid = observations(train, target)
            yt, wt, vt = observations(test, target)
            if not valid.any() or not vt.any():
                raise ValueError("CV fold has no target exposure")
            reference = float(np.average(y[valid], weights=w[valid]))
            base = float(np.sum(wt[vt] * (yt[vt] - reference) ** 2))
            if len(targets) > 1 and base <= 0:
                raise ValueError("zero six-factor baseline error")
            baselines[target] += base
            exposures[target] += float(wt[vt].sum())
            for alpha in ALPHAS:
                coef, intercept = ridge(x, y, w, alpha)
                error = float(np.sum(wt[vt] * (yt[vt] - z[vt] @ coef - intercept) ** 2))
                errors[str(alpha)][target] += error
    means = {
        a: sum(v[t] / (baselines[t] if len(targets) > 1 else exposures[t]) for t in targets)
        / len(targets)
        for a, v in errors.items()
    }
    chosen = min(ALPHAS, key=lambda a: (means[str(a)], a))
    return chosen, {
        "alpha": chosen,
        "grid": list(ALPHAS),
        "seed": SEED,
        "fold_test_games": fold_games,
        "scores": means,
        "target_squared_errors": errors,
        "target_baseline_squared_errors": baselines,
        "target_exposures": exposures,
        "unknown_players": unknown,
    }


def support(stints: list[Stint], target: str) -> dict[str, dict[str, Any]]:
    result: dict[str, dict[str, Any]] = {}
    games: dict[str, set[str]] = defaultdict(set)
    for s in stints:
        for side, players in enumerate((s.home, s.away)):
            off = outcome(s, side, target)[1]
            defense = outcome(s, 1 - side, target)[1]
            for p in players:
                r = result.setdefault(
                    p, {"seconds": 0.0, "off_opportunities": 0.0, "def_opportunities": 0.0}
                )
                r["seconds"] += s.seconds
                r["off_opportunities"] += off
                r["def_opportunities"] += defense
                if s.seconds > 0:
                    games[p].add(s.game)
    for p, r in result.items():
        r["games"] = len(games[p])
        r["qualified"] = (
            r["seconds"] > 0
            and r["games"] >= 20
            and min(r["off_opportunities"], r["def_opportunities"]) >= 1000
        )
    return result


def fit_target(
    stints: list[Stint],
    target: str,
    alpha: float,
    prior: dict[str, tuple[float, float]] | None = None,
) -> dict[str, Any]:
    ids = vocabulary(stints)
    x = design(stints, ids)
    y, w, valid = observations(stints, target)
    pcoef = None
    if prior is not None:
        pcoef = np.array([prior.get(p, (0.0, 0.0))[side] for side in (0, 1) for p in ids] + [0.0])
    coef, intercept = ridge(x, y, w, alpha, pcoef)
    samples = support(stints, target)
    seconds = np.array([samples[p]["seconds"] for p in ids])
    if seconds.sum() <= 0:
        raise ValueError("no player seconds")
    n = len(ids)
    for side in (0, 1):
        mean = float(np.average(coef[side * n : (side + 1) * n], weights=seconds))
        coef[side * n : (side + 1) * n] -= mean
        intercept += 5 * mean
    osign = -1 if target == "tov" else 1
    dsign = 1 if target == "tov" else -1
    scale = 1 if target == "rapm" else 100
    players = {}
    for i, p in enumerate(ids):
        o, d = scale * osign * float(coef[i]), scale * dsign * float(coef[n + i])
        players[p] = {
            **samples[p],
            "offense": o,
            "defense": d,
            "total": o + d if target == "rapm" else None,
        }
        if prior is not None:
            players[p]["prior_available"] = p in prior
    qualified = [p for p in ids if players[p]["qualified"]]
    for metric in ("offense", "defense", "total") if target == "rapm" else ("offense", "defense"):
        for p in ids:
            value = players[p][metric]
            players[p][f"{metric}_percentile"] = (
                100
                * sum(
                    (players[q][metric] < value) + 0.5 * (players[q][metric] == value)
                    for q in qualified
                )
                / len(qualified)
                if p in qualified
                else None
            )
    top = {
        metric: sorted(qualified, key=lambda p: (-players[p][metric], p))[:20]
        for metric in (
            ("offense", "defense", "total") if target == "rapm" else ("offense", "defense")
        )
    }
    numerator = np.array([outcome(s, side, target)[0] for s in stints for side in (0, 1)])
    return {
        "alpha": alpha,
        "players": players,
        "intercept": intercept,
        "home_coefficient": float(coef[-1]),
        "top20": top,
        "weighted_offense_mean": float(
            np.average([players[p]["offense"] for p in ids], weights=seconds)
        ),
        "weighted_defense_mean": float(
            np.average([players[p]["defense"] for p in ids], weights=seconds)
        ),
        "observations": int(valid.sum()),
        "zero_denominator_rows": int((~valid).sum()),
        "omitted_numerator": float(numerator[~valid].sum()),
    }


def margin_diagnostic(stints: list[Stint]) -> dict[str, Any]:
    dates = sorted({s.day for s in stints})
    if len(dates) < 5:
        raise ValueError("five dates required for chronological margin diagnostic")
    boundary = dates[max(1, int(0.8 * len(dates)))]
    train = [s for s in stints if s.day < boundary]
    test = [s for s in stints if s.day >= boundary and s.hx > 0 and s.ax > 0]
    if not test:
        raise ValueError("no held-out stints with both denominators")
    alpha, cv = choose_alpha(train, ("rapm",))
    errors = {}
    y, w, _ = observations(train, "rapm")
    truth = np.array([(s.hp - s.ap) * 100 / ((s.hx + s.ax) / 2) for s in test])
    weights = np.array([(s.hx + s.ax) / 2 for s in test])
    for teams, label, penalty in ((False, "player", alpha), (True, "team", 100.0)):
        ids = vocabulary(train, teams)
        x, z = design(train, ids, teams), design(test, ids, teams)
        coef, intercept = ridge(x, y, w, penalty)
        prediction = z @ coef + intercept
        margins = np.array(
            [
                (prediction[2 * i] * s.hx - prediction[2 * i + 1] * s.ax) / ((s.hx + s.ax) / 2)
                for i, s in enumerate(test)
            ]
        )
        errors[label] = float(np.sqrt(np.average((truth - margins) ** 2, weights=weights)))
    return {
        "holdout_start": boundary,
        "training_games": len({s.game for s in train}),
        "heldout_games": len({s.game for s in stints if s.day >= boundary}),
        "evaluated_stints": len(test),
        "omitted_stints": sum(s.day >= boundary for s in stints) - len(test),
        "unknown_players": sorted(set(vocabulary(test)) - set(vocabulary(train))),
        "rmse_per100": errors,
        "training_cv": cv,
    }


def on_off(stints: list[Stint]) -> dict[str, Any]:
    totals: dict[str, Counter[str]] = defaultdict(Counter)
    on: dict[tuple[str, str], Counter[str]] = defaultdict(Counter)
    for s in stints:
        for team, players, points, allowed, off, defense in (
            (s.home_team, s.home, s.hp, s.ap, s.hx, s.ax),
            (s.away_team, s.away, s.ap, s.hp, s.ax, s.hx),
        ):
            counts = {
                "points": points,
                "allowed": allowed,
                "off_controls": off,
                "def_controls": defense,
                "seconds": s.seconds,
            }
            totals[team].update(counts)
            for p in players:
                on[p, team].update(counts)
    result = {}
    for (p, team), on_counts in sorted(on.items()):
        # Counter subtraction would discard zero counts; keep every denominator explicitly.
        off_counts = {k: totals[team][k] - on_counts[k] for k in on_counts}
        r: dict[str, Any] = {}
        for label, c in (("on", on_counts), ("off", off_counts)):
            o = 100 * c["points"] / c["off_controls"] if c["off_controls"] > 0 else None
            d = 100 * c["allowed"] / c["def_controls"] if c["def_controls"] > 0 else None
            r[label] = {
                **c,
                "ortg": o,
                "drtg": d,
                "net": o - d if o is not None and d is not None else None,
            }
        r["difference"] = {
            m: r["on"][m] - r["off"][m]
            if r["on"][m] is not None and r["off"][m] is not None
            else None
            for m in ("ortg", "drtg", "net")
        }
        result[f"{p}:{team}"] = r
    return result
