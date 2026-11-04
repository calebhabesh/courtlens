"""R15a models under `courtlens-win-probability-v2` (see the registration for every rule).

Stages, each inside the registered per-run budget and resumable from its artifacts:
`pregame` (form half-life, mu0, sigma0, overtime model), `step <name>` (one ablation step, fitted
on train seasons and scored on the selection and calibration seasons), `comparators`,
`calibrate`, and `test`, which alone reads the final-test seasons and refuses to run twice.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import math
import time
from pathlib import Path
from typing import Any

import lightgbm as lgb
import numpy as np
from scipy.optimize import minimize  # type: ignore[import-untyped]
from scipy.special import expit  # type: ignore[import-untyped]
from scipy.stats import norm  # type: ignore[import-untyped]
from sklearn.linear_model import LogisticRegression  # type: ignore[import-untyped]

from courtlens.domain.research_registry import load_registration, registration_receipt
from courtlens.domain.win_probability_state import REGULATION_SECONDS
from courtlens.evaluation.win_probability_data import OUTPUT, REGISTRATION, read_games

REGISTERED = load_registration(REGISTRATION)
PARAMETERS = REGISTERED.parameters
SPLITS: dict[str, list[str]] = PARAMETERS["splits"]
SEED = int(PARAMETERS["seed"])
BOOST = PARAMETERS["booster"]
REPLICATES = int(PARAMETERS["bootstrap"]["replicates"])
ECE_BINS = int(PARAMETERS["ece_bins"])
PREGAME_TRAIN = SPLITS["train"][1:]  # 2014-15 has no rating snapshot
CLIP = 1e-6
SPECIALIST_SECONDS = float(PARAMETERS["end_game_seconds"])
REMAINDER = 12
PHASES = ("first_half", "third_quarter", "fourth_early", "last_two", "overtime")

MU_FORM, MU_FULL = "mu_form", "mu_full"
GROUPS: dict[str, tuple[str, ...]] = {
    "base": ("margin", "seconds_left", "fraction", "overtime", "mu", "mu_fraction"),
    "S1": (
        "possession",
        "pending_own",
        "pending_opp",
        "timeouts_own",
        "timeouts_opp",
        "fouls_own",
        "fouls_opp",
        "bonus_own",
        "bonus_opp",
        "possession_age",
    ),
    "S2": (
        "home",
        "strength",
        "form",
        "rest",
        "b2b_own",
        "b2b_opp",
        "games7",
        "travel_own",
        "travel_opp",
        "denver",
        "utah",
    ),
    "S3": ("log_sigma0", "pace_sum", "three_sum"),
    "S4": (
        "rotation",
        "lost_own",
        "lost_opp",
        "foul_load_own",
        "foul_load_opp",
        "foul_trouble_own",
        "foul_trouble_opp",
        "current",
        "current_near",
    ),
    "S5": ("run_120", "run_300", "three_luck", "ft_luck"),
}
MONOTONE = {"margin": 1, "mu": 1, "mu_fraction": 1}
STEP_ORDER = ("S1", "S2", "S3", "S4", "S5")
SHRINK = float(PARAMETERS["mean_start_shrink"])


def read_season(season: str, output: Path = OUTPUT) -> tuple[dict[str, np.ndarray], list[str]]:
    paths = sorted((output / "states").glob(f"{season}.*.npz"))
    if len(paths) != 1:
        raise ValueError(f"expected one state file for {season}")
    digest = hashlib.sha256(paths[0].read_bytes()).hexdigest()
    if digest not in paths[0].name:
        raise ValueError(f"changed state file {paths[0]}")
    with np.load(paths[0]) as data:
        names = [str(n) for n in data["columns"]]
        matrix = data["matrix"]
        games = [str(g) for g in data["games"]]
    return {n: matrix[:, i] for i, n in enumerate(names)}, games


# ---------------------------------------------------------------------------------------------
# Pregame layer.


def _pregame_row(game: dict[str, Any], form: float) -> list[float]:
    pace = (game["pace_home"] + game["pace_away"]) / 2
    strength = (game["strength_home"] - game["strength_away"]) * pace / 100
    city = 0.0 if game["neutral"] else 1.0
    return [
        strength,
        form,
        city,
        game["rest_home"] - game["rest_away"],
        float(game["b2b_home"]),
        float(game["b2b_away"]),
        game["games7_home"] - game["games7_away"],
        game["travel_home"] / 1000,
        game["travel_away"] / 1000,
        city * (game["home"] == "1610612743"),
        city * (game["home"] == "1610612762"),
    ]


PREGAME_COLUMNS = (
    "strength_x_pace",
    "form",
    "home",
    "rest",
    "b2b_home",
    "b2b_away",
    "games7",
    "travel_home_kkm",
    "travel_away_kkm",
    "denver",
    "utah",
)


def fit_pregame(output: Path = OUTPUT) -> dict[str, Any]:
    table = read_games(output)["games"]
    train = [g for g in table.values() if g["season"] in PREGAME_TRAIN]
    margins = np.array([g["home_pts"] - g["away_pts"] for g in train], dtype=float)
    half_lives = {
        str(h): float(
            np.sqrt(np.mean((margins - np.array([g["form"][str(h)] for g in train])) ** 2))
        )
        for h in PARAMETERS["team_form"]["half_life_days"]
    }
    best = min(half_lives, key=lambda h: half_lives[h])
    design = np.array([_pregame_row(g, g["form"][best]) for g in train])
    coefficients, *_ = np.linalg.lstsq(design, margins, rcond=None)
    residual = margins - design @ coefficients

    pace = np.array([g["pace_home"] + g["pace_away"] for g in train])
    three = np.array([g["three_rate_home"] + g["three_rate_away"] for g in train])
    scale = {
        "pace_mean": float(pace.mean()),
        "pace_sd": float(pace.std()),
        "three_mean": float(three.mean()),
        "three_sd": float(three.std()),
    }
    z = np.column_stack(
        [
            np.ones(len(pace)),
            (pace - scale["pace_mean"]) / scale["pace_sd"],
            (three - scale["three_mean"]) / scale["three_sd"],
        ]
    )

    def negative_log_likelihood(theta: np.ndarray) -> float:
        log_sigma = z @ theta
        return float(np.mean(log_sigma + 0.5 * residual**2 * np.exp(-2 * log_sigma)))

    fitted = minimize(negative_log_likelihood, np.array([math.log(12.0), 0.0, 0.0]), method="BFGS")

    games = {}
    for gid, g in table.items():
        form = g["form"][best]
        has_rating = g["strength_home"] is not None and g["strength_away"] is not None
        full = float(np.dot(_pregame_row(g, form), coefficients)) if has_rating else form
        pace_sum = g["pace_home"] + g["pace_away"]
        three_sum = g["three_rate_home"] + g["three_rate_away"]
        features = np.array(
            [
                1.0,
                (pace_sum - scale["pace_mean"]) / scale["pace_sd"],
                (three_sum - scale["three_mean"]) / scale["three_sd"],
            ]
        )
        games[gid] = {
            MU_FORM: form,
            MU_FULL: full,
            "log_sigma0": float(features @ fitted.x),
            "pace_sum": pace_sum,
            "three_sum": three_sum,
        }
    body = {
        "version": REGISTRATION,
        "registration": registration_receipt(REGISTRATION),
        "train_seasons": PREGAME_TRAIN,
        "form_half_life_days": int(best),
        "form_rmse_by_half_life": half_lives,
        "coefficients": dict(zip(PREGAME_COLUMNS, map(float, coefficients), strict=True)),
        "train_rmse": float(np.sqrt(np.mean(residual**2))),
        "sigma0": {"theta": [float(v) for v in fitted.x], **scale},
        "games": games,
    }
    (output / "pregame.json").write_text(json.dumps(body, sort_keys=True))
    print(
        json.dumps(
            {
                k: body[k]
                for k in (
                    "form_half_life_days",
                    "form_rmse_by_half_life",
                    "train_rmse",
                    "coefficients",
                    "sigma0",
                )
            },
            indent=1,
        )
    )
    return body


# ---------------------------------------------------------------------------------------------
# Feature views.


class Season:
    """One season's states with game-level inputs, viewable from either team's side."""

    def __init__(self, season: str, table: dict[str, Any], pregame: dict[str, Any]) -> None:
        self.season = season
        self.columns, self.games = read_season(season)
        index = self.columns["game_index"].astype(np.int64)
        self.index = index
        self.time = self.columns["time"].astype(np.float64)
        period = self.columns["period"].astype(np.int64)
        self.period = period
        ends = np.where(period <= 4, REGULATION_SECONDS, REGULATION_SECONDS + (period - 4) * 300.0)
        self.left = ends - self.time
        self.fraction = np.maximum(self.left, 1.0) / REGULATION_SECONDS
        self.margin = (self.columns["home_score"] - self.columns["away_score"]).astype(np.float64)
        self.target = self.columns["target_home"].astype(np.float64)
        self.win = self.columns["win_home"].astype(np.float64)
        counts = np.bincount(index, minlength=len(self.games))
        self.weight = 1.0 / counts[index]
        records = [table[g] for g in self.games]
        pre = [pregame["games"][g] for g in self.games]

        def column(values: list[Any]) -> np.ndarray:
            return np.array([np.nan if v is None else float(v) for v in values], dtype=np.float64)[
                index
            ]

        self.game: dict[str, np.ndarray] = {
            MU_FORM: column([p[MU_FORM] for p in pre]),
            MU_FULL: column([p[MU_FULL] for p in pre]),
            "log_sigma0": column([p["log_sigma0"] for p in pre]),
            "pace_sum": column([p["pace_sum"] for p in pre]),
            "three_sum": column([p["three_sum"] for p in pre]),
            "form": column([p[MU_FORM] for p in pre]),
            "neutral": column([r["neutral"] for r in records]),
            "strength": column(
                [
                    None if r["strength_home"] is None else r["strength_home"] - r["strength_away"]
                    for r in records
                ]
            ),
            "rest": column([r["rest_home"] - r["rest_away"] for r in records]),
            "b2b_home": column([r["b2b_home"] for r in records]),
            "b2b_away": column([r["b2b_away"] for r in records]),
            "games7": column([r["games7_home"] - r["games7_away"] for r in records]),
            "travel_home": column([r["travel_home"] / 1000 for r in records]),
            "travel_away": column([r["travel_away"] / 1000 for r in records]),
            "denver": column([not r["neutral"] and r["home"] == "1610612743" for r in records]),
            "utah": column([not r["neutral"] and r["home"] == "1610612762" for r in records]),
        }

    def phases(self) -> dict[str, np.ndarray]:
        t = self.time
        return {
            "first_half": t < 1440,
            "third_quarter": (t >= 1440) & (t < 2160),
            "fourth_early": (t >= 2160) & (t < 2760),
            "last_two": (t >= 2760) & (t < REGULATION_SECONDS),
            "overtime": t >= REGULATION_SECONDS,
        }

    def view(self, sign: np.ndarray, mu_name: str, names: tuple[str, ...]) -> np.ndarray:
        """Feature matrix with each state seen from `sign` (+1 home, -1 away)."""
        own = sign > 0
        c = self.columns
        g = self.game

        def pick(home: np.ndarray, away: np.ndarray) -> np.ndarray:
            result: np.ndarray = np.where(own, home, away)
            return result

        mu = sign * g[mu_name]
        current = c["current_home"] - c["current_away"]
        builders: dict[str, Any] = {
            "margin": lambda: sign * self.margin,
            "seconds_left": lambda: self.left,
            "fraction": lambda: self.fraction,
            "overtime": lambda: (self.period > 4).astype(float),
            "mu": lambda: mu,
            "mu_fraction": lambda: mu * self.fraction,
            "possession": lambda: sign * c["possession"],
            "pending_own": lambda: pick(c["ft_pending_home"], c["ft_pending_away"]),
            "pending_opp": lambda: pick(c["ft_pending_away"], c["ft_pending_home"]),
            "timeouts_own": lambda: pick(c["timeouts_home"], c["timeouts_away"]),
            "timeouts_opp": lambda: pick(c["timeouts_away"], c["timeouts_home"]),
            "fouls_own": lambda: pick(c["fouls_home"], c["fouls_away"]),
            "fouls_opp": lambda: pick(c["fouls_away"], c["fouls_home"]),
            "bonus_own": lambda: pick(c["bonus_home"], c["bonus_away"]),
            "bonus_opp": lambda: pick(c["bonus_away"], c["bonus_home"]),
            "possession_age": lambda: self.time - c["possession_start"],
            "home": lambda: sign * (1 - g["neutral"]),
            "strength": lambda: sign * g["strength"],
            "form": lambda: sign * g["form"],
            "rest": lambda: sign * g["rest"],
            "b2b_own": lambda: pick(g["b2b_home"], g["b2b_away"]),
            "b2b_opp": lambda: pick(g["b2b_away"], g["b2b_home"]),
            "games7": lambda: sign * g["games7"],
            "travel_own": lambda: pick(g["travel_home"], g["travel_away"]),
            "travel_opp": lambda: pick(g["travel_away"], g["travel_home"]),
            "denver": lambda: sign * g["denver"],
            "utah": lambda: sign * g["utah"],
            "log_sigma0": lambda: g["log_sigma0"],
            "pace_sum": lambda: g["pace_sum"],
            "three_sum": lambda: g["three_sum"],
            "rotation": lambda: sign * (c["rotation_home"] - c["rotation_away"]),
            "lost_own": lambda: pick(c["lost_home"], c["lost_away"]),
            "lost_opp": lambda: pick(c["lost_away"], c["lost_home"]),
            "foul_load_own": lambda: pick(c["foul_load_home"], c["foul_load_away"]),
            "foul_load_opp": lambda: pick(c["foul_load_away"], c["foul_load_home"]),
            "foul_trouble_own": lambda: pick(c["foul_trouble_home"], c["foul_trouble_away"]),
            "foul_trouble_opp": lambda: pick(c["foul_trouble_away"], c["foul_trouble_home"]),
            "current": lambda: sign * current,
            "current_near": lambda: (
                sign * current * np.minimum(180.0 / np.maximum(self.left, 1.0), 1.0)
            ),
            "run_120": lambda: sign * c["run_120"],
            "run_300": lambda: sign * c["run_300"],
            "three_luck": lambda: sign * (c["three_luck_home"] - c["three_luck_away"]),
            "ft_luck": lambda: sign * (c["ft_luck_home"] - c["ft_luck_away"]),
        }
        return np.column_stack([builders[n]() for n in names]).astype(np.float32)


def load_seasons(names: list[str], output: Path = OUTPUT) -> dict[str, Season]:
    table = read_games(output)["games"]
    pregame = json.loads((output / "pregame.json").read_text())
    return {name: Season(name, table, pregame) for name in names}


def views(seasons: list[Season]) -> list[np.ndarray]:
    """One seeded random side per training state (the registered view rule)."""
    rng = np.random.default_rng(SEED)
    return [rng.choice(np.array([1.0, -1.0]), size=len(s.time)) for s in seasons]


def fit_baseline(seasons: list[Season], signs: list[np.ndarray], mu_name: str) -> dict[str, float]:
    """Closed-form MLE of beta and sigma for Normal(margin + beta mu f, sigma^2 f)."""
    top = bottom = 0.0
    for s, sign in zip(seasons, signs, strict=True):
        rest = sign * (s.target - s.margin)
        x = sign * s.game[mu_name] * s.fraction
        top += float(np.sum(s.weight * x * rest / s.fraction))
        bottom += float(np.sum(s.weight * x * x / s.fraction))
    beta = top / bottom
    weighted = total = 0.0
    for s, sign in zip(seasons, signs, strict=True):
        rest = sign * (s.target - s.margin) - beta * sign * s.game[mu_name] * s.fraction
        weighted += float(np.sum(s.weight * rest * rest / s.fraction))
        total += float(np.sum(s.weight))
    return {"beta": beta, "sigma": math.sqrt(weighted / total)}


def fit_overtime(seasons: list[Season], mu_name: str) -> float:
    """Logistic slope of winning on mu0, on games tied at the end of a segment."""
    mu, win = [], []
    for s in seasons:
        reached = np.unique(s.index[s.period >= 5])
        for game in reached:
            first = np.argmax(s.index == game)
            mu.append(s.game[mu_name][first])
            win.append(s.win[first])
    model = LogisticRegression(fit_intercept=False, C=1e6, max_iter=1000)
    model.fit(np.array(mu).reshape(-1, 1), np.array(win))
    return float(model.coef_[0, 0])


def win_from_normal(mean: np.ndarray, sd: np.ndarray, p_tie: np.ndarray) -> np.ndarray:
    above = norm.sf((0.5 - mean) / sd)
    tied = norm.cdf((0.5 - mean) / sd) - norm.cdf((-0.5 - mean) / sd)
    result: np.ndarray = above + tied * p_tie
    return result


# ---------------------------------------------------------------------------------------------
# Metrics.


def per_game(values: np.ndarray, index: np.ndarray, games: int) -> tuple[np.ndarray, np.ndarray]:
    total = np.bincount(index, weights=values, minlength=games)
    count = np.bincount(index, minlength=games)
    return total, count


def state_losses(p: np.ndarray, win: np.ndarray) -> dict[str, np.ndarray]:
    q = np.clip(p, CLIP, 1 - CLIP)
    return {
        "log_loss": -(win * np.log(q) + (1 - win) * np.log(1 - q)),
        "brier": (p - win) ** 2,
    }


def game_means(
    loss: np.ndarray, index: np.ndarray, games: int, mask: np.ndarray | None = None
) -> tuple[np.ndarray, np.ndarray]:
    """Mean loss per game (NaN-free) and the games that reach the mask."""
    selected = np.ones(len(loss), dtype=bool) if mask is None else mask
    total, count = per_game(loss[selected], index[selected], games)
    reached = count > 0
    means = np.zeros(games)
    means[reached] = total[reached] / count[reached]
    return means, reached


def bootstrap_interval(
    values: np.ndarray, level: float = 0.95, reached: np.ndarray | None = None
) -> dict[str, float]:
    kept = values if reached is None else values[reached]
    rng = np.random.default_rng(SEED)
    picks = rng.integers(0, len(kept), size=(REPLICATES, len(kept)))
    draws = kept[picks].mean(axis=1)
    tail = (1 - level) / 2
    return {
        "mean": float(kept.mean()),
        "low": float(np.quantile(draws, tail)),
        "high": float(np.quantile(draws, 1 - tail)),
        "games": len(kept),
    }


def calibration(p: np.ndarray, win: np.ndarray, weight: np.ndarray) -> dict[str, Any]:
    edges = np.linspace(0, 1, ECE_BINS + 1)
    bins = np.clip(np.digitize(p, edges) - 1, 0, ECE_BINS - 1)
    total = weight.sum()
    curve = []
    error = 0.0
    for b in range(ECE_BINS):
        chosen = bins == b
        mass = weight[chosen].sum()
        if mass == 0:
            continue
        predicted = float(np.average(p[chosen], weights=weight[chosen]))
        observed = float(np.average(win[chosen], weights=weight[chosen]))
        error += mass / total * abs(predicted - observed)
        curve.append({"predicted": predicted, "observed": observed, "share": float(mass / total)})
    return {"ece": float(error), "curve": curve}


# ---------------------------------------------------------------------------------------------
# Boosters.


def params(leaves: int, objective: Any = "regression") -> dict[str, Any]:
    return {
        "objective": objective,
        "learning_rate": BOOST["learning_rate"],
        "num_leaves": leaves,
        "min_data_in_leaf": BOOST["min_data_in_leaf"],
        "feature_fraction": BOOST["feature_fraction"],
        "bagging_fraction": BOOST["bagging_fraction"],
        "bagging_freq": 1,
        "lambda_l2": BOOST["lambda_l2"],
        "num_threads": REGISTERED.budget.cpu_threads,
        "seed": SEED,
        "deterministic": True,
        "force_row_wise": True,
        "verbosity": -1,
        "max_bin": 127,
    }


def _variance_objective(score: np.ndarray, dataset: Any) -> tuple[np.ndarray, np.ndarray]:
    # LightGBM passes custom objectives and metrics scores that already include init_score.
    weight = dataset.get_weight()
    squared = dataset.get_label() * np.exp(-score)
    return 0.5 * weight * (1 - squared), np.maximum(0.5 * weight * squared, 1e-6)


def _variance_metric(score: np.ndarray, dataset: Any) -> tuple[str, float, bool]:
    loss = 0.5 * (score + dataset.get_label() * np.exp(-score))
    return "nll", float(np.average(loss, weights=dataset.get_weight())), False


class Stack:
    """Arrays for one split: features and offsets from the sampled views."""

    def __init__(
        self,
        seasons: list[Season],
        signs: list[np.ndarray],
        mu: str,
        names: tuple[str, ...],
        base: dict[str, float],
    ) -> None:
        self.x = np.concatenate([s.view(g, mu, names) for s, g in zip(seasons, signs, strict=True)])
        self.y = np.concatenate([g * s.target for s, g in zip(seasons, signs, strict=True)])
        self.weight = np.concatenate([s.weight for s in seasons])
        self.offset = np.concatenate(
            [
                SHRINK * (g * s.margin + base["beta"] * g * s.game[mu] * s.fraction)
                for s, g in zip(seasons, signs, strict=True)
            ]
        )
        self.log_variance = np.concatenate(
            [2 * math.log(base["sigma"]) + np.log(s.fraction) for s in seasons]
        )
        offsets = np.cumsum([0] + [len(s.games) for s in seasons[:-1]])
        self.groups = np.concatenate([s.index + o for s, o in zip(seasons, offsets, strict=True)])


def fit_distribution(
    train: Stack, select: Stack, names: tuple[str, ...], leaves: int
) -> dict[str, Any]:
    constraints = [MONOTONE.get(n, 0) for n in names]
    config = {**params(leaves), "monotone_constraints": constraints, "metric": "l2"}
    callbacks: list[Any] = [lgb.early_stopping(BOOST["early_stopping_rounds"], verbose=False)]

    def dataset(stack: Stack, offset: np.ndarray, label: np.ndarray, reference: Any = None) -> Any:
        return lgb.Dataset(
            stack.x,
            label=label,
            weight=stack.weight * len(stack.weight) / stack.weight.sum(),
            init_score=offset,
            feature_name=list(names),
            reference=reference,
            free_raw_data=False,
        )

    full_set = dataset(train, train.offset, train.y)
    select_set = dataset(select, select.offset, select.y, full_set)
    mean = lgb.train(
        config,
        full_set,
        num_boost_round=BOOST["max_rounds"],
        valid_sets=[select_set],
        callbacks=callbacks,
    )
    rounds = mean.best_iteration or BOOST["max_rounds"]

    # Out-of-fold residuals: the variance must not learn from the mean's own training fit.
    folds = (train.groups % 2).astype(bool)
    oof = np.zeros(len(train.y))
    for held in (False, True):
        keep = np.flatnonzero(folds != held)
        out = np.flatnonzero(folds == held)
        part = lgb.Dataset(
            train.x[keep],
            label=train.y[keep],
            weight=train.weight[keep] * len(keep) / train.weight[keep].sum(),
            init_score=train.offset[keep],
            feature_name=list(names),
        )
        booster = lgb.train(config, part, num_boost_round=rounds)
        oof[out] = train.offset[out] + booster.predict(train.x[out])

    residual = (train.y - oof) ** 2
    held_residual = (select.y - (select.offset + mean.predict(select.x))) ** 2
    variance_config = {**params(leaves, _variance_objective), "metric": "None"}
    variance_set = dataset(train, train.log_variance, residual)
    variance_select = dataset(select, select.log_variance, held_residual, variance_set)
    variance = lgb.train(
        variance_config,
        variance_set,
        num_boost_round=BOOST["max_rounds"],
        valid_sets=[variance_select],
        feval=_variance_metric,
        callbacks=callbacks,
    )
    return {
        "mean": mean,
        "variance": variance,
        "mean_rounds": rounds,
        "variance_rounds": variance.best_iteration,
    }


def predict_side(
    model: dict[str, Any] | None,
    season: Season,
    sign: np.ndarray,
    mu: str,
    names: tuple[str, ...],
    base: dict[str, float],
    ot_slope: float,
) -> np.ndarray:
    mean = sign * season.margin + base["beta"] * sign * season.game[mu] * season.fraction
    log_variance = 2 * math.log(base["sigma"]) + np.log(season.fraction)
    if model is not None:
        x = season.view(sign, mu, names)
        mean = SHRINK * mean + model["mean"].predict(x)
        log_variance = log_variance + model["variance"].predict(x, raw_score=True)
    tie = expit(ot_slope * sign * season.game[mu])
    return win_from_normal(mean, np.exp(0.5 * log_variance), tie)


def symmetric(side: Any, season: Season) -> np.ndarray:
    home = side(season, np.ones(len(season.time)))
    away = side(season, -np.ones(len(season.time)))
    result: np.ndarray = 0.5 * (home + 1 - away)
    return result


def score_all(p: np.ndarray, season: Season) -> dict[str, np.ndarray]:
    return {k: v for k, v in state_losses(p, season.win).items()}


def save_prediction(output: Path, name: str, season: str, p: np.ndarray) -> None:
    directory = output / "predictions" / name
    directory.mkdir(parents=True, exist_ok=True)
    np.save(directory / f"{season}.npy", p.astype(np.float32))


def read_prediction(output: Path, name: str, season: str) -> np.ndarray:
    result: np.ndarray = np.load(output / "predictions" / name / f"{season}.npy").astype(np.float64)
    return result


def write_model_file(output: Path, booster: Any) -> str:
    text: str = booster.model_to_string()
    digest = hashlib.sha256(text.encode()).hexdigest()
    directory = output / "models"
    directory.mkdir(parents=True, exist_ok=True)
    path = directory / f"{digest}.txt"
    if not path.exists():
        path.write_text(text)
    return digest


def read_model(output: Path, digest: str) -> Any:
    text = (output / "models" / f"{digest}.txt").read_text()
    if hashlib.sha256(text.encode()).hexdigest() != digest:
        raise ValueError("changed model file")
    return lgb.Booster(model_str=text)


# ---------------------------------------------------------------------------------------------
# Ladder.


def ladder_path(output: Path) -> Path:
    return output / "ladder.json"


def read_ladder(output: Path) -> dict[str, Any]:
    path = ladder_path(output)
    if path.exists():
        body: dict[str, Any] = json.loads(path.read_text())
        return body
    return {"registration": registration_receipt(REGISTRATION), "steps": {}, "accepted": None}


def improvement(
    candidate: np.ndarray,
    reference: np.ndarray,
    season: Season,
    level: float,
    mask: np.ndarray | None = None,
) -> dict[str, float]:
    games = len(season.games)
    new, reached = game_means(
        state_losses(candidate, season.win)["log_loss"], season.index, games, mask
    )
    old, _ = game_means(state_losses(reference, season.win)["log_loss"], season.index, games, mask)
    return bootstrap_interval(old - new, level=level, reached=reached)


def fit_s0(output: Path) -> dict[str, Any]:
    """S0: the Brownian baseline with team-form mu0. No boosters."""
    names = tuple(SPLITS["train"] + SPLITS["select"] + SPLITS["calibrate"])
    seasons = load_seasons(list(names), output)
    train = [seasons[n] for n in SPLITS["train"]]
    signs = views(train)
    baseline = {mu: fit_baseline(train, signs, mu) for mu in (MU_FORM, MU_FULL)}
    overtime = {mu: fit_overtime(train, mu) for mu in (MU_FORM, MU_FULL)}
    ladder = read_ladder(output)
    ladder["baseline"] = baseline
    ladder["overtime_slope"] = overtime
    for name in SPLITS["select"] + SPLITS["calibrate"]:
        season = seasons[name]

        def side(s: Season, sign: np.ndarray) -> np.ndarray:
            return predict_side(None, s, sign, MU_FORM, (), baseline[MU_FORM], overtime[MU_FORM])

        save_prediction(output, "S0", name, symmetric(side, season))
    season = seasons[SPLITS["select"][0]]
    p = read_prediction(output, "S0", season.season)
    games = len(season.games)
    loss, _ = game_means(state_losses(p, season.win)["log_loss"], season.index, games)
    ladder["steps"]["S0"] = {
        "mu": MU_FORM,
        "features": [],
        "select_log_loss": bootstrap_interval(loss),
    }
    ladder["accepted"] = "S0"
    ladder_path(output).write_text(json.dumps(ladder, indent=1, sort_keys=True))
    print(json.dumps({"baseline": baseline, "overtime": overtime, "S0": ladder["steps"]["S0"]}))
    return ladder


def step_definition(ladder: dict[str, Any], name: str) -> tuple[str, tuple[str, ...], list[str]]:
    """The mu0 and features for a step: accepted groups so far plus this step's group."""
    if name == "S0g":
        return MU_FORM, GROUPS["base"], ["base"]
    groups = list(ladder.get("accepted_groups", []))
    if name not in groups:
        groups.append(name)
    mu = MU_FULL if "S2" in groups else MU_FORM
    features = tuple(GROUPS["base"]) + tuple(
        n for g in STEP_ORDER if g in groups for n in GROUPS[g]
    )
    return mu, features, groups


