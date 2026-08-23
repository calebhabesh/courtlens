from __future__ import annotations

from datetime import datetime
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from courtload.domain.scoring import fantasy_points, scoring_breakdown
from courtload.models import Game, PlayerGame

STAT_FIELDS = (
    "points",
    "rebounds",
    "assists",
    "steals",
    "blocks",
    "turnovers",
    "three_pointers_made",
    "field_goals_made",
    "field_goals_attempted",
    "free_throws_made",
    "free_throws_attempted",
    "offensive_rebounds",
    "defensive_rebounds",
    "personal_fouls",
)


def stat_line(row: PlayerGame) -> dict[str, float]:
    return {field: float(getattr(row, field) or 0) for field in STAT_FIELDS}


def recent_form(
    session: Session,
    *,
    player_id: int,
    as_of: datetime,
    window: int,
    scoring_rules: dict[str, float],
) -> dict[str, Any]:
    if window < 1 or window > 50:
        raise ValueError("window must be between 1 and 50 games")
    rows = session.scalars(
        select(PlayerGame)
        .join(Game, Game.game_key == PlayerGame.game_key)
        .where(
            PlayerGame.player_key == player_id,
            Game.scheduled_start_utc < as_of,
            Game.status_state == "final",
        )
        .order_by(Game.scheduled_start_utc.desc())
        .limit(window)
    ).all()
    games: list[dict[str, Any]] = []
    for row in rows:
        values = stat_line(row)
        games.append(
            {
                "source_stat_id": row.source_stat_id,
                "source_object_id": row.source_object_id,
                "game_id": row.game_key,
                "tipoff_utc": row.game.scheduled_start_utc.isoformat(),
                "minutes": row.minutes,
                "fantasy_points": fantasy_points(values, scoring_rules),
                "stats": values,
                "scoring_breakdown": scoring_breakdown(values, scoring_rules),
                "appearance_status": row.appearance_status,
                "lineage_url": f"/api/lineage/player-games/{row.source_stat_id}",
            }
        )
    total_minutes = sum(float(game["minutes"] or 0) for game in games)
    total_fantasy = sum(float(game["fantasy_points"]) for game in games)
    return {
        "player_id": player_id,
        "calculated_as_of": as_of.isoformat(),
        "requested_window": window,
        "games_played": len(games),
        "avg_minutes": round(total_minutes / len(games), 2) if games else None,
        "fantasy_points_per_game": round(total_fantasy / len(games), 2) if games else None,
        "fantasy_points_per_minute": round(total_fantasy / total_minutes, 3)
        if total_minutes
        else None,
        "data_completeness": round(len(games) / window, 3),
        "games": games,
        "methodology": (
            "Only final games with tipoff strictly before calculated_as_of are included."
        ),
    }
