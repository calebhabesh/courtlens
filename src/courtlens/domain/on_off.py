"""Shared-floor operation contracts and game-cluster descriptive uncertainty."""

from __future__ import annotations

import math
from datetime import date
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator

# v1 (frozen) read stints only from the release dataset and had no rate metrics.
OPERATION_VERSION_V1 = "courtload-shared-floor-v1"
OPERATION_VERSION = "courtlens-shared-floor-v2"
STAT_KEYS = (
    "points",
    "fgm",
    "fga",
    "fg3m",
    "fg3a",
    "ftm",
    "fta",
    "oreb",
    "dreb",
    "ast",
    "stl",
    "blk",
    "tov",
    "pf",
)
# Focal ratios of summed fields; the possession and game gates come from the cell.
RATE_METRICS = ("usage_pct", "ts_pct", "fg3_pct")


class SharedFloorRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    team_id: str = Field(min_length=1, max_length=100)
    release_id: str | None = None
    season: str | None = None
    phase: (
        Literal["preseason", "regular_season", "play_in", "playoffs", "cup_final", "summer_league"]
        | None
    ) = None
    before_date: date | None = None
    lower_date: date | None = None
    together: list[str] = Field(default_factory=list, max_length=5)
    apart: list[str] = Field(default_factory=list, max_length=5)
    exact_unit: list[str] = Field(default_factory=list, max_length=5)
    player_id: str | None = Field(default=None, min_length=1, max_length=100)
    min_possessions: float = Field(default=100.0, ge=1, le=10000, allow_inf_nan=False)
    min_games: int = Field(default=5, ge=1, le=82)

    @model_validator(mode="after")
    def validate_conditions(self) -> SharedFloorRequest:
        conditions = self.together + self.apart + self.exact_unit
        if not conditions or len(conditions) > 5 or len(set(conditions)) != len(conditions):
            raise ValueError("Supply one to five distinct player conditions")
        if any(not p.strip() or len(p) > 100 for p in conditions):
            raise ValueError("Invalid player identity")
        if self.exact_unit and (len(self.exact_unit) < 2 or self.together or self.apart):
            raise ValueError("Exact units require 2-5 players and cannot mix with set conditions")
        if self.lower_date and self.before_date and self.lower_date >= self.before_date:
            raise ValueError("lower_date must precede exclusive before_date")
        self.together = sorted(self.together)
        self.apart = sorted(self.apart)
        self.exact_unit = sorted(self.exact_unit)
        return self


class UncertaintyInterval(BaseModel):
    lower: float | None = None
    upper: float | None = None
    level: float = 0.95
    method: str = "game-cluster ratio linearization, normal approximation"
    games: int
    reason: str | None = None


class ExposureCell(BaseModel):
    key: str
    present: list[str] = Field(default_factory=list)
    absent: list[str] = Field(default_factory=list)
    games: int
    stints: int
    seconds: float
    minutes: float
    offensive_possessions: float
    defensive_possessions: float
    points: int | None
    points_allowed: int | None
    sample_status: Literal["available", "insufficient_sample", "empty"]
    reason: str | None
    event_totals: dict[str, float | None] = Field(default_factory=dict)
    raw_metrics: dict[str, float | None]
    metric_denominators: dict[str, float]
    metric_valid_stints: dict[str, int]
    intervals: dict[str, UncertaintyInterval]


class MetricShift(BaseModel):
    metric: str
    selected_value: float | None
    complement_value: float | None
    difference: float | None
    interval: UncertaintyInterval


class SharedFloorResponse(BaseModel):
    operation: Literal["wowy", "on-off", "stat-shift"]
    operation_version: str = OPERATION_VERSION
    context: dict[str, Any]
    request: SharedFloorRequest
    coverage_status: Literal["available", "partial", "source_blocked"]
    expected_games: int
    observed_games: int
    excluded_stints: int
    cells: list[ExposureCell]
    partitions: list[ExposureCell]
    shifts: list[MetricShift]
    input_hash: str
    evidence_hash: str
    disclosures: list[str]


def lineup_matches(lineup: list[str], request: SharedFloorRequest) -> bool:
    """All together players present, all apart absent; unit is a contained exact set.

    A 2-4 player unit permits other teammates; a 5 player unit equals the whole side.
    """
    players = set(lineup)
    return (
        set(request.together + request.exact_unit) <= players and not set(request.apart) & players
    )


