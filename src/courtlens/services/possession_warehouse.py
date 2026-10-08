"""Service layer for Block B20: Possession and stint warehouse.

Provides:
- Stint reconstruction orchestration from admitted rich sources and overrides
- Strict invariant validation (5-player sides, clock order, overtime, point/minute conservation)
- Lineup stint and player stint persistence with sealed table mutation protection
- Provenance-bearing reconstruction override registry
- Cutoff-safe exposure queries for players and lineups
"""

from __future__ import annotations

import logging
from contextlib import nullcontext
from datetime import date, datetime
from pathlib import Path
from typing import Any

from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from courtlens.domain.rich_sources import (
    NormalizedLineupStint,
    NormalizedPbpEvent,
    NormalizedPossession,
)
from courtlens.domain.stints import (
    ReconstructionOverrideRecord,
    StintReconstructionResult,
    format_lineup_key,
    reconstruct_game_stints,
)
from courtlens.models import new_uuid
from courtlens.workbench_models import (
    WorkbenchDataset,
    WorkbenchLineup,
    WorkbenchLineupStint,
    WorkbenchPbpEvent,
    WorkbenchPlayerGame,
    WorkbenchPossession,
    WorkbenchReconstructionOverride,
    WorkbenchSchedule,
    WorkbenchStintPlayer,
    WorkbenchTeamGame,
    allow_admin_mutation,
)

logger = logging.getLogger(__name__)


def record_reconstruction_override(
    session: Session,
    *,
    dataset_id: str,
    game_id: str,
    override_type: str,
    reason: str,
    author: str,
    override_value: Any,
    period: int | None = None,
    action_number: int | None = None,
    order_index: int | None = None,
    team_id: str | None = None,
    player_id: str | None = None,
    original_value: Any | None = None,
    commit: bool = True,
    flush: bool = True,
) -> WorkbenchReconstructionOverride:
    """Record an immutable, provenance-bearing override into workbench_reconstruction_overrides."""
    context = (
        nullcontext() if session.info.get("allow_admin_mutation") else allow_admin_mutation(session)
    )
    with context:
        override = WorkbenchReconstructionOverride(
            id=new_uuid(),
            dataset_id=dataset_id,
            game_id=game_id,
            override_type=override_type,
            period=period,
            action_number=action_number,
            order_index=order_index,
            team_id=team_id,
            player_id=player_id,
            original_value_json=original_value,
            override_value_json=override_value,
            reason=reason,
            author=author,
            status="active",
        )
        session.add(override)
        if commit:
            session.commit()
        elif flush:
            session.flush()
    return override


def record_repair_result_overrides(
    session: Session,
    *,
    dataset_id: str,
    result: dict[str, Any],
    author: str,
) -> list[WorkbenchReconstructionOverride]:
    """Retain v2 rule envelopes in the existing registry, in the caller's transaction.

    This records candidate evidence, including exclusions, without admitting or replacing
    stints. Historical v1 overrides keep their original JSON shape and interpretation.
    """
    from courtlens.domain.possession_repair import POLICY_VERSION, RULE_IDS
    from courtlens.ingestion.native_reconstruction import content_hash

    payload = {k: v for k, v in result.items() if k != "content_sha256"}
    if result.get("policy_version") != POLICY_VERSION or content_hash(payload) != result.get(
        "content_sha256"
    ):
        raise ValueError("invalid v2 repair result hash or policy")
    envelopes = result["repairs"]
    for envelope in envelopes:
        body = {k: v for k, v in envelope.items() if k != "repair_sha256"}
        if (
            envelope.get("rule_id") not in RULE_IDS
            or envelope.get("policy_version") != POLICY_VERSION
            or envelope.get("game_id") != result["game_id"]
            or envelope.get("input_sha256") != result["input_sha256"]
            or content_hash(body) != envelope.get("repair_sha256")
        ):
            raise ValueError("invalid v2 repair envelope")
    existing = session.scalars(
        select(WorkbenchReconstructionOverride).where(
            WorkbenchReconstructionOverride.dataset_id == dataset_id,
            WorkbenchReconstructionOverride.game_id == result["game_id"],
            WorkbenchReconstructionOverride.override_type == "policy_v2_repair",
        )
    ).all()
    by_hash = {
        row.override_value_json["repair_sha256"]: row
        for row in existing
        if isinstance(row.override_value_json, dict) and "repair_sha256" in row.override_value_json
    }
    rows = []
    with allow_admin_mutation(session):
        for envelope in envelopes:
            digest = envelope["repair_sha256"]
            if digest not in by_hash:
                by_hash[digest] = record_reconstruction_override(
                    session,
                    dataset_id=dataset_id,
                    game_id=result["game_id"],
                    override_type="policy_v2_repair",
                    reason=envelope["reason"],
                    author=author,
                    period=envelope["period"],
                    team_id=envelope["team_id"],
                    player_id=envelope["player_id"],
                    original_value=envelope["original"],
                    override_value=envelope,
                    commit=False,
                    flush=False,
                )
            rows.append(by_hash[digest])
        session.flush()
    return rows


