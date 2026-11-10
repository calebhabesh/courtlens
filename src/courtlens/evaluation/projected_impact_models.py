"""Fit, select, test and freeze Projected Impact (`courtlens-projected-impact-v1`, R07).

Stages, in order: `checks` (causality, windows, 2026-27 build), `select` (2016-17 to 2022-23 fits,
2023-24 selection, conformal quantiles, game mapping), `test` (reads 2024-25 and 2025-26 once) and
`freeze` (writes the hashed 2026-27 projections; refuses to run twice). Test-season targets are
read only inside `test`.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import shutil
import time
from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

import lightgbm as lgb
import numpy as np
from sklearn.linear_model import Ridge  # type: ignore[import-untyped]
from threadpoolctl import threadpool_limits  # type: ignore[import-untyped]

from courtlens.domain.projected_impact import (
    INTERVAL_MIN_TARGET_MINUTES,
    NO_PRIOR_BUCKET,
    NOMINAL_COVERAGE,
    PRIOR,
    REGISTRATION,
    RETURNER,
    ROOKIE,
    conformal_quantile,
    minutes_bucket,
    strength_difference,
)
from courtlens.domain.research_registry import load_registration, registration_receipt
from courtlens.evaluation.projected_impact_data import (
    OUTPUT,
    PROSPECTIVE,
    SELECT,
    SHOT_ZONES,
    TARGETS,
    TEST,
    TRAIN,
    Sources,
    causality_check,
    coverage,
    feature_block,
    feature_names,
    game_rows,
    load_sources,
    population,
    previous,
    prospective_check,
    season_features,
    target_rows,
    window_check,
)

ARTIFACTS = Path("data/artifacts/projected-impact")
MANIFEST_PATH = Path("evaluation/research/frozen/courtlens-projected-impact-v1.json")
CARD_PATH = Path("evaluation/research/frozen/courtlens-projected-impact-v1-card.json")
EVIDENCE = Path("docs/evidence/research/r07")
FROZEN_VERSION = "courtlens-projected-impact-v1-frozen-2026-27"
CANDIDATES = ("carry_forward", "time_decay", "age_curve", "ridge", "lightgbm")
THREADS = 2
AGE_CENTRE = 27.0
TARGET_MINUTE_BUCKETS = ((500.0, 1000.0), (1000.0, 2000.0), (2000.0, 1e9))


def registered() -> dict[str, Any]:
    return load_registration(REGISTRATION).parameters


@dataclass
class Rows:
    """One season's players as arrays, in a fixed player order."""

    season: str
    players: list[str]
    names: tuple[str, ...]
    x: np.ndarray
    groups: np.ndarray
    feature_sha256: str

    def column(self, name: str) -> np.ndarray:
        return self.x[:, self.names.index(name)]


def rows_for(season: str, players: list[str], sources: Sources) -> Rows:
    built = season_features(season, players, sources)
    names = feature_names(sources.defensive_types)
    x = np.array(
        [
            [np.nan if built["features"][p][n] is None else built["features"][p][n] for n in names]
            for p in players
        ],
        dtype=np.float64,
    )
    groups = np.array([built["groups"][p] for p in players])
    return Rows(season, players, names, x, groups, built["feature_sha256"])


def attach_target(rows: Rows, sources: Sources) -> tuple[np.ndarray, np.ndarray]:
    """Target and minutes. A box-only player with no fit row has no target and zero weight."""
    target = target_rows(rows.season, sources)
    y = np.array([target[p]["target"] if p in target else np.nan for p in rows.players])
    minutes = np.array([target[p]["minutes"] if p in target else 0.0 for p in rows.players])
    return y, minutes


# ---------------------------------------------------------------------------------------------
# Models.


def _blocks(names: tuple[str, ...]) -> list[str]:
    return sorted({feature_block(n) for n in names})


def ridge_design(x: np.ndarray, state: dict[str, Any], names: tuple[str, ...]) -> np.ndarray:
    means, stds = np.array(state["means"]), np.array(state["stds"])
    z = (x - means) / stds
    missing = np.isnan(z)
    z[missing] = 0.0
    blocks = _blocks(names)
    indicators = np.zeros((len(x), len(blocks)))
    for j, block in enumerate(blocks):
        columns = [i for i, n in enumerate(names) if feature_block(n) == block]
        indicators[:, j] = missing[:, columns].any(axis=1)
    return np.hstack([z, indicators])


def ridge_fit(
    x: np.ndarray, y: np.ndarray, w: np.ndarray, alpha: float, names: tuple[str, ...]
) -> dict[str, Any]:
    means = np.nanmean(x, axis=0)
    stds = np.nanstd(x, axis=0)
    stds[stds == 0] = 1.0
    state: dict[str, Any] = {"means": means.tolist(), "stds": stds.tolist(), "alpha": alpha}
    model = Ridge(alpha=alpha)
    model.fit(ridge_design(x.copy(), state, names), y, sample_weight=w / w.mean())
    state["coefficients"] = model.coef_.tolist()
    state["intercept"] = float(model.intercept_)
    return state


def ridge_predict(x: np.ndarray, state: dict[str, Any], names: tuple[str, ...]) -> np.ndarray:
    design = ridge_design(x.copy(), state, names)
    return np.asarray(design @ np.array(state["coefficients"]) + state["intercept"])


