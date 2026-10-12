"""Read-only PC11 views over the PC07 NBA Stats feed marts.

Contract: docs/design/gated-pages-v1.md. Inputs are the dbt marts built from immutable stats feed
datasets (docs/design/stats-feeds-v1.md). Values are season totals as the source reported them;
nothing here is fitted, and a missing value stays null, never zero. Shaping is pure so it can be
tested without PostgreSQL; only the `_fetch*` helpers touch the database.
"""

from __future__ import annotations

from collections import defaultdict
from collections.abc import Iterable, Mapping, Sequence
from dataclasses import dataclass
from typing import Any

from fastapi import HTTPException
from sqlalchemy import bindparam, select, text
from sqlalchemy.orm import Session

from courtlens.domain.teams import get_team_info
from courtlens.stats_feed_models import StatsFeedDataset
from courtlens.workbench_models import WorkbenchIdentity

VERSION = "courtlens-stats-feed-views-v1"
MART_SCHEMA = "analytics_marts"
SOURCE = "NBA Stats via the hoopR-nba-stats-raw mirror (CC BY 4.0)"
PHASES = ("regular_season", "playoffs")
PHASE_LABELS = {"regular_season": "Regular season", "playoffs": "Playoffs"}
SEASON_TOTALS_NOTE = (
    "Season totals as published by NBA Stats, with no per-game dates; they are never joined "
    "into point-in-time features or date-windowed Stats queries."
)

# Fixed sample rules per phase (C10 analogue for feeds that carry games, not minutes).
QUALIFY: dict[str, dict[str, int]] = {
    "regular_season": {"games": 20, "defended_fga": 100, "possessions": 250, "minutes": 500},
    "playoffs": {"games": 4, "defended_fga": 20, "possessions": 40, "minutes": 100},
}


def _mart(name: str) -> str:
    return f"{MART_SCHEMA}.{name}"


def _rows(session: Session, sql: str, **params: Any) -> list[dict[str, Any]]:
    statement = text(sql)
    for key, value in params.items():
        if isinstance(value, list | tuple | set):
            statement = statement.bindparams(bindparam(key, expanding=True))
    return [dict(row._mapping) for row in session.execute(statement, params)]


def rounded(value: Any, digits: int = 4) -> Any:
    """Round floats for the wire; structure and nulls are unchanged."""
    if isinstance(value, float):
        return round(value, digits)
    if isinstance(value, dict):
        return {k: rounded(v, digits) for k, v in value.items()}
    if isinstance(value, list):
        return [rounded(v, digits) for v in value]
    return value


def _num(value: Any) -> float | None:
    return None if value is None else float(value)


def _ratio(numerator: float | None, denominator: float | None) -> float | None:
    if numerator is None or not denominator:
        return None
    return numerator / denominator


def team_tricode(team_id: str | None) -> str | None:
    info = get_team_info(str(team_id)) if team_id else None
    return info.tricode if info else None


def oriented_percentiles(
    values: Mapping[str, float | None], qualified: Iterable[str], *, higher_is_better: bool
) -> dict[str, float | None]:
    """Percentile of each qualified value within the qualified cohort, oriented so 100 is best.

    Unqualified or missing values get None (shown as "Small sample" / "Unknown"), never a rank.
    """
    cohort = sorted((value, key) for key in qualified if (value := values.get(key)) is not None)
    if not cohort:
        return {key: None for key in values}
    ordered = [value for value, _ in cohort]
    result: dict[str, float | None] = {key: None for key in values}
    span = len(ordered) - 1
    for value, key in cohort:
        # Ties share the midpoint rank so equal values get equal percentiles.
        low = ordered.index(value)
        high = len(ordered) - 1 - ordered[::-1].index(value)
        rank = (low + high) / 2
        share = 100.0 if span == 0 else 100.0 * rank / span
        result[key] = share if higher_is_better else 100.0 - share
    return result


def _names(session: Session, ids: Iterable[str]) -> dict[str, str]:
    wanted = sorted({str(pid) for pid in ids if pid})
    if not wanted:
        return {}
    rows = session.execute(
        select(WorkbenchIdentity.external_id, WorkbenchIdentity.display_name).where(
            WorkbenchIdentity.kind == "player", WorkbenchIdentity.external_id.in_(wanted)
        )
    ).all()
    return {str(pid): name for pid, name in rows}


def _sources(session: Session, dataset_ids: Iterable[str]) -> list[dict[str, Any]]:
    ids = sorted({str(d) for d in dataset_ids if d})
    if not ids:
        return []
    datasets = session.scalars(
        select(StatsFeedDataset).where(StatsFeedDataset.id.in_(ids)).order_by(StatsFeedDataset.feed)
    ).all()
    return [
        {
            "dataset_id": d.id,
            "feed": d.feed,
            "variant": d.variant,
            "season": d.season,
            "season_type": d.season_type,
            "observed_at": d.observed_at.isoformat(),
            "upstream_revision": d.upstream_revision,
            "content_sha256": d.content_sha256,
        }
        for d in datasets
    ]


