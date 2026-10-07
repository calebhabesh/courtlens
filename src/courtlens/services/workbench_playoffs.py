"""Playoff data service for bracket queries, series detail, and phase-safe aggregation.

Implements Block B17:
- GET /api/workbench/playoffs (bracket hierarchy, rounds 1-4, series summaries, seed evidence)
- GET /api/workbench/playoffs/series/{series_id} (7-game cards, Four Factors, player stats)
- Temporal discipline via cutoff_date
- Zero inferred claims: descriptive completed facts only, ties note in seeds.
"""

from __future__ import annotations

from datetime import date
from typing import Any

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from courtlens.api.workbench_schemas import (
    PlayerSeriesStats,
    PlayoffBracketResponse,
    PlayoffGameCard,
    PlayoffRoundResponse,
    PlayoffSeedEvidence,
    PlayoffSeriesDetailResponse,
    PlayoffSeriesSummary,
    TeamSeriesHeader,
    TeamSeriesStats,
)
from courtlens.domain.teams import get_team_info, resolve_team_label, resolve_team_tricode
from courtlens.domain.workbench_playoffs import (
    PLAYOFF_CAPABILITIES,
    PLAYOFF_DISCLAIMERS,
    ROUND_NAMES,
    aggregate_player_series_stats,
    aggregate_team_series_factors,
    build_series_slug,
    compute_2_2_1_1_1_hosts,
    get_series_slug_aliases,
    parse_playoff_game_id,
    parse_season_param,
    reconstruct_regular_season_seeds,
)
from courtlens.workbench_models import (
    WorkbenchIdentity,
    WorkbenchPlayerGame,
    WorkbenchSchedule,
    WorkbenchTeamGame,
)


def load_reconstructed_seeds(
    session: Session,
    canonical_season: str,
    playoff_start_date: date | None = None,
    cutoff_date: date | None = None,
) -> tuple[dict[str, list[PlayoffSeedEvidence]], dict[str, int]]:
    """Compute reconstructed regular-season seedings strictly prior to playoff tipoff.

    Returns:
        (seeds_by_conference, team_seed_lookup_map)
    """
    query = select(
        WorkbenchTeamGame.team_id,
        WorkbenchTeamGame.points,
        WorkbenchTeamGame.opponent_points,
        WorkbenchTeamGame.game_date,
    ).where(
        WorkbenchTeamGame.season == canonical_season,
        WorkbenchTeamGame.phase == "regular_season",
    )

    effective_cutoff = cutoff_date
    if playoff_start_date is not None:
        effective_cutoff = (
            min(cutoff_date, playoff_start_date) if cutoff_date else playoff_start_date
        )

    if effective_cutoff is not None:
        query = query.where(WorkbenchTeamGame.game_date < effective_cutoff)

    records_by_team: dict[str, dict[str, Any]] = {}
    for team_id, pts, opp_pts, _ in session.execute(query).fetchall():
        if team_id not in records_by_team:
            records_by_team[team_id] = {"team_id": team_id, "gp": 0, "wins": 0, "losses": 0}
        rec = records_by_team[team_id]
        rec["gp"] += 1
        if pts > opp_pts:
            rec["wins"] += 1
        elif pts < opp_pts:
            rec["losses"] += 1

    seeds_raw = reconstruct_regular_season_seeds(list(records_by_team.values()))

    seeds_pydantic: dict[str, list[PlayoffSeedEvidence]] = {}
    seed_lookup: dict[str, int] = {}

    for conf, team_list in seeds_raw.items():
        seeds_pydantic[conf] = []
        for t in team_list:
            item = PlayoffSeedEvidence(
                team_id=t["team_id"],
                tricode=t["tricode"],
                team_name=t["team_name"],
                conference=t["conference"],
                seed=t["seed"],
                wins=t["wins"],
                losses=t["losses"],
                win_pct=t["win_pct"],
                is_tied=t["is_tied"],
                tie_note=t["tie_note"],
                source_label=t["source_label"],
            )
            seeds_pydantic[conf].append(item)
            seed_lookup[t["team_id"]] = t["seed"]
            seed_lookup[t["tricode"]] = t["seed"]

    return seeds_pydantic, seed_lookup


