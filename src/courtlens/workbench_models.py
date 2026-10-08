"""Additive immutable workbench lineage, observations, schedules, and serving contracts."""

from __future__ import annotations

from collections.abc import Generator
from contextlib import contextmanager
from datetime import date, datetime
from typing import Any

from sqlalchemy import (
    JSON,
    Boolean,
    Date,
    DateTime,
    Float,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
    event,
    text,
)
from sqlalchemy.orm import Mapped, Session, mapped_column

from courtlens.database import Base
from courtlens.models import new_uuid, utc_now


class WorkbenchAcquisition(Base):
    """Attempted source fetch record."""

    __tablename__ = "workbench_acquisitions"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_uuid)
    source_name: Mapped[str] = mapped_column(String(100), nullable=False)
    resource: Mapped[str] = mapped_column(String(100), nullable=False)
    source_url: Mapped[str] = mapped_column(Text, nullable=False)
    status: Mapped[str] = mapped_column(String(20), nullable=False)
    http_status: Mapped[int | None] = mapped_column(Integer)
    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)
    finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    bytes: Mapped[int | None] = mapped_column(Integer)
    content_sha256: Mapped[str | None] = mapped_column(String(64))
    artifact_id: Mapped[str | None] = mapped_column(ForeignKey("workbench_artifacts.id"))
    error_summary: Mapped[str | None] = mapped_column(Text)
    metadata_json: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)


class WorkbenchArtifact(Base):
    """Immutable verified content artifact stored on disk."""

    __tablename__ = "workbench_artifacts"
    __table_args__ = (UniqueConstraint("sha256", "resource"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_uuid)
    sha256: Mapped[str] = mapped_column(String(64), nullable=False)
    resource: Mapped[str] = mapped_column(String(100), nullable=False)
    bytes: Mapped[int] = mapped_column(Integer, nullable=False)
    storage_path: Mapped[str] = mapped_column(Text, nullable=False)
    mime_type: Mapped[str] = mapped_column(String(100), nullable=False)
    source_attribution: Mapped[str] = mapped_column(Text, nullable=False)
    acquired_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)


class WorkbenchIdentity(Base):
    """Stable entity plus source namespace and external IDs."""

    __tablename__ = "workbench_identities"
    __table_args__ = (UniqueConstraint("namespace", "kind", "external_id"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_uuid)
    namespace: Mapped[str] = mapped_column(String(50), nullable=False)
    kind: Mapped[str] = mapped_column(String(20), nullable=False)
    external_id: Mapped[str] = mapped_column(String(100), nullable=False)
    canonical_id: Mapped[str | None] = mapped_column(ForeignKey("workbench_identities.id"))
    display_name: Mapped[str] = mapped_column(String(200), nullable=False)
    metadata_json: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)


class WorkbenchVersion(Base):
    """Canonical normalized payload hash and parser version."""

    __tablename__ = "workbench_versions"
    __table_args__ = (UniqueConstraint("identity_id", "content_sha256", "parser_version"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_uuid)
    identity_id: Mapped[str] = mapped_column(ForeignKey("workbench_identities.id"), nullable=False)
    content_sha256: Mapped[str] = mapped_column(String(64), nullable=False)
    parser_version: Mapped[str] = mapped_column(String(40), nullable=False)
    payload_json: Mapped[dict[str, Any]] = mapped_column(JSON, nullable=False)


class WorkbenchObservation(Base):
    """Ordered observation of a version within an acquisition."""

    __tablename__ = "workbench_observations"
    __table_args__ = (
        UniqueConstraint("acquisition_id", "artifact_id", "row_identifier"),
        Index("ix_workbench_obs_identity_order", "identity_id", "observation_order"),
        Index("ix_workbench_obs_identity_time", "identity_id", "observed_at"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_uuid)
    acquisition_id: Mapped[str] = mapped_column(
        ForeignKey("workbench_acquisitions.id"), nullable=False
    )
    artifact_id: Mapped[str] = mapped_column(ForeignKey("workbench_artifacts.id"), nullable=False)
    row_identifier: Mapped[str] = mapped_column(String(100), nullable=False)
    identity_id: Mapped[str] = mapped_column(ForeignKey("workbench_identities.id"), nullable=False)
    version_id: Mapped[str] = mapped_column(ForeignKey("workbench_versions.id"), nullable=False)
    observed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)
    observation_order: Mapped[int] = mapped_column(Integer, nullable=False)


class WorkbenchDataset(Base):
    """Immutable dataset defining active members, content hash, and semantic signature."""

    __tablename__ = "workbench_datasets"
    __table_args__ = (UniqueConstraint("content_sha256", "membership_sha256"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_uuid)
    content_sha256: Mapped[str] = mapped_column(String(64), nullable=False)
    membership_sha256: Mapped[str] = mapped_column(String(64), nullable=False)
    semantic_signature: Mapped[str] = mapped_column(String(64), nullable=False)
    source_namespace: Mapped[str] = mapped_column(String(100), nullable=False)
    admission_transaction: Mapped[str | None] = mapped_column(String(32))
    parser_version: Mapped[str] = mapped_column(String(40), nullable=False)
    quality_version: Mapped[str] = mapped_column(String(40), nullable=False)
    seasons_json: Mapped[list[str]] = mapped_column(JSON, nullable=False)
    phases_json: Mapped[list[str]] = mapped_column(JSON, nullable=False)
    manifest_json: Mapped[dict[str, Any]] = mapped_column(JSON, nullable=False)
    coverage_json: Mapped[dict[str, Any]] = mapped_column(JSON, nullable=False)
    exclusions_json: Mapped[dict[str, Any]] = mapped_column(JSON, nullable=False)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="candidate")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)


