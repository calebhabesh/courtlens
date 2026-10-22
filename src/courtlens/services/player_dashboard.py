"""Player Dashboard tracking cells (alignment row 22): one player-season's NBA tracking measures.

The panel's box-score, impact and DARKO cells come from the Stats query; this module serves the
cells only NBA tracking can fill (passing, closest-defender shots, hustle, Synergy play types),
each with a percentile among the season's minutes-qualified players. Values are season totals as
NBA Stats published them (docs/design/stats-feeds-v1.md); a season the feeds don't cover returns
nulls, never zeros. Shaping is pure; only `player_dashboard_feeds` touches the database.
"""

from __future__ import annotations

from collections import defaultdict
from collections.abc import Mapping, Sequence
from dataclasses import dataclass
from typing import Any

from sqlalchemy.orm import Session

from courtlens.services.stats_feed_views import (
    PHASE_LABELS,
    QUALIFY,
    SEASON_TOTALS_NOTE,
    SOURCE,
    _mart,
    _num,
    _ratio,
    _rows,
    _sources,
    oriented_percentiles,
)

VERSION = "courtlens-player-dashboard-feeds-v1"

# key: (label, definition, higher_is_better, counting). Counting stats are served per game and
# per 36 minutes; the rest are ratios, the same in both.
METRICS: dict[str, tuple[str, str, bool, bool]] = {
    "potential_ast": (
        "POTAST",
        "Potential assists: passes to a teammate who shot within one dribble, made or missed.",
        True,
        True,
    ),
    "ast_efg": (
        "ASTEFG",
        "CourtLens formula: points created by the player's assists divided by twice their "
        "potential assists, an eFG%-style rate for the shots their passes set up.",
        True,
        False,
    ),
    "potential_ast_per_min": (
        "PA/1M",
        "CourtLens formula: potential assists per minute of ball possession (NBA tracking "
        "time of possession).",
        True,
        False,
    ),
    "defended_fga": (
        "DFGA",
        "Shots attempted with the player as the closest defender (NBA tracking).",
        True,
        True,
    ),
    "defended_diff": (
        "DIFF",
        "Opponents' FG% with the player as closest defender minus their normal FG% on those "
        "shots. Negative is better.",
        False,
        False,
    ),
    "rim_defended_fga": (
        "RIMDFGA",
        "Shots within 6 feet with the player as the closest defender.",
        True,
        True,
    ),
    "rim_defended_diff": (
        "DIFF",
        "Opponents' FG% within 6 feet with the player as closest defender minus their normal "
        "FG% there. Negative is better.",
        False,
        False,
    ),
    "contested_shots": ("CONTEST", "Shots the player contested (NBA hustle stats).", True, True),
    "deflections": ("DEFL", "Passes or dribbles the player deflected (NBA hustle).", True, True),
    "loose_balls": ("LBALLS", "Loose balls the player recovered (NBA hustle).", True, True),
    "charges_drawn": ("OFFD", "Offensive fouls (charges) drawn (NBA hustle).", True, True),
}

# Databallr's four play-type families over NBA Synergy play types. Misc counts toward the
# total possessions but belongs to no family.
PLAY_FAMILIES: dict[str, tuple[str, tuple[str, ...]]] = {
    "creation": ("Creation", ("isolation", "prballhandler", "postup")),
    "spacing": ("Spacing", ("spotup", "offscreen", "handoff")),
    "transition": ("Transition", ("transition",)),
    "finishing": ("Finishing", ("cut", "prrollman", "offrebound")),
}
# A family's efficiency is ranked only with this many possessions behind it.
FAMILY_MIN_POSSESSIONS = {"regular_season": 50, "playoffs": 10}
# First season each feed exists in the hoopR mirror.
FIRST_SEASONS = {
    "tracking": "2013-14",
    "defense": "2013-14",
    "hustle": "2015-16",
    "play_types": "2015-16",
}
LIMITATIONS = [
    SEASON_TOTALS_NOTE,
    "NBA optical tracking aggregates as published; CourtLens does not have frame-level data.",
    "Per 36 values divide by the tracking feed's minutes; per game values by its games.",
    "Play-type families group NBA Synergy play types as Databallr does: Creation = isolation, "
    "pick-and-roll ball handler and post-up; Spacing = spot-up, off-screen and handoff; "
    "Finishing = cut, roll man and putbacks. rPPP is points per 100 possessions above the "
    "league's rate for the same family.",
]


@dataclass
class _Family:
    possessions: float = 0.0
    points: float = 0.0