def get_reconstruction_overrides(
    session: Session,
    *,
    dataset_id: str,
    game_id: str | None = None,
) -> list[ReconstructionOverrideRecord]:
    """Retrieve active reconstruction overrides for a dataset and optional game."""
    query = select(WorkbenchReconstructionOverride).where(
        WorkbenchReconstructionOverride.dataset_id == dataset_id,
        WorkbenchReconstructionOverride.status == "active",
    )
    if game_id:
        query = query.where(WorkbenchReconstructionOverride.game_id == game_id)

    rows = session.scalars(query).all()
    return [
        ReconstructionOverrideRecord(
            id=r.id,
            game_id=r.game_id,
            override_type=r.override_type,
            period=r.period,
            action_number=r.action_number,
            order_index=r.order_index,
            team_id=r.team_id,
            player_id=r.player_id,
            original_value_json=r.original_value_json,
            override_value_json=r.override_value_json,
            reason=r.reason,
            author=r.author,
            status=r.status,
        )
        for r in rows
    ]


def reconstruct_game_stints_for_game(
    session: Session,
    *,
    dataset_id: str,
    game_id: str,
    persist: bool = True,
) -> StintReconstructionResult:
    """Reconstruct continuous lineup stints and player exposure for a single game."""
    dataset = session.get(WorkbenchDataset, dataset_id)
    if dataset is not None and dataset.source_namespace == "courtlens-impact":
        raise ValueError("sealed IM03 datasets cannot use legacy delete/rebuild")
    # 1. Fetch PBP events
    pbp_rows = session.scalars(
        select(WorkbenchPbpEvent)
        .where(
            WorkbenchPbpEvent.dataset_id == dataset_id,
            WorkbenchPbpEvent.game_id == game_id,
        )
        .order_by(WorkbenchPbpEvent.order_index)
    ).all()

    norm_pbp: list[NormalizedPbpEvent] = [
        NormalizedPbpEvent(
            game_id=r.game_id,
            order_index=r.order_index,
            action_number=r.action_number,
            period=r.period,
            clock=r.clock,
            seconds_remaining=r.seconds_remaining,
            event_type=r.event_type,
            action_type=r.action_type,
            sub_type=r.sub_type,
            team_id=r.team_id,
            person_id=r.person_id,
            score_home=r.score_home,
            score_away=r.score_away,
            points_total=r.points_total,
            shot_value=r.shot_value,
            shot_distance=r.shot_distance,
            x_legacy=r.x_legacy,
            y_legacy=r.y_legacy,
            possession_number=r.possession_number,
            off_lineup=r.off_lineup_json or [],
            def_lineup=r.def_lineup_json or [],
            description=r.description,
            video_available=r.video_available,
            source_hash=r.source_hash,
        )
        for r in pbp_rows
    ]

    # 2. Fetch Possessions
    poss_rows = session.scalars(
        select(WorkbenchPossession)
        .where(
            WorkbenchPossession.dataset_id == dataset_id,
            WorkbenchPossession.game_id == game_id,
        )
        .order_by(WorkbenchPossession.possession_number)
    ).all()

    norm_poss: list[NormalizedPossession] = [
        NormalizedPossession(
            game_id=r.game_id,
            period=r.period,
            possession_number=r.possession_number,
            number_in_period=r.number_in_period,
            offense_team_id=r.offense_team_id,
            defense_team_id=r.defense_team_id,
            start_order_index=r.start_order_index,
            end_order_index=r.end_order_index,
            start_seconds_remaining=r.start_seconds_remaining,
            end_seconds_remaining=r.end_seconds_remaining,
            points=r.points,
            is_second_chance=r.is_second_chance,
            possession_start_type=r.possession_start_type,
            count_as_possession=r.count_as_possession,
            stats_json=r.stats_json or {},
            off_lineup=r.off_lineup_json or [],
            def_lineup=r.def_lineup_json or [],
            lineup_source=r.lineup_source,
            policy_version=r.policy_version,
            source_hash=r.source_hash,
        )
        for r in poss_rows
    ]

    # 3. Fetch Lineups
    lineup_rows = session.scalars(
        select(WorkbenchLineup)
        .where(
            WorkbenchLineup.dataset_id == dataset_id,
            WorkbenchLineup.game_id == game_id,
        )
        .order_by(WorkbenchLineup.action_number)
    ).all()

    norm_lineups: list[NormalizedLineupStint] = [
        NormalizedLineupStint(
            game_id=r.game_id,
            action_number=r.action_number,
            period=r.period,
            home_lineup=r.home_lineup_json or [],
            away_lineup=r.away_lineup_json or [],
            source_hash=r.source_hash,
        )
        for r in lineup_rows
    ]

    # 4. Fetch Teams and Schedule
    team_games = session.scalars(
        select(WorkbenchTeamGame).where(
            WorkbenchTeamGame.dataset_id == dataset_id,
            WorkbenchTeamGame.game_id == game_id,
        )
    ).all()

    home_team_id = ""
    away_team_id = ""
    expected_home_pts: int | None = None
    expected_away_pts: int | None = None

    for tg in team_games:
        if tg.side == "home":
            home_team_id = tg.team_id
            expected_home_pts = tg.points
        elif tg.side == "away":
            away_team_id = tg.team_id
            expected_away_pts = tg.points

    # Fallback to schedule if not found on team games
    if not home_team_id or not away_team_id:
        sch = session.scalars(
            select(WorkbenchSchedule).where(
                WorkbenchSchedule.dataset_id == dataset_id,
                WorkbenchSchedule.game_id == game_id,
            )
        ).first()
        if sch:
            home_team_id = sch.home_team_id
            away_team_id = sch.away_team_id

    # 5. Fetch Player Box Minutes for reconciliation
    player_games = session.scalars(
        select(WorkbenchPlayerGame).where(
            WorkbenchPlayerGame.dataset_id == dataset_id,
            WorkbenchPlayerGame.game_id == game_id,
        )
    ).all()
    player_box_minutes: dict[str, float] = {}
    for pg in player_games:
        if pg.minutes_seconds is not None:
            player_box_minutes[pg.player_id] = float(pg.minutes_seconds) / 60.0

    # 6. Fetch Overrides
    overrides = get_reconstruction_overrides(session, dataset_id=dataset_id, game_id=game_id)

    # 7. Execute domain stint reconstruction
    result = reconstruct_game_stints(
        game_id=game_id,
        home_team_id=home_team_id,
        away_team_id=away_team_id,
        events=norm_pbp,
        possessions=norm_poss,
        lineups=norm_lineups,
        overrides=overrides,
        expected_final_home_score=expected_home_pts,
        expected_final_away_score=expected_away_pts,
        player_box_minutes=player_box_minutes if player_box_minutes else None,
    )

    # 8. Persist if requested and invariants passed
    if persist and result.invariants_passed:
        with allow_admin_mutation(session):
            # Clean up existing stints for this game
            existing_stint_ids = session.scalars(
                select(WorkbenchLineupStint.id).where(
                    WorkbenchLineupStint.dataset_id == dataset_id,
                    WorkbenchLineupStint.game_id == game_id,
                )
            ).all()

            if existing_stint_ids:
                session.execute(
                    delete(WorkbenchStintPlayer).where(
                        WorkbenchStintPlayer.stint_id.in_(existing_stint_ids)
                    )
                )
                session.execute(
                    delete(WorkbenchLineupStint).where(
                        WorkbenchLineupStint.id.in_(existing_stint_ids)
                    )
                )

            # Insert new stints
            db_stint_map: dict[int, str] = {}  # stint_index -> stint_id
            for s in result.stints:
                stint_db_id = new_uuid()
                db_stint_map[s.stint_index] = stint_db_id
                db_stint = WorkbenchLineupStint(
                    id=stint_db_id,
                    dataset_id=dataset_id,
                    game_id=game_id,
                    stint_index=s.stint_index,
                    period=s.period,
                    start_clock=s.start_clock,
                    end_clock=s.end_clock,
                    start_seconds_remaining=s.start_seconds_remaining,
                    end_seconds_remaining=s.end_seconds_remaining,
                    duration_seconds=s.duration_seconds,
                    home_team_id=s.home_team_id,
                    away_team_id=s.away_team_id,
                    home_lineup_json=s.home_lineup,
                    away_lineup_json=s.away_lineup,
                    home_lineup_key=s.home_lineup_key,
                    away_lineup_key=s.away_lineup_key,
                    start_home_score=s.start_home_score,
                    start_away_score=s.start_away_score,
                    end_home_score=s.end_home_score,
                    end_away_score=s.end_away_score,
                    home_points=s.home_points,
                    away_points=s.away_points,
                    home_possessions=s.home_possessions,
                    away_possessions=s.away_possessions,
                    total_possessions=s.total_possessions,
                    stats_json=s.stats_json,
                    player_stats_json=s.player_stats_json,
                    policy_version=s.policy_version,
                    source_hash=s.source_hash,
                    status=s.status,
                )
                session.add(db_stint)

            # Stint players with FK
            for stint in result.stints:
                stint_id = db_stint_map[stint.stint_index]
                for p_id in stint.home_lineup:
                    p_stats = stint.player_stats_json.get(p_id, {})
                    sp_db = WorkbenchStintPlayer(
                        id=new_uuid(),
                        dataset_id=dataset_id,
                        stint_id=stint_id,
                        game_id=game_id,
                        team_id=stint.home_team_id,
                        opponent_team_id=stint.away_team_id,
                        player_id=p_id,
                        side="home",
                        period=stint.period,
                        duration_seconds=stint.duration_seconds,
                        possessions=stint.home_possessions,
                        opponent_possessions=stint.away_possessions,
                        points=p_stats.get("points", 0),
                        team_points=stint.home_points,
                        points_allowed=stint.away_points,
                        stats_json=p_stats,
                        source_hash=stint.source_hash,
                    )
                    session.add(sp_db)

                for p_id in stint.away_lineup:
                    p_stats = stint.player_stats_json.get(p_id, {})
                    sp_db = WorkbenchStintPlayer(
                        id=new_uuid(),
                        dataset_id=dataset_id,
                        stint_id=stint_id,
                        game_id=game_id,
                        team_id=stint.away_team_id,
                        opponent_team_id=stint.home_team_id,
                        player_id=p_id,
                        side="away",
                        period=stint.period,
                        duration_seconds=stint.duration_seconds,
                        possessions=stint.away_possessions,
                        opponent_possessions=stint.home_possessions,
                        points=p_stats.get("points", 0),
                        team_points=stint.away_points,
                        points_allowed=stint.home_points,
                        stats_json=p_stats,
                        source_hash=stint.source_hash,
                    )
                    session.add(sp_db)

            session.commit()

    return result