class WorkbenchDatasetMember(Base):
    """Selected version and observation for an entity within a dataset."""

    __tablename__ = "workbench_dataset_members"
    __table_args__ = (UniqueConstraint("dataset_id", "identity_id"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_uuid)
    dataset_id: Mapped[str] = mapped_column(ForeignKey("workbench_datasets.id"), nullable=False)
    identity_id: Mapped[str] = mapped_column(ForeignKey("workbench_identities.id"), nullable=False)
    version_id: Mapped[str] = mapped_column(ForeignKey("workbench_versions.id"), nullable=False)
    observation_id: Mapped[str] = mapped_column(
        ForeignKey("workbench_observations.id"), nullable=False
    )


class WorkbenchSchedule(Base):
    """Schedule event versions, stored separately from outcome boxscores."""

    __tablename__ = "workbench_schedules"
    __table_args__ = (
        UniqueConstraint("dataset_id", "game_id"),
        Index("ix_workbench_schedules_dataset_date", "dataset_id", "game_date"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_uuid)
    dataset_id: Mapped[str] = mapped_column(ForeignKey("workbench_datasets.id"), nullable=False)
    game_id: Mapped[str] = mapped_column(String(10), nullable=False)
    season: Mapped[str] = mapped_column(String(10), nullable=False)
    phase: Mapped[str] = mapped_column(String(30), nullable=False)
    game_date: Mapped[date] = mapped_column(Date, nullable=False)
    date_precision: Mapped[str] = mapped_column(String(20), nullable=False, default="date")
    tipoff_utc: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    home_team_id: Mapped[str] = mapped_column(String(100), nullable=False)
    away_team_id: Mapped[str] = mapped_column(String(100), nullable=False)
    game_status: Mapped[int] = mapped_column(Integer, nullable=False)
    annotations_json: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)
    source_version_id: Mapped[str] = mapped_column(
        ForeignKey("workbench_versions.id"), nullable=False
    )
    source_observation_id: Mapped[str] = mapped_column(
        ForeignKey("workbench_observations.id"), nullable=False
    )


class WorkbenchTeamGame(Base):
    """Team-game fact record."""

    __tablename__ = "workbench_team_games"
    __table_args__ = (
        UniqueConstraint("dataset_id", "game_id", "team_id"),
        Index("ix_wb_team_dataset_team_date", "dataset_id", "team_id", "game_date"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_uuid)
    dataset_id: Mapped[str] = mapped_column(ForeignKey("workbench_datasets.id"), nullable=False)
    game_id: Mapped[str] = mapped_column(String(10), nullable=False)
    team_id: Mapped[str] = mapped_column(String(100), nullable=False)
    opponent_id: Mapped[str] = mapped_column(String(100), nullable=False)
    game_date: Mapped[date] = mapped_column(Date, nullable=False)
    date_precision: Mapped[str] = mapped_column(String(20), nullable=False, default="date")
    tipoff_utc: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    season: Mapped[str] = mapped_column(String(10), nullable=False)
    phase: Mapped[str] = mapped_column(String(30), nullable=False)
    side: Mapped[str] = mapped_column(String(10), nullable=False)
    points: Mapped[int] = mapped_column(Integer, nullable=False)
    opponent_points: Mapped[int] = mapped_column(Integer, nullable=False)
    is_final: Mapped[bool] = mapped_column(Boolean, default=True)
    stats_json: Mapped[dict[str, Any]] = mapped_column(JSON, nullable=False)
    source_version_id: Mapped[str] = mapped_column(
        ForeignKey("workbench_versions.id"), nullable=False
    )
    source_observation_id: Mapped[str] = mapped_column(
        ForeignKey("workbench_observations.id"), nullable=False
    )


class WorkbenchPlayerGame(Base):
    """Player-game fact record."""

    __tablename__ = "workbench_player_games"
    __table_args__ = (
        UniqueConstraint("dataset_id", "game_id", "player_id"),
        Index("ix_wb_player_dataset_player_date", "dataset_id", "player_id", "game_date"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_uuid)
    dataset_id: Mapped[str] = mapped_column(ForeignKey("workbench_datasets.id"), nullable=False)
    game_id: Mapped[str] = mapped_column(String(10), nullable=False)
    player_id: Mapped[str] = mapped_column(String(100), nullable=False)
    team_id: Mapped[str] = mapped_column(String(100), nullable=False)
    opponent_id: Mapped[str] = mapped_column(String(100), nullable=False)
    game_date: Mapped[date] = mapped_column(Date, nullable=False)
    date_precision: Mapped[str] = mapped_column(String(20), nullable=False, default="date")
    tipoff_utc: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    season: Mapped[str] = mapped_column(String(10), nullable=False)
    phase: Mapped[str] = mapped_column(String(30), nullable=False)
    appearance: Mapped[str] = mapped_column(String(30), nullable=False)
    minutes_original: Mapped[str] = mapped_column(String(20), nullable=False)
    minutes_seconds: Mapped[int | None] = mapped_column(Integer)
    points: Mapped[int | None] = mapped_column(Integer)
    stats_json: Mapped[dict[str, Any]] = mapped_column(JSON, nullable=False)
    source_version_id: Mapped[str] = mapped_column(
        ForeignKey("workbench_versions.id"), nullable=False
    )
    source_observation_id: Mapped[str] = mapped_column(
        ForeignKey("workbench_observations.id"), nullable=False
    )


class WorkbenchReleaseBinding(Base):
    """Release binding linking snapshot to dataset and semantic serving signature."""

    __tablename__ = "workbench_release_bindings"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_uuid)
    snapshot_id: Mapped[str] = mapped_column(String(36), nullable=False, unique=True)
    semantic_signature: Mapped[str] = mapped_column(String(64), nullable=False)
    dataset_id: Mapped[str] = mapped_column(ForeignKey("workbench_datasets.id"), nullable=False)
    capability_bindings_json: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)


class WorkbenchSnapshotEquivalence(Base):
    """Verified equivalence between a local snapshot and an authoritative experiment snapshot."""

    __tablename__ = "workbench_snapshot_equivalences"
    __table_args__ = (UniqueConstraint("local_snapshot_id", "authoritative_snapshot_id"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_uuid)
    local_snapshot_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)
    authoritative_snapshot_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)
    semantic_signature: Mapped[str] = mapped_column(String(64), nullable=False)
    dataset_content_sha256: Mapped[str] = mapped_column(String(64), nullable=False)
    dataset_observation_sha256: Mapped[str] = mapped_column(String(64), nullable=False)
    scoring_version: Mapped[str] = mapped_column(String(64), nullable=False)
    verified_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="verified")
    verification_report_json: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)


