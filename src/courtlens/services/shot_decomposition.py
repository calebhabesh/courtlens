"""Research → Shot Quality → Decomposition: served results of courtlens-shot-decomposition-v1 (R06).

Every number comes from the frozen results file. Only ranking and filtering happen here. A player
under the registered minimum keeps a reason and never receives a value.
"""

from __future__ import annotations

import json
from functools import lru_cache
from pathlib import Path
from typing import Any

from courtlens.domain.teams import get_team_info

RESULTS_PATH = Path("evaluation/research/frozen/courtlens-shot-decomposition-v1.json")
LATEST_SEASON = "2025-26"
SIDES = ("offense", "defense", "combined")
SORTS = ("ts", "sq", "make", "ft", "shots")
DEFAULT_MIN_SHOTS = 1000
REASON = "Fewer than 20 games or 1,000 shots on either side in the season."
LABELS = {
    "offense": {"ts": "oTS", "sq": "oSQ", "make": "oMake", "ft": "oFT"},
    "defense": {"ts": "dTS", "sq": "dSQ", "make": "dContest", "ft": "dFT"},
    "combined": {"ts": "TS", "sq": "SQ", "make": "Make", "ft": "FT"},
}
DEFINITIONS = {
    "reading": (
        "Points per 100 shots against the average player, adjusted for who else was on the floor. "
        "Zero is average. Positive is always good: defence signs are flipped, so +1.5 dTS means "
        "opponents shot about 1.5 points worse per 100 shots with this player on the floor."
    ),
    "shot": (
        "A shot is a field-goal attempt or a 2-shot or 3-shot free-throw trip. And-ones, "
        "technicals, flagrants, clear-path and other one-shot trips add free-throw value but no "
        "shot, because they replaced no possession. Possessions with no attempt carry no weight."
    ),
    "ts": (
        "TS: actual field-goal points, and each shooter's expected free-throw value. "
        "TS = SQ + Make + FT."
    ),
    "sq": (
        "SQ: the quality of the looks. CourtLens' expected field-goal points before the shot, "
        "plus avg_pts / 2 or avg_pts / 3 per free throw of a 2-shot or 3-shot trip (the value of "
        "the possession the foul replaced)."
    ),
    "make": (
        "Make (dContest on defence): actual field-goal points minus expected. It holds everything "
        "the model cannot see, including how well the shot was contested."
    ),
    "ft": (
        "FT: expected free-throw value above the foul-type baseline. It rewards getting to the "
        "line and shooting well there. Actual free-throw results are not used: the expected value "
        "comes from the shooter's earlier attempts and R03's league prior."
    ),
    "interval": (
        "80% game-bootstrap interval (200 replicates) at a fixed penalty and a fixed expected-shot "
        "model, so it understates total uncertainty. Overlapping intervals do not rank two players."
    ),
    "scale": (
        "One-season fits at alpha 3000 with no box prior and no time decay, so values are heavily "
        "shrunk and are not comparable with Databallr's three-year numbers."
    ),
}
METHOD = (
    "Four parallel ridge regressions on the same R01 possessions, the same lineups and the same "
    "penalty, each scoring the attempts differently (Databallr's method).",
    "TS = SQ + Make + FT holds on every attempt by construction. One penalty on one design makes "
    "ridge linear in the target, so the player coefficients add up as well, and the second-stage "
    "regression recovers coefficients of 1 with R² of 1. That check confirms the arithmetic; it "
    "says nothing about whether the split is right.",
    "Expected field-goal points come from the accepted R05 model, LightGBM with 31 leaves, "
    "calibrated on 2023-24 and never refitted. It has no defender or tracking data. A per-season "
    "additive shift makes Make average zero, as Databallr does.",
    "Served for 2022-23 to 2025-26, the seasons the R05 model was not trained on. 2022-23 chose "
    "the model and 2023-24 fitted its calibration.",
    "Foul-type baselines per free throw: 2-shot avg_pts / 2, 3-shot avg_pts / 3, and every other "
    "trip 0. avg_pts is the season's actual field-goal points per attempt.",
    "Expected FT%: R03's league prior plus the shooter's attempts on earlier dates in this season "
    "and the three before it. Nothing at or after the trip is read.",
)
REFERENCE_NOTE = (
    "Design reference: a saved copy of Databallr's ShotQuality RAPM page. Reproduced: the offence, "
    "defence and combined views, the oTS / oSQ / oMake / oFT columns, the minimum and team "
    "filters, the CSV, How to Read, the glossary, the four regressions, the foul baselines and the "
    "second-stage check. Added: intervals and the persistence check. Different: one-season fits, "
    "not three years with time decay; a model without tracking data, not the ShotQuality feed. "
    "Not reproduced: Databallr's table values."
)
CREDIT = (
    "The four regressions, foul-type baselines and second-stage check are Databallr's method "
    "(databallr.com ShotQuality RAPM page); the expected-value concept is ShotQuality's. CourtLens "
    "does not use the paid ShotQuality feed, and its numbers are its own. Data: NBA Stats via "
    "shufinskiy/nba_data."
)