def build_possession_warehouse_for_season(
    session: Session,
    *,
    dataset_id: str,
    season: str,
    limit_games: int | None = None,
    impact_bundle: Path | None = None,
) -> dict[str, Any]:
    """Reconstruct and persist stints for all admitted games in a season."""
    if impact_bundle is not None:
        if limit_games is not None:
            raise ValueError("IM03 admission requires complete season/phase membership")
        from courtlens.ingestion.impact_population import populate_impact_season

        return populate_impact_season(
            session, dataset_id=dataset_id, season=season, bundle_path=impact_bundle
        )
    dataset = session.get(WorkbenchDataset, dataset_id)
    if dataset is not None and dataset.source_namespace == "courtlens-impact":
        raise ValueError("sealed IM03 datasets cannot use legacy delete/rebuild")
    # Find all games with admitted rich sources
    game_ids = session.scalars(
        select(WorkbenchPossession.game_id)
        .where(WorkbenchPossession.dataset_id == dataset_id)
        .distinct()
    ).all()

    if not game_ids:
        # Check PBP events
        game_ids = session.scalars(
            select(WorkbenchPbpEvent.game_id)
            .where(WorkbenchPbpEvent.dataset_id == dataset_id)
            .distinct()
        ).all()

    if limit_games is not None:
        game_ids = game_ids[:limit_games]

    total_games = len(game_ids)
    successful_games = 0
    failed_games = 0
    total_stints_created = 0
    total_possessions = 0.0
    rejected_games_json: list[dict[str, Any]] = []

    for gid in game_ids:
        res = reconstruct_game_stints_for_game(
            session,
            dataset_id=dataset_id,
            game_id=gid,
            persist=True,
        )
        if res.invariants_passed:
            successful_games += 1
            total_stints_created += len(res.stints)
            total_possessions += res.total_possessions
        else:
            failed_games += 1
            rejected_games_json.append(
                {
                    "game_id": gid,
                    "reasons": res.validation_errors,
                }
            )

    return {
        "dataset_id": dataset_id,
        "season": season,
        "total_games": total_games,
        "successful_games": successful_games,
        "failed_games": failed_games,
        "total_stints": total_stints_created,
        "total_possessions": round(total_possessions, 2),
        "rejected_games": rejected_games_json,
    }


