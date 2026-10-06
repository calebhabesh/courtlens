from __future__ import annotations

import uuid
from datetime import UTC, date, datetime
from typing import Any

from sqlalchemy import (
    JSON,
    Boolean,
    Date,
    DateTime,
    Float,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from courtload.database import Base


def new_uuid() -> str:
    return str(uuid.uuid4())


def utc_now() -> datetime:
    return datetime.now(UTC)


class User(Base):
    __tablename__ = "users"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_uuid)
    email: Mapped[str] = mapped_column(String(320), unique=True, nullable=False, index=True)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)


class IngestionRun(Base):
    __tablename__ = "ingestion_runs"

    run_id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_uuid)
    source_name: Mapped[str] = mapped_column(String(50), nullable=False)
    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)
    finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    status: Mapped[str] = mapped_column(String(20), default="running", index=True)
    requested_count: Mapped[int] = mapped_column(Integer, default=0)
    received_count: Mapped[int] = mapped_column(Integer, default=0)
    inserted_count: Mapped[int] = mapped_column(Integer, default=0)
    updated_count: Mapped[int] = mapped_column(Integer, default=0)
    unchanged_count: Mapped[int] = mapped_column(Integer, default=0)
    error_summary: Mapped[str | None] = mapped_column(Text)
    metadata_json: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)


class RawObject(Base):
    __tablename__ = "raw_objects"
    __table_args__ = (
        UniqueConstraint(
            "source_name", "resource", "source_key", "content_sha256", name="uq_raw_version"
        ),
    )

    object_id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_uuid)
    ingestion_run_id: Mapped[str] = mapped_column(ForeignKey("ingestion_runs.run_id"), index=True)
    source_name: Mapped[str] = mapped_column(String(50), nullable=False)
    resource: Mapped[str] = mapped_column(String(50), nullable=False)
    source_key: Mapped[str] = mapped_column(String(200), nullable=False)
    fetched_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)
    http_status: Mapped[int] = mapped_column(Integer, default=200)
    content_sha256: Mapped[str] = mapped_column(String(64), nullable=False)
    storage_uri: Mapped[str] = mapped_column(Text, nullable=False)
    source_schema_version: Mapped[str] = mapped_column(String(50), default="nba-openapi-1.0.0")


class Team(Base):
    __tablename__ = "dim_teams"

    team_key: Mapped[int] = mapped_column(Integer, primary_key=True)
    source_team_id: Mapped[int] = mapped_column(Integer, unique=True, nullable=False)
    abbreviation: Mapped[str] = mapped_column(String(8), nullable=False, index=True)
    city: Mapped[str] = mapped_column(String(100), default="")
    name: Mapped[str] = mapped_column(String(100), default="")
    full_name: Mapped[str] = mapped_column(String(160), nullable=False)
    conference: Mapped[str | None] = mapped_column(String(20))
    division: Mapped[str | None] = mapped_column(String(30))
    valid_from: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)
    valid_to: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    source_object_id: Mapped[str | None] = mapped_column(ForeignKey("raw_objects.object_id"))


class Player(Base):
    __tablename__ = "dim_players"

    player_key: Mapped[int] = mapped_column(Integer, primary_key=True)
    source_player_id: Mapped[int] = mapped_column(Integer, unique=True, nullable=False)
    first_name: Mapped[str] = mapped_column(String(100), nullable=False)
    last_name: Mapped[str] = mapped_column(String(100), nullable=False)
    full_name: Mapped[str] = mapped_column(String(220), nullable=False, index=True)
    listed_position: Mapped[str | None] = mapped_column(String(20))
    current_team_key: Mapped[int | None] = mapped_column(ForeignKey("dim_teams.team_key"))
    active: Mapped[bool | None] = mapped_column(Boolean)
    first_seen_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)
    last_seen_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)
    source_object_id: Mapped[str | None] = mapped_column(ForeignKey("raw_objects.object_id"))

    current_team: Mapped[Team | None] = relationship()


class PlayerTeamStint(Base):
    __tablename__ = "bridge_player_observed_team_stints"
    __table_args__ = (
        UniqueConstraint("player_key", "team_key", "valid_from", name="uq_player_team_stint"),
    )

    stint_id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_uuid)
    player_key: Mapped[int] = mapped_column(ForeignKey("dim_players.player_key"), index=True)
    team_key: Mapped[int] = mapped_column(ForeignKey("dim_teams.team_key"), index=True)
    valid_from: Mapped[date] = mapped_column(Date, nullable=False)
    valid_to: Mapped[date | None] = mapped_column(Date)
    first_source_object_id: Mapped[str | None] = mapped_column(ForeignKey("raw_objects.object_id"))
    last_source_object_id: Mapped[str | None] = mapped_column(ForeignKey("raw_objects.object_id"))
    reconstruction_status: Mapped[str] = mapped_column(String(30), default="observed")


