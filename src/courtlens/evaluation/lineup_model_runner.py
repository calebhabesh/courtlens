"""Lineup model runner (`courtlens-lineup-model-v1`, R14).

Every fit is rolling-origin: a model for target season t is trained on the three seasons before t
(`lineup_model_data.window_seasons`), so every input precedes t's opener. Order of commands, each
a separate run under the registered budget:

1. `select` - the ridge penalty, then the lineup model's size and penalty, chosen on the selection
   seasons (2021-22, 2022-23) only. Refused once its file exists.
2. `test` - refits the chosen models for 2022-23 (the backtest's calibration season, not scored
   here) and the test seasons 2023-24 to 2025-26, and scores the test seasons once. Refused once
   results exist. Also writes each game's stint-based strength for `lineup_backtest_runner`.
3. `serve`, `bootstrap`, `finish` - the 2026-27 fit (2023-24 to 2025-26) for the lineup tool and
   the similarity map, its game-bootstrap refits for intervals, and the manifest the API reads.
4. `reproduce` - recomputes a part and compares hashes.

Hashes cover results, never timings. Timings and peak memory are printed per run.
"""

from __future__ import annotations

import argparse
import json
import platform
import resource
import time
from collections.abc import Mapping, Sequence
from pathlib import Path
from typing import Any

import numpy as np

from courtlens.domain.research_registry import load_registration, registration_receipt
from courtlens.evaluation import lineup_model_core as core
from courtlens.evaluation import lineup_model_data as data
from courtlens.evaluation.lineup_model_train import (
    BATCH,
    EPOCHS,
    LEARNING_RATE,
    ROUNDS,
    THREADS,
    Config,
    train,
)
from courtlens.ingestion.native_reconstruction import content_hash
from courtlens.ingestion.sportsdataverse import hash_file

REGISTRATION = data.REGISTRATION
SEED = 1401
SEEDS = (1401, 1402, 1403, 1404, 1405)
ALPHAS = (100.0, 300.0, 1000.0, 3000.0, 10000.0, 30000.0)
DIMS = (8, 16)
PENALTIES = (1e-5, 1e-4, 1e-3, 1e-2)
CONFIGS = tuple(Config(d, p) for d in DIMS for p in PENALTIES)
CALIBRATION = "2022-23"
BOOTSTRAP = 100
BOOTSTRAP_SEED = 1414
BOOTSTRAP_TRAIN_SEED = 2000
TOOL_INTERVAL = (10.0, 90.0)
PANEL = 200
NEIGHBOURS = 10
UMAP = {"n_neighbors": 15, "min_dist": 0.1, "metric": "euclidean", "random_state": 1414}
FROZEN = Path("evaluation/research/frozen")
SELECTION_PATH = FROZEN / "courtlens-lineup-model-v1-selection.json"
RESULTS_PATH = FROZEN / "courtlens-lineup-model-v1.json"
SERVING_PATH = FROZEN / "courtlens-lineup-model-v1-serving.json"
CODE = (
    "src/courtlens/evaluation/lineup_model_data.py",
    "src/courtlens/evaluation/lineup_model_core.py",
    "src/courtlens/evaluation/lineup_model_train.py",
    "src/courtlens/evaluation/lineup_model_runner.py",
)


def registered_constants() -> dict[str, Any]:
    return {
        "first_season": data.season_label(data.FIRST_YEAR),
        "last_season": data.season_label(data.LAST_YEAR),
        "window_seasons": data.WINDOW,
        "selection_seasons": list(data.SELECTION),
        "test_seasons": list(data.TEST),
        "serving_season": data.SERVING,
        "backtest_calibration_season": CALIBRATION,
        "min_possessions": data.MIN_POSSESSIONS,
        "box_features": list(data.BOX_FEATURES),
        "bubble_neutral": list(data.BUBBLE_NEUTRAL),
        "seeds": list(SEEDS),
        "ridge_alphas": list(ALPHAS),
        "dims": list(DIMS),
        "interaction_penalties": list(PENALTIES),
        "heads": core.HEADS,
        "ffn_multiplier": core.FFN_MULTIPLIER,
        "rounds": ROUNDS,
        "epochs": EPOCHS,
        "batch": BATCH,
        "learning_rate": LEARNING_RATE,
        "threads": THREADS,
        "replicates": core.REPLICATES,
        "level": core.LEVEL,
        "bootstrap_refits": BOOTSTRAP,
        "bootstrap_seed": BOOTSTRAP_SEED,
        "bootstrap_train_seed": BOOTSTRAP_TRAIN_SEED,
        "tool_interval_percentiles": list(TOOL_INTERVAL),
        "panel_lineups": PANEL,
        "neighbours": NEIGHBOURS,
        "umap": dict(UMAP),
    }


