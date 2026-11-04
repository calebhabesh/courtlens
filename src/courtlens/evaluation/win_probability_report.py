"""R15a after the ladder: end-game specialist, comparators, calibration and the final test.

`test` alone reads the final-test seasons and refuses to run twice. `benchmarks` then joins its
saved predictions to ESPN's per-play probability and the closing spread, and `summary` computes
paired differences from them; neither can change a model, because all are frozen by `test`.
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
import pyarrow.parquet as pq  # type: ignore[import-untyped]
from scipy.special import expit, logit  # type: ignore[import-untyped]
from sklearn.linear_model import LogisticRegression  # type: ignore[import-untyped]

from courtlens.domain.research_registry import registration_receipt
from courtlens.domain.win_probability_state import period_length, period_start
from courtlens.evaluation.win_probability_data import OUTPUT, REGISTRATION, read_games
from courtlens.evaluation.win_probability_models import (
    BOOST,
    CLIP,
    GROUPS,
    MONOTONE,
    MU_FORM,
    PHASES,
    REMAINDER,
    SEED,
    SPECIALIST_SECONDS,
    SPLITS,
    Season,
    bootstrap_interval,
    calibration,
    game_means,
    improvement,
    ladder_path,
    load_seasons,
    params,
    predict_side,
    read_ladder,
    read_model,
    read_prediction,
    save_prediction,
    state_losses,
    symmetric,
    views,
    write_model_file,
)

MARKET = Path("data/raw/market-lines/closing_lines_odds_api.parquet")
MARKET_SHA256 = "b58911bf54af2cff9f33b214787cf90a8e8545ebe4b807e11569e178f542ede7"
ESPN = OUTPUT / "espn"
LOGISTIC_FEATURES = (
    "z_margin",
    "z_mu",
    "fraction",
    "z_possession",
    "z_pending",
    "timeouts",
    "fouls",
    "bonus",
    "overtime",
)


def write_ladder(output: Path, ladder: dict[str, Any]) -> None:
    ladder_path(output).write_text(json.dumps(ladder, indent=1, sort_keys=True))


# ---------------------------------------------------------------------------------------------
# End-game specialist.


def specialist_features(ladder: dict[str, Any]) -> tuple[str, tuple[str, ...]]:
    return (
        ladder["steps"][ladder["accepted"]]["mu"] if ladder["accepted"] != "S0" else MU_FORM,
        tuple(GROUPS["base"]) + tuple(GROUPS["S1"]),
    )


def specialist_mask(season: Season) -> np.ndarray:
    result: np.ndarray = (season.period >= 4) & (season.left <= SPECIALIST_SECONDS)
    return result


def specialist_side(
    model: Any, season: Season, sign: np.ndarray, mu: str, names: tuple[str, ...], slope: float
) -> np.ndarray:
    """P(win) for the specialist's states; NaN elsewhere."""
    mask = specialist_mask(season)
    result = np.full(len(mask), np.nan)
    if not mask.any():
        return result
    probabilities = model.predict(season.view(sign, mu, names)[mask])
    margin = (sign * season.margin)[mask]
    tie = expit(slope * (sign * season.game[mu])[mask])
    remainder = np.arange(-REMAINDER, REMAINDER + 1)
    final = margin[:, None] + remainder[None, :]
    result[mask] = (probabilities * (final > 0)).sum(axis=1) + (probabilities * (final == 0)).sum(
        axis=1
    ) * tie
    return result


def blend(main: np.ndarray, special: np.ndarray, season: Season) -> np.ndarray:
    mask = specialist_mask(season)
    weight = np.clip(1 - season.left / SPECIALIST_SECONDS, 0.0, 1.0)
    result = main.copy()
    result[mask] = (1 - weight[mask]) * main[mask] + weight[mask] * special[mask]
    return result


