"""Mutable local transcripts; separately saved analytical evidence remains append-only."""

from datetime import datetime
from typing import Any

from sqlalchemy import JSON, CheckConstraint, DateTime, ForeignKey, Index, Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from courtlens.database import Base


class AssistantThread(Base):
    __tablename__ = "assistant_threads"
    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    title: Mapped[str] = mapped_column(String(255))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    version: Mapped[int] = mapped_column(Integer, default=1)


class AssistantTurn(Base):
    __tablename__ = "assistant_turns"
    __table_args__ = (
        CheckConstraint("state IN ('pending','running','completed','failed','cancelled')"),
        CheckConstraint(
            "(state IN ('pending','running') AND response_json IS NULL "
            "AND response_sha256 IS NULL) OR "
            "(state IN ('completed','failed','cancelled') AND response_json IS NOT NULL "
            "AND response_sha256 IS NOT NULL)",
            name="assistant_turn_terminal_payload",
        ),
        Index("ix_assistant_turns_thread_sequence", "thread_id", "sequence", unique=True),
        Index("ix_assistant_turns_lease", "state", "lease_until"),
    )
    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    thread_id: Mapped[str] = mapped_column(ForeignKey("assistant_threads.id", ondelete="CASCADE"))
    sequence: Mapped[int] = mapped_column(Integer)
    request_id: Mapped[str] = mapped_column(String(36), unique=True)
    retry_of: Mapped[str | None] = mapped_column(ForeignKey("assistant_turns.id"))
    request_sha256: Mapped[str] = mapped_column(String(64))
    request_json: Mapped[dict[str, Any]] = mapped_column(JSON)
    accepted_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    lease_until: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    state: Mapped[str] = mapped_column(String(12))
    response_json: Mapped[dict[str, Any] | None] = mapped_column(
        JSON(none_as_null=True), nullable=True
    )
    response_sha256: Mapped[str | None] = mapped_column(String(64))
    # Resolved selections/plan are server-owned working memory, separate from the transcript.
    context_json: Mapped[dict[str, Any] | None] = mapped_column(JSON, nullable=True)
    plan_json: Mapped[dict[str, Any] | None] = mapped_column(JSON, nullable=True)


class AssistantTurnInput(Base):
    __tablename__ = "assistant_turn_inputs"
    turn_id: Mapped[str] = mapped_column(
        ForeignKey("assistant_turns.id", ondelete="CASCADE"), primary_key=True
    )
    step_id: Mapped[str] = mapped_column(String(32), primary_key=True)
    workbench_dataset_id: Mapped[str | None] = mapped_column(ForeignKey("workbench_datasets.id"))
    archive_dataset_id: Mapped[str | None] = mapped_column(ForeignKey("archive_datasets.id"))
    finance_release_id: Mapped[str | None] = mapped_column(ForeignKey("finance_releases.id"))
    issuance_id: Mapped[str | None] = mapped_column(ForeignKey("forecast_issuances.id"))


class AssistantAgentTranscript(Base):
    """Server-only provider/tool transcript, atomically published with its v3 response."""

    __tablename__ = "assistant_agent_transcripts"
    turn_id: Mapped[str] = mapped_column(
        ForeignKey("assistant_turns.id", ondelete="CASCADE"), primary_key=True
    )
    sha256: Mapped[str] = mapped_column(String(64))
    payload_json: Mapped[dict[str, Any]] = mapped_column(JSON)
