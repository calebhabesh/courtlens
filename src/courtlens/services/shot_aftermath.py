"""Research → Shooting → Shot Aftermath: served results of courtlens-shot-aftermath-v1 (R17).

Every number comes from the frozen results file. The file is verified on load: its results hash is
recomputed and its registration hash must equal the current registration's, so an edited file or
registration serves nothing. Unknown values stay unknown (None), never zero.
"""

from __future__ import annotations

import hashlib
import json
from functools import lru_cache
from pathlib import Path
from typing import Any

from courtlens.domain import shot_aftermath as sa
from courtlens.domain.research_registry import load_registration

REGISTRATION = "courtlens-shot-aftermath-v1"
RESULTS_PATH = Path("evaluation/research/frozen/courtlens-shot-aftermath-v1.json")
LATEST_SEASON = "2025-26"
# Out-of-sample group accuracy of courtlens-position-estimates-v1 (five folds grouped by player,
# combine labels), read from its artifact's confusion matrix; a test recomputes it.
POSITION_GROUP_CORRECT = 888
POSITION_GROUP_SAMPLES = 1039
CENTRES_ESTIMATED_C = 95
CENTRES_ESTIMATED_PF = 43
CENTRES = 142

DEFINITIONS = {
    "first_chance": (
        "First-chance attempt: a field-goal attempt before the shooting team's first offensive "
        "rebound of the possession."
    ),
    "made": "Made points: 2 or 3 for a make, per attempt. And-one free throws are not included.",
    "second": (
        "Second chances: every point the shooting team scores later in the same possession after "
        "a miss (putbacks and free throws included), per attempt. A miss the defence rebounds "
        "adds nothing."
    ),
    "own": "Own scoring: made points plus second chances, per attempt.",
    "cost": (
        "Opponent cost: how many more (plus) or fewer (minus) points than the season's league "
        "average the opponent scores on its very next possession, weighted by how often a make "
        "and a defensively rebounded miss happen. Minus is a benefit to the shooting team."
    ),
    "net": "Scoring minus cost: own scoring minus opponent cost, per attempt.",
    "ppp": (
        "Opponent points per possession: points on the opponent's next possession, including its "
        "own offensive rebounds, after a make or after a defensive rebound."
    ),
    "league": "League points per possession: all counted possessions of the season, both teams.",
    "views": (
        "All attempts: per first-chance attempt. After a miss: per first-chance miss (second "
        "chances and the cost of the defensive-rebound branch). After a defensive rebound: per "
        "miss the defence rebounded."
    ),
    "zones": (
        "Rim: layups, dunks, tips, alley-oops, putbacks and finger rolls, and any 2 from 4 feet "
        "or closer (the shot label decides first). Short mid: other 2s from 5 to 14 feet. Long "
        "mid: other 2s from 15 feet out. Three: every 3."
    ),
    "positions": (
        "Estimated positions: guards (PG, SG), forwards (SF, PF) and bigs (C), from CourtLens's "
        "estimate for the season, built from listed position, size and box-score rates."
    ),
    "interval": (
        "95% interval from resampling whole games 2,000 times within the season. It covers game "
        "sampling only, not position-estimate or matching error."
    ),
    "thin": (
        "Thin: fewer than 100 attempts, or fewer than 50 opponent possessions behind the cost. "
        "Values are served unsmoothed and never coloured."
    ),
    "colour": (
        "Green or red only on an opponent cost whose 95% interval excludes zero: green below the "
        "league average, red above it."
    ),
}
LIMITATIONS = (
    "Descriptive, not causal, not a net rating and not shot-selection advice.",
    "Cost covers the opponent's immediate possession only: after an offensive rebound, the "
    "opponent possession that eventually follows is not counted.",
    "A fouled miss is not a field-goal attempt, so it is outside the sample; and-one free throws "
    "are not in made points.",
    "Positions are estimates, and centres are the least accurate group.",
    "Games the sealed possessions excluded are unknown and out of every value.",
    "The opponent's possession after a make usually starts from an inbound, so the after-make "
    "comparison with the all-possession average carries that start.",
)
CREDIT = (
    "The views, zones, first chance and cost formula follow Databallr's Shot Aftermath page. "
    "CourtLens computes them from its own sealed NBA play-by-play possessions, so its numbers "
    "are its own. Data: NBA play-by-play and shot charts via shufinskiy/nba_data."
)


def canonical(payload: dict[str, Any]) -> bytes:
    return json.dumps(payload, sort_keys=True, separators=(",", ":"), ensure_ascii=True).encode()