def get_playoff_bracket(
    session: Session,
    season: int | str = 2024,
    cutoff_date: date | None = None,
) -> PlayoffBracketResponse:
    """Retrieve full playoff bracket hierarchy (rounds 1-4) with series summaries."""
    canonical_season, ending_year, start_yy = parse_season_param(season)

    # 1. Query playoff schedules for this season
    schedules = session.scalars(
        select(WorkbenchSchedule)
        .where(
            WorkbenchSchedule.game_id.like(f"004{start_yy}%"),
        )
        .order_by(WorkbenchSchedule.game_id.asc())
    ).all()

    playoff_start_date = schedules[0].game_date if schedules else None

    # 2. Reconstruct seeds strictly prior to playoff tipoff
    seeds_pydantic, seed_lookup = load_reconstructed_seeds(
        session,
        canonical_season=canonical_season,
        playoff_start_date=playoff_start_date,
        cutoff_date=cutoff_date,
    )

    if not schedules:
        return PlayoffBracketResponse(
            season=canonical_season,
            season_year=ending_year,
            cutoff_date=str(cutoff_date) if cutoff_date else None,
            rounds=[],
            seeds=seeds_pydantic,
            capabilities=dict(PLAYOFF_CAPABILITIES),
            disclaimers=list(PLAYOFF_DISCLAIMERS),
        )

    # 3. Query all team games for these playoff schedules
    playoff_game_ids = [s.game_id for s in schedules]
    team_games = session.scalars(
        select(WorkbenchTeamGame).where(WorkbenchTeamGame.game_id.in_(playoff_game_ids))
    ).all()

    # Map team games by (game_id, team_id)
    team_games_map: dict[tuple[str, str], WorkbenchTeamGame] = {
        (tg.game_id, tg.team_id): tg for tg in team_games
    }

    # Group schedules by 9-digit series ID
    series_schedules: dict[str, list[WorkbenchSchedule]] = {}
    for s in schedules:
        series_id = s.game_id[:9]
        series_schedules.setdefault(series_id, []).append(s)

    series_summaries_by_id: dict[str, PlayoffSeriesSummary] = {}

    for series_id, s_list in sorted(series_schedules.items()):
        s_list.sort(key=lambda s: s.game_id)
        g1 = s_list[0]
        g1_info = parse_playoff_game_id(g1.game_id)

        team1_id = g1.home_team_id
        team2_id = g1.away_team_id

        team1_info = get_team_info(team1_id)
        team2_info = get_team_info(team2_id)

        t1_tricode = team1_info.tricode if team1_info else team1_id
        t2_tricode = team2_info.tricode if team2_info else team2_id
        t1_name = team1_info.name if team1_info else team1_id
        t2_name = team2_info.name if team2_info else team2_id

        t1_seed = seed_lookup.get(team1_id)
        t2_seed = seed_lookup.get(team2_id)

        # Count wins for strictly completed games prior to cutoff
        t1_wins = 0
        t2_wins = 0
        completed_games_count = 0

        for game in s_list:
            if cutoff_date is not None and game.game_date > cutoff_date:
                continue

            t1_row = team_games_map.get((game.game_id, team1_id))
            t2_row = team_games_map.get((game.game_id, team2_id))

            if t1_row and t2_row and t1_row.points is not None and t2_row.points is not None:
                completed_games_count += 1
                if t1_row.points > t2_row.points:
                    t1_wins += 1
                elif t2_row.points > t1_row.points:
                    t2_wins += 1

        winner_id: str | None = None
        winner_tri: str | None = None
        if t1_wins == 4:
            winner_id = team1_id
            winner_tri = t1_tricode
        elif t2_wins == 4:
            winner_id = team2_id
            winner_tri = t2_tricode

        if winner_id:
            status = "finished"
        elif completed_games_count > 0:
            status = "in_progress"
        else:
            status = "scheduled"

        # Format series score & summary text
        if t1_wins == 4:
            series_score = f"{t1_tricode} wins {t1_wins}-{t2_wins}"
            summary_text = f"{t1_name} won series {t1_wins}-{t2_wins}"
        elif t2_wins == 4:
            series_score = f"{t2_tricode} wins {t2_wins}-{t1_wins}"
            summary_text = f"{t2_name} won series {t2_wins}-{t1_wins}"
        elif completed_games_count > 0:
            if t1_wins == t2_wins:
                series_score = f"{t1_tricode} {t1_wins}, {t2_tricode} {t2_wins}"
                summary_text = f"Series tied {t1_wins}-{t2_wins}"
            elif t1_wins > t2_wins:
                series_score = f"{t1_tricode} leads {t1_wins}-{t2_wins}"
                summary_text = f"{t1_name} leads series {t1_wins}-{t2_wins}"
            else:
                series_score = f"{t2_tricode} leads {t2_wins}-{t1_wins}"
                summary_text = f"{t2_name} leads series {t2_wins}-{t1_wins}"
        else:
            series_score = f"{t1_tricode} vs {t2_tricode}"
            summary_text = "Series scheduled"

        is_sweep = (t1_wins == 4 and t2_wins == 0) or (t2_wins == 4 and t1_wins == 0)
        slug = build_series_slug(
            ending_year, g1_info.round_number, t1_tricode, t2_tricode, g1_info.matchup_index
        )

        summary = PlayoffSeriesSummary(
            series_id=series_id,
            slug=slug,
            season=canonical_season,
            round_number=g1_info.round_number,
            round_name=g1_info.round_name,
            conference=g1_info.conference,
            matchup_index=g1_info.matchup_index,
            team1=TeamSeriesHeader(
                team_id=team1_id, tricode=t1_tricode, name=t1_name, seed=t1_seed, wins=t1_wins
            ),
            team2=TeamSeriesHeader(
                team_id=team2_id, tricode=t2_tricode, name=t2_name, seed=t2_seed, wins=t2_wins
            ),
            series_score=series_score,
            status=status,
            winner_team_id=winner_id,
            winner_tricode=winner_tri,
            games_count=completed_games_count,
            total_scheduled=7,
            is_sweep=is_sweep,
            summary_text=summary_text,
        )
        series_summaries_by_id[series_id] = summary

    # Group into rounds 1..4
    rounds_pydantic: list[PlayoffRoundResponse] = []

    for r_num in [1, 2, 3, 4]:
        r_name = ROUND_NAMES[r_num]
        round_series = [s for s in series_summaries_by_id.values() if s.round_number == r_num]
        round_series.sort(key=lambda s: s.matchup_index)

        east = [s for s in round_series if s.conference == "Eastern"]
        west = [s for s in round_series if s.conference == "Western"]
        finals = [s for s in round_series if s.conference is None]

        rounds_pydantic.append(
            PlayoffRoundResponse(
                round_number=r_num,
                round_name=r_name,
                eastern_series=east,
                western_series=west,
                finals_series=finals,
                series=round_series,
            )
        )

    return PlayoffBracketResponse(
        season=canonical_season,
        season_year=ending_year,
        cutoff_date=str(cutoff_date) if cutoff_date else None,
        rounds=rounds_pydantic,
        seeds=seeds_pydantic,
        capabilities=dict(PLAYOFF_CAPABILITIES),
        disclaimers=list(PLAYOFF_DISCLAIMERS),
    )


