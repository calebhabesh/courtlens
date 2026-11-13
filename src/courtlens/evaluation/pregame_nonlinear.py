"""Is the linear form what limits the own forecast? (courtlens-pregame-nonlinear-v1)

A diagnostic on the frozen served model's pregame layer. Two LightGBM candidates read the same 11
inputs on the same training seasons as the frozen least-squares regression: trees alone (T), and
the linear forecast plus a tree correction (R). Settings come from forward validation inside the
training seasons; the later seasons are scored once, against the frozen forecast as served.
Nothing here is served, and neither frozen model changes whatever the result.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import math
import platform
import time
from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

import lightgbm as lgb
import numpy as np

from courtlens.domain.research_registry import load_registration, registration_receipt
from courtlens.evaluation import win_probability_data as wpd
from courtlens.evaluation.win_probability_models import (
    MU_FULL,
    PREGAME_COLUMNS,
    _pregame_row,
)

REGISTRATION = "courtlens-pregame-nonlinear-v1"
REGISTERED = load_registration(REGISTRATION)
PARAMETERS = REGISTERED.parameters
SEED = int(PARAMETERS["seed"])
REPLICATES = int(PARAMETERS["bootstrap"]["replicates"])
LEVEL = float(PARAMETERS["bootstrap"]["level"])
TRAIN: tuple[str, ...] = tuple(PARAMETERS["train_seasons"])
VALIDATION: tuple[str, ...] = tuple(PARAMETERS["validation_seasons"])
EVALUATION: tuple[str, ...] = tuple(PARAMETERS["evaluation_seasons"])
HALF_LIFE = str(PARAMETERS["form_half_life_days"])
BOOSTER: dict[str, Any] = PARAMETERS["booster"]
MAX_ROUNDS = int(BOOSTER["max_rounds"])
V2 = Path("data/derived/win-probability-v1")
V2_MANIFEST = Path("evaluation/research/frozen/courtlens-win-probability-v2.json")
PUBLISHED = Path("evaluation/research/derived/courtlens-pregame-nonlinear-v1.json")
CANDIDATES = {
    "trees": "LightGBM on the 11 inputs",
    "linear_plus_trees": "the linear forecast plus a LightGBM correction",
}


@dataclass(frozen=True)
class Games:
    """Rated games: the 11 inputs, the final margin, the season and the frozen own forecast."""

    season: np.ndarray
    x: np.ndarray
    margin: np.ndarray
    own: np.ndarray

    @classmethod
    def load(cls, table: dict[str, Any], own: dict[str, Any], seasons: tuple[str, ...]) -> Games:
        rows = [
            (gid, g)
            for gid, g in sorted(table.items())
            if g["season"] in seasons
            and g["strength_home"] is not None
            and g["strength_away"] is not None
        ]
        return cls(
            season=np.array([g["season"] for _, g in rows]),
            x=np.array([_pregame_row(g, g["form"][HALF_LIFE]) for _, g in rows], dtype=float),
            margin=np.array([g["home_pts"] - g["away_pts"] for _, g in rows], dtype=float),
            own=np.array([own[gid][MU_FULL] for gid, _ in rows], dtype=float),
        )

    def only(self, mask: np.ndarray) -> Games:
        return Games(self.season[mask], self.x[mask], self.margin[mask], self.own[mask])


def least_squares(x: np.ndarray, margin: np.ndarray) -> np.ndarray:
    """The frozen regression's fit: no intercept, the home column carries it."""
    coefficients, *_ = np.linalg.lstsq(x, margin, rcond=None)
    return np.asarray(coefficients, dtype=float)


def settings() -> list[dict[str, int]]:
    """The registered grid, in tie-break order: fewer leaves, then larger min_data_in_leaf."""
    return [
        {"num_leaves": int(leaves), "min_data_in_leaf": int(leaf)}
        for leaves in sorted(BOOSTER["num_leaves_grid"])
        for leaf in sorted(BOOSTER["min_data_in_leaf_grid"], reverse=True)
    ]


def config(setting: dict[str, int]) -> dict[str, Any]:
    return {
        "objective": BOOSTER["objective"],
        "learning_rate": BOOSTER["learning_rate"],
        "lambda_l2": BOOSTER["lambda_l2"],
        "feature_fraction": BOOSTER["feature_fraction"],
        "bagging_fraction": BOOSTER["bagging_fraction"],
        "num_threads": BOOSTER["num_threads"],
        "deterministic": BOOSTER["deterministic"],
        "force_row_wise": True,
        "seed": SEED,
        "verbosity": -1,
        **setting,
    }


