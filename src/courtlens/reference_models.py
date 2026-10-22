"""Basketball-Reference player profiles parsed from retained pages (services/bbref_bio.py).

Rows are append-only evidence derived from one retained page (its acquisition and content hash)
by one parser version. A later crawl adds a newer row; serving reads the newest per player.
"""

from datetime import datetime
from typing import Any

from sqlalchemy import (
    JSON,
    Boolean,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    String,
    UniqueConstraint,
)
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


class BbrefPlayerSeason(Base):
    """One player's season with one team (or the multi-team summary row), from a sealed file.

    Rows are keyed by the sealed seasons file's SHA-256 (services/bbref_history_seal.py); a
    workbench dataset pins the file it serves, so a later seal never changes an older release.
    A stat the source did not record that season is null, never 0.
    """

    __tablename__ = "bbref_player_seasons"
    __table_args__ = (
        UniqueConstraint("source_sha256", "season", "phase", "player_id", "team_id"),
        Index("ix_bbref_player_seasons_scope", "source_sha256", "season", "phase"),
        Index("ix_bbref_player_seasons_player", "source_sha256", "player_id"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_uuid)
    source_sha256: Mapped[str] = mapped_column(String(64), nullable=False)
    parser_version: Mapped[str] = mapped_column(String(40), nullable=False)
    season: Mapped[str] = mapped_column(String(10), nullable=False)
    phase: Mapped[str] = mapped_column(String(30), nullable=False)
    player_id: Mapped[str] = mapped_column(String(100), nullable=False)
    bbref_id: Mapped[str] = mapped_column(String(20), nullable=False)
    player_name: Mapped[str] = mapped_column(String(200), nullable=False)
    team_id: Mapped[str] = mapped_column(String(20), nullable=False)
    is_summary: Mapped[bool] = mapped_column(Boolean, nullable=False)
    age: Mapped[int | None] = mapped_column(Integer)
    position: Mapped[str | None] = mapped_column(String(20))
    games: Mapped[int | None] = mapped_column(Integer)
    games_started: Mapped[int | None] = mapped_column(Integer)
    minutes: Mapped[int | None] = mapped_column(Integer)
    points: Mapped[int | None] = mapped_column(Integer)
    stats_json: Mapped[dict[str, Any]] = mapped_column(JSON, nullable=False)
    advanced_json: Mapped[dict[str, Any]] = mapped_column(JSON, nullable=False)


class BbrefTeamSeason(Base):
    """A team's regular-season totals and its opponents' totals, from a sealed file."""

    __tablename__ = "bbref_team_seasons"
    __table_args__ = (UniqueConstraint("source_sha256", "season", "phase", "team_id"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_uuid)
    source_sha256: Mapped[str] = mapped_column(String(64), nullable=False)
    season: Mapped[str] = mapped_column(String(10), nullable=False)
    phase: Mapped[str] = mapped_column(String(30), nullable=False)
    team_id: Mapped[str] = mapped_column(String(20), nullable=False)
    team_name: Mapped[str] = mapped_column(String(100), nullable=False)
    stats_json: Mapped[dict[str, Any]] = mapped_column(JSON, nullable=False)
    opponent_stats_json: Mapped[dict[str, Any]] = mapped_column(JSON, nullable=False)