def ratio_interval(
    clusters: dict[str, tuple[float, float]], scale: float = 100.0
) -> UncertaintyInterval:
    """Cluster sandwich SE for a ratio of sums; each game is one independent cluster."""
    n = len(clusters)
    denominator = sum(d for _, d in clusters.values())
    if n < 10 or denominator <= 0:
        return UncertaintyInterval(
            games=n, reason="Requires at least 10 games and positive exposure"
        )
    numerator = sum(y for y, _ in clusters.values())
    ratio = numerator / denominator
    residuals = [(y - ratio * d) / denominator * scale for y, d in clusters.values()]
    se = math.sqrt(n / (n - 1) * sum(r * r for r in residuals))
    estimate = ratio * scale
    return UncertaintyInterval(
        games=n, lower=estimate - 1.959963984540054 * se, upper=estimate + 1.959963984540054 * se
    )


def difference_interval(
    selected: dict[str, tuple[float, float]], complement: dict[str, tuple[float, float]]
) -> UncertaintyInterval:
    """Paired game-cluster SE preserves covariance between selected and complement."""
    ids = set(selected) | set(complement)
    n = len(ids)
    da = sum(d for _, d in selected.values())
    db = sum(d for _, d in complement.values())
    if len(selected) < 10 or len(complement) < 10 or da <= 0 or db <= 0:
        return UncertaintyInterval(games=n, reason="Each split requires 10 valid games")
    ra = sum(y for y, _ in selected.values()) / da
    rb = sum(y for y, _ in complement.values()) / db
    residuals = []
    for gid in sorted(ids):
        ya, xa = selected.get(gid, (0.0, 0.0))
        yb, xb = complement.get(gid, (0.0, 0.0))
        residuals.append(100 * ((ya - ra * xa) / da - (yb - rb * xb) / db))
    se = math.sqrt(n / (n - 1) * sum(r * r for r in residuals))
    delta = 100 * (ra - rb)
    return UncertaintyInterval(
        games=n, lower=delta - 1.959963984540054 * se, upper=delta + 1.959963984540054 * se
    )


def linear_ratio_interval(
    terms: list[tuple[dict[str, tuple[float, float]], float]],
) -> UncertaintyInterval:
    """Joint cluster covariance for sums/differences of directional rating ratios."""
    ids = set().union(*(set(clusters) for clusters, _ in terms))
    n = len(ids)
    if any(
        len(clusters) < 10 or sum(d for _, d in clusters.values()) <= 0 for clusters, _ in terms
    ):
        return UncertaintyInterval(games=n, reason="Each directional split requires 10 valid games")
    estimate = 0.0
    influence = dict.fromkeys(sorted(ids), 0.0)
    for clusters, weight in terms:
        denominator = sum(d for _, d in clusters.values())
        ratio = sum(y for y, _ in clusters.values()) / denominator
        estimate += weight * 100 * ratio
        for gid, (y, d) in clusters.items():
            influence[gid] += weight * 100 * (y - ratio * d) / denominator
    se = math.sqrt(n / (n - 1) * sum(r * r for r in influence.values()))
    return UncertaintyInterval(
        games=n, lower=estimate - 1.959963984540054 * se, upper=estimate + 1.959963984540054 * se
    )


class StatShiftRosterRequest(BaseModel):
    """Every teammate's stat shift with one subject on the floor versus off it.

    Without a team it returns only the scopes (the page before a team is picked); without a
    season it uses the latest season with admitted stints.
    """

    model_config = ConfigDict(extra="forbid")

    team_id: str | None = Field(default=None, min_length=1, max_length=100)
    release_id: str | None = None
    season: str | None = None
    phase: (
        Literal["preseason", "regular_season", "play_in", "playoffs", "cup_final", "summer_league"]
        | None
    ) = None
    before_date: date | None = None
    lower_date: date | None = None
    subject_id: str | None = Field(default=None, min_length=1, max_length=100)
    min_possessions: float = Field(default=100.0, ge=1, le=10000, allow_inf_nan=False)
    min_games: int = Field(default=5, ge=1, le=82)

    @model_validator(mode="after")
    def validate_dates(self) -> StatShiftRosterRequest:
        if self.lower_date and self.before_date and self.lower_date >= self.before_date:
            raise ValueError("lower_date must precede exclusive before_date")
        return self


class RosterPlayer(BaseModel):
    player_id: str
    name: str | None
    games: int
    minutes: float


class StatShiftRosterResponse(BaseModel):
    operation_version: str = OPERATION_VERSION
    context: dict[str, Any]
    team_id: str | None
    subject_id: str | None
    coverage_status: Literal["available", "partial", "source_blocked"]
    expected_games: int
    observed_games: int
    excluded_stints: int
    # Season/phase pairs with admitted stints; other scopes are source-blocked.
    available_scopes: list[dict[str, str]]
    roster: list[RosterPlayer]
    shifts: list[SharedFloorResponse]
