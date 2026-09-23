from __future__ import annotations

from collections import defaultdict
from dataclasses import dataclass
from datetime import UTC, date, datetime, time, timedelta
from typing import Any
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from courtload.domain.matching import MatchPlayer, expand_slots, maximum_weight_matching
from courtload.models import (
    FantasyLeague,
    FantasyPlayerStatusOverride,
    FantasyRosterEntry,
    FantasyWeekState,
    Game,
    IngestionRun,
    Player,
    PlayerGame,
)
from courtload.services.recent_form import recent_form

NON_SCHEDULED_STATES = {"postponed", "canceled", "suspended", "abandoned"}


@dataclass(frozen=True)
class ScenarioChange:
    effective_date: date
    dropped_player_id: int
    added_player_id: int
    added_eligible_slots: tuple[str, ...]


def week_dates(week_start: date) -> tuple[date, ...]:
    return tuple(week_start + timedelta(days=offset) for offset in range(7))


def timezone_for(name: str) -> ZoneInfo:
    try:
        return ZoneInfo(name)
    except ZoneInfoNotFoundError as error:
        raise ValueError(f"unknown IANA timezone: {name}") from error


def local_midnight_utc(day: date, zone: ZoneInfo) -> datetime:
    return datetime.combine(day, time.min, tzinfo=zone).astimezone(UTC)


def _latest_snapshot(session: Session) -> IngestionRun | None:
    return session.scalar(
        select(IngestionRun)
        .where(IngestionRun.status == "succeeded")
        .order_by(IngestionRun.finished_at.desc())
        .limit(1)
    )


def _games_for_week(
    session: Session, dates: tuple[date, ...], zone: ZoneInfo
) -> list[tuple[Game, date]]:
    lower = local_midnight_utc(dates[0], zone)
    upper = local_midnight_utc(dates[-1] + timedelta(days=1), zone)
    games = session.scalars(
        select(Game)
        .options(selectinload(Game.home_team), selectinload(Game.away_team))
        .where(Game.scheduled_start_utc >= lower, Game.scheduled_start_utc < upper)
        .order_by(Game.scheduled_start_utc, Game.game_key)
    ).all()
    return [
        (game, game.scheduled_start_utc.astimezone(zone).date())
        for game in games
        if game.status_state not in NON_SCHEDULED_STATES and not game.postponed
    ]


def _historical_team_as_of(session: Session, player_id: int, cutoff: datetime) -> int | None:
    return session.scalar(
        select(PlayerGame.team_key)
        .join(Game, Game.game_key == PlayerGame.game_key)
        .where(PlayerGame.player_key == player_id, Game.scheduled_start_utc < cutoff)
        .order_by(Game.scheduled_start_utc.desc())
        .limit(1)
    )


def _entry_active(entry: FantasyRosterEntry, day: date) -> bool:
    return (entry.effective_from is None or entry.effective_from <= day) and (
        entry.effective_to is None or entry.effective_to >= day
    )