def shape_feed_players(
    tracking: Sequence[Mapping[str, Any]],
    defense: Sequence[Mapping[str, Any]],
    hustle: Sequence[Mapping[str, Any]],
    phase: str,
) -> dict[str, dict[str, Any]]:
    """Season totals, per game and per 36 values and percentiles for every player in the feeds."""
    stats: dict[str, dict[str, float | None]] = defaultdict(dict)
    for row in tracking:
        stats[str(row["player_id"])][f"{row['measure']}.{row['stat']}"] = _num(row["value"])
    for row in defense:
        prefix = "rim" if row["category"] == "less-than-6ft" else "all"
        pid = str(row["player_id"])
        stats[pid][f"{prefix}.fga"] = _num(row["defended_fga"])
        stats[pid][f"{prefix}.fgm"] = _num(row["defended_fgm"])
        stats[pid][f"{prefix}.expected"] = _num(row["expected_fg_pct"])
        stats[pid].setdefault("defense.gp", _num(row["games"]))
    for row in hustle:
        pid = str(row["player_id"])
        for key in ("games", "minutes", "contested_shots", "deflections", "charges_drawn"):
            stats[pid][f"hustle.{key}"] = _num(row[key])
        stats[pid]["hustle.loose_balls"] = _num(row["loose_balls_recovered"])

    rule = QUALIFY[phase]
    players: dict[str, dict[str, Any]] = {}
    for pid, s in stats.items():
        minutes = s.get("possessions.min") or s.get("hustle.minutes")
        games = s.get("possessions.gp") or s.get("hustle.games") or s.get("defense.gp")
        potential = s.get("passing.potential_ast")
        totals: dict[str, float | None] = {
            "potential_ast": potential,
            "defended_fga": s.get("all.fga"),
            "rim_defended_fga": s.get("rim.fga"),
            "contested_shots": s.get("hustle.contested_shots"),
            "deflections": s.get("hustle.deflections"),
            "loose_balls": s.get("hustle.loose_balls"),
            "charges_drawn": s.get("hustle.charges_drawn"),
        }
        ratios = {
            "ast_efg": _ratio(
                s.get("passing.ast_pts_created"), 2 * potential if potential else None
            ),
            "potential_ast_per_min": _ratio(potential, s.get("possessions.time_of_poss")),
            "defended_diff": _difference(s, "all"),
            "rim_defended_diff": _difference(s, "rim"),
        }
        per_game = {k: _ratio(v, games) for k, v in totals.items()} | ratios
        per_36 = {k: _ratio(36 * v if v is not None else None, minutes) for k, v in totals.items()}
        players[pid] = {
            "games": int(games) if games is not None else None,
            "minutes": minutes,
            "qualified": minutes is not None and minutes >= rule["minutes"],
            "defense_qualified": (s.get("all.fga") or 0) >= rule["defended_fga"],
            "per_game": per_game,
            "per_36": per_36 | ratios,
        }
    qualified = [pid for pid, p in players.items() if p["qualified"]]
    defended = [pid for pid in qualified if players[pid]["defense_qualified"]]
    for mode in ("per_game", "per_36"):
        for key, (_, _, higher, _) in METRICS.items():
            cohort = defended if key.endswith("diff") else qualified
            ranks = oriented_percentiles(
                {pid: p[mode].get(key) for pid, p in players.items()},
                cohort,
                higher_is_better=higher,
            )
            for pid, player in players.items():
                player.setdefault("percentiles", {}).setdefault(mode, {})[key] = ranks[pid]
    return players


def _difference(stats: Mapping[str, float | None], prefix: str) -> float | None:
    fga, fgm, expected = (stats.get(f"{prefix}.{k}") for k in ("fga", "fgm", "expected"))
    if not fga or expected is None:
        return None
    return (fgm or 0.0) / fga - expected