def fit_specialist(output: Path) -> dict[str, Any]:
    started = time.monotonic()
    ladder = read_ladder(output)
    if "end_game" in ladder:
        raise ValueError("specialist is already fitted")
    mu, names = specialist_features(ladder)
    slope = ladder["overtime_slope"][mu]
    seasons = load_seasons(SPLITS["train"] + SPLITS["select"] + SPLITS["calibrate"], output)
    train = [seasons[s] for s in SPLITS["train"]]
    signs = views(train)

    def rows(
        group: list[Season], sides: list[np.ndarray]
    ) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
        xs, ys, ws = [], [], []
        for s, sign in zip(group, sides, strict=True):
            mask = specialist_mask(s)
            xs.append(s.view(sign, mu, names)[mask])
            rest = (sign * (s.target - s.margin))[mask]
            ys.append(np.clip(rest, -REMAINDER, REMAINDER) + REMAINDER)
            ws.append(s.weight[mask])
        weight = np.concatenate(ws)
        return np.concatenate(xs), np.concatenate(ys), weight * len(weight) / weight.sum()

    select = seasons[SPLITS["select"][0]]
    rng = np.random.default_rng(SEED + 2)
    x, y, w = rows(train, signs)
    xv, yv, wv = rows([select], [rng.choice(np.array([1.0, -1.0]), size=len(select.time))])
    config = {
        **params(15, "multiclass"),
        "num_class": 2 * REMAINDER + 1,
        "metric": "multi_logloss",
    }
    data = lgb.Dataset(x, label=y, weight=w, feature_name=list(names))
    valid = lgb.Dataset(xv, label=yv, weight=wv, reference=data)
    model = lgb.train(
        config,
        data,
        num_boost_round=BOOST["max_rounds"],
        valid_sets=[valid],
        callbacks=[lgb.early_stopping(BOOST["early_stopping_rounds"], verbose=False)],
    )
    entry: dict[str, Any] = {
        "mu": mu,
        "features": list(names),
        "model": write_model_file(output, model),
        "rounds": model.best_iteration,
        "states": len(x),
    }
    accepted = str(ladder["accepted"])
    for name in SPLITS["select"] + SPLITS["calibrate"]:
        season = seasons[name]

        def side(s: Season, sign: np.ndarray) -> np.ndarray:
            return specialist_side(model, s, sign, mu, names, slope)

        home = side(season, np.ones(len(season.time)))
        away = side(season, -np.ones(len(season.time)))
        special = 0.5 * (home + 1 - away)
        save_prediction(
            output, "E", name, blend(read_prediction(output, accepted, name), special, season)
        )
    phases = select.phases()
    late = phases["last_two"] | phases["overtime"]
    gain = improvement(
        read_prediction(output, "E", select.season),
        read_prediction(output, accepted, select.season),
        select,
        0.90,
        late,
    )
    entry.update(
        {
            "compared_with": accepted,
            "improvement_90_late": gain,
            "accepted": gain["low"] > 0,
            "elapsed_seconds": round(time.monotonic() - started, 1),
        }
    )
    ladder = read_ladder(output)
    ladder["end_game"] = entry
    write_ladder(output, ladder)
    print(json.dumps({k: v for k, v in entry.items() if k != "features"}), flush=True)
    return entry


# ---------------------------------------------------------------------------------------------
# Comparators.


def logistic_matrix(season: Season, sign: np.ndarray) -> np.ndarray:
    c = season.columns
    root = np.sqrt(season.fraction)
    return np.column_stack(
        [
            sign * season.margin / root,
            sign * season.game[MU_FORM] * root,
            season.fraction,
            sign * c["possession"] / root,
            sign * (c["ft_pending_home"] - c["ft_pending_away"]) / root,
            sign * (c["timeouts_home"] - c["timeouts_away"]),
            sign * (c["fouls_home"] - c["fouls_away"]),
            sign * (c["bonus_home"] - c["bonus_away"]),
            sign * (season.period > 4),
        ]
    )


def logistic_probability(coefficients: list[float], season: Season, sign: np.ndarray) -> np.ndarray:
    result: np.ndarray = expit(logistic_matrix(season, sign) @ np.array(coefficients))
    return result


