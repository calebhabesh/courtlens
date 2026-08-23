from __future__ import annotations

from datetime import date
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from pydantic import BaseModel, EmailStr, Field, field_validator, model_validator

from courtload.domain.matching import MAX_ACTIVE_SLOTS
from courtload.domain.scoring import DEFAULT_POINTS_RULES, validate_scoring_rules

ALLOWED_SLOTS = frozenset({"PG", "SG", "SF", "PF", "C", "G", "F", "UTIL"})


class RegisterRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=12, max_length=128)


class LoginRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=1, max_length=128)


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"


class LeagueCreate(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    timezone: str = "America/Toronto"
    week_starts_on: int = Field(default=0, ge=0, le=6)
    lineup_mode: str = "daily"
    lineup_slots: dict[str, int] = Field(
        default_factory=lambda: {
            "PG": 1,
            "SG": 1,
            "SF": 1,
            "PF": 1,
            "C": 1,
            "G": 1,
            "F": 1,
            "UTIL": 3,
        }
    )
    acquisition_limit: int = Field(default=4, ge=0, le=20)
    scoring_mode: str = "points"
    scoring_rules: dict[str, float] = Field(default_factory=lambda: dict(DEFAULT_POINTS_RULES))

    @field_validator("timezone")
    @classmethod
    def valid_timezone(cls, value: str) -> str:
        try:
            ZoneInfo(value)
        except ZoneInfoNotFoundError as error:
            raise ValueError("timezone must be a valid IANA timezone") from error
        return value

    @field_validator("lineup_mode")
    @classmethod
    def daily_only(cls, value: str) -> str:
        if value != "daily":
            raise ValueError("CourtLoad v1 supports daily lineups only")
        return value

    @field_validator("scoring_mode")
    @classmethod
    def points_only(cls, value: str) -> str:
        if value != "points":
            raise ValueError("CourtLoad v1 supports configurable points scoring only")
        return value

    @field_validator("lineup_slots")
    @classmethod
    def valid_slots(cls, value: dict[str, int]) -> dict[str, int]:
        normalized = {slot.upper(): count for slot, count in value.items() if count > 0}
        unknown = set(normalized) - ALLOWED_SLOTS
        if unknown:
            raise ValueError(f"unsupported lineup slots: {', '.join(sorted(unknown))}")
        if not normalized or sum(normalized.values()) > MAX_ACTIVE_SLOTS:
            raise ValueError(f"configure between 1 and {MAX_ACTIVE_SLOTS} active slots")
        return dict(sorted(normalized.items()))

    @field_validator("scoring_rules")
    @classmethod
    def valid_scoring_rules(cls, value: dict[str, float]) -> dict[str, float]:
        return validate_scoring_rules(value)


class RosterEntryInput(BaseModel):
    player_id: int
    roster_role: str = "active"
    eligible_slots: list[str] = Field(min_length=1, max_length=8)
    effective_from: date | None = None
    effective_to: date | None = None

    @field_validator("roster_role")
    @classmethod
    def valid_role(cls, value: str) -> str:
        normalized = value.lower()
        if normalized not in {"active", "bench", "ir"}:
            raise ValueError("roster_role must be active, bench, or ir")
        return normalized

    @field_validator("eligible_slots")
    @classmethod
    def valid_eligibility(cls, value: list[str]) -> list[str]:
        normalized = sorted({slot.upper() for slot in value})
        unknown = set(normalized) - ALLOWED_SLOTS
        if unknown:
            raise ValueError(f"unsupported eligibility: {', '.join(sorted(unknown))}")
        return normalized

    @model_validator(mode="after")
    def dates_in_order(self) -> RosterEntryInput:
        if self.effective_from and self.effective_to and self.effective_to < self.effective_from:
            raise ValueError("effective_to must be on or after effective_from")
        return self


class RosterReplace(BaseModel):
    entries: list[RosterEntryInput] = Field(max_length=30)

    @model_validator(mode="after")
    def unique_players(self) -> RosterReplace:
        ids = [entry.player_id for entry in self.entries]
        if len(ids) != len(set(ids)):
            raise ValueError("roster contains duplicate players")
        return self


class WatchlistEntryInput(BaseModel):
    player_id: int
    label: str | None = Field(default=None, max_length=100)


class WatchlistReplace(BaseModel):
    entries: list[WatchlistEntryInput] = Field(max_length=100)

    @model_validator(mode="after")
    def unique_players(self) -> WatchlistReplace:
        ids = [entry.player_id for entry in self.entries]
        if len(ids) != len(set(ids)):
            raise ValueError("watchlist contains duplicate players")
        return self


class StatusOverrideInput(BaseModel):
    player_id: int
    starts_on: date
    ends_on: date
    status: str

    @field_validator("status")
    @classmethod
    def supported_status(cls, value: str) -> str:
        normalized = value.lower()
        if normalized not in {"active", "inactive", "out", "ir"}:
            raise ValueError("status must be active, inactive, out, or ir")
        return normalized

    @model_validator(mode="after")
    def dates_in_order(self) -> StatusOverrideInput:
        if self.ends_on < self.starts_on:
            raise ValueError("ends_on must be on or after starts_on")
        return self


class WeekStateUpdate(BaseModel):
    acquisitions_used: int = Field(default=0, ge=0, le=20)
    status_overrides: list[StatusOverrideInput] = Field(default_factory=list, max_length=60)


class ScenarioCreate(BaseModel):
    week_start: date
    effective_date: date
    dropped_player_id: int
    added_player_id: int
    added_eligible_slots: list[str] = Field(default_factory=lambda: ["UTIL"], min_length=1)

    @field_validator("added_eligible_slots")
    @classmethod
    def valid_slots(cls, value: list[str]) -> list[str]:
        normalized = sorted({slot.upper() for slot in value})
        unknown = set(normalized) - ALLOWED_SLOTS
        if unknown:
            raise ValueError(f"unsupported eligibility: {', '.join(sorted(unknown))}")
        return normalized

    @model_validator(mode="after")
    def valid_change(self) -> ScenarioCreate:
        if self.dropped_player_id == self.added_player_id:
            raise ValueError("added and dropped players must differ")
        if (
            not self.week_start
            <= self.effective_date
            <= self.week_start.fromordinal(self.week_start.toordinal() + 6)
        ):
            raise ValueError("effective_date must fall within the scoring week")
        return self
