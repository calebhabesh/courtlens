"""The Win Probability page's v4 sections (W5): calibration on the head-to-head games, the worked
example chosen by rule, the do-no-harm check, and the non-linear own-read diagnostic. Read-only:
nothing here writes."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import numpy as np

from courtlens.domain.win_probability_scorecard import calibration_curve, calibration_error
from courtlens.services import win_probability_breakdown as breakdown_service
from courtlens.services import win_probability_head_to_head as head_to_head

CHECK_PATH = Path("evaluation/research/derived/courtlens-win-probability-v4-check.json")
# Written once, by hand, when the rule first finds a game, so the example never changes after.
EXAMPLE_PATH = Path("evaluation/research/derived/courtlens-win-probability-v4-worked-example.json")
# courtlens-pregame-nonlinear-v1: trees on the own read's inputs against the frozen linear fit.
NONLINEAR_PATH = Path("evaluation/research/derived/courtlens-pregame-nonlinear-v1.json")
EXAMPLE_COST = 1.0
EXAMPLE_RULE = (
    "The first head-to-head game in which a player ESPN listed Out cost at least 1.0 point, "
    "whether or not the call was right."
)


def calibration(games: list[dict[str, Any]]) -> dict[str, Any] | None:
    """Both models' calibration over every scored state of the head-to-head games."""
    if not games:
        return None
    out: dict[str, Any] = {"games": len(games)}
    for name in (head_to_head.ORIGINAL, head_to_head.MARKET):
        bins = np.array([g[name]["bins"] for g in games]).sum(axis=0)
        out[name] = {"curve": calibration_curve(bins), "calibration_error": calibration_error(bins)}
    return out


def _qualifies(why: dict[str, Any]) -> bool:
    out = why.get("out") or {}
    costs = [p.get("cost") for side in ("home", "away") for p in out.get(side) or []]
    return any(c is not None and c >= EXAMPLE_COST for c in costs)


def worked_example(games: list[dict[str, Any]]) -> dict[str, Any]:
    """The stored example, else the first head-to-head game the rule picks, else none yet."""
    if EXAMPLE_PATH.exists():
        return {"rule": EXAMPLE_RULE, "stored": True, **json.loads(EXAMPLE_PATH.read_text())}
    for game in sorted(games, key=lambda r: (r["tip_off"], r["game_id"])):
        try:
            why = breakdown_service.breakdown(game["game_id"], game["date"])
        except (OSError, ValueError, KeyError):
            continue
        if why and _qualifies(why):
            keys = ("game_id", "date", "home", "away", "home_score", "away_score", "calls")
            return {
                "rule": EXAMPLE_RULE,
                "stored": False,
                "game": {k: game[k] for k in keys},
                "why": why,
            }
    return {"rule": EXAMPLE_RULE, "stored": False, "game": None, "why": None}


def do_no_harm() -> dict[str, Any] | None:
    try:
        body: dict[str, Any] = json.loads(CHECK_PATH.read_text())
    except (OSError, ValueError):
        return None
    gates = body["gates"]
    return {
        "games": body["games"],
        "seasons": body["check_seasons"],
        "log_loss_gain": gates["D1"]["log_loss_improvement_vs_v2_frozen"],
        "squared_error_gain": gates["D2"]["squared_error_improvement_vs_own"],
        "calibration_error": gates["A2"]["ece"],
        "calibration_limit": gates["A2"]["limit"],
        "passed": all(g["passed"] for g in gates.values()),
    }


def pregame_nonlinear() -> dict[str, Any] | None:
    """The diagnostic's pooled result: each candidate against the frozen linear forecast."""
    try:
        body: dict[str, Any] = json.loads(NONLINEAR_PATH.read_text())
    except (OSError, ValueError):
        return None
    pooled = body["evaluation"]["pooled"]
    return {
        "registration": body["registration"]["identity"],
        "registration_sha256": body["registration"]["content_sha256"],
        "seasons": body["evaluation"]["seasons"],
        "games": pooled["linear"]["games"],
        "train_games": body["reference_check"]["train_games"],
        "inputs": len(body["fitted"]["trees"]["gain_share"]),
        "linear": pooled["linear"],
        "candidates": {name: pooled[name] for name in body["candidates"]},
        "correction_points": body["fitted"]["linear_plus_trees"]["correction_points"],
    }


def page_sections() -> dict[str, Any]:
    games = head_to_head.rows()
    return {
        "head_to_head_calibration": calibration(games),
        "worked_example": worked_example(games),
        "do_no_harm": do_no_harm(),
        "pregame_nonlinear": pregame_nonlinear(),
    }
