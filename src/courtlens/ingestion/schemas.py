from __future__ import annotations

from datetime import UTC, date, datetime
from typing import Any

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator


class ProviderModel(BaseModel):
    model_config = ConfigDict(extra="allow")
    id: int


class ProviderTeam(ProviderModel):
    id: int
    conference: str | None = None
    division: str | None = None
    city: str = ""
    name: str = ""
    full_name: str
    abbreviation: str


class ProviderPlayer(ProviderModel):
    id: int
    first_name: str
    last_name: str
    position: str | None = None
    team: ProviderTeam | None = None
    team_id: int | None = None

    @property
    def resolved_team_id(self) -> int | None:
        return self.team.id if self.team is not None else self.team_id


class ProviderGame(ProviderModel):
    id: int
    date: date
    season: int
    status: str
    status_state: str | None = None
    scheduled_start_utc: datetime | None = Field(default=None, validation_alias="datetime")
    postseason: bool = False
    postponed: bool = False
    home_team_score: int | None = None
    visitor_team_score: int | None = None
    home_team: ProviderTeam | None = None
    visitor_team: ProviderTeam | None = None
    home_team_id: int | None = None
    visitor_team_id: int | None = None
    ist_stage: str | None = None
    neutral_site: bool = False

    @model_validator(mode="after")
    def normalize_embedded_shape(self) -> ProviderGame:
        if self.home_team_id is None and self.home_team is not None:
            self.home_team_id = self.home_team.id
        if self.visitor_team_id is None and self.visitor_team is not None:
            self.visitor_team_id = self.visitor_team.id
        if self.home_team_id is None or self.visitor_team_id is None:
            raise ValueError("game is missing a home or visitor team id")
        if self.scheduled_start_utc is None:
            self.scheduled_start_utc = datetime.combine(self.date, datetime.min.time(), tzinfo=UTC)
        elif self.scheduled_start_utc.tzinfo is None:
            self.scheduled_start_utc = self.scheduled_start_utc.replace(tzinfo=UTC)
        return self

    @property
    def normalized_status_state(self) -> str:
        allowed = {
            "scheduled",
            "in_progress",
            "final",
            "postponed",
            "canceled",
            "delayed",
            "suspended",
            "abandoned",
            "unknown",
        }
        if self.status_state in allowed:
            return self.status_state
        if self.postponed:
            return "postponed"
        lowered = self.status.lower()
        if lowered == "final":
            return "final"
        if "cancel" in lowered:
            return "canceled"
        if any(marker in lowered for marker in ("qtr", "half", "overtime")):
            return "in_progress"
        return "scheduled" if "pm" in lowered or "am" in lowered else "unknown"


class ProviderStatGame(ProviderModel):
    id: int
    date: date
    season: int
    status: str
    status_state: str | None = None
    postseason: bool = False
    postponed: bool = False
    home_team_score: int | None = None
    visitor_team_score: int | None = None
    home_team_id: int
    visitor_team_id: int
    ist_stage: str | None = None


class ProviderPlayerStat(ProviderModel):
    id: int
    min: str | int | float | None = None
    fgm: int = 0
    fga: int = 0
    fg3m: int = 0
    fg3a: int = 0
    ftm: int = 0
    fta: int = 0
    oreb: int = 0
    dreb: int = 0
    reb: int = 0
    ast: int = 0
    stl: int = 0
    blk: int = 0
    turnover: int = 0
    pf: int = 0
    pts: int = 0
    plus_minus: int | None = None
    player: ProviderPlayer
    team: ProviderTeam
    game: ProviderStatGame

    @field_validator(
        "fgm",
        "fga",
        "fg3m",
        "fg3a",
        "ftm",
        "fta",
        "oreb",
        "dreb",
        "reb",
        "ast",
        "stl",
        "blk",
        "turnover",
        "pf",
        "pts",
        mode="before",
    )
    @classmethod
    def coerce_missing_stat(cls, value: Any) -> int:
        return 0 if value is None else int(value)

    @property
    def minutes_float(self) -> float | None:
        if self.min is None or self.min == "":
            return None
        if isinstance(self.min, int | float):
            return float(self.min)
        if ":" in self.min:
            minutes, seconds = self.min.split(":", maxsplit=1)
            return int(minutes) + int(seconds) / 60
        return float(self.min)


class ProviderPage(BaseModel):
    model_config = ConfigDict(extra="allow")
    data: list[dict[str, Any]]
    meta: dict[str, Any] = Field(default_factory=dict)