def versions() -> dict[str, str]:
    import scipy  # type: ignore[import-untyped]
    import sklearn  # type: ignore[import-untyped]
    import torch
    import umap

    return {
        "python": platform.python_version(),
        "numpy": np.__version__,
        "scipy": scipy.__version__,
        "scikit-learn": sklearn.__version__,
        "torch": str(torch.__version__),
        "umap-learn": umap.__version__,
    }


def check_registration(parameters: Mapping[str, Any], seed: int) -> None:
    for key, value in registered_constants().items():
        if parameters.get(key) != value:
            raise SystemExit(f"module constant {key} differs from the registration")
    if seed != SEED:
        raise SystemExit("seed differs from the registration")
    if parameters.get("package_versions") != versions():
        raise SystemExit("installed packages differ from the registration's lock")
    code = {p: hash_file(Path(p))[0] for p in CODE}
    if parameters.get("code_sha256") != code:
        raise SystemExit("lineup model code differs from the registration")


def checked_inputs(output: Path) -> tuple[data.Stints, data.Boxes, dict[str, Any]]:
    registration = load_registration(REGISTRATION)
    check_registration(registration.parameters, registration.seed)
    s, b = data.read_dataset(output, registration.parameters["dataset_sha256"])
    return s, b, registration_receipt(REGISTRATION)