def _scopes(session: Session, mart: str) -> list[dict[str, str]]:
    rows = _rows(
        session,
        f"SELECT DISTINCT season, season_type FROM {_mart(mart)} ORDER BY season DESC, season_type",
    )
    return [
        {"season": str(r["season"]), "phase": str(r["season_type"])}
        for r in rows
        if r["season_type"] in PHASES
    ]


def _resolve_scope(
    session: Session, mart: str, season: str | None, phase: str | None
) -> tuple[str, str, list[dict[str, str]]]:
    scopes = _scopes(session, mart)
    if not scopes:
        raise HTTPException(503, "No admitted NBA Stats feed observation for this view.")
    chosen_phase = phase or "regular_season"
    chosen_season = season or next(
        (s["season"] for s in scopes if s["phase"] == chosen_phase), scopes[0]["season"]
    )
    if {"season": chosen_season, "phase": chosen_phase} not in scopes:
        raise HTTPException(404, f"No {chosen_season} {chosen_phase} observation for this view.")
    return chosen_season, chosen_phase, scopes


def _envelope(
    season: str, phase: str, scopes: list[dict[str, str]], limitations: list[str]
) -> dict[str, Any]:
    return {
        "version": VERSION,
        "season": season,
        "phase": phase,
        "label": f"{season} · {PHASE_LABELS[phase]}",
        "scopes": scopes,
        "source": SOURCE,
        "qualification": QUALIFY[phase],
        "limitations": [SEASON_TOTALS_NOTE, *limitations],
    }


# --- Defense --------------------------------------------------------------------------------

DEFENSE_CATEGORIES = {
    "overall": "All shots",
    "3-pointers": "Threes",
    "2-pointers": "Twos",
    "less-than-6ft": "Under 6 ft",
    "less-than-10ft": "Under 10 ft",
    "greater-than-15ft": "Over 15 ft",
}
DEFENSE_LIMITATIONS = [
    "Defended shots are NBA tracking's closest defender at the time of the shot; "
    "they are not assignments, contests or blame.",
    "Expected FG% is the shooters' normal FG% on these shots. Makes below expected = "
    "expected makes minus actual makes; it describes results, not causal defense.",
    "Matchup points are the offensive player's points while this defender was the "
    "tracked matchup, per 100 partial possessions.",
]


def shape_defenders(
    rows: Sequence[Mapping[str, Any]],
    matchups: Mapping[str, Mapping[str, Any]],
    names: Mapping[str, str],
    phase: str,
) -> list[dict[str, Any]]:
    """One row per defender: defended shots versus expectation, hustle and matchup exposure."""
    rule = QUALIFY[phase]
    players: list[dict[str, Any]] = []
    for row in rows:
        pid = str(row["player_id"])
        fga = _num(row["defended_fga"])
        fgm = _num(row["defended_fgm"])
        expected = _num(row["expected_fg_pct"])
        games = int(row["games"]) if row["games"] is not None else None
        hustle_games = int(row["hustle_games"]) if row.get("hustle_games") is not None else None
        matchup = matchups.get(pid, {})
        poss = _num(matchup.get("partial_possessions"))
        points = _num(matchup.get("player_points"))
        players.append(
            {
                "player_id": pid,
                "player_name": names.get(pid) or row["source_player_name"] or f"NBA player {pid}",
                "team_id": str(row["team_id"]) if row["team_id"] else None,
                "team_tricode": team_tricode(row["team_id"]),
                "games": games,
                "defended_fga": fga,
                "defended_fgm": fgm,
                "defended_fg_pct": _ratio(fgm, fga),
                "expected_fg_pct": expected,
                "fg_pct_difference": (
                    None if not fga or expected is None else (fgm or 0) / fga - expected
                ),
                "makes_below_expected": (
                    None if fga is None or fgm is None or expected is None else expected * fga - fgm
                ),
                "contested_shots_per_game": _ratio(_num(row.get("contested_shots")), hustle_games),
                "deflections_per_game": _ratio(_num(row.get("deflections")), hustle_games),
                "charges_drawn": _num(row.get("charges_drawn")),
                "matchup_minutes": _ratio(_num(matchup.get("matchup_seconds")), 60),
                "matchup_partial_possessions": poss,
                "matchup_points_per_100": None if points is None else _ratio(100 * points, poss),
                "qualified": bool(
                    games is not None
                    and games >= rule["games"]
                    and fga is not None
                    and fga >= rule["defended_fga"]
                ),
            }
        )
    qualified = [p["player_id"] for p in players if p["qualified"]]
    for key, higher in (
        ("fg_pct_difference", False),
        ("makes_below_expected", True),
        ("contested_shots_per_game", True),
        ("deflections_per_game", True),
        ("matchup_points_per_100", False),
    ):
        ranks = oriented_percentiles(
            {p["player_id"]: p[key] for p in players}, qualified, higher_is_better=higher
        )
        for player in players:
            player.setdefault("percentiles", {})[key] = ranks[player["player_id"]]
    players.sort(
        key=lambda p: (
            not p["qualified"],
            -(p["makes_below_expected"] if p["makes_below_expected"] is not None else -1e9),
            p["player_name"],
        )
    )
    return players


