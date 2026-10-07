from __future__ import annotations

from datetime import date, timedelta
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import delete, select
from sqlalchemy.orm import Session, selectinload

from courtlens.api.dependencies import current_user, owned_league
from courtlens.api.schemas import (
    LeagueCreate,
    RosterReplace,
    ScenarioCreate,
    WatchlistReplace,
    WeekStateUpdate,
)
from courtlens.database import get_db
from courtlens.domain.scoring import scoring_rules_hash
from courtlens.models import (
    FantasyLeague,
    FantasyPlayerStatusOverride,
    FantasyRosterEntry,
    FantasyWatchlistEntry,
    FantasyWeekState,
    IngestionRun,
    PlannerScenario,
    Player,
    User,
    utc_now,
)
from courtlens.services.planner import ScenarioChange, build_scenario_result, build_week_plan

router = APIRouter(prefix="/fantasy", tags=["private fantasy planner"])


def league_summary(league: FantasyLeague) -> dict[str, Any]:
    return {
        "id": league.id,
        "name": league.name,
        "timezone": league.timezone,
        "week_starts_on": league.week_starts_on,
        "lineup_mode": league.lineup_mode,
        "lineup_slots": league.lineup_slots_json,
        "acquisition_limit": league.acquisition_limit,
        "scoring_mode": league.scoring_mode,
        "scoring_rules": league.scoring_rules_json,
        "scoring_rules_version": league.scoring_rules_version,
        "config_version": league.config_version,
        "roster_version": league.roster_version,
    }


@router.post("/leagues", status_code=status.HTTP_201_CREATED)
def create_league(
    payload: LeagueCreate,
    user: User = Depends(current_user),
    session: Session = Depends(get_db),
) -> dict[str, Any]:
    league = FantasyLeague(
        owner_id=user.id,
        name=payload.name,
        timezone=payload.timezone,
        week_starts_on=payload.week_starts_on,
        lineup_mode=payload.lineup_mode,
        lineup_slots_json=payload.lineup_slots,
        acquisition_limit=payload.acquisition_limit,
        scoring_mode=payload.scoring_mode,
        scoring_rules_json=payload.scoring_rules,
        scoring_rules_version=scoring_rules_hash(payload.scoring_rules),
    )
    session.add(league)
    session.commit()
    return league_summary(league)


@router.get("/leagues")
def list_leagues(
    user: User = Depends(current_user), session: Session = Depends(get_db)
) -> list[dict[str, Any]]:
    leagues = session.scalars(
        select(FantasyLeague)
        .where(FantasyLeague.owner_id == user.id)
        .order_by(FantasyLeague.created_at)
    ).all()
    return [league_summary(league) for league in leagues]


@router.get("/leagues/{league_id}")
def get_league(
    league_id: str,
    user: User = Depends(current_user),
    session: Session = Depends(get_db),
) -> dict[str, Any]:
    return league_summary(owned_league(league_id, user, session))


@router.get("/leagues/{league_id}/roster")
def get_roster(
    league_id: str,
    user: User = Depends(current_user),
    session: Session = Depends(get_db),
) -> list[dict[str, Any]]:
    league = owned_league(league_id, user, session)
    entries = session.scalars(
        select(FantasyRosterEntry)
        .options(selectinload(FantasyRosterEntry.player).selectinload(Player.current_team))
        .where(FantasyRosterEntry.league_id == league.id)
        .order_by(FantasyRosterEntry.player_key)
    ).all()
    return [
        {
            "player_id": entry.player_key,
            "name": entry.player.full_name,
            "team": entry.player.current_team.abbreviation if entry.player.current_team else None,
            "roster_role": entry.roster_role,
            "eligible_slots": entry.eligible_slot_types_json,
            "effective_from": entry.effective_from.isoformat() if entry.effective_from else None,
            "effective_to": entry.effective_to.isoformat() if entry.effective_to else None,
        }
        for entry in entries
    ]


