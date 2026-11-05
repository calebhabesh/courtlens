"""Research → Shot Quality: served results of courtlens-expected-shot-v2 (R05).

Every number comes from the frozen results file the registered runner wrote. Nothing is refitted
or recomputed here except ranking and filtering of served rows. Player-seasons under the minimum
keep their reason and never receive a shot-making value.
"""

from __future__ import annotations

import json
from functools import lru_cache
from pathlib import Path
from typing import Any

from courtlens.domain.teams import get_team_info

RESULTS_PATH = Path("evaluation/research/frozen/courtlens-expected-shot-v2.json")
LATEST_SEASON = "2025-26"
SORTS = ("shot_making", "xpps", "pps", "fga")
DEFAULT_MIN_FGA = 300
EXAMPLE_RULE = (
    "Default player: the player with the most field-goal attempts in 2025-26 (a selection rule "
    "to open the page on a high-volume shooter, not a judgement of the player)."
)
MODEL_LABELS = {
    "baseline": "League zone and distance rates (baseline)",
    "reference": "Zone and shot-type rates (reference, no gate)",
    "logistic_spline": "Logistic regression, distance splines",
    "lightgbm_31": "LightGBM, 31 leaves",
    "lightgbm_127": "LightGBM, 127 leaves",
}
REASONS = {
    "small_sample": "Fewer than 300 field-goal attempts in the season.",
}
OUTCOMES = {
    "accepted": "Accepted: the selected model passed the selection gate and all three test gates.",
    "selection_failed_negative_result": (
        "Negative result: no candidate improved the 2022-23 Brier score by 1% over the baseline. "
        "Player shot-making uses the calibrated baseline."
    ),
    "test_failed_negative_result": (
        "Negative result: the selected model passed selection but failed a test gate. Player "
        "shot-making uses the calibrated baseline."
    ),
}
DEFINITIONS = {
    "target": (
        "Each field-goal attempt is made (1) or missed (0). Expected points = shot value (2 or 3) "
        "x make probability. Field-goal points only: free throws are not modelled, because a "
        "fouled missed shot is not a field-goal attempt and is absent from the shot data."
    ),
    "features": (
        "Before the shot only: location (x, y, distance, zone), shot value, the NBA's shot-type "
        "label (driving, pull-up, step-back, floating, dunk, putback and so on), period, seconds "
        "left in the period, score margin, seconds since the team gained possession (a transition "
        "proxy) and whether the possession had an offensive rebound. Never the shooter's identity "
        "and never whether the shot was assisted (the play-by-play records assists only on makes)."
    ),
    "xpps": (
        "xPPS: expected points per shot, the mean expected value of the player's attempts. It "
        "describes the shots a player takes, not whether taking them is good."
    ),
    "pps": "PPS: actual field-goal points per shot.",
    "shot_making": (
        "Shot-making: 100 x ((PPS - xPPS) - league term), points per 100 shots above or below "
        "the expected value of the same shots, relative to the league in the same season. The "
        "league term is the league's PPS - xPPS in that season."
    ),
    "interval": (
        "Shot-making intervals: 95% bootstrap over the player's games (2,000 replicates). They "
        "show shot-outcome noise for a fixed model, not model error. Overlapping intervals do not "
        "rank two players."
    ),
    "metrics": (
        "Brier score: mean squared error of the make probability. Log loss: mean negative log "
        "likelihood. Lower is better for both. ECE: mean absolute gap between predicted and "
        "observed make rates over ten equal-width bins. Intervals are 95% game-bootstrap "
        "intervals (2,000 replicates)."
    ),
}
CREDIT = (
    "ShotQuality and the shot-quality / shot-making split are ShotQuality's and Databallr's "
    "concepts (databallr.com ShotQuality RAPM page, the design reference). CourtLens does not use "
    "the paid ShotQuality feed, which reads player tracking: this model reads free NBA shot and "
    "play-by-play data (via shufinskiy/nba_data), and its numbers are its own."
)
REFERENCE_NOTE = (
    "Design reference: a saved copy of Databallr's ShotQuality RAPM page (header, filters, ranked "
    "table in points per 100 shots, how-to-read and methodology panels). That page shows a RAPM "
    "decomposition (oTS, oSQ, oMake, oFT), which is this page's Decomposition tab. It has no "
    "model card, calibration curve or per-player shot-making view, so those parts of this page "
    "have no reference."
)


@lru_cache(maxsize=2)
def _load(path: str, mtime: float) -> dict[str, Any]:
    data: dict[str, Any] = json.loads(Path(path).read_text())
    return data


def load_results(path: Path = RESULTS_PATH) -> dict[str, Any] | None:
    if not path.exists():
        return None
    return _load(str(path), path.stat().st_mtime)


def _tricode(team_id: str) -> str | None:
    info = get_team_info(team_id)
    return info.tricode if info else None


def _metrics(block: dict[str, Any]) -> dict[str, Any]:
    return {
        "attempts": block["attempts"],
        "games": block["games"],
        "models": block["models"],
        "versus_baseline": block["versus_baseline"],
    }