class SavedInvestigation(Base):
    """Saved bounded analysis manifest and reproducible result."""

    __tablename__ = "saved_investigations"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_uuid)
    manifest_sha256: Mapped[str] = mapped_column(String(64), nullable=False, unique=True)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    query_json: Mapped[dict[str, Any]] = mapped_column(JSON, nullable=False)
    context_json: Mapped[dict[str, Any]] = mapped_column(JSON, nullable=False)
    metric_version: Mapped[str] = mapped_column(String(40), nullable=False)
    result_sha256: Mapped[str] = mapped_column(String(64), nullable=False)
    result_artifact_path: Mapped[str] = mapped_column(Text, nullable=False)
    warnings_json: Mapped[list[str]] = mapped_column(JSON, default=list)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)


class PlayerPortrait(Base):
    """Player portrait image asset metadata and storage locator."""

    __tablename__ = "player_portraits"
    __table_args__ = (UniqueConstraint("player_id", "source_name"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_uuid)
    player_id: Mapped[str] = mapped_column(String(100), nullable=False)
    source_name: Mapped[str] = mapped_column(String(50), nullable=False)
    content_sha256: Mapped[str] = mapped_column(String(64), nullable=False)
    storage_path: Mapped[str] = mapped_column(Text, nullable=False)
    mime_type: Mapped[str] = mapped_column(String(50), nullable=False)
    width: Mapped[int | None] = mapped_column(Integer)
    height: Mapped[int | None] = mapped_column(Integer)
    bytes: Mapped[int] = mapped_column(Integer, nullable=False)
    attribution: Mapped[str] = mapped_column(Text, nullable=False)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="active")
    acquired_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)


class WorkbenchJob(Base):
    """Local worker job state with heartbeat and timing tracking."""

    __tablename__ = "workbench_jobs"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_uuid)
    job_type: Mapped[str] = mapped_column(String(40), nullable=False)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="queued")
    arguments_json: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)
    owner: Mapped[str | None] = mapped_column(String(100))
    heartbeat_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    stage: Mapped[str | None] = mapped_column(String(50))
    timings_json: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)
    input_refs_json: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)
    output_refs_json: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)
    error_summary: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)


class ModelPolicyActivation(Base):
    """Activated forecasting policy configuration."""

    __tablename__ = "model_policy_activations"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_uuid)
    policy_name: Mapped[str] = mapped_column(String(100), nullable=False)
    target_metric: Mapped[str] = mapped_column(String(40), nullable=False)
    estimator_identity: Mapped[str] = mapped_column(String(100), nullable=False)
    calibration_identity: Mapped[str] = mapped_column(String(100), nullable=False)
    eligibility_criteria_json: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)
    activated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)
    experiment_run_id: Mapped[str | None] = mapped_column(String(64))
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)


class ForecastIssuance(Base):
    """Immutable prospective forecast issuance record."""

    __tablename__ = "forecast_issuances"
    __table_args__ = (UniqueConstraint("policy_id", "player_id", "target_game_id"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_uuid)
    policy_id: Mapped[str] = mapped_column(
        ForeignKey("model_policy_activations.id"), nullable=False
    )
    player_id: Mapped[str] = mapped_column(String(100), nullable=False)
    target_game_id: Mapped[str] = mapped_column(String(10), nullable=False)
    target_game_date: Mapped[date] = mapped_column(Date, nullable=False)
    target_opponent_id: Mapped[str] = mapped_column(String(100), nullable=False)
    issued_at_utc: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)
    dataset_id: Mapped[str] = mapped_column(ForeignKey("workbench_datasets.id"), nullable=False)
    features_hash: Mapped[str] = mapped_column(String(64), nullable=False)
    features_json: Mapped[dict[str, Any]] = mapped_column(JSON, nullable=False)
    schedule_evidence_json: Mapped[dict[str, Any]] = mapped_column(JSON, nullable=False)
    team_evidence_json: Mapped[dict[str, Any]] = mapped_column(JSON, nullable=False)
    point_estimate: Mapped[float] = mapped_column(Float, nullable=False)
    interval_lower: Mapped[float] = mapped_column(Float, nullable=False)
    interval_upper: Mapped[float] = mapped_column(Float, nullable=False)
    availability_reason: Mapped[str | None] = mapped_column(String(100))
    issuance_status: Mapped[str] = mapped_column(String(30), nullable=False, default="issued")


