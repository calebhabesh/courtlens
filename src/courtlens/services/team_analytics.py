"""Team analytical operations service.

Implements Block B15:
- B15a: Canonical team profile service and schedule context (rest days, splits, B2Bs, streaks).
- B15b: Dean Oliver Four Factors (eFG%, TOV%, ORB%, FTR) for offense and defense with league ranks.
- B15c: Team API endpoints and analytical service queries.
"""

from __future__ import annotations

from collections import defaultdict
from datetime import timedelta
from typing import Any

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from courtlens.archive_models import ArchiveTeamGame
from courtlens.domain.team_analytics import (
    FOUR_FACTOR_METRIC_CONFIG,
    compute_league_rankings,
    compute_team_four_factors,
    compute_team_schedule_context,
    compute_team_similarity,
    compute_three_point_variation,
)
from courtlens.domain.team_context import METHOD_VERSION as CONTEXT_METHOD
from courtlens.domain.team_context import (
    TeamGame,
    close_record,
    expected_wins,
    net_rating,
    rolling_net,
    schedule_adjusted,
    standings,
)
from courtlens.domain.team_six_factors import (
    METHOD_VERSION as SIX_FACTOR_METHOD,
)
from courtlens.domain.team_six_factors import (
    box_totals,
    league_rates,
    sum_totals,
    team_six_factors,
)
from courtlens.domain.teams import (
    get_team_info,
    resolve_team_label,
    resolve_team_tricode,
    team_identity,
)
from courtlens.services.history_teams import (
    SEASON_TOTALS_NOTE,
    find_team,
    history_four_factors,
    history_record,
    history_six_factors,
    season_teams,
)
from courtlens.services.workbench_analytics import ResolvedContext
from courtlens.workbench_models import WorkbenchTeamGame


def load_context_team_games(
    session: Session,
    context: ResolvedContext,
    team_id: str | None = None,
) -> list[dict[str, Any]]:
    """Load and normalize raw team game records strictly prior to cutoff."""
    results: list[dict[str, Any]] = []

    if context.dataset_type == "workbench":
        query = select(WorkbenchTeamGame).where(
            WorkbenchTeamGame.dataset_id == context.dataset_id,
            WorkbenchTeamGame.season == context.season,
            WorkbenchTeamGame.phase == context.phase,
            WorkbenchTeamGame.game_date < context.before_date,
        )
        if team_id is not None:
            team_info = get_team_info(team_id)
            match_ids = {team_id}
            if team_info:
                match_ids.add(team_info.team_id)
                match_ids.add(team_info.tricode)
            query = query.where(WorkbenchTeamGame.team_id.in_(match_ids))

        query = query.order_by(WorkbenchTeamGame.game_date.asc(), WorkbenchTeamGame.game_id.asc())

        for game in session.scalars(query):
            stats = game.stats_json or {}
            results.append(
                {
                    "game_id": game.game_id,
                    "game_date": game.game_date,
                    "season": game.season,
                    "phase": game.phase,
                    "team_id": game.team_id,
                    "opponent_id": game.opponent_id,
                    "side": game.side,
                    "points": game.points,
                    "opponent_points": game.opponent_points,
                    "is_final": game.is_final,
                    "stats": stats,
                }
            )
    else:
        archive_query = select(ArchiveTeamGame).where(
            ArchiveTeamGame.dataset_id == context.dataset_id,
            ArchiveTeamGame.season == context.season,
            ArchiveTeamGame.game_date < context.before_date,
        )
        if team_id is not None:
            archive_query = archive_query.where(ArchiveTeamGame.team_id == team_id)

        archive_query = archive_query.order_by(
            ArchiveTeamGame.game_date.asc(), ArchiveTeamGame.game_id.asc()
        )

        for a_game in session.scalars(archive_query):
            stats = a_game.stats_json or {}
            opp_pts = None
            if a_game.points is not None:
                opp_game = session.scalar(
                    select(ArchiveTeamGame).where(
                        ArchiveTeamGame.dataset_id == context.dataset_id,
                        ArchiveTeamGame.game_id == a_game.game_id,
                        ArchiveTeamGame.team_id != a_game.team_id,
                    )
                )
                if opp_game is not None:
                    opp_pts = opp_game.points

            results.append(
                {
                    "game_id": a_game.game_id,
                    "game_date": a_game.game_date,
                    "season": a_game.season,
                    "phase": context.phase,
                    "team_id": a_game.team_id,
                    "opponent_id": a_game.opponent_id,
                    "side": a_game.side,
                    "points": a_game.points,
                    "opponent_points": opp_pts,
                    "is_final": True,
                    "stats": stats,
                }
            )

    return results