def write_json(path: Path, body: Mapping[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(body, indent=1, sort_keys=True) + "\n")


def save_weights(output: Path, arrays: Mapping[str, np.ndarray]) -> str:
    digest = data.array_hash(dict(arrays), {})
    path = output / "models" / f"{digest}.npz"
    path.parent.mkdir(parents=True, exist_ok=True)
    if not path.exists():
        np.savez(path, **arrays)  # type: ignore[arg-type]
    return digest


def load_weights(output: Path, digest: str) -> dict[str, np.ndarray]:
    with np.load(output / "models" / f"{digest}.npz") as z:
        arrays = {k: z[k] for k in z.files}
    if data.array_hash(arrays, {}) != digest:
        raise ValueError(f"weights {digest} changed")
    return arrays


def flatten(seeds: Sequence[Mapping[str, np.ndarray]]) -> dict[str, np.ndarray]:
    return {f"{i}/{k}": np.asarray(v) for i, w in enumerate(seeds) for k, v in w.items()}


def unflatten(arrays: Mapping[str, np.ndarray]) -> list[dict[str, np.ndarray]]:
    out: dict[int, dict[str, np.ndarray]] = {}
    for key, value in arrays.items():
        i, name = key.split("/", 1)
        out.setdefault(int(i), {})[name] = value
    return [out[i] for i in sorted(out)]


# ---------------------------------------------------------------------------------------------
# Fitting and scoring one target season.


class Fit:
    """Window, encodings and the ridge for one target season."""

    def __init__(self, s: data.Stints, b: data.Boxes, target: str) -> None:
        self.target = target
        self.window = data.make_window(s, b, target)
        self.k = len(self.window.own)
        self.train = core.encode(s, self.window.train, self.window)
        self.test_idx = np.flatnonzero(data.target_mask(s, target))
        self.test = core.encode(s, self.test_idx, self.window)
        self.games = np.unique(self.test.game)


def season_scores(fit: Fit, prediction: np.ndarray) -> dict[str, Any]:
    sums = core.game_sums(fit.test, prediction, fit.games)
    weights = core.game_weights(fit.test, fit.games)
    return {"wrmse": core.wrmse(sums, weights), "sums": sums, "weights": weights}


def pooled_wrmse(parts: Sequence[Mapping[str, Any]]) -> float:
    return float(
        np.sqrt(sum(p["sums"].sum() for p in parts) / sum(p["weights"].sum() for p in parts))
    )


def home_only(fit: Fit) -> np.ndarray:
    """Reference: the window's possession-weighted mean home margin, nothing about players."""
    e = fit.train
    home = float(np.average(e.y[e.home > 0], weights=e.w[e.home > 0]))
    return np.asarray(100 * home * fit.test.home)


def fit_seeds(fit: Fit, alpha: float, config: Config, ridge: core.Ridge) -> list[dict[str, Any]]:
    return [train(fit.train, fit.k, alpha, config, seed, warm=ridge)[0] for seed in SEEDS]


# ---------------------------------------------------------------------------------------------
# select


def run_selection(s: data.Stints, b: data.Boxes, receipt: Mapping[str, Any]) -> dict[str, Any]:
    fits = {t: Fit(s, b, t) for t in data.SELECTION}
    alpha_grid: dict[str, Any] = {}
    for alpha in ALPHAS:
        parts = {}
        for t, fit in fits.items():
            parts[t] = season_scores(
                fit, core.predict_ridge(core.fit_ridge(fit.train, fit.k, alpha), fit.test)
            )
        alpha_grid[f"{alpha:g}"] = {
            "seasons": {t: p["wrmse"] for t, p in parts.items()},
            "pooled": pooled_wrmse(list(parts.values())),
        }
    # Lowest pooled error; a tie goes to the larger penalty.
    alpha = min(ALPHAS, key=lambda a: (alpha_grid[f"{a:g}"]["pooled"], -a))
    ridges = {t: core.fit_ridge(fit.train, fit.k, alpha) for t, fit in fits.items()}
    config_grid: dict[str, Any] = {}
    for config in CONFIGS:
        parts = {}
        for t, fit in fits.items():
            seeds = fit_seeds(fit, alpha, config, ridges[t])
            parts[t] = season_scores(fit, core.predict_ensemble(seeds, fit.test))
        config_grid[config.key()] = {
            "dim": config.dim,
            "penalty": config.penalty,
            "seasons": {t: p["wrmse"] for t, p in parts.items()},
            "pooled": pooled_wrmse(list(parts.values())),
        }
        print("config", config.key(), config_grid[config.key()]["pooled"], flush=True)
    # Lowest pooled error; a tie goes to the smaller model, then the larger penalty.
    chosen = min(CONFIGS, key=lambda c: (config_grid[c.key()]["pooled"], c.dim, -c.penalty))
    body = {
        "version": REGISTRATION,
        "registration": dict(receipt),
        "seasons": list(data.SELECTION),
        "ridge_alpha_grid": alpha_grid,
        "selected_alpha": alpha,
        "lineup_grid": config_grid,
        "selected_config": {"dim": chosen.dim, "penalty": chosen.penalty, "key": chosen.key()},
        "rule": "lowest possession-weighted stint margin RMSE pooled over the selection seasons; "
        "ties: larger ridge penalty; smaller model, then larger interaction penalty",
        "versions": versions(),
    }
    body["selection_sha256"] = content_hash(body)
    return body


def load_selection() -> tuple[float, Config, str]:
    body = json.loads(SELECTION_PATH.read_text())
    digest = body.pop("selection_sha256")
    if content_hash(body) != digest:
        raise SystemExit("selection file changed")
    chosen = body["selected_config"]
    return (
        float(body["selected_alpha"]),
        Config(int(chosen["dim"]), float(chosen["penalty"])),
        digest,
    )


# ---------------------------------------------------------------------------------------------
# test


def game_strengths(
    s: data.Stints, fit: Fit, ridge: core.Ridge, seeds: Sequence[Any]
) -> dict[str, Any]:
    """Per game: sum over all its stints of (seconds / 2,880) x predicted margin per 100 at a
    neutral site, for both models. Reads no outcome."""
    idx = np.flatnonzero(s.season == data.season_year(fit.target))
    e = core.encode(s, idx, fit.window)
    neutral = core.Encoded(e.slots, e.features, np.zeros(len(idx)), e.y, e.w, e.game)
    share = s.seconds[idx] / 2880.0
    out: dict[str, dict[str, float]] = {}
    for name, pred in (
        ("lineup_model", core.predict_ensemble(seeds, neutral)),
        ("lineup_ridge", core.predict_ridge(ridge, neutral)),
    ):
        totals = np.zeros(len(s.games))
        np.add.at(totals, e.game, share * pred)
        for g in np.unique(e.game):
            out.setdefault(s.games[g], {})[name] = float(totals[g])
    return out


def bootstrap_block(
    parts: Mapping[str, Mapping[str, Mapping[str, Any]]], seasons: Sequence[str]
) -> dict[str, Any]:
    """Per-season and pooled WRMSE with intervals, and paired gains (reference minus candidate)."""
    counts = {
        t: core.resample_counts(len(parts["ridge"][t]["sums"]), SEED, data.season_year(t))
        for t in seasons
    }

    def reps(model: str, ts: Sequence[str]) -> np.ndarray:
        num = sum(counts[t] @ parts[model][t]["sums"] for t in ts)
        den = sum(counts[t] @ parts[model][t]["weights"] for t in ts)
        return np.asarray(np.sqrt(np.asarray(num) / np.asarray(den)))

    models: dict[str, Any] = {}
    for model in parts:
        models[model] = {
            "seasons": {
                t: {"wrmse": parts[model][t]["wrmse"], **core.interval(reps(model, [t]))}
                for t in seasons
            },
            "pooled": {
                "wrmse": pooled_wrmse([parts[model][t] for t in seasons]),
                **core.interval(reps(model, seasons)),
            },
        }
    gains: dict[str, Any] = {}
    for candidate, reference in (
        ("lineup", "ridge"),
        ("lineup", "home_only"),
        ("ridge", "home_only"),
    ):
        season_gain = {
            t: {
                "gain": models[reference]["seasons"][t]["wrmse"]
                - models[candidate]["seasons"][t]["wrmse"],
                **core.interval(reps(reference, [t]) - reps(candidate, [t])),
            }
            for t in seasons
        }
        pooled = {
            "gain": models[reference]["pooled"]["wrmse"] - models[candidate]["pooled"]["wrmse"],
            **core.interval(reps(reference, seasons) - reps(candidate, seasons)),
        }
        gains[f"{candidate}_over_{reference}"] = {"seasons": season_gain, "pooled": pooled}
    return {"models": models, "gains": gains}


def run_test(
    s: data.Stints, b: data.Boxes, receipt: Mapping[str, Any], output: Path
) -> tuple[dict[str, Any], dict[str, Any]]:
    alpha, config, selection_digest = load_selection()
    parts: dict[str, dict[str, Any]] = {"ridge": {}, "lineup": {}, "home_only": {}}
    subsets: dict[str, dict[str, Any]] = {}
    diagnostics: dict[str, Any] = {}
    strengths: dict[str, Any] = {}
    models: dict[str, Any] = {}
    for target in (CALIBRATION, *data.TEST):
        fit = Fit(s, b, target)
        ridge = core.fit_ridge(fit.train, fit.k, alpha)
        seeds = fit_seeds(fit, alpha, config, ridge)
        models[target] = {
            "lineup": save_weights(output, flatten(seeds)),
            "ridge": save_weights(
                output,
                {
                    "b_own": ridge.b_own,
                    "gamma": ridge.gamma,
                    "gamma0": np.array(ridge.gamma0),
                    "home": np.array(ridge.home),
                },
            ),
        }
        strengths[target] = game_strengths(s, fit, ridge, seeds)
        if target == CALIBRATION:
            continue
        lineup_pred = core.predict_ensemble(seeds, fit.test)
        ridge_pred = core.predict_ridge(ridge, fit.test)
        parts["lineup"][target] = season_scores(fit, lineup_pred)
        parts["ridge"][target] = season_scores(fit, ridge_pred)
        parts["home_only"][target] = season_scores(fit, home_only(fit))
        # Descriptive: stints with all ten players on their own parameters versus the rest.
        all_own = (fit.test.slots >= 0).all(axis=(1, 2))
        for label, mask in (("all_ten_own", all_own), ("any_fallback", ~all_own)):
            sub = core.take_encoded(fit.test, mask)
            w = sub.w.sum()
            subsets.setdefault(label, {})[target] = {
                "stints": int(mask.sum()),
                "possession_share": float(w / fit.test.w.sum()),
                "ridge": float(np.sqrt(np.sum(sub.w * (100 * sub.y - ridge_pred[mask]) ** 2) / w)),
                "lineup": float(
                    np.sqrt(np.sum(sub.w * (100 * sub.y - lineup_pred[mask]) ** 2) / w)
                ),
            }
        inter = np.mean([100 * core.interaction(fit.test, w) for w in seeds], axis=0)
        additive_part = lineup_pred - inter
        diagnostics[target] = {
            "test_stints": len(fit.test.y),
            "test_games": len(fit.games),
            "own_players": fit.k,
            "interaction_sd_per100": float(np.sqrt(np.cov(inter, aweights=fit.test.w))),
            "additive_sd_per100": float(np.sqrt(np.cov(additive_part, aweights=fit.test.w))),
            "prediction_correlation_with_ridge": float(np.corrcoef(lineup_pred, ridge_pred)[0, 1]),
            "max_abs_interaction_per100": float(np.max(np.abs(inter))),
        }
        print(
            "test",
            target,
            parts["ridge"][target]["wrmse"],
            parts["lineup"][target]["wrmse"],
            flush=True,
        )
    block = bootstrap_block(parts, data.TEST)
    pooled = block["gains"]["lineup_over_ridge"]["pooled"]
    season_gains = [block["gains"]["lineup_over_ridge"]["seasons"][t]["gain"] for t in data.TEST]
    strengths_body = {"version": REGISTRATION, "seasons": strengths}
    strengths_digest = content_hash(strengths_body)
    results = {
        "version": REGISTRATION,
        "registration": dict(receipt),
        "selection_sha256": selection_digest,
        "selected_alpha": alpha,
        "selected_config": {"dim": config.dim, "penalty": config.penalty},
        "test_seasons": list(data.TEST),
        **block,
        "verdict": core.verdict(pooled, season_gains),
        "seasons_lineup_lower": sum(g > 0 for g in season_gains),
        "rule": "lineup better only if the pooled 95% interval of ridge WRMSE minus lineup WRMSE "
        "lies above zero and the lineup model is lower in more than half of the test seasons; "
        "ridge better by the mirror rule; otherwise no difference",
        "subsets": subsets,
        "diagnostics": diagnostics,
        "models": models,
        "game_strengths_sha256": strengths_digest,
        "versions": versions(),
    }
    results["results_sha256"] = content_hash(results)
    return results, strengths_body


def write_strengths(output: Path, body: Mapping[str, Any]) -> str:
    digest = content_hash(body)
    path = output / "game-strengths" / f"{digest}.json"
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(body, sort_keys=True, separators=(",", ":")))
    return digest


