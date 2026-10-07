"""Additive immutable archive lineage; no legacy dimension IDs are reused."""

from __future__ import annotations

from datetime import date, datetime
from typing import Any

from sqlalchemy import (
    JSON,
    Date,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column

from courtlens.database import Base
from courtlens.models import new_uuid, utc_now


class ArchiveImport(Base):
    __tablename__ = "archive_imports"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_uuid)
    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)
    finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    status: Mapped[str] = mapped_column(String(20), nullable=False)
    error: Mapped[str | None] = mapped_column(Text)
    dataset_id: Mapped[str | None] = mapped_column(ForeignKey("archive_datasets.id"))
    report_json: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)


class ArchiveArtifact(Base):
    __tablename__ = "archive_artifacts"
    __table_args__ = (UniqueConstraint("sha256", "resource"),)
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_uuid)
    resource: Mapped[str] = mapped_column(String(100), nullable=False)
    sha256: Mapped[str] = mapped_column(String(64), nullable=False)
    bytes: Mapped[int] = mapped_column(Integer, nullable=False)
    storage_uri: Mapped[str] = mapped_column(Text, nullable=False)
    source_url: Mapped[str] = mapped_column(Text, nullable=False)
    source_revision: Mapped[str] = mapped_column(String(64), nullable=False)
    acquired_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)


class ArchiveIdentity(Base):
    __tablename__ = "archive_identities"
    __table_args__ = (UniqueConstraint("namespace", "kind", "external_id"),)
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_uuid)
    namespace: Mapped[str] = mapped_column(String(100), nullable=False)
    kind: Mapped[str] = mapped_column(String(20), nullable=False)
    external_id: Mapped[str] = mapped_column(String(100), nullable=False)


class ArchiveVersion(Base):
    __tablename__ = "archive_versions"
    __table_args__ = (UniqueConstraint("identity_id", "content_sha256", "parser_version"),)
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_uuid)
    identity_id: Mapped[str] = mapped_column(ForeignKey("archive_identities.id"), nullable=False)
    content_sha256: Mapped[str] = mapped_column(String(64), nullable=False)
    parser_version: Mapped[str] = mapped_column(String(30), nullable=False)
    payload_json: Mapped[dict[str, Any]] = mapped_column(JSON, nullable=False)


class ArchiveObservation(Base):
    __tablename__ = "archive_observations"
    __table_args__ = (
        UniqueConstraint("import_id", "artifact_id", "row_number"),
        Index("ix_archive_observations_identity_time", "identity_id", "observed_at"),
    )
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_uuid)
    import_id: Mapped[str] = mapped_column(ForeignKey("archive_imports.id"), nullable=False)
    artifact_id: Mapped[str] = mapped_column(ForeignKey("archive_artifacts.id"), nullable=False)
    row_number: Mapped[int] = mapped_column(Integer, nullable=False)
    identity_id: Mapped[str] = mapped_column(ForeignKey("archive_identities.id"), nullable=False)
    version_id: Mapped[str] = mapped_column(ForeignKey("archive_versions.id"), nullable=False)
    observed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)


class ArchiveDataset(Base):
    __tablename__ = "archive_datasets"
    __table_args__ = (UniqueConstraint("content_sha256", "observation_sha256"),)
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_uuid)
    content_sha256: Mapped[str] = mapped_column(String(64), nullable=False)
    observation_sha256: Mapped[str] = mapped_column(String(64), nullable=False)
    source_namespace: Mapped[str] = mapped_column(String(100), nullable=False)
    parser_version: Mapped[str] = mapped_column(String(30), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)
    manifest_json: Mapped[dict[str, Any]] = mapped_column(JSON, nullable=False)
    status: Mapped[str] = mapped_column(String(20), nullable=False)