def _matchup_totals(
    session: Session, season: str, phase: str, column: str
) -> dict[str, dict[str, Any]]:
    rows = _rows(
        session,
        f"""
        SELECT {column} AS player_id, SUM(matchup_seconds) AS matchup_seconds,
               SUM(partial_possessions) AS partial_possessions, SUM(player_points) AS player_points,
               SUM(fgm) AS fgm, SUM(fga) AS fga, array_agg(DISTINCT dataset_id) AS dataset_ids
        FROM {_mart("mart_stats_season_matchups")}
        WHERE season = :season AND season_type = :phase
        GROUP BY {column}
        """,
        season=season,
        phase=phase,
    )
    return {str(r["player_id"]): r for r in rows}


def defense_view(
    session: Session,
    season: str | None,
    phase: str | None,
    category: str,
    player_id: str | None,
) -> dict[str, Any]:
    if category not in DEFENSE_CATEGORIES:
        raise HTTPException(422, f"Unknown defense category {category!r}.")
    season, phase, scopes = _resolve_scope(session, "mart_stats_player_defense", season, phase)
    rows = _rows(
        session,
        f"""
        SELECT d.*, h.games AS hustle_games, h.contested_shots, h.deflections, h.charges_drawn,
               h.dataset_id AS hustle_dataset_id
        FROM {_mart("mart_stats_player_defense")} d
        LEFT JOIN {_mart("mart_stats_player_hustle")} h
          ON h.season = d.season AND h.season_type = d.season_type AND h.player_id = d.player_id
        WHERE d.season = :season AND d.season_type = :phase AND d.category = :category
        """,
        season=season,
        phase=phase,
        category=category,
    )
    matchups = _matchup_totals(session, season, phase, "def_player_id")
    names = _names(session, [r["player_id"] for r in rows])
    players = shape_defenders(rows, matchups, names, phase)
    known = {p["player_id"] for p in players}
    focus = (
        player_id
        if player_id in known
        else next((p["player_id"] for p in players if p["qualified"]), None)
    )
    detail = matchup_detail(session, season, phase, focus, side="defense") if focus else None
    datasets = {r["dataset_id"] for r in rows} | {
        r["hustle_dataset_id"] for r in rows if r.get("hustle_dataset_id")
    }
    for total in matchups.values():
        datasets.update(total["dataset_ids"] or [])
    return {
        **_envelope(season, phase, scopes, DEFENSE_LIMITATIONS),
        "category": category,
        "categories": [{"value": k, "label": v} for k, v in DEFENSE_CATEGORIES.items()],
        "matchups_observed": bool(matchups),
        "focus_rule": None if player_id in known else "Most makes below expected (qualified)",
        "players": players,
        "detail": detail,
        "sources": _sources(session, datasets),
    }


# --- Matchups -------------------------------------------------------------------------------

MATCHUP_LIMITATIONS = [
    "Matchups are NBA tracking's estimate of who guarded whom, weighted by time together "
    "(partial possessions). They are descriptive exposure, not credit or blame.",
    "An absent pairing is unobserved, not zero time. Playoff matchup feeds were observed empty.",
]


def shape_matchups(
    rows: Sequence[Mapping[str, Any]], names: Mapping[str, str], other: str
) -> list[dict[str, Any]]:
    result = []
    for row in rows:
        pid = str(row[other])
        poss = _num(row["partial_possessions"])
        points = _num(row["player_points"])
        fga = _num(row["fga"])
        result.append(
            {
                "player_id": pid,
                "player_name": names.get(pid) or f"NBA player {pid}",
                "games": int(row["games"]) if row["games"] is not None else None,
                "matchup_minutes": _ratio(_num(row["matchup_seconds"]), 60),
                "partial_possessions": poss,
                "player_points": points,
                "points_per_100": None if points is None else _ratio(100 * points, poss),
                "fgm": _num(row["fgm"]),
                "fga": fga,
                "fg_pct": _ratio(_num(row["fgm"]), fga),
                "fg3m": _num(row["fg3m"]),
                "fg3a": _num(row["fg3a"]),
                "assists": _num(row["assists"]),
                "turnovers": _num(row["turnovers"]),
            }
        )
    return result