# ---------------------------------------------------------------------------------------------
# serve: the 2026-27 fit, its similarity map and the lineup tool's inputs.


def panel_lineups(s: data.Stints, season: str) -> list[list[str]]:
    """The PANEL five-man units with the most possessions in the season (usable stints)."""
    idx = np.flatnonzero(data.target_mask(s, season))
    totals: dict[tuple[str, ...], float] = {}
    for i in idx:
        poss = float(s.possessions[i].mean())
        for side in (0, 1):
            five = tuple(sorted(s.players[p] for p in s.lineups[i, side]))
            totals[five] = totals.get(five, 0.0) + poss
    ranked = sorted(totals, key=lambda f: (-totals[f], f))
    return [list(f) for f in ranked[:PANEL]]


def neighbour_sets(vectors: np.ndarray) -> list[set[int]]:
    unit = vectors / np.maximum(np.linalg.norm(vectors, axis=1, keepdims=True), 1e-12)
    similarity = unit @ unit.T
    np.fill_diagonal(similarity, -np.inf)
    order = np.argsort(-similarity, axis=1, kind="stable")[:, :NEIGHBOURS]
    return [set(row.tolist()) for row in order]


def seed_stability(seeds: Sequence[Mapping[str, np.ndarray]]) -> dict[str, Any]:
    """Share of each player's 10 nearest neighbours (cosine, embedding space) that the first
    seed's fit and each other seed's fit agree on; chance is 10 / (players - 1)."""
    base = neighbour_sets(np.asarray(seeds[0]["e_own"], dtype=np.float64))
    n = len(base)
    out = {}
    for i, w in enumerate(seeds[1:], start=1):
        other = neighbour_sets(np.asarray(w["e_own"], dtype=np.float64))
        out[str(SEEDS[i])] = float(
            np.mean([len(a & c) / NEIGHBOURS for a, c in zip(base, other, strict=True)])
        )
    return {
        "neighbours": NEIGHBOURS,
        "players": n,
        "overlap_with_seed_1401": out,
        "mean_overlap": float(np.mean(list(out.values()))),
        "chance": NEIGHBOURS / (n - 1),
    }


