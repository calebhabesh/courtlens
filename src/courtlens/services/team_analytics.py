"""Team analytical operations service.

Implements Block B15:
- B15a: Canonical team profile service and schedule context (rest days, splits, B2Bs, streaks).
- B15b: Dean Oliver Four Factors (eFG%, TOV%, ORB%, FTR) for offense and defense with league ranks.
- B15c: Team API endpoints and analytical service queries.
"""

from __future__ import annotations

from collections import defaultdict
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
from courtlens.domain.teams import get_team_info, resolve_team_label, resolve_team_tricode
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


def _resolve_team_canonical_id_and_tricode(team_id: str) -> tuple[str, str, str]:
    """Resolve (canonical_id, tricode, name) for any team id or tricode."""
    info = get_team_info(team_id)
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
    can_id, tricode, name = _resolve_team_canonical_id_and_tricode(team_id)

    all_team_factors, league_averages, team_rankings = _compute_all_team_four_factors(
        session, context
    )

    # Match target team by tricode or canonical id
    team_key = (
        tricode if tricode in all_team_factors else (can_id if can_id in all_team_factors else None)
    )

    if team_key is None or team_key not in all_team_factors:
        # Check if team is known
        info = get_team_info(team_id)
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

    team_info_obj = get_team_info(team_id)

    return {
        "team": {
            "id": can_id,
            "tricode": tricode,
            "name": name,
            "city": team_info_obj.city if team_info_obj else "",
            "conference": team_info_obj.conference if team_info_obj else "",
            "division": team_info_obj.division if team_info_obj else "",
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
    can_id, tricode, name = _resolve_team_canonical_id_and_tricode(team_id)
    raw_games = load_context_team_games(session, context, team_id=team_id)

    if not raw_games:
        info = get_team_info(team_id)
        if not info:
            raise HTTPException(status_code=404, detail="team not found in snapshot")

    # Enrich each game with opponent details
    enriched: list[dict[str, Any]] = []
    for g in raw_games:
        opp_id = g.get("opponent_id", "")
        opp_info = get_team_info(opp_id)
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
    team_info_obj = get_team_info(team_id)

    return {
        "team": {
            "id": can_id,
            "tricode": tricode,
            "name": name,
            "city": team_info_obj.city if team_info_obj else "",
            "conference": team_info_obj.conference if team_info_obj else "",
            "division": team_info_obj.division if team_info_obj else "",
        },
        "context": context.to_dict(),
        "overall_record": sched_context["overall_record"],
        "home_split": sched_context["home_split"],
        "away_split": sched_context["away_split"],
        "rest_splits": sched_context["rest_splits"],
        "back_to_back_summary": sched_context["back_to_back_summary"],
        "longest_homestand": sched_context["longest_homestand"],
        "longest_road_trip": sched_context["longest_road_trip"],
        "games": sched_context["games"],
        "warnings": list(context.warnings),
    }


def get_team_peers(
    session: Session,
    context: ResolvedContext,
    team_id: str,
    limit: int = 10,
) -> dict[str, Any]:
    """Retrieve statistically similar teams based on Four Factors, tempo, and ratings."""
    can_id, tricode, name = _resolve_team_canonical_id_and_tricode(team_id)

    all_team_factors, _, _ = _compute_all_team_four_factors(session, context)
    team_key = tricode if tricode in all_team_factors else can_id

    if team_key not in all_team_factors:
        info = get_team_info(team_id)
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
        p_info = get_team_info(p_id)
        enriched_peers.append(
            {
                "team_id": p_info.team_id if p_info else p_id,
                "tricode": p_info.tricode if p_info else resolve_team_tricode(p_id),
                "name": p_info.name if p_info else resolve_team_label(p_id),
                "city": p_info.city if p_info else "",
                "conference": p_info.conference if p_info else "",
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