class ForecastScore(Base):
    """Append-only score observation appended when target outcome arrives."""

    __tablename__ = "forecast_scores"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_uuid)
    issuance_id: Mapped[str] = mapped_column(ForeignKey("forecast_issuances.id"), nullable=False)
    observed_points: Mapped[int | None] = mapped_column(Integer)
    scored_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)
    scoring_policy_id: Mapped[str] = mapped_column(String(100), nullable=False)
    outcome_observation_id: Mapped[str | None] = mapped_column(
        ForeignKey("workbench_observations.id")
    )
    absolute_error: Mapped[float | None] = mapped_column(Float)
    interval_hit: Mapped[bool | None] = mapped_column(Boolean)
    score_status: Mapped[str] = mapped_column(String(30), nullable=False)
    reason: Mapped[str | None] = mapped_column(String(100))


class WorkbenchPersonalWorkspace(Base):
    """Personal workspace persistence for views, favorites, tray, boards, and preferences."""

    __tablename__ = "workbench_personal_workspaces"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default="default")
    name: Mapped[str] = mapped_column(String(100), nullable=False, default="Default Workspace")
    version: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    views_json: Mapped[list[dict[str, Any]]] = mapped_column(JSON, nullable=False, default=list)
    favorites_json: Mapped[list[str]] = mapped_column(JSON, nullable=False, default=list)
    compare_tray_json: Mapped[list[str]] = mapped_column(JSON, nullable=False, default=list)
    ranking_boards_json: Mapped[list[dict[str, Any]]] = mapped_column(
        JSON, nullable=False, default=list
    )
    tier_lists_json: Mapped[list[dict[str, Any]]] = mapped_column(
        JSON, nullable=False, default=list
    )
    preferences_json: Mapped[dict[str, Any]] = mapped_column(JSON, nullable=False, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utc_now, onupdate=utc_now
    )


class WorkbenchIdentityCrosswalk(Base):
    """Crosswalk mapping between external provider namespaces and canonical NBA identities."""

    __tablename__ = "workbench_identity_crosswalks"
    __table_args__ = (
        UniqueConstraint(
            "source_namespace",
            "source_id",
            "target_namespace",
            "target_id",
            "kind",
            name="uq_wb_crosswalk_src_tgt",
        ),
        Index("ix_wb_crosswalk_source", "source_namespace", "source_id"),
        Index("ix_wb_crosswalk_target", "target_namespace", "target_id"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_uuid)
    source_namespace: Mapped[str] = mapped_column(String(50), nullable=False)
    source_id: Mapped[str] = mapped_column(String(100), nullable=False)
    target_namespace: Mapped[str] = mapped_column(String(50), nullable=False, default="nba")
    target_id: Mapped[str] = mapped_column(String(100), nullable=False)
    kind: Mapped[str] = mapped_column(String(20), nullable=False, default="player")
    confidence: Mapped[str] = mapped_column(String(20), nullable=False, default="verified")
    mapping_method: Mapped[str] = mapped_column(String(50), nullable=False, default="exact_match")
    evidence_json: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)


class WorkbenchDatedMetadata(Base):
    """Dated metadata and biographical observations carrying explicit evidence dates."""

    __tablename__ = "workbench_dated_metadata"
    __table_args__ = (
        Index("ix_wb_dated_meta_ident_cat_date", "identity_id", "category", "effective_date"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_uuid)
    identity_id: Mapped[str] = mapped_column(String(100), nullable=False, index=True)
    namespace: Mapped[str] = mapped_column(String(50), nullable=False, default="nba")
    kind: Mapped[str] = mapped_column(String(20), nullable=False, default="player")
    category: Mapped[str] = mapped_column(String(50), nullable=False)
    effective_season: Mapped[str | None] = mapped_column(String(10))
    effective_date: Mapped[date | None] = mapped_column(Date)
    observed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)
    source_name: Mapped[str] = mapped_column(String(50), nullable=False)
    data_json: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)