def fit_comparators(output: Path) -> dict[str, Any]:
    started = time.monotonic()
    ladder = read_ladder(output)
    if "comparators" in ladder:
        raise ValueError("comparators are already fitted")
    seasons = load_seasons(SPLITS["train"] + SPLITS["select"] + SPLITS["calibrate"], output)
    train = [seasons[s] for s in SPLITS["train"]]
    signs = views(train)
    x = np.concatenate([logistic_matrix(s, g) for s, g in zip(train, signs, strict=True)])
    y = np.concatenate(
        [np.where(g > 0, s.win, 1 - s.win) for s, g in zip(train, signs, strict=True)]
    )
    w = np.concatenate([s.weight for s in train])
    logistic = LogisticRegression(fit_intercept=False, C=1e6, max_iter=500)
    logistic.fit(x, y, sample_weight=w * len(w) / w.sum())
    coefficients = [float(v) for v in logistic.coef_[0]]
    del x

    entry = (
        ladder["steps"][ladder["accepted"]] if ladder["accepted"] != "S0" else ladder["steps"]["S1"]
    )
    mu, names = entry["mu"], tuple(entry["features"])
    x = np.concatenate([s.view(g, mu, names) for s, g in zip(train, signs, strict=True)])
    select = seasons[SPLITS["select"][0]]
    rng = np.random.default_rng(SEED + 3)
    select_sign = rng.choice(np.array([1.0, -1.0]), size=len(select.time))
    config = {
        **params(ladder.get("leaves", 31), "binary"),
        "monotone_constraints": [MONOTONE.get(n, 0) for n in names],
        "metric": "binary_logloss",
    }
    data = lgb.Dataset(x, label=y, weight=w * len(w) / w.sum(), feature_name=list(names))
    valid = lgb.Dataset(
        select.view(select_sign, mu, names),
        label=np.where(select_sign > 0, select.win, 1 - select.win),
        weight=select.weight * len(select.weight) / select.weight.sum(),
        reference=data,
    )
    classifier = lgb.train(
        config,
        data,
        num_boost_round=BOOST["max_rounds"],
        valid_sets=[valid],
        callbacks=[lgb.early_stopping(BOOST["early_stopping_rounds"], verbose=False)],
    )
    result = {
        "logistic": {"features": list(LOGISTIC_FEATURES), "coefficients": coefficients},
        "classifier": {
            "mu": mu,
            "features": list(names),
            "model": write_model_file(output, classifier),
            "rounds": classifier.best_iteration,
        },
        "elapsed_seconds": round(time.monotonic() - started, 1),
    }
    for name in SPLITS["select"] + SPLITS["calibrate"]:
        season = seasons[name]
        for label, side in comparator_sides(result, classifier).items():
            save_prediction(output, label, name, symmetric(side, season))
    summary = {}
    for label in ("logistic", "classifier"):
        p = read_prediction(output, label, select.season)
        loss, _ = game_means(
            state_losses(p, select.win)["log_loss"], select.index, len(select.games)
        )
        summary[label] = float(loss.mean())
    result["select_log_loss"] = summary
    ladder = read_ladder(output)
    ladder["comparators"] = result
    write_ladder(output, ladder)
    print(json.dumps(result, indent=1), flush=True)
    return result


def comparator_sides(entry: dict[str, Any], classifier: Any) -> dict[str, Any]:
    mu = entry["classifier"]["mu"]
    names = tuple(entry["classifier"]["features"])
    coefficients = entry["logistic"]["coefficients"]

    def logistic_side(s: Season, sign: np.ndarray) -> np.ndarray:
        return logistic_probability(coefficients, s, sign)

    def classifier_side(s: Season, sign: np.ndarray) -> np.ndarray:
        result: np.ndarray = classifier.predict(s.view(sign, mu, names))
        return result

    return {"logistic": logistic_side, "classifier": classifier_side}


# ---------------------------------------------------------------------------------------------
# Calibration (slope only, so the two teams' probabilities still sum to one).


def apply_calibration(p: np.ndarray, slope: float | None) -> np.ndarray:
    if slope is None:
        return p
    result: np.ndarray = expit(slope * logit(np.clip(p, CLIP, 1 - CLIP)))
    return result


