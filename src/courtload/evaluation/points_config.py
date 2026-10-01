"""Strict loader for the frozen points-v1 forecasting experiment contract."""

from __future__ import annotations

import hashlib
from datetime import date
from itertools import pairwise
from pathlib import Path
from typing import Literal

import yaml
from pydantic import BaseModel, ConfigDict, Field, model_validator

from courtload.evaluation.config import canonical_json


class FrozenModel(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)


class PointsDatasetContract(FrozenModel):
    content_sha256: str = Field(pattern=r"^[0-9a-f]{64}$")
    membership_sha256: str = Field(pattern=r"^[0-9a-f]{64}$")
    source_namespace: str
    seasons: tuple[str, ...]


class PointsTargetContract(FrozenModel):
    name: Literal["basketball_points"]
    version: Literal["basketball-points-v1"]
    formula: Literal["PTS"]
    scoring_sha256: str = Field(pattern=r"^[0-9a-f]{64}$")


class PointsEligibilityContract(FrozenModel):
    core_min_history: int = Field(ge=10)
    early_season_min_history: int = Field(ge=1)
    early_season_max_history: int = Field(le=9)
    early_season_min_prior_history: int = Field(ge=10)
    fallback_min_history: int = Field(ge=1)
    team_association_days: int = Field(ge=1)
    target_horizon_days: int = Field(ge=0, le=6)


class PointsBaselineContract(FrozenModel):
    window: int | None = Field(default=None, ge=1)
    min_appearances: int | None = Field(default=None, ge=1)
    half_life_appearances: float | None = Field(default=None, gt=0)
    blend_threshold: int | None = Field(default=None, ge=1)
    blend_weight: float | None = Field(default=None, gt=0)
    ewma_window: int | None = Field(default=None, ge=1)
    ewma_half_life: float | None = Field(default=None, gt=0)


class PointsSplitContract(FrozenModel):
    season: str | None = None
    seasons: tuple[str, ...] | None = None
    start: date
    end: date
    role: Literal["training", "validation", "calibration", "final_test"]

    @model_validator(mode="after")
    def ordered(self) -> PointsSplitContract:
        if self.end < self.start:
            raise ValueError("split end precedes its start")
        if not self.season and not self.seasons:
            raise ValueError("either season or seasons must be specified")
        return self


class PointsValidationSelection(FrozenModel):
    metric: Literal["mae"]
    folds: tuple[Literal["v1"], Literal["v2"]]
    tie_break_order: tuple[str, ...]


class PointsIntervalContract(FrozenModel):
    nominal_coverage: float = Field(gt=0, lt=1)
    minimum_rows: int = Field(ge=1)
    minimum_target_dates: int = Field(ge=1)


class PointsUncertaintyContract(FrozenModel):
    bootstrap_replicates: int = Field(ge=1)
    moving_block_calendar_days: int = Field(ge=1)
    seed: int


class PointsChallengerContract(FrozenModel):
    random_seed: int
    learning_rate: float = Field(gt=0)
    max_iter: int = Field(ge=1)
    early_stopping: Literal[False]
    max_leaf_nodes: tuple[int, ...]
    l2_regularization: tuple[float, ...]


class PointsPromotionContract(FrozenModel):
    validation_min_relative_mae_improvement: float = Field(ge=0)
    maximum_supported_slice_relative_mae_regression: float = Field(ge=0)
    supported_slice_min_rows: int = Field(ge=1)
    supported_slice_min_player_games: int = Field(ge=1)
    supported_slice_min_target_dates: int = Field(ge=1)
    final_min_interval_coverage: float = Field(gt=0, le=1)
    final_max_interval_width_ratio: float = Field(gt=0)


class PointsRuntimeContract(FrozenModel):
    timezone: Literal["America/New_York"]
    float_tolerance: float = Field(gt=0)
    cpu_threads: Literal[1]


class PointsConfig(FrozenModel):
    version: Literal["points-v1"]
    status: Literal["frozen"]
    frozen_at: date
    dataset: PointsDatasetContract
    target: PointsTargetContract
    eligibility: PointsEligibilityContract
    baselines: dict[str, PointsBaselineContract]
    splits: dict[str, PointsSplitContract]
    validation_selection: PointsValidationSelection
    intervals: PointsIntervalContract
    uncertainty: PointsUncertaintyContract
    challenger: PointsChallengerContract
    promotion: PointsPromotionContract
    runtime: PointsRuntimeContract

    @model_validator(mode="after")
    def validate_protocol(self) -> PointsConfig:
        expected_baselines = {"rolling_mean", "ewma_20_hl5", "prior_blend"}
        if set(self.baselines) != expected_baselines:
            raise ValueError(
                f"the three frozen baseline definitions are required: {expected_baselines}"
            )
        expected_splits = {"t", "v1", "v2", "c", "f"}
        if set(self.splits) != expected_splits:
            raise ValueError(f"the five frozen split definitions are required: {expected_splits}")
        ordered = [self.splits[name] for name in ("t", "v1", "v2", "c", "f")]
        if any(left.end >= right.start for left, right in pairwise(ordered)):
            raise ValueError("split blocks must be strictly chronological")
        return self


def load_points_config(path: Path) -> PointsConfig:
    parsed = yaml.safe_load(path.read_text(encoding="utf-8"))
    if not isinstance(parsed, dict):
        raise ValueError("evaluation config must contain a mapping")
    return PointsConfig.model_validate(parsed)


def points_config_hash(config: PointsConfig) -> str:
    payload = config.model_dump(mode="json")
    return hashlib.sha256(canonical_json(payload).encode()).hexdigest()
