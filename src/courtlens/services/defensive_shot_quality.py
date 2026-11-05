"""Research → Defensive Shot Quality: served results of courtlens-defensive-shot-quality-v1 (R06).

Every number comes from the frozen results file; ranks are positions among the served defenders of
the same season and shot type. A defender under the registered minimum never receives a value.
"""

from __future__ import annotations

import json
from functools import lru_cache
from pathlib import Path
from typing import Any

from courtlens.domain.teams import get_team_info
from courtlens.services import shot_decomposition

RESULTS_PATH = Path("evaluation/research/frozen/courtlens-defensive-shot-quality-v1.json")
LATEST_SEASON = "2025-26"
KINDS = ("all", "2pt", "3pt")
SORTS = ("dsq", "rapm", "fga", "xpps", "pps")
SMALL_SAMPLE = "Fewer than 300 matchup field-goal attempts in the season."
TYPE_SMALL_SAMPLE = "Fewer than 100 matchup attempts of this shot type in the season."
RAPM_UNKNOWN = {
    "before": "The decomposition starts in 2022-23.",
    "small": "Under the decomposition's minimum of 20 games and 1,000 shots on each side.",
}
DEFINITIONS = {
    "dsq": (
        "D-SQ: points per 100 matchup attempts by which shooters scored less (plus) or more "
        "(minus) than their own season shooting against every other defender predicts, relative "
        "to the league. Positive is good."
    ),
    "xpps": (
        "Expected PPS: what these shooters' own season 2P% and 3P% predict for the shots they took "
        "in this matchup, shrunk toward R03's league prior. It describes who the defender guarded "
        "and how many 3s they took. It is not a shot-quality estimate: matchup rows have no shot "
        "location. It is neither good nor bad."
    ),
    "pps": "Actual PPS: field-goal points per matchup attempt. Free throws are excluded.",
    "fga": (
        "Matchup FGA: attempts by the player this defender was tracked on. Some 2-pointers are "
        "credited to more than one defender, so this overstates distinct shots."
    ),
    "rapm": (
        "D-SQ RAPM: dSQ from the ShotQuality decomposition, the lineup-adjusted effect on the "
        "opponents' expected shot value, per 100 shots. Served from 2022-23. A different "
        "measurement from the matchup D-SQ: it uses shot location and lineups, not matchups."
    ),
    "interval": (
        "95% bootstrap over the defender's games (2,000 replicates), with shooters' expected rates "
        "held fixed. It shows matchup-outcome noise. Overlapping intervals do not rank two "
        "defenders."
    ),
    "hindsight": (
        "Descriptive and in hindsight: a shooter's expected rate uses his whole season, including "
        "games after the matchup."
    ),
}
REFERENCE_NOTE = (
    "Design reference: a saved copy of Databallr's D-ShotQuality page. Reproduced: the ranked "
    "player cards, the All / 2PT / 3PT switch, shots defended, an expected and an actual PPS with "
    "ranks, the RAPM headline, Key Matchups and next-six paging. Different: expected PPS is what "
    "the shooters' own shooting predicts, not ShotQuality's tracking value. Not reproduced: the "
    "2nd Defender column (help columns are zero in every row of the free matchup data), a Closest "
    "Defender split (these rows are tracked matchups, not the nearest defender at each shot) and "
    "the Data Source switch. Added: "
    "the D-SQ value, its interval and the signal and persistence checks. NBA tracking's season "
    "closest-defender numbers remain on the Tracking page."
)
CREDIT = (
    "The card layout and the concept are Databallr's D-ShotQuality page; ShotQuality owns the "
    "tracking values, which are not used here. Data: NBA Stats matchups via shufinskiy/nba_data."
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
        "data": results["data"],
        "signal": results["signal"],
        "persistence": results["persistence"],
        "agreement_with_rapm": results["agreement_with_rapm"],
        "definitions": DEFINITIONS,
        "reference_note": REFERENCE_NOTE,
        "credit": CREDIT,
    }