def matchup_detail(
    session: Session, season: str, phase: str, player_id: str, *, side: str, limit: int = 12
) -> dict[str, Any]:
    """Who guarded `player_id` (side=offense) or whom they guarded (side=defense)."""
    mine, other = (
        ("off_player_id", "def_player_id")
        if side == "offense"
        else (
            "def_player_id",
            "off_player_id",
        )
    )
    rows = _rows(
        session,
        f"""
        SELECT * FROM {_mart("mart_stats_season_matchups")}
        WHERE season = :season AND season_type = :phase AND {mine} = :player_id
        ORDER BY partial_possessions DESC NULLS LAST, {other}
        """,
        season=season,
        phase=phase,
        player_id=player_id,
    )
    names = _names(session, [player_id, *(r[other] for r in rows[:limit])])
    totals = {
        key: sum(_num(r[key]) or 0.0 for r in rows)
        for key in ("matchup_seconds", "partial_possessions", "player_points", "fgm", "fga")
    }
    return {
        "player_id": player_id,
        "player_name": names.get(player_id) or f"NBA player {player_id}",
        "side": side,
        "opponents": len(rows),
        "matchup_minutes": totals["matchup_seconds"] / 60 if rows else None,
        "partial_possessions": totals["partial_possessions"] if rows else None,
        "player_points": totals["player_points"] if rows else None,
        "points_per_100": _ratio(100 * totals["player_points"], totals["partial_possessions"])
        if rows
        else None,
        "fg_pct": _ratio(totals["fgm"], totals["fga"]) if rows else None,
        "rows": shape_matchups(rows[:limit], names, other),
    }


def matchups_view(
    session: Session, season: str | None, phase: str | None, player_id: str | None, side: str
) -> dict[str, Any]:
    if side not in ("offense", "defense"):
        raise HTTPException(422, "side must be offense or defense.")
    season, phase, scopes = _resolve_scope(session, "mart_stats_season_matchups", season, phase)
    column = "off_player_id" if side == "offense" else "def_player_id"
    totals = _matchup_totals(session, season, phase, column)
    rule = None
    if not player_id or player_id not in totals:
        player_id = max(
            totals,
            key=lambda pid: (_num(totals[pid]["partial_possessions"]) or 0, pid),
            default=None,
        )
        rule = "Most matchup possessions in this scope"
    if player_id is None:
        raise HTTPException(404, "No matchups were observed in this scope.")
    detail = matchup_detail(session, season, phase, player_id, side=side, limit=15)
    return {
        **_envelope(season, phase, scopes, MATCHUP_LIMITATIONS),
        "side": side,
        "focus_rule": rule,
        "detail": detail,
        "sources": _sources(session, totals[player_id]["dataset_ids"] or []),
    }


# --- Play types -----------------------------------------------------------------------------

PLAY_TYPES = {
    "transition": "Transition",
    "isolation": "Isolation",
    "prballhandler": "P&R ball handler",
    "prrollman": "P&R roll man",
    "postup": "Post-up",
    "spotup": "Spot-up",
    "handoff": "Handoff",
    "cut": "Cut",
    "offscreen": "Off screen",
    "offrebound": "Putbacks",
    "misc": "Miscellaneous",
}
PLAY_TYPE_LIMITATIONS = [
    "Play-type-adjusted scoring = points per 100 play-type possessions above (or below) what "
    "the league scored on the same mix of play types. It is descriptive, not a skill estimate.",
    "League rates use every player row the source lists; play types under the source's "
    "minimum are not listed for a player, so frequencies need not sum to 100%.",
    "Some defensive play types were observed empty; they are unknown, not zero.",
]


@dataclass
class _PlayTotals:
    possessions: float = 0.0
    points: float = 0.0
    fga: float = 0.0
    fgm: float = 0.0


def league_play_rates(rows: Sequence[Mapping[str, Any]]) -> dict[str, dict[str, float | None]]:
    totals: dict[str, _PlayTotals] = defaultdict(_PlayTotals)
    for row in rows:
        bucket = totals[str(row["play_type"])]
        bucket.possessions += _num(row["possessions"]) or 0.0
        bucket.points += _num(row["points"]) or 0.0
    return {
        play: {
            "possessions": t.possessions,
            "points": t.points,
            "points_per_possession": _ratio(t.points, t.possessions),
        }
        for play, t in totals.items()
    }


