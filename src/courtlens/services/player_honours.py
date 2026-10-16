"""Comparison identity extras derived from admitted box scores: team order and championships.

Team order lists a player's teams in the scope by last appearance (a traded player's current
team last). Championships are counted from playoff team games: a season's champion is the team
that won every playoff round, and a player shares the title when they appeared for that team in
that postseason. Only titles decided strictly before the cutoff count.
A player whose first admitted game is in the first admitted season may have earlier titles, so
their count is marked incomplete rather than presented as a career total.
"""

from __future__ import annotations

from datetime import date
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from courtlens.domain.teams import resolve_team_tricode
from courtlens.workbench_models import WorkbenchPlayerGame, WorkbenchTeamGame

# Best-of-seven rounds a champion won while the first round was best-of-five (through 2002-03).
_ROUNDS_BEST_OF_SEVEN_BEFORE_2004 = 3


def teams_by_last_appearance(
    session: Session,
    dataset_id: str | None,
    season: str | None,
    phase: str | None,
    before_date: date | None,
    player_ids: list[str],
) -> dict[str, list[str]]:
    """Tricodes per player in the scope, oldest last appearance first."""
    if dataset_id is None or not player_ids:
        return {}
    query = (
        select(
            WorkbenchPlayerGame.player_id,
            WorkbenchPlayerGame.team_id,
            func.max(WorkbenchPlayerGame.game_date),
        )
        .where(
            WorkbenchPlayerGame.dataset_id == dataset_id,
            WorkbenchPlayerGame.player_id.in_(player_ids),
            WorkbenchPlayerGame.appearance == "appeared",
        )
        .group_by(WorkbenchPlayerGame.player_id, WorkbenchPlayerGame.team_id)
    )
    if season is not None:
        query = query.where(WorkbenchPlayerGame.season == season)
    if phase is not None:
        query = query.where(WorkbenchPlayerGame.phase == phase)
    if before_date is not None:
        query = query.where(WorkbenchPlayerGame.game_date < before_date)
    rows: dict[str, list[tuple[date, str]]] = {}
    for player_id, team_id, latest in session.execute(query).all():
        rows.setdefault(player_id, []).append((latest, resolve_team_tricode(team_id)))
    return {
        player_id: [team for _, team in sorted(entries, key=lambda entry: (entry[0], entry[1]))]
        for player_id, entries in rows.items()
    }


def season_champions(session: Session, dataset_id: str, before_date: date | None) -> dict[str, str]:
    """Season -> champion team ID for finals decided before the cutoff."""
    query = select(
        WorkbenchTeamGame.season,
        WorkbenchTeamGame.team_id,
        WorkbenchTeamGame.opponent_id,
        WorkbenchTeamGame.game_date,
        WorkbenchTeamGame.points,
        WorkbenchTeamGame.opponent_points,
    ).where(
        WorkbenchTeamGame.dataset_id == dataset_id,
        WorkbenchTeamGame.phase == "playoffs",
        WorkbenchTeamGame.is_final.is_(True),
    )
    if before_date is not None:
        query = query.where(WorkbenchTeamGame.game_date < before_date)
    wins: dict[tuple[str, str, str], int] = {}
    for season, team, opponent, _, points, opponent_points in session.execute(query).all():
        if points > opponent_points:
            wins[(season, team, opponent)] = wins.get((season, team, opponent), 0) + 1
    # The champion has won every round: four best-of-seven series. Through 2002-03 the first
    # round was best-of-five, so three best-of-seven wins complete the run. Winning a conference
    # final is never enough, so a cutoff anywhere before the Finals end leaves no champion.
    series_won: dict[tuple[str, str], int] = {}
    for (season, team, _), count in wins.items():
        if count >= 4:
            series_won[(season, team)] = series_won.get((season, team), 0) + 1
    return {
        season: team
        for (season, team), won in series_won.items()
        if won >= (_ROUNDS_BEST_OF_SEVEN_BEFORE_2004 if season < "2003-04" else 4)
    }


