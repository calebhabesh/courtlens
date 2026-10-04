"""Explicit finalized-research output; source IDs here belong to the NBA namespace."""

from datetime import date, datetime
from typing import Any, Literal

from pydantic import BaseModel


class HistoricalTeam(BaseModel):
    source_id: str
    canonical_id: str
    identity_status: Literal["admitted_research"]
    name: str
    side: Literal["home", "away"]
    score: int
    statistics: dict[str, Any]


class HistoricalGame(BaseModel):
    source_id: str
    canonical_id: str
    identity_status: Literal["admitted_research"]
    namespace: Literal["nba"]
    slate_date: date
    event_time: datetime | None
    status: Literal["final"]
    period: None
    clock: None
    provisional: Literal[False]
    teams: list[HistoricalTeam]


class HistoricalPlayer(BaseModel):
    source_id: str
    canonical_id: str
    identity_status: Literal["admitted_research"]
    team_source_id: str
    name: str
    appearance_label: str
    reported_nonappearance: bool | None
    statistics: dict[str, str | None]


class HistoricalSlate(BaseModel):
    context: dict[str, Any]
    games: list[HistoricalGame]
    players: list[HistoricalPlayer] | None
    status: Literal["admitted_finals", "no_admitted_finals"]
    warnings: list[str]
