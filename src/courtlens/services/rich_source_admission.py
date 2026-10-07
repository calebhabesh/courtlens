"""Service orchestrating rich-source admission, invariant verification, and quarantine reporting.

Implements Block B19:
- Bounded ingestion adapters for PBP, possessions, game lineups, shots, and matchups
- Source bytes and SHA-256 hash retention
- Strict invariant checks (clock bounds, 5-player sides, point conservation,
  shot attempt/make joins)
- Explicit quarantine of non-conforming games with structured rejection records
- Immutable storage under allow_admin_mutation
"""

from __future__ import annotations

import logging
from dataclasses import asdict
from pathlib import Path
from typing import Any

from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from courtlens.config import get_settings
from courtlens.domain.rich_sources import (
    MATCHUP_PAIR_VERSION,
    POSSESSION_POLICY_VERSION,
    RICH_PARSER_SIGNATURE,
    SHOT_ZONES_VERSION,
    NormalizedLineupStint,
    NormalizedMatchup,
    NormalizedPbpEvent,
    NormalizedPossession,
    NormalizedShot,
    RejectedGameRecord,
    RichAdmissionSummary,
    open_file_stream,
    parse_lineups_stream,
    parse_matchups_stream,
    parse_pbp_stream,
    parse_possessions_stream,
    parse_shots_stream,
    validate_game_matchups_invariants,
    validate_game_pbp_invariants,
    validate_game_possessions_invariants,
    validate_game_shots_invariants,
)
from courtlens.ingestion.sportsdataverse import hash_file
from courtlens.ingestion.workbench_source_config import (
    canonical_season_name,
    lineups_url,
    matchups_url,
    pbp_url,
    possessions_url,
    shots_url,
)
from courtlens.models import new_uuid, utc_now
from courtlens.workbench_models import (
    WorkbenchDataset,
    WorkbenchLineup,
    WorkbenchMatchup,
    WorkbenchPbpEvent,
    WorkbenchPlayerGame,
    WorkbenchPossession,
    WorkbenchRichAdmission,
    WorkbenchSchedule,
    WorkbenchShot,
    WorkbenchTeamGame,
    allow_admin_mutation,
)

logger = logging.getLogger(__name__)