def calibrate(output: Path) -> dict[str, Any]:
    ladder = read_ladder(output)
    if "calibration" in ladder:
        raise ValueError("calibration is already fitted")
    end_game = ladder.get("end_game", {})
    selected = "E" if end_game.get("accepted") else str(ladder["accepted"])
    name = SPLITS["calibrate"][0]
    season = load_seasons([name], output)[name]
    p = read_prediction(output, selected, name)
    features = logit(np.clip(p, CLIP, 1 - CLIP)).reshape(-1, 1)
    games = len(season.games)
    rng = np.random.default_rng(SEED + 4)
    fold_of_game = rng.integers(0, 5, size=games)
    fold = fold_of_game[season.index]
    held = np.zeros(len(p))

    def fit(rows: np.ndarray) -> float:
        model = LogisticRegression(fit_intercept=False, C=1e6, max_iter=200)
        model.fit(features[rows], season.win[rows], sample_weight=season.weight[rows] * games)
        return float(model.coef_[0, 0])

    for k in range(5):
        slope = fit(np.flatnonzero(fold != k))
        held[fold == k] = apply_calibration(p[fold == k], slope)
    before, _ = game_means(state_losses(p, season.win)["log_loss"], season.index, games)
    after, _ = game_means(state_losses(held, season.win)["log_loss"], season.index, games)
    use = bool(after.mean() < before.mean())
    entry = {
        "selected": selected,
        "form": "slope on logit p, no intercept, so the two teams' probabilities sum to one",
        "slope": fit(np.arange(len(p))),
        "cv_log_loss_before": float(before.mean()),
        "cv_log_loss_after": float(after.mean()),
        "applied": use,
        "ece_before": calibration(p, season.win, season.weight)["ece"],
    }
    ladder["calibration"] = entry
    write_ladder(output, ladder)
    print(json.dumps(entry, indent=1), flush=True)
    return entry


# ---------------------------------------------------------------------------------------------
# The final test.


def all_models(ladder: dict[str, Any], output: Path) -> dict[str, Any]:
    """Every registered model as a function of a season, using only frozen artifacts."""
    models: dict[str, Any] = {}

    def step_predictor(name: str) -> Any:
        entry = ladder["steps"][name]
        mu = entry["mu"]
        features = tuple(entry["features"])
        base = ladder["baseline"][mu]
        slope = ladder["overtime_slope"][mu]
        model = None
        if name != "S0":
            model = {
                "mean": read_model(output, entry["mean_model"]),
                "variance": read_model(output, entry["variance_model"]),
            }

        def predict(season: Season) -> np.ndarray:
            def side(s: Season, sign: np.ndarray) -> np.ndarray:
                return predict_side(model, s, sign, mu, features, base, slope)

            return symmetric(side, season)

        return predict

    for name in ladder["steps"]:
        models[name] = step_predictor(name)
    accepted = str(ladder["accepted"])
    end_game = ladder.get("end_game")
    if end_game:
        special_model = read_model(output, end_game["model"])
        mu = end_game["mu"]
        names = tuple(end_game["features"])
        slope = ladder["overtime_slope"][mu]

        def predict_e(season: Season) -> np.ndarray:
            home = specialist_side(
                special_model, season, np.ones(len(season.time)), mu, names, slope
            )
            away = specialist_side(
                special_model, season, -np.ones(len(season.time)), mu, names, slope
            )
            return blend(models[accepted](season), 0.5 * (home + 1 - away), season)

        models["E"] = predict_e
    comparators = ladder.get("comparators")
    if comparators:
        classifier = read_model(output, comparators["classifier"]["model"])
        for label, side in comparator_sides(comparators, classifier).items():

            def predict_c(season: Season, chosen: Any = side) -> np.ndarray:
                return symmetric(chosen, season)

            models[label] = predict_c
    return models