class ArchiveMember(Base):
    __tablename__ = "archive_members"
    __table_args__ = (UniqueConstraint("dataset_id", "identity_id"),)
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_uuid)
    dataset_id: Mapped[str] = mapped_column(ForeignKey("archive_datasets.id"), nullable=False)
    identity_id: Mapped[str] = mapped_column(ForeignKey("archive_identities.id"), nullable=False)
    version_id: Mapped[str] = mapped_column(ForeignKey("archive_versions.id"), nullable=False)
    observation_id: Mapped[str] = mapped_column(
        ForeignKey("archive_observations.id"), nullable=False
    )


class ArchiveQuarantine(Base):
    __tablename__ = "archive_quarantine"
    __table_args__ = (UniqueConstraint("dataset_id", "artifact_id", "row_number", "reason"),)
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_uuid)
    dataset_id: Mapped[str] = mapped_column(ForeignKey("archive_datasets.id"), nullable=False)
    artifact_id: Mapped[str] = mapped_column(ForeignKey("archive_artifacts.id"), nullable=False)
    row_number: Mapped[int] = mapped_column(Integer, nullable=False)
    reason: Mapped[str] = mapped_column(String(80), nullable=False)
    game_id: Mapped[str | None] = mapped_column(String(10))


class ArchiveTeamGame(Base):
    __tablename__ = "archive_team_games"
    __table_args__ = (
        UniqueConstraint("dataset_id", "game_id", "team_id"),
        Index("ix_archive_team_dataset_date", "dataset_id", "team_id", "game_date"),
    )
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_uuid)
    dataset_id: Mapped[str] = mapped_column(ForeignKey("archive_datasets.id"), nullable=False)
    game_id: Mapped[str] = mapped_column(String(10), nullable=False)
    team_id: Mapped[str] = mapped_column(String(100), nullable=False)
    opponent_id: Mapped[str] = mapped_column(String(100), nullable=False)
    game_date: Mapped[date] = mapped_column(Date, nullable=False)
    date_precision: Mapped[str] = mapped_column(String(20), nullable=False)
    tipoff_utc: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    season: Mapped[str] = mapped_column(String(10), nullable=False)
    side: Mapped[str] = mapped_column(String(4), nullable=False)
    points: Mapped[int] = mapped_column(Integer, nullable=False)
    stats_json: Mapped[dict[str, int | None]] = mapped_column(JSON, nullable=False)
    source_version_id: Mapped[str] = mapped_column(
        ForeignKey("archive_versions.id"), nullable=False
    )
    source_observation_id: Mapped[str] = mapped_column(
        ForeignKey("archive_observations.id"), nullable=False
    )


class ArchivePlayerGame(Base):
    __tablename__ = "archive_player_games"
    __table_args__ = (
        UniqueConstraint("dataset_id", "game_id", "player_id"),
        Index("ix_archive_player_dataset_date", "dataset_id", "player_id", "game_date"),
    )
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_uuid)
    dataset_id: Mapped[str] = mapped_column(ForeignKey("archive_datasets.id"), nullable=False)
    game_id: Mapped[str] = mapped_column(String(10), nullable=False)
    player_id: Mapped[str] = mapped_column(String(100), nullable=False)
    team_id: Mapped[str] = mapped_column(String(100), nullable=False)
    opponent_id: Mapped[str] = mapped_column(String(100), nullable=False)
    game_date: Mapped[date] = mapped_column(Date, nullable=False)
    date_precision: Mapped[str] = mapped_column(String(20), nullable=False)
    tipoff_utc: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    season: Mapped[str] = mapped_column(String(10), nullable=False)
    appearance: Mapped[str] = mapped_column(String(30), nullable=False)
    minutes_original: Mapped[str] = mapped_column(String(20), nullable=False)
    minutes_seconds: Mapped[int | None] = mapped_column(Integer)
    stats_json: Mapped[dict[str, int | None]] = mapped_column(JSON, nullable=False)
    source_version_id: Mapped[str] = mapped_column(
        ForeignKey("archive_versions.id"), nullable=False
    )
    source_observation_id: Mapped[str] = mapped_column(
        ForeignKey("archive_observations.id"), nullable=False
    )
