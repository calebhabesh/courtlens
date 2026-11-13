"""Research → zTS: served results of courtlens-zts-validation-v1 (R04).

Every number comes from the frozen results file the registered runner wrote; nothing is
recomputed here except arithmetic on served values (shares, per-type TS, contributions), which
tests hold equal to the domain module. Unknown player-seasons keep their named reason and never
receive a zTS.
"""

from __future__ import annotations

import json
from functools import lru_cache
from pathlib import Path
from typing import Any

from courtlens.domain import zts, zts_teams
from courtlens.domain.teams import get_team_info
from courtlens.services.impact_serving import load_impact_store, served_path

RESULTS_PATH = Path("evaluation/research/frozen/courtlens-zts-validation-v1.json")
LATEST_SEASON = "2025-26"
TOP_LIMIT = 200
ALL_SEASONS = "all"
SORTS = ("zts", "zts_add")
EXAMPLE_RULE = (
    "Default player: the highest zTS add/100 in 2025-26, the Top 200 ranking (a selection rule "
    "to open the page, not a judgement of the player)."
)
REASONS = {
    zts.NO_RTS: "No rTS: the player has no box rows in the sealed play-by-play season.",
    zts.SMALL_SAMPLE: "Fewer than 200 true-shooting attempts (the rTS qualification).",
    zts.NO_PLAY_TYPES: "No Synergy play-type rows for this player-season.",
    zts.SOURCE_ROWS_MISSING: (
        "The source is missing at least one whole play-type row: more possessions are missing "
        "than the absent types could hold under the source's 10-possession floor."
    ),
    zts.LOW_COVERAGE: "Listed play types cover less than 90% of the player's possessions.",
}
PLAY_TYPE_LABELS = {
    "cut": "Cut",
    "handoff": "Handoff",
    "isolation": "Isolation",
    "misc": "Misc",
    "offrebound": "Putbacks",
    "offscreen": "Off Screen",
    "postup": "Post Up",
    "prballhandler": "P&R Ball Handler",
    "prrollman": "P&R Roll Man",
    "spotup": "Spot Up",
    "transition": "Transition",
}
DEFINITIONS = {
    "rts": (
        "rTS: the player's true shooting minus the league's, TS = PTS / (2 x (FGA + 0.44 x FTA)) "
        "over the sealed play-by-play regular season. The same value as the Stats table's rTS% "
        "for a whole regular season with no team or date filter."
    ),
    "play_type_ts": (
        "Play-type TS (CourtLens' definition): PTS / (2 x scoring possessions), scoring "
        "possessions = possessions x (1 - turnover share). Synergy rows carry no FTA, so this is "
        "not box TS and not Databallr's number."
    ),
    "expected_ts": (
        "Expected TS: the sum over play types of the player's share of scoring possessions "
        "times the league's play-type TS in the same season."
    ),
    "difficulty": (
        "Playtype Difficulty: league play-type TS minus Expected TS. Positive means a harder "
        "than average shot diet. It is in play-type TS units and is added to box-unit rTS."
    ),
    "zts": "zTS: rTS + Playtype Difficulty.",
    "league": (
        "League references pool every listed offensive row of the same season, weighted by "
        "scoring possessions. Using the season's own average is descriptive, not a forecast."
    ),
}
CREDIT = (
    "zTS, Expected TS and Playtype Difficulty are Databallr's concepts and names "
    "(databallr.com); Databallr is the design and method reference for this page. CourtLens' "
    "play-type TS definition, coverage rules and numbers are its own and do not reproduce "
    "Databallr's. Play-type data: NBA Stats (Synergy Sports) via hoopR / sportsdataverse."
)
VOLUME_NOTE = (
    "Minutes, scoring usage and TS add come from the served impact bundle (the Stats table's "
    "source), not from the frozen zTS results. Scoring usage = 100 x TSA / offensive "
    "possessions. TS add = 2 x scoring usage x rTS (the Stats table's TS add/100); zTS add = "
    "2 x scoring usage x zTS, both points per 100 offensive possessions. zTS add follows the TS "
    "add arithmetic Databallr describes; it is not Databallr's SV/100, whose formula is not "
    "published."
)
NO_INTERVAL = (
    "zTS is built from season totals, which have no resampling unit below the season, so it is "
    "served without an interval. The validation's differences carry 95% bootstrap intervals."
)


@lru_cache(maxsize=1)
def load_results(path: Path = RESULTS_PATH) -> dict[str, Any] | None:
    if not path.exists():
        return None
    data: dict[str, Any] = json.loads(path.read_text())
    return data


def seasons(results: dict[str, Any]) -> list[str]:
    return sorted(results["players"])


def _tricode(team_id: str) -> str | None:
    info = get_team_info(team_id)
    return info.tricode if info else None