def metric_block(
    p: np.ndarray, reference: np.ndarray | None, seasons: list[Season], offsets: list[int]
) -> dict[str, Any]:
    """Overall and per-phase losses for pooled seasons (p and reference are concatenated)."""
    index = np.concatenate([s.index + o for s, o in zip(seasons, offsets, strict=True)])
    win = np.concatenate([s.win for s in seasons])
    weight = np.concatenate([s.weight for s in seasons])
    games = sum(len(s.games) for s in seasons)
    phase_masks: dict[str, np.ndarray] = {"overall": np.ones(len(p), dtype=bool)}
    for phase in PHASES:
        phase_masks[phase] = np.concatenate([s.phases()[phase] for s in seasons])
    losses = state_losses(p, win)
    block: dict[str, Any] = {}
    for phase, mask in phase_masks.items():
        row: dict[str, Any] = {}
        for metric, values in losses.items():
            means, reached = game_means(values, index, games, mask)
            row[metric] = bootstrap_interval(means, reached=reached)
        phase_weight = (
            weight[mask]
            / np.bincount(index[mask], minlength=games)[index[mask]]
            * np.bincount(index, minlength=games)[index[mask]]
        )
        row["calibration"] = calibration(p[mask], win[mask], phase_weight)
        if reference is not None:
            for metric, values in state_losses(reference, win).items():
                old, _ = game_means(values, index, games, mask)
                new, reached = game_means(losses[metric], index, games, mask)
                row[f"{metric}_improvement"] = bootstrap_interval(old - new, reached=reached)
        block[phase] = row
    return block


def monotonicity_audit(model: Any, season: Season, sample: int = 20000) -> dict[str, Any]:
    """Share of sampled states where one more point of lead lowers the home win probability."""
    rng = np.random.default_rng(SEED + 5)
    chosen = rng.choice(len(season.time), size=min(sample, len(season.time)), replace=False)
    base = model(season)[chosen]
    original = season.margin
    season.margin = original + 1
    raised = model(season)[chosen]
    season.margin = original
    drops = raised < base - 1e-9
    return {
        "states": len(chosen),
        "share_lowered": float(drops.mean()),
        "largest_drop": float(np.max(base - raised)) if drops.any() else 0.0,
    }


def run_test(output: Path) -> dict[str, Any]:
    started = time.monotonic()
    path = output / "test-report.json"
    if path.exists():
        raise ValueError("the final test has already been read; a re-run needs a new version")
    ladder = read_ladder(output)
    for needed in ("calibration", "comparators", "end_game"):
        if needed not in ladder:
            raise ValueError(f"{needed} is not frozen yet")
    calibration_entry = ladder["calibration"]
    selected = calibration_entry["selected"]
    slope = calibration_entry["slope"] if calibration_entry["applied"] else None
    frozen = hashlib.sha256(json.dumps(ladder, sort_keys=True).encode()).hexdigest()
    models = all_models(ladder, output)
    seasons = load_seasons(SPLITS["test"], output)
    ordered = [seasons[s] for s in SPLITS["test"]]
    predictions: dict[str, dict[str, np.ndarray]] = {}
    for name, model in models.items():
        predictions[name] = {s.season: model(s) for s in ordered}
        print(
            json.dumps({"predicted": name, "elapsed": round(time.monotonic() - started)}),
            flush=True,
        )
    predictions["selected"] = {
        s.season: apply_calibration(predictions[selected][s.season], slope) for s in ordered
    }
    for name, by_season in predictions.items():
        for season, p in by_season.items():
            save_prediction(output, name, season, p)

    def pooled(name: str, group: list[Season]) -> np.ndarray:
        return np.concatenate([predictions[name][s.season] for s in group])

    groups = {"pooled": ordered, **{s.season: [s] for s in ordered}}
    results: dict[str, Any] = {}
    for label, group in groups.items():
        offsets = list(np.cumsum([0] + [len(s.games) for s in group[:-1]]))
        results[label] = {
            name: metric_block(
                pooled(name, group),
                None if name == "S0" else pooled("S0", group),
                group,
                [int(o) for o in offsets],
            )
            for name in predictions
        }
    selected_overall = results["pooled"]["selected"]["overall"]
    a1 = selected_overall["log_loss_improvement"]
    a2 = selected_overall["calibration"]["ece"]
    table = read_games(output)["games"]
    body = {
        "version": REGISTRATION,
        "registration": registration_receipt(REGISTRATION),
        "ladder_sha256": frozen,
        "selected": selected,
        "calibration_slope": slope,
        "games": {s.season: len(s.games) for s in ordered},
        "states": {s.season: len(s.time) for s in ordered},
        "gates": {
            "A1": {"improvement": a1, "passed": a1["low"] > 0},
            "A2": {"ece": a2, "limit": 0.02, "passed": a2 <= 0.02},
        },
        "monotonicity": monotonicity_audit(
            lambda s: apply_calibration(models[selected](s), slope), ordered[0]
        ),
        "pregame": pregame_error(ordered, table, output),
        "results": results,
        "elapsed_seconds": round(time.monotonic() - started, 1),
    }
    path.write_text(json.dumps(body, sort_keys=True))
    print(
        json.dumps(
            {
                k: body[k]
                for k in (
                    "selected",
                    "calibration_slope",
                    "gates",
                    "monotonicity",
                    "pregame",
                    "elapsed_seconds",
                )
            },
            indent=1,
        ),
        flush=True,
    )
    return body