def lightgbm_parameters(leaves: int, min_leaf: int, seed: int) -> dict[str, Any]:
    return {
        "objective": "regression",
        "learning_rate": 0.03,
        "num_leaves": leaves,
        "min_data_in_leaf": min_leaf,
        "feature_fraction": 0.8,
        "bagging_fraction": 0.8,
        "bagging_freq": 1,
        "lambda_l2": 10.0,
        "seed": seed,
        "deterministic": True,
        "force_row_wise": True,
        "num_threads": THREADS,
        "verbose": -1,
    }


def lightgbm_columns(names: tuple[str, ...]) -> list[int]:
    return [i for i, n in enumerate(names) if n != "age_squared"]


def lightgbm_fit(
    x: np.ndarray,
    y: np.ndarray,
    w: np.ndarray,
    names: tuple[str, ...],
    parameters: dict[str, Any],
    rounds: int,
) -> lgb.Booster:
    columns = lightgbm_columns(names)
    data = lgb.Dataset(
        x[:, columns],
        y,
        weight=w / w.mean(),
        feature_name=[names[i] for i in columns],
        free_raw_data=False,
    )
    return lgb.train(parameters, data, num_boost_round=rounds)


def age_adjustment(age: np.ndarray, coefficients: list[float]) -> np.ndarray:
    """Year-on-year change at an age; a missing age gets no adjustment."""
    out = np.polyval(coefficients, age - AGE_CENTRE)
    return np.where(np.isnan(age), 0.0, out)


# ---------------------------------------------------------------------------------------------
# Scoring.


def weighted_mse(y: np.ndarray, p: np.ndarray, w: np.ndarray) -> float:
    return float(np.sum(w * (y - p) ** 2) / np.sum(w))


def weighted_correlation(y: np.ndarray, p: np.ndarray, w: np.ndarray) -> float:
    my, mp = np.average(y, weights=w), np.average(p, weights=w)
    cov = np.average((y - my) * (p - mp), weights=w)
    sy = np.average((y - my) ** 2, weights=w)
    sp = np.average((p - mp) ** 2, weights=w)
    return float(cov / np.sqrt(sy * sp)) if sy > 0 and sp > 0 else 0.0


def paired_gap(
    units: np.ndarray,
    y: np.ndarray,
    base: np.ndarray,
    model: np.ndarray,
    w: np.ndarray,
    seed: int,
    replicates: int,
    level: float = 0.95,
) -> dict[str, float]:
    """Squared-error gap, base minus model, weighted; positive favours the model. Unit bootstrap."""
    _, index = np.unique(units, return_inverse=True)
    n = int(index.max()) + 1
    numerator = np.bincount(index, w * ((y - base) ** 2 - (y - model) ** 2), minlength=n)
    denominator = np.bincount(index, w, minlength=n)
    rng = np.random.default_rng(seed)
    picks = rng.integers(0, n, size=(replicates, n))
    values = numerator[picks].sum(axis=1) / denominator[picks].sum(axis=1)
    tail = (1 - level) / 2
    return {
        "gap": float(numerator.sum() / denominator.sum()),
        "low": float(np.quantile(values, tail)),
        "high": float(np.quantile(values, 1 - tail)),
        "units": n,
        "level": level,
    }


# ---------------------------------------------------------------------------------------------
# Predicting every candidate.


def predict_all(rows: Rows, state: dict[str, Any], booster: lgb.Booster) -> dict[str, np.ndarray]:
    groups = rows.groups
    means = state["group_means"]
    fallback = np.array([means.get(g, 0.0) for g in groups])
    prior = rows.column("rapm_total_1")
    has_prior = groups == PRIOR
    carry = np.where(has_prior, prior, fallback)
    decay = rows.column("td_rapm")
    time_decay = np.where(np.isnan(decay), fallback, decay)
    age_curve = np.where(
        has_prior, prior + age_adjustment(rows.column("age"), state["age_curve"]), fallback
    )
    ridge = ridge_predict(rows.x, state["ridge"], rows.names)
    booster_x = rows.x[:, lightgbm_columns(rows.names)]
    forest = np.asarray(booster.predict(booster_x))
    return {
        "carry_forward": carry,
        "time_decay": time_decay,
        "age_curve": age_curve,
        "ridge": ridge,
        "lightgbm": forest,
    }


def game_design(
    games: list[dict[str, Any]],
    rows: Rows,
    predictions: dict[str, np.ndarray],
    fallback: float,
) -> tuple[dict[str, np.ndarray], np.ndarray, dict[str, float]]:
    ratings = {
        name: dict(zip(rows.players, values.tolist(), strict=True))
        for name, values in predictions.items()
    }
    out = {}
    unprojected = total = 0.0
    for name, table in ratings.items():
        values = []
        for game in games:
            strength = strength_difference(game["players"], table, fallback)
            values.append(strength.difference)
            if name == "carry_forward":
                unprojected += strength.unprojected_seconds
                total += strength.total_seconds
        out[name] = np.array(values)
    margin = np.array([g["margin"] for g in games], dtype=np.float64)
    return out, margin, {"unprojected_minutes_share": unprojected / total if total else 0.0}