class Game(Base):
    __tablename__ = "fct_games"

    game_key: Mapped[int] = mapped_column(Integer, primary_key=True)
    source_game_id: Mapped[int] = mapped_column(Integer, unique=True, nullable=False)
    season: Mapped[int] = mapped_column(Integer, nullable=False, index=True)
    game_type: Mapped[str] = mapped_column(String(30), default="regular")
    scheduled_start_utc: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)
    status: Mapped[str] = mapped_column(String(80), nullable=False)
    status_state: Mapped[str] = mapped_column(String(30), default="unknown", index=True)
    home_team_key: Mapped[int] = mapped_column(ForeignKey("dim_teams.team_key"), nullable=False)
    away_team_key: Mapped[int] = mapped_column(ForeignKey("dim_teams.team_key"), nullable=False)
    home_score: Mapped[int | None] = mapped_column(Integer)
    away_score: Mapped[int | None] = mapped_column(Integer)
    neutral_site: Mapped[bool] = mapped_column(Boolean, default=False)
    postponed: Mapped[bool] = mapped_column(Boolean, default=False)
    source_object_id: Mapped[str | None] = mapped_column(ForeignKey("raw_objects.object_id"))
    last_observed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)

    home_team: Mapped[Team] = relationship(foreign_keys=[home_team_key])
    away_team: Mapped[Team] = relationship(foreign_keys=[away_team_key])


class PlayerGame(Base):
    __tablename__ = "fct_player_games"
    __table_args__ = (
        UniqueConstraint("game_key", "player_key", name="uq_player_full_game_stat"),
        Index("ix_player_games_player_tip", "player_key", "game_key"),
    )

    source_stat_id: Mapped[int] = mapped_column(Integer, primary_key=True)
    game_key: Mapped[int] = mapped_column(ForeignKey("fct_games.game_key"), nullable=False)
    player_key: Mapped[int] = mapped_column(ForeignKey("dim_players.player_key"), nullable=False)
    team_key: Mapped[int] = mapped_column(ForeignKey("dim_teams.team_key"), nullable=False)
    opponent_team_key: Mapped[int] = mapped_column(ForeignKey("dim_teams.team_key"), nullable=False)
    is_home: Mapped[bool] = mapped_column(Boolean, nullable=False)
    minutes: Mapped[float | None] = mapped_column(Float)
    points: Mapped[int] = mapped_column(Integer, default=0)
    rebounds: Mapped[int] = mapped_column(Integer, default=0)
    assists: Mapped[int] = mapped_column(Integer, default=0)
    steals: Mapped[int] = mapped_column(Integer, default=0)
    blocks: Mapped[int] = mapped_column(Integer, default=0)
    turnovers: Mapped[int] = mapped_column(Integer, default=0)
    three_pointers_made: Mapped[int] = mapped_column(Integer, default=0)
    field_goals_made: Mapped[int] = mapped_column(Integer, default=0)
    field_goals_attempted: Mapped[int] = mapped_column(Integer, default=0)
    free_throws_made: Mapped[int] = mapped_column(Integer, default=0)
    free_throws_attempted: Mapped[int] = mapped_column(Integer, default=0)
    offensive_rebounds: Mapped[int] = mapped_column(Integer, default=0)
    defensive_rebounds: Mapped[int] = mapped_column(Integer, default=0)
    personal_fouls: Mapped[int] = mapped_column(Integer, default=0)
    plus_minus: Mapped[int | None] = mapped_column(Integer)
    appearance_status: Mapped[str] = mapped_column(String(30), default="reported")
    source_object_id: Mapped[str | None] = mapped_column(ForeignKey("raw_objects.object_id"))
    last_observed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)

    game: Mapped[Game] = relationship()
    player: Mapped[Player] = relationship()
    team: Mapped[Team] = relationship(foreign_keys=[team_key])


class FantasyLeague(Base):
    __tablename__ = "fantasy_leagues"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_uuid)
    owner_id: Mapped[str] = mapped_column(ForeignKey("users.id"), nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    timezone: Mapped[str] = mapped_column(String(80), default="America/Toronto")
    week_starts_on: Mapped[int] = mapped_column(Integer, default=0)
    lineup_mode: Mapped[str] = mapped_column(String(30), default="daily")
    lineup_slots_json: Mapped[dict[str, int]] = mapped_column(JSON, default=dict)
    acquisition_limit: Mapped[int] = mapped_column(Integer, default=4)
    scoring_mode: Mapped[str] = mapped_column(String(30), default="points")
    scoring_rules_json: Mapped[dict[str, float]] = mapped_column(JSON, default=dict)
    scoring_rules_version: Mapped[str] = mapped_column(String(64), nullable=False)
    config_version: Mapped[int] = mapped_column(Integer, default=1)
    roster_version: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)

    roster: Mapped[list[FantasyRosterEntry]] = relationship(
        back_populates="league", cascade="all, delete-orphan"
    )
    watchlist: Mapped[list[FantasyWatchlistEntry]] = relationship(
        back_populates="league", cascade="all, delete-orphan"
    )