def _resolve_team_canonical_id_and_tricode(
    team_id: str, season: str | None = None
) -> tuple[str, str, str]:
    """Resolve (canonical_id, tricode, name) for any team id or tricode in its season."""
    info = team_identity(team_id, season)
    if info:
        return info.team_id, info.tricode, info.name
    # Fallback
    tri = resolve_team_tricode(team_id)
    name = resolve_team_label(team_id)
    return team_id, tri, name


def _compute_all_team_four_factors(
    session: Session,
    context: ResolvedContext,
) -> tuple[dict[str, dict[str, Any]], dict[str, float], dict[str, dict[str, dict[str, Any]]]]:
    """Internal helper to compute four factors, pace, and rankings for all teams in context."""
    history = season_teams(session, context)
    if history is not None:
        # A season served as totals (before 1983-84): the same factors from season totals.
        totals_factors = history_four_factors(history)
        return totals_factors, *compute_league_rankings(totals_factors)
    all_games = load_context_team_games(session, context)

    # Index by (game_id, team_id) -> game
    games_by_game_and_team: dict[tuple[str, str], dict[str, Any]] = {}
    games_by_team: dict[str, list[dict[str, Any]]] = defaultdict(list)

    for g in all_games:
        t_id = g["team_id"]
        # Normalize team key to tricode or canonical id
        t_info = get_team_info(t_id)
        key_id = t_info.tricode if t_info else t_id
        games_by_team[key_id].append(g)
        games_by_game_and_team[(g["game_id"], key_id)] = g
        # Also store original raw team_id for lookup
        games_by_game_and_team[(g["game_id"], t_id)] = g

    all_team_factors: dict[str, dict[str, Any]] = {}

    for tid, t_games in games_by_team.items():
        team_totals: dict[str, float] = defaultdict(float)
        opp_totals: dict[str, float] = defaultdict(float)

        for g in t_games:
            g_stats = g.get("stats") or {}
            for k, v in g_stats.items():
                if v is not None:
                    team_totals[k] += float(v)

            # Look up opponent game
            opp_id = str(g.get("opponent_id") or "")
            opp_info = get_team_info(opp_id) if opp_id else None
            opp_key = opp_info.tricode if opp_info else opp_id
            gid = str(g["game_id"])
            opp_game = games_by_game_and_team.get((gid, opp_key))
            if opp_game is None and opp_id:
                opp_game = games_by_game_and_team.get((gid, opp_id))

            if opp_game:
                o_stats = opp_game.get("stats") or {}
                for k, v in o_stats.items():
                    if v is not None:
                        opp_totals[k] += float(v)
            else:
                # Fallback if opponent row missing: use opponent_points from team game row
                if g.get("opponent_points") is not None:
                    opp_totals["points"] += float(g["opponent_points"])

        factors = compute_team_four_factors(
            dict(team_totals),
            dict(opp_totals),
            games_played=len(t_games),
        )
        all_team_factors[tid] = factors

    league_averages, team_rankings = compute_league_rankings(all_team_factors)
    return all_team_factors, league_averages, team_rankings


# --- Public Service API ---


