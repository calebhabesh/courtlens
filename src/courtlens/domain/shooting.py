"""Frozen B23 contracts and deterministic descriptive shooting calculations."""

from __future__ import annotations

from datetime import date
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator

from courtlens.domain.rich_sources import classify_shot_zone

VERSION = "courtload-shooting-sequences-v1"
ZONES = (
    "Restricted Area",
    "In The Paint (Non-RA)",
    "Mid-Range",
    "Left Corner 3",
    "Right Corner 3",
    "Above the Break 3",
    "Backcourt",
)
Operation = Literal["shot-profile", "shot-profile-peers", "matchups", "shot-aftermath"]


class ShootingRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    release_id: str | None = None
    season: str | None = None
    phase: (
        Literal["preseason", "regular_season", "play_in", "playoffs", "cup_final", "summer_league"]
        | None
    ) = None
    before_date: date | None = None
    lower_date: date | None = None
    player_id: str = Field(min_length=1, max_length=100, pattern=r"^\S+$")
    defender_id: str | None = Field(default=None, min_length=1, max_length=100, pattern=r"^\S+$")
    min_attempts: int = Field(default=100, ge=1, le=10000)
    min_games: int = Field(default=5, ge=1, le=100)
    limit: int = Field(default=10, ge=1, le=25)

    @model_validator(mode="after")
    def dates(self) -> ShootingRequest:
        if self.lower_date and self.before_date and self.lower_date >= self.before_date:
            raise ValueError("lower_date must precede before_date")
        return self


class ShotFact(BaseModel):
    game_id: str
    game_date: str
    player_id: str
    team_id: str
    period: int
    seconds_remaining: float | None
    shot_value: int
    made: bool
    points: int
    x_feet: float | None
    y_feet: float | None
    distance_feet: float
    zone: str


class ZoneSummary(BaseModel):
    zone: str
    attempts: int
    makes: int
    points: int
    fg_pct: float | None
    attempt_share: float | None


class ShotProfile(BaseModel):
    player_id: str
    games: int
    attempts: int
    makes: int
    points: int
    located_attempts: int
    unknown_attempts: int
    sample_status: Literal["available", "insufficient_sample", "empty"]
    zones: list[ZoneSummary]


class ProfilePeer(BaseModel):
    profile: ShotProfile
    distance: float


class AssignmentSummary(BaseModel):
    offensive_player_id: str
    defensive_player_id: str
    games: int
    seconds: float
    fractional_possessions: float
    attempts: int
    makes: int
    player_points: int
    team_points: int
    fg_pct: float | None


class AftermathAnchor(BaseModel):
    game_id: str
    possession_number: int | None = None
    branch: Literal["made", "missed_recovery", "missed_no_observed_recovery", "unknown"]
    shot_points: int
    first_chance_points: int | None = None
    continued_points: int | None = None
    next_opponent_points: int | None = None
    next_status: Literal["observed", "missing", "censored"] = "missing"
    reason: str | None = None


class AftermathSummary(BaseModel):
    branch: str
    anchors: int
    games: int
    continued_samples: int
    opponent_samples: int
    missing_opponent: int
    censored_opponent: int
    first_chance_points: int | None
    continued_points: int | None
    next_opponent_points: int | None
    sample_status: Literal["available", "insufficient_sample", "empty"]


class ShootingResponse(BaseModel):
    operation: Operation
    operation_version: str = VERSION
    context: dict[str, Any]
    request: ShootingRequest
    coverage_status: Literal["available", "partial", "source_blocked"]
    expected_games: int
    observed_games: int
    excluded_rows: int
    input_counts: dict[str, int]
    profile: ShotProfile | None = None
    peers: list[ProfilePeer] = Field(default_factory=list)
    assignments: list[AssignmentSummary] = Field(default_factory=list)
    shots: list[ShotFact] = Field(default_factory=list)
    anchors: list[AftermathAnchor] = Field(default_factory=list)
    aftermath_summary: list[AftermathSummary] = Field(default_factory=list)
    provenance: list[dict[str, Any]] = Field(default_factory=list)
    branch_counts: dict[str, int] = Field(default_factory=dict)
    input_hash: str
    evidence_hash: str
    disclosures: list[str]


def profile(player_id: str, shots: list[ShotFact], request: ShootingRequest) -> ShotProfile:
    rows = [s for s in shots if s.player_id == player_id]
    located = sum(s.zone != "Unknown" for s in rows)
    games = len({s.game_id for s in rows})
    zones = []
    for zone in (*ZONES, "Unknown"):
        cell = [s for s in rows if s.zone == zone]
        zones.append(
            ZoneSummary(
                zone=zone,
                attempts=len(cell),
                makes=sum(s.made for s in cell),
                points=sum(s.points for s in cell),
                fg_pct=sum(s.made for s in cell) / len(cell) if cell else None,
                attempt_share=len(cell) / len(rows) if rows else None,
            )
        )
    return ShotProfile(
        player_id=player_id,
        games=games,
        attempts=len(rows),
        makes=sum(s.made for s in rows),
        points=sum(s.points for s in rows),
        located_attempts=located,
        unknown_attempts=len(rows) - located,
        sample_status="empty"
        if not rows
        else "available"
        if located >= request.min_attempts and games >= request.min_games
        else "insufficient_sample",
        zones=zones,
    )


def shot_zone(x: float | None, y: float | None, distance: float, value: int) -> str:
    return classify_shot_zone(x, y, distance, value)[0]