def get_cutoff_safe_player_exposure(
    session: Session,
    *,
    dataset_id: str,
    player_id: str,
    cutoff_date: date | datetime | None = None,
    season: str | None = None,
    phase: str | None = None,
) -> dict[str, Any]:
    """Query on-court possession exposure and box production strictly respecting cutoff date."""
    # Join WorkbenchStintPlayer with WorkbenchSchedule to enforce cutoff_date
    query = (
        select(
            WorkbenchStintPlayer,
            WorkbenchSchedule.game_date,
        )
        .join(
            WorkbenchSchedule,
            (WorkbenchSchedule.dataset_id == WorkbenchStintPlayer.dataset_id)
            & (WorkbenchSchedule.game_id == WorkbenchStintPlayer.game_id),
        )
        .where(
            WorkbenchStintPlayer.dataset_id == dataset_id,
            WorkbenchStintPlayer.player_id == player_id,
        )
    )

    if cutoff_date is not None:
        c_date = cutoff_date.date() if isinstance(cutoff_date, datetime) else cutoff_date
        dataset = session.get(WorkbenchDataset, dataset_id)
        if dataset is not None and dataset.source_namespace == "courtlens-impact":
            query = query.where(WorkbenchSchedule.game_date < c_date)
        else:
            query = query.where(WorkbenchSchedule.game_date <= c_date)

    if season is not None:
        query = query.where(WorkbenchSchedule.season == season)

    if phase is not None:
        query = query.where(WorkbenchSchedule.phase == phase)

    records = session.execute(query).all()

    games_set: set[str] = set()
    total_seconds = 0.0
    total_possessions = 0.0
    total_opponent_possessions = 0.0
    total_points = 0
    total_team_points = 0
    total_points_allowed = 0
    counting_stats: dict[str, int] = {
        "fgm": 0,
        "fga": 0,
        "fg3m": 0,
        "fg3a": 0,
        "ftm": 0,
        "fta": 0,
        "oreb": 0,
        "dreb": 0,
        "ast": 0,
        "stl": 0,
        "blk": 0,
        "tov": 0,
        "pf": 0,
    }

    for sp, _gdate in records:
        games_set.add(sp.game_id)
        total_seconds += sp.duration_seconds
        total_possessions += sp.possessions
        total_opponent_possessions += sp.opponent_possessions
        total_points += sp.points
        total_team_points += sp.team_points
        total_points_allowed += sp.points_allowed

        s_json = sp.stats_json or {}
        for k in counting_stats:
            counting_stats[k] += int(s_json.get(k, 0))

    total_minutes = round(total_seconds / 60.0, 2)
    off_rtg = (
        round((total_team_points * 100.0) / total_possessions, 2) if total_possessions > 0 else None
    )
    def_rtg = (
        round((total_points_allowed * 100.0) / total_opponent_possessions, 2)
        if total_opponent_possessions > 0
        else None
    )
    net_rtg = round(off_rtg - def_rtg, 2) if (off_rtg is not None and def_rtg is not None) else None

    return {
        "player_id": player_id,
        "dataset_id": dataset_id,
        "cutoff_date": cutoff_date.isoformat() if cutoff_date else None,
        "games_count": len(games_set),
        "stints_count": len(records),
        "total_seconds": round(total_seconds, 2),
        "total_minutes": total_minutes,
        "possessions": round(total_possessions, 2),
        "opponent_possessions": round(total_opponent_possessions, 2),
        "points": total_points,
        "team_points_on": total_team_points,
        "points_allowed_on": total_points_allowed,
        "offensive_rating": off_rtg,
        "defensive_rating": def_rtg,
        "net_rating": net_rtg,
        "stats": counting_stats,
    }


