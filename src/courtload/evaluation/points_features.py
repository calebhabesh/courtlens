"""Point-in-time feature construction for points-v1 forecasting experiment."""

from __future__ import annotations

import hashlib
import math
import statistics
from dataclasses import dataclass
from datetime import date
from typing import Any

from courtload.evaluation.config import canonical_json

PLAYER_FEATURES: tuple[str, ...] = (
    "last_5_pts_mean",
    "last_10_pts_mean",
    "last_10_pts_stddev",
    "valid_history_count_capped_50",
    "last_5_minutes_mean",
    "last_10_minutes_mean",
    "last_10_minutes_stddev",
    "last_10_fga_mean",
    "last_10_fta_mean",
    "last_10_pts_per_minute",
    "previous_season_pts_mean",
    "previous_season_minutes_mean",
    "previous_season_fga_mean",
    "previous_season_history_count_capped_82",
    "days_since_last_appearance_capped_30",
    "season_prior_age_days",
    "season_prior_missing",
    "lead_days",
)

CONTEXT_FEATURES: tuple[str, ...] = (
    "is_home",
    "team_rest_days_capped_30",
    "team_rest_days_missing",
    "back_to_back",
    "opponent_points_allowed_last_10",
    "opponent_points_allowed_valid_games",
    "opponent_context_missing",
)

POINTS_FEATURE_VARIANTS: dict[str, tuple[str, ...]] = {
    "player_only": PLAYER_FEATURES,
    "player_plus_context": PLAYER_FEATURES + CONTEXT_FEATURES,
}


@dataclass(frozen=True)
class PointsPlayerGame:
    game_id: str
    player_id: str
    team_id: str
    opponent_id: str
    game_date: date
    season: str
    phase: str
    appearance: str
    minutes_seconds: int | None
    points: int | None
    field_goal_attempts: int | None
    free_throw_attempts: int | None

    @property
    def is_valid_history(self) -> bool:
        """Valid history requires regular-season appeared game with positive minutes.

        Also requires nonnegative points.
        """
        return (
            self.phase == "regular_season"
            and self.appearance == "appeared"
            and self.minutes_seconds is not None
            and self.minutes_seconds > 0
            and self.points is not None
            and self.points >= 0
        )


def _safe_mean(values: list[float]) -> float | None:
    return math.fsum(values) / len(values) if values else None


def _safe_stddev(values: list[float]) -> float | None:
    return statistics.stdev(values) if len(values) >= 2 else None