def similarity_map(weights: Mapping[str, np.ndarray]) -> np.ndarray:
    import umap

    reducer = umap.UMAP(n_components=2, n_jobs=1, **UMAP)
    return np.asarray(reducer.fit_transform(np.asarray(weights["e_own"], dtype=np.float64)))


def run_serve(
    s: data.Stints, b: data.Boxes, receipt: Mapping[str, Any], output: Path
) -> dict[str, Any]:
    alpha, config, selection_digest = load_selection()
    fit = Fit(s, b, data.SERVING)
    ridge = core.fit_ridge(fit.train, fit.k, alpha)
    seeds = fit_seeds(fit, alpha, config, ridge)
    window = fit.window
    possessions = data.on_court_possessions(s, window.train)
    tool = np.flatnonzero(
        (possessions > 0) & (np.isin(np.arange(len(s.players)), window.own) | window.has_box)
    )
    inputs = {
        "own_ids": np.array([s.players[p] for p in window.own]),
        "tool_ids": np.array([s.players[p] for p in tool]),
        "tool_features": window.features[tool],
        "tool_possessions": possessions[tool],
    }
    points = similarity_map(seeds[0])
    body = {
        "version": REGISTRATION,
        "registration": dict(receipt),
        "selection_sha256": selection_digest,
        "season": data.SERVING,
        "window": list(window.seasons),
        "selected_alpha": alpha,
        "selected_config": {"dim": config.dim, "penalty": config.penalty},
        "lineup_weights_sha256": save_weights(output, flatten(seeds)),
        "ridge_weights_sha256": save_weights(
            output,
            {
                "b_own": ridge.b_own,
                "gamma": ridge.gamma,
                "gamma0": np.array(ridge.gamma0),
                "home": np.array(ridge.home),
            },
        ),
        "inputs_sha256": save_weights(output, inputs),
        "panel": panel_lineups(s, data.TEST[-1]),
        "panel_season": data.TEST[-1],
        "map": {
            "method": {"name": "UMAP", **UMAP, "fitted_on": "seed 1401 player vectors"},
            "points": [
                {"player_id": s.players[p], "x": round(float(x), 6), "y": round(float(y), 6)}
                for p, (x, y) in zip(window.own, points, strict=True)
            ],
        },
        "seed_stability": seed_stability(seeds),
        "versions": versions(),
    }
    body["serve_sha256"] = content_hash(body)
    return body