def pregame_error(seasons: list[Season], table: dict[str, Any], output: Path) -> dict[str, Any]:
    pregame = json.loads((output / "pregame.json").read_text())["games"]
    gids = [g for s in seasons for g in s.games]
    margin = np.array([table[g]["home_pts"] - table[g]["away_pts"] for g in gids], dtype=float)
    out = {}
    for key in ("mu_form", "mu_full"):
        mu = np.array([pregame[g][key] for g in gids])
        out[key] = {
            "squared_error": bootstrap_interval((margin - mu) ** 2),
            "winner_accuracy": bootstrap_interval(((mu > 0) == (margin > 0)).astype(float)),
        }
    return out


# ---------------------------------------------------------------------------------------------
# Benchmarks, joined to the saved predictions after the test.


def espn_states(
    season: Season, gid: str, extract: dict[str, Any], rows: np.ndarray
) -> tuple[np.ndarray, np.ndarray]:
    """ESPN's latest probability at or before each state, kept when the score matches."""
    plays = [p for p in extract["plays"] if p["home_win"] is not None]
    if not plays:
        return np.full(len(rows), np.nan), np.zeros(len(rows), dtype=bool)
    elapsed = np.array(
        [period_start(p["period"]) + period_length(p["period"]) - p["seconds_left"] for p in plays]
    )
    order = np.argsort(elapsed, kind="stable")
    elapsed = elapsed[order]
    home = np.array([plays[i]["home"] for i in order])
    away = np.array([plays[i]["away"] for i in order])
    value = np.array([plays[i]["home_win"] for i in order])
    at = np.searchsorted(elapsed, season.time[rows], side="right") - 1
    valid = at >= 0
    chosen = np.maximum(at, 0)
    same = (
        valid
        & (home[chosen] == season.columns["home_score"][rows])
        & (away[chosen] == season.columns["away_score"][rows])
    )
    return np.where(same, value[chosen], np.nan), same


