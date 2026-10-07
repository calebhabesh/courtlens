"""Independent append-only assignment inputs; never extend a published box dataset."""

from datetime import datetime
from decimal import Decimal
from typing import Any

from sqlalchemy import (
    JSON,
    DateTime,
    ForeignKey,
    ForeignKeyConstraint,
    Integer,
    Numeric,
    String,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column

from courtlens.database import Base
from courtlens.models import new_uuid, utc_now


class AssignmentDataset(Base):
    __tablename__ = "assignment_datasets"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_uuid)
    content_sha256: Mapped[str] = mapped_column(String(64), nullable=False, unique=True)
    source_sha256: Mapped[str] = mapped_column(String(64), nullable=False)
    membership_sha256: Mapped[str] = mapped_column(String(64), nullable=False)
    admission_transaction: Mapped[str] = mapped_column(String(30), nullable=False)
    manifest_json: Mapped[dict[str, Any]] = mapped_column(JSON, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)


class AssignmentGame(Base):
    __tablename__ = "assignment_games"

    dataset_id: Mapped[str] = mapped_column(ForeignKey("assignment_datasets.id"), primary_key=True)
    game_id: Mapped[str] = mapped_column(String(10), primary_key=True)
    game_date: Mapped[str] = mapped_column(String(10), nullable=False)
    row_count: Mapped[int] = mapped_column(Integer, nullable=False)
    membership_sha256: Mapped[str] = mapped_column(String(64), nullable=False)


class AssignmentMember(Base):
    __tablename__ = "assignment_members"
    __table_args__ = (
        ForeignKeyConstraint(
            ["dataset_id", "game_id"], ["assignment_games.dataset_id", "assignment_games.game_id"]
        ),
        UniqueConstraint("dataset_id", "game_id", "off_person_id", "def_person_id"),
    )

    dataset_id: Mapped[str] = mapped_column(String(36), primary_key=True)
    source_row: Mapped[int] = mapped_column(Integer, primary_key=True)
    game_id: Mapped[str] = mapped_column(String(10), nullable=False)
    off_person_id: Mapped[str] = mapped_column(String(100), nullable=False)
    def_person_id: Mapped[str] = mapped_column(String(100), nullable=False)
    off_team_id: Mapped[str] = mapped_column(String(100), nullable=False)
    def_team_id: Mapped[str] = mapped_column(String(100), nullable=False)
    matchup_seconds: Mapped[Decimal] = mapped_column(Numeric(), nullable=False)
    partial_possessions: Mapped[Decimal] = mapped_column(Numeric(), nullable=False)
    row_sha256: Mapped[str] = mapped_column(String(64), nullable=False)
    payload_json: Mapped[dict[str, str]] = mapped_column(JSON, nullable=False)


class AssignmentObservation(Base):
    """Each local admission attempt is an observation, including identical replays."""

    __tablename__ = "assignment_observations"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_uuid)
    dataset_id: Mapped[str] = mapped_column(ForeignKey("assignment_datasets.id"), nullable=False)
    observed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)
