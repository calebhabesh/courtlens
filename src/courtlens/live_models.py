"""Live ESPN cache and retained final evidence; never part of a research release."""

from datetime import datetime
from typing import Any

from sqlalchemy import JSON, Boolean, DateTime, ForeignKey, Integer, LargeBinary, String
from sqlalchemy.orm import Mapped, mapped_column

from courtlens.database import Base
from courtlens.models import new_uuid, utc_now


class LiveCurrent(Base):
    """Latest read of one ESPN resource. Mutable cache, not evidence: final reads are also
    appended to `live_contents` / `live_observations`."""

    __tablename__ = "live_current"
    resource: Mapped[str] = mapped_column(String(80), primary_key=True)
    normalized_json: Mapped[dict[str, Any] | None] = mapped_column(JSON)
    final: Mapped[bool] = mapped_column(Boolean, default=False)
    acquired_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    source_time: Mapped[str | None] = mapped_column(String(80))
    http_date: Mapped[str | None] = mapped_column(String(80))
    observation_id: Mapped[str | None] = mapped_column(String(36))
    content_sha256: Mapped[str | None] = mapped_column(String(64))
    attempted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    failures: Mapped[int] = mapped_column(Integer, default=0)
    error: Mapped[str | None] = mapped_column(String(100))


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