def run_benchmarks(output: Path) -> dict[str, Any]:
    report = json.loads((output / "test-report.json").read_text())
    selected_names = ["selected", "S0"]
    seasons = load_seasons(SPLITS["test"], output)
    table = read_games(output)["games"]
    results: dict[str, Any] = {"espn": {}, "market": {}}
    pool: dict[str, list[np.ndarray]] = {
        "model": [],
        "espn": [],
        "win": [],
        "index": [],
        "time": [],
        "s0": [],
    }
    offset = 0
    event_to_game = {}
    first_play = {}
    tipoff: list[tuple[float, float, float]] = []
    for name in SPLITS["test"]:
        season = seasons[name]
        p = read_prediction(output, selected_names[0], name)
        s0 = read_prediction(output, selected_names[1], name)
        matched = total = missing = 0
        for number, gid in enumerate(season.games):
            path = ESPN / f"{gid}.json"
            rows = np.flatnonzero(season.index == number)
            total += len(rows)
            if not path.exists():
                missing += 1
                continue
            extract = json.loads(path.read_text())
            if not extract["final_matches_nba"]:
                missing += 1
                continue
            event_to_game[int(extract["espn_event_id"])] = gid
            values, same = espn_states(season, gid, extract, rows)
            first = next(
                (q["home_win"] for q in extract["plays"] if q["home_win"] is not None), None
            )
            first_play[gid] = first
            if first is not None:
                tipoff.append((float(p[rows[0]]), float(first), float(season.win[rows[0]])))
            kept = rows[same]
            matched += len(kept)
            pool["model"].append(p[kept])
            pool["s0"].append(s0[kept])
            pool["espn"].append(values[same])
            pool["win"].append(season.win[kept])
            pool["index"].append(np.full(len(kept), offset + number))
            pool["time"].append(season.time[kept])
        offset += len(season.games)
        results["espn"][name] = {
            "states": total,
            "matched_states": matched,
            "matched_share": matched / total if total else 0.0,
            "games_without_espn": missing,
        }
    model = np.concatenate(pool["model"])
    espn = np.concatenate(pool["espn"])
    win = np.concatenate(pool["win"])
    index = np.concatenate(pool["index"])
    times = np.concatenate(pool["time"])
    _, index = np.unique(index, return_inverse=True)
    games = int(index.max()) + 1
    masks = {
        "overall": np.ones(len(model), dtype=bool),
        "first_half": times < 1440,
        "third_quarter": (times >= 1440) & (times < 2160),
        "fourth_early": (times >= 2160) & (times < 2760),
        "last_two": (times >= 2760) & (times < 2880),
        "overtime": times >= 2880,
    }
    comparison = {}
    for phase, mask in masks.items():
        row: dict[str, Any] = {}
        for metric in ("log_loss", "brier"):
            ours, reached = game_means(state_losses(model, win)[metric], index, games, mask)
            theirs, _ = game_means(state_losses(espn, win)[metric], index, games, mask)
            row[metric] = {
                "courtlens": bootstrap_interval(ours, reached=reached),
                "espn": bootstrap_interval(theirs, reached=reached),
                "espn_minus_courtlens": bootstrap_interval(theirs - ours, reached=reached),
            }
        row["ece"] = {
            "courtlens": calibration(model[mask], win[mask], np.ones(int(mask.sum())))["ece"],
            "espn": calibration(espn[mask], win[mask], np.ones(int(mask.sum())))["ece"],
        }
        comparison[phase] = row
    results["espn"]["comparison"] = comparison
    start = np.array(tipoff)
    start_ours = state_losses(start[:, 0], start[:, 2])
    start_theirs = state_losses(start[:, 1], start[:, 2])
    results["espn"]["tipoff"] = {
        metric: {
            "courtlens": bootstrap_interval(start_ours[metric]),
            "espn": bootstrap_interval(start_theirs[metric]),
            "espn_minus_courtlens": bootstrap_interval(start_theirs[metric] - start_ours[metric]),
        }
        for metric in ("log_loss", "brier")
    }
    results["espn"]["games_compared"] = games

    digest = hashlib.sha256(MARKET.read_bytes()).hexdigest()
    if digest != MARKET_SHA256:
        raise ValueError("closing lines differ from the pinned file")
    lines = pq.read_table(MARKET, columns=["game_id", "home_point"]).to_pylist()
    pregame = json.loads((output / "pregame.json").read_text())["games"]
    rows_market = []
    for line in lines:
        matched_game = event_to_game.get(int(line["game_id"]))
        if matched_game is None or line["home_point"] is None:
            continue
        g = table[matched_game]
        rows_market.append(
            (
                g["home_pts"] - g["away_pts"],
                pregame[matched_game]["mu_full"],
                -float(line["home_point"]),
                first_play.get(matched_game),
            )
        )
    array = np.array([r[:3] for r in rows_market], dtype=float)
    margin, mu, market = array[:, 0], array[:, 1], array[:, 2]
    results["market"] = {
        "games": len(rows_market),
        "of_test_games": sum(len(s.games) for s in seasons.values()),
        "source": "hoopR-nba-data closing_lines_odds_api.parquet (CC BY 4.0), consensus close",
        "courtlens_rmse_squared": bootstrap_interval((margin - mu) ** 2),
        "market_rmse_squared": bootstrap_interval((margin - market) ** 2),
        "courtlens_rmse": math.sqrt(float(np.mean((margin - mu) ** 2))),
        "market_rmse": math.sqrt(float(np.mean((margin - market) ** 2))),
        "squared_error_gap": bootstrap_interval((margin - mu) ** 2 - (margin - market) ** 2),
        "courtlens_winner_accuracy": bootstrap_interval(((mu > 0) == (margin > 0)).astype(float)),
        "market_winner_accuracy": bootstrap_interval(((market > 0) == (margin > 0)).astype(float)),
    }
    body = {
        "version": REGISTRATION,
        "test_report_sha256": hashlib.sha256(
            (output / "test-report.json").read_bytes()
        ).hexdigest(),
        "selected": report["selected"],
        **results,
    }
    (output / "benchmarks.json").write_text(json.dumps(body, sort_keys=True))
    print(
        json.dumps({"espn": results["espn"], "market": results["market"]}, indent=1)[:6000],
        flush=True,
    )
    return body