def game_scores(
    design: dict[str, np.ndarray],
    margin: np.ndarray,
    mapping: dict[str, dict[str, float]],
    seed: int,
    replicates: int,
    ids: list[str],
    selected: str,
) -> dict[str, Any]:
    predictions = {
        name: mapping[name]["a"] + mapping[name]["b"] * values for name, values in design.items()
    }
    out: dict[str, Any] = {"games": len(margin), "ratings": {}}
    for name, p in predictions.items():
        decided = margin != 0
        out["ratings"][name] = {
            "rmse": float(np.sqrt(np.mean((margin - p) ** 2))),
            "winner_accuracy": float(np.mean(np.sign(p[decided]) == np.sign(margin[decided]))),
        }
    units = np.array(ids)
    weight = np.ones(len(margin))
    out["gaps"] = {
        f"{name}_over_{base}": paired_gap(
            units, margin, predictions[base], predictions[name], weight, seed, replicates
        )
        for base in ("carry_forward", "time_decay")
        for name in {selected, "age_curve", "ridge", "lightgbm"} - {base}
    }
    return out


def conformal(
    y: np.ndarray, p: np.ndarray, minutes: np.ndarray, rows: Rows
) -> dict[str, float | int]:
    prior_minutes = rows.column("minutes_1")
    buckets = np.array(
        [
            minutes_bucket(None if np.isnan(m) else float(m), str(g))
            for m, g in zip(prior_minutes, rows.groups, strict=True)
        ]
    )
    use = (minutes >= INTERVAL_MIN_TARGET_MINUTES) & ~np.isnan(y)
    out: dict[str, float | int] = {}
    for bucket in ("under_500", "500_to_1499", "1500_plus", NO_PRIOR_BUCKET):
        chosen = use & (buckets == bucket)
        out[bucket] = conformal_quantile((y[chosen] - p[chosen]).tolist())
        out[f"{bucket}_n"] = int(chosen.sum())
    return out


def bucket_of(rows: Rows) -> np.ndarray:
    prior = rows.column("minutes_1")
    return np.array(
        [
            minutes_bucket(None if np.isnan(m) else float(m), str(g))
            for m, g in zip(prior, rows.groups, strict=True)
        ]
    )


# ---------------------------------------------------------------------------------------------
# Stages.


def run_checks(output: Path = OUTPUT) -> dict[str, Any]:
    sources = load_sources(output)
    seasons = TARGETS
    body: dict[str, Any] = {
        "F2_causality": causality_check(sources, (*seasons, PROSPECTIVE)),
        "F3_windows": window_check(sources, seasons),
        "F4_prospective_build": prospective_check(sources),
        "coverage": coverage(sources, output),
    }
    body["passed"] = all(
        body[k]["passed"] for k in ("F2_causality", "F3_windows", "F4_prospective_build")
    )
    (output / "checks.json").write_text(json.dumps(body, indent=1, sort_keys=True))
    return body


