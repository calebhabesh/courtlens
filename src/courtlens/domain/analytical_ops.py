"""Canonical analytical operations, quantile interpolations, splits, and similarity."""

from __future__ import annotations

import math
from datetime import date
from enum import StrEnum
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field


class PeriodMode(StrEnum):
    APPEARANCES = "appearances"
    DATE_RANGE = "date_range"


class SplitType(StrEnum):
    VENUE = "venue"
    REST = "rest"
    OPPONENT = "opponent"
    ALL = "all"


class DistributionMeasure(StrEnum):
    IQR = "iqr"
    POPULATION_SD = "population_sd"
    MEAN = "mean"
    MEDIAN = "median"


# --- Pure Mathematical Functions ---


def quantile_type_7(sorted_values: list[float], p: float) -> float:
    """Compute quantile using linear interpolation (type 7, NumPy/scipy/pandas default).

    Given sorted values y_0 <= y_1 <= ... <= y_{n-1} and p in [0, 1]:
    h = (n - 1) * p
    i = floor(h), f = h - i
    quantile = (1 - f) * y_i + f * y_{i+1}
    """
    n = len(sorted_values)
    if n == 0:
        raise ValueError("Cannot compute quantile on an empty list")
    if n == 1:
        return float(sorted_values[0])
    if p < 0.0 or p > 1.0:
        raise ValueError(f"Quantile probability p must be in [0, 1], got {p}")

    h = (n - 1) * p
    i = math.floor(h)
    f = h - i

    if i >= n - 1:
        return float(sorted_values[-1])
    return float((1.0 - f) * sorted_values[i] + f * sorted_values[i + 1])


def compute_population_sd(values: list[float], mean: float) -> float:
    """Compute descriptive population standard deviation: sqrt(1/N * sum((x - mean)^2))."""
    n = len(values)
    if n == 0:
        return 0.0
    variance = sum((x - mean) ** 2 for x in values) / n
    return math.sqrt(variance)


def compute_distribution_summary(values: list[float]) -> dict[str, Any]:
    """Compute descriptive distribution statistics with strict n >= 5 sample rule.

    If n < 5, summary statistics are unavailable per CourtLens empirical rules.
    """
    n = len(values)
    if n < 5:
        return {
            "summary_available": False,
            "reason": f"Insufficient sample size (n = {n} < 5) for distribution estimation.",
            "n": n,
            "mean": None,
            "median": None,
            "min": None,
            "max": None,
            "population_sd": None,
            "p10": None,
            "p25": None,
            "p75": None,
            "p90": None,
            "iqr": None,
        }

    sorted_vals = sorted(values)
    mean_val = round(sum(sorted_vals) / n, 2)
    sd_val = round(compute_population_sd(sorted_vals, mean_val), 2)
    p10_val = round(quantile_type_7(sorted_vals, 0.10), 2)
    p25_val = round(quantile_type_7(sorted_vals, 0.25), 2)
    median_val = round(quantile_type_7(sorted_vals, 0.50), 2)
    p75_val = round(quantile_type_7(sorted_vals, 0.75), 2)
    p90_val = round(quantile_type_7(sorted_vals, 0.90), 2)
    iqr_val = round(p75_val - p25_val, 2)

    return {
        "summary_available": True,
        "reason": None,
        "n": n,
        "mean": mean_val,
        "median": median_val,
        "min": round(sorted_vals[0], 2),
        "max": round(sorted_vals[-1], 2),
        "population_sd": sd_val,
        "p10": p10_val,
        "p25": p25_val,
        "p75": p75_val,
        "p90": p90_val,
        "iqr": iqr_val,
    }


def compute_period_delta(
    val_a: float | None, val_b: float | None
) -> tuple[float | None, float | None]:
    """Compute absolute and percentage deltas between Period A and Period B.

    Returns (absolute_delta, percentage_delta).
    Percentage delta is null when prior denominator val_b is zero or either value is None.
    """
    if val_a is None or val_b is None:
        return None, None

    abs_delta = round(val_a - val_b, 2)
    pct_delta = None if abs(val_b) < 1e-9 else round(((val_a - val_b) / abs(val_b)) * 100.0, 2)

    return abs_delta, pct_delta


def calculate_calendar_gap(current_date: date, previous_date: date | None) -> int | None:
    """Full local calendar days between dates: max(0, (current - prev).days - 1).

    0 means back-to-back (consecutive calendar days, e.g. Oct 25 and Oct 26: difference 1 - 1 = 0).
    """
    if previous_date is None:
        return None
    delta = (current_date - previous_date).days
    return max(0, delta - 1)


