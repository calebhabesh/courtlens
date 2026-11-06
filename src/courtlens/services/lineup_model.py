"""Research → Lineup Model (`courtlens-lineup-model-v1`, R14).

Reads hashed files only: the selection, test results, serving manifest and facts of
`courtlens-lineup-model-v1`, and the game backtest of `courtlens-lineup-backtest-v1`, each refused
if its recorded hash no longer matches. The lineup tool runs the numpy forward pass
(`lineup_model_core`) on the 2026-27 fit's weights, which live in git-ignored
`data/derived/lineup-model-v1/models`; where they are absent (the hosted demo), the tool reports
that state instead of a number.
"""

from __future__ import annotations

import json
from collections.abc import Mapping, Sequence
from pathlib import Path
from typing import Any

import numpy as np

from courtlens.evaluation import lineup_model_core as core
from courtlens.evaluation.lineup_model_runner import (
    RESULTS_PATH,
    SELECTION_PATH,
    SERVING_PATH,
    TOOL_INTERVAL,
    load_weights,
    unflatten,
)
from courtlens.ingestion.native_reconstruction import content_hash

OUTPUT = Path("data/derived/lineup-model-v1")
FACTS_PATH = Path("evaluation/research/frozen/courtlens-lineup-model-v1-facts.json")
BACKTEST_PATH = Path("evaluation/research/frozen/courtlens-lineup-backtest-v1.json")
SCORES_PATH = Path("evaluation/research/frozen/courtlens-lineup-model-v1-scores.json")
_cache: dict[str, Any] = {}

CREDITS = [
    {
        "what": "Adjusted plus-minus",
        "who": "Dan Rosenbaum (2004), 'Measuring How NBA Players Help Their Teams Win'",
    },
    {
        "what": "Regularized (ridge) adjusted plus-minus",
        "who": "Joe Sill (2010), 'Improved NBA Adjusted +/- Using Regularization and "
        "Out-of-Sample Testing', MIT Sloan Sports Analytics Conference",
    },
    {
        "what": "UMAP",
        "who": "Leland McInnes, John Healy and James Melville (2018), 'UMAP: Uniform Manifold "
        "Approximation and Projection for Dimension Reduction'; the umap-learn library",
    },
    {
        "what": "Self-attention",
        "who": "Vaswani et al. (2017), 'Attention Is All You Need'",
    },
    {
        "what": "Stints and possessions",
        "who": "CourtLens's R01 reconstruction of NBA play-by-play (shufinskiy/nba_data "
        "archives, pbpstats checks)",
    },
]

CAVEATS = [
    "Stint margins are very noisy: every model, ridge included, misses a stint's margin by 92 to "
    "96 points per 100 possessions on the test seasons. Differences between models are fractions "
    "of a point.",
    "The verdict is the registered rule's, on three held-out seasons. A gain whose interval "
    "includes zero is not a difference.",
    "Each fit is made at the start of a season from the three seasons before it and is not "
    "updated during the season.",
    "Players with fewer than 1,000 possessions in the window, and newcomers, read a box-score "
    "fallback that knows nothing about draft position or college.",
    "The lineup tool predicts a five against a fixed panel of 2025-26's most-used lineups at a "
    "neutral site. It is a model output, not a forecast of how that five will play.",
    "The similarity map is one fit's player vectors squeezed into two dimensions by UMAP. Its "
    "axes, directions and the distances between groups mean nothing; it is not a style or "
    "position map. In this fit the seeds agree on nearest neighbours no more often than chance, "
    "so the map shows no stable structure.",
    "The selected lineup model's interaction is almost zero (its predictions correlate with "
    "ridge's above 0.99999999), so the lineup tool's two numbers are nearly identical.",
    "The per-model error table was restored from the saved test weights after a defect in the "
    "frozen runner overwrote it; the restored numbers reproduce every frozen gain exactly.",
]


