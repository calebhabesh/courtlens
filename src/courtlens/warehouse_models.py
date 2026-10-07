"""Dataset-bound warehouse build state and immutable serving relations."""

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
    Numeric,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column

from courtlens.database import Base
from courtlens.models import new_uuid, utc_now


class WarehouseBuild(Base):
    __tablename__ = "warehouse_builds"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_uuid)
    dataset_id: Mapped[str] = mapped_column(ForeignKey("archive_datasets.id"), nullable=False)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="created")
    candidate_schema: Mapped[str] = mapped_column(String(48), nullable=False, unique=True)
    code_version: Mapped[str] = mapped_column(String(64), nullable=False)
    metric_version: Mapped[str] = mapped_column(String(30), nullable=False)
    feature_version: Mapped[str] = mapped_column(String(30), nullable=False)
    scoring_version: Mapped[str] = mapped_column(String(64), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)
    finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    error: Mapped[str | None] = mapped_column(Text)
    validation_report_json: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)


class ServingSnapshot(Base):
    __tablename__ = "serving_snapshots"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_uuid)
    build_id: Mapped[str] = mapped_column(
        ForeignKey("warehouse_builds.id"), nullable=False, unique=True
    )
    dataset_id: Mapped[str] = mapped_column(ForeignKey("archive_datasets.id"), nullable=False)
    status: Mapped[str] = mapped_column(String(20), nullable=False)
    mode: Mapped[str] = mapped_column(String(40), nullable=False)
    source: Mapped[str] = mapped_column(String(100), nullable=False)
    coverage_start: Mapped[date] = mapped_column(Date, nullable=False)
    coverage_end: Mapped[date] = mapped_column(Date, nullable=False)
    default_replay_date: Mapped[date] = mapped_column(Date, nullable=False)
    supported_replay_dates_json: Mapped[list[str]] = mapped_column(JSON, nullable=False)
    code_version: Mapped[str] = mapped_column(String(64), nullable=False)
    metric_version: Mapped[str] = mapped_column(String(30), nullable=False)
    feature_version: Mapped[str] = mapped_column(String(30), nullable=False)
    scoring_version: Mapped[str] = mapped_column(String(64), nullable=False)
    quality_report_json: Mapped[dict[str, Any]] = mapped_column(JSON, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)


class PublishedSnapshot(Base):
    __tablename__ = "published_snapshots"

    channel: Mapped[str] = mapped_column(String(30), primary_key=True)
    snapshot_id: Mapped[str] = mapped_column(ForeignKey("serving_snapshots.id"), nullable=False)
    published_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)


class ServingPlayerGame(Base):
    __tablename__ = "serving_player_games"
    __table_args__ = (
        UniqueConstraint("snapshot_id", "game_id", "player_id"),
        Index(
            "ix_serving_player_games_snapshot_player_date",
            "snapshot_id",
            "player_id",
            "game_date",
        ),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_uuid)
    snapshot_id: Mapped[str] = mapped_column(ForeignKey("serving_snapshots.id"), nullable=False)
    dataset_id: Mapped[str] = mapped_column(ForeignKey("archive_datasets.id"), nullable=False)
    game_id: Mapped[str] = mapped_column(String(10), nullable=False)
    player_id: Mapped[str] = mapped_column(String(100), nullable=False)
    player_name: Mapped[str] = mapped_column(String(200), nullable=False)
    team_id: Mapped[str] = mapped_column(String(100), nullable=False)
    opponent_id: Mapped[str] = mapped_column(String(100), nullable=False)
    game_date: Mapped[date] = mapped_column(Date, nullable=False)
    season: Mapped[str] = mapped_column(String(10), nullable=False)
    appearance: Mapped[str] = mapped_column(String(30), nullable=False)
    minutes_seconds: Mapped[int | None] = mapped_column(Integer)
    stats_json: Mapped[dict[str, int | None]] = mapped_column(JSON, nullable=False)
    reference_points: Mapped[float | None] = mapped_column(Numeric(12, 4))
    source_version_id: Mapped[str] = mapped_column(
        ForeignKey("archive_versions.id"), nullable=False
    )
    source_observation_id: Mapped[str] = mapped_column(
        ForeignKey("archive_observations.id"), nullable=False
    )


class ServingPlayerProfile(Base):
    __tablename__ = "serving_player_profiles"
    __table_args__ = (
        UniqueConstraint("snapshot_id", "player_id", "replay_date"),
        Index(
            "ix_serving_profiles_snapshot_player_date",
            "snapshot_id",
            "player_id",
            "replay_date",
        ),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_uuid)
    snapshot_id: Mapped[str] = mapped_column(ForeignKey("serving_snapshots.id"), nullable=False)
    dataset_id: Mapped[str] = mapped_column(ForeignKey("archive_datasets.id"), nullable=False)
    player_id: Mapped[str] = mapped_column(String(100), nullable=False)
    player_name: Mapped[str] = mapped_column(String(200), nullable=False)
    season: Mapped[str] = mapped_column(String(10), nullable=False)
    replay_date: Mapped[date] = mapped_column(Date, nullable=False)
    cutoff_utc: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    inferred_team_id: Mapped[str] = mapped_column(String(100), nullable=False)
    last_observed_date: Mapped[date] = mapped_column(Date, nullable=False)
    target_game_id: Mapped[str] = mapped_column(String(10), nullable=False)
    target_game_date: Mapped[date] = mapped_column(Date, nullable=False)
    target_opponent_id: Mapped[str] = mapped_column(String(100), nullable=False)
    lead_days: Mapped[int] = mapped_column(Integer, nullable=False)
    last_5_json: Mapped[dict[str, Any]] = mapped_column(JSON, nullable=False)
    last_10_json: Mapped[dict[str, Any]] = mapped_column(JSON, nullable=False)
    season_json: Mapped[dict[str, Any]] = mapped_column(JSON, nullable=False)
    max_history_date: Mapped[date] = mapped_column(Date, nullable=False)


class ServingOpponentContext(Base):
    __tablename__ = "serving_opponent_contexts"
    __table_args__ = (
        UniqueConstraint("snapshot_id", "team_id", "replay_date"),
        Index(
            "ix_serving_opponents_snapshot_team_date",
            "snapshot_id",
            "team_id",
            "replay_date",
        ),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_uuid)
    snapshot_id: Mapped[str] = mapped_column(ForeignKey("serving_snapshots.id"), nullable=False)
    dataset_id: Mapped[str] = mapped_column(ForeignKey("archive_datasets.id"), nullable=False)
    team_id: Mapped[str] = mapped_column(String(100), nullable=False)
    season: Mapped[str] = mapped_column(String(10), nullable=False)
    replay_date: Mapped[date] = mapped_column(Date, nullable=False)
    eligible_games: Mapped[int] = mapped_column(Integer, nullable=False)
    context_json: Mapped[dict[str, Any]] = mapped_column(JSON, nullable=False)
    max_history_date: Mapped[date | None] = mapped_column(Date)