def run_select(output: Path = OUTPUT) -> dict[str, Any]:
    parameters = registered()
    seed = parameters["seed"]
    replicates = parameters["bootstrap"]["replicates"]
    sources = load_sources(output)
    names = feature_names(sources.defensive_types)
    train_rows = {s: rows_for(s, population(s, sources), sources) for s in TRAIN}
    train_targets = {s: attach_target(train_rows[s], sources) for s in TRAIN}

    def stacked(seasons: tuple[str, ...]) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
        x = np.vstack([train_rows[s].x for s in seasons])
        y = np.concatenate([train_targets[s][0] for s in seasons])
        w = np.concatenate([train_targets[s][1] for s in seasons])
        use = (w > 0) & ~np.isnan(y)
        return x[use], y[use], w[use]

    # Forward chain.
    folds = []
    for season in parameters["validation_seasons"]:
        earlier = tuple(s for s in TRAIN if s < season)
        rows = train_rows[season]
        y, w = train_targets[season]
        use = (w > 0) & ~np.isnan(y)
        folds.append((earlier, rows.x[use], y[use], w[use]))

    alpha_scores = {}
    for alpha in parameters["ridge_alpha_grid"]:
        error = weight = 0.0
        for earlier, vx, vy, vw in folds:
            x, y, w = stacked(earlier)
            fold_state = ridge_fit(x, y, w, float(alpha), names)
            fold_p = ridge_predict(vx, fold_state, names)
            error += float(np.sum(vw * (vy - fold_p) ** 2))
            weight += float(vw.sum())
        alpha_scores[str(alpha)] = error / weight
    best_alpha = float(min(alpha_scores, key=lambda a: alpha_scores[a]))

    grid = parameters["lightgbm_grid"]
    steps = list(range(grid["round_step"], grid["max_rounds"] + 1, grid["round_step"]))
    forest_scores: dict[str, float] = {}
    columns = lightgbm_columns(names)
    for leaves in grid["num_leaves"]:
        for min_leaf in grid["min_data_in_leaf"]:
            errors = np.zeros(len(steps))
            weight = 0.0
            for earlier, vx, vy, vw in folds:
                x, y, w = stacked(earlier)
                model = lightgbm_fit(
                    x, y, w, names, lightgbm_parameters(leaves, min_leaf, seed), grid["max_rounds"]
                )
                for i, rounds in enumerate(steps):
                    fold_p = np.asarray(model.predict(vx[:, columns], num_iteration=rounds))
                    errors[i] += float(np.sum(vw * (vy - fold_p) ** 2))
                weight += float(vw.sum())
            for i, rounds in enumerate(steps):
                forest_scores[f"{leaves}:{min_leaf}:{rounds}"] = float(errors[i] / weight)
    best_key = min(forest_scores, key=lambda k: forest_scores[k])
    best_leaves, best_min_leaf, best_rounds = (int(v) for v in best_key.split(":"))

    # Final fits on every training target.
    x, y, w = stacked(TRAIN)
    ridge_state = ridge_fit(x, y, w, best_alpha, names)
    booster = lightgbm_fit(
        x, y, w, names, lightgbm_parameters(best_leaves, best_min_leaf, seed), best_rounds
    )
    model_text = booster.model_to_string()
    model_sha = hashlib.sha256(model_text.encode()).hexdigest()
    (output / "models").mkdir(parents=True, exist_ok=True)
    (output / "models" / f"{model_sha}.txt").write_text(model_text)

    # Group means and the delta-method curve, training seasons only.
    group_error: dict[str, list[float]] = {ROOKIE: [0.0, 0.0], RETURNER: [0.0, 0.0]}
    ages: list[float] = []
    deltas: list[float] = []
    delta_weights: list[float] = []
    for season in TRAIN:
        rows = train_rows[season]
        ys, ws = train_targets[season]
        for group, entry in group_error.items():
            chosen = (rows.groups == group) & (ws > 0) & ~np.isnan(ys)
            entry[0] += float(np.sum(ws[chosen] * ys[chosen]))
            entry[1] += float(np.sum(ws[chosen]))
        prior = rows.column("rapm_total_1")
        prior_minutes = rows.column("minutes_1")
        age = rows.column("age")
        chosen = (
            (rows.groups == PRIOR)
            & (ws > 0)
            & ~np.isnan(ys)
            & ~np.isnan(age)
            & ~np.isnan(prior_minutes)
        )
        ages.extend(age[chosen].tolist())
        deltas.extend((ys[chosen] - prior[chosen]).tolist())
        delta_weights.extend(np.minimum(ws[chosen], prior_minutes[chosen]).tolist())
    # numpy's polyfit weights multiply residuals, so the square root gives minutes-weighted squares.
    curve = np.polyfit(
        np.array(ages) - AGE_CENTRE,
        np.array(deltas),
        parameters["age_curve_degree"],
        w=np.sqrt(np.array(delta_weights)),
    ).tolist()
    state: dict[str, Any] = {
        "registration": registration_receipt(REGISTRATION),
        "names": list(names),
        "ridge": ridge_state,
        "ridge_alpha_scores": alpha_scores,
        "lightgbm": {
            "sha256": model_sha,
            "num_leaves": best_leaves,
            "min_data_in_leaf": best_min_leaf,
            "rounds": best_rounds,
            "validation_mse": forest_scores[best_key],
        },
        "age_curve": curve,
        "age_centre": AGE_CENTRE,
        "group_means": {g: e[0] / e[1] for g, e in group_error.items()},
    }

    # Selection on 2023-24.
    rows = rows_for(SELECT, population(SELECT, sources), sources)
    y, minutes = attach_target(rows, sources)
    predictions = predict_all(rows, state, booster)
    prior_mask = (rows.groups == PRIOR) & (minutes > 0) & ~np.isnan(y)
    units = np.array(rows.players)
    scores = {
        name: weighted_mse(y[prior_mask], p[prior_mask], minutes[prior_mask])
        for name, p in predictions.items()
    }
    learned = min(("ridge", "lightgbm"), key=lambda n: scores[n])

    def gap_over_carry(name: str) -> dict[str, float]:
        return paired_gap(
            units[prior_mask],
            y[prior_mask],
            predictions["carry_forward"][prior_mask],
            predictions[name][prior_mask],
            minutes[prior_mask],
            seed,
            replicates,
            level=0.90,
        )

    gaps = {name: gap_over_carry(name) for name in ("age_curve", "ridge", "lightgbm", "time_decay")}
    if gaps[learned]["low"] > 0:
        selected = learned
    elif gaps["age_curve"]["low"] > 0:
        selected = "age_curve"
    else:
        selected = "carry_forward"

    # Frozen before the test seasons are read.
    games = game_rows(int(SELECT[:4]) + 1)
    design, margin, shares = game_design(games, rows, predictions, state["group_means"][ROOKIE])
    mapping = {}
    for name, values in design.items():
        b, a = np.polyfit(values, margin, 1)
        mapping[name] = {"a": float(a), "b": float(b)}
    state.update(
        {
            "selection": {
                "season": SELECT,
                "players": int(prior_mask.sum()),
                "weighted_mse": scores,
                "gaps_over_carry_forward_90": gaps,
                "learned_candidate": learned,
                "selected": selected,
                "game_unprojected_share": shares["unprojected_minutes_share"],
            },
            "selected": selected,
            "conformal": {name: conformal(y, p, minutes, rows) for name, p in predictions.items()},
            "game_mapping": mapping,
        }
    )
    state["state_sha256"] = hashlib.sha256(
        json.dumps({k: v for k, v in state.items() if k != "state_sha256"}, sort_keys=True).encode()
    ).hexdigest()
    (output / "selection.json").write_text(json.dumps(state, indent=1, sort_keys=True))
    selection: dict[str, Any] = state["selection"]
    return selection | {
        "ridge_alpha": best_alpha,
        "lightgbm": state["lightgbm"],
        "group_means": state["group_means"],
        "age_curve": curve,
        "game_mapping": mapping,
    }