@router.get("/leagues/{league_id}/watchlist")
def get_watchlist(
    league_id: str,
    user: User = Depends(current_user),
    session: Session = Depends(get_db),
) -> list[dict[str, Any]]:
    league = owned_league(league_id, user, session)
    entries = session.scalars(
        select(FantasyWatchlistEntry)
        .options(selectinload(FantasyWatchlistEntry.player).selectinload(Player.current_team))
        .where(FantasyWatchlistEntry.league_id == league.id)
        .order_by(FantasyWatchlistEntry.player_key)
    ).all()
    return [
        {
            "player_id": entry.player_key,
            "name": entry.player.full_name,
            "team": entry.player.current_team.abbreviation if entry.player.current_team else None,
            "label": entry.label,
            "availability_claimed": False,
        }
        for entry in entries
    ]


@router.put("/leagues/{league_id}/roster")
def replace_roster(
    league_id: str,
    payload: RosterReplace,
    user: User = Depends(current_user),
    session: Session = Depends(get_db),
) -> dict[str, Any]:
    league = owned_league(league_id, user, session)
    player_ids = [entry.player_id for entry in payload.entries]
    found = set(session.scalars(select(Player.player_key).where(Player.player_key.in_(player_ids))))
    missing = sorted(set(player_ids) - found)
    if missing:
        raise HTTPException(status_code=422, detail={"missing_player_ids": missing})
    session.execute(delete(FantasyRosterEntry).where(FantasyRosterEntry.league_id == league.id))
    league.roster_version += 1
    for entry in payload.entries:
        session.add(
            FantasyRosterEntry(
                league_id=league.id,
                player_key=entry.player_id,
                roster_role=entry.roster_role,
                eligible_slot_types_json=entry.eligible_slots,
                effective_from=entry.effective_from,
                effective_to=entry.effective_to,
                roster_version=league.roster_version,
            )
        )
    league.updated_at = utc_now()
    session.commit()
    return {
        "league_id": league.id,
        "roster_version": league.roster_version,
        "count": len(payload.entries),
    }


@router.put("/leagues/{league_id}/watchlist")
def replace_watchlist(
    league_id: str,
    payload: WatchlistReplace,
    user: User = Depends(current_user),
    session: Session = Depends(get_db),
) -> dict[str, Any]:
    league = owned_league(league_id, user, session)
    player_ids = [entry.player_id for entry in payload.entries]
    found = set(session.scalars(select(Player.player_key).where(Player.player_key.in_(player_ids))))
    missing = sorted(set(player_ids) - found)
    if missing:
        raise HTTPException(status_code=422, detail={"missing_player_ids": missing})
    session.execute(
        delete(FantasyWatchlistEntry).where(FantasyWatchlistEntry.league_id == league.id)
    )
    for entry in payload.entries:
        session.add(
            FantasyWatchlistEntry(
                league_id=league.id, player_key=entry.player_id, label=entry.label
            )
        )
    session.commit()
    return {
        "league_id": league.id,
        "count": len(payload.entries),
        "availability_claimed": False,
    }


@router.put("/leagues/{league_id}/weeks/{week_start}")
def update_week_state(
    league_id: str,
    week_start: date,
    payload: WeekStateUpdate,
    user: User = Depends(current_user),
    session: Session = Depends(get_db),
) -> dict[str, Any]:
    league = owned_league(league_id, user, session)
    if payload.acquisitions_used > league.acquisition_limit:
        raise HTTPException(status_code=422, detail="acquisitions_used exceeds the league limit")
    state = session.scalar(
        select(FantasyWeekState).where(
            FantasyWeekState.league_id == league.id, FantasyWeekState.week_start == week_start
        )
    )
    if state is None:
        state = FantasyWeekState(league_id=league.id, week_start=week_start)
        session.add(state)
    state.acquisitions_used = payload.acquisitions_used
    state.recorded_as_of = utc_now()
    week_end = week_start + timedelta(days=6)
    session.execute(
        delete(FantasyPlayerStatusOverride).where(
            FantasyPlayerStatusOverride.league_id == league.id,
            FantasyPlayerStatusOverride.starts_on <= week_end,
            FantasyPlayerStatusOverride.ends_on >= week_start,
        )
    )
    roster_ids = set(
        session.scalars(
            select(FantasyRosterEntry.player_key).where(FantasyRosterEntry.league_id == league.id)
        )
    )
    for override in payload.status_overrides:
        if override.player_id not in roster_ids:
            raise HTTPException(
                status_code=422,
                detail=f"status override player {override.player_id} is not rostered",
            )
        if override.starts_on < week_start or override.ends_on > week_end:
            raise HTTPException(
                status_code=422, detail="status overrides must remain inside the week"
            )
        session.add(
            FantasyPlayerStatusOverride(
                league_id=league.id,
                player_key=override.player_id,
                starts_on=override.starts_on,
                ends_on=override.ends_on,
                status=override.status,
            )
        )
    session.commit()
    return {
        "league_id": league.id,
        "week_start": week_start.isoformat(),
        "acquisitions_used": state.acquisitions_used,
        "acquisitions_remaining": league.acquisition_limit - state.acquisitions_used,
        "status_override_count": len(payload.status_overrides),
    }


