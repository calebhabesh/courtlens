"""Run `courtlens-expected-shot-v2` (Research R05) in two registered passes.

`fit` (the choice pass) fits the baseline, the reference and the three candidates on the training
seasons, scores the selection season only, applies the selection gate, saves every model with its
SHA-256 and stops. `test` loads those models (hash-checked), calibrates on 2023-24, scores the test
seasons, computes player shot-making and writes the frozen results. Nothing is tuned; every
constant is checked against the registration. Run each pass under a kernel-capped unit:

    systemd-run --user --wait --collect -p MemoryMax=4G -p MemorySwapMax=0 \
      -E OMP_NUM_THREADS=1 -E OPENBLAS_NUM_THREADS=1 -E MKL_NUM_THREADS=1 \
      --working-directory=<directory with data/ and evaluation/> \
      .venv/bin/python -m courtlens.evaluation.expected_shot_v2_runner fit --run <dir>
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import resource
import time
import warnings
from collections import defaultdict
from collections.abc import Mapping
from itertools import pairwise
from pathlib import Path
from typing import Any

import numpy as np
from scipy import sparse  # type: ignore[import-untyped]
from scipy.optimize import minimize  # type: ignore[import-untyped]

from courtlens.domain import expected_shot_v2 as es
from courtlens.domain.research_registry import load_registration, registration_receipt
from courtlens.evaluation import expected_shot_v2_data as data

REGISTRATION = "courtlens-expected-shot-v2"
FROZEN = Path("evaluation/research/frozen/courtlens-expected-shot-v2.json")
TABLES = Path("data/derived/expected-shot-v2/tables")

# Module constants; `parameters()` refuses to run unless each equals the registration.
TRAIN = tuple(f"{y}-{(y + 1) % 100:02d}" for y in range(2014, 2022))
SELECT, CALIBRATE = "2022-23", "2023-24"
TEST = ("2024-25", "2025-26")
PLAYER_SEASONS = ("2022-23", "2023-24", "2024-25", "2025-26")
CATEGORY_MIN = 500
CELL_MIN = 100
DISTANCE_CAP = 40
DISTANCE_KNOTS = (0, 1, 3, 5, 8, 12, 16, 20, 22, 24, 26, 30, 40, 50)
POSSESSION_KNOTS = (0, 2, 4, 6, 8, 10, 14, 18, 22, 26, 35, 60)
REMAINING_BANDS = (2, 5, 24)
SINCE_OREB_BANDS = (2, 6)
MARGIN_CLIP = 30
LOGISTIC: dict[str, Any] = {"C": 1.0, "solver": "lbfgs", "max_iter": 3000, "tol": 1e-06}
LIGHTGBM: dict[str, Any] = {
    "learning_rate": 0.05,
    "n_estimators": 600,
    "min_child_samples": 200,
    "reg_lambda": 1.0,
    "feature_fraction": 1.0,
    "max_bin": 255,
    "num_threads": 1,
    "num_leaves_grid": [31, 127],
}
CANDIDATES = ("logistic_spline", "lightgbm_31", "lightgbm_127")
SELECTION_GATE = 0.01
TEST_GATE = 0.01
TEST_MAX_ECE = 0.02
ECE_BINS, CURVE_BINS = 10, 20
SLICE_MIN = 200
POSSESSION_BANDS = (6, 14)
PLAYER_MIN = 300
REPLICATES = 2000
LEVEL = 0.95
CLIP = 1e-06
ZONES = (
    "Restricted Area",
    "In The Paint (Non-RA)",
    "Mid-Range",
    "Left Corner 3",
    "Right Corner 3",
    "Above the Break 3",
    "Backcourt",
)


def parameters() -> dict[str, Any]:
    registration = load_registration(REGISTRATION)
    params = registration.parameters
    checks: dict[str, Any] = {
        "seasons": list(data.SEASONS),
        "train_seasons": list(TRAIN),
        "select_season": SELECT,
        "calibrate_season": CALIBRATE,
        "test_seasons": list(TEST),
        "player_seasons": list(PLAYER_SEASONS),
        "category_min_attempts": CATEGORY_MIN,
        "baseline_cell_min_attempts": CELL_MIN,
        "baseline_distance_cap": DISTANCE_CAP,
        "distance_knots": list(DISTANCE_KNOTS),
        "possession_knots": list(POSSESSION_KNOTS),
        "remaining_bands": list(REMAINING_BANDS),
        "since_oreb_bands": list(SINCE_OREB_BANDS),
        "margin_clip": MARGIN_CLIP,
        "logistic": LOGISTIC,
        "lightgbm": LIGHTGBM,
        "candidates": list(CANDIDATES),
        "selection_gate_relative_brier": SELECTION_GATE,
        "test_gate_relative_brier": TEST_GATE,
        "test_gate_max_ece": TEST_MAX_ECE,
        "ece_bins": ECE_BINS,
        "curve_bins": CURVE_BINS,
        "slice_min_attempts": SLICE_MIN,
        "possession_bands": list(POSSESSION_BANDS),
        "player_min_attempts": PLAYER_MIN,
        "bootstrap_replicates": REPLICATES,
        "interval": LEVEL,
        "probability_clip": CLIP,
    }
    for key, value in checks.items():
        if params[key] != value:
            raise SystemExit(f"module constant {key} differs from the registration")
    if es.EPS != CLIP:
        raise SystemExit("probability clip differs from the registration")
    if registration.seed != 5005:
        raise SystemExit("seed differs from the registration")
    return params


def _check_threads() -> None:
    for name in ("OMP_NUM_THREADS", "OPENBLAS_NUM_THREADS", "MKL_NUM_THREADS"):
        if os.environ.get(name) != "1":
            raise SystemExit(f"{name}=1 is required (registered budget: one thread)")


# ---- Inputs -------------------------------------------------------------------------------------


def load_season(season: str, expected_sha: str) -> dict[str, np.ndarray]:
    matches = sorted(TABLES.glob(f"{season}.{expected_sha[:16]}.npz"))
    if len(matches) != 1:
        raise SystemExit(f"no pinned table for {season}")
    with np.load(matches[0]) as stored:
        arrays = {name: stored[name] for name in stored.files}
    if data.content_sha(arrays) != expected_sha:
        raise SystemExit(f"table content for {season} differs from the registration")
    return arrays


def load(seasons: tuple[str, ...], pins: Mapping[str, str]) -> dict[str, np.ndarray]:
    parts = [load_season(s, pins[s]) for s in seasons]
    joined = {k: np.concatenate([p[k] for p in parts]) for k in parts[0]}
    joined["season"] = np.concatenate(
        [np.full(len(p["made"]), s, dtype="<U7") for s, p in zip(seasons, parts, strict=True)]
    )
    return joined


# ---- Encodings ----------------------------------------------------------------------------------


def vocabulary(values: np.ndarray, minimum: int) -> list[str]:
    names, counts = np.unique(values, return_counts=True)
    return sorted(str(n) for n, c in zip(names, counts, strict=True) if c >= minimum)


def codes(values: np.ndarray, vocab: list[str]) -> np.ndarray:
    index = {name: i for i, name in enumerate(vocab)}
    other = len(vocab)
    return np.array([index.get(str(v), other) for v in values], dtype=np.int64)


def zone_cell(d: Mapping[str, np.ndarray]) -> np.ndarray:
    result: np.ndarray = np.char.add(np.char.add(d["zone_basic"], "|"), d["zone_area"])
    return result


def band(values: np.ndarray, edges: tuple[int, ...]) -> np.ndarray:
    result: np.ndarray = np.searchsorted(np.array(edges, dtype=float), values, side="left")
    return result


def one_hot(index: np.ndarray, width: int, mask: np.ndarray | None = None) -> sparse.csr_matrix:
    rows = np.arange(len(index))
    keep = np.ones(len(index), dtype=bool) if mask is None else mask
    return sparse.csr_matrix(
        (np.ones(int(keep.sum())), (rows[keep], index[keep])), shape=(len(index), width)
    )


def spline_basis(values: np.ndarray, knots: tuple[int, ...]) -> np.ndarray:
    from sklearn.preprocessing import SplineTransformer  # type: ignore[import-untyped]

    transformer = SplineTransformer(
        knots=np.array(knots, dtype=float)[:, None],
        degree=3,
        extrapolation="constant",
        include_bias=False,
    )
    clipped = np.clip(values, knots[0], knots[-1])[:, None]
    basis: np.ndarray = transformer.fit_transform(clipped)
    return basis


def logistic_design(
    d: Mapping[str, np.ndarray], vocab: Mapping[str, list[str]]
) -> sparse.csr_matrix:
    n = len(d["made"])
    possession = d["possession_seconds"]
    known = np.isfinite(possession)
    poss = spline_basis(np.where(known, possession, 0.0), POSSESSION_KNOTS)
    poss[~known] = 0.0
    margin = np.where(
        np.isfinite(d["margin"]), np.clip(d["margin"], -MARGIN_CLIP, MARGIN_CLIP), 0.0
    )
    oreb = d["after_oreb"] == 1
    period = np.minimum(d["period"].astype(np.int64), 5) - 1
    blocks = [
        sparse.csr_matrix(spline_basis(d["distance"], DISTANCE_KNOTS)),
        sparse.csr_matrix((d["value"] == 3).astype(float)[:, None]),
        one_hot(codes(d["action_type"], vocab["action"]), len(vocab["action"]) + 1),
        one_hot(codes(zone_cell(d), vocab["zone"]), len(vocab["zone"]) + 1),
        one_hot(period, 5),
        one_hot(band(d["remaining"], REMAINING_BANDS), len(REMAINING_BANDS) + 1),
        sparse.csr_matrix(np.column_stack([margin / 10.0, np.abs(margin) / 10.0])),
        sparse.csr_matrix(poss),
        sparse.csr_matrix((~known).astype(float)[:, None]),
        sparse.csr_matrix(oreb.astype(float)[:, None]),
        one_hot(
            band(np.nan_to_num(d["since_oreb"], nan=0.0), SINCE_OREB_BANDS),
            len(SINCE_OREB_BANDS) + 1,
            mask=oreb,
        ),
    ]
    design: sparse.csr_matrix = sparse.hstack(blocks, format="csr")
    if design.shape[0] != n:
        raise SystemExit("design rows differ from shots")
    return design


def tree_matrix(d: Mapping[str, np.ndarray], vocab: Mapping[str, list[str]]) -> np.ndarray:
    after = d["after_oreb"].astype(float)
    after[d["after_oreb"] < 0] = np.nan
    matrix: np.ndarray = np.column_stack(
        [
            d["loc_x"],
            d["loc_y"],
            d["distance"],
            d["value"].astype(float),
            codes(d["action_type"], vocab["action"]).astype(float),
            codes(zone_cell(d), vocab["zone"]).astype(float),
            d["period"].astype(float),
            d["remaining"],
            d["margin"],
            d["possession_seconds"],
            after,
            d["since_oreb"],
        ]
    )
    return matrix


TREE_FEATURES = (
    "loc_x",
    "loc_y",
    "distance",
    "value",
    "action_type",
    "zone_cell",
    "period",
    "remaining",
    "margin",
    "possession_seconds",
    "after_oreb",
    "since_oreb",
)


# ---- Rate tables --------------------------------------------------------------------------------


def rate_table(
    keys: np.ndarray, fallback: np.ndarray, made: np.ndarray
) -> dict[str, dict[str, float]]:
    """Beta(1,1)-smoothed make rates by key; keys under CELL_MIN attempts use the fallback key."""
    cells: dict[str, list[int]] = defaultdict(lambda: [0, 0])
    zones: dict[str, list[int]] = defaultdict(lambda: [0, 0])
    for key, zone, y in zip(keys.tolist(), fallback.tolist(), made.tolist(), strict=True):
        cells[key][0] += y
        cells[key][1] += 1
        zones[zone][0] += y
        zones[zone][1] += 1
    return {
        "cells": {k: (m + 1) / (n + 2) for k, (m, n) in sorted(cells.items()) if n >= CELL_MIN},
        "zones": {k: (m + 1) / (n + 2) for k, (m, n) in sorted(zones.items())},
    }


def baseline_keys(d: Mapping[str, np.ndarray]) -> np.ndarray:
    bands = np.minimum(d["distance"].astype(np.int64), DISTANCE_CAP + 1).astype(str)
    result: np.ndarray = np.char.add(np.char.add(d["zone_basic"], "|"), bands)
    return result


def reference_keys(d: Mapping[str, np.ndarray], vocab: list[str]) -> np.ndarray:
    index = codes(d["action_type"], vocab)
    labels = np.array([*vocab, "other"], dtype=np.str_)[index]
    result: np.ndarray = np.char.add(np.char.add(d["zone_basic"], "|"), labels)
    return result


def table_predict(table: Mapping[str, Any], keys: np.ndarray, zones: np.ndarray) -> np.ndarray:
    league = float(np.mean(list(table["zones"].values())))
    cells, zone_rates = table["cells"], table["zones"]
    return np.array(
        [
            cells[k] if k in cells else zone_rates.get(z, league)
            for k, z in zip(keys.tolist(), zones.tolist(), strict=True)
        ]
    )


# ---- Fits ---------------------------------------------------------------------------------------


def fit_logistic(design: sparse.csr_matrix, y: np.ndarray) -> dict[str, Any]:
    from sklearn.exceptions import ConvergenceWarning  # type: ignore[import-untyped]
    from sklearn.linear_model import LogisticRegression  # type: ignore[import-untyped]

    model = LogisticRegression(
        C=LOGISTIC["C"],
        solver=str(LOGISTIC["solver"]),
        max_iter=int(LOGISTIC["max_iter"]),
        tol=LOGISTIC["tol"],
    )
    with warnings.catch_warnings():
        warnings.simplefilter("error", ConvergenceWarning)
        model.fit(design, y)
    iterations = int(np.max(model.n_iter_))
    if iterations >= int(LOGISTIC["max_iter"]):
        raise SystemExit("logistic regression did not converge")
    return {
        "coef": [float(c) for c in model.coef_[0]],
        "intercept": float(model.intercept_[0]),
        "iterations": iterations,
    }


def logistic_predict(model: Mapping[str, Any], design: sparse.csr_matrix) -> np.ndarray:
    z = design @ np.array(model["coef"]) + float(model["intercept"])
    result: np.ndarray = 1.0 / (1.0 + np.exp(-z))
    return result


def fit_lightgbm(matrix: np.ndarray, y: np.ndarray, leaves: int, seed: int) -> tuple[str, Any]:
    import lightgbm as lgb

    params = {
        "objective": "binary",
        "learning_rate": LIGHTGBM["learning_rate"],
        "num_leaves": leaves,
        "min_data_in_leaf": LIGHTGBM["min_child_samples"],
        "lambda_l2": LIGHTGBM["reg_lambda"],
        "feature_fraction": LIGHTGBM["feature_fraction"],
        "bagging_fraction": 1.0,
        "bagging_freq": 0,
        "max_bin": LIGHTGBM["max_bin"],
        "num_threads": LIGHTGBM["num_threads"],
        "seed": seed,
        "deterministic": True,
        "force_row_wise": True,
        "verbose": -1,
        "metric": "binary_logloss",
    }
    train = lgb.Dataset(
        matrix,
        label=y,
        feature_name=list(TREE_FEATURES),
        categorical_feature=["action_type", "zone_cell"],
        free_raw_data=False,
    )
    history: dict[str, Any] = {}
    booster = lgb.train(
        params,
        train,
        num_boost_round=int(LIGHTGBM["n_estimators"]),
        valid_sets=[train],
        valid_names=["train"],
        callbacks=[lgb.record_evaluation(history)],
    )
    losses = history["train"]["binary_logloss"]
    if booster.num_trees() != int(LIGHTGBM["n_estimators"]) or len(losses) != booster.num_trees():
        raise SystemExit(f"LightGBM {leaves} leaves stopped early")
    if not losses[-1] < losses[0]:
        raise SystemExit(f"LightGBM {leaves} leaves did not reduce training loss")
    trace = {
        "trees": booster.num_trees(),
        "train_log_loss_first": float(losses[0]),
        "train_log_loss_last": float(losses[-1]),
    }
    return booster.model_to_string(), trace


def lightgbm_predict(model_text: str, matrix: np.ndarray) -> np.ndarray:
    import lightgbm as lgb

    booster = lgb.Booster(model_str=model_text)
    result = np.asarray(booster.predict(matrix, num_threads=1), dtype=float)
    return result


def fit_platt(p: np.ndarray, y: np.ndarray) -> dict[str, float]:
    x = es.logit(p)
    n = len(y)

    def objective(theta: np.ndarray) -> tuple[float, np.ndarray]:
        z = theta[0] + theta[1] * x
        loss = float(np.sum(np.logaddexp(0.0, z) - y * z)) / n
        r = 1.0 / (1.0 + np.exp(-z)) - y
        return loss, np.array([np.sum(r) / n, np.sum(r * x) / n])

    result = minimize(objective, np.array([0.0, 1.0]), jac=True, method="L-BFGS-B")
    if not result.success or not np.all(np.isfinite(result.x)):
        raise SystemExit(f"Platt calibration did not converge: {result.message}")
    return {"a": float(result.x[0]), "b": float(result.x[1]), "iterations": int(result.nit)}


# ---- Metrics ------------------------------------------------------------------------------------


def _games(d: Mapping[str, np.ndarray]) -> tuple[np.ndarray, int]:
    _, index = np.unique(d["game_id"], return_inverse=True)
    return index, int(index.max()) + 1


def metric_block(
    preds: Mapping[str, np.ndarray],
    d: Mapping[str, np.ndarray],
    reference: str,
    weights: np.ndarray,
    mask: np.ndarray | None = None,
) -> dict[str, Any]:
    """Point metrics for every model and bootstrap intervals of differences from `reference`."""
    keep = np.ones(len(d["made"]), dtype=bool) if mask is None else mask
    y = d["made"][keep].astype(float)
    v = d["value"][keep].astype(float)
    game_index, games = _games(d)
    g = game_index[keep]
    counts = es.game_sums(g, np.ones(len(y)), games)
    boot_n = weights @ counts
    per: dict[str, dict[str, np.ndarray]] = {}
    out: dict[str, Any] = {"attempts": int(keep.sum()), "games": int((counts > 0).sum())}
    models: dict[str, Any] = {}
    for name, full in preds.items():
        p = full[keep]
        terms = {
            "brier": es.brier_terms(p, y),
            "log_loss": es.log_loss_terms(p, y),
            "points_mae": np.abs(v * y - v * p),
        }
        per[name] = {k: weights @ es.game_sums(g, t, games) / boot_n for k, t in terms.items()}
        models[name] = {
            **{k: es.finite(float(t.mean()), k) for k, t in terms.items()},
            "ece": es.finite(es.ece(p, y, ECE_BINS), "ece"),
            "mean_predicted": float(p.mean()),
            "observed": float(y.mean()),
            "expected_points_per_shot": float((v * p).mean()),
            "actual_points_per_shot": float((v * y).mean()),
        }
    out["models"] = models
    differences: dict[str, Any] = {}
    for name in preds:
        if name == reference:
            continue
        block: dict[str, Any] = {}
        for metric in ("brier", "log_loss", "points_mae"):
            point = models[reference][metric] - models[name][metric]
            boot = per[reference][metric] - per[name][metric]
            block[metric] = {"difference": point, "interval": es.interval(boot, LEVEL)}
        relative = 1 - models[name]["brier"] / models[reference]["brier"]
        boot_relative = 1 - per[name]["brier"] / per[reference]["brier"]
        block["relative_brier"] = {
            "value": relative,
            "interval": es.interval(boot_relative, LEVEL),
        }
        relative_ll = 1 - models[name]["log_loss"] / models[reference]["log_loss"]
        boot_ll = 1 - per[name]["log_loss"] / per[reference]["log_loss"]
        block["relative_log_loss"] = {"value": relative_ll, "interval": es.interval(boot_ll, LEVEL)}
        differences[name] = block
    out["versus_baseline"] = differences
    return out


def weighted_corr(x: np.ndarray, y: np.ndarray, w: np.ndarray) -> float:
    w = w / w.sum()
    mx, my = float(np.sum(w * x)), float(np.sum(w * y))
    cov = float(np.sum(w * (x - mx) * (y - my)))
    return cov / float(np.sqrt(np.sum(w * (x - mx) ** 2) * np.sum(w * (y - my) ** 2)))


# ---- Pass 1: fit and choose ---------------------------------------------------------------------


def _sha(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def fit_pass(run: Path) -> dict[str, Any]:
    params = parameters()
    seed = load_registration(REGISTRATION).seed
    pins = params["table_sha256"]
    run.mkdir(parents=True, exist_ok=False)
    started = time.monotonic()
    train = load(TRAIN, pins)
    y = train["made"].astype(float)
    vocab = {
        "action": vocabulary(train["action_type"], CATEGORY_MIN),
        "zone": vocabulary(zone_cell(train), CATEGORY_MIN),
    }
    baseline = rate_table(baseline_keys(train), train["zone_basic"], train["made"])
    reference = rate_table(
        reference_keys(train, vocab["action"]), train["zone_basic"], train["made"]
    )
    timings: dict[str, float] = {}
    t0 = time.monotonic()
    logistic = fit_logistic(logistic_design(train, vocab), y)
    timings["logistic_spline"] = round(time.monotonic() - t0, 1)
    matrix = tree_matrix(train, vocab)
    trees: dict[str, str] = {}
    traces: dict[str, Any] = {"logistic_spline": {"iterations": logistic["iterations"]}}
    for leaves in LIGHTGBM["num_leaves_grid"]:
        t0 = time.monotonic()
        text, trace = fit_lightgbm(matrix, y, int(leaves), seed)
        trees[f"lightgbm_{leaves}"] = text
        traces[f"lightgbm_{leaves}"] = trace
        timings[f"lightgbm_{leaves}"] = round(time.monotonic() - t0, 1)
    del matrix, train

    models_dir = run / "models"
    models_dir.mkdir()
    files = {
        "vocabulary.json": json.dumps(vocab, sort_keys=True),
        "baseline.json": json.dumps(baseline, sort_keys=True),
        "reference.json": json.dumps(reference, sort_keys=True),
        "logistic_spline.json": json.dumps(logistic, sort_keys=True),
        **{f"{name}.txt": text for name, text in trees.items()},
    }
    hashes: dict[str, str] = {}
    for name, body in files.items():
        (models_dir / name).write_text(body)
        hashes[name] = _sha(models_dir / name)

    selection = load((SELECT,), pins)
    preds = predict_all(models_dir, selection)
    weights = es.game_bootstrap_weights(_games(selection)[1], REPLICATES, seed)
    block = metric_block(preds, selection, "baseline", weights)
    briers = {name: block["models"][name]["brier"] for name in CANDIDATES}
    chosen = min(CANDIDATES, key=lambda name: (briers[name], CANDIDATES.index(name)))
    improvement = block["versus_baseline"][chosen]["relative_brier"]["value"]
    choice = {
        "registration": registration_receipt(REGISTRATION),
        "season": SELECT,
        "metrics": block,
        "chosen": chosen,
        "relative_brier": improvement,
        "gate": SELECTION_GATE,
        "passed": bool(improvement >= SELECTION_GATE),
        "vocabulary_sizes": {k: len(v) for k, v in vocab.items()},
        "baseline_cells": len(baseline["cells"]),
        "reference_cells": len(reference["cells"]),
        "fits": traces,
        "model_sha256": hashes,
        "training_attempts": len(y),
        "seed": seed,
    }
    choice = dict(_rounded(choice))
    choice["choice_sha256"] = hashlib.sha256(canonical(choice)).hexdigest()
    (run / "choice.json").write_bytes(canonical(choice))
    choice["fit_seconds"] = timings  # timings stay out of the hashed choice file
    choice["wall_seconds"] = round(time.monotonic() - started, 1)
    return choice


def predict_all(
    models_dir: Path, d: Mapping[str, np.ndarray], names: tuple[str, ...] | None = None
) -> dict[str, np.ndarray]:
    vocab = json.loads((models_dir / "vocabulary.json").read_text())
    wanted = names or ("baseline", "reference", *CANDIDATES)
    preds: dict[str, np.ndarray] = {}
    if "baseline" in wanted:
        table = json.loads((models_dir / "baseline.json").read_text())
        preds["baseline"] = table_predict(table, baseline_keys(d), d["zone_basic"])
    if "reference" in wanted:
        table = json.loads((models_dir / "reference.json").read_text())
        preds["reference"] = table_predict(
            table, reference_keys(d, vocab["action"]), d["zone_basic"]
        )
    if "logistic_spline" in wanted:
        model = json.loads((models_dir / "logistic_spline.json").read_text())
        preds["logistic_spline"] = logistic_predict(model, logistic_design(d, vocab))
    trees = [n for n in wanted if n.startswith("lightgbm_")]
    if trees:
        matrix = tree_matrix(d, vocab)
        for name in trees:
            preds[name] = lightgbm_predict((models_dir / f"{name}.txt").read_text(), matrix)
    for name, p in preds.items():
        if not np.all(np.isfinite(p)) or p.min() <= 0 or p.max() >= 1:
            raise SystemExit(f"{name} produced a probability outside (0, 1)")
    return preds


# ---- Pass 2: calibrate, test, players -----------------------------------------------------------


def test_pass(run: Path) -> dict[str, Any]:
    params = parameters()
    seed = load_registration(REGISTRATION).seed
    pins = params["table_sha256"]
    started = time.monotonic()
    choice = json.loads((run / "choice.json").read_text())
    stamp = choice.pop("choice_sha256")
    if hashlib.sha256(canonical(choice)).hexdigest() != stamp:
        raise SystemExit("choice file changed after the choice pass")
    choice["choice_sha256"] = stamp
    if choice["registration"] != registration_receipt(REGISTRATION):
        raise SystemExit("registration changed after the choice pass")
    models_dir = run / "models"
    for name, digest in choice["model_sha256"].items():
        if _sha(models_dir / name) != digest:
            raise SystemExit(f"saved model {name} changed after the choice pass")
    chosen: str | None = choice["chosen"] if choice["passed"] else None
    names = ("baseline", "reference", *((chosen,) if chosen else ()))

    calibration_data = load((CALIBRATE,), pins)
    raw_cal = predict_all(models_dir, calibration_data, names)
    y_cal = calibration_data["made"].astype(float)
    platt = {name: fit_platt(p, y_cal) for name, p in raw_cal.items()}
    cal_preds = {n: es.platt(p, platt[n]["a"], platt[n]["b"]) for n, p in raw_cal.items()}
    weights_cal = es.game_bootstrap_weights(_games(calibration_data)[1], REPLICATES, seed)
    calibration_block = {
        "season": CALIBRATE,
        "platt": platt,
        "uncalibrated": metric_block(raw_cal, calibration_data, "baseline", weights_cal),
        "calibrated_in_sample": metric_block(cal_preds, calibration_data, "baseline", weights_cal),
    }

    test = load(TEST, pins)
    raw = predict_all(models_dir, test, names)
    calibrated = {n: es.platt(p, platt[n]["a"], platt[n]["b"]) for n, p in raw.items()}
    weights = es.game_bootstrap_weights(_games(test)[1], REPLICATES, seed)
    pooled = metric_block(calibrated, test, "baseline", weights)
    by_season = {}
    for index, season in enumerate(TEST):
        mask = test["season"] == season
        subset = {k: v[mask] for k, v in test.items()}
        sub_weights = es.game_bootstrap_weights(_games(subset)[1], REPLICATES, seed + 1 + index)
        by_season[season] = metric_block(
            {n: p[mask] for n, p in calibrated.items()}, subset, "baseline", sub_weights
        )
    gates: dict[str, Any] = {}
    accepted = False
    if chosen:
        diff = pooled["versus_baseline"][chosen]
        gates = {
            "relative_brier": {
                "value": diff["relative_brier"]["value"],
                "threshold": TEST_GATE,
                "brier_difference_interval": diff["brier"]["interval"],
                "passed": bool(
                    diff["relative_brier"]["value"] >= TEST_GATE
                    and diff["brier"]["interval"][0] > 0
                ),
            },
            "log_loss": {
                "difference": diff["log_loss"]["difference"],
                "interval": diff["log_loss"]["interval"],
                "passed": bool(diff["log_loss"]["interval"][0] > 0),
            },
            "ece": {
                "value": pooled["models"][chosen]["ece"],
                "threshold": TEST_MAX_ECE,
                "passed": bool(pooled["models"][chosen]["ece"] <= TEST_MAX_ECE),
            },
        }
        accepted = all(g["passed"] for g in gates.values())
    serving_model = chosen if accepted else "baseline"
    test_block = {
        "seasons": list(TEST),
        "pooled": pooled,
        "uncalibrated": metric_block(raw, test, "baseline", weights),
        "by_season": by_season,
        "gates": gates,
        "accepted": accepted,
        "failed_gates": [k for k, g in gates.items() if not g["passed"]],
        "curves": {
            n: es.calibration_curve(p, test["made"].astype(float), CURVE_BINS)
            for n, p in calibrated.items()
        },
        "slices": slices(calibrated, test, weights, chosen),
    }

    players_block = players(models_dir, platt, serving_model or "baseline", pins, seed)
    result = {
        "registration": registration_receipt(REGISTRATION),
        "data": data_receipts(),
        "choice": choice,
        "calibration": calibration_block,
        "test": test_block,
        "outcome": outcome(choice, accepted, gates),
        "serving_model": serving_model,
        "players": players_block,
    }
    rounded = dict(_rounded(result))
    rounded["results_sha256"] = hashlib.sha256(canonical(rounded)).hexdigest()
    rounded["_wall_seconds"] = round(time.monotonic() - started, 1)
    return rounded


def outcome(choice: Mapping[str, Any], accepted: bool, gates: Mapping[str, Any]) -> str:
    if not choice["passed"]:
        return "selection_failed_negative_result"
    if accepted:
        return "accepted"
    return "test_failed_negative_result"


def slices(
    preds: Mapping[str, np.ndarray],
    d: Mapping[str, np.ndarray],
    weights: np.ndarray,
    chosen: str | None,
) -> list[dict[str, Any]]:
    seconds = d["possession_seconds"]
    known = np.isfinite(seconds)
    groups: list[tuple[str, str, np.ndarray]] = []
    for zone in ZONES:
        groups.append(("zone", zone, d["zone_basic"] == zone))
    groups += [("value", "2PT", d["value"] == 2), ("value", "3PT", d["value"] == 3)]
    groups += [("season", s, d["season"] == s) for s in TEST]
    low, high = POSSESSION_BANDS
    groups += [
        ("possession_seconds", f"<= {low} s", known & (seconds <= low)),
        ("possession_seconds", f"{low} to {high} s", known & (seconds > low) & (seconds <= high)),
        ("possession_seconds", f"> {high} s", known & (seconds > high)),
        ("possession_seconds", "unknown", ~known),
        ("offensive_rebound", "after own offensive rebound", d["after_oreb"] == 1),
        ("offensive_rebound", "no offensive rebound", d["after_oreb"] == 0),
    ]
    out = []
    names = {"baseline": preds["baseline"], **({chosen: preds[chosen]} if chosen else {})}
    for family, label, mask in groups:
        count = int(mask.sum())
        entry: dict[str, Any] = {"family": family, "label": label, "attempts": count}
        if count >= SLICE_MIN:
            entry["metrics"] = metric_block(names, d, "baseline", weights, mask)
        out.append(entry)
    return out


def data_receipts() -> dict[str, Any]:
    receipts = {}
    for season in data.SEASONS:
        body = json.loads((TABLES / f"{season}.receipt.json").read_text())
        body.pop("elapsed_seconds", None)
        body.pop("table", None)
        receipts[season] = body
    return receipts


def players(
    models_dir: Path,
    platt: Mapping[str, Mapping[str, float]],
    model: str,
    pins: Mapping[str, str],
    seed: int,
) -> dict[str, Any]:
    seasons: dict[str, Any] = {}
    for season_index, season in enumerate(PLAYER_SEASONS):
        d = load((season,), pins)
        p = predict_all(models_dir, d, (model,))[model]
        p = es.platt(p, platt[model]["a"], platt[model]["b"])
        v = d["value"].astype(float)
        actual, expected = v * d["made"], v * p
        league = float((actual.sum() - expected.sum()) / len(p))
        rng = np.random.default_rng(seed + season_index)
        rows: dict[str, Any] = {}
        order = np.argsort(d["player_id"], kind="stable")
        ids, starts = np.unique(d["player_id"][order], return_index=True)
        bounds = [*starts.tolist(), len(order)]
        for i, pid in enumerate(ids.tolist()):
            idx = order[bounds[i] : bounds[i + 1]]
            n = len(idx)
            teams, team_counts = np.unique(d["team_id"][idx], return_counts=True)
            primary = str(teams[np.argmax(team_counts)])
            row: dict[str, Any] = {
                "fga": n,
                "pps": float(actual[idx].sum() / n),
                "xpps": float(expected[idx].sum() / n),
                "fg_pct": float(d["made"][idx].mean()),
                "three_share": float((d["value"][idx] == 3).mean()),
                "teams": [str(t) for t in teams[np.argsort(-team_counts, kind="stable")]],
                "team_id": primary,
            }
            row["shot_making"] = 100.0 * ((row["pps"] - row["xpps"]) - league)
            if n < PLAYER_MIN:
                row["status"] = "small_sample"
                row["shot_making"] = None
                row["interval"] = None
            else:
                _, game_index = np.unique(d["game_id"][idx], return_inverse=True)
                games = int(game_index.max()) + 1
                diff_g = es.game_sums(game_index, actual[idx] - expected[idx], games)
                n_g = es.game_sums(game_index, np.ones(n), games)
                w = rng.multinomial(games, np.full(games, 1.0 / games), size=REPLICATES)
                boot = 100.0 * ((w @ diff_g) / (w @ n_g) - league)
                row["status"] = "served"
                row["interval"] = list(es.interval(boot, LEVEL))
                row["games"] = games
            rows[str(pid)] = row
        seasons[season] = {
            "league_term": league,
            "league_pps": float(actual.sum() / len(p)),
            "league_xpps": float(expected.sum() / len(p)),
            "attempts": len(p),
            "players": rows,
            "served": sum(1 for r in rows.values() if r["status"] == "served"),
        }
    return {
        "model": model,
        "min_attempts": PLAYER_MIN,
        "seasons": seasons,
        "persistence": persistence(seasons, seed),
    }


def persistence(seasons: Mapping[str, Any], seed: int) -> dict[str, Any]:
    pairs: list[tuple[str, float, float, float, float, float, float, float]] = []
    labels = list(seasons)
    for first, second in pairwise(labels):
        a, b = seasons[first], seasons[second]
        for pid, row in a["players"].items():
            nxt = b["players"].get(pid)
            if row["status"] != "served" or not nxt or nxt["status"] != "served":
                continue
            weight = 2.0 / (1.0 / row["fga"] + 1.0 / nxt["fga"])
            pairs.append(
                (
                    pid,
                    weight,
                    row["shot_making"],
                    nxt["shot_making"],
                    row["xpps"],
                    nxt["xpps"],
                    row["pps"] - a["league_pps"],
                    nxt["pps"] - b["league_pps"],
                )
            )
    pid = np.array([p[0] for p in pairs])
    values = np.array([p[1:] for p in pairs], dtype=float)
    w = values[:, 0]
    measures = {"shot_making": (1, 2), "xpps": (3, 4), "pps_minus_league": (5, 6)}
    players_unique, cluster = np.unique(pid, return_inverse=True)
    rng = np.random.default_rng(seed)
    draws = rng.multinomial(
        len(players_unique),
        np.full(len(players_unique), 1.0 / len(players_unique)),
        size=REPLICATES,
    )
    out: dict[str, Any] = {"pairs": len(pairs), "players": len(players_unique)}
    for name, (i, j) in measures.items():
        point = weighted_corr(values[:, i], values[:, j], w)
        boot = np.array(
            [
                weighted_corr(values[:, i], values[:, j], w * draws[r][cluster])
                for r in range(REPLICATES)
            ]
        )
        out[name] = {"r": es.finite(point, name), "interval": es.interval(boot, LEVEL)}
    return out


# ---- Output -------------------------------------------------------------------------------------


def _rounded(value: Any) -> Any:
    if isinstance(value, float):
        if not np.isfinite(value):
            raise SystemExit("non-finite value in results")
        return round(value, 9)
    if isinstance(value, dict):
        return {str(k): _rounded(v) for k, v in value.items()}
    if isinstance(value, (list, tuple)):
        return [_rounded(v) for v in value]
    if isinstance(value, np.generic):
        return _rounded(value.item())
    return value


def canonical(payload: Mapping[str, Any]) -> bytes:
    return (
        json.dumps(payload, sort_keys=True, separators=(",", ":"), allow_nan=False) + "\n"
    ).encode()


EVIDENCE_SECTIONS = (
    "registration",
    "data",
    "choice",
    "calibration",
    "test",
    "outcome",
    "serving_model",
    "results_sha256",
)


def evidence_extract(result: Mapping[str, Any]) -> dict[str, Any]:
    extract = {k: result[k] for k in EVIDENCE_SECTIONS}
    extract["players"] = {
        "model": result["players"]["model"],
        "persistence": result["players"]["persistence"],
        "league": {
            s: {k: v for k, v in block.items() if k != "players"}
            for s, block in result["players"]["seasons"].items()
        },
    }
    return extract


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    sub = parser.add_subparsers(dest="command", required=True)
    fit = sub.add_parser("fit", help="choice pass: fit, score the selection season, stop")
    fit.add_argument("--run", type=Path, required=True)
    test = sub.add_parser("test", help="calibrate, score the test seasons, write results")
    test.add_argument("--run", type=Path, required=True)
    test.add_argument("--output", type=Path, default=FROZEN)
    extract = sub.add_parser("extract", help="write the evidence sections of a results file")
    extract.add_argument("--results", type=Path, default=FROZEN)
    extract.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    if args.command == "extract":
        frozen = json.loads(args.results.read_text())
        args.output.write_text(
            json.dumps(evidence_extract(frozen), sort_keys=True, indent=1) + "\n"
        )
        return
    _check_threads()
    started = time.monotonic()
    if args.command == "fit":
        result = fit_pass(args.run)
        summary = {
            "chosen": result["chosen"],
            "relative_brier": result["relative_brier"],
            "passed": result["passed"],
            "choice_sha256": result["choice_sha256"],
            "model_sha256": result["model_sha256"],
            "fit_seconds": result["fit_seconds"],
        }
    else:
        result = test_pass(args.run)
        result.pop("_wall_seconds")
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_bytes(canonical(result))
        summary = {"outcome": result["outcome"], "results_sha256": result["results_sha256"]}
    summary["wall_seconds"] = round(time.monotonic() - started, 1)
    summary["peak_rss_mib"] = round(resource.getrusage(resource.RUSAGE_SELF).ru_maxrss / 1024, 1)
    (args.run / f"{args.command}.log.json").write_text(json.dumps(summary, indent=1) + "\n")
    print(json.dumps(summary), flush=True)


if __name__ == "__main__":
    main()