class WorkbenchPlayerMeasurement(Base):
    """Player physical measurements distinguishing combine from listed roster measurements."""

    __tablename__ = "workbench_player_measurements"
    __table_args__ = (
        UniqueConstraint(
            "player_id",
            "source_name",
            "measurement_type",
            "draft_year",
            "season",
            name="uq_wb_measurements_player_source_type",
        ),
        Index("ix_wb_measurements_wingspan", "wingspan_inches"),
        Index("ix_wb_measurements_draft_year", "draft_year"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_uuid)
    player_id: Mapped[str] = mapped_column(String(100), nullable=False, index=True)
    source_name: Mapped[str] = mapped_column(String(50), nullable=False)
    measurement_type: Mapped[str] = mapped_column(String(20), nullable=False)
    season: Mapped[str | None] = mapped_column(String(10))
    draft_year: Mapped[int | None] = mapped_column(Integer)
    height_no_shoes_inches: Mapped[float | None] = mapped_column(Float)
    height_shoes_inches: Mapped[float | None] = mapped_column(Float)
    wingspan_inches: Mapped[float | None] = mapped_column(Float)
    standing_reach_inches: Mapped[float | None] = mapped_column(Float)
    weight_lbs: Mapped[float | None] = mapped_column(Float)
    body_fat_pct: Mapped[float | None] = mapped_column(Float)
    hand_length_inches: Mapped[float | None] = mapped_column(Float)
    hand_width_inches: Mapped[float | None] = mapped_column(Float)
    standing_vertical_inches: Mapped[float | None] = mapped_column(Float)
    max_vertical_inches: Mapped[float | None] = mapped_column(Float)
    lane_agility_seconds: Mapped[float | None] = mapped_column(Float)
    three_quarter_sprint_seconds: Mapped[float | None] = mapped_column(Float)
    wingspan_to_height_ratio: Mapped[float | None] = mapped_column(Float)
    notes: Mapped[str | None] = mapped_column(Text)
    data_source_evidence_json: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)


class WorkbenchPlayerDraft(Base):
    """Player draft metadata and entry taxonomy."""

    __tablename__ = "workbench_player_drafts"
    __table_args__ = (
        UniqueConstraint("player_id", "draft_year", name="uq_wb_draft_player_year"),
        Index("ix_wb_draft_year_pick", "draft_year", "pick_overall"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_uuid)
    player_id: Mapped[str] = mapped_column(String(100), nullable=False, index=True)
    draft_year: Mapped[int] = mapped_column(Integer, nullable=False)
    round_number: Mapped[int | None] = mapped_column(Integer)
    pick_overall: Mapped[int | None] = mapped_column(Integer)
    drafting_team_id: Mapped[str | None] = mapped_column(String(100))
    drafting_team_name: Mapped[str | None] = mapped_column(String(100))
    draft_type: Mapped[str] = mapped_column(String(30), nullable=False, default="draft")
    college_or_prior_team: Mapped[str | None] = mapped_column(String(150))
    data_source_evidence_json: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)


class WorkbenchPbpEvent(Base):
    """Canonical play-by-play event record from admitted PBP feeds."""

    __tablename__ = "workbench_pbp_events"
    __table_args__ = (
        UniqueConstraint("dataset_id", "game_id", "order_index", name="uq_wb_pbp_order"),
        Index("ix_wb_pbp_dataset_game", "dataset_id", "game_id"),
        Index("ix_wb_pbp_person", "person_id"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_uuid)
    dataset_id: Mapped[str] = mapped_column(ForeignKey("workbench_datasets.id"), nullable=False)
    game_id: Mapped[str] = mapped_column(String(10), nullable=False)
    order_index: Mapped[int] = mapped_column(Integer, nullable=False)
    action_number: Mapped[int] = mapped_column(Integer, nullable=False)
    period: Mapped[int] = mapped_column(Integer, nullable=False)
    clock: Mapped[str] = mapped_column(String(20), nullable=False)
    seconds_remaining: Mapped[float] = mapped_column(Float, nullable=False)
    event_type: Mapped[str] = mapped_column(String(50), nullable=False)
    action_type: Mapped[str | None] = mapped_column(String(100))
    sub_type: Mapped[str | None] = mapped_column(String(100))
    team_id: Mapped[str | None] = mapped_column(String(100))
    person_id: Mapped[str | None] = mapped_column(String(100))
    score_home: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    score_away: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    points_total: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    shot_value: Mapped[int | None] = mapped_column(Integer)
    shot_distance: Mapped[float | None] = mapped_column(Float)
    x_legacy: Mapped[float | None] = mapped_column(Float)
    y_legacy: Mapped[float | None] = mapped_column(Float)
    possession_number: Mapped[int | None] = mapped_column(Integer)
    off_lineup_json: Mapped[list[str]] = mapped_column(JSON, default=list)
    def_lineup_json: Mapped[list[str]] = mapped_column(JSON, default=list)
    description: Mapped[str | None] = mapped_column(Text)
    video_available: Mapped[bool] = mapped_column(Boolean, default=False)
    source_hash: Mapped[str] = mapped_column(String(64), nullable=False)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="valid")


