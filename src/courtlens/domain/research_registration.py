"""Offline B25 contracts; registration is never permission to fit or serve a model."""

from __future__ import annotations

import hashlib
import json
from datetime import date, datetime
from typing import Annotated, Literal, Self

from pydantic import AwareDatetime, BaseModel, ConfigDict, Field, model_validator

SHA256 = Annotated[str, Field(pattern=r"^[0-9a-f]{64}$")]
Text = Annotated[str, Field(min_length=1)]
Experiment = Literal[
    "courtload-rapm-v1",
    "courtload-six-factor-v1",
    "courtload-expected-shot-v1",
    "courtload-adjusted-shooting-v1",
    "courtload-expected-shot-retrospective-v2",
]


class FrozenContract(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True, allow_inf_nan=False)

    def content_hash(self) -> str:
        payload = json.dumps(self.model_dump(mode="json"), sort_keys=True, separators=(",", ":"))
        return hashlib.sha256(payload.encode()).hexdigest()


class ComputeBudget(FrozenContract):
    cpu_threads: int = Field(ge=1, le=2)
    max_peak_rss_mib: int = Field(gt=0, le=4096)
    max_wall_seconds: int = Field(gt=0, le=1800)
    max_rows: int = Field(gt=0, le=1_000_000)
    max_features: int = Field(gt=0, le=5000)
    max_candidate_fits: int = Field(ge=1, le=9)
    sparse_lineup_matrix: Literal[True]
    breach_policy: Literal["stop_record_failure_amend_before_evaluation"]


class ResearchProtocol(FrozenContract):
    schema_version: Literal["courtload-research-preregistration-v1"]
    experiment: Experiment
    registered_on: date
    phase: Literal["regular_season"]
    estimand: Text
    units: Text
    input_grains: tuple[Text, ...] = Field(min_length=1)
    input_gates: tuple[Text, ...] = Field(min_length=1)
    target_recipe: Text
    feature_recipe: Text
    baseline_recipes: tuple[Text, ...] = Field(min_length=1)
    candidate_recipes: tuple[Text, ...] = Field(min_length=1)
    split_policy: Literal[
        "latest_unexposed_complete_season_final_previous_validation_earlier_fit",
        "latest_complete_season_retrospective_previous_validation_earlier_fit",
    ]
    minimum_complete_seasons: int = Field(ge=3)
    membership_binding: Literal["required_before_any_candidate_comparison"]
    calibration_recipe: Text
    preprocessing_recipe: Text
    exclusions: tuple[Text, ...] = Field(min_length=1)
    sample_policy: Text
    selection_metric: Text
    tie_break: Text
    uncertainty_recipe: Text
    error_slices: tuple[Text, ...] = Field(min_length=1)
    acceptance: tuple[Text, ...] = Field(min_length=1)
    serving_policy: Text
    artifacts: tuple[Text, ...] = Field(min_length=1)
    limitations: tuple[Text, ...] = Field(min_length=1)
    seed: int
    budget: ComputeBudget

    @model_validator(mode="after")
    def candidate_budget(self) -> Self:
        retrospective = self.experiment == "courtload-expected-shot-retrospective-v2"
        if retrospective != (
            self.split_policy
            == "latest_complete_season_retrospective_previous_validation_earlier_fit"
        ):
            raise ValueError(
                "chronology amendment requires a separately identified retrospective protocol"
            )
        if len(self.candidate_recipes) > self.budget.max_candidate_fits:
            raise ValueError("candidate recipes exceed preregistered fit budget")
        if len(set(self.candidate_recipes)) != len(self.candidate_recipes):
            raise ValueError("duplicate candidates")
        return self


class ExternalIdentity(FrozenContract):
    provider_player_id: Text
    nba_player_id: str = Field(pattern=r"^[0-9]+$")
    method: Literal["provider_nba_id", "verified_crosswalk"]
    evidence_sha256: SHA256
    observed_at: AwareDatetime


class ExternalValue(FrozenContract):
    provider_player_id: Text
    metric: Text
    value: float | None
    unit: Text
    missing_reason: Text | None = None

    @model_validator(mode="after")
    def missingness(self) -> Self:
        if (self.value is None) != (self.missing_reason is not None):
            raise ValueError("null requires a missing reason; observed values cannot have one")
        return self


