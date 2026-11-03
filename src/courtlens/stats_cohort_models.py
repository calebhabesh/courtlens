"""Persisted Stats cohorts: derived, content-addressed serving rows (stats_cohort_store).

An entry is one scope's whole-league Stats rows and, for whole-season league scopes, each
player's table ranks. Its key binds the scope, every source it reads and the serving code, so
an entry is never stale: changed inputs produce a new key and the old entry is superseded.
Entries are a cache of recomputable values, not evidence; deleting them only costs time.
"""

from datetime import datetime
from typing import Any

from sqlalchemy import JSON, DateTime, ForeignKey, Index, Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from courtlens.database import Base
from courtlens.models import utc_now


class StatsCohortEntry(Base):
    __tablename__ = "stats_cohort_entries"
    __table_args__ = (Index("ix_stats_cohort_entries_scope", "scope_key"),)

    key: Mapped[str] = mapped_column(String(64), primary_key=True)
    # The in-memory cohort key (scope and joined columns) without source or code fingerprints;
    # a newer entry for the same scope supersedes older ones.
    scope_key: Mapped[str] = mapped_column(String(64), nullable=False)
    release_id: Mapped[str] = mapped_column(String(64), nullable=False)
    season: Mapped[str] = mapped_column(String(10), nullable=False)
    phase: Mapped[str] = mapped_column(String(20), nullable=False)
    row_count: Mapped[int] = mapped_column(Integer, nullable=False)
    eligible: Mapped[int] = mapped_column(Integer, nullable=False)
    # Qualified reference size per ranked column; null when the entry carries no table ranks.
    table_sample_sizes: Mapped[dict[str, int] | None] = mapped_column(JSON)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)


class StatsCohortRow(Base):
    __tablename__ = "stats_cohort_rows"

    entry_key: Mapped[str] = mapped_column(
        ForeignKey("stats_cohort_entries.key", ondelete="CASCADE"), primary_key=True
    )
    player_id: Mapped[str] = mapped_column(String(100), primary_key=True)
    ordinal: Mapped[int] = mapped_column(Integer, nullable=False)
    payload: Mapped[dict[str, Any]] = mapped_column(JSON, nullable=False)
    # {"qualified": bool, "percentiles": {column: rank}} for entries with table ranks.
    ranks: Mapped[dict[str, Any] | None] = mapped_column(JSON)