class WorkbenchPossession(Base):
    """Admitted raw possession record under possession-policy-v1."""

    __tablename__ = "workbench_possessions"
    __table_args__ = (
        UniqueConstraint("dataset_id", "game_id", "possession_number", name="uq_wb_poss_num"),
        Index("ix_wb_poss_dataset_game", "dataset_id", "game_id"),
        Index("ix_wb_poss_offense", "offense_team_id"),
        Index("ix_wb_poss_defense", "defense_team_id"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_uuid)
    dataset_id: Mapped[str] = mapped_column(ForeignKey("workbench_datasets.id"), nullable=False)
    game_id: Mapped[str] = mapped_column(String(10), nullable=False)
    possession_number: Mapped[int] = mapped_column(Integer, nullable=False)
    period: Mapped[int] = mapped_column(Integer, nullable=False)
    number_in_period: Mapped[int] = mapped_column(Integer, nullable=False)
    offense_team_id: Mapped[str] = mapped_column(String(100), nullable=False)
    defense_team_id: Mapped[str] = mapped_column(String(100), nullable=False)
    start_order_index: Mapped[int] = mapped_column(Integer, nullable=False)
    end_order_index: Mapped[int] = mapped_column(Integer, nullable=False)
    start_seconds_remaining: Mapped[float] = mapped_column(Float, nullable=False)
    end_seconds_remaining: Mapped[float] = mapped_column(Float, nullable=False)
    points: Mapped[int] = mapped_column(Integer, nullable=False)
    is_second_chance: Mapped[bool] = mapped_column(Boolean, default=False)
    possession_start_type: Mapped[str] = mapped_column(
        String(50), nullable=False, default="OffDeadball"
    )
    count_as_possession: Mapped[bool] = mapped_column(Boolean, default=True)
    stats_json: Mapped[dict[str, Any]] = mapped_column(JSON, nullable=False)
    off_lineup_json: Mapped[list[str]] = mapped_column(JSON, default=list)
    def_lineup_json: Mapped[list[str]] = mapped_column(JSON, default=list)
    lineup_source: Mapped[str] = mapped_column(String(50), nullable=False, default="quarter_box")
    policy_version: Mapped[str] = mapped_column(
        String(50), nullable=False, default="possession-policy-v1"
    )
    source_hash: Mapped[str] = mapped_column(String(64), nullable=False)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="valid")


class WorkbenchLineup(Base):
    """Admitted raw 5-man lineup stint observation."""

    __tablename__ = "workbench_lineups"
    __table_args__ = (
        UniqueConstraint("dataset_id", "game_id", "action_number", name="uq_wb_lineups_act"),
        Index("ix_wb_lineups_dataset_game", "dataset_id", "game_id"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_uuid)
    dataset_id: Mapped[str] = mapped_column(ForeignKey("workbench_datasets.id"), nullable=False)
    game_id: Mapped[str] = mapped_column(String(10), nullable=False)
    action_number: Mapped[int] = mapped_column(Integer, nullable=False)
    period: Mapped[int] = mapped_column(Integer, nullable=False)
    home_lineup_json: Mapped[list[str]] = mapped_column(JSON, nullable=False)
    away_lineup_json: Mapped[list[str]] = mapped_column(JSON, nullable=False)
    source_hash: Mapped[str] = mapped_column(String(64), nullable=False)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="valid")


class WorkbenchShot(Base):
    """Admitted shot event with coordinates and zone classification."""

    __tablename__ = "workbench_shots"
    __table_args__ = (
        Index("ix_wb_shots_dataset_game", "dataset_id", "game_id"),
        Index("ix_wb_shots_person", "person_id"),
        Index("ix_wb_shots_zone", "zone_basic"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_uuid)
    dataset_id: Mapped[str] = mapped_column(ForeignKey("workbench_datasets.id"), nullable=False)
    game_id: Mapped[str] = mapped_column(String(10), nullable=False)
    period: Mapped[int] = mapped_column(Integer, nullable=False)
    clock: Mapped[str] = mapped_column(String(20), nullable=False)
    seconds_remaining: Mapped[float | None] = mapped_column(Float)
    team_id: Mapped[str] = mapped_column(String(100), nullable=False)
    person_id: Mapped[str] = mapped_column(String(100), nullable=False)
    player_name: Mapped[str | None] = mapped_column(String(200))
    action_type: Mapped[str | None] = mapped_column(String(100))
    sub_type: Mapped[str | None] = mapped_column(String(100))
    shot_result: Mapped[str] = mapped_column(String(20), nullable=False)
    is_made: Mapped[bool] = mapped_column(Boolean, nullable=False)
    shot_value: Mapped[int] = mapped_column(Integer, nullable=False)
    points: Mapped[int] = mapped_column(Integer, nullable=False)
    shot_distance: Mapped[float] = mapped_column(Float, nullable=False)
    x_legacy: Mapped[float | None] = mapped_column(Float)
    y_legacy: Mapped[float | None] = mapped_column(Float)
    coord_x_feet: Mapped[float | None] = mapped_column(Float)
    coord_y_feet: Mapped[float | None] = mapped_column(Float)
    coordinates_present: Mapped[bool] = mapped_column(Boolean, default=True)
    zone_basic: Mapped[str] = mapped_column(String(50), nullable=False)
    zone_range: Mapped[str] = mapped_column(String(50), nullable=False)
    score_home: Mapped[int | None] = mapped_column(Integer)
    score_away: Mapped[int | None] = mapped_column(Integer)
    description: Mapped[str | None] = mapped_column(Text)
    source_hash: Mapped[str] = mapped_column(String(64), nullable=False)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="valid")


