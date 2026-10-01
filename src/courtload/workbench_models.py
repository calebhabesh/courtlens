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

from courtload.database import Base
from courtload.models import new_uuid, utc_now


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


@contextmanager
def allow_admin_mutation(session: Session) -> Generator[None, None, None]:
    """Explicitly permit mutation on sealed tables within an admin context."""
    session.info["allow_admin_mutation"] = True
    try:
        conn = session.connection()
        conn.info["allow_admin_mutation"] = True
        if conn.dialect.name == "postgresql":
            session.execute(text("SET LOCAL courtload.allow_admin_mutation = 'true'"))
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
                session.execute(text("SET LOCAL courtload.allow_admin_mutation = 'false'"))
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
):
    event.listen(_sealed_model, "before_update", _prevent_sealed_mutation)
    event.listen(_sealed_model, "before_delete", _prevent_sealed_mutation)