def get_team_four_factors(
    session: Session,
    context: ResolvedContext,
    team_id: str,
) -> dict[str, Any]:
    """Retrieve complete Dean Oliver Four Factors, ratings, and league rankings for a team."""
    can_id, tricode, name = _resolve_team_canonical_id_and_tricode(team_id, context.season)

    all_team_factors, league_averages, team_rankings = _compute_all_team_four_factors(
        session, context
    )

    # Match target team by tricode or canonical id
    team_key = (
        tricode if tricode in all_team_factors else (can_id if can_id in all_team_factors else None)
    )

    if team_key is None or team_key not in all_team_factors:
        # Check if team is known
        info = team_identity(team_id, context.season)
        if not info:
            raise HTTPException(status_code=404, detail="team not found in snapshot")
        # Empty factors if team played 0 games before cutoff
        factors = compute_team_four_factors({}, {}, games_played=0)
        rankings: dict[str, dict[str, Any]] = {}
    else:
        factors = all_team_factors[team_key]
        rankings = team_rankings.get(team_key, {})

    # Build structured factor item lists
    def _build_metric_item(m_key: str) -> dict[str, Any]:
        cfg = FOUR_FACTOR_METRIC_CONFIG.get(m_key, {})
        rank_info = rankings.get(m_key, {})
        return {
            "key": m_key,
            "display_name": cfg.get("display_name", m_key),
            "factor": cfg.get("factor"),
            "weight": cfg.get("weight"),
            "value": factors.get(m_key),
            "league_avg": league_averages.get(m_key),
            "rank": rank_info.get("rank"),
            "percentile": rank_info.get("percentile"),
            "total_teams": rank_info.get("total_teams", len(all_team_factors)),
            "good_direction": cfg.get("good_direction", "high"),
            "unit": cfg.get("unit", "percentage"),
            "formula": cfg.get("formula", ""),
        }

    offense_factors = [
        _build_metric_item("efg_pct"),
        _build_metric_item("tov_pct"),
        _build_metric_item("oreb_pct"),
        _build_metric_item("ftr"),
    ]

    defense_factors = [
        _build_metric_item("opp_efg_pct"),
        _build_metric_item("opp_tov_pct"),
        _build_metric_item("dreb_pct"),
        _build_metric_item("opp_oreb_pct"),
        _build_metric_item("opp_ftr"),
    ]

    ratings_items = [
        _build_metric_item("off_rating"),
        _build_metric_item("def_rating"),
        _build_metric_item("net_rating"),
        _build_metric_item("pace"),
    ]

    # Three-Point Variation Scenario (Feature F18)
    totals = factors.get("totals", {})
    league_3p_pct = 0.360  # Default fallback
    valid_3pa = sum(
        f["totals"].get("three_pointers_attempted", 0.0)
        for f in all_team_factors.values()
        if "totals" in f
    )
    valid_3pm = sum(
        f["totals"].get("three_pointers_made", 0.0)
        for f in all_team_factors.values()
        if "totals" in f
    )
    if valid_3pa > 0:
        league_3p_pct = round(valid_3pm / valid_3pa, 4)

    three_point_scenario = compute_three_point_variation(
        observed_fg3m=totals.get("three_pointers_made", 0.0),
        observed_fg3a=totals.get("three_pointers_attempted", 0.0),
        points_total=totals.get("points", 0.0),
        possessions=factors.get("possessions_estimated", 0.0),
        games_played=factors.get("games_played", 0),
        def_rating=factors.get("def_rating"),
        league_3p_pct=league_3p_pct,
    )

    team_info_obj = team_identity(team_id, context.season)

    return {
        "team": {
            "id": can_id,
            "tricode": tricode,
            "name": name,
            "city": team_info_obj.city if team_info_obj else "",
            "conference": (team_info_obj.conference or "") if team_info_obj else "",
            "division": (team_info_obj.division or "") if team_info_obj else "",
        },
        "context": context.to_dict(),
        "games_played": factors.get("games_played", 0),
        "pace": factors.get("pace"),
        "off_rating": factors.get("off_rating"),
        "def_rating": factors.get("def_rating"),
        "net_rating": factors.get("net_rating"),
        "ratings": ratings_items,
        "offense_factors": offense_factors,
        "defense_factors": defense_factors,
        "shooting_percentages": {
            "fg_pct": factors.get("fg_pct"),
            "fg3_pct": factors.get("fg3_pct"),
            "ft_pct": factors.get("ft_pct"),
            "opp_fg_pct": factors.get("opp_fg_pct"),
            "opp_fg3_pct": factors.get("opp_fg3_pct"),
            "opp_ft_pct": factors.get("opp_ft_pct"),
        },
        "league_averages": league_averages,
        "three_point_scenario": three_point_scenario,
        "warnings": list(context.warnings),
    }