def _checked(path: Path, key: str) -> dict[str, Any]:
    stamp = path.stat().st_mtime_ns
    cached = _cache.get(str(path))
    if cached and cached[0] == stamp:
        return dict(cached[1])
    body: dict[str, Any] = json.loads(path.read_text())
    if content_hash({k: v for k, v in body.items() if k != key}) != body.get(key):
        raise ValueError(f"{path.name} changed after it was frozen")
    _cache[str(path)] = (stamp, body)
    return dict(body)


def results() -> dict[str, Any]:
    return _checked(RESULTS_PATH, "results_sha256")


def selection() -> dict[str, Any]:
    return _checked(SELECTION_PATH, "selection_sha256")


def serving() -> dict[str, Any]:
    return _checked(SERVING_PATH, "serving_sha256")


def scores() -> dict[str, Any]:
    """Per-model scores restored from the saved weights (the results file lost them; see
    `evaluation/lineup_model_scores.py`). Refused unless they belong to these results."""
    body = _checked(SCORES_PATH, "scores_sha256")
    if body["results_sha256"] != results()["results_sha256"]:
        raise ValueError("scores belong to other results")
    return body


def facts() -> dict[str, Any]:
    return _checked(FACTS_PATH, "facts_sha256")


def backtest() -> dict[str, Any]:
    return _checked(BACKTEST_PATH, "results_sha256")


def _identity(pid: str, people: Mapping[str, Any]) -> dict[str, Any]:
    row = people.get(pid, {})
    return {
        "player_id": pid,
        "name": row.get("name"),
        "photo_season": row.get("season"),
        "team_id": row.get("team_id"),
        "tricode": row.get("tricode"),
        "status": row.get("status"),
        "window_possessions": row.get("window_possessions"),
    }


def _backtest_summary(body: Mapping[str, Any]) -> dict[str, Any]:
    pairs = [
        p
        for p in body["pairs"]
        if "lineup_model" in (p["candidate"], p["reference"])
        or "lineup_ridge" in (p["candidate"], p["reference"])
    ]
    return {
        "version": body["version"],
        "results_sha256": body["results_sha256"],
        "registration_sha256": body["registration"]["content_sha256"],
        "games_per_season": body["games_per_season"],
        "games_without_stints": body["games_without_stints"],
        "candidates": {
            name: {k: v for k, v in c.items() if k != "calibration_curve"}
            for name, c in body["candidates"].items()
        },
        "pairs": pairs,
        "verdict": body["verdict"],
    }


def page() -> dict[str, Any]:
    """Everything the page shows except the tool's predictions."""
    res, sel, serve, fx = results(), selection(), serving(), facts()
    res = {**res, "models": scores()["models"], "weights": res["models"]}
    people = fx["players"]
    try:
        bt: dict[str, Any] | None = _backtest_summary(backtest())
    except (OSError, ValueError):
        bt = None
    return {
        "results": {
            k: res[k]
            for k in (
                "version",
                "results_sha256",
                "selection_sha256",
                "selected_alpha",
                "selected_config",
                "test_seasons",
                "models",
                "gains",
                "verdict",
                "seasons_lineup_lower",
                "rule",
                "subsets",
                "diagnostics",
                "versions",
                "game_strengths_sha256",
            )
        },
        "registration": {
            "identity": res["registration"]["identity"],
            "content_sha256": res["registration"]["content_sha256"],
            "registered_on": res["registration"]["registered_on"],
            "parameters": {
                k: res["registration"]["parameters"][k]
                for k in (
                    "window_seasons",
                    "selection_seasons",
                    "test_seasons",
                    "min_possessions",
                    "box_features",
                    "seeds",
                    "heads",
                    "epochs",
                    "rounds",
                    "replicates",
                    "level",
                    "bootstrap_refits",
                    "panel_lineups",
                    "umap",
                    "package_versions",
                    "dataset_sha256",
                )
            },
        },
        "selection": {
            k: sel[k]
            for k in (
                "seasons",
                "ridge_alpha_grid",
                "selected_alpha",
                "lineup_grid",
                "selected_config",
                "rule",
                "selection_sha256",
            )
        },
        "coverage": {
            "seasons": fx["seasons"],
            "totals": fx["totals"],
            "cold_start": fx["cold_start"],
            "threshold": fx["threshold"],
            "excluded_games": fx["excluded_games"],
            "leakage_plan": fx["leakage_plan"],
        },
        "map": {
            "method": serve["map"]["method"],
            "window": serve["window"],
            "seed_stability": serve["seed_stability"],
            "points": [
                {**_identity(p["player_id"], people), "x": p["x"], "y": p["y"]}
                for p in serve["map"]["points"]
            ],
        },
        "serving": {
            "season": serve["season"],
            "window": serve["window"],
            "panel_season": serve["panel_season"],
            "panel_size": len(serve["panel"]),
            # The tool's first five, by a fixed rule: 2025-26's most-used lineup.
            "default_five": list(serve["panel"][0]),
            "serving_sha256": serve["serving_sha256"],
            "bootstrap_refits": sum(c["stop"] - c["start"] for c in serve["bootstrap"]),
            "interval_percentiles": list(TOOL_INTERVAL),
            "tool_available": tool_available(),
        },
        "backtest": bt,
        "credits": CREDITS,
        "caveats": CAVEATS,
    }