def shape_play_types(
    rows: Sequence[Mapping[str, Any]], names: Mapping[str, str], phase: str, side: str
) -> tuple[list[dict[str, Any]], dict[str, dict[str, float | None]]]:
    league = league_play_rates(rows)
    by_player: dict[str, dict[str, _PlayTotals]] = defaultdict(lambda: defaultdict(_PlayTotals))
    meta: dict[str, dict[str, Any]] = {}
    for row in rows:
        pid = str(row["player_id"])
        bucket = by_player[pid][str(row["play_type"])]
        bucket.possessions += _num(row["possessions"]) or 0.0
        bucket.points += _num(row["points"]) or 0.0
        bucket.fga += _num(row["fga"]) or 0.0
        bucket.fgm += _num(row["fgm"]) or 0.0
        info = meta.setdefault(pid, {"teams": set(), "name": row["source_player_name"], "games": 0})
        info["teams"].add(str(row["team_id"]))
        info["games"] = max(info["games"], int(row["games"] or 0))
    rule = QUALIFY[phase]
    players: list[dict[str, Any]] = []
    for pid, plays in by_player.items():
        poss = sum(t.possessions for t in plays.values())
        points = sum(t.points for t in plays.values())
        expected = sum(
            t.possessions * (league[play]["points_per_possession"] or 0.0)
            for play, t in plays.items()
        )
        breakdown = sorted(
            (
                {
                    "play_type": play,
                    "label": PLAY_TYPES.get(play, play),
                    "possessions": t.possessions,
                    "share": _ratio(t.possessions, poss),
                    "points_per_possession": _ratio(t.points, t.possessions),
                    "league_points_per_possession": league[play]["points_per_possession"],
                    "fg_pct": _ratio(t.fgm, t.fga),
                }
                for play, t in plays.items()
            ),
            key=lambda b: -float(b["possessions"] or 0),
        )
        teams = sorted(meta[pid]["teams"])
        players.append(
            {
                "player_id": pid,
                "player_name": names.get(pid) or meta[pid]["name"] or f"NBA player {pid}",
                "team_tricodes": [code for t in teams if (code := team_tricode(t))],
                "games": meta[pid]["games"],
                "possessions": poss,
                "points": points,
                "points_per_possession": _ratio(points, poss),
                "expected_points_per_possession": _ratio(expected, poss),
                "adjusted_per_100": _ratio(100 * (points - expected), poss),
                "top_play_type": breakdown[0]["play_type"] if breakdown else None,
                "qualified": poss >= rule["possessions"],
                "breakdown": breakdown,
            }
        )
    qualified = [p["player_id"] for p in players if p["qualified"]]
    higher = side == "offensive"
    for key in ("adjusted_per_100", "points_per_possession"):
        ranks = oriented_percentiles(
            {p["player_id"]: p[key] for p in players}, qualified, higher_is_better=higher
        )
        for player in players:
            player.setdefault("percentiles", {})[key] = ranks[player["player_id"]]
    sign = -1 if higher else 1
    players.sort(
        key=lambda p: (
            not p["qualified"],
            sign * (p["adjusted_per_100"] if p["adjusted_per_100"] is not None else 0.0),
            p["player_name"],
        )
    )
    return players, league


def play_types_view(
    session: Session, season: str | None, phase: str | None, side: str, player_id: str | None
) -> dict[str, Any]:
    if side not in ("offensive", "defensive"):
        raise HTTPException(422, "side must be offensive or defensive.")
    season, phase, scopes = _resolve_scope(session, "mart_stats_player_play_types", season, phase)
    rows = _rows(
        session,
        f"""
        SELECT * FROM {_mart("mart_stats_player_play_types")}
        WHERE season = :season AND season_type = :phase AND side = :side
        """,
        season=season,
        phase=phase,
        side=side,
    )
    names = _names(session, [r["player_id"] for r in rows])
    players, league = shape_play_types(rows, names, phase, side)
    known = {p["player_id"] for p in players}
    rule = None
    if player_id not in known:
        # Volume rule, not a result: the player with the most play-type possessions.
        player_id = (
            max(players, key=lambda p: (p["possessions"], p["player_id"]))["player_id"]
            if players
            else None
        )
        rule = "Most play-type possessions in this scope"
    focus = next((p for p in players if p["player_id"] == player_id), None)
    return {
        **_envelope(season, phase, scopes, PLAY_TYPE_LIMITATIONS),
        "side": side,
        "focus_player_id": player_id,
        "focus_rule": rule,
        "focus": focus,
        "league": [
            {"play_type": play, "label": PLAY_TYPES.get(play, play), **rates}
            for play, rates in sorted(league.items(), key=lambda item: -item[1]["possessions"])  # type: ignore[operator]
        ],
        "players": [{k: v for k, v in p.items() if k != "breakdown"} for p in players],
        "sources": _sources(session, {r["dataset_id"] for r in rows}),
    }


# --- Tracking -------------------------------------------------------------------------------

