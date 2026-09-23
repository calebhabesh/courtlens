"""Point-in-time feature construction shared by baseline and challenger evaluation."""

from __future__ import annotations

import hashlib
import math
import statistics
from dataclasses import dataclass
from datetime import date
from typing import Any

from courtload.evaluation.config import canonical_json


@dataclass(frozen=True)
class PlayerGame:
    game_id: str
    player_id: str
    team_id: str
    opponent_id: str
    game_date: date
    season: str
    appearance: str
    minutes_seconds: int | None
    reference_points: float | None
    field_goal_attempts: int | None
    free_throw_attempts: int | None

    @property
    def is_valid_history(self) -> bool:
        return (
            self.appearance == "appeared"
            and self.minutes_seconds is not None
            and self.minutes_seconds > 0
            and self.reference_points is not None
        )


def mean(values: list[float]) -> float | None:
    return math.fsum(values) / len(values) if values else None


def sample_stddev(values: list[float]) -> float | None:
    return statistics.stdev(values) if len(values) >= 2 else None


def prior_valid_games(history: list[PlayerGame], cutoff: date) -> list[PlayerGame]:
    """Select valid same-season history strictly before the local cutoff date."""
    return [game for game in history if game.game_date < cutoff and game.is_valid_history]


def player_features(history: list[PlayerGame], cutoff: date) -> tuple[dict[str, Any], list[float]]:
    prior = prior_valid_games(history, cutoff)
    last_5 = prior[-5:]
    last_10 = prior[-10:]
    points = [float(game.reference_points) for game in prior if game.reference_points is not None]
    points_5 = [
        float(game.reference_points) for game in last_5 if game.reference_points is not None
    ]
    points_10 = [
        float(game.reference_points) for game in last_10 if game.reference_points is not None
    ]
    minutes_5 = [game.minutes_seconds / 60 for game in last_5 if game.minutes_seconds is not None]
    minutes_10 = [game.minutes_seconds / 60 for game in last_10 if game.minutes_seconds is not None]
    fga_10 = [
        float(game.field_goal_attempts) for game in last_10 if game.field_goal_attempts is not None
    ]
    fta_10 = [
        float(game.free_throw_attempts) for game in last_10 if game.free_throw_attempts is not None
    ]
    paired = [
        game
        for game in last_10
        if game.reference_points is not None
        and game.minutes_seconds is not None
        and game.minutes_seconds > 0
    ]
    paired_minutes = math.fsum(
        game.minutes_seconds / 60 for game in paired if game.minutes_seconds is not None
    )
    features = {
        "last_5_reference_mean": mean(points_5),
        "last_10_reference_mean": mean(points_10),
        "last_10_reference_stddev": sample_stddev(points_10),
        "valid_history_count_capped_50": min(len(points), 50),
        "last_5_minutes_mean": mean(minutes_5),
        "last_10_minutes_mean": mean(minutes_10),
        "last_10_minutes_stddev": sample_stddev(minutes_10),
        "last_10_fga_mean": mean(fga_10),
        "last_10_fta_mean": mean(fta_10),
        "last_10_reference_per_minute": (
            math.fsum(
                float(game.reference_points) for game in paired if game.reference_points is not None
            )
            / paired_minutes
            if paired_minutes
            else None
        ),
    }
    return features, points


def feature_hash(row: dict[str, Any]) -> str:
    """Hash only identity/membership and point-in-time inputs, never outcome fields."""
    return hashlib.sha256(canonical_json(row).encode()).hexdigest()