def compute_player_features(
    current_history: list[PointsPlayerGame],
    prior_season_history: list[PointsPlayerGame] | None,
    cutoff: date,
    target_game_date: date,
) -> tuple[dict[str, Any], list[float], float | None]:
    """Compute point-in-time player features with strict temporal discipline (game_date < cutoff).

    Returns:
        features dictionary,
        list of current-season prior PTS outcomes,
        prior-season mean PTS (if eligible, else None)
    """
    valid_current = [g for g in current_history if g.game_date < cutoff and g.is_valid_history]
    pts_current = [float(g.points) for g in valid_current if g.points is not None]

    last_5 = valid_current[-5:]
    last_10 = valid_current[-10:]

    pts_5 = [float(g.points) for g in last_5 if g.points is not None]
    pts_10 = [float(g.points) for g in last_10 if g.points is not None]

    min_5 = [g.minutes_seconds / 60.0 for g in last_5 if g.minutes_seconds is not None]
    min_10 = [g.minutes_seconds / 60.0 for g in last_10 if g.minutes_seconds is not None]

    fga_10 = [float(g.field_goal_attempts) for g in last_10 if g.field_goal_attempts is not None]
    fta_10 = [float(g.free_throw_attempts) for g in last_10 if g.free_throw_attempts is not None]

    # Paired minutes and points on last 10
    paired_minutes = math.fsum(
        g.minutes_seconds / 60.0
        for g in last_10
        if g.minutes_seconds is not None and g.points is not None and g.minutes_seconds > 0
    )
    paired_pts = math.fsum(
        float(g.points)
        for g in last_10
        if g.minutes_seconds is not None and g.points is not None and g.minutes_seconds > 0
    )
    ppm_10 = (paired_pts / paired_minutes) if paired_minutes > 0 else None

    # Prior season features
    valid_prior = [g for g in (prior_season_history or []) if g.is_valid_history]
    prior_eligible = len(valid_prior) >= 20
    prior_pts_mean: float | None = None
    prior_min_mean: float | None = None
    prior_fga_mean: float | None = None
    prior_age_days: int | None = None

    if prior_eligible:
        prior_pts = [float(g.points) for g in valid_prior if g.points is not None]
        prior_min = [g.minutes_seconds / 60.0 for g in valid_prior if g.minutes_seconds is not None]
        prior_fga = [
            float(g.field_goal_attempts) for g in valid_prior if g.field_goal_attempts is not None
        ]
        prior_pts_mean = _safe_mean(prior_pts)
        prior_min_mean = _safe_mean(prior_min)
        prior_fga_mean = _safe_mean(prior_fga)
        last_prior_date = max(g.game_date for g in valid_prior)
        prior_age_days = (cutoff - last_prior_date).days

    days_since_last = None
    if valid_current:
        days_since_last = min((cutoff - valid_current[-1].game_date).days, 30)

    lead_days = max(0, min((target_game_date - cutoff).days, 6))

    features: dict[str, Any] = {
        "last_5_pts_mean": _safe_mean(pts_5),
        "last_10_pts_mean": _safe_mean(pts_10),
        "last_10_pts_stddev": _safe_stddev(pts_10),
        "valid_history_count_capped_50": min(len(valid_current), 50),
        "last_5_minutes_mean": _safe_mean(min_5),
        "last_10_minutes_mean": _safe_mean(min_10),
        "last_10_minutes_stddev": _safe_stddev(min_10),
        "last_10_fga_mean": _safe_mean(fga_10),
        "last_10_fta_mean": _safe_mean(fta_10),
        "last_10_pts_per_minute": ppm_10,
        "previous_season_pts_mean": prior_pts_mean,
        "previous_season_minutes_mean": prior_min_mean,
        "previous_season_fga_mean": prior_fga_mean,
        "previous_season_history_count_capped_82": min(len(valid_prior), 82)
        if prior_eligible
        else 0,
        "days_since_last_appearance_capped_30": days_since_last,
        "season_prior_age_days": prior_age_days,
        "season_prior_missing": 0 if prior_eligible else 1,
        "lead_days": lead_days,
    }

    return features, pts_current, prior_pts_mean


def compute_context_features(
    is_home: bool,
    team_schedule: list[dict[str, Any]],
    target_game_id: str,
    target_game_date: date,
    opponent_prior_games: list[dict[str, Any]],
    cutoff: date,
) -> dict[str, Any]:
    """Compute context features: home/away, rest days, opponent points allowed."""
    target_index = next(
        (i for i, g in enumerate(team_schedule) if g["game_id"] == target_game_id),
        None,
    )
    prior_team_game = team_schedule[target_index - 1] if target_index and target_index > 0 else None

    team_rest: int | None = None
    if prior_team_game is not None:
        raw_rest = (target_game_date - prior_team_game["game_date"]).days - 1
        team_rest = max(0, min(raw_rest, 30))

    # Opponent points allowed in prior regular season games strictly before cutoff
    valid_opp_games = [
        g
        for g in opponent_prior_games
        if g["game_date"] < cutoff
        and g.get("phase") == "regular_season"
        and g.get("opponent_points") is not None
    ]
    opp_last_10 = valid_opp_games[-10:]
    opp_points_allowed: float | None = None
    opp_valid_count = len(opp_last_10)

    if opp_valid_count >= 5:
        opp_points_allowed = (
            math.fsum(float(g["opponent_points"]) for g in opp_last_10) / opp_valid_count
        )

    return {
        "is_home": 1 if is_home else 0,
        "team_rest_days_capped_30": team_rest,
        "team_rest_days_missing": 1 if team_rest is None else 0,
        "back_to_back": 1 if team_rest == 0 else 0,
        "opponent_points_allowed_last_10": opp_points_allowed,
        "opponent_points_allowed_valid_games": opp_valid_count,
        "opponent_context_missing": 1 if opp_points_allowed is None else 0,
    }


def compute_points_feature_hash(features: dict[str, Any]) -> str:
    """Hash feature inputs for point-in-time immutability verification."""
    clean = {k: v for k, v in features.items() if not k.startswith("_") and k != "candidate_id"}
    return hashlib.sha256(canonical_json(clean).encode()).hexdigest()
