"""Basketball-Reference player profiles parsed from retained pages (services/bbref_bio.py).

Rows are append-only evidence derived from one retained page (its acquisition and content hash)
by one parser version. A later crawl adds a newer row; serving reads the newest per player.
"""

from datetime import datetime
from typing import Any

from sqlalchemy import JSON, DateTime, ForeignKey, Index, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from courtlens.database import Base
from courtlens.models import new_uuid, utc_now
from courtlens.workbench_models import WorkbenchAcquisition  # noqa: F401  (FK target)


class BbrefPlayerProfile(Base):
    __tablename__ = "bbref_player_profiles"
    __table_args__ = (
        UniqueConstraint("content_sha256", "parser_version", "player_id"),
        Index("ix_bbref_player_profiles_player", "player_id", "observed_at"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_uuid)
    # The NBA person ID the page was matched to, and how (see ingestion/bbref_players.py).
    player_id: Mapped[str] = mapped_column(String(100), nullable=False)
    bbref_id: Mapped[str] = mapped_column(String(20), nullable=False)
    match_basis: Mapped[str] = mapped_column(String(40), nullable=False)
    acquisition_id: Mapped[str] = mapped_column(
        ForeignKey("workbench_acquisitions.id"), nullable=False
    )
    content_sha256: Mapped[str] = mapped_column(String(64), nullable=False)
    parser_version: Mapped[str] = mapped_column(String(40), nullable=False)
    profile: Mapped[dict[str, Any]] = mapped_column(JSON, nullable=False)
    # When the page was fetched: what the profile is "as of".
    observed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)