def _ranks(rows: list[dict[str, Any]], kind: str) -> dict[str, dict[str, int]]:
    """1 is most attempts, lowest expected and actual PPS, and highest D-SQ, as on the reference."""
    known = [r for r in rows if r["kinds"][kind]["status"] == "served"]
    orders: dict[str, Any] = {
        "fga": lambda r: (-r["kinds"][kind]["fga"], r["player_id"]),
        "xpps": lambda r: (r["kinds"][kind]["xpps"], r["player_id"]),
        "pps": lambda r: (r["kinds"][kind]["pps"], r["player_id"]),
        "dsq": lambda r: (-r["kinds"][kind]["dsq"], r["player_id"]),
    }
    result: dict[str, dict[str, int]] = {r["player_id"]: {} for r in known}
    for metric, order in orders.items():
        for position, row in enumerate(sorted(known, key=order), start=1):
            result[row["player_id"]][metric] = position
    return result


def _sort_key(sort: str) -> Any:
    def key(card: dict[str, Any]) -> tuple[int, float, str]:
        value = card["rapm"]["value"] if sort == "rapm" else card["value"][sort]
        if value is None:
            return (1, 0.0, card["player_id"])
        ascending = sort in ("xpps", "pps")
        return (0, value if ascending else -value, card["player_id"])

    return key


def cards(
    season: str, kind: str = "all", sort: str = "dsq", team: str | None = None
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
            "reason": "Matchup data exists for 2017-18 to 2025-26.",
            "seasons": seasons,
        }
    kind = kind if kind in KINDS else "all"
    key = sort if sort in SORTS else "dsq"
    served = [p for p in block["players"] if p["status"] == "served"]
    ranks = _ranks(served, kind)
    rapm = shot_decomposition.defensive_sq(season)
    has_rapm = season in (shot_decomposition.load_results() or {"seasons": {}})["seasons"]
    rows = []
    for value in served:
        if team and team not in {_tricode(value["team_id"]), value["team_id"]}:
            continue
        chosen = value["kinds"][kind]
        fit = rapm.get(value["player_id"])
        rows.append(
            {
                "player_id": value["player_id"],
                "team_id": value["team_id"],
                "tricode": _tricode(value["team_id"]),
                "games": value["games"],
                "value": chosen,
                "reason": TYPE_SMALL_SAMPLE if chosen["status"] != "served" else None,
                "rank": ranks.get(value["player_id"]),
                "rapm": {
                    "value": fit["value"] if fit else None,
                    "interval": fit["interval"] if fit else None,
                    "reason": None if fit else RAPM_UNKNOWN["small" if has_rapm else "before"],
                },
                "key_matchups": [
                    {**m, "tricode": _tricode(m["team_id"])} for m in value["key_matchups"]
                ],
            }
        )
    rows.sort(key=_sort_key(key))
    team_ids = sorted({v["team_id"] for v in served}, key=lambda t: _tricode(t) or t)
    unknown = [
        {
            "player_id": p["player_id"],
            "fga": p["fga"],
            "tricode": _tricode(p["team_id"]),
            "reason": SMALL_SAMPLE,
        }
        for p in block["players"]
        if p["status"] != "served"
    ]
    return {
        "status": "available",
        "season": season,
        "kind": kind,
        "sort": key,
        "team": team,
        "rows": rows,
        "ranked": len(served),
        "unknown_count": len(unknown),
        "unknown": sorted(unknown, key=lambda u: (-u["fga"], u["player_id"])),
        "league": block["league"][kind],
        "interval_excludes_zero": block["interval_excludes_zero"],
        "defenders_served": block["defenders_served"],
        "teams": [{"team_id": t, "tricode": _tricode(t)} for t in team_ids],
        "seasons": seasons,
        "results_sha256": results["results_sha256"],
    }