# kind: "total" is a season total shown per game; "rate" and "pct" are shown as reported.
TRACKING_GROUPS: dict[str, dict[str, Any]] = {
    "drives": {
        "label": "Drives",
        "stats": [
            ("drives", "Drives", "total", True),
            ("drive_pts", "Drive points", "total", True),
            ("drive_fga", "Drive FGA", "total", True),
            ("drive_fg_pct", "Drive FG%", "pct", True),
            ("drive_passes_pct", "Pass rate", "pct", None),
            ("drive_ast", "Drive assists", "total", True),
            ("drive_tov", "Drive turnovers", "total", None),
        ],
    },
    "catchshoot": {
        "label": "Catch & shoot",
        "stats": [
            ("catch_shoot_fga", "C&S FGA", "total", True),
            ("catch_shoot_pts", "C&S points", "total", True),
            ("catch_shoot_fg3_a", "C&S 3PA", "total", True),
            ("catch_shoot_fg3_pct", "C&S 3P%", "pct", True),
            ("catch_shoot_efg_pct", "C&S eFG%", "pct", True),
        ],
    },
    "pullupshot": {
        "label": "Pull-ups",
        "stats": [
            ("pull_up_fga", "Pull-up FGA", "total", True),
            ("pull_up_pts", "Pull-up points", "total", True),
            ("pull_up_fg3_a", "Pull-up 3PA", "total", True),
            ("pull_up_fg3_pct", "Pull-up 3P%", "pct", True),
            ("pull_up_efg_pct", "Pull-up eFG%", "pct", True),
        ],
    },
    "possessions": {
        "label": "Touches",
        "stats": [
            ("touches", "Touches", "total", True),
            ("front_ct_touches", "Frontcourt touches", "total", True),
            ("time_of_poss", "Time of possession (min)", "total", True),
            ("avg_sec_per_touch", "Seconds per touch", "rate", None),
            ("avg_drib_per_touch", "Dribbles per touch", "rate", None),
            ("pts_per_touch", "Points per touch", "rate", True),
            ("paint_touches", "Paint touches", "total", True),
            ("post_touches", "Post touches", "total", True),
            ("elbow_touches", "Elbow touches", "total", True),
        ],
    },
    "passing": {
        "label": "Passing",
        "stats": [
            ("passes_made", "Passes made", "total", True),
            ("passes_received", "Passes received", "total", True),
            ("potential_ast", "Potential assists", "total", True),
            ("ast_pts_created", "Assist points created", "total", True),
            ("secondary_ast", "Secondary assists", "total", True),
            ("ast_to_pass_pct", "Assist per pass", "pct", True),
        ],
    },
    "rebounding": {
        "label": "Rebounding",
        "stats": [
            ("reb_chances", "Rebound chances", "total", True),
            ("reb_chance_pct", "Chance conversion", "pct", True),
            ("reb_contest_pct", "Contested share", "pct", None),
            ("oreb_chances", "Offensive chances", "total", True),
            ("dreb_chances", "Defensive chances", "total", True),
            ("avg_reb_dist", "Avg distance (ft)", "rate", None),
        ],
    },
    "speeddistance": {
        "label": "Speed & distance",
        "stats": [
            ("dist_miles", "Miles", "total", True),
            ("dist_miles_off", "Miles on offense", "total", True),
            ("dist_miles_def", "Miles on defense", "total", True),
            ("avg_speed", "Avg speed (mph)", "rate", True),
            ("avg_speed_off", "Offense speed (mph)", "rate", True),
            ("avg_speed_def", "Defense speed (mph)", "rate", True),
        ],
    },
    "defense": {
        "label": "Rim defense",
        "stats": [
            ("def_rim_fga", "Rim FGA defended", "total", True),
            ("def_rim_fgm", "Rim FGM allowed", "total", None),
            ("def_rim_fg_pct", "Rim FG% allowed", "pct", False),
            ("stl", "Steals", "total", True),
            ("blk", "Blocks", "total", True),
        ],
    },
}
TRACKING_LIMITATIONS = [
    "NBA optical tracking aggregates as published; CourtLens does not have frame-level data.",
    "Totals are divided by games played for per-game values. Percentages are as reported.",
    "Percentiles compare minutes-qualified players in the same season and phase. Neutral "
    "columns (style or volume, not quality, e.g. turnovers per game) are not shaded.",
]


def tracking_columns(group: str) -> list[dict[str, Any]]:
    return [
        {"key": key, "label": label, "kind": kind, "higher_is_better": higher}
        for key, label, kind, higher in TRACKING_GROUPS[group]["stats"]
    ]