def resolve_series_identifier(
    session: Session,
    identifier: str,
) -> tuple[str, int, str]:
    """Resolve raw series ID, 10-digit game ID, or slug alias into (series_id, year, season)."""
    raw = identifier.strip()

    # Direct 9-character series ID (e.g. 004230040)
    if len(raw) == 9 and raw.startswith("004"):
        info = parse_playoff_game_id(f"{raw}1")
        return raw, info.season_ending_year, info.canonical_season

    # Direct 10-character game ID (e.g. 0042300401)
    if len(raw) == 10 and raw.startswith("004"):
        info = parse_playoff_game_id(raw)
        return info.series_id, info.season_ending_year, info.canonical_season

    # Search by slug alias
    # Determine candidate seasons
    candidate_years = [2024, 2025, 2026]
    lowered = raw.lower()

    if lowered.startswith("2024-"):
        candidate_years = [2024]
    elif lowered.startswith("2025-"):
        candidate_years = [2025]
    elif lowered.startswith("2026-"):
        candidate_years = [2026]

    for y in candidate_years:
        _, ending_year, start_yy = parse_season_param(y)
        scheds = session.scalars(
            select(WorkbenchSchedule)
            .where(WorkbenchSchedule.game_id.like(f"004{start_yy}%"))
            .order_by(WorkbenchSchedule.game_id.asc())
        ).all()

        series_map: dict[str, list[WorkbenchSchedule]] = {}
        for s in scheds:
            sid = s.game_id[:9]
            series_map.setdefault(sid, []).append(s)

        for sid, s_list in series_map.items():
            g1 = s_list[0]
            g1_info = parse_playoff_game_id(g1.game_id)
            t1 = resolve_team_tricode(g1.home_team_id)
            t2 = resolve_team_tricode(g1.away_team_id)

            aliases = get_series_slug_aliases(
                season_ending_year=ending_year,
                round_number=g1_info.round_number,
                team1_tricode=t1,
                team2_tricode=t2,
                matchup_index=g1_info.matchup_index,
            )
            if lowered in [a.lower() for a in aliases]:
                return sid, ending_year, g1_info.canonical_season

    raise HTTPException(status_code=404, detail=f"Playoff series '{identifier}' not found.")