def read_state(output: Path = OUTPUT) -> tuple[dict[str, Any], lgb.Booster]:
    state = json.loads((output / "selection.json").read_text())
    expected = hashlib.sha256(
        json.dumps({k: v for k, v in state.items() if k != "state_sha256"}, sort_keys=True).encode()
    ).hexdigest()
    if expected != state["state_sha256"]:
        raise ValueError("selection changed after it was written")
    path = output / "models" / f"{state['lightgbm']['sha256']}.txt"
    text = path.read_text()
    if hashlib.sha256(text.encode()).hexdigest() != state["lightgbm"]["sha256"]:
        raise ValueError("model file changed")
    return state, lgb.Booster(model_str=text)


def run_test(output: Path = OUTPUT) -> dict[str, Any]:
    path = output / "test-report.json"
    if path.exists():
        raise ValueError("the final test has already been read; a re-run needs a new version")
    parameters = registered()
    seed, replicates = parameters["seed"], parameters["bootstrap"]["replicates"]
    limits = parameters["coverage_limits"]
    sources = load_sources(output)
    state, booster = read_state(output)
    selected = state["selected"]
    pooled: dict[str, list[np.ndarray]] = {}
    per_season: dict[str, Any] = {}
    all_games: dict[str, list[Any]] = {"ids": [], "margin": [], "design": []}

    def collect(key: str, value: np.ndarray) -> None:
        pooled.setdefault(key, []).append(value)

    def player_table(
        y: np.ndarray, w: np.ndarray, units: np.ndarray, p: dict[str, np.ndarray]
    ) -> dict[str, Any]:
        out: dict[str, Any] = {
            "players": len(y),
            "minutes": float(w.sum()),
            "models": {
                name: {
                    "rmse": float(np.sqrt(weighted_mse(y, values, w))),
                    "correlation": weighted_correlation(y, values, w),
                }
                for name, values in p.items()
            },
            "gaps": {},
        }
        for base in ("carry_forward", "time_decay"):
            for name in sorted({selected, "age_curve", "ridge", "lightgbm"} - {base}):
                out["gaps"][f"{name}_over_{base}"] = paired_gap(
                    units, y, p[base], p[name], w, seed, replicates
                )
        return out

    def coverage_table(
        y: np.ndarray, low: np.ndarray, high: np.ndarray, m: np.ndarray, buckets: np.ndarray
    ) -> dict[str, Any]:
        inside = (y >= low) & (y <= high)
        use = m >= INTERVAL_MIN_TARGET_MINUTES
        table: dict[str, Any] = {
            "nominal": NOMINAL_COVERAGE,
            "overall": {"coverage": float(inside[use].mean()), "players": int(use.sum())},
            "by_prior_minutes": {},
            "by_target_minutes_diagnostic": {},
            "mean_width": float(np.mean((high - low)[use])),
        }
        for bucket in ("under_500", "500_to_1499", "1500_plus", NO_PRIOR_BUCKET):
            chosen = use & (buckets == bucket)
            table["by_prior_minutes"][bucket] = {
                "coverage": float(inside[chosen].mean()) if chosen.any() else None,
                "players": int(chosen.sum()),
                "half_width": state["conformal"][selected][bucket],
            }
        for lo, hi in TARGET_MINUTE_BUCKETS:
            chosen = (m >= lo) & (m < hi)
            table["by_target_minutes_diagnostic"][f"{int(lo)}+"] = {
                "coverage": float(inside[chosen].mean()) if chosen.any() else None,
                "players": int(chosen.sum()),
            }
        return table

    groups_report: dict[str, dict[str, list[np.ndarray]]] = {ROOKIE: {}, RETURNER: {}}
    for season in TEST:
        rows = rows_for(season, population(season, sources), sources)
        y, minutes = attach_target(rows, sources)
        predictions = predict_all(rows, state, booster)
        fit = (minutes > 0) & ~np.isnan(y)
        chosen = fit & (rows.groups == PRIOR)
        buckets = bucket_of(rows)
        half = np.array([float(state["conformal"][selected][b]) for b in buckets])
        low = predictions[selected] - half
        high = predictions[selected] + half
        units = np.array(rows.players)
        per_season[season] = {
            "player": player_table(
                y[chosen],
                minutes[chosen],
                units[chosen],
                {k: v[chosen] for k, v in predictions.items()},
            ),
            "coverage": coverage_table(y[fit], low[fit], high[fit], minutes[fit], buckets[fit]),
        }
        collect("y", y[chosen])
        collect("w", minutes[chosen])
        collect("units", units[chosen])
        for name, values in predictions.items():
            collect(f"p:{name}", values[chosen])
        collect("cov_y", y[fit])
        collect("cov_low", low[fit])
        collect("cov_high", high[fit])
        collect("cov_m", minutes[fit])
        collect("cov_bucket", buckets[fit])
        for group, bins in groups_report.items():
            mask = fit & (rows.groups == group)
            bins.setdefault("y", []).append(y[mask])
            bins.setdefault("w", []).append(minutes[mask])
            bins.setdefault("units", []).append(units[mask])
            for name, values in predictions.items():
                bins.setdefault(f"p:{name}", []).append(values[mask])
        games = game_rows(int(season[:4]) + 1)
        design, margin, shares = game_design(games, rows, predictions, state["group_means"][ROOKIE])
        ids = [g["game_id"] for g in games]
        per_season[season]["game"] = {
            **game_scores(design, margin, state["game_mapping"], seed, replicates, ids, selected),
            **shares,
        }
        all_games["ids"].extend(ids)
        all_games["margin"].append(margin)
        all_games["design"].append(design)

    def joined(key: str) -> np.ndarray:
        return np.concatenate(pooled[key])

    pooled_predictions = {name: joined(f"p:{name}") for name in CANDIDATES}
    player = player_table(joined("y"), joined("w"), joined("units"), pooled_predictions)
    cover = coverage_table(
        joined("cov_y"),
        joined("cov_low"),
        joined("cov_high"),
        joined("cov_m"),
        joined("cov_bucket"),
    )
    margin = np.concatenate(all_games["margin"])
    design = {name: np.concatenate([d[name] for d in all_games["design"]]) for name in CANDIDATES}
    game = game_scores(
        design, margin, state["game_mapping"], seed, replicates, all_games["ids"], selected
    )

    groups: dict[str, Any] = {}
    for group, bins in groups_report.items():
        y = np.concatenate(bins["y"])
        w = np.concatenate(bins["w"])
        units = np.concatenate(bins["units"])
        p = {name: np.concatenate(bins[f"p:{name}"]) for name in CANDIDATES}
        groups[group] = {
            "players": len(y),
            "minutes": float(w.sum()),
            "group_mean_rule_rmse": float(np.sqrt(weighted_mse(y, p["carry_forward"], w))),
            "models": {
                name: {
                    "rmse": float(np.sqrt(weighted_mse(y, p[name], w))),
                    "gap_over_group_mean": paired_gap(
                        units, y, p["carry_forward"], p[name], w, seed, replicates
                    ),
                }
                for name in ("time_decay", "ridge", "lightgbm")
            },
        }

    def gate(table: dict[str, Any]) -> dict[str, Any]:
        if selected == "carry_forward":
            return {
                "passed": False,
                "reason": "carry_forward was selected, so it cannot beat itself",
            }
        entry = table[f"{selected}_over_carry_forward"]
        return {"passed": entry["low"] > 0, **entry}

    bucket_limit = limits["prior_minutes_bucket"]
    bucket_ok = all(
        entry["coverage"] is not None and abs(entry["coverage"] - NOMINAL_COVERAGE) <= bucket_limit
        for entry in cover["by_prior_minutes"].values()
    )
    overall_ok = abs(cover["overall"]["coverage"] - NOMINAL_COVERAGE) <= limits["overall"]
    report = {
        "registration": registration_receipt(REGISTRATION),
        "state_sha256": state["state_sha256"],
        "selected": selected,
        "read_at": datetime.now(UTC).isoformat(timespec="seconds"),
        "seasons": per_season,
        "pooled": {"player": player, "game": game, "coverage": cover, "groups": groups},
        "gates": {
            "A1_player": gate(player["gaps"]),
            "A2_game": gate(game["gaps"]),
            "F1_coverage": {
                "passed": overall_ok and bucket_ok,
                "overall_within_limit": overall_ok,
                "buckets_within_limit": bucket_ok,
            },
        },
    }
    path.write_text(json.dumps(report, indent=1, sort_keys=True))
    return report


