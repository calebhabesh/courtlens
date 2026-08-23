from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from courtload.models import DataQualityRun, Game, PlayerGame, Team


@dataclass(frozen=True)
class Check:
    name: str
    passed: bool
    observed: int | float | str
    expectation: str

    def as_dict(self) -> dict[str, Any]:
        return self.__dict__


def run_operational_checks(session: Session, *, persist: bool = True) -> DataQualityRun:
    duplicate_stats = session.execute(
        select(PlayerGame.game_key, PlayerGame.player_key, func.count())
        .group_by(PlayerGame.game_key, PlayerGame.player_key)
        .having(func.count() > 1)
    ).all()
    same_team_games = session.scalar(
        select(func.count()).select_from(Game).where(Game.home_team_key == Game.away_team_key)
    )
    invalid_attempts = session.scalar(
        select(func.count())
        .select_from(PlayerGame)
        .where(
            (PlayerGame.field_goals_made > PlayerGame.field_goals_attempted)
            | (PlayerGame.free_throws_made > PlayerGame.free_throws_attempted)
        )
    )
    orphan_team_count = session.scalar(
        select(func.count())
        .select_from(Game)
        .where(
            ~Game.home_team_key.in_(select(Team.team_key))
            | ~Game.away_team_key.in_(select(Team.team_key))
        )
    )
    checks = [
        Check(
            "unique_player_game_grain", not duplicate_stats, len(duplicate_stats), "0 duplicates"
        ),
        Check("home_away_teams_differ", same_team_games == 0, same_team_games or 0, "0 games"),
        Check("made_not_over_attempted", invalid_attempts == 0, invalid_attempts or 0, "0 rows"),
        Check(
            "game_team_referential_integrity",
            orphan_team_count == 0,
            orphan_team_count or 0,
            "0 rows",
        ),
    ]
    failed = sum(not check.passed for check in checks)
    run = DataQualityRun(
        status="passed" if failed == 0 else "failed",
        passed_count=len(checks) - failed,
        failed_count=failed,
        results_json=[check.as_dict() for check in checks],
    )
    if persist:
        session.add(run)
        session.commit()
    return run