class WorkbenchMatchup(Base):
    """Admitted head-to-head defensive matchup assignment observation."""

    __tablename__ = "workbench_matchups"
    __table_args__ = (
        UniqueConstraint(
            "dataset_id",
            "game_id",
            "off_person_id",
            "def_person_id",
            name="uq_wb_matchup_pair",
        ),
        Index("ix_wb_matchups_dataset_game", "dataset_id", "game_id"),
        Index("ix_wb_matchups_off_person", "off_person_id"),
        Index("ix_wb_matchups_def_person", "def_person_id"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_uuid)
    dataset_id: Mapped[str] = mapped_column(ForeignKey("workbench_datasets.id"), nullable=False)
    game_id: Mapped[str] = mapped_column(String(10), nullable=False)
    off_team_id: Mapped[str] = mapped_column(String(100), nullable=False)
    def_team_id: Mapped[str] = mapped_column(String(100), nullable=False)
    side: Mapped[str] = mapped_column(String(10), nullable=False)
    off_person_id: Mapped[str] = mapped_column(String(100), nullable=False)
    off_player_name: Mapped[str | None] = mapped_column(String(200))
    def_person_id: Mapped[str] = mapped_column(String(100), nullable=False)
    def_player_name: Mapped[str | None] = mapped_column(String(200))
    matchup_minutes: Mapped[str] = mapped_column(String(20), nullable=False)
    matchup_seconds: Mapped[float] = mapped_column(Float, nullable=False)
    partial_possessions: Mapped[float] = mapped_column(Float, nullable=False)
    pct_defender_total_time: Mapped[float | None] = mapped_column(Float)
    pct_offensive_total_time: Mapped[float | None] = mapped_column(Float)
    pct_total_time_both_on: Mapped[float | None] = mapped_column(Float)
    switches_on: Mapped[int] = mapped_column(Integer, default=0)
    player_points: Mapped[int] = mapped_column(Integer, default=0)
    team_points: Mapped[int] = mapped_column(Integer, default=0)
    matchup_assists: Mapped[int] = mapped_column(Integer, default=0)
    matchup_potential_assists: Mapped[int] = mapped_column(Integer, default=0)
    matchup_turnovers: Mapped[int] = mapped_column(Integer, default=0)
    matchup_blocks: Mapped[int] = mapped_column(Integer, default=0)
    matchup_fgm: Mapped[int] = mapped_column(Integer, default=0)
    matchup_fga: Mapped[int] = mapped_column(Integer, default=0)
    matchup_fg_pct: Mapped[float | None] = mapped_column(Float)
    matchup_fg3m: Mapped[int] = mapped_column(Integer, default=0)
    matchup_fg3a: Mapped[int] = mapped_column(Integer, default=0)
    matchup_fg3_pct: Mapped[float | None] = mapped_column(Float)
    help_blocks: Mapped[int] = mapped_column(Integer, default=0)
    help_fgm: Mapped[int] = mapped_column(Integer, default=0)
    help_fga: Mapped[int] = mapped_column(Integer, default=0)
    help_fg_pct: Mapped[float | None] = mapped_column(Float)
    matchup_ftm: Mapped[int] = mapped_column(Integer, default=0)
    matchup_fta: Mapped[int] = mapped_column(Integer, default=0)
    shooting_fouls: Mapped[int] = mapped_column(Integer, default=0)
    source_hash: Mapped[str] = mapped_column(String(64), nullable=False)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="valid")


class WorkbenchRichAdmission(Base):
    """Lineage, verification signatures, and quarantine records for rich admissions."""

    __tablename__ = "workbench_rich_admissions"
    __table_args__ = (
        UniqueConstraint(
            "dataset_id",
            "season",
            "source_family",
            name="uq_wb_rich_admission_family",
        ),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_uuid)
    dataset_id: Mapped[str] = mapped_column(ForeignKey("workbench_datasets.id"), nullable=False)
    season: Mapped[str] = mapped_column(String(10), nullable=False)
    source_family: Mapped[str] = mapped_column(String(50), nullable=False)
    source_url: Mapped[str | None] = mapped_column(Text)
    source_bytes: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    source_sha256: Mapped[str] = mapped_column(String(64), nullable=False)
    parser_signature: Mapped[str] = mapped_column(String(64), nullable=False)
    policy_version: Mapped[str] = mapped_column(String(50), nullable=False)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="admitted")
    total_games_expected: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    total_games_observed: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    total_games_admitted: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    total_games_rejected: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    rejected_games_json: Mapped[list[dict[str, Any]]] = mapped_column(JSON, default=list)
    coverage_report_json: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)
    reconciliation_report_json: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)


class WorkbenchReconstructionOverride(Base):
    """Provenance-bearing immutable override record for lineup or possession reconstruction."""

    __tablename__ = "workbench_reconstruction_overrides"
    __table_args__ = (
        Index("ix_wb_overrides_dataset_game", "dataset_id", "game_id"),
        Index("ix_wb_overrides_type", "override_type"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_uuid)
    dataset_id: Mapped[str] = mapped_column(ForeignKey("workbench_datasets.id"), nullable=False)
    game_id: Mapped[str] = mapped_column(String(10), nullable=False)
    override_type: Mapped[str] = mapped_column(String(50), nullable=False)
    period: Mapped[int | None] = mapped_column(Integer)
    action_number: Mapped[int | None] = mapped_column(Integer)
    order_index: Mapped[int | None] = mapped_column(Integer)
    team_id: Mapped[str | None] = mapped_column(String(100))
    player_id: Mapped[str | None] = mapped_column(String(100))
    original_value_json: Mapped[Any | None] = mapped_column(JSON)
    override_value_json: Mapped[Any] = mapped_column(JSON, nullable=False)
    reason: Mapped[str] = mapped_column(Text, nullable=False)
    author: Mapped[str] = mapped_column(String(100), nullable=False)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="active")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)