def shape_play_families(
    rows: Sequence[Mapping[str, Any]], phase: str
) -> dict[str, list[dict[str, Any]]]:
    """Each player's possessions share and points per 100 above league, per play-type family."""
    family_of = {play: key for key, (_, plays) in PLAY_FAMILIES.items() for play in plays}
    league: dict[str, _Family] = defaultdict(_Family)
    players: dict[str, dict[str, _Family]] = defaultdict(lambda: defaultdict(_Family))
    totals: dict[str, float] = defaultdict(float)
    for row in rows:
        pid = str(row["player_id"])
        poss = _num(row["possessions"]) or 0.0
        points = _num(row["points"]) or 0.0
        totals[pid] += poss
        family = family_of.get(str(row["play_type"]))
        if family is None:
            continue
        for bucket in (league[family], players[pid][family]):
            bucket.possessions += poss
            bucket.points += points
    league_ppp = {k: _ratio(f.points, f.possessions) for k, f in league.items()}
    rule = QUALIFY[phase]
    floor = FAMILY_MIN_POSSESSIONS[phase]
    shaped: dict[str, list[dict[str, Any]]] = {}
    for pid, families in players.items():
        rows_out = []
        for key, (label, _) in PLAY_FAMILIES.items():
            f = families.get(key, _Family())
            ppp = _ratio(f.points, f.possessions)
            base = league_ppp.get(key)
            rows_out.append(
                {
                    "family": key,
                    "label": label,
                    "possessions": f.possessions,
                    "frequency": _ratio(f.possessions, totals[pid]),
                    "points_per_possession": ppp,
                    "league_points_per_possession": base,
                    "relative_per_100": (
                        None
                        if ppp is None or base is None or f.possessions < floor
                        else 100 * (ppp - base)
                    ),
                }
            )
        shaped[pid] = rows_out
    qualified = [pid for pid in shaped if totals[pid] >= rule["possessions"]]
    for index in range(len(PLAY_FAMILIES)):
        for field in ("frequency", "relative_per_100"):
            ranks = oriented_percentiles(
                {pid: fam[index][field] for pid, fam in shaped.items()},
                qualified,
                higher_is_better=True,
            )
            for pid, fam in shaped.items():
                fam[index].setdefault("percentiles", {})[field] = ranks[pid]
    return shaped


def player_dashboard_feeds(
    session: Session, player_id: str, season: str, phase: str
) -> dict[str, Any]:
    tracking = _rows(
        session,
        f"""
        SELECT player_id, measure, stat, value, dataset_id
        FROM {_mart("mart_stats_player_tracking")}
        WHERE season = :season AND season_type = :phase
          AND ((measure = 'passing' AND stat IN ('potential_ast', 'ast_pts_created'))
            OR (measure = 'possessions' AND stat IN ('time_of_poss', 'min', 'gp')))
        """,
        season=season,
        phase=phase,
    )
    defense = _rows(
        session,
        f"""
        SELECT player_id, category, games, defended_fga, defended_fgm, expected_fg_pct, dataset_id
        FROM {_mart("mart_stats_player_defense")}
        WHERE season = :season AND season_type = :phase
          AND category IN ('overall', 'less-than-6ft')
        """,
        season=season,
        phase=phase,
    )
    hustle = _rows(
        session,
        f"""
        SELECT player_id, games, minutes, contested_shots, deflections, charges_drawn,
               loose_balls_recovered, dataset_id
        FROM {_mart("mart_stats_player_hustle")}
        WHERE season = :season AND season_type = :phase
        """,
        season=season,
        phase=phase,
    )
    plays = _rows(
        session,
        f"""
        SELECT player_id, play_type, possessions, points, dataset_id
        FROM {_mart("mart_stats_player_play_types")}
        WHERE season = :season AND season_type = :phase AND side = 'offensive'
        """,
        season=season,
        phase=phase,
    )
    players = shape_feed_players(tracking, defense, hustle, phase)
    families = shape_play_families(plays, phase)
    mine = players.get(player_id)
    return {
        "version": VERSION,
        "player_id": player_id,
        "season": season,
        "phase": phase,
        "label": f"{season} · {PHASE_LABELS[phase]}",
        "source": SOURCE,
        "qualification": QUALIFY[phase],
        "observed": {
            "tracking": bool(tracking),
            "defense": bool(defense),
            "hustle": bool(hustle),
            "play_types": bool(plays),
        },
        "first_seasons": FIRST_SEASONS,
        "metrics": [
            {
                "key": key,
                "label": label,
                "definition": text_,
                "higher_is_better": higher,
                "counting": counting,
            }
            for key, (label, text_, higher, counting) in METRICS.items()
        ],
        "player": mine,
        "play_types": families.get(player_id),
        "cohort": {
            "qualified_players": sum(p["qualified"] for p in players.values()),
            "rule": f"{QUALIFY[phase]['minutes']}+ tracked minutes",
        },
        "limitations": LIMITATIONS,
        "sources": _sources(
            session, {r["dataset_id"] for r in (*tracking, *defense, *hustle, *plays)}
        ),
    }