def dataset(x: np.ndarray, margin: np.ndarray, start: np.ndarray | None) -> lgb.Dataset:
    return lgb.Dataset(
        x, label=margin, init_score=start, feature_name=list(PREGAME_COLUMNS), free_raw_data=False
    )


def fit(
    x: np.ndarray,
    margin: np.ndarray,
    start: np.ndarray | None,
    setting: dict[str, int],
    rounds: int,
) -> lgb.Booster:
    """A booster on the inputs; with `start`, it learns only the correction to that forecast."""
    return lgb.train(config(setting), dataset(x, margin, start), num_boost_round=rounds)


def squared_error_by_round(
    earlier: Games,
    scored: Games,
    starts: tuple[np.ndarray, np.ndarray] | None,
    setting: dict[str, int],
) -> np.ndarray:
    """Fit on the earlier seasons; the scored season's summed squared error after each round."""
    fitted = dataset(earlier.x, earlier.margin, None if starts is None else starts[0])
    held = lgb.Dataset(
        scored.x,
        label=scored.margin,
        init_score=None if starts is None else starts[1],
        reference=fitted,
    )
    history: dict[str, dict[str, list[float]]] = {}
    lgb.train(
        {**config(setting), "metric": "l2"},
        fitted,
        num_boost_round=MAX_ROUNDS,
        valid_sets=[held],
        valid_names=["scored"],
        callbacks=[lgb.record_evaluation(history)],
    )
    return np.asarray(history["scored"]["l2"], dtype=float) * len(scored.margin)


def forward_validation(train: Games) -> dict[str, Any]:
    """Each setting and round count scored on 2018-19..2021-22, fitted on earlier seasons only."""
    grid = settings()
    total = {name: np.zeros((len(grid), MAX_ROUNDS)) for name in CANDIDATES}
    linear_total = 0.0
    games = 0
    for season in VALIDATION:
        earlier = train.only(train.season < season)
        scored = train.only(train.season == season)
        beta = least_squares(earlier.x, earlier.margin)
        start_fit, start_scored = earlier.x @ beta, scored.x @ beta
        linear_total += float(np.sum((scored.margin - start_scored) ** 2))
        games += len(scored.margin)
        for i, setting in enumerate(grid):
            total["trees"][i] += squared_error_by_round(earlier, scored, None, setting)
            total["linear_plus_trees"][i] += squared_error_by_round(
                earlier, scored, (start_fit, start_scored), setting
            )
    out: dict[str, Any] = {
        "games": games,
        "seasons": list(VALIDATION),
        "linear_rmse": math.sqrt(linear_total / games),
        "candidates": {},
    }
    for name in CANDIDATES:
        table = []
        for i, setting in enumerate(grid):
            best = int(np.argmin(total[name][i]))  # first minimum: fewer rounds wins a tie
            table.append(
                {**setting, "rounds": best + 1, "rmse": math.sqrt(total[name][i][best] / games)}
            )
        kept = min(range(len(grid)), key=lambda i: (table[i]["rmse"], i))
        out["candidates"][name] = {"settings": table, "kept": table[kept]}
    return out


def interval(values: np.ndarray) -> dict[str, float]:
    """The registered paired game bootstrap."""
    rng = np.random.default_rng(SEED)
    picks = rng.integers(0, len(values), size=(REPLICATES, len(values)))
    draws = values[picks].mean(axis=1)
    tail = (1 - LEVEL) / 2
    return {
        "mean": float(values.mean()),
        "low": float(np.quantile(draws, tail)),
        "high": float(np.quantile(draws, 1 - tail)),
        "games": len(values),
    }


def result_of(gain: dict[str, float]) -> str:
    if gain["low"] > 0:
        return "better"
    if gain["high"] < 0:
        return "worse"
    return "not distinguishable"


def scores(margin: np.ndarray, forecast: np.ndarray) -> dict[str, Any]:
    return {
        "games": len(margin),
        "rmse": float(math.sqrt(float(np.mean((margin - forecast) ** 2)))),
        "winner_accuracy": float(np.mean((forecast > 0) == (margin > 0))),
    }


def compare(games: Games, forecasts: dict[str, np.ndarray]) -> dict[str, Any]:
    """Each candidate against the frozen linear forecast on one set of games."""
    out: dict[str, Any] = {"linear": scores(games.margin, games.own)}
    linear_error = (games.margin - games.own) ** 2
    for name, forecast in forecasts.items():
        gain = interval(linear_error - (games.margin - forecast) ** 2)
        out[name] = {
            **scores(games.margin, forecast),
            "squared_error_gain": gain,
            "result": result_of(gain),
        }
    return out