def build_week_plan(
    session: Session,
    *,
    league: FantasyLeague,
    week_start: date,
    light_slate_threshold: int = 5,
    scenario: ScenarioChange | None = None,
    planning_as_of: datetime | None = None,
) -> dict[str, Any]:
    if league.lineup_mode != "daily":
        raise ValueError("weekly-lock leagues are unsupported in CourtLoad v1")
    zone = timezone_for(league.timezone)
    observed_at = planning_as_of or datetime.now(UTC)
    if observed_at.tzinfo is None:
        observed_at = observed_at.replace(tzinfo=UTC)
    current_local_date = observed_at.astimezone(zone).date()
    dates = week_dates(week_start)
    roster_entries = list(
        session.scalars(
            select(FantasyRosterEntry)
            .options(selectinload(FantasyRosterEntry.player))
            .where(FantasyRosterEntry.league_id == league.id)
            .order_by(FantasyRosterEntry.player_key)
        ).all()
    )
    if scenario is not None:
        added_player = session.get(Player, scenario.added_player_id)
        if added_player is None:
            raise ValueError("added player does not exist")
    else:
        added_player = None

    games_with_dates = _games_for_week(session, dates, zone)
    games_by_date: dict[date, list[Game]] = defaultdict(list)
    team_game_by_date: dict[tuple[date, int], Game] = {}
    for game, local_date in games_with_dates:
        games_by_date[local_date].append(game)
        team_game_by_date[(local_date, game.home_team_key)] = game
        team_game_by_date[(local_date, game.away_team_key)] = game

    status_overrides = session.scalars(
        select(FantasyPlayerStatusOverride).where(
            FantasyPlayerStatusOverride.league_id == league.id,
            FantasyPlayerStatusOverride.starts_on <= dates[-1],
            FantasyPlayerStatusOverride.ends_on >= dates[0],
        )
    ).all()
    inactive = {
        (override.player_key, day)
        for override in status_overrides
        if override.status.lower() in {"inactive", "out", "ir"}
        for day in dates
        if override.starts_on <= day <= override.ends_on
    }

    form_cutoff = local_midnight_utc(dates[0], zone)
    roster_player_ids = {entry.player_key for entry in roster_entries}
    if scenario is not None:
        roster_player_ids.add(scenario.added_player_id)
    forms = {
        player_id: recent_form(
            session,
            player_id=player_id,
            as_of=form_cutoff,
            window=10,
            scoring_rules=league.scoring_rules_json,
        )
        for player_id in roster_player_ids
    }
    slots = expand_slots(league.lineup_slots_json)
    day_results: list[dict[str, Any]] = []
    scheduled_total = 0
    startable_total = 0
    conflict_total = 0

    for day in dates:
        active_entries = [entry for entry in roster_entries if _entry_active(entry, day)]
        if scenario is not None and day >= scenario.effective_date:
            active_entries = [
                entry for entry in active_entries if entry.player_key != scenario.dropped_player_id
            ]
        day_players: list[tuple[Player, tuple[str, ...], Game]] = []
        cells: dict[int, dict[str, Any]] = {}
        scheduled = 0

        candidates: list[tuple[Player, tuple[str, ...], str]] = [
            (entry.player, tuple(entry.eligible_slot_types_json), entry.roster_role)
            for entry in active_entries
        ]
        if scenario is not None and day >= scenario.effective_date and added_player is not None:
            candidates.append((added_player, scenario.added_eligible_slots, "active"))

        for player, eligibility, roster_role in candidates:
            as_of = local_midnight_utc(day + timedelta(days=1), zone)
            historical_team = _historical_team_as_of(session, player.player_key, as_of)
            # Historical weeks must retain the team observed as of that date. For today and
            # upcoming dates, however, a newer provider current-team identity wins so a trade is
            # reflected before the player's first box score for the new team.
            team_id = (
                player.current_team_key
                if day >= current_local_date and player.current_team_key is not None
                else historical_team or player.current_team_key
            )
            scheduled_game = team_game_by_date.get((day, team_id)) if team_id is not None else None
            if scheduled_game is None:
                cells[player.player_key] = {"status": "no_game"}
                continue
            scheduled += 1
            opponent = (
                scheduled_game.away_team
                if scheduled_game.home_team_key == team_id
                else scheduled_game.home_team
            )
            cell = {
                "status": "scheduled",
                "game_id": scheduled_game.game_key,
                "opponent": opponent.abbreviation,
                "is_home": scheduled_game.home_team_key == team_id,
                "tipoff_utc": scheduled_game.scheduled_start_utc.isoformat(),
                "source_status": scheduled_game.status_state,
            }
            if roster_role.lower() == "ir" or (player.player_key, day) in inactive:
                cell["status"] = "user_marked_inactive"
                cells[player.player_key] = cell
                continue
            day_players.append((player, eligibility, scheduled_game))
            cells[player.player_key] = cell

        match_players = tuple(
            MatchPlayer(
                player_id=player.player_key,
                name=player.full_name,
                eligible_slots=eligibility,
                weight=float(forms[player.player_key]["fantasy_points_per_game"] or 0),
            )
            for player, eligibility, _ in day_players
        )
        match = maximum_weight_matching(match_players, slots)
        assignment_by_player = {
            assignment.player_id: assignment for assignment in match.assignments
        }
        for player, _, _ in day_players:
            assignment = assignment_by_player.get(player.player_key)
            if assignment is None:
                cells[player.player_key]["status"] = "lineup_conflict"
                cells[player.player_key]["reason"] = (
                    "All compatible active slots are consumed by the "
                    "maximum-cardinality assignment."
                )
            else:
                cells[player.player_key]["status"] = "startable"
                cells[player.player_key]["slot"] = assignment.slot

        startable = match.cardinality
        # A user-marked inactive player still has a scheduled team game, but is not a
        # lineup conflict. Conflicts are eligible players left unmatched by slot pressure.
        conflicts = len(day_players) - startable
        scheduled_total += scheduled
        startable_total += startable
        conflict_total += conflicts
        day_results.append(
            {
                "date": day.isoformat(),
                "nba_games": len(games_by_date[day]),
                "is_light_slate": len(games_by_date[day]) <= light_slate_threshold,
                "scheduled_player_games": scheduled,
                "startable_player_games": startable,
                "lineup_conflicts": conflicts,
                "assignments": [assignment.__dict__ for assignment in match.assignments],
                "cells": {str(key): value for key, value in cells.items()},
            }
        )

    display_players: dict[int, tuple[Player, tuple[str, ...], str]] = {
        entry.player_key: (entry.player, tuple(entry.eligible_slot_types_json), entry.roster_role)
        for entry in roster_entries
    }
    if scenario is not None and added_player is not None:
        display_players[added_player.player_key] = (
            added_player,
            scenario.added_eligible_slots,
            "scenario_add",
        )
    snapshot = _latest_snapshot(session)
    week_state = session.scalar(
        select(FantasyWeekState).where(
            FantasyWeekState.league_id == league.id,
            FantasyWeekState.week_start == week_start,
        )
    )
    acquisitions_used = week_state.acquisitions_used if week_state else 0
    return {
        "league": {
            "id": league.id,
            "name": league.name,
            "timezone": league.timezone,
            "lineup_mode": league.lineup_mode,
            "lineup_slots": league.lineup_slots_json,
            "acquisition_limit": league.acquisition_limit,
            "scoring_rules_version": league.scoring_rules_version,
            "roster_version": league.roster_version,
        },
        "week_start": week_start.isoformat(),
        "week_end": dates[-1].isoformat(),
        "week_state": {
            "acquisitions_used": acquisitions_used,
            "acquisitions_remaining": max(0, league.acquisition_limit - acquisitions_used),
        },
        "dates": [day.isoformat() for day in dates],
        "players": [
            {
                "id": player.player_key,
                "name": player.full_name,
                "team": player.current_team.abbreviation if player.current_team else None,
                "eligible_slots": list(eligibility),
                "roster_role": role,
                "recent_form": {
                    key: forms[player.player_key][key]
                    for key in (
                        "calculated_as_of",
                        "games_played",
                        "avg_minutes",
                        "fantasy_points_per_game",
                        "data_completeness",
                    )
                },
            }
            for player, eligibility, role in sorted(
                display_players.values(), key=lambda value: value[0].full_name.casefold()
            )
        ],
        "days": day_results,
        "summary": {
            "scheduled_player_games": scheduled_total,
            "startable_player_games": startable_total,
            "lineup_conflicts": conflict_total,
            "light_slate_threshold": light_slate_threshold,
        },
        "data_snapshot": {
            "id": snapshot.run_id if snapshot else None,
            "source": snapshot.source_name if snapshot else None,
            "finished_at": snapshot.finished_at.isoformat()
            if snapshot and snapshot.finished_at
            else None,
            "classification": "fixture"
            if snapshot and snapshot.source_name == "fixture"
            else "operational",
        },
        "caveats": [
            "Scheduled does not mean the player will be active or play.",
            "Eligibility is user-supplied and the fantasy platform remains authoritative.",
            "Watchlist status does not establish waiver availability.",
        ],
    }


