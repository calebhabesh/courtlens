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