def shape_tracking(
    rows: Sequence[Mapping[str, Any]], names: Mapping[str, str], phase: str, group: str
) -> list[dict[str, Any]]:
    values: dict[str, dict[str, float | None]] = defaultdict(dict)
    teams: dict[str, str | None] = {}
    for row in rows:
        pid = str(row["player_id"])
        values[pid][str(row["stat"])] = _num(row["value"])
        teams[pid] = str(row["team_id"]) if row["team_id"] else None
    columns = tracking_columns(group)
    rule = QUALIFY[phase]
    players: list[dict[str, Any]] = []
    for pid, stats in values.items():
        games = stats.get("gp")
        minutes = stats.get("min")
        shown: dict[str, float | None] = {}
        for column in columns:
            raw = stats.get(column["key"])
            shown[column["key"]] = _ratio(raw, games) if column["kind"] == "total" else raw
        players.append(
            {
                "player_id": pid,
                "player_name": names.get(pid) or f"NBA player {pid}",
                "team_tricode": team_tricode(teams.get(pid)),
                "games": int(games) if games is not None else None,
                "minutes": minutes,
                "values": shown,
                "qualified": minutes is not None and minutes >= rule["minutes"],
            }
        )
    qualified = [p["player_id"] for p in players if p["qualified"]]
    for column in columns:
        if column["higher_is_better"] is None:
            for player in players:
                player.setdefault("percentiles", {})[column["key"]] = None
            continue
        ranks = oriented_percentiles(
            {p["player_id"]: p["values"][column["key"]] for p in players},
            qualified,
            higher_is_better=column["higher_is_better"],
        )
        for player in players:
            player.setdefault("percentiles", {})[column["key"]] = ranks[player["player_id"]]
    lead = columns[0]["key"]
    players.sort(
        key=lambda p: (
            not p["qualified"],
            -(p["values"][lead] if p["values"][lead] is not None else -1e9),
            p["player_name"],
        )
    )
    return players


def tracking_view(
    session: Session,
    season: str | None,
    phase: str | None,
    group: str,
    player_id: str | None = None,
) -> dict[str, Any]:
    if group not in TRACKING_GROUPS:
        raise HTTPException(422, f"Unknown tracking group {group!r}.")
    season, phase, scopes = _resolve_scope(session, "mart_stats_player_tracking", season, phase)
    keys = [c["key"] for c in tracking_columns(group)] + ["gp", "min"]
    rows = _rows(
        session,
        f"""
        SELECT player_id, team_id, stat, value, dataset_id
        FROM {_mart("mart_stats_player_tracking")}
        WHERE season = :season AND season_type = :phase AND measure = :measure
          AND stat IN :stats
        """,
        season=season,
        phase=phase,
        measure=group,
        stats=keys,
    )
    names = _names(session, [r["player_id"] for r in rows])
    players = shape_tracking(rows, names, phase, group)
    if player_id:
        players = [p for p in players if p["player_id"] == player_id]
    return {
        **_envelope(season, phase, scopes, TRACKING_LIMITATIONS),
        "group": group,
        "groups": [{"value": k, "label": v["label"]} for k, v in TRACKING_GROUPS.items()],
        "columns": tracking_columns(group),
        "players": players,
        "sources": _sources(session, {r["dataset_id"] for r in rows}),
    }


def player_tracking(
    session: Session, player_id: str, season: str | None, phase: str | None
) -> dict[str, Any]:
    """Every tracking group for one player, with league percentiles (player profile tab)."""
    season, phase, scopes = _resolve_scope(session, "mart_stats_player_tracking", season, phase)
    rows = _rows(
        session,
        f"""
        SELECT player_id, team_id, measure, stat, value, dataset_id
        FROM {_mart("mart_stats_player_tracking")}
        WHERE season = :season AND season_type = :phase AND measure IN :measures
        """,
        season=season,
        phase=phase,
        measures=list(TRACKING_GROUPS),
    )
    by_group: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for row in rows:
        by_group[str(row["measure"])].append(row)
    groups = []
    player: dict[str, Any] | None = None
    for group in TRACKING_GROUPS:
        shaped = shape_tracking(by_group.get(group, []), {}, phase, group)
        mine = next((p for p in shaped if p["player_id"] == player_id), None)
        if mine and player is None:
            player = {k: mine[k] for k in ("games", "minutes", "qualified", "team_tricode")}
        groups.append(
            {
                "group": group,
                "label": TRACKING_GROUPS[group]["label"],
                "columns": tracking_columns(group),
                "values": mine["values"] if mine else None,
                "percentiles": mine["percentiles"] if mine else None,
            }
        )
    return {
        **_envelope(season, phase, scopes, TRACKING_LIMITATIONS),
        "player_id": player_id,
        "observed": player is not None,
        "player": player,
        "groups": groups,
        "sources": _sources(session, {r["dataset_id"] for r in rows}),
    }


# --- Draft combine --------------------------------------------------------------------------