class WorkbenchLineupStint(Base):
    """Reconstructed uninterrupted 5-on-5 continuous lineup stint."""

    __tablename__ = "workbench_lineup_stints"
    __table_args__ = (
        UniqueConstraint("dataset_id", "game_id", "stint_index", name="uq_wb_stint_index"),
        Index("ix_wb_stints_dataset_game", "dataset_id", "game_id"),
        Index("ix_wb_stints_home_lineup", "home_lineup_key"),
        Index("ix_wb_stints_away_lineup", "away_lineup_key"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_uuid)
    dataset_id: Mapped[str] = mapped_column(ForeignKey("workbench_datasets.id"), nullable=False)
    game_id: Mapped[str] = mapped_column(String(10), nullable=False)
    stint_index: Mapped[int] = mapped_column(Integer, nullable=False)
    period: Mapped[int] = mapped_column(Integer, nullable=False)
    start_clock: Mapped[str] = mapped_column(String(20), nullable=False)
    end_clock: Mapped[str] = mapped_column(String(20), nullable=False)
    start_seconds_remaining: Mapped[float] = mapped_column(Float, nullable=False)
    end_seconds_remaining: Mapped[float] = mapped_column(Float, nullable=False)
    duration_seconds: Mapped[float] = mapped_column(Float, nullable=False)
    home_team_id: Mapped[str] = mapped_column(String(100), nullable=False)
    away_team_id: Mapped[str] = mapped_column(String(100), nullable=False)
    home_lineup_json: Mapped[list[str]] = mapped_column(JSON, nullable=False)
    away_lineup_json: Mapped[list[str]] = mapped_column(JSON, nullable=False)
    home_lineup_key: Mapped[str] = mapped_column(String(150), nullable=False)
    away_lineup_key: Mapped[str] = mapped_column(String(150), nullable=False)
    start_home_score: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    start_away_score: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    end_home_score: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    end_away_score: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    home_points: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    away_points: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    home_possessions: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    away_possessions: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    total_possessions: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    stats_json: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)
    player_stats_json: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)
    policy_version: Mapped[str] = mapped_column(
        String(50), nullable=False, default="possession-policy-v1"
    )
    source_hash: Mapped[str] = mapped_column(String(64), nullable=False)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="valid")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)


class WorkbenchStintPlayer(Base):
    """Individual player participation and performance during a continuous stint."""

    __tablename__ = "workbench_stint_players"
    __table_args__ = (
        UniqueConstraint("dataset_id", "stint_id", "player_id", name="uq_wb_stint_player"),
        Index("ix_wb_stint_players_dataset_player", "dataset_id", "player_id"),
        Index("ix_wb_stint_players_dataset_game", "dataset_id", "game_id"),
        Index("ix_wb_stint_players_dataset_team", "dataset_id", "team_id"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_uuid)
    dataset_id: Mapped[str] = mapped_column(ForeignKey("workbench_datasets.id"), nullable=False)
    stint_id: Mapped[str] = mapped_column(ForeignKey("workbench_lineup_stints.id"), nullable=False)
    game_id: Mapped[str] = mapped_column(String(10), nullable=False)
    team_id: Mapped[str] = mapped_column(String(100), nullable=False)
    opponent_team_id: Mapped[str] = mapped_column(String(100), nullable=False)
    player_id: Mapped[str] = mapped_column(String(100), nullable=False)
    side: Mapped[str] = mapped_column(String(10), nullable=False)
    period: Mapped[int] = mapped_column(Integer, nullable=False)
    duration_seconds: Mapped[float] = mapped_column(Float, nullable=False)
    possessions: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    opponent_possessions: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    points: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    team_points: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    points_allowed: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    stats_json: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)
    source_hash: Mapped[str] = mapped_column(String(64), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)


@contextmanager
def allow_admin_mutation(session: Session) -> Generator[None, None, None]:
    """Explicitly permit mutation on sealed tables within an admin context."""
    session.info["allow_admin_mutation"] = True
    try:
        conn = session.connection()
        conn.info["allow_admin_mutation"] = True
        if conn.dialect.name == "postgresql":
            session.execute(text("SET LOCAL courtlens.allow_admin_mutation = 'true'"))
    except Exception:
        pass
    try:
        yield
    finally:
        session.info["allow_admin_mutation"] = False
        try:
            conn = session.connection()
            conn.info["allow_admin_mutation"] = False
            if conn.dialect.name == "postgresql":
                session.execute(text("SET LOCAL courtlens.allow_admin_mutation = 'false'"))
        except Exception:
            pass


def _prevent_sealed_mutation(mapper: Any, connection: Any, target: Any) -> None:
    if connection.info.get("allow_admin_mutation", False):
        return
    sess = Session.object_session(target)
    if sess is not None and sess.info.get("allow_admin_mutation", False):
        return
    table_name = getattr(target, "__tablename__", "unknown")
    raise RuntimeError(f"Table '{table_name}' is sealed and immutable against ordinary mutation")


for _sealed_model in (
    WorkbenchDatasetMember,
    WorkbenchSchedule,
    WorkbenchTeamGame,
    WorkbenchPlayerGame,
    ForecastIssuance,
    WorkbenchPbpEvent,
    WorkbenchPossession,
    WorkbenchLineup,
    WorkbenchShot,
    WorkbenchMatchup,
    WorkbenchRichAdmission,
    WorkbenchReconstructionOverride,
    WorkbenchLineupStint,
    WorkbenchStintPlayer,
):
    event.listen(_sealed_model, "before_update", _prevent_sealed_mutation)
    event.listen(_sealed_model, "before_delete", _prevent_sealed_mutation)