def get_cutoff_safe_lineup_exposure(
    session: Session,
    *,
    dataset_id: str,
    lineup_players: list[str],
    cutoff_date: date | datetime | None = None,
    team_id: str | None = None,
) -> dict[str, Any]:
    """Query on-court lineup unit exposure strictly respecting cutoff date."""
    target_key = format_lineup_key(lineup_players)

    # Query stints where home_lineup_key or away_lineup_key matches
    query = (
        select(
            WorkbenchLineupStint,
            WorkbenchSchedule.game_date,
        )
        .join(
            WorkbenchSchedule,
            (WorkbenchSchedule.dataset_id == WorkbenchLineupStint.dataset_id)
            & (WorkbenchSchedule.game_id == WorkbenchLineupStint.game_id),
        )
        .where(
            WorkbenchLineupStint.dataset_id == dataset_id,
            (WorkbenchLineupStint.home_lineup_key == target_key)
            | (WorkbenchLineupStint.away_lineup_key == target_key),
        )
    )

    if cutoff_date is not None:
        c_date = cutoff_date.date() if isinstance(cutoff_date, datetime) else cutoff_date
        dataset = session.get(WorkbenchDataset, dataset_id)
        if dataset is not None and dataset.source_namespace == "courtlens-impact":
            query = query.where(WorkbenchSchedule.game_date < c_date)
        else:
            query = query.where(WorkbenchSchedule.game_date <= c_date)

    records = session.execute(query).all()

    games_set: set[str] = set()
    total_seconds = 0.0
    possessions_off = 0.0
    possessions_def = 0.0
    points_scored = 0
    points_allowed = 0

    for stint, _gdate in records:
        games_set.add(stint.game_id)
        total_seconds += stint.duration_seconds

        is_home = stint.home_lineup_key == target_key
        if is_home:
            possessions_off += stint.home_possessions
            possessions_def += stint.away_possessions
            points_scored += stint.home_points
            points_allowed += stint.away_points
        else:
            possessions_off += stint.away_possessions
            possessions_def += stint.home_possessions
            points_scored += stint.away_points
            points_allowed += stint.home_points

    total_minutes = round(total_seconds / 60.0, 2)
    off_rtg = round((points_scored * 100.0) / possessions_off, 2) if possessions_off > 0 else None
    def_rtg = round((points_allowed * 100.0) / possessions_def, 2) if possessions_def > 0 else None
    net_rtg = round(off_rtg - def_rtg, 2) if (off_rtg is not None and def_rtg is not None) else None

    return {
        "lineup_key": target_key,
        "lineup_players": sorted(lineup_players),
        "dataset_id": dataset_id,
        "cutoff_date": cutoff_date.isoformat() if cutoff_date else None,
        "games_count": len(games_set),
        "stints_count": len(records),
        "total_seconds": round(total_seconds, 2),
        "total_minutes": total_minutes,
        "possessions_off": round(possessions_off, 2),
        "possessions_def": round(possessions_def, 2),
        "points_scored": points_scored,
        "points_allowed": points_allowed,
        "offensive_rating": off_rtg,
        "defensive_rating": def_rtg,
        "net_rating": net_rtg,
    }