def categorize_rest_bucket(rest_days: int | None) -> str:
    """Categorize rest days into standard contract rest buckets."""
    if rest_days is None:
        return "Unknown / Season Opener"
    if rest_days == 0:
        return "0 days (Back-to-back)"
    if rest_days == 1:
        return "1 day"
    if rest_days == 2:
        return "2 days"
    return "3+ days"


# --- Schemas for Period Comparison ---


class MetricDelta(BaseModel):
    metric_key: str
    display_name: str
    period_a_value: float | None = None
    period_b_value: float | None = None
    absolute_delta: float | None = None
    percentage_delta: float | None = None
    period_a_n: int = 0
    period_b_n: int = 0


class PeriodSummary(BaseModel):
    label: str
    mode: PeriodMode
    start_date: str | None = None
    end_date: str | None = None
    appearances_count: int = 0
    total_minutes: float = 0.0
    min_per_game: float | None = None
    stints: list[str] = Field(default_factory=list)
    metrics: dict[str, float | None] = Field(default_factory=dict)
    sample_counts: dict[str, int] = Field(default_factory=dict)


class ComparePeriodsRequest(BaseModel):
    model_config = ConfigDict(frozen=True)

    player_id: str
    season: str | None = None
    phase: str = "regular_season"
    before_date: date | None = None
    release_id: str | None = None
    mode: PeriodMode = PeriodMode.APPEARANCES
    period_a_n: int = Field(default=10, ge=1, le=82)
    period_b_n: int = Field(default=10, ge=1, le=82)
    period_a_from: date | None = None
    period_a_to: date | None = None
    period_b_from: date | None = None
    period_b_to: date | None = None
    metrics: list[str] | None = None


class ComparePeriodsResponse(BaseModel):
    operation_version: str = "v1"
    evidence_hash: str
    player_id: str
    player_name: str
    season: str
    phase: str
    before_date: str
    period_a: PeriodSummary
    period_b: PeriodSummary
    deltas: list[MetricDelta]
    has_calendar_overlap: bool = False
    disclosures: list[str] = Field(default_factory=list)


# --- Schemas for Distribution ---


class DistributionSamplePoint(BaseModel):
    game_id: str
    game_date: str
    team_tricode: str
    opponent_tricode: str
    is_home: bool
    minutes: float | None
    value: float | None


class DistributionSummary(BaseModel):
    summary_available: bool
    reason: str | None = None
    n: int
    mean: float | None = None
    median: float | None = None
    min: float | None = None
    max: float | None = None
    population_sd: float | None = None
    p10: float | None = None
    p25: float | None = None
    p75: float | None = None
    p90: float | None = None
    iqr: float | None = None


class DistributionRequest(BaseModel):
    model_config = ConfigDict(frozen=True)

    player_id: str
    metric: str = "pts"
    season: str | None = None
    phase: str = "regular_season"
    before_date: date | None = None
    release_id: str | None = None
    window_n: int = Field(default=20, ge=1, le=82)
    from_date: date | None = None
    to_date: date | None = None


class DistributionResponse(BaseModel):
    operation_version: str = "v1"
    evidence_hash: str
    player_id: str
    player_name: str
    metric: str
    metric_display_name: str
    metric_unit: str
    season: str
    phase: str
    before_date: str
    summary: DistributionSummary
    samples: list[DistributionSamplePoint]
    disclosures: list[str] = Field(default_factory=list)


# --- Schemas for Contextual Splits ---


class SplitBucketSummary(BaseModel):
    bucket_key: str
    bucket_label: str
    games_played: int
    total_minutes: float
    min_per_game: float | None = None
    appearance_gap_days_avg: float | None = None
    metrics: dict[str, float | None] = Field(default_factory=dict)
    sample_counts: dict[str, int] = Field(default_factory=dict)


class SplitProfileRequest(BaseModel):
    model_config = ConfigDict(frozen=True)

    player_id: str
    split_type: SplitType = SplitType.ALL
    season: str | None = None
    phase: str = "regular_season"
    before_date: date | None = None
    release_id: str | None = None


class SplitProfileResponse(BaseModel):
    operation_version: str = "v1"
    evidence_hash: str
    player_id: str
    player_name: str
    season: str
    phase: str
    before_date: str
    venue_splits: list[SplitBucketSummary] = Field(default_factory=list)
    rest_splits: list[SplitBucketSummary] = Field(default_factory=list)
    opponent_splits: list[SplitBucketSummary] = Field(default_factory=list)
    disclosures: list[str] = Field(default_factory=list)