def admit_rich_sources_for_season(
    session: Session,
    dataset_id: str,
    season_ending_year: int,
    raw_root: Path | None = None,
    target_game_ids: set[str] | None = None,
    limit_games: int | None = None,
    families: list[str] | None = None,
) -> dict[str, RichAdmissionSummary]:
    """Admit and verify rich source files for a dataset and season.

    Validates clock sequences, 5-man lineups, point conservation, shot joins, and matchup pairs.
    Every non-conforming game is quarantined and recorded in the admission report.
    Admitted records are stored immutably.
    """
    dataset = session.get(WorkbenchDataset, dataset_id)
    if not dataset:
        raise ValueError(f"Dataset {dataset_id} not found")

    root = raw_root or get_settings().raw_store_path
    season_dir = root / f"sportsdataverse_{season_ending_year}"
    canonical_season = canonical_season_name(season_ending_year)

    selected_families = families or ["pbp", "possessions", "lineups", "shots", "matchups"]

    # 1. Load baseline validation facts from dataset for reconciliation
    # Team points: (game_id, team_id) -> points
    team_games = session.scalars(
        select(WorkbenchTeamGame).where(
            WorkbenchTeamGame.dataset_id == dataset_id,
            WorkbenchTeamGame.season == canonical_season,
        )
    ).all()
    team_pts_by_game: dict[str, dict[str, int]] = {}
    for tg in team_games:
        if tg.game_id not in team_pts_by_game:
            team_pts_by_game[tg.game_id] = {}
        team_pts_by_game[tg.game_id][tg.team_id] = tg.points

    # Player stats: (game_id, player_id) -> stats
    player_games = session.scalars(
        select(WorkbenchPlayerGame).where(
            WorkbenchPlayerGame.dataset_id == dataset_id,
            WorkbenchPlayerGame.season == canonical_season,
        )
    ).all()
    player_fga_by_game: dict[str, dict[str, int]] = {}
    player_fgm_by_game: dict[str, dict[str, int]] = {}
    active_players_by_game: dict[str, set[str]] = {}
    for pg in player_games:
        gid = pg.game_id
        pid = pg.player_id
        if gid not in player_fga_by_game:
            player_fga_by_game[gid] = {}
            player_fgm_by_game[gid] = {}
            active_players_by_game[gid] = set()
        active_players_by_game[gid].add(pid)
        stats = pg.stats_json or {}
        fga = stats.get("field_goals_attempted")
        fgm = stats.get("field_goals_made")
        if fga is not None:
            player_fga_by_game[gid][pid] = int(fga)
        if fgm is not None:
            player_fgm_by_game[gid][pid] = int(fgm)

    # Known schedule games
    schedules = session.scalars(
        select(WorkbenchSchedule).where(
            WorkbenchSchedule.dataset_id == dataset_id,
            WorkbenchSchedule.season == canonical_season,
        )
    ).all()
    scheduled_game_ids = {s.game_id for s in schedules}

    summaries: dict[str, RichAdmissionSummary] = {}

    with allow_admin_mutation(session):
        # -------------------------------------------------------------------
        # Family 1: PBP
        # -------------------------------------------------------------------
        if "pbp" in selected_families:
            pbp_path = season_dir / f"nba_play_by_play_{season_ending_year}.csv.gz"
            if not pbp_path.exists():
                pbp_path = season_dir / f"nba_play_by_play_{season_ending_year}.csv"

            if pbp_path.exists():
                sha, size = hash_file(pbp_path)
                with open_file_stream(pbp_path) as stream:
                    games_events, parse_rejected = parse_pbp_stream(
                        stream, target_game_ids=target_game_ids, limit_games=limit_games
                    )

                all_rejected = list(parse_rejected)
                admitted_events: list[NormalizedPbpEvent] = []
                admitted_games: set[str] = set()

                for gid, events in games_events.items():
                    valid, reason = validate_game_pbp_invariants(gid, events)
                    if not valid:
                        all_rejected.append(
                            RejectedGameRecord(
                                game_id=gid,
                                source_family="pbp",
                                rejection_code="pbp_invariant_failed",
                                detail=reason or "unknown",
                            )
                        )
                    else:
                        admitted_events.extend(events)
                        admitted_games.add(gid)

                # Persist admitted PBP events
                # Clear existing for this dataset and season if re-running
                if admitted_games:
                    session.execute(
                        delete(WorkbenchPbpEvent).where(
                            WorkbenchPbpEvent.dataset_id == dataset_id,
                            WorkbenchPbpEvent.game_id.in_(list(admitted_games)),
                        )
                    )

                for ev in admitted_events:
                    session.add(
                        WorkbenchPbpEvent(
                            id=new_uuid(),
                            dataset_id=dataset_id,
                            game_id=ev.game_id,
                            order_index=ev.order_index,
                            action_number=ev.action_number,
                            period=ev.period,
                            clock=ev.clock,
                            seconds_remaining=ev.seconds_remaining,
                            event_type=ev.event_type,
                            action_type=ev.action_type,
                            sub_type=ev.sub_type,
                            team_id=ev.team_id,
                            person_id=ev.person_id,
                            score_home=ev.score_home,
                            score_away=ev.score_away,
                            points_total=ev.points_total,
                            shot_value=ev.shot_value,
                            shot_distance=ev.shot_distance,
                            x_legacy=ev.x_legacy,
                            y_legacy=ev.y_legacy,
                            possession_number=ev.possession_number,
                            off_lineup_json=ev.off_lineup,
                            def_lineup_json=ev.def_lineup,
                            description=ev.description,
                            video_available=ev.video_available,
                            source_hash=ev.source_hash,
                            status="valid",
                        )
                    )

                pbp_summary = RichAdmissionSummary(
                    season=canonical_season,
                    source_family="pbp",
                    total_games_expected=len(scheduled_game_ids),
                    total_games_observed=len(games_events),
                    total_games_admitted=len(admitted_games),
                    total_games_rejected=len({r.game_id for r in all_rejected}),
                    rejected_games=all_rejected,
                    reconciliation_summary={
                        "admitted_event_rows": len(admitted_events),
                        "unique_admitted_games": len(admitted_games),
                    },
                    source_sha256=sha,
                    source_bytes=size,
                    parser_signature=RICH_PARSER_SIGNATURE,
                    policy_version=POSSESSION_POLICY_VERSION,
                )
                summaries["pbp"] = pbp_summary

                _record_rich_admission(
                    session,
                    dataset_id,
                    canonical_season,
                    "pbp",
                    pbp_url(season_ending_year),
                    pbp_summary,
                )

        # -------------------------------------------------------------------
        # Family 2: Possessions
        # -------------------------------------------------------------------
        if "possessions" in selected_families:
            poss_path = season_dir / f"nba_possessions_{season_ending_year}.csv.gz"
            if not poss_path.exists():
                poss_path = season_dir / f"nba_possessions_{season_ending_year}.csv"

            if poss_path.exists():
                sha, size = hash_file(poss_path)
                with open_file_stream(poss_path) as stream:
                    games_poss, parse_rejected = parse_possessions_stream(
                        stream, target_game_ids=target_game_ids, limit_games=limit_games
                    )

                all_rejected = list(parse_rejected)
                admitted_poss: list[NormalizedPossession] = []
                admitted_games = set()

                for gid, possessions in games_poss.items():
                    # Team point conservation
                    pts_lookup = team_pts_by_game.get(gid)
                    valid, reason = validate_game_possessions_invariants(
                        gid, possessions, team_points_lookup=pts_lookup
                    )
                    if not valid:
                        all_rejected.append(
                            RejectedGameRecord(
                                game_id=gid,
                                source_family="possessions",
                                rejection_code="possession_invariant_failed",
                                detail=reason or "unknown",
                            )
                        )
                    else:
                        admitted_poss.extend(possessions)
                        admitted_games.add(gid)

                if admitted_games:
                    session.execute(
                        delete(WorkbenchPossession).where(
                            WorkbenchPossession.dataset_id == dataset_id,
                            WorkbenchPossession.game_id.in_(list(admitted_games)),
                        )
                    )

                for p in admitted_poss:
                    session.add(
                        WorkbenchPossession(
                            id=new_uuid(),
                            dataset_id=dataset_id,
                            game_id=p.game_id,
                            possession_number=p.possession_number,
                            period=p.period,
                            number_in_period=p.number_in_period,
                            offense_team_id=p.offense_team_id,
                            defense_team_id=p.defense_team_id,
                            start_order_index=p.start_order_index,
                            end_order_index=p.end_order_index,
                            start_seconds_remaining=p.start_seconds_remaining,
                            end_seconds_remaining=p.end_seconds_remaining,
                            points=p.points,
                            is_second_chance=p.is_second_chance,
                            possession_start_type=p.possession_start_type,
                            count_as_possession=p.count_as_possession,
                            stats_json=p.stats_json,
                            off_lineup_json=p.off_lineup,
                            def_lineup_json=p.def_lineup,
                            lineup_source=p.lineup_source,
                            policy_version=p.policy_version,
                            source_hash=p.source_hash,
                            status="valid",
                        )
                    )

                poss_summary = RichAdmissionSummary(
                    season=canonical_season,
                    source_family="possessions",
                    total_games_expected=len(scheduled_game_ids),
                    total_games_observed=len(games_poss),
                    total_games_admitted=len(admitted_games),
                    total_games_rejected=len({r.game_id for r in all_rejected}),
                    rejected_games=all_rejected,
                    reconciliation_summary={
                        "admitted_possession_rows": len(admitted_poss),
                        "unique_admitted_games": len(admitted_games),
                        "policy_verified": POSSESSION_POLICY_VERSION,
                    },
                    source_sha256=sha,
                    source_bytes=size,
                    parser_signature=RICH_PARSER_SIGNATURE,
                    policy_version=POSSESSION_POLICY_VERSION,
                )
                summaries["possessions"] = poss_summary

                _record_rich_admission(
                    session,
                    dataset_id,
                    canonical_season,
                    "possessions",
                    possessions_url(season_ending_year),
                    poss_summary,
                )

        # -------------------------------------------------------------------
        # Family 3: Lineups
        # -------------------------------------------------------------------
        if "lineups" in selected_families:
            lineups_path = season_dir / f"nba_lineups_{season_ending_year}.csv.gz"
            if not lineups_path.exists():
                lineups_path = season_dir / f"nba_game_lineups_{season_ending_year}.csv.gz"
            if not lineups_path.exists():
                lineups_path = season_dir / f"nba_lineups_{season_ending_year}.csv"
            if not lineups_path.exists():
                lineups_path = season_dir / f"nba_game_lineups_{season_ending_year}.csv"

            if lineups_path.exists():
                sha, size = hash_file(lineups_path)
                with open_file_stream(lineups_path) as stream:
                    games_lineups, parse_rejected = parse_lineups_stream(
                        stream, target_game_ids=target_game_ids, limit_games=limit_games
                    )

                all_rejected = list(parse_rejected)
                admitted_stints: list[NormalizedLineupStint] = []
                admitted_games = set()

                for gid, stints in games_lineups.items():
                    # Validate 5 players per side
                    has_error = False
                    for s in stints:
                        if len(set(s.home_lineup)) != 5 or len(set(s.away_lineup)) != 5:
                            all_rejected.append(
                                RejectedGameRecord(
                                    game_id=gid,
                                    source_family="lineups",
                                    rejection_code="invalid_lineup_size",
                                    detail=f"act_{s.action_number}_home_{len(s.home_lineup)}_away_{len(s.away_lineup)}",
                                )
                            )
                            has_error = True
                            break
                    if not has_error:
                        admitted_stints.extend(stints)
                        admitted_games.add(gid)

                if admitted_games:
                    session.execute(
                        delete(WorkbenchLineup).where(
                            WorkbenchLineup.dataset_id == dataset_id,
                            WorkbenchLineup.game_id.in_(list(admitted_games)),
                        )
                    )

                for s in admitted_stints:
                    session.add(
                        WorkbenchLineup(
                            id=new_uuid(),
                            dataset_id=dataset_id,
                            game_id=s.game_id,
                            action_number=s.action_number,
                            period=s.period,
                            home_lineup_json=s.home_lineup,
                            away_lineup_json=s.away_lineup,
                            source_hash=s.source_hash,
                            status="valid",
                        )
                    )

                lineup_summary = RichAdmissionSummary(
                    season=canonical_season,
                    source_family="lineups",
                    total_games_expected=len(scheduled_game_ids),
                    total_games_observed=len(games_lineups),
                    total_games_admitted=len(admitted_games),
                    total_games_rejected=len({r.game_id for r in all_rejected}),
                    rejected_games=all_rejected,
                    reconciliation_summary={
                        "admitted_lineup_rows": len(admitted_stints),
                        "unique_admitted_games": len(admitted_games),
                    },
                    source_sha256=sha,
                    source_bytes=size,
                    parser_signature=RICH_PARSER_SIGNATURE,
                    policy_version=POSSESSION_POLICY_VERSION,
                )
                summaries["lineups"] = lineup_summary

                _record_rich_admission(
                    session,
                    dataset_id,
                    canonical_season,
                    "lineups",
                    lineups_url(season_ending_year),
                    lineup_summary,
                )

        # -------------------------------------------------------------------
        # Family 4: Shots
        # -------------------------------------------------------------------
        if "shots" in selected_families:
            shots_path = season_dir / f"shots_{season_ending_year}.csv"
            if not shots_path.exists():
                shots_path = season_dir / f"shots_{season_ending_year}.csv.gz"

            if shots_path.exists():
                sha, size = hash_file(shots_path)
                with open_file_stream(shots_path) as stream:
                    games_shots, parse_rejected = parse_shots_stream(
                        stream, target_game_ids=target_game_ids, limit_games=limit_games
                    )

                all_rejected = list(parse_rejected)
                admitted_shots: list[NormalizedShot] = []
                admitted_games = set()

                for gid, shots in games_shots.items():
                    fga_lookup = player_fga_by_game.get(gid)
                    fgm_lookup = player_fgm_by_game.get(gid)
                    valid, reason = validate_game_shots_invariants(
                        gid, shots, boxscore_fga_lookup=fga_lookup, boxscore_fgm_lookup=fgm_lookup
                    )
                    if not valid:
                        all_rejected.append(
                            RejectedGameRecord(
                                game_id=gid,
                                source_family="shots",
                                rejection_code="shots_invariant_failed",
                                detail=reason or "unknown",
                            )
                        )
                    else:
                        admitted_shots.extend(shots)
                        admitted_games.add(gid)

                if admitted_games:
                    session.execute(
                        delete(WorkbenchShot).where(
                            WorkbenchShot.dataset_id == dataset_id,
                            WorkbenchShot.game_id.in_(list(admitted_games)),
                        )
                    )

                for shot in admitted_shots:
                    session.add(
                        WorkbenchShot(
                            id=new_uuid(),
                            dataset_id=dataset_id,
                            game_id=shot.game_id,
                            period=shot.period,
                            clock=shot.clock,
                            seconds_remaining=shot.seconds_remaining,
                            team_id=shot.team_id,
                            person_id=shot.person_id,
                            player_name=shot.player_name,
                            action_type=shot.action_type,
                            sub_type=shot.sub_type,
                            shot_result=shot.shot_result,
                            is_made=shot.is_made,
                            shot_value=shot.shot_value,
                            points=shot.points,
                            shot_distance=shot.shot_distance,
                            x_legacy=shot.x_legacy,
                            y_legacy=shot.y_legacy,
                            coord_x_feet=shot.coord_x_feet,
                            coord_y_feet=shot.coord_y_feet,
                            coordinates_present=shot.coordinates_present,
                            zone_basic=shot.zone_basic,
                            zone_range=shot.zone_range,
                            score_home=shot.score_home,
                            score_away=shot.score_away,
                            description=shot.description,
                            source_hash=shot.source_hash,
                            status="valid",
                        )
                    )

                shots_summary = RichAdmissionSummary(
                    season=canonical_season,
                    source_family="shots",
                    total_games_expected=len(scheduled_game_ids),
                    total_games_observed=len(games_shots),
                    total_games_admitted=len(admitted_games),
                    total_games_rejected=len({r.game_id for r in all_rejected}),
                    rejected_games=all_rejected,
                    reconciliation_summary={
                        "admitted_shot_rows": len(admitted_shots),
                        "unique_admitted_games": len(admitted_games),
                        "zone_policy": SHOT_ZONES_VERSION,
                    },
                    source_sha256=sha,
                    source_bytes=size,
                    parser_signature=RICH_PARSER_SIGNATURE,
                    policy_version=SHOT_ZONES_VERSION,
                )
                summaries["shots"] = shots_summary

                _record_rich_admission(
                    session,
                    dataset_id,
                    canonical_season,
                    "shots",
                    shots_url(season_ending_year),
                    shots_summary,
                )

        # -------------------------------------------------------------------
        # Family 5: Matchups
        # -------------------------------------------------------------------
        if "matchups" in selected_families:
            matchups_path = season_dir / f"game_matchups_{season_ending_year}.csv"
            if not matchups_path.exists():
                matchups_path = season_dir / f"game_matchups_{season_ending_year}.csv.gz"

            if matchups_path.exists():
                sha, size = hash_file(matchups_path)
                with open_file_stream(matchups_path) as stream:
                    games_matchups, parse_rejected = parse_matchups_stream(
                        stream, target_game_ids=target_game_ids, limit_games=limit_games
                    )

                all_rejected = list(parse_rejected)
                admitted_matchups: list[NormalizedMatchup] = []
                admitted_games = set()

                for gid, matchups in games_matchups.items():
                    active_pids = active_players_by_game.get(gid)
                    valid, reason = validate_game_matchups_invariants(
                        gid, matchups, active_player_ids=active_pids
                    )
                    if not valid:
                        all_rejected.append(
                            RejectedGameRecord(
                                game_id=gid,
                                source_family="matchups",
                                rejection_code="matchups_invariant_failed",
                                detail=reason or "unknown",
                            )
                        )
                    else:
                        admitted_matchups.extend(matchups)
                        admitted_games.add(gid)

                if admitted_games:
                    session.execute(
                        delete(WorkbenchMatchup).where(
                            WorkbenchMatchup.dataset_id == dataset_id,
                            WorkbenchMatchup.game_id.in_(list(admitted_games)),
                        )
                    )

                for m in admitted_matchups:
                    session.add(
                        WorkbenchMatchup(
                            id=new_uuid(),
                            dataset_id=dataset_id,
                            game_id=m.game_id,
                            off_team_id=m.off_team_id,
                            def_team_id=m.def_team_id,
                            side=m.side,
                            off_person_id=m.off_person_id,
                            off_player_name=m.off_player_name,
                            def_person_id=m.def_person_id,
                            def_player_name=m.def_player_name,
                            matchup_minutes=m.matchup_minutes,
                            matchup_seconds=m.matchup_seconds,
                            partial_possessions=m.partial_possessions,
                            pct_defender_total_time=m.pct_defender_total_time,
                            pct_offensive_total_time=m.pct_offensive_total_time,
                            pct_total_time_both_on=m.pct_total_time_both_on,
                            switches_on=m.switches_on,
                            player_points=m.player_points,
                            team_points=m.team_points,
                            matchup_assists=m.matchup_assists,
                            matchup_potential_assists=m.matchup_potential_assists,
                            matchup_turnovers=m.matchup_turnovers,
                            matchup_blocks=m.matchup_blocks,
                            matchup_fgm=m.matchup_fgm,
                            matchup_fga=m.matchup_fga,
                            matchup_fg_pct=m.matchup_fg_pct,
                            matchup_fg3m=m.matchup_fg3m,
                            matchup_fg3a=m.matchup_fg3a,
                            matchup_fg3_pct=m.matchup_fg3_pct,
                            help_blocks=m.help_blocks,
                            help_fgm=m.help_fgm,
                            help_fga=m.help_fga,
                            help_fg_pct=m.help_fg_pct,
                            matchup_ftm=m.matchup_ftm,
                            matchup_fta=m.matchup_fta,
                            shooting_fouls=m.shooting_fouls,
                            source_hash=m.source_hash,
                            status="valid",
                        )
                    )

                matchups_summary = RichAdmissionSummary(
                    season=canonical_season,
                    source_family="matchups",
                    total_games_expected=len(scheduled_game_ids),
                    total_games_observed=len(games_matchups),
                    total_games_admitted=len(admitted_games),
                    total_games_rejected=len({r.game_id for r in all_rejected}),
                    rejected_games=all_rejected,
                    reconciliation_summary={
                        "admitted_matchup_rows": len(admitted_matchups),
                        "unique_admitted_games": len(admitted_games),
                        "policy_verified": MATCHUP_PAIR_VERSION,
                        "disclaimer": (
                            "Defensive matchup minutes and fractional possessions do not "
                            "sum to total player box-score minutes."
                        ),
                    },
                    source_sha256=sha,
                    source_bytes=size,
                    parser_signature=RICH_PARSER_SIGNATURE,
                    policy_version=MATCHUP_PAIR_VERSION,
                )
                summaries["matchups"] = matchups_summary

                _record_rich_admission(
                    session,
                    dataset_id,
                    canonical_season,
                    "matchups",
                    matchups_url(season_ending_year),
                    matchups_summary,
                )

        session.commit()

    return summaries