class ExternalOutput(FrozenContract):
    schema_version: Literal["courtload-external-output-v1"]
    classification: Literal["external_forecast"]
    provider: Text
    model: Text
    model_version: Text | None
    model_version_evidence_sha256: SHA256 | None
    output_version: Text
    source_url: Text
    source_sha256: SHA256
    access_evidence_sha256: SHA256 | None
    reuse_evidence_sha256: SHA256 | None
    attribution: Text
    effective_date: date
    input_through_date: date | None
    published_at: AwareDatetime | None
    observed_at: AwareDatetime
    identities: tuple[ExternalIdentity, ...] = Field(max_length=2000)
    values: tuple[ExternalValue, ...] = Field(max_length=20000)

    @model_validator(mode="after")
    def coherent(self) -> Self:
        ids = [row.provider_player_id for row in self.identities]
        if len(ids) != len(set(ids)):
            raise ValueError("ambiguous provider identity")
        nba_ids = [row.nba_player_id for row in self.identities]
        if len(nba_ids) != len(set(nba_ids)):
            raise ValueError("multiple provider identities for one NBA player")
        keys = [(row.provider_player_id, row.metric) for row in self.values]
        if len(keys) != len(set(keys)):
            raise ValueError("duplicate player/metric output")
        if any(row.observed_at > self.observed_at for row in self.identities):
            raise ValueError("identity evidence postdates output observation")
        if self.published_at is not None and self.published_at > self.observed_at:
            raise ValueError("publication postdates observation")
        if self.input_through_date is not None and self.input_through_date > self.effective_date:
            raise ValueError("input horizon exceeds effective date")
        return self

    def gate_reasons(self, *, known_before: datetime, before_date: date) -> tuple[str, ...]:
        """Exclusive knowledge/game boundaries. Publisher dates cannot replace observation time."""
        if known_before.tzinfo is None or known_before.utcoffset() is None:
            raise ValueError("known_before must be timezone aware")
        reasons: list[str] = []
        for name in (
            "model_version",
            "model_version_evidence_sha256",
            "access_evidence_sha256",
            "reuse_evidence_sha256",
            "input_through_date",
        ):
            if getattr(self, name) is None:
                reasons.append(f"missing_{name}")
        if not self.values:
            reasons.append("empty_output")
        if self.observed_at >= known_before:
            reasons.append("not_observed_before_knowledge_boundary")
        if self.effective_date >= before_date:
            reasons.append("effective_date_outside_research_cutoff")
        if self.input_through_date is not None and self.input_through_date >= before_date:
            reasons.append("input_horizon_outside_research_cutoff")
        mapped = {row.provider_player_id for row in self.identities}
        if any(row.provider_player_id not in mapped for row in self.values):
            reasons.append("unmapped_player_identity")
        return tuple(reasons)


class SplitGame(FrozenContract):
    """A complete game's eligible rows are indivisible across chronological roles."""

    game_id: str = Field(pattern=r"^[0-9]{10}$")
    season: str = Field(pattern=r"^[0-9]{4}-[0-9]{2}$")
    game_date: date
    role: Literal["training", "validation", "final_test"]
    rows: int = Field(gt=0)
    row_membership_sha256: SHA256


class ResearchBinding(FrozenContract):
    """Offline evidence assertion, not a substitute for independently checked source admission."""

    schema_version: Literal["courtload-research-binding-v1"]
    experiment: Experiment
    protocol_sha256: SHA256
    dataset_content_sha256: SHA256
    source_membership_sha256: SHA256
    transform_sha256: SHA256
    coverage_report_sha256: SHA256
    final_exposure_audit_sha256: SHA256
    final_previously_exposed: Literal[False]
    source_gates_verified: Literal[True]
    complete_seasons: tuple[str, ...] = Field(min_length=3)
    games: tuple[SplitGame, ...] = Field(min_length=3, max_length=20000)

    @model_validator(mode="after")
    def chronological_membership(self) -> Self:
        if self.experiment == "courtload-expected-shot-retrospective-v2":
            raise ValueError("retrospective protocol requires its exposed-final binding schema")
        if len(self.complete_seasons) != len(set(self.complete_seasons)):
            raise ValueError("duplicate complete season")
        ids = [game.game_id for game in self.games]
        if len(ids) != len(set(ids)):
            raise ValueError("game cannot appear twice or cross split roles")
        roles = ("training", "validation", "final_test")
        dates = [[g.game_date for g in self.games if g.role == role] for role in roles]
        if any(not group for group in dates):
            raise ValueError("all chronological roles require game membership")
        if max(dates[0]) >= min(dates[1]) or max(dates[1]) >= min(dates[2]):
            raise ValueError("split dates overlap or are out of order")
        seasons = sorted(self.complete_seasons)
        by_role = {
            "training": set(seasons[:-2]),
            "validation": {seasons[-2]},
            "final_test": {seasons[-1]},
        }
        if any(game.season not in by_role[game.role] for game in self.games):
            raise ValueError("split membership violates frozen complete-season policy")
        if {game.season for game in self.games} != set(seasons):
            raise ValueError("complete season has no bound games")
        for game in self.games:
            start_year = int(game.season[:4])
            if int(game.season[-2:]) != (start_year + 1) % 100:
                raise ValueError("invalid season suffix")
            if not date(start_year, 7, 1) <= game.game_date < date(start_year + 1, 7, 1):
                raise ValueError("game date outside bound NBA season")
        return self

    def validate_protocol(self, protocol: ResearchProtocol) -> None:
        if (
            self.experiment != protocol.experiment
            or self.protocol_sha256 != protocol.content_hash()
        ):
            raise ValueError("binding does not reference this exact protocol")
        if len(self.complete_seasons) < protocol.minimum_complete_seasons:
            raise ValueError("insufficient complete seasons")
        if sum(game.rows for game in self.games) > protocol.budget.max_rows:
            raise ValueError("bound rows exceed frozen compute budget")

    def membership_hash(self) -> str:
        rows = [
            game.model_dump(mode="json") for game in sorted(self.games, key=lambda g: g.game_id)
        ]
        return hashlib.sha256(
            json.dumps(rows, sort_keys=True, separators=(",", ":")).encode()
        ).hexdigest()