@lru_cache(maxsize=2)
def _load(path: str, mtime: float) -> dict[str, Any] | None:
    results: dict[str, Any] = json.loads(Path(path).read_text())
    stated = results.get("results_sha256")
    body = {k: v for k, v in results.items() if k != "results_sha256"}
    if hashlib.sha256(canonical(body)).hexdigest() != stated:
        return None
    if results["registration"]["content_sha256"] != load_registration(REGISTRATION).content_hash():
        return None
    return results


def load_results(path: Path = RESULTS_PATH) -> dict[str, Any] | None:
    if not path.exists():
        return None
    return _load(str(path), path.stat().st_mtime)


def _team_codes(season: dict[str, Any]) -> dict[str, str]:
    return {t["team_id"]: t["code"] for t in season["teams"]}


def resolve_team(season: dict[str, Any], team: str) -> str | None:
    """'all', a team ID or a team code of that season -> the stored key; None if not served."""
    if team.lower() == "all":
        return "all"
    codes = _team_codes(season)
    if team in codes:
        return team
    for team_id, code in codes.items():
        if code.upper() == team.upper():
            return team_id
    return None


def _cell(cell: dict[str, Any], codes: dict[str, str]) -> dict[str, Any]:
    team = cell["team"]
    return {
        **cell,
        "team_code": None if team == "all" else codes.get(team),
    }


def summary() -> dict[str, Any] | None:
    results = load_results()
    if results is None:
        return None
    registration = results["registration"]
    seasons = []
    for name, body in sorted(results["seasons"].items()):
        seasons.append(
            {
                "season": name,
                "league": body["league"],
                "first_chance_by_zone": body["first_chance_by_zone"],
                "databallr_comparison": body["databallr_comparison"],
                "data_check": body["data_check"],
                "teams": body["teams"],
                "statuses": {
                    s: sum(1 for c in body["cells"] if c["status"] == s)
                    for s in ("ok", "thin", "unknown")
                },
            }
        )
    return {
        "registration": {
            k: registration[k] for k in ("identity", "registered_on", "content_sha256")
        },
        "results_sha256": results["results_sha256"],
        "latest_season": LATEST_SEASON,
        "seasons": seasons,
        "zones": list(sa.ZONES),
        "positions": list(sa.POSITIONS),
        "position_accuracy": {
            "group_correct": POSITION_GROUP_CORRECT,
            "samples": POSITION_GROUP_SAMPLES,
            "centres": CENTRES,
            "centres_estimated_c": CENTRES_ESTIMATED_C,
            "centres_estimated_pf": CENTRES_ESTIMATED_PF,
        },
        "thresholds": {
            "attempts": sa.THIN_ATTEMPTS,
            "possessions": sa.THIN_POSSESSIONS,
            "replicates": 2000,
            "interval": 0.95,
        },
        "definitions": DEFINITIONS,
        "limitations": list(LIMITATIONS),
        "credit": CREDIT,
    }


def scope(season: str, team: str, position: str) -> dict[str, Any] | None:
    """The five zone rows of one scope; None when the season or team is not served."""
    results = load_results()
    if results is None or season not in results["seasons"] or position not in sa.POSITIONS:
        return None
    body = results["seasons"][season]
    key = resolve_team(body, team)
    if key is None:
        return None
    codes = _team_codes(body)
    rows = [
        _cell(c, codes) for c in body["cells"] if c["team"] == key and c["position"] == position
    ]
    rows.sort(key=lambda c: sa.ZONES.index(c["zone"]))
    return {
        "season": season,
        "team": key,
        "team_code": None if key == "all" else codes.get(key),
        "position": position,
        "league": body["league"],
        "rows": rows,
    }


def teams(season: str, position: str, zone: str) -> dict[str, Any] | None:
    """Every team's cell for one position group and zone, in team-code order (not a ranking)."""
    results = load_results()
    if (
        results is None
        or season not in results["seasons"]
        or position not in sa.POSITIONS
        or zone not in sa.ZONES
    ):
        return None
    body = results["seasons"][season]
    codes = _team_codes(body)
    rows = [
        _cell(c, codes)
        for c in body["cells"]
        if c["team"] != "all" and c["position"] == position and c["zone"] == zone
    ]
    rows.sort(key=lambda c: c["team_code"] or c["team"])
    league_row = next(
        _cell(c, codes)
        for c in body["cells"]
        if c["team"] == "all" and c["position"] == position and c["zone"] == zone
    )
    return {
        "season": season,
        "position": position,
        "zone": zone,
        "league": body["league"],
        "all_teams": league_row,
        "rows": rows,
    }