@router.get("/leagues/{league_id}/planner")
def planner(
    league_id: str,
    week_start: date = Query(alias="weekStart"),
    user: User = Depends(current_user),
    session: Session = Depends(get_db),
) -> dict[str, Any]:
    league = owned_league(league_id, user, session)
    return build_week_plan(session, league=league, week_start=week_start)


@router.post("/leagues/{league_id}/scenarios", status_code=status.HTTP_201_CREATED)
def create_scenario(
    league_id: str,
    payload: ScenarioCreate,
    user: User = Depends(current_user),
    session: Session = Depends(get_db),
) -> dict[str, Any]:
    league = owned_league(league_id, user, session)
    roster_ids = set(
        session.scalars(
            select(FantasyRosterEntry.player_key).where(FantasyRosterEntry.league_id == league.id)
        )
    )
    if payload.dropped_player_id not in roster_ids:
        raise HTTPException(status_code=422, detail="dropped player is not on this roster")
    if session.get(Player, payload.added_player_id) is None:
        raise HTTPException(status_code=422, detail="added player does not exist")
    week_state = session.scalar(
        select(FantasyWeekState).where(
            FantasyWeekState.league_id == league.id,
            FantasyWeekState.week_start == payload.week_start,
        )
    )
    used = week_state.acquisitions_used if week_state else 0
    remaining = league.acquisition_limit - used
    if remaining <= 0:
        raise HTTPException(
            status_code=409,
            detail={
                "valid": False,
                "reason": "acquisition_limit_exhausted",
                "acquisitions_remaining": 0,
            },
        )
    change = ScenarioChange(
        effective_date=payload.effective_date,
        dropped_player_id=payload.dropped_player_id,
        added_player_id=payload.added_player_id,
        added_eligible_slots=tuple(payload.added_eligible_slots),
    )
    result = build_scenario_result(
        session, league=league, week_start=payload.week_start, change=change
    )
    latest_snapshot = session.scalar(
        select(IngestionRun)
        .where(IngestionRun.status == "succeeded")
        .order_by(IngestionRun.finished_at.desc())
        .limit(1)
    )
    scenario = PlannerScenario(
        league_id=league.id,
        week_start=payload.week_start,
        effective_date=payload.effective_date,
        dropped_player_key=payload.dropped_player_id,
        added_player_key=payload.added_player_id,
        scoring_rules_version=league.scoring_rules_version,
        league_config_version=league.config_version,
        roster_version=league.roster_version,
        acquisitions_remaining_before=remaining,
        result_json=result,
        data_snapshot_id=latest_snapshot.run_id if latest_snapshot else None,
    )
    session.add(scenario)
    session.commit()
    return {"id": scenario.id, **result}


@router.get("/leagues/{league_id}/scenarios/{scenario_id}")
def get_scenario(
    league_id: str,
    scenario_id: str,
    user: User = Depends(current_user),
    session: Session = Depends(get_db),
) -> dict[str, Any]:
    league = owned_league(league_id, user, session)
    scenario = session.scalar(
        select(PlannerScenario).where(
            PlannerScenario.id == scenario_id, PlannerScenario.league_id == league.id
        )
    )
    if scenario is None:
        raise HTTPException(status_code=404, detail="scenario not found")
    return {
        "id": scenario.id,
        "generated_at": scenario.generated_at.isoformat(),
        "data_snapshot_id": scenario.data_snapshot_id,
        "scoring_rules_version": scenario.scoring_rules_version,
        "league_config_version": scenario.league_config_version,
        "roster_version": scenario.roster_version,
        **scenario.result_json,
    }