# ---------------------------------------------------------------------------------------------
# Freeze.


def contributions(
    rows: Rows, state: dict[str, Any], booster: lgb.Booster, selected: str
) -> tuple[list[dict[str, Any]], float]:
    """Per-player contributions of the selected model, plus its base value."""
    names = rows.names
    n = len(rows.players)
    per_feature: np.ndarray
    columns: list[str]
    if selected == "ridge":
        design = ridge_design(rows.x.copy(), state["ridge"], names)
        per_feature = design * np.array(state["ridge"]["coefficients"])
        columns = [*names, *(f"missing:{b}" for b in _blocks(names))]
        base = float(state["ridge"]["intercept"])
    elif selected == "lightgbm":
        kept = lightgbm_columns(names)
        raw = np.asarray(booster.predict(rows.x[:, kept], pred_contrib=True))
        per_feature = raw[:, :-1]
        columns = [names[i] for i in kept]
        base = float(raw[0, -1])
    else:
        prior = rows.column("rapm_total_1")
        adjustment = (
            age_adjustment(rows.column("age"), state["age_curve"])
            if selected == "age_curve"
            else np.zeros(n)
        )
        per_feature = np.column_stack([np.nan_to_num(prior), adjustment])
        columns = ["rapm_total_1", "age"]
        base = 0.0
    out = []
    for i in range(n):
        by_block: dict[str, float] = {}
        for j, name in enumerate(columns):
            block = (
                feature_block(name.removeprefix("missing:"))
                if not name.startswith("missing:")
                else name.removeprefix("missing:")
            )
            by_block[block] = by_block.get(block, 0.0) + float(per_feature[i, j])
        order = np.argsort(-np.abs(per_feature[i]))[:8]
        top = []
        for j in order:
            if per_feature[i, j] == 0:
                continue
            value = None
            if columns[j] in names:
                raw_value = rows.x[i, names.index(columns[j])]
                value = None if np.isnan(raw_value) else float(raw_value)
            top.append(
                {"feature": columns[j], "value": value, "contribution": float(per_feature[i, j])}
            )
        out.append({"blocks": {k: round(v, 4) for k, v in by_block.items()}, "top": top})
    return out, base