def run_bootstrap(
    s: data.Stints, b: data.Boxes, output: Path, start: int, stop: int
) -> dict[str, Any]:
    alpha, config, _ = load_selection()
    fit = Fit(s, b, data.SERVING)
    games = np.unique(fit.train.game)
    position = np.searchsorted(games, fit.train.game)
    ridges, lineups = [], []
    for r in range(start, stop):
        rng = np.random.default_rng(np.random.SeedSequence([BOOTSTRAP_SEED, r]))
        multiplicity = np.bincount(rng.integers(0, len(games), len(games)), minlength=len(games))
        e = fit.train
        weighted = core.Encoded(
            e.slots, e.features, e.home, e.y, e.w * multiplicity[position], e.game
        )
        ridge = core.fit_ridge(weighted, fit.k, alpha)
        w, _ = train(weighted, fit.k, alpha, config, BOOTSTRAP_TRAIN_SEED + r, warm=ridge)
        lineups.append(w)
        ridges.append(
            {
                "b_own": ridge.b_own,
                "gamma": ridge.gamma,
                "gamma0": np.array(ridge.gamma0),
                "home": np.array(ridge.home),
            }
        )
        print("bootstrap", r, flush=True)
    return {
        "start": start,
        "stop": stop,
        "lineup": save_weights(output, flatten(lineups)),
        "ridge": save_weights(output, flatten(ridges)),
    }