def get_playoff_series_detail(
    session: Session,
    series_id_or_slug: str,
    cutoff_date: date | None = None,
) -> PlayoffSeriesDetailResponse:
    """Retrieve playoff series detail with 7-game cards, Four Factors, and player stats."""
    series_id, ending_year, canonical_season = resolve_series_identifier(session, series_id_or_slug)

    # 1. Query schedules for this series
    schedules = session.scalars(
        select(WorkbenchSchedule)
        .where(WorkbenchSchedule.game_id.like(f"{series_id}%"))
        .order_by(WorkbenchSchedule.game_id.asc())
    ).all()

    if not schedules:
        raise HTTPException(
            status_code=404, detail=f"Playoff series '{series_id}' has no scheduled games."
        )

    g1 = schedules[0]
    g1_info = parse_playoff_game_id(g1.game_id)

    team1_id = g1.home_team_id
    team2_id = g1.away_team_id

    team1_info = get_team_info(team1_id)
    team2_info = get_team_info(team2_id)

    t1_tricode = team1_info.tricode if team1_info else team1_id
    t2_tricode = team2_info.tricode if team2_info else team2_id
    t1_name = team1_info.name if team1_info else team1_id
    t2_name = team2_info.name if team2_info else team2_id

    slug = build_series_slug(
        ending_year, g1_info.round_number, t1_tricode, t2_tricode, g1_info.matchup_index
    )

    # 2. Load seeds from regular season
    _, seed_lookup = load_reconstructed_seeds(
        session,
        canonical_season=canonical_season,
        playoff_start_date=schedules[0].game_date,
        cutoff_date=cutoff_date,
    )
    t1_seed = seed_lookup.get(team1_id)
    t2_seed = seed_lookup.get(team2_id)

    # 3. Query all team games for this series
    all_game_ids = [s.game_id for s in schedules]
    team_games = session.scalars(
        select(WorkbenchTeamGame).where(WorkbenchTeamGame.game_id.in_(all_game_ids))
    ).all()

    team_games_map: dict[tuple[str, str], WorkbenchTeamGame] = {
        (tg.game_id, tg.team_id): tg for tg in team_games
    }

    # 4. Generate 7-game cards with strict placeholder treatment
    host_map = compute_2_2_1_1_1_hosts(team1_id, team2_id)
    sched_by_num = {int(s.game_id[9]): s for s in schedules}

    game_cards: list[PlayoffGameCard] = []
    completed_game_ids: list[str] = []

    for g_num in range(1, 8):
        if g_num in sched_by_num:
            sched = sched_by_num[g_num]
            is_after_cutoff = cutoff_date is not None and sched.game_date > cutoff_date

            if is_after_cutoff:
                game_cards.append(
                    PlayoffGameCard(
                        game_id=sched.game_id,
                        game_number=g_num,
                        game_date=str(sched.game_date),
                        home_team_id=sched.home_team_id,
                        home_team_tricode=resolve_team_tricode(sched.home_team_id),
                        away_team_id=sched.away_team_id,
                        away_team_tricode=resolve_team_tricode(sched.away_team_id),
                        home_score=None,
                        away_score=None,
                        status="scheduled",
                        venue=f"{resolve_team_label(sched.home_team_id)} Arena",
                        winner_team_id=None,
                        margin=None,
                    )
                )
            else:
                home_tg = team_games_map.get((sched.game_id, sched.home_team_id))
                away_tg = team_games_map.get((sched.game_id, sched.away_team_id))

                home_score = home_tg.points if home_tg else None
                away_score = away_tg.points if away_tg else None

                winner_id: str | None = None
                margin: int | None = None
                if home_score is not None and away_score is not None:
                    completed_game_ids.append(sched.game_id)
                    margin = abs(home_score - away_score)
                    if home_score > away_score:
                        winner_id = sched.home_team_id
                    elif away_score > home_score:
                        winner_id = sched.away_team_id

                game_cards.append(
                    PlayoffGameCard(
                        game_id=sched.game_id,
                        game_number=g_num,
                        game_date=str(sched.game_date),
                        home_team_id=sched.home_team_id,
                        home_team_tricode=resolve_team_tricode(sched.home_team_id),
                        away_team_id=sched.away_team_id,
                        away_team_tricode=resolve_team_tricode(sched.away_team_id),
                        home_score=home_score,
                        away_score=away_score,
                        status="final" if home_score is not None else "scheduled",
                        venue=f"{resolve_team_label(sched.home_team_id)} Arena",
                        winner_team_id=winner_id,
                        margin=margin,
                    )
                )
        else:
            # Unplayed placeholder (Games 5, 6, 7 not scheduled / not needed)
            exp_home, exp_away = host_map[g_num]
            game_cards.append(
                PlayoffGameCard(
                    game_id=f"{series_id}{g_num}",
                    game_number=g_num,
                    game_date=None,
                    home_team_id=exp_home,
                    home_team_tricode=resolve_team_tricode(exp_home),
                    away_team_id=exp_away,
                    away_team_tricode=resolve_team_tricode(exp_away),
                    home_score=None,
                    away_score=None,
                    status="unplayed_placeholder",
                    venue=None,
                    winner_team_id=None,
                    margin=None,
                )
            )

    # 5. Team Four Factors & Ratings aggregation over strictly completed games
    completed_team_games_raw: list[dict[str, Any]] = []
    for tg in team_games:
        if tg.game_id in completed_game_ids:
            completed_team_games_raw.append(
                {
                    "game_id": tg.game_id,
                    "team_id": tg.team_id,
                    "opponent_id": tg.opponent_id,
                    "points": tg.points,
                    "opponent_points": tg.opponent_points,
                    "stats": tg.stats_json or {},
                }
            )

    t1_factors = aggregate_team_series_factors(team1_id, completed_team_games_raw)
    t2_factors = aggregate_team_series_factors(team2_id, completed_team_games_raw)

    team1_stats = TeamSeriesStats(
        team_id=team1_id,
        tricode=t1_tricode,
        team_name=t1_name,
        seed=t1_seed,
        wins=t1_factors["wins"],
        losses=t1_factors["losses"],
        games_played=t1_factors["games_played"],
        points_per_game=t1_factors["points_per_game"],
        opponent_points_per_game=t1_factors["opponent_points_per_game"],
        average_margin=t1_factors["average_margin"],
        pace=t1_factors["pace"],
        off_rating=t1_factors["off_rating"],
        def_rating=t1_factors["def_rating"],
        net_rating=t1_factors["net_rating"],
        efg_pct=t1_factors["efg_pct"],
        tov_pct=t1_factors["tov_pct"],
        oreb_pct=t1_factors["oreb_pct"],
        ftr=t1_factors["ftr"],
        totals=t1_factors["totals"],
    )

    team2_stats = TeamSeriesStats(
        team_id=team2_id,
        tricode=t2_tricode,
        team_name=t2_name,
        seed=t2_seed,
        wins=t2_factors["wins"],
        losses=t2_factors["losses"],
        games_played=t2_factors["games_played"],
        points_per_game=t2_factors["points_per_game"],
        opponent_points_per_game=t2_factors["opponent_points_per_game"],
        average_margin=t2_factors["average_margin"],
        pace=t2_factors["pace"],
        off_rating=t2_factors["off_rating"],
        def_rating=t2_factors["def_rating"],
        net_rating=t2_factors["net_rating"],
        efg_pct=t2_factors["efg_pct"],
        tov_pct=t2_factors["tov_pct"],
        oreb_pct=t2_factors["oreb_pct"],
        ftr=t2_factors["ftr"],
        totals=t2_factors["totals"],
    )

    # 6. Player series statistics aggregation
    player_games = (
        session.scalars(
            select(WorkbenchPlayerGame).where(WorkbenchPlayerGame.game_id.in_(completed_game_ids))
        ).all()
        if completed_game_ids
        else []
    )

    pids = list({pg.player_id for pg in player_games})
    identities: dict[str, str] = {}
    if pids:
        for ident in session.scalars(
            select(WorkbenchIdentity).where(
                WorkbenchIdentity.external_id.in_(pids), WorkbenchIdentity.kind == "player"
            )
        ):
            identities[ident.external_id] = ident.display_name

    t1_pg_raw = [
        {
            "player_id": pg.player_id,
            "team_id": pg.team_id,
            "appearance": pg.appearance,
            "minutes_seconds": pg.minutes_seconds,
            "points": pg.points,
            "stats": pg.stats_json or {},
        }
        for pg in player_games
        if pg.team_id == team1_id
    ]

    t2_pg_raw = [
        {
            "player_id": pg.player_id,
            "team_id": pg.team_id,
            "appearance": pg.appearance,
            "minutes_seconds": pg.minutes_seconds,
            "points": pg.points,
            "stats": pg.stats_json or {},
        }
        for pg in player_games
        if pg.team_id == team2_id
    ]

    t1_player_stats = [
        PlayerSeriesStats(**p) for p in aggregate_player_series_stats(t1_pg_raw, identities)
    ]
    t2_player_stats = [
        PlayerSeriesStats(**p) for p in aggregate_player_series_stats(t2_pg_raw, identities)
    ]

    # 7. Series status & winner
    t1_wins = team1_stats.wins
    t2_wins = team2_stats.wins
    series_winner_id: str | None = None
    series_winner_tri: str | None = None

    if t1_wins == 4:
        series_winner_id = team1_id
        series_winner_tri = t1_tricode
    elif t2_wins == 4:
        series_winner_id = team2_id
        series_winner_tri = t2_tricode

    if series_winner_id:
        status = "finished"
    elif len(completed_game_ids) > 0:
        status = "in_progress"
    else:
        status = "scheduled"

    if t1_wins == 4:
        series_score = f"{t1_tricode} wins {t1_wins}-{t2_wins}"
    elif t2_wins == 4:
        series_score = f"{t2_tricode} wins {t2_wins}-{t1_wins}"
    elif len(completed_game_ids) > 0:
        if t1_wins == t2_wins:
            series_score = f"{t1_tricode} {t1_wins}, {t2_tricode} {t2_wins}"
        elif t1_wins > t2_wins:
            series_score = f"{t1_tricode} leads {t1_wins}-{t2_wins}"
        else:
            series_score = f"{t2_tricode} leads {t2_wins}-{t1_wins}"
    else:
        series_score = f"{t1_tricode} vs {t2_tricode}"

    return PlayoffSeriesDetailResponse(
        series_id=series_id,
        slug=slug,
        season=canonical_season,
        season_year=ending_year,
        round_number=g1_info.round_number,
        round_name=g1_info.round_name,
        conference=g1_info.conference,
        matchup_index=g1_info.matchup_index,
        status=status,
        series_score=series_score,
        winner_team_id=series_winner_id,
        winner_tricode=series_winner_tri,
        cutoff_date=str(cutoff_date) if cutoff_date else None,
        team1=team1_stats,
        team2=team2_stats,
        game_cards=game_cards,
        team1_players=t1_player_stats,
        team2_players=t2_player_stats,
        capabilities=dict(PLAYOFF_CAPABILITIES),
        disclaimers=list(PLAYOFF_DISCLAIMERS),
    )