class RetrospectiveShotBinding(FrozenContract):
    schema_version: Literal["courtload-retrospective-shot-binding-v2"]
    experiment: Literal["courtload-expected-shot-retrospective-v2"]
    protocol_sha256: SHA256
    dataset_id: Text
    dataset_content_sha256: SHA256
    source_membership_sha256: SHA256
    transform_sha256: SHA256
    coverage_report_sha256: SHA256
    final_exposure_audit_sha256: SHA256
    chronology_amendment_sha256: SHA256
    final_previously_exposed: Literal[True]
    classification: Literal["retrospective_research"]
    complete_seasons: tuple[str, ...] = Field(min_length=3)
    games: tuple[SplitGame, ...] = Field(min_length=3, max_length=20000)
    selection_games: tuple[str, ...] = Field(min_length=30)
    calibration_games: tuple[str, ...] = Field(min_length=30)
    selection_membership_sha256: SHA256
    calibration_membership_sha256: SHA256

    @model_validator(mode="after")
    def exact_chronology(self) -> Self:
        # Reuse the existing chronological checks without claiming an unexposed final.
        ResearchBinding.model_validate(
            {
                "schema_version": "courtload-research-binding-v1",
                "experiment": "courtload-expected-shot-v1",
                "protocol_sha256": self.protocol_sha256,
                "dataset_content_sha256": self.dataset_content_sha256,
                "source_membership_sha256": self.source_membership_sha256,
                "transform_sha256": self.transform_sha256,
                "coverage_report_sha256": self.coverage_report_sha256,
                "final_exposure_audit_sha256": self.final_exposure_audit_sha256,
                "final_previously_exposed": False,
                "source_gates_verified": True,
                "complete_seasons": self.complete_seasons,
                "games": self.games,
            }
        )
        validation = [g for g in self.games if g.role == "validation"]
        dates = sorted({g.game_date for g in validation})
        boundary = dates[len(dates) // 2]
        selection = sorted(g.game_id for g in validation if g.game_date < boundary)
        calibration = sorted(g.game_id for g in validation if g.game_date >= boundary)
        if list(self.selection_games) != selection or list(self.calibration_games) != calibration:
            raise ValueError("validation halves differ from frozen date boundary")
        for ids, expected in (
            (selection, self.selection_membership_sha256),
            (calibration, self.calibration_membership_sha256),
        ):
            members = [
                g.model_dump(mode="json")
                for g in sorted(validation, key=lambda g: g.game_id)
                if g.game_id in set(ids)
            ]
            digest = hashlib.sha256(
                json.dumps(members, sort_keys=True, separators=(",", ":")).encode()
            ).hexdigest()
            if digest != expected:
                raise ValueError("validation sub-membership hash mismatch")
        return self

    def validate_protocol(self, protocol: ResearchProtocol) -> None:
        if (
            self.experiment != protocol.experiment
            or self.protocol_sha256 != protocol.content_hash()
        ):
            raise ValueError("binding does not reference exact retrospective protocol")
        if (
            len(self.complete_seasons) < protocol.minimum_complete_seasons
            or sum(g.rows for g in self.games) > protocol.budget.max_rows
        ):
            raise ValueError("binding exceeds season/row gates")
