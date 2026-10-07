"""Strict loader for the frozen baseline experiment contract."""

from __future__ import annotations

import hashlib
import json
from datetime import date
from itertools import pairwise
from pathlib import Path
from typing import Any, Literal

import yaml
from pydantic import BaseModel, ConfigDict, Field, model_validator


class FrozenModel(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)


class DatasetContract(FrozenModel):
    content_sha256: str = Field(pattern=r"^[0-9a-f]{64}$")
    observation_sha256: str = Field(pattern=r"^[0-9a-f]{64}$")
    source_namespace: str
    seasons: tuple[str, str, str]


class TargetContract(FrozenModel):
    name: Literal["reference_points"]
    version: Literal["reference-points-v1"]
    formula: Literal["PTS+1.2*REB+1.5*AST+3*STL+3*BLK-TOV"]
    scoring_sha256: str = Field(pattern=r"^[0-9a-f]{64}$")


class EligibilityContract(FrozenModel):
    core_min_history: int = Field(ge=10)
    fallback_min_history: int = Field(ge=1)
    team_association_days: int = Field(ge=1)
    target_horizon_days: int = Field(ge=0, le=6)


class BaselineContract(FrozenModel):
    window: int = Field(ge=1)
    half_life_appearances: float | None = Field(default=None, gt=0)


class SplitContract(FrozenModel):
    season: str
    start: date
    end: date
    role: Literal["training", "validation", "calibration", "final_test"]

    @model_validator(mode="after")
    def ordered(self) -> SplitContract:
        if self.end < self.start:
            raise ValueError("split end precedes its start")
        return self


class ValidationSelection(FrozenModel):
    metric: Literal["mae"]
    folds: tuple[Literal["v1"], Literal["v2"]]
    tie_break_order: tuple[Literal["last_10"], Literal["ewma_20_hl5"]]


class IntervalContract(FrozenModel):
    nominal_coverage: float = Field(gt=0, lt=1)
    minimum_rows: int = Field(ge=1)
    minimum_target_dates: int = Field(ge=1)


class UncertaintyContract(FrozenModel):
    bootstrap_replicates: int = Field(ge=1)
    moving_block_calendar_days: int = Field(ge=1)
    seed: int


class ChallengerContract(FrozenModel):
    random_seed: int
    learning_rate: float = Field(gt=0)
    max_iter: int = Field(ge=1)
    early_stopping: Literal[False]
    max_leaf_nodes: tuple[int, ...]
    l2_regularization: tuple[float, ...]


class PromotionContract(FrozenModel):
    validation_min_relative_mae_improvement: float = Field(ge=0)
    maximum_supported_slice_relative_mae_regression: float = Field(ge=0)
    supported_slice_min_rows: int = Field(ge=1)
    supported_slice_min_player_games: int = Field(ge=1)
    supported_slice_min_target_dates: int = Field(ge=1)
    final_min_interval_coverage: float = Field(gt=0, le=1)
    final_max_interval_width_ratio: float = Field(gt=0)


class RuntimeContract(FrozenModel):
    timezone: Literal["America/New_York"]
    float_tolerance: float = Field(gt=0)
    cpu_threads: Literal[1]


class EvaluationConfig(FrozenModel):
    version: Literal["baseline-v1"]
    status: Literal["frozen"]
    frozen_at: date
    dataset: DatasetContract
    snapshot_id: str
    target: TargetContract
    eligibility: EligibilityContract
    baselines: dict[str, BaselineContract]
    splits: dict[str, SplitContract]
    validation_selection: ValidationSelection
    intervals: IntervalContract
    uncertainty: UncertaintyContract
    challenger: ChallengerContract
    promotion: PromotionContract
    runtime: RuntimeContract

    @model_validator(mode="after")
    def validate_protocol(self) -> EvaluationConfig:
        if set(self.baselines) != {"last_10", "ewma_20_hl5"}:
            raise ValueError("the two frozen baseline definitions are required")
        if set(self.splits) != {"s1", "v1", "v2", "calibration", "s3"}:
            raise ValueError("the five frozen split definitions are required")
        ordered = [self.splits[name] for name in ("s1", "v1", "v2", "calibration", "s3")]
        if any(left.end >= right.start for left, right in pairwise(ordered)):
            raise ValueError("split blocks must be strictly chronological")
        if (
            tuple(split.season for split in (ordered[0], ordered[1], ordered[4]))
            != self.dataset.seasons
        ):
            raise ValueError("S1, V1 and S3 must bind the three frozen seasons")
        if not (ordered[1].season == ordered[2].season == ordered[3].season):
            raise ValueError("V1, V2 and calibration must share S2")
        return self


def load_config(path: Path) -> EvaluationConfig:
    parsed = yaml.safe_load(path.read_text(encoding="utf-8"))
    if not isinstance(parsed, dict):
        raise ValueError("evaluation config must contain a mapping")
    return EvaluationConfig.model_validate(parsed)


def canonical_json(value: Any) -> str:
    return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=True, default=str)


def config_hash(config: EvaluationConfig) -> str:
    payload = config.model_dump(mode="json")
    return hashlib.sha256(canonical_json(payload).encode()).hexdigest()