def gain_shares(booster: lgb.Booster) -> dict[str, float]:
    gains = np.asarray(booster.feature_importance(importance_type="gain"), dtype=float)
    total = float(gains.sum())
    return {
        name: (float(g) / total if total else 0.0)
        for name, g in zip(PREGAME_COLUMNS, gains, strict=True)
    }


def run(output: Path = PUBLISHED) -> dict[str, Any]:
    started = time.monotonic()
    table = wpd.read_games(V2)
    name = sorted((V2 / "games").glob("*.json.gz"))[0].name.removesuffix(".json.gz")
    if name != PARAMETERS["games_table_sha256"]:
        raise ValueError("the games table is not the registered one")
    pregame_bytes = (V2 / "pregame.json").read_bytes()
    if hashlib.sha256(pregame_bytes).hexdigest() != PARAMETERS["pregame_sha256"]:
        raise ValueError("the frozen own forecasts are not the registered file")
    pregame = json.loads(pregame_bytes)
    manifest = json.loads(V2_MANIFEST.read_text())
    if manifest["manifest_sha256"] != PARAMETERS["reference_manifest_sha256"]:
        raise ValueError("the frozen manifest is not the registered one")
    if tuple(pregame["train_seasons"]) != TRAIN or str(pregame["form_half_life_days"]) != HALF_LIFE:
        raise ValueError("the frozen regression's seasons or half-life differ from the registered")

    train = Games.load(table["games"], pregame["games"], TRAIN)
    later = Games.load(table["games"], pregame["games"], EVALUATION)

    # The reference is the frozen forecast; a refit must reproduce its coefficients first.
    frozen = np.array([manifest["pregame"]["coefficients"][c] for c in PREGAME_COLUMNS])
    refit = least_squares(train.x, train.margin)
    worst = float(np.max(np.abs(refit - frozen)))
    served = float(np.max(np.abs(later.x @ frozen - later.own)))
    check = {
        "train_games": len(train.margin),
        "max_abs_coefficient_difference": worst,
        "max_abs_forecast_difference": served,
        "passed": bool(
            worst < float(PARAMETERS["coefficient_tolerance"])
            and served < float(PARAMETERS["coefficient_tolerance"])
        ),
    }
    if not check["passed"]:
        raise ValueError(f"the frozen regression is not reproduced: {check}")

    validation = forward_validation(train)
    forecasts: dict[str, np.ndarray] = {}
    detail: dict[str, Any] = {}
    for candidate in CANDIDATES:
        kept = validation["candidates"][candidate]["kept"]
        setting = {k: int(kept[k]) for k in ("num_leaves", "min_data_in_leaf")}
        start = train.own if candidate == "linear_plus_trees" else None
        booster = fit(train.x, train.margin, start, setting, int(kept["rounds"]))
        raw = np.asarray(booster.predict(later.x, raw_score=True), dtype=float)
        forecasts[candidate] = later.own + raw if start is not None else raw
        detail[candidate] = {"gain_share": gain_shares(booster)}
        if start is not None:
            detail[candidate]["correction_points"] = {
                "mean_abs": float(np.mean(np.abs(raw))),
                "max_abs": float(np.max(np.abs(raw))),
            }

    body = {
        "version": REGISTRATION,
        "registration": registration_receipt(REGISTRATION),
        "ran_at": datetime.now(UTC).isoformat(timespec="seconds"),
        "question": REGISTERED.question,
        "candidates": CANDIDATES,
        "reference_check": check,
        "validation": validation,
        "fitted": detail,
        "evaluation": {
            "seasons": list(EVALUATION),
            "pooled": compare(later, forecasts),
            "by_season": {
                season: compare(
                    later.only(later.season == season),
                    {k: v[later.season == season] for k, v in forecasts.items()},
                )
                for season in EVALUATION
            },
        },
        "libraries": {
            "lightgbm": lgb.__version__,
            "numpy": np.__version__,
            "python": platform.python_version(),
            "machine": platform.machine(),
        },
        "elapsed_seconds": round(time.monotonic() - started, 1),
    }
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(body, indent=1, sort_keys=True) + "\n")
    return body


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, default=PUBLISHED)
    body = run(parser.parse_args().output)
    print(json.dumps(body["evaluation"]["pooled"], indent=1))


if __name__ == "__main__":
    main()