def get_team_schedule(
    session: Session,
    context: ResolvedContext,
    team_id: str,
) -> dict[str, Any]:
    """Retrieve full chronological schedule, rest days, back-to-backs, and splits for a team."""
    can_id, tricode, name = _resolve_team_canonical_id_and_tricode(team_id, context.season)
    raw_games = load_context_team_games(session, context, team_id=team_id)

    if not raw_games:
        info = team_identity(team_id, context.season)
        if not info:
            raise HTTPException(status_code=404, detail="team not found in snapshot")
    history = season_teams(session, context)
    totals_team = find_team(history, team_id, context.season) if history else None

    # Enrich each game with opponent details
    enriched: list[dict[str, Any]] = []
    for g in raw_games:
        opp_id = g.get("opponent_id", "")
        opp_info = team_identity(opp_id, context.season)
        enriched.append(
            {
                "game_id": g["game_id"],
                "game_date": g["game_date"],
                "side": g.get("side", "home"),
                "opponent_id": opp_info.team_id if opp_info else opp_id,
                "opponent_tricode": opp_info.tricode if opp_info else resolve_team_tricode(opp_id),
                "opponent_name": opp_info.name if opp_info else resolve_team_label(opp_id),
                "points": g.get("points"),
                "opponent_points": g.get("opponent_points"),
            }
        )

    sched_context = compute_team_schedule_context(enriched)
    team_info_obj = team_identity(team_id, context.season)

    return {
        "team": {
            "id": can_id,
            "tricode": tricode,
            "name": name,
            "city": team_info_obj.city if team_info_obj else "",
            "conference": (team_info_obj.conference or "") if team_info_obj else "",
            "division": (team_info_obj.division or "") if team_info_obj else "",
        },
        "context": context.to_dict(),
        # A season served as totals has its record but no games: no splits, never 0-0.
        "overall_record": history_record(totals_team)
        if totals_team
        else sched_context["overall_record"],
        "home_split": None if history is not None else sched_context["home_split"],
        "away_split": None if history is not None else sched_context["away_split"],
        "rest_splits": sched_context["rest_splits"],
        "back_to_back_summary": sched_context["back_to_back_summary"],
        "longest_homestand": sched_context["longest_homestand"],
        "longest_road_trip": sched_context["longest_road_trip"],
        "games": sched_context["games"],
        "warnings": [
            *context.warnings,
            *([SEASON_TOTALS_NOTE.format(season=context.season)] if history is not None else []),
        ],
    }


def get_team_peers(
    session: Session,
    context: ResolvedContext,
    team_id: str,
    limit: int = 10,
) -> dict[str, Any]:
    """Retrieve statistically similar teams based on Four Factors, tempo, and ratings."""
    can_id, tricode, name = _resolve_team_canonical_id_and_tricode(team_id, context.season)

    all_team_factors, _, _ = _compute_all_team_four_factors(session, context)
    team_key = tricode if tricode in all_team_factors else can_id

    if team_key not in all_team_factors:
        info = team_identity(team_id, context.season)
        if not info:
            raise HTTPException(status_code=404, detail="team not found in snapshot")
        return {
            "team": {"id": can_id, "tricode": tricode, "name": name},
            "context": context.to_dict(),
            "peers": [],
            "dimensions_used": [],
            "warnings": list(context.warnings),
        }

    raw_peers = compute_team_similarity(team_key, all_team_factors, limit=limit)

    # Enrich peers with team metadata
    enriched_peers: list[dict[str, Any]] = []
    for p in raw_peers:
        p_id = p["team_id"]
        p_info = team_identity(p_id, context.season)
        enriched_peers.append(
            {
                "team_id": p_info.team_id if p_info else p_id,
                "tricode": p_info.tricode if p_info else resolve_team_tricode(p_id),
                "name": p_info.name if p_info else resolve_team_label(p_id),
                "city": p_info.city if p_info else "",
                "conference": (p_info.conference or "") if p_info else "",
                "distance": p["distance"],
                "similarity_score": p["similarity_score"],
                "dimension_diffs": p["dimension_diffs"],
            }
        )

    dims_used = raw_peers[0]["dimensions_used"] if raw_peers else []

    return {
        "team": {
            "id": can_id,
            "tricode": tricode,
            "name": name,
        },
        "context": context.to_dict(),
        "peers": enriched_peers,
        "dimensions_used": dims_used,
        "warnings": list(context.warnings),
    }


def get_team_three_point_variation(
    session: Session,
    context: ResolvedContext,
    team_id: str,
) -> dict[str, Any]:
    """Retrieve Feature F18 Three-Point Variation scenario for a team."""
    factors_data = get_team_four_factors(session, context, team_id)
    return {
        "team": factors_data["team"],
        "context": factors_data["context"],
        "scenario": factors_data["three_point_scenario"],
        "warnings": factors_data["warnings"],
    }


