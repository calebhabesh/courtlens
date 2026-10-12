"""Derived metadata responses. Raw documents and local storage paths are never served."""

from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, Field


class ContextDatasetInfo(BaseModel):
    dataset_id: str
    source: str
    source_url: str
    kind: Literal["player_index", "injuries", "transactions"]
    season: str
    observed_at: datetime
    content_sha256: str
    membership_sha256: str
    parser_version: str
    coverage: dict[str, Any]


class ContextDatasetResponse(BaseModel):
    context: ContextDatasetInfo
    rows: list[dict[str, Any]]
    offset: int
    next_offset: int | None


class ContextCapability(BaseModel):
    name: str
    status: Literal["partial", "available", "not_yet_observed", "source_blocked"]
    dataset: ContextDatasetInfo | None = None
    limitation: str


class ContextCatalogResponse(BaseModel):
    season: str
    known_at: datetime | None
    capabilities: list[ContextCapability]
    attempts: list[dict[str, Any]]


class ReferenceStats(BaseModel):
    season: str
    phase: Literal["regular_season"] = "regular_season"
    release_id: str
    before_date: str
    metrics: dict[str, float | int | None]
    sample_sizes: dict[str, int]


class RosterPlayer(BaseModel):
    player_id: str
    name: str
    team_id: str
    team_tricode: str
    listed_position: str | None
    height_inches: int | None
    weight_pounds: int | None
    roster_status: Literal["active"] = "active"
    reference: ReferenceStats | None = None
    reference_unknown_reason: str | None = None


class ProjectedRosterResponse(BaseModel):
    context: ContextDatasetInfo
    label: str
    reference_season: str
    statistics_release_id: str | None
    current_season_appearances_in_release: int | None
    limitations: list[str] = Field(default_factory=list)
    players: list[RosterPlayer]