def summary() -> dict[str, Any] | None:
    results = load_results()
    if results is None:
        return None
    references = {
        season: {
            "ts": ref["ts"],
            "scoring_possessions": ref["scoring_possessions"],
            "types": [
                {"play_type": k, "label": PLAY_TYPE_LABELS[k], **v}
                for k, v in sorted(ref["types"].items(), key=lambda kv: -kv[1]["share"])
            ],
        }
        for season, ref in sorted(results["references"].items())
    }
    return {
        "registration": results["registration"],
        "results_sha256": results["results_sha256"],
        "inputs": results["inputs"],
        "fta_check": results["fta_check"],
        "coverage": results["coverage"],
        "references": references,
        "validation": results["validation"],
        "seasons": seasons(results),
        "definitions": DEFINITIONS,
        "reasons": REASONS,
        "play_type_labels": PLAY_TYPE_LABELS,
        "parameters": {
            "min_tsa": zts.MIN_TSA,
            "min_coverage": zts.MIN_COVERAGE,
            "source_min_possessions": zts.SOURCE_MIN_POSSESSIONS,
        },
        "credit": CREDIT,
        "no_interval": NO_INTERVAL,
        "volume_note": VOLUME_NOTE,
    }


def season_volume(store: dict[str, Any] | None, season: str) -> dict[str, dict[str, Any]]:
    """Minutes, offensive possessions, scoring usage and TS add per player from the bundle."""
    if store is None:
        return {}
    extras: dict[str, Any] = {}
    ratings: dict[str, Any] = {}
    for entry in store["entries"]:
        scope = entry["scope"]
        if scope.get("season") != season or scope.get("phase") != "regular_season":
            continue
        if scope.get("years") != 1:
            continue
        if entry["kind"] == "extras":
            extras = entry["players"]
        elif entry["kind"] == "ratings":
            ratings = entry["players"]
    out: dict[str, dict[str, Any]] = {}
    for pid in set(extras) | set(ratings):
        support = (extras.get(pid) or {}).get("support") or {}
        ts_add = support.get("impact_tsadd_per100") or {}
        rts = support.get("impact_rts") or {}
        seconds = (((ratings.get(pid) or {}).get("support") or {}).get("rapm") or {}).get("seconds")
        off = ts_add.get("denominator")
        tsa = rts.get("denominator")
        usage = 100.0 * tsa / off if tsa is not None and off else None
        out[pid] = {
            "minutes": seconds / 60.0 if seconds is not None else None,
            "off_possessions": off,
            "scoring_usage": usage,
            "ts_add": ts_add.get("value"),
        }
    return out


@lru_cache(maxsize=32)
def _cached_volume(path: str, season: str) -> dict[str, dict[str, Any]]:
    return season_volume(load_impact_store(), season)


def volume(season: str) -> dict[str, dict[str, Any]]:
    path = served_path()
    if path is None or not path.exists():
        return {}
    return _cached_volume(str(path), season)


def _row(pid: str, value: dict[str, Any], extra: dict[str, Any] | None = None) -> dict[str, Any]:
    teams = [{"team_id": t, "tricode": _tricode(t)} for t in value["teams"]]
    extra = extra or {}
    usage = extra.get("scoring_usage")
    return {
        "player_id": pid,
        "minutes": extra.get("minutes"),
        "off_possessions": extra.get("off_possessions"),
        "scoring_usage": usage,
        "ts_add": extra.get("ts_add"),
        "zts_add": 2.0 * usage * value["zts"]
        if usage is not None and value["zts"] is not None
        else None,
        "zts_status": value["status"],
        "reason": REASONS.get(value["status"]),
        "rts": value["rts"],
        "tsa": value["tsa"],
        "expected_ts": value["expected_ts"],
        "difficulty": value["difficulty"],
        "zts": value["zts"],
        "synergy_ts": value["synergy_ts"],
        "coverage": value["coverage"],
        "listed_possessions": value["listed_possessions"],
        "implied_possessions": value["implied_possessions"],
        "teams": teams,
    }


def _ranked(rows: list[dict[str, Any]], sort: str) -> list[dict[str, Any]]:
    ranked = sorted(
        (r for r in rows if r[sort] is not None),
        key=lambda r: (-r[sort], r.get("season", ""), r["player_id"]),
    )
    for rank, row in enumerate(ranked, start=1):
        row["rank"] = rank
    return ranked