class FantasyRosterEntry(Base):
    __tablename__ = "fantasy_roster_entries"
    __table_args__ = (UniqueConstraint("league_id", "player_key", name="uq_league_roster_player"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_uuid)
    league_id: Mapped[str] = mapped_column(ForeignKey("fantasy_leagues.id", ondelete="CASCADE"))
    player_key: Mapped[int] = mapped_column(ForeignKey("dim_players.player_key"))
    roster_role: Mapped[str] = mapped_column(String(30), default="active")
    eligible_slot_types_json: Mapped[list[str]] = mapped_column(JSON, default=list)
    effective_from: Mapped[date | None] = mapped_column(Date)
    effective_to: Mapped[date | None] = mapped_column(Date)
    roster_version: Mapped[int] = mapped_column(Integer, default=1)

    league: Mapped[FantasyLeague] = relationship(back_populates="roster")
    player: Mapped[Player] = relationship()


class FantasyWatchlistEntry(Base):
    __tablename__ = "fantasy_watchlist_entries"
    __table_args__ = (
        UniqueConstraint("league_id", "player_key", name="uq_league_watchlist_player"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_uuid)
    league_id: Mapped[str] = mapped_column(ForeignKey("fantasy_leagues.id", ondelete="CASCADE"))
    player_key: Mapped[int] = mapped_column(ForeignKey("dim_players.player_key"))
    label: Mapped[str | None] = mapped_column(String(100))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)

    league: Mapped[FantasyLeague] = relationship(back_populates="watchlist")
    player: Mapped[Player] = relationship()


class FantasyWeekState(Base):
    __tablename__ = "fantasy_week_states"
    __table_args__ = (UniqueConstraint("league_id", "week_start", name="uq_league_week_state"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_uuid)
    league_id: Mapped[str] = mapped_column(ForeignKey("fantasy_leagues.id", ondelete="CASCADE"))
    week_start: Mapped[date] = mapped_column(Date, nullable=False)
    acquisitions_used: Mapped[int] = mapped_column(Integer, default=0)
    recorded_as_of: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)


class FantasyPlayerStatusOverride(Base):
    __tablename__ = "fantasy_player_status_overrides"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_uuid)
    league_id: Mapped[str] = mapped_column(ForeignKey("fantasy_leagues.id", ondelete="CASCADE"))
    player_key: Mapped[int] = mapped_column(ForeignKey("dim_players.player_key"))
    starts_on: Mapped[date] = mapped_column(Date, nullable=False)
    ends_on: Mapped[date] = mapped_column(Date, nullable=False)
    status: Mapped[str] = mapped_column(String(30), nullable=False)
    recorded_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)


class PlannerScenario(Base):
    __tablename__ = "planner_scenarios"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_uuid)
    league_id: Mapped[str] = mapped_column(ForeignKey("fantasy_leagues.id", ondelete="CASCADE"))
    week_start: Mapped[date] = mapped_column(Date, nullable=False)
    effective_date: Mapped[date] = mapped_column(Date, nullable=False)
    dropped_player_key: Mapped[int] = mapped_column(ForeignKey("dim_players.player_key"))
    added_player_key: Mapped[int] = mapped_column(ForeignKey("dim_players.player_key"))
    scoring_rules_version: Mapped[str] = mapped_column(String(64), nullable=False)
    league_config_version: Mapped[int] = mapped_column(Integer, nullable=False)
    roster_version: Mapped[int] = mapped_column(Integer, nullable=False)
    acquisitions_remaining_before: Mapped[int] = mapped_column(Integer, nullable=False)
    generated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)
    result_json: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)
    data_snapshot_id: Mapped[str | None] = mapped_column(ForeignKey("ingestion_runs.run_id"))


class DataQualityRun(Base):
    __tablename__ = "data_quality_runs"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_uuid)
    executed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)
    status: Mapped[str] = mapped_column(String(20), nullable=False)
    passed_count: Mapped[int] = mapped_column(Integer, default=0)
    failed_count: Mapped[int] = mapped_column(Integer, default=0)
    results_json: Mapped[list[dict[str, Any]]] = mapped_column(JSON, default=list)


from courtload import (  # noqa: E402,F401
    archive_models,
    assignment_models,
    assistant_history_models,
    conversation_models,
    finance_models,
    live_models,
    research_models,
    warehouse_models,
    workbench_models,
)
