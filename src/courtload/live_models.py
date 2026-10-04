"""Independent provisional Live cache; never part of a research release."""

from datetime import datetime
from typing import Any

from sqlalchemy import JSON, DateTime, ForeignKey, Integer, LargeBinary, String
from sqlalchemy.orm import Mapped, mapped_column

from courtload.database import Base
from courtload.models import new_uuid, utc_now


class LiveFeed(Base):
    __tablename__ = "live_feeds"
    namespace: Mapped[str] = mapped_column(String(30), primary_key=True)
    next_poll_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    last_poll_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    last_success_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    status: Mapped[str] = mapped_column(String(40), default="awaiting_first_observation")
    failures: Mapped[int] = mapped_column(Integer, default=0)
    requests: Mapped[int] = mapped_column(Integer, default=0)
    bytes_received: Mapped[int] = mapped_column(Integer, default=0)
    cycles: Mapped[int] = mapped_column(Integer, default=0)
    error: Mapped[str | None] = mapped_column(String(100))


class LiveLease(Base):
    __tablename__ = "live_leases"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_uuid)
    slate_date: Mapped[str] = mapped_column(String(10), index=True)
    game_id: Mapped[str | None] = mapped_column(String(30))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)


class LiveContent(Base):
    __tablename__ = "live_contents"
    sha256: Mapped[str] = mapped_column(String(64), primary_key=True)
    raw_bytes: Mapped[bytes] = mapped_column(LargeBinary)
    normalized_json: Mapped[dict[str, Any]] = mapped_column(JSON)
    parser_version: Mapped[str] = mapped_column(String(30), default="espn-live-v1")


class LiveObservation(Base):
    __tablename__ = "live_observations"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_uuid)
    namespace: Mapped[str] = mapped_column(String(30), default="espn")
    resource: Mapped[str] = mapped_column(String(80), index=True)
    content_sha256: Mapped[str] = mapped_column(ForeignKey("live_contents.sha256"))
    acquired_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)
    source_time: Mapped[str | None] = mapped_column(String(80))
    http_date: Mapped[str | None] = mapped_column(String(80))


class LiveReconciliation(Base):
    __tablename__ = "live_reconciliations"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_uuid)
    observation_id: Mapped[str] = mapped_column(ForeignKey("live_observations.id"))
    dataset_id: Mapped[str] = mapped_column(ForeignKey("workbench_datasets.id"))
    result_json: Mapped[dict[str, Any]] = mapped_column(JSON)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)