COMBINE_LIMITATIONS = [
    "Official NBA Draft Combine measurements as published; players who skipped a drill or "
    "the combine are unknown, never zero.",
    "Span over height = wingspan minus barefoot height. Percentiles compare every measured "
    "combine participant since 2000.",
    "Rows without an NBA person ID stay listed with unknown identity; they are never name-matched.",
    "Combine numbers describe the body at the combine, not current size or player quality.",
]
COMBINE_FIELDS = (
    "height_no_shoes_inches",
    "height_shoes_inches",
    "wingspan_inches",
    "standing_reach_inches",
    "weight_lbs",
    "body_fat_pct",
    "hand_length_inches",
    "hand_width_inches",
    "standing_vertical_inches",
    "max_vertical_inches",
    "lane_agility_seconds",
    "three_quarter_sprint_seconds",
)
# Direction for percentiles: None = descriptive only (size is not "better").
COMBINE_DIRECTIONS: dict[str, bool | None] = {
    "span_minus_height": True,
    "wingspan_inches": True,
    "standing_reach_inches": True,
    "max_vertical_inches": True,
    "standing_vertical_inches": True,
    "lane_agility_seconds": False,
    "three_quarter_sprint_seconds": False,
}


def shape_combine(
    rows: Sequence[Mapping[str, Any]], picks: Mapping[tuple[str, int], Mapping[str, Any]]
) -> list[dict[str, Any]]:
    result: list[dict[str, Any]] = []
    for index, row in enumerate(rows):
        pid = str(row["player_id"]) if row["player_id"] not in (None, "", "-1") else None
        year = int(row["draft_year"])
        values = {field: _num(row[field]) for field in COMBINE_FIELDS}
        height = values["height_no_shoes_inches"]
        span = values["wingspan_inches"]
        pick = picks.get((pid, year)) if pid else None
        result.append(
            {
                "row_key": str(row.get("row_key") or index),
                "player_id": pid,
                "player_name": row["source_player_name"] or "Unknown player",
                "draft_year": year,
                "position": row["combine_position"] or None,
                **values,
                "span_minus_height": None if span is None or height is None else span - height,
                "pick_overall": (
                    int(pick["overall_pick"]) if pick and pick.get("overall_pick") else None
                ),
                "drafted_by": team_tricode(pick["drafting_team_id"]) if pick else None,
            }
        )
    for key, higher in COMBINE_DIRECTIONS.items():
        if higher is None:
            continue
        ranks = oriented_percentiles(
            {r["row_key"]: r[key] for r in result},
            [r["row_key"] for r in result],
            higher_is_better=higher,
        )
        for row in result:
            row.setdefault("percentiles", {})[key] = ranks[row["row_key"]]
    return result


def combine_view(session: Session, draft_year: int | None, player_id: str | None) -> dict[str, Any]:
    rows = _rows(session, f"SELECT * FROM {_mart('mart_stats_draft_combine')}")
    if not rows:
        raise HTTPException(503, "No draft combine observation has been admitted.")
    history = _rows(
        session,
        f"""
        SELECT player_id, draft_year, overall_pick, drafting_team_id, dataset_id
        FROM {_mart("mart_stats_draft_history")}
        """,
    )
    picks = {(str(h["player_id"]), int(h["draft_year"])): h for h in history if h["player_id"]}
    shaped = shape_combine(rows, picks)
    years = sorted({r["draft_year"] for r in shaped}, reverse=True)
    # A searched player is shown within their combine class; a missing record stays unknown.
    found = next((r for r in shaped if player_id and r["player_id"] == player_id), None)
    year = found["draft_year"] if found else draft_year if draft_year in years else years[0]
    chosen = [r for r in shaped if r["draft_year"] == year]
    chosen.sort(key=lambda r: (r["span_minus_height"] is None, -(r["span_minus_height"] or 0)))
    counts: dict[int, int] = defaultdict(int)
    for row in shaped:
        counts[row["draft_year"]] += 1
    measured = [r for r in shaped if r["span_minus_height"] is not None]
    datasets = {r["stats_dataset_id"] for r in rows} | {r["anthro_dataset_id"] for r in rows}
    datasets |= {h["dataset_id"] for h in history}
    return {
        "version": VERSION,
        "source": SOURCE,
        "draft_year": year,
        "draft_years": [{"year": y, "players": counts[y]} for y in years],
        "cohort": {
            "players": len(shaped),
            "measured": len(measured),
            "first_year": years[-1],
            "last_year": years[0],
        },
        "default_rule": None if draft_year or found else "Latest draft class",
        "selected_player_id": found["player_id"] if found else None,
        "limitations": COMBINE_LIMITATIONS,
        "rows": chosen,
        "sources": _sources(session, datasets),
    }