# --- Schemas for Opponent Context ---


class TeamDefensiveAllowance(BaseModel):
    opponent_team_id: str
    opponent_tricode: str
    opponent_name: str
    games_observed: int
    pts_allowed_per_game: float
    fg_pct_allowed: float | None = None
    fg3_pct_allowed: float | None = None
    reb_allowed_per_game: float
    ast_allowed_per_game: float
    tov_forced_per_game: float
    league_rank_pts_allowed: int | None = None
    total_teams_in_rank: int | None = None


class OpponentContextRequest(BaseModel):
    model_config = ConfigDict(frozen=True)

    team_id: str | None = None
    season: str | None = None
    phase: str = "regular_season"
    before_date: date | None = None
    release_id: str | None = None


class OpponentContextResponse(BaseModel):
    operation_version: str = "v1"
    evidence_hash: str
    season: str
    phase: str
    before_date: str
    teams_analyzed: int
    allowances: list[TeamDefensiveAllowance]
    disclosures: list[str] = Field(default_factory=list)


# --- Schemas for Statistical Peers (Similarity) ---

INITIAL_SIMILARITY_DIMENSIONS = [
    "pts_per_36",
    "reb_per_36",
    "ast_per_36",
    "tov_per_36",
    "fg3a_per_36",
    "fta_per_36",
    "ts_pct",
    "min_per_game",
]


class DimensionStats(BaseModel):
    dimension_key: str
    display_name: str
    cohort_mean: float
    cohort_sd: float
    is_active: bool
    exclusion_reason: str | None = None


class CohortSummary(BaseModel):
    cohort_size: int
    window_description: str
    min_appearances: int
    min_minutes: float
    active_dimensions_count: int
    dimensions: list[DimensionStats]


class TargetPlayerProfile(BaseModel):
    player_id: str
    player_name: str
    team_tricode: str | None = None
    games_played: int
    total_minutes: float
    raw_values: dict[str, float | None]
    standardized_values: dict[str, float | None]


class PeerMatchItem(BaseModel):
    player_id: str
    player_name: str
    team_tricode: str | None = None
    games_played: int
    total_minutes: float
    distance: float
    overlapping_dimensions_count: int
    raw_values: dict[str, float | None]
    standardized_values: dict[str, float | None]
    dimension_contributions: dict[str, float]


class StatisticalPeersRequest(BaseModel):
    model_config = ConfigDict(frozen=True)

    target_player_id: str
    season: str | None = None
    phase: str = "regular_season"
    before_date: date | None = None
    release_id: str | None = None
    window: Literal["last_10", "season"] = "last_10"
    min_appearances: int = Field(default=10, ge=1, le=82)
    min_minutes: float = Field(default=150.0, ge=0.0)
    top_k: int = Field(default=5, ge=1, le=25)
    dimensions: list[str] | None = None


class StatisticalPeersResponse(BaseModel):
    operation_version: str = "v1"
    evidence_hash: str
    target: TargetPlayerProfile
    cohort: CohortSummary
    peers: list[PeerMatchItem]
    disclosures: list[str] = Field(default_factory=list)


# --- Schemas for Rank Operation ---


class RankOperationItem(BaseModel):
    rank: int
    player_id: str
    player_name: str
    team_tricode: str | None = None
    games_played: int
    total_minutes: float
    baseline_value: float | None = None
    comparison_value: float | None = None
    delta_value: float | None = None
    metric_key: str
    details: dict[str, Any] = Field(default_factory=dict)


class RankOperationRequest(BaseModel):
    model_config = ConfigDict(frozen=True)

    operation_type: Literal["compare_periods", "distribution"]
    metric: str = "pts"
    season: str | None = None
    phase: str = "regular_season"
    before_date: date | None = None
    release_id: str | None = None
    sort_direction: Literal["asc", "desc"] = "desc"
    min_games: int = Field(default=10, ge=1, le=82)
    min_minutes: float = Field(default=150.0, ge=0.0)
    limit: int = Field(default=50, ge=1, le=100)
    measure: DistributionMeasure = DistributionMeasure.IQR


class RankOperationResponse(BaseModel):
    operation_version: str = "v1"
    evidence_hash: str
    operation_type: str
    metric: str
    season: str
    phase: str
    before_date: str
    total_eligible: int
    items: list[RankOperationItem]
    disclosures: list[str] = Field(default_factory=list)