def championships(
    session: Session, dataset_id: str | None, before_date: date | None, player_ids: list[str]
) -> dict[str, dict[str, Any]]:
    """Per player: titles won before the cutoff, and whether admitted seasons cover the career."""
    if dataset_id is None or not player_ids:
        return {}
    champions = season_champions(session, dataset_id, before_date)
    first_season = session.scalar(
        select(func.min(WorkbenchPlayerGame.season)).where(
            WorkbenchPlayerGame.dataset_id == dataset_id
        )
    )
    debuts: dict[str, str] = {
        player_id: debut
        for player_id, debut in session.execute(
            select(WorkbenchPlayerGame.player_id, func.min(WorkbenchPlayerGame.season))
            .where(
                WorkbenchPlayerGame.dataset_id == dataset_id,
                WorkbenchPlayerGame.player_id.in_(player_ids),
            )
            .group_by(WorkbenchPlayerGame.player_id)
        ).all()
    }
    playoff_teams: dict[str, set[tuple[str, str]]] = {}
    if champions:
        for player_id, season, team in session.execute(
            select(
                WorkbenchPlayerGame.player_id,
                WorkbenchPlayerGame.season,
                WorkbenchPlayerGame.team_id,
            )
            .where(
                WorkbenchPlayerGame.dataset_id == dataset_id,
                WorkbenchPlayerGame.player_id.in_(player_ids),
                WorkbenchPlayerGame.phase == "playoffs",
                WorkbenchPlayerGame.appearance == "appeared",
                WorkbenchPlayerGame.season.in_(list(champions)),
            )
            .distinct()
        ).all():
            playoff_teams.setdefault(player_id, set()).add((season, team))
    result: dict[str, dict[str, Any]] = {}
    for player_id in player_ids:
        seasons = sorted(
            season
            for season, team in playoff_teams.get(player_id, set())
            if champions.get(season) == team
        )
        debut = debuts.get(player_id)
        result[player_id] = {
            "seasons": seasons,
            "coverage_from": first_season,
            "complete": debut is not None and first_season is not None and debut > first_season,
        }
    return result


def availability(
    session: Session,
    dataset_id: str | None,
    phase: str | None,
    before_date: date | None,
    player_ids: list[str],
    season: str | None = None,
) -> dict[str, dict[str, int]]:
    """Per player: games played and their teams' games over the same span, before the cutoff.

    ``season`` limits the span to one season; without it every admitted season counts (a career
    through the cutoff). There is no roster feed, so each team's span is estimated from
    appearances: a player's first team of a season counts from the season's first game, and a
    later team from the player's first game for it, which also closes the previous team's span.
    A single-team season is exact; around a trade the split can be off by a game or two, and a
    mid-season signing counts the team's earlier games as missed. A game with no appearance is
    only "not played": nothing here says why.
    """
    if dataset_id is None or not player_ids:
        return {}
    appearances = (
        select(
            WorkbenchPlayerGame.player_id,
            WorkbenchPlayerGame.season,
            WorkbenchPlayerGame.team_id,
            func.count(),
            func.min(WorkbenchPlayerGame.game_date),
        )
        .where(
            WorkbenchPlayerGame.dataset_id == dataset_id,
            WorkbenchPlayerGame.player_id.in_(player_ids),
            WorkbenchPlayerGame.appearance == "appeared",
        )
        .group_by(
            WorkbenchPlayerGame.player_id, WorkbenchPlayerGame.season, WorkbenchPlayerGame.team_id
        )
    )
    if season is not None:
        appearances = appearances.where(WorkbenchPlayerGame.season == season)
    if phase is not None:
        appearances = appearances.where(WorkbenchPlayerGame.phase == phase)
    if before_date is not None:
        appearances = appearances.where(WorkbenchPlayerGame.game_date < before_date)
    stints: dict[tuple[str, str], list[tuple[date, str, int]]] = {}
    for player_id, stint_season, team, games, first in session.execute(appearances).all():
        stints.setdefault((player_id, stint_season), []).append((first, team, games))
    if not stints:
        return {player_id: {"games": 0, "team_games": 0} for player_id in player_ids}
    schedule = select(
        WorkbenchTeamGame.season, WorkbenchTeamGame.team_id, WorkbenchTeamGame.game_date
    ).where(
        WorkbenchTeamGame.dataset_id == dataset_id,
        WorkbenchTeamGame.season.in_({key[1] for key in stints}),
        WorkbenchTeamGame.team_id.in_(
            {team for entries in stints.values() for _, team, _ in entries}
        ),
        WorkbenchTeamGame.is_final.is_(True),
    )
    if phase is not None:
        schedule = schedule.where(WorkbenchTeamGame.phase == phase)
    if before_date is not None:
        schedule = schedule.where(WorkbenchTeamGame.game_date < before_date)
    dates: dict[tuple[str, str], list[date]] = {}
    for team_season, team, day in session.execute(schedule).all():
        dates.setdefault((team_season, team), []).append(day)
    result = {player_id: {"games": 0, "team_games": 0} for player_id in player_ids}
    for (player_id, stint_season), entries in stints.items():
        ordered = sorted(entries)
        played = sum(games for _, _, games in ordered)
        spans = 0
        for index, (first, team, _) in enumerate(ordered):
            start = None if index == 0 else first
            end = ordered[index + 1][0] if index + 1 < len(ordered) else None
            spans += sum(
                1
                for day in dates.get((stint_season, team), [])
                if (start is None or day >= start) and (end is None or day < end)
            )
        # Teams reach a trade date with different games played, so the spans can add up to more
        # than a season: cap them at the most games any of the player's teams played. A game
        # missing from the schedule never makes availability exceed 100%.
        longest = max(len(dates.get((stint_season, team), [])) for _, team, _ in ordered)
        result[player_id]["games"] += played
        result[player_id]["team_games"] += max(min(spans, longest), played)
    return result