def fit_step(name: str, output: Path) -> dict[str, Any]:
    started = time.monotonic()
    ladder = read_ladder(output)
    if name in ladder["steps"]:
        raise ValueError(f"{name} is already fitted")
    mu, features, groups = step_definition(ladder, name)
    seasons = load_seasons(SPLITS["train"] + SPLITS["select"] + SPLITS["calibrate"], output)
    train_seasons = [seasons[s] for s in SPLITS["train"]]
    signs = views(train_seasons)
    base = ladder["baseline"][mu]
    slope = ladder["overtime_slope"][mu]
    train = Stack(train_seasons, signs, mu, features, base)
    select_season = seasons[SPLITS["select"][0]]
    rng = np.random.default_rng(SEED + 1)
    select_sign = rng.choice(np.array([1.0, -1.0]), size=len(select_season.time))
    select = Stack([select_season], [select_sign], mu, features, base)

    grid = BOOST["num_leaves_grid_at_S1"] if name == "S1" else [ladder.get("leaves", 31)]
    best: dict[str, Any] | None = None
    for leaves in grid:
        model = fit_distribution(train, select, features, leaves)

        def side(s: Season, sign: np.ndarray, m: dict[str, Any] = model) -> np.ndarray:
            return predict_side(m, s, sign, mu, features, base, slope)

        p = symmetric(side, select_season)
        loss, _ = game_means(
            state_losses(p, select_season.win)["log_loss"],
            select_season.index,
            len(select_season.games),
        )
        if best is None or loss.mean() < best["loss"]:
            best = {"loss": float(loss.mean()), "model": model, "leaves": leaves, "p": p}
    assert best is not None
    model = best["model"]
    del train, select

    reference = read_prediction(output, str(ladder["accepted"]), select_season.season)
    gain = improvement(best["p"], reference, select_season, 0.90)
    accepted = name != "S0g" and gain["low"] > 0
    save_prediction(output, name, select_season.season, best["p"])
    calibrate_name = SPLITS["calibrate"][0]

    def final_side(s: Season, sign: np.ndarray) -> np.ndarray:
        return predict_side(model, s, sign, mu, features, base, slope)

    save_prediction(output, name, calibrate_name, symmetric(final_side, seasons[calibrate_name]))
    entry = {
        "mu": mu,
        "features": list(features),
        "groups": groups,
        "leaves": best["leaves"],
        "mean_model": write_model_file(output, model["mean"]),
        "variance_model": write_model_file(output, model["variance"]),
        "mean_rounds": model["mean_rounds"],
        "variance_rounds": model["variance_rounds"],
        "select_log_loss": best["loss"],
        "compared_with": ladder["accepted"],
        "improvement_90": gain,
        "accepted": accepted,
        "elapsed_seconds": round(time.monotonic() - started, 1),
    }
    ladder = read_ladder(output)
    ladder["steps"][name] = entry
    if name == "S1":
        ladder["leaves"] = best["leaves"]
    if accepted:
        ladder["accepted"] = name
        ladder["accepted_groups"] = groups
    ladder_path(output).write_text(json.dumps(ladder, indent=1, sort_keys=True))
    print(
        json.dumps(
            {
                "step": name,
                **{
                    k: entry[k]
                    for k in (
                        "leaves",
                        "mean_rounds",
                        "variance_rounds",
                        "select_log_loss",
                        "improvement_90",
                        "accepted",
                        "elapsed_seconds",
                    )
                },
            }
        ),
        flush=True,
    )
    return entry


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("command", choices=("pregame", "s0", "step"))
    parser.add_argument("name", nargs="?")
    parser.add_argument("--output", type=Path, default=OUTPUT)
    args = parser.parse_args()
    if args.command == "pregame":
        fit_pregame(args.output)
    elif args.command == "s0":
        fit_s0(args.output)
    else:
        fit_step(args.name, args.output)


if __name__ == "__main__":
    main()