def get_teams_six_factors(
    session: Session,
    context: ResolvedContext,
    *,
    window_days: int | None = None,
    offense_luck: float = 0.0,
    defense_luck: float = 0.0,
    venue: str | None = None,
) -> dict[str, Any]:
    """Every team's ratings, six factors and context in the scope, optionally over a recent window.

    A window keeps games in the `window_days` days ending at the scope's last game (the cutoff
    bounds that game, so a finished phase ends at its final game rather than an empty stretch
    after it). A game counts only when both teams' box scores are present, so the pooled league
    total covers the same games on both ends; the rest are reported as exclusions, never zeros.

    `venue` ("home" or "away") keeps only each team's games at that venue. The league baseline
    stays every game in the window, so a home split reads against the whole league. Standings
    and the rolling trend always cover every game in scope; schedule strength is solved over the
    window's games.
    """
    history = season_teams(session, context)
    if history is not None:
        return history_six_factors(
            context,
            history,
            window_days=window_days,
            offense_luck=offense_luck,
            defense_luck=defense_luck,
            venue=venue,
        )
    all_games = load_context_team_games(session, context)
    last_game = max((g["game_date"] for g in all_games), default=None)
    window_start = None
    if window_days and last_game is not None:
        window_start = last_game - timedelta(days=window_days - 1)

    by_game: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for g in all_games:
        by_game[str(g["game_id"])].append(g)

    season_games: dict[str, list[TeamGame]] = defaultdict(list)
    excluded_ids: set[str] = set()
    for game_id, rows in by_game.items():
        if len(rows) != 2 or not all(r.get("stats") for r in rows):
            excluded_ids.add(game_id)
            continue
        first, second = rows
        box_a = box_totals(first["stats"], first.get("points"))
        box_b = box_totals(second["stats"], second.get("points"))
        for row, own, opp, other in ((first, box_a, box_b, second), (second, box_b, box_a, first)):
            season_games[str(row["team_id"])].append(
                TeamGame(
                    game_id=game_id,
                    game_date=row["game_date"],
                    venue=str(row.get("side") or ""),
                    opponent=str(other["team_id"]),
                    own=own,
                    opp=opp,
                )
            )

    def in_window(g: TeamGame) -> bool:
        return window_start is None or g.game_date >= window_start

    window_games = {tid: [g for g in gs if in_window(g)] for tid, gs in season_games.items()}
    window_games = {tid: gs for tid, gs in window_games.items() if gs}
    league = sum_totals(g.own for gs in window_games.values() for g in gs)
    strength = schedule_adjusted(
        {
            tid: net
            for tid, gs in window_games.items()
            if (net := net_rating(sum_totals(g.own for g in gs), sum_totals(g.opp for g in gs)))
            is not None
        },
        {tid: [g.opponent for g in gs] for tid, gs in window_games.items()},
    )

    teams: list[dict[str, Any]] = []
    for tid, gs in window_games.items():
        shown = [g for g in gs if not venue or g.venue == venue]
        if not shown:
            continue
        team = sum_totals(g.own for g in shown)
        opponents = sum_totals(g.opp for g in shown)
        canonical_id, tricode, name = _resolve_team_canonical_id_and_tricode(tid, context.season)
        identity = team_identity(tid, context.season)
        wins = sum(1 for g in shown if g.won)
        factors = team_six_factors(
            team, opponents, league, offense_luck=offense_luck, defense_luck=defense_luck
        )
        faced = [strength[g.opponent] for g in shown if g.opponent in strength]
        sos = sum(faced) / len(faced) if faced else None
        x_wins = expected_wins(team.pts, opponents.pts, len(shown))
        close_wins, close_losses = close_record(shown)
        teams.append(
            {
                "team_id": canonical_id,
                "tricode": tricode,
                "name": name,
                "conference": identity.conference if identity else None,
                "division": identity.division if identity else None,
                "games_played": len(shown),
                "wins": wins,
                "losses": len(shown) - wins,
                **factors,
                "sos": sos,
                "adj_net": factors["net"] + sos
                if factors["net"] is not None and sos is not None
                else None,
                "expected_wins": x_wins,
                "win_luck": wins - x_wins if x_wins is not None else None,
                "close_wins": close_wins,
                "close_losses": close_losses,
                "standings": standings(season_games[tid]),
                "trend": rolling_net(season_games[tid]),
            }
        )
    teams.sort(key=lambda t: (t["net"] is None, -(t["net"] or 0.0), t["team_id"]))
    dates = [g.game_date for gs in window_games.values() for g in gs]
    window_ids = {g.game_id for gs in window_games.values() for g in gs}
    excluded = {
        gid
        for gid in excluded_ids
        if window_start is None or by_game[gid][0]["game_date"] >= window_start
    }
    return {
        "context": context.to_dict(),
        "teams": teams,
        "league": league_rates(league),
        "window": {
            "days": window_days,
            "start": window_start.isoformat() if window_start else None,
            "first_game": min(dates).isoformat() if dates else None,
            "last_game": max(dates).isoformat() if dates else None,
            "games": len(window_ids),
            "excluded_games": len(excluded),
        },
        "venue": venue,
        "luck": {"offense": offense_luck, "defense": defense_luck},
        "method_version": SIX_FACTOR_METHOD,
        "context_method_version": CONTEXT_METHOD,
        "warnings": list(context.warnings),
    }