def leaderboard(season: str, limit: int = TOP_LIMIT, sort: str = "zts") -> dict[str, Any] | None:
    """Served zTS ranked high to low (one season, or every season), with every unknown."""
    if sort not in SORTS:
        raise ValueError(f"unknown sort {sort}")
    results = load_results()
    if results is None:
        return None
    if season == ALL_SEASONS:
        rows = []
        for s in seasons(results):
            extra = volume(s)
            rows += [
                {"season": s, **_row(pid, v, extra.get(pid))}
                for pid, v in results["players"][s].items()
                if v["status"] == zts.KNOWN
            ]
        ranked = _ranked(rows, sort)
        return {
            "status": "available",
            "season": ALL_SEASONS,
            "seasons": seasons(results),
            "sort": sort,
            "known": len(rows),
            "ranked": len(ranked),
            "rows": ranked[:limit],
            "unknown": [],
            "results_sha256": results["results_sha256"],
            "volume_note": VOLUME_NOTE,
        }
    players = results["players"].get(season)
    if players is None:
        return {
            "status": "unknown",
            "season": season,
            "seasons": seasons(results),
            "reason": (
                "No zTS for this season: Synergy play types start in 2015-16, and 2026-27 has "
                "no play-type rows or sealed rTS yet."
            ),
        }
    extra = volume(season)
    known = [
        {"season": season, **_row(pid, v, extra.get(pid))}
        for pid, v in players.items()
        if v["status"] == zts.KNOWN
    ]
    ranked = _ranked(known, sort)
    unknown = sorted(
        (
            {"season": season, **_row(pid, v, extra.get(pid))}
            for pid, v in players.items()
            if v["status"] != zts.KNOWN
        ),
        key=lambda r: (r["zts_status"], -(r["tsa"] or 0), r["player_id"]),
    )
    return {
        "status": "available",
        "season": season,
        "seasons": seasons(results),
        "sort": sort,
        "league_ts": results["references"][season]["ts"],
        "known": len(known),
        "ranked": len(ranked),
        "rows": ranked[:limit],
        "unknown": unknown,
        "coverage": results["coverage"][season],
        "results_sha256": results["results_sha256"],
        "volume_note": VOLUME_NOTE,
    }


def default_player() -> str | None:
    """The 2025-26 player with the highest zTS add/100 (needs the bundle's scoring usage)."""
    board = leaderboard(LATEST_SEASON, limit=1, sort="zts_add")
    if board is None or board["status"] != "available" or not board["rows"]:
        return None
    pid: str = board["rows"][0]["player_id"]
    return pid


def play_types(value: dict[str, Any], reference: dict[str, Any]) -> list[dict[str, Any]]:
    """The player's mix with player and league TS per type; contribution = share x league TS."""
    types = value["types"]
    if not types:
        return []
    total_sp = sum(v[1] for v in types.values())
    out = []
    for k, (poss, sp, pts) in types.items():
        share = sp / total_sp if total_sp > 0 else None
        league = reference["types"][k]["ts"]
        ts = pts / (2 * sp) if sp > 0 else None
        out.append(
            {
                "play_type": k,
                "label": PLAY_TYPE_LABELS[k],
                "possessions": poss,
                "scoring_possessions": sp,
                "points": pts,
                "share": share,
                "league_share": reference["types"][k]["share"],
                "ts": ts,
                "league_ts": league,
                "relative_ts": None if ts is None else ts - league,
                "contribution": None if share is None else share * league,
            }
        )
    return sorted(out, key=lambda r: (-(r["share"] or 0), r["play_type"]))


def player(player_id: str, season: str) -> dict[str, Any] | None:
    results = load_results()
    if results is None:
        return None
    history = []
    for s in seasons(results):
        value = results["players"][s].get(player_id)
        if value is not None:
            history.append({"season": s, **_row(player_id, value, volume(s).get(player_id))})
    if not history:
        return {
            "status": "unknown",
            "player_id": player_id,
            "season": season,
            "reason": "No rTS or play-type rows for this player in 2015-16 to 2025-26.",
            "history": [],
        }
    value = results["players"].get(season, {}).get(player_id)
    if value is None:
        return {
            "status": "unknown",
            "player_id": player_id,
            "season": season,
            "reason": f"No rTS or play-type rows for this player in {season}.",
            "history": history,
        }
    reference = results["references"][season]
    return {
        "status": "available",
        "season": season,
        "league_ts": reference["ts"],
        **_row(player_id, value, volume(season).get(player_id)),
        "volume_note": VOLUME_NOTE,
        "dropped_row": value["dropped_row"],
        "play_types": play_types(value, reference),
        "history": history,
    }


# ---- RD03: team playtype difficulty and role moves (descriptive, owner-approved) ---------------

TEAMS_PATH = Path("evaluation/research/derived/courtlens-zts-teams-v1.json")
MOVES_WINDOW = 5
MOVES_COUNT = 6
MOVES_MINUTES = 1000.0
TEAMS_NOTE = (
    "Team playtype difficulty: every listed Synergy offensive row a team's players logged for "
    "it, summed, then Expected TS and difficulty exactly as for a player, against the same league "
    "references. Rows under the source's 10-possession floor are absent, so team totals run "
    "slightly low. Descriptive, not part of the registered test."
)
MOVES_RULE = (
    "Players with a served zTS and 1,000+ minutes in each of the {n} seasons ending in {season}, "
    "ranked by the size of their Role change from the first season to the last; the six largest."
)