def chunks_path(output: Path) -> Path:
    return output / "bootstrap-chunks.json"


def run_finish(output: Path) -> dict[str, Any]:
    serve = json.loads((output / "serve.json").read_text())
    digest = serve.pop("serve_sha256")
    if content_hash(serve) != digest:
        raise SystemExit("serve file changed")
    chunks = sorted(json.loads(chunks_path(output).read_text()).values(), key=lambda c: c["start"])
    covered = [r for c in chunks for r in range(c["start"], c["stop"])]
    if covered != list(range(BOOTSTRAP)):
        raise SystemExit(f"bootstrap refits incomplete: {len(covered)} of {BOOTSTRAP}")
    body = {**serve, "serve_sha256": digest, "bootstrap": chunks}
    body["serving_sha256"] = content_hash(body)
    return body


# ---------------------------------------------------------------------------------------------
# Commands.


def report(out: dict[str, Any], started: float) -> None:
    out["elapsed_seconds"] = round(time.monotonic() - started, 1)
    out["peak_rss_mib"] = round(resource.getrusage(resource.RUSAGE_SELF).ru_maxrss / 1024, 1)
    print(json.dumps(out, indent=1, default=str))


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "command", choices=("select", "test", "serve", "bootstrap", "finish", "reproduce")
    )
    parser.add_argument("--output", type=Path, default=data.OUTPUT)
    parser.add_argument("--part", choices=("selection", "test", "serve"))
    parser.add_argument("--start", type=int, default=0)
    parser.add_argument("--stop", type=int, default=BOOTSTRAP)
    args = parser.parse_args()
    started = time.monotonic()
    if args.command == "finish":
        body = run_finish(args.output)
        write_json(SERVING_PATH, body)
        report({"serving_sha256": body["serving_sha256"]}, started)
        return
    s, b, receipt = checked_inputs(args.output)
    if args.command == "select":
        if SELECTION_PATH.exists():
            raise SystemExit("selection has run; `reproduce --part selection` recomputes it")
        body = run_selection(s, b, receipt)
        write_json(SELECTION_PATH, body)
        report(
            {
                "selection_sha256": body["selection_sha256"],
                "alpha": body["selected_alpha"],
                "config": body["selected_config"],
            },
            started,
        )
    elif args.command == "test":
        if RESULTS_PATH.exists():
            raise SystemExit("the test seasons have been read; `reproduce --part test` recomputes")
        results, strengths = run_test(s, b, receipt, args.output)
        write_strengths(args.output, strengths)
        write_json(RESULTS_PATH, results)
        report(
            {
                "results_sha256": results["results_sha256"],
                "verdict": results["verdict"],
                "pooled": results["gains"]["lineup_over_ridge"]["pooled"],
            },
            started,
        )
    elif args.command == "serve":
        if not RESULTS_PATH.exists():
            raise SystemExit("run `test` first")
        body = run_serve(s, b, receipt, args.output)
        write_json(args.output / "serve.json", body)
        report({"serve_sha256": body["serve_sha256"], "stability": body["seed_stability"]}, started)
    elif args.command == "bootstrap":
        chunk = run_bootstrap(s, b, args.output, args.start, args.stop)
        path = chunks_path(args.output)
        existing = json.loads(path.read_text()) if path.exists() else {}
        existing[f"{args.start}-{args.stop}"] = chunk
        write_json(path, existing)
        report(dict(chunk), started)
    else:
        if args.part == "selection":
            again = run_selection(s, b, receipt)["selection_sha256"]
            frozen = json.loads(SELECTION_PATH.read_text())["selection_sha256"]
        elif args.part == "test":
            again = run_test(s, b, receipt, args.output)[0]["results_sha256"]
            frozen = json.loads(RESULTS_PATH.read_text())["results_sha256"]
        else:
            again = run_serve(s, b, receipt, args.output)["serve_sha256"]
            frozen = json.loads(SERVING_PATH.read_text())["serve_sha256"]
        report(
            {
                "part": args.part,
                "frozen": frozen,
                "recomputed": again,
                "identical": frozen == again,
            },
            started,
        )


if __name__ == "__main__":
    main()