@lru_cache(maxsize=2)
def _load(path: str, mtime: float) -> dict[str, Any]:
    return dict(json.loads(Path(path).read_text()))


def load_results(path: Path = RESULTS_PATH) -> dict[str, Any] | None:
    if not path.exists():
        return None
    return _load(str(path), path.stat().st_mtime)


def _tricode(team_id: str | None) -> str | None:
    if not team_id:
        return None
    info = get_team_info(team_id)
    return info.tricode if info else None


def summary() -> dict[str, Any] | None:
    results = load_results()
    if results is None:
        return None
    registration = results["registration"]
    return {
        "registration": {
            k: registration[k] for k in ("identity", "registered_on", "content_sha256")
        },
        "results_sha256": results["results_sha256"],
        "seasons": {
            season: {k: v for k, v in block.items() if k != "players"}
            for season, block in results["seasons"].items()
        },
        "data": {
            season: {
                k: block[k]
                for k in ("rows", "kinds", "possessions", "join", "r05_shots", "free_throws")
            }
            for season, block in results["data"].items()
        },
        "persistence": results["persistence"],
        "labels": LABELS,
        "definitions": DEFINITIONS,
        "method": list(METHOD),
        "reference_note": REFERENCE_NOTE,
        "credit": CREDIT,
    }


def _shots(value: dict[str, Any], side: str) -> float:
    if side == "offense":
        return float(value["offense_shots"])
    if side == "defense":
        return float(value["defense_shots"])
    return min(float(value["offense_shots"]), float(value["defense_shots"]))


def _base(value: dict[str, Any], side: str) -> dict[str, Any]:
    return {
        "player_id": value["player_id"],
        "team_id": value["team_id"],
        "tricode": _tricode(value["team_id"]),
        "games": value["games"],
        "offense_shots": value["offense_shots"],
        "defense_shots": value["defense_shots"],
        "shots": _shots(value, side),
        "status": value["status"],
    }


def board(
    season: str,
    side: str = "offense",
    sort: str = "ts",
    team: str | None = None,
    min_shots: int = DEFAULT_MIN_SHOTS,
) -> dict[str, Any] | None:
    results = load_results()
    if results is None:
        return None
    block = results["seasons"].get(season)
    seasons = sorted(results["seasons"])
    if block is None:
        return {
            "status": "unknown",
            "season": season,
            "reason": "The decomposition is served for 2022-23 to 2025-26, the seasons the "
            "expected-shot model was not trained on.",
            "seasons": seasons,
        }
    side = side if side in SIDES else "offense"
    key = sort if sort in SORTS else "ts"
    minimum = max(min_shots, DEFAULT_MIN_SHOTS)
    rows, unknown = [], []
    for value in block["players"]:
        if team and team not in {_tricode(value["team_id"]), value["team_id"]}:
            continue
        base = _base(value, side)
        if value["status"] != "served":
            unknown.append({**base, "reason": REASON})
        elif base["shots"] >= minimum:
            rows.append({**base, "values": value[side], "intervals": value[f"{side}_interval"]})
    if key == "shots":
        rows.sort(key=lambda r: (-r["shots"], r["player_id"]))
    else:
        rows.sort(key=lambda r: (-r["values"][key], r["player_id"]))
    unknown.sort(key=lambda r: (-r["shots"], r["player_id"]))
    team_ids = sorted(
        {v["team_id"] for v in block["players"] if v["team_id"]},
        key=lambda t: _tricode(t) or t,
    )
    return {
        "status": "available",
        "season": season,
        "side": side,
        "sort": key,
        "team": team,
        "min_shots": minimum,
        "labels": LABELS[side],
        "rows": rows,
        "unknown": unknown,
        "teams": [{"team_id": t, "tricode": _tricode(t)} for t in team_ids],
        "seasons": seasons,
        "second_stage": block["second_stage"][side],
        "additivity_residual": block["coefficient_additivity_residual"][side],
        "median_interval_width": block["median_interval_width"][side],
        "league_per_100_shots": block["league_per_100_shots"],
        "avg_points": block["avg_points"],
        "expected_shift": block["expected_shift"],
        "results_sha256": results["results_sha256"],
    }


def defensive_sq(season: str) -> dict[str, dict[str, Any]]:
    """Part A's dSQ and its interval per served player, for the Defensive Shot Quality cards."""
    results = load_results()
    block = results["seasons"].get(season) if results else None
    if block is None:
        return {}
    return {
        p["player_id"]: {"value": p["defense"]["sq"], "interval": p["defense_interval"]["sq"]}
        for p in block["players"]
        if p["status"] == "served"
    }