def age_tables(state: dict[str, Any], booster: lgb.Booster, sources: Sources) -> dict[str, Any]:
    """The learned aging curves shown on the page, from training seasons only."""
    grid = np.arange(19.0, 41.0)
    yearly = age_adjustment(grid, state["age_curve"])
    centre = int(np.argmin(np.abs(grid - AGE_CENTRE)))
    cumulative = np.zeros(len(grid))
    for i in range(centre + 1, len(grid)):
        cumulative[i] = cumulative[i - 1] + yearly[i]
    for i in range(centre - 1, -1, -1):
        cumulative[i] = cumulative[i + 1] - yearly[i + 1]
    names = tuple(state["names"])
    stack = [rows_for(s, population(s, sources), sources).x for s in TRAIN]
    x = np.vstack(stack)
    age_i, square_i = names.index("age"), names.index("age_squared")
    dependence: dict[str, list[float]] = {"ridge": [], "lightgbm": []}
    kept = lightgbm_columns(names)
    for age in grid:
        changed = x.copy()
        changed[:, age_i] = age
        changed[:, square_i] = age * age
        dependence["ridge"].append(float(np.mean(ridge_predict(changed, state["ridge"], names))))
        dependence["lightgbm"].append(float(np.mean(booster.predict(changed[:, kept]))))
    return {
        "ages": grid.tolist(),
        "delta_method_yearly_change": yearly.tolist(),
        "delta_method_relative_to_27": cumulative.tolist(),
        "partial_dependence": dependence,
    }


def over_coverage_only(coverage_report: dict[str, Any]) -> bool:
    """True when no measured coverage falls below nominal: every failure is too wide, not narrow."""
    values = [coverage_report["overall"]["coverage"]]
    values += [e["coverage"] for e in coverage_report["by_prior_minutes"].values()]
    return all(v is not None and v >= NOMINAL_COVERAGE for v in values)


