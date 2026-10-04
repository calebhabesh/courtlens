"""Durable, append-only conversational evidence; active conversations remain in memory."""

from datetime import datetime
from typing import Any

from sqlalchemy import JSON, CheckConstraint, DateTime, ForeignKey, String, event
from sqlalchemy.orm import Mapped, mapped_column

from courtload.database import Base
from courtload.models import new_uuid, utc_now


class SavedConversationAnalysis(Base):
    __tablename__ = "saved_conversation_analyses"
    __table_args__ = (
        CheckConstraint(
            "(workbench_dataset_id IS NOT NULL AND archive_dataset_id IS NULL) OR "
            "(workbench_dataset_id IS NULL AND archive_dataset_id IS NOT NULL)",
            name="saved_conversation_one_dataset",
        ),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_uuid)
    request_id: Mapped[str] = mapped_column(String(36), nullable=False, unique=True)
    request_sha256: Mapped[str] = mapped_column(String(64), nullable=False)
    workbench_dataset_id: Mapped[str | None] = mapped_column(ForeignKey("workbench_datasets.id"))
    archive_dataset_id: Mapped[str | None] = mapped_column(ForeignKey("archive_datasets.id"))
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    manifest_sha256: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    manifest_json: Mapped[dict[str, Any]] = mapped_column(JSON, nullable=False)
    metadata_json: Mapped[dict[str, Any]] = mapped_column(JSON, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)


def _immutable(mapper: Any, connection: Any, target: Any) -> None:
    raise RuntimeError("saved conversational evidence is append-only")


event.listen(SavedConversationAnalysis, "before_update", _immutable)
event.listen(SavedConversationAnalysis, "before_delete", _immutable)


class SavedConversationInput(Base):
    """Protect separately bound financial books and prospective issuance inputs."""

    __tablename__ = "saved_conversation_inputs"
    analysis_id: Mapped[str] = mapped_column(
        ForeignKey("saved_conversation_analyses.id"), primary_key=True
    )
    step_id: Mapped[str] = mapped_column(String(32), primary_key=True)
    finance_release_id: Mapped[str | None] = mapped_column(ForeignKey("finance_releases.id"))
    issuance_id: Mapped[str | None] = mapped_column(ForeignKey("forecast_issuances.id"))


event.listen(SavedConversationInput, "before_update", _immutable)
event.listen(SavedConversationInput, "before_delete", _immutable)