@lru_cache(maxsize=1)
def load_teams(path: Path = TEAMS_PATH) -> dict[str, Any] | None:
    if not path.exists():
        return None
    data: dict[str, Any] = json.loads(path.read_text())
    return data


def team_board(season: str) -> dict[str, Any] | None:
    """One season's teams by difficulty, each with its players' share of the mix and served Role,
    plus every season's team and served player difficulties for the spread chart."""
    results, teams = load_results(), load_teams()
    if results is None or teams is None:
        return None
    if teams["inputs"]["zts_results_sha256"] != results["results_sha256"]:
        raise ValueError("team file was built from a different zTS results file")
    entry = teams["seasons"].get(season)
    if entry is None:
        return {
            "status": "unknown",
            "season": season,
            "seasons": sorted(teams["seasons"]),
            "reason": "No team playtype difficulty for this season: Synergy play types start in "
            "2015-16, and 2026-27 has no play-type rows yet.",
        }
    players = results["players"][season]
    rows = []
    for team_id, t in entry["teams"].items():
        roster = []
        for p in t["players"]:
            value = players.get(p["player_id"]) or {}
            roster.append(
                {
                    **p,
                    "difficulty": value.get("difficulty"),
                    "zts_status": value.get("status"),
                    "multi_team": len(value.get("teams") or []) > 1,
                }
            )
        rows.append(
            {
                "team_id": team_id,
                "tricode": _tricode(team_id),
                "difficulty": t["difficulty"],
                "expected_ts": t["expected_ts"],
                "synergy_ts": t["synergy_ts"],
                "scoring_possessions": t["scoring_possessions"],
                "players": roster,
            }
        )
    rows.sort(key=lambda r: (-r["difficulty"], r["team_id"]))
    for rank, row in enumerate(rows, start=1):
        row["rank"] = rank
    team_values = [t["difficulty"] for s in teams["seasons"].values() for t in s["teams"].values()]
    player_values = [
        v["difficulty"]
        for s in seasons(results)
        for v in results["players"][s].values()
        if v["status"] == zts.KNOWN
    ]
    return {
        "status": "available",
        "season": season,
        "seasons": sorted(teams["seasons"]),
        "league_ts": results["references"][season]["ts"],
        "league_difficulty": entry["league_difficulty"],
        "teams": rows,
        "spread": {
            "seasons": [seasons(results)[0], seasons(results)[-1]],
            "players": {"values": player_values, "sd": zts_teams.spread(player_values)},
            "teams": {"values": team_values, "sd": zts_teams.spread(team_values)},
        },
        "note": TEAMS_NOTE,
        "teams_sha256": teams["teams_sha256"],
    }


def role_moves(season: str) -> dict[str, Any] | None:
    """The six largest Role changes across the (up to) five served seasons ending in `season`."""
    results = load_results()
    if results is None:
        return None
    all_seasons = seasons(results)
    if season not in all_seasons:
        return {
            "status": "unknown",
            "season": season,
            "reason": "No zTS for this season: Synergy play types start in 2015-16.",
        }
    end = all_seasons.index(season)
    window = all_seasons[max(0, end - MOVES_WINDOW + 1) : end + 1]
    if len(window) < 2:
        return {
            "status": "unknown",
            "season": season,
            "reason": f"Role moves need two served seasons; {season} is the first.",
        }
    volumes = {s: volume(s) for s in window}

    def qualified(pid: str, s: str) -> bool:
        value = results["players"][s].get(pid)
        minutes = (volumes[s].get(pid) or {}).get("minutes")
        return (
            value is not None
            and value["status"] == zts.KNOWN
            and minutes is not None
            and minutes >= MOVES_MINUTES
        )

    pool = [pid for pid in results["players"][window[0]] if all(qualified(pid, s) for s in window)]
    first, last = window[0], window[-1]
    changes = {
        pid: results["players"][last][pid]["difficulty"]
        - results["players"][first][pid]["difficulty"]
        for pid in pool
    }
    chosen = sorted(changes, key=lambda pid: (-abs(changes[pid]), pid))[:MOVES_COUNT]
    return {
        "status": "available",
        "season": season,
        "window": window,
        "pool": len(pool),
        "rule": MOVES_RULE.format(n=len(window), season=season),
        "players": [
            {
                "player_id": pid,
                "change": changes[pid],
                "history": [
                    {"season": s, **_row(pid, results["players"][s][pid], volumes[s].get(pid))}
                    for s in window
                ],
            }
            for pid in chosen
        ],
    }