def summary() -> dict[str, Any] | None:
    results = load_results()
    if results is None:
        return None
    choice = results["choice"]
    test = results["test"]
    players = results["players"]
    league = {
        season: {k: v for k, v in block.items() if k != "players"}
        for season, block in players["seasons"].items()
    }
    data = {
        season: {
            "rows": r["rows"],
            "games": r["games"],
            "join_rate": r["join_rate"],
            "join": r["join"],
            "possession_known_rate": r["possession_known_rate"],
            "possession": r["possession"],
            "and_ones": r["and_ones"],
            "assist_in_description": r["assist_in_description"],
        }
        for season, r in results["data"].items()
    }
    return {
        "registration": results["registration"],
        "results_sha256": results["results_sha256"],
        "outcome": results["outcome"],
        "outcome_text": OUTCOMES[results["outcome"]],
        "serving_model": results["serving_model"],
        "model_labels": MODEL_LABELS,
        "data": data,
        "selection": {
            "season": choice["season"],
            "chosen": choice["chosen"],
            "relative_brier": choice["relative_brier"],
            "gate": choice["gate"],
            "passed": choice["passed"],
            "metrics": _metrics(choice["metrics"]),
            "fits": choice["fits"],
            "training_attempts": choice["training_attempts"],
            "vocabulary_sizes": choice["vocabulary_sizes"],
        },
        "calibration": {
            "season": results["calibration"]["season"],
            "platt": results["calibration"]["platt"],
        },
        "test": {
            "seasons": test["seasons"],
            "accepted": test["accepted"],
            "gates": test["gates"],
            "failed_gates": test["failed_gates"],
            "pooled": _metrics(test["pooled"]),
            "uncalibrated": _metrics(test["uncalibrated"]),
            "by_season": {s: _metrics(b) for s, b in test["by_season"].items()},
            "curves": test["curves"],
            "slices": test["slices"],
        },
        "players": {
            "model": players["model"],
            "min_attempts": players["min_attempts"],
            "persistence": players["persistence"],
            "league": league,
            "seasons": sorted(players["seasons"]),
        },
        "definitions": DEFINITIONS,
        "reasons": REASONS,
        "credit": CREDIT,
        "reference_note": REFERENCE_NOTE,
        "example_rule": EXAMPLE_RULE,
    }


def _row(pid: str, value: dict[str, Any]) -> dict[str, Any]:
    teams = [{"team_id": t, "tricode": _tricode(t)} for t in value["teams"]]
    return {
        "player_id": pid,
        "status": value["status"],
        "reason": REASONS.get(value["status"]),
        "fga": value["fga"],
        "games": value.get("games"),
        "pps": value["pps"],
        "xpps": value["xpps"],
        "fg_pct": value["fg_pct"],
        "three_share": value["three_share"],
        "shot_making": value["shot_making"],
        "interval": value["interval"],
        "team_id": value["team_id"],
        "tricode": _tricode(value["team_id"]),
        "teams": teams,
    }


def leaderboard(
    season: str, sort: str = "shot_making", team: str | None = None, min_fga: int = DEFAULT_MIN_FGA
) -> dict[str, Any] | None:
    results = load_results()
    if results is None:
        return None
    block = results["players"]["seasons"].get(season)
    if block is None:
        return {
            "status": "unknown",
            "season": season,
            "reason": "Shot-making is served for 2022-23 to 2025-26, the seasons no model was "
            "trained on.",
            "seasons": sorted(results["players"]["seasons"]),
        }
    minimum = max(min_fga, int(results["players"]["min_attempts"]))
    rows, unknown = [], []
    for pid, value in block["players"].items():
        row = _row(pid, value)
        if team and team not in {t["tricode"] for t in row["teams"]} | set(value["teams"]):
            continue
        if value["status"] == "served" and value["fga"] >= minimum:
            rows.append(row)
        elif value["status"] != "served":
            unknown.append(row)
    key = sort if sort in SORTS else "shot_making"
    rows.sort(key=lambda r: (-r[key], r["player_id"]))
    unknown.sort(key=lambda r: (-r["fga"], r["player_id"]))
    teams = sorted(
        {t for v in block["players"].values() for t in v["teams"]},
        key=lambda t: _tricode(t) or t,
    )
    return {
        "status": "available",
        "season": season,
        "sort": key,
        "team": team,
        "min_fga": minimum,
        "rows": rows,
        "unknown": unknown,
        "league": {k: v for k, v in block.items() if k != "players"},
        "teams": [{"team_id": t, "tricode": _tricode(t)} for t in teams],
        "seasons": sorted(results["players"]["seasons"]),
        "model": results["players"]["model"],
        "results_sha256": results["results_sha256"],
    }


def default_player() -> str | None:
    """The player with the most field-goal attempts in 2025-26."""
    results = load_results()
    if results is None:
        return None
    rows = results["players"]["seasons"][LATEST_SEASON]["players"]
    if not rows:
        return None
    pid: str = min(rows, key=lambda p: (-rows[p]["fga"], p))
    return pid


def player(player_id: str) -> dict[str, Any] | None:
    results = load_results()
    if results is None:
        return None
    history = []
    for season, block in sorted(results["players"]["seasons"].items()):
        value = block["players"].get(player_id)
        if value is not None:
            history.append({"season": season, **_row(player_id, value)})
    if not history:
        return {"status": "unknown", "player_id": player_id, "reason": "No attempts served."}
    return {
        "status": "available",
        "player_id": player_id,
        "seasons": history,
        "model": results["players"]["model"],
        "results_sha256": results["results_sha256"],
    }