def build_scenario_result(
    session: Session,
    *,
    league: FantasyLeague,
    week_start: date,
    change: ScenarioChange,
) -> dict[str, Any]:
    planning_as_of = datetime.now(UTC)
    before = build_week_plan(
        session, league=league, week_start=week_start, planning_as_of=planning_as_of
    )
    after = build_week_plan(
        session,
        league=league,
        week_start=week_start,
        scenario=change,
        planning_as_of=planning_as_of,
    )
    before_summary = before["summary"]
    after_summary = after["summary"]
    dropped_form = next(
        player["recent_form"]
        for player in before["players"]
        if player["id"] == change.dropped_player_id
    )
    added_form = next(
        player["recent_form"]
        for player in after["players"]
        if player["id"] == change.added_player_id
    )
    dropped_fantasy = dropped_form["fantasy_points_per_game"]
    added_fantasy = added_form["fantasy_points_per_game"]
    form_delta = (
        round(float(added_fantasy) - float(dropped_fantasy), 2)
        if added_fantasy is not None and dropped_fantasy is not None
        else None
    )
    return {
        "valid": True,
        "before": before,
        "after": after,
        "delta": {
            "scheduled_player_games": after_summary["scheduled_player_games"]
            - before_summary["scheduled_player_games"],
            "startable_player_games": after_summary["startable_player_games"]
            - before_summary["startable_player_games"],
            "lineup_conflicts": after_summary["lineup_conflicts"]
            - before_summary["lineup_conflicts"],
            "recent_fantasy_points_per_game": form_delta,
        },
        "recent_form_comparison": {
            "dropped": {"player_id": change.dropped_player_id, **dropped_form},
            "added": {"player_id": change.added_player_id, **added_form},
        },
        "explanation": (
            "Schedule and descriptive-form deltas use the same data snapshot, cutoff, and scoring "
            "configuration. No transaction is executed, and candidate availability or health is "
            "not inferred."
        ),
    }