def _record_rich_admission(
    session: Session,
    dataset_id: str,
    season: str,
    family: str,
    source_url: str,
    summary: RichAdmissionSummary,
) -> None:
    """Insert or update immutable rich admission record in workbench_rich_admissions."""
    # Delete existing if updating
    session.execute(
        delete(WorkbenchRichAdmission).where(
            WorkbenchRichAdmission.dataset_id == dataset_id,
            WorkbenchRichAdmission.season == season,
            WorkbenchRichAdmission.source_family == family,
        )
    )

    admission = WorkbenchRichAdmission(
        id=new_uuid(),
        dataset_id=dataset_id,
        season=season,
        source_family=family,
        source_url=source_url,
        source_bytes=summary.source_bytes,
        source_sha256=summary.source_sha256,
        parser_signature=summary.parser_signature,
        policy_version=summary.policy_version,
        status="admitted" if summary.total_games_admitted > 0 else "rejected",
        total_games_expected=summary.total_games_expected,
        total_games_observed=summary.total_games_observed,
        total_games_admitted=summary.total_games_admitted,
        total_games_rejected=summary.total_games_rejected,
        rejected_games_json=[asdict(r) for r in summary.rejected_games],
        coverage_report_json={
            "expected": summary.total_games_expected,
            "observed": summary.total_games_observed,
            "admitted": summary.total_games_admitted,
            "rejected": summary.total_games_rejected,
        },
        reconciliation_report_json=summary.reconciliation_summary,
        created_at=utc_now(),
    )
    session.add(admission)