def freeze(output: Path = OUTPUT, waiver: str | None = None) -> dict[str, Any]:
    from courtlens.services.espn_rosters import load_latest

    if MANIFEST_PATH.exists():
        raise ValueError(f"{MANIFEST_PATH} exists: frozen projections do not change")
    checks = json.loads((output / "checks.json").read_text())
    report = json.loads((output / "test-report.json").read_text())
    if not checks["passed"]:
        raise ValueError("a pre-freeze check failed")
    if not report["gates"]["F1_coverage"]["passed"]:
        if waiver is None:
            raise ValueError("test-season coverage is outside its registered limits")
        if not over_coverage_only(report["pooled"]["coverage"]):
            raise ValueError("the owner's waiver covers over-coverage only")
    sources = load_sources(output)
    state, booster = read_state(output)
    selected = state["selected"]
    latest = load_latest()
    if latest is None:
        raise ValueError("no ESPN roster capture")
    roster_path, roster_body = latest
    roster = {str(p["player_id"]): p for p in roster_body["entry"]["players"] if p.get("player_id")}
    last_fit = sources.fits[previous(PROSPECTIVE)]
    players = sorted(set(roster) | set(last_fit.players))
    rows = rows_for(PROSPECTIVE, players, sources)
    predictions = predict_all(rows, state, booster)
    explained, base = contributions(rows, state, booster, selected)
    buckets = bucket_of(rows)
    shot_bundle = json.loads(next(SHOT_ZONES.glob("*.json")).read_bytes())
    last_names = {
        r["player_id"]: (r["name"], r["teams"][-1])
        for r in shot_bundle["seasons"]["2025-26"]["players"]
    }
    table: list[dict[str, Any]] = []
    for i, pid in enumerate(players):
        listed = roster.get(pid)
        last = last_names.get(pid)
        value = float(predictions[selected][i])
        half = float(state["conformal"][selected][buckets[i]])
        table.append(
            {
                "player_id": pid,
                "name": listed["name"] if listed else last[0] if last else pid,
                "team_id": listed["team_id"] if listed else None,
                "tricode": listed["tricode"] if listed else None,
                "last_tricode": last[1]["tricode"] if last else None,
                "on_roster": listed is not None,
                "group": str(rows.groups[i]),
                "bucket": str(buckets[i]),
                "age": None if np.isnan(rows.column("age")[i]) else float(rows.column("age")[i]),
                "years_in_league": None
                if np.isnan(rows.column("years_in_league")[i])
                else float(rows.column("years_in_league")[i]),
                "minutes_last_season": None
                if np.isnan(rows.column("minutes_1")[i])
                else float(rows.column("minutes_1")[i]),
                "projection": value,
                "low": value - half,
                "high": value + half,
                "ratings": {k: float(v[i]) for k, v in predictions.items()},
                "contributions": explained[i],
            }
        )
    table.sort(key=lambda r: -r["projection"])
    now = datetime.now(UTC).isoformat(timespec="seconds")
    body = {
        "version": FROZEN_VERSION,
        "registration": REGISTRATION,
        "season": PROSPECTIVE,
        "feature_cutoff": sources.openers[PROSPECTIVE],
        "frozen_at": now,
        "selected": selected,
        "feature_sha256": rows.feature_sha256,
        "roster_capture": roster_path.stem,
        "contribution_base": base,
        "players": table,
    }
    payload = json.dumps(body, indent=None, sort_keys=True).encode()
    digest = hashlib.sha256(payload).hexdigest()
    ARTIFACTS.mkdir(parents=True, exist_ok=True)
    (ARTIFACTS / f"{digest}.json").write_bytes(payload)
    model_source = output / "models" / f"{state['lightgbm']['sha256']}.txt"
    model_target = ARTIFACTS / f"{state['lightgbm']['sha256']}.txt"
    if not model_target.exists():
        shutil.copyfile(model_source, model_target)

    manifest = {
        "version": FROZEN_VERSION,
        "registration": REGISTRATION,
        "registration_sha256": report["registration"]["content_sha256"],
        "frozen_at": now,
        "selected": selected,
        "projections_sha256": digest,
        "lightgbm_sha256": state["lightgbm"]["sha256"],
        "state_sha256": state["state_sha256"],
        "trained_through": "2022-23",
        "calibrated_on": SELECT,
        "feature_cutoff": sources.openers[PROSPECTIVE],
        "feature_sha256": rows.feature_sha256,
        "game_mapping": state["game_mapping"],
        "group_means": state["group_means"],
        "fallback_rating": state["group_means"][ROOKIE],
        "conformal": state["conformal"][selected],
        "players": len(table),
        "first_prospective_rule": "scheduled tip after frozen_at",
        "checks": {
            "F1_coverage": report["gates"]["F1_coverage"],
            "F2_causality": checks["F2_causality"]["passed"],
            "F3_windows": checks["F3_windows"]["passed"],
            "F4_prospective_build": checks["F4_prospective_build"],
        },
        "f1_waiver": waiver,
    }
    manifest["manifest_sha256"] = hashlib.sha256(
        json.dumps(manifest, sort_keys=True).encode()
    ).hexdigest()
    card = {
        "registration": REGISTRATION,
        "selection": state["selection"],
        "ridge_alpha": state["ridge"]["alpha"],
        "lightgbm": state["lightgbm"],
        "test": {k: report[k] for k in ("selected", "read_at", "seasons", "pooled", "gates")},
        "aging": age_tables(state, booster, sources),
        "coverage": checks["coverage"],
    }
    MANIFEST_PATH.parent.mkdir(parents=True, exist_ok=True)
    MANIFEST_PATH.write_text(json.dumps(manifest, indent=1, sort_keys=True) + "\n")
    CARD_PATH.write_text(json.dumps(card, indent=1, sort_keys=True) + "\n")
    return manifest


def register_artifacts() -> list[dict[str, str]]:
    from sqlalchemy import select

    from courtlens.database import SessionLocal
    from courtlens.workbench_models import WorkbenchArtifact

    manifest = json.loads(MANIFEST_PATH.read_text())
    out = []
    with SessionLocal() as session:
        for role, digest, suffix, mime in (
            ("projections", manifest["projections_sha256"], "json", "application/json"),
            ("lightgbm", manifest["lightgbm_sha256"], "txt", "text/plain"),
        ):
            path = ARTIFACTS / f"{digest}.{suffix}"
            resource = f"{manifest['version']}:{role}"[:100]
            existing = session.scalar(
                select(WorkbenchArtifact).where(
                    WorkbenchArtifact.sha256 == digest, WorkbenchArtifact.resource == resource
                )
            )
            if existing is None:
                existing = WorkbenchArtifact(
                    sha256=digest,
                    resource=resource,
                    bytes=path.stat().st_size,
                    storage_path=str(path),
                    mime_type=mime,
                    source_attribution=(
                        f"CourtLens {manifest['registration']}; frozen {manifest['frozen_at']}"
                    ),
                )
                session.add(existing)
                session.flush()
            out.append({"role": role, "sha256": digest, "artifact_id": existing.id})
        session.commit()
    return out


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("stage", choices=("checks", "select", "test", "freeze"))
    parser.add_argument("--f1-waiver", help="The owner's recorded waiver of F1, over-coverage only")
    args = parser.parse_args()
    started = time.monotonic()
    with threadpool_limits(limits=THREADS):
        if args.stage == "checks":
            body = run_checks()
            print(json.dumps({k: v for k, v in body.items() if k != "coverage"}, indent=1))
        elif args.stage == "select":
            print(json.dumps(run_select(), indent=1))
        elif args.stage == "test":
            report = run_test()
            print(json.dumps({k: report[k] for k in ("selected", "gates")}, indent=1))
        else:
            manifest = freeze(waiver=args.f1_waiver)
            print(json.dumps(manifest, indent=1))
            print(json.dumps(register_artifacts()))
    print(json.dumps({"seconds": round(time.monotonic() - started, 1)}))


if __name__ == "__main__":
    main()
