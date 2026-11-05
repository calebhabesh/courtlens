"""Pure rules for Projected Impact (`courtlens-projected-impact-v1`, R07).

Shared by the fitting code and the weekly scorer, so test seasons and 2026-27 are scored by one
definition. No numpy: the API imports this module and stays light.
"""

from __future__ import annotations

import math
from collections.abc import Iterable, Mapping
from dataclasses import dataclass

REGISTRATION = "courtlens-projected-impact-v1"
NOMINAL_COVERAGE = 0.8
MINUTE_BUCKETS = (500.0, 1500.0)
NO_PRIOR_BUCKET = "no_prior"
INTERVAL_MIN_TARGET_MINUTES = 500.0
ROOKIE = "rookie"
RETURNER = "returner"
PRIOR = "prior"
TIP_OFF_LABEL_PROSPECTIVE = "prospective"
TIP_OFF_LABEL_HINDSIGHT = "hindsight"


def minutes_bucket(prior_minutes: float | None, group: str) -> str:
    """Interval bucket, known before the season: last season's minutes, or no prior fit."""
    if group != PRIOR or prior_minutes is None:
        return NO_PRIOR_BUCKET
    low, high = MINUTE_BUCKETS
    if prior_minutes < low:
        return "under_500"
    return "500_to_1499" if prior_minutes < high else "1500_plus"


def conformal_quantile(residuals: Iterable[float], coverage: float = NOMINAL_COVERAGE) -> float:
    """Split-conformal half-width: the ceil((n + 1) x coverage)-th smallest absolute residual.

    With too few residuals for that rank the interval is unbounded in theory; the largest
    residual is used and the test-season coverage check reports the result.
    """
    ordered = sorted(abs(r) for r in residuals)
    if not ordered:
        raise ValueError("no residuals to calibrate on")
    rank = math.ceil((len(ordered) + 1) * coverage)
    return ordered[min(rank, len(ordered)) - 1]


@dataclass(frozen=True)
class BoxPlayer:
    player_id: str
    side: str  # "home" or "away"
    seconds: float


@dataclass(frozen=True)
class Strength:
    difference: float
    unprojected_seconds: float
    total_seconds: float


def strength_difference(
    players: Iterable[BoxPlayer], ratings: Mapping[str, float], fallback: float
) -> Strength:
    """Home minus away of (box minutes / 48) x rating. A player with no rating takes `fallback`."""
    difference = unprojected = total = 0.0
    for player in players:
        if player.seconds <= 0:
            continue
        rating = ratings.get(player.player_id)
        if rating is None:
            rating = fallback
            unprojected += player.seconds
        share = player.seconds / 60.0 / 48.0
        difference += share * rating if player.side == "home" else -share * rating
        total += player.seconds
    return Strength(difference, unprojected, total)


def predicted_margin(difference: float, a: float, b: float) -> float:
    return a + b * difference


def prospective_label(tip_utc: str | None, frozen_at: str) -> str:
    """Prospective only if the scheduled tip is known and after the freeze timestamp."""
    if tip_utc is None:
        return TIP_OFF_LABEL_HINDSIGHT
    from datetime import datetime

    tip = datetime.fromisoformat(tip_utc.replace("Z", "+00:00"))
    frozen = datetime.fromisoformat(frozen_at.replace("Z", "+00:00"))
    return TIP_OFF_LABEL_PROSPECTIVE if tip > frozen else TIP_OFF_LABEL_HINDSIGHT
