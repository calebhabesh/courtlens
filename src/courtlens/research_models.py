"""Append-only research inputs, isolated from serving releases and existing datasets."""

from datetime import datetime
from typing import Any

from sqlalchemy import JSON, Boolean, DateTime, ForeignKeyConstraint, Integer, String, event
from sqlalchemy.orm import Mapped, mapped_column

from courtlens.database import Base
from courtlens.models import new_uuid, utc_now


class ResearchDataset(Base):
    __tablename__ = "research_datasets"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_uuid)
    content_sha256: Mapped[str] = mapped_column(String(64), unique=True, nullable=False)
    source_membership_sha256: Mapped[str] = mapped_column(String(64), nullable=False)
    transform_sha256: Mapped[str] = mapped_column(String(64), nullable=False)
    coverage_report_sha256: Mapped[str] = mapped_column(String(64), nullable=False)
    admission_transaction: Mapped[str] = mapped_column(String(30), nullable=False)
    manifest_json: Mapped[dict[str, Any]] = mapped_column(JSON, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)


class ResearchGame(Base):
    __tablename__ = "research_games"
    __table_args__ = (ForeignKeyConstraint(["dataset_id"], ["research_datasets.id"]),)
    dataset_id: Mapped[str] = mapped_column(String(36), primary_key=True)
    game_id: Mapped[str] = mapped_column(String(10), primary_key=True)
    season: Mapped[str] = mapped_column(String(10), nullable=False)
    game_date: Mapped[str] = mapped_column(String(10), nullable=False)
    all_rows: Mapped[int] = mapped_column(Integer, nullable=False)
    eligible_rows: Mapped[int] = mapped_column(Integer, nullable=False)
    row_membership_sha256: Mapped[str] = mapped_column(String(64), nullable=False)
    eligible_membership_sha256: Mapped[str] = mapped_column(String(64), nullable=False)


class ResearchShotMember(Base):
    __tablename__ = "research_shot_members"
    __table_args__ = (
        ForeignKeyConstraint(
            ["dataset_id", "game_id"], ["research_games.dataset_id", "research_games.game_id"]
        ),
    )
    dataset_id: Mapped[str] = mapped_column(String(36), primary_key=True)
    game_id: Mapped[str] = mapped_column(String(10), primary_key=True)
    event_id: Mapped[int] = mapped_column(Integer, primary_key=True)
    eligible: Mapped[bool] = mapped_column(Boolean, nullable=False)
    payload_json: Mapped[dict[str, Any]] = mapped_column(JSON, nullable=False)


def _immutable(mapper: Any, connection: Any, target: Any) -> None:
    raise RuntimeError("research input memberships are append-only")


for _model in (ResearchDataset, ResearchGame, ResearchShotMember):
    event.listen(_model, "before_update", _immutable)
    event.listen(_model, "before_delete", _immutable)
