"""Immutable finance books independent of basketball publication pointers."""

from datetime import datetime
from typing import Any

from sqlalchemy import (
    JSON,
    BigInteger,
    DateTime,
    ForeignKey,
    LargeBinary,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column

from courtload.database import Base
from courtload.models import new_uuid, utc_now


class FinanceRelease(Base):
    __tablename__ = "finance_releases"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_uuid)
    content_sha256: Mapped[str] = mapped_column(String(64), unique=True)
    parent_release_id: Mapped[str | None] = mapped_column(ForeignKey("finance_releases.id"))
    manifest_json: Mapped[dict[str, Any]] = mapped_column(JSON)
    csv_bytes: Mapped[bytes] = mapped_column(LargeBinary)
    admission_transaction: Mapped[str] = mapped_column(String(30))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)


class FinanceSource(Base):
    __tablename__ = "finance_sources"
    release_id: Mapped[str] = mapped_column(ForeignKey("finance_releases.id"), primary_key=True)
    sha256: Mapped[str] = mapped_column(String(64), primary_key=True)
    evidence_bytes: Mapped[bytes] = mapped_column(LargeBinary)
    metadata_json: Mapped[dict[str, Any]] = mapped_column(JSON)


class FinanceObservation(Base):
    __tablename__ = "finance_observations"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_uuid)
    release_id: Mapped[str] = mapped_column(ForeignKey("finance_releases.id"), index=True)
    content_sha256: Mapped[str] = mapped_column(String(64))
    player_identity_id: Mapped[str] = mapped_column(ForeignKey("workbench_identities.id"))
    kind: Mapped[str] = mapped_column(String(20))
    amount_cents: Mapped[int | None] = mapped_column(BigInteger)
    supersedes_id: Mapped[str | None] = mapped_column(ForeignKey("finance_observations.id"))
    correction_reason: Mapped[str | None] = mapped_column(Text)
    payload_json: Mapped[dict[str, Any]] = mapped_column(JSON)


class FinanceMember(Base):
    __tablename__ = "finance_members"
    __table_args__ = (UniqueConstraint("release_id", "grain_sha256", name="uq_finance_grain"),)
    release_id: Mapped[str] = mapped_column(ForeignKey("finance_releases.id"), primary_key=True)
    observation_id: Mapped[str] = mapped_column(
        ForeignKey("finance_observations.id"), primary_key=True
    )
    grain_sha256: Mapped[str] = mapped_column(String(64))


# SQLite/unit use receives the same ORM mutation policy; PostgreSQL also seals raw SQL.
from sqlalchemy import event  # noqa: E402
from sqlalchemy.orm import Session  # noqa: E402


@event.listens_for(Session, "before_flush")
def prevent_finance_orm_mutation(session: Session, flush_context: Any, instances: Any) -> None:
    for entity in session.dirty.union(session.deleted):
        if isinstance(entity, (FinanceRelease, FinanceSource, FinanceObservation, FinanceMember)):
            raise ValueError("finance books are append-only")