def get_rich_admissions_report(
    session: Session, dataset_id: str, season: str | None = None
) -> list[dict[str, Any]]:
    """Retrieve all rich admission lineage and quarantine records for a dataset."""
    query = select(WorkbenchRichAdmission).where(WorkbenchRichAdmission.dataset_id == dataset_id)
    if season:
        query = query.where(WorkbenchRichAdmission.season == season)

    records = session.scalars(query.order_by(WorkbenchRichAdmission.source_family.asc())).all()
    results = []
    for r in records:
        results.append(
            {
                "id": r.id,
                "dataset_id": r.dataset_id,
                "season": r.season,
                "source_family": r.source_family,
                "source_url": r.source_url,
                "source_bytes": r.source_bytes,
                "source_sha256": r.source_sha256,
                "parser_signature": r.parser_signature,
                "policy_version": r.policy_version,
                "status": r.status,
                "total_games_expected": r.total_games_expected,
                "total_games_observed": r.total_games_observed,
                "total_games_admitted": r.total_games_admitted,
                "total_games_rejected": r.total_games_rejected,
                "rejected_games_count": len(r.rejected_games_json or []),
                "rejected_games": r.rejected_games_json or [],
                "coverage_report": r.coverage_report_json or {},
                "reconciliation_report": r.reconciliation_report_json or {},
                "created_at": r.created_at.isoformat() if r.created_at else None,
            }
        )
    return results