PAIRS = (
    ("S0g", "S0", "flexibility alone (no new information)"),
    ("S1", "S0g", "possession, free throws, timeouts, fouls"),
    ("S2", "S1", "player-based mu0 and context"),
    ("S3", "S2", "volatility (rejected on selection)"),
    ("S4", "S2", "rotation, exits, foul trouble, lineup (rejected on selection)"),
    ("S5", "S2", "runs and shooting luck (rejected on selection)"),
    ("E", "S2", "end-game specialist"),
    ("E", "logistic", "selected against plain logistic regression"),
    ("E", "classifier", "selected against direct win/loss LightGBM"),
)


def summarize(output: Path) -> dict[str, Any]:
    """Paired test-season differences from saved predictions; no model is read or changed."""
    report_bytes = (output / "test-report.json").read_bytes()
    seasons = [load_seasons([s], output)[s] for s in SPLITS["test"]]
    offsets = list(np.cumsum([0] + [len(s.games) for s in seasons[:-1]]))
    index = np.concatenate([s.index + int(o) for s, o in zip(seasons, offsets, strict=True)])
    win = np.concatenate([s.win for s in seasons])
    games = sum(len(s.games) for s in seasons)
    masks: dict[str, np.ndarray] = {"overall": np.ones(len(win), dtype=bool)}
    for phase in PHASES:
        masks[phase] = np.concatenate([s.phases()[phase] for s in seasons])

    def pooled(name: str) -> np.ndarray:
        return np.concatenate([read_prediction(output, name, s.season) for s in seasons])

    pairs = []
    for name, reference, label in PAIRS:
        new, old = state_losses(pooled(name), win), state_losses(pooled(reference), win)
        row: dict[str, Any] = {"model": name, "reference": reference, "label": label}
        for phase, mask in masks.items():
            row[phase] = {}
            for metric in ("log_loss", "brier"):
                after, reached = game_means(new[metric], index, games, mask)
                before, _ = game_means(old[metric], index, games, mask)
                row[phase][metric] = bootstrap_interval(before - after, reached=reached)
        pairs.append(row)
    table = read_games(output)["games"]
    pregame = pregame_error(seasons, table, output)
    for entry in pregame.values():
        entry["rmse"] = math.sqrt(entry["squared_error"]["mean"])
    body = {
        "version": REGISTRATION,
        "test_report_sha256": hashlib.sha256(report_bytes).hexdigest(),
        "pairs": pairs,
        "pregame": pregame,
    }
    (output / "pairs.json").write_text(json.dumps(body, sort_keys=True))
    for row in pairs:
        overall = row["overall"]["log_loss"]
        print(
            f"{row['model']:>4} vs {row['reference']:<10} {overall['mean']:+.4f} "
            f"[{overall['low']:+.4f}, {overall['high']:+.4f}]  {row['label']}"
        )
    print(json.dumps({k: v["rmse"] for k, v in pregame.items()}))
    return body


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "command",
        choices=("specialist", "comparators", "calibrate", "test", "summary", "benchmarks"),
    )
    parser.add_argument("--output", type=Path, default=OUTPUT)
    args = parser.parse_args()
    {
        "specialist": fit_specialist,
        "comparators": fit_comparators,
        "calibrate": calibrate,
        "test": run_test,
        "summary": summarize,
        "benchmarks": run_benchmarks,
    }[args.command](args.output)


if __name__ == "__main__":
    main()