# ---------------------------------------------------------------------------------------------
# The lineup tool.


def tool_available() -> bool:
    try:
        _models()
    except (OSError, ValueError, KeyError):
        return False
    return True


def _models() -> dict[str, Any]:
    serve = serving()
    key = serve["serving_sha256"]
    if _cache.get("models_key") == key:
        return dict(_cache["models"])
    inputs = load_weights(OUTPUT, serve["inputs_sha256"])
    lineup = unflatten(load_weights(OUTPUT, serve["lineup_weights_sha256"]))
    ridge = load_weights(OUTPUT, serve["ridge_weights_sha256"])
    boot_lineup: list[dict[str, np.ndarray]] = []
    boot_ridge: list[dict[str, np.ndarray]] = []
    for chunk in serve["bootstrap"]:
        boot_lineup += unflatten(load_weights(OUTPUT, chunk["lineup"]))
        boot_ridge += unflatten(load_weights(OUTPUT, chunk["ridge"]))
    own = [str(p) for p in inputs["own_ids"]]
    tool = [str(p) for p in inputs["tool_ids"]]
    models = {
        "own": {p: i for i, p in enumerate(own)},
        "tool": {p: i for i, p in enumerate(tool)},
        "features": np.asarray(inputs["tool_features"], dtype=np.float64),
        "lineup": lineup,
        "ridge": ridge,
        "boot_lineup": boot_lineup,
        "boot_ridge": boot_ridge,
        "panel": [list(p) for p in serve["panel"]],
    }
    _cache.update(models=models, models_key=key)
    return dict(models)


def _encode(models: Mapping[str, Any], rows: Sequence[tuple[Sequence[str], Sequence[str]]]) -> Any:
    n = len(rows)
    f = models["features"].shape[1]
    slots = np.full((n, 2, 5), -1, dtype=np.int64)
    features = np.zeros((n, 2, 5, f))
    for r, sides in enumerate(rows):
        for side, five in enumerate(sides):
            for i, pid in enumerate(five):
                slot = models["own"].get(pid, -1)
                slots[r, side, i] = slot
                if slot < 0 and pid in models["tool"]:
                    features[r, side, i] = models["features"][models["tool"][pid]]
    return core.Encoded(slots, features, np.zeros(n), np.zeros(n), np.ones(n), np.zeros(n, int))


def _ridge_model(w: Mapping[str, np.ndarray]) -> core.Ridge:
    return core.Ridge(0.0, w["b_own"], w["gamma"], float(w["gamma0"]), float(w["home"]))


def players() -> dict[str, Any]:
    """Who the tool accepts: own parameters or window box minutes, with their ratings."""
    fx = facts()
    people = fx["players"]
    if not tool_available():
        return {"state": "unavailable", "players": []}
    models = _models()
    ids = sorted(models["tool"])
    e = _encode(models, [((pid, pid, pid, pid, pid), ("", "", "", "", "")) for pid in ids])
    ridge = _ridge_model(models["ridge"])
    ridge_b = core.additive(e, ridge.b_own, ridge.gamma, ridge.gamma0)[:, 0, 0]
    lineup_b = np.mean(
        [
            core.additive(e, w["b_own"], w["gamma"], float(w["gamma0"]))[:, 0, 0]
            for w in models["lineup"]
        ],
        axis=0,
    )
    rows = [
        {
            **_identity(pid, people),
            "ridge_rating": round(float(100 * ridge_b[i]), 4),
            "lineup_additive_rating": round(float(100 * lineup_b[i]), 4),
        }
        for i, pid in enumerate(ids)
    ]
    rows.sort(key=lambda r: (-(r["window_possessions"] or 0), r["player_id"]))
    return {"state": "ready", "window": serving()["window"], "players": rows}


def _net(models: Mapping[str, Any], five: Sequence[str], panel: Sequence[Sequence[str]]) -> Any:
    rows = [(five, opp) for opp in panel]
    e = _encode(models, rows)

    def lineup_nets(seeds: Sequence[Mapping[str, np.ndarray]]) -> np.ndarray:
        return np.array([core.predict_lineup(w, e).mean() for w in seeds])

    def ridge_nets(ws: Sequence[Mapping[str, np.ndarray]]) -> np.ndarray:
        return np.array([core.predict_ridge(_ridge_model(w), e).mean() for w in ws])

    point_seeds = lineup_nets(models["lineup"])
    additive_seeds = []
    for w in models["lineup"]:
        b = core.additive(e, w["b_own"], w["gamma"], float(w["gamma0"]))
        additive_seeds.append(100 * (b[:, 0].sum(axis=1) - b[:, 1].sum(axis=1)).mean())
    lo, hi = TOOL_INTERVAL
    boot_l = lineup_nets(models["boot_lineup"])
    boot_r = ridge_nets(models["boot_ridge"])
    point = float(point_seeds.mean())
    additive = float(np.mean(additive_seeds))
    return {
        "lineup_model": {
            "net": point,
            "low": float(np.percentile(boot_l, lo)),
            "high": float(np.percentile(boot_l, hi)),
            "additive": additive,
            "interaction": point - additive,
            "seeds": [float(v) for v in point_seeds],
        },
        "ridge": {
            "net": float(ridge_nets([models["ridge"]])[0]),
            "low": float(np.percentile(boot_r, lo)),
            "high": float(np.percentile(boot_r, hi)),
        },
        "refits": len(boot_l),
    }


def fit(player_ids: Sequence[str]) -> dict[str, Any]:
    """Predicted net rating per 100 of a five against the panel; raises ValueError or KeyError
    for bad input (the router maps them to 422 and 404)."""
    ids = [p.strip() for p in player_ids if p.strip()]
    if len(ids) != 5:
        raise ValueError("choose exactly five players")
    if len(set(ids)) != 5:
        raise ValueError("a player appears twice")
    fx = facts()
    if not tool_available():
        return {"state": "unavailable", "reason": "model weights are not on this server"}
    models = _models()
    unknown = [p for p in ids if p not in models["tool"]]
    if unknown:
        raise KeyError(",".join(unknown))
    chosen = set(ids)
    panel = [p for p in models["panel"] if not chosen & set(p)]
    if not panel:
        return {"state": "no_opponents", "players": [_identity(p, fx["players"]) for p in ids]}
    return {
        "state": "ready",
        "players": [_identity(p, fx["players"]) for p in ids],
        "opponents": len(panel),
        "panel_size": len(models["panel"]),
        **_net(models, ids, panel),
    }
