"""Canonical context definitions, temporal boundaries, and capability metadata."""

from __future__ import annotations

from datetime import date, datetime
from enum import StrEnum
from typing import Any, Literal
from zoneinfo import ZoneInfo

from pydantic import BaseModel, ConfigDict, Field

NY_TZ = ZoneInfo("America/New_York")


class CapabilityStatus(StrEnum):
    AVAILABLE = "available"
    PARTIAL = "partial"
    SOURCE_BLOCKED = "source_blocked"
    NOT_CONFIGURED = "not_configured"
    NOT_YET_OBSERVED = "not_yet_observed"
    NOT_IMPLEMENTED = "not_implemented"


class CapabilityEntry(BaseModel):
    """Metadata describing an analytical capability and its data readiness."""

    model_config = ConfigDict(frozen=True)

    name: str
    status: CapabilityStatus
    seasons: list[str] = Field(default_factory=list)
    phases: list[str] = Field(default_factory=list)
    coverage_start: date | None = None
    coverage_end: date | None = None
    expected_grains: list[str] = Field(default_factory=list)
    metric_requirements: list[str] = Field(default_factory=list)
    source_freshness: str | None = None
    limitations: list[str] = Field(default_factory=list)


class FinalizedResearchContext(BaseModel):
    """Fully resolved research context binding release, dataset, and temporal boundaries."""

    model_config = ConfigDict(frozen=True)

    release_id: str
    snapshot_id: str
    dataset_id: str
    dataset_type: Literal["archive", "workbench"]
    semantic_signature: str
    mode: str
    source: str
    season: str
    seasons: list[str] = Field(default_factory=list)
    phase: str
    phases: list[str] = Field(default_factory=list)
    before_date: date  # Exclusive upper bound in America/New_York
    lower_date: date | None = None  # Optional inclusive lower bound
    cutoff_utc: str
    window: str
    coverage_start: date
    coverage_end: date
    default_before_date: date
    supported_dates: list[str] = Field(default_factory=list)
    metric_version: str = "v1"
    published_at: str | None = None
    capabilities: dict[str, CapabilityEntry] = Field(default_factory=dict)
    warnings: list[str] = Field(default_factory=list)

    def to_dict(self) -> dict[str, Any]:
        return {
            "release_id": self.release_id,
            "snapshot_id": self.snapshot_id,
            "dataset_id": self.dataset_id,
            "dataset_type": self.dataset_type,
            "semantic_signature": self.semantic_signature,
            "mode": self.mode,
            "source": self.source,
            "season": self.season,
            "seasons": list(self.seasons),
            "phase": self.phase,
            "phases": list(self.phases),
            "before_date": self.before_date.isoformat(),
            "lower_date": self.lower_date.isoformat() if self.lower_date else None,
            "cutoff_utc": self.cutoff_utc,
            "window": self.window,
            "coverage_start": self.coverage_start.isoformat(),
            "coverage_end": self.coverage_end.isoformat(),
            "default_before_date": self.default_before_date.isoformat(),
            "supported_dates": list(self.supported_dates),
            "metric_version": self.metric_version,
            "published_at": self.published_at,
            "capabilities": {k: v.model_dump(mode="json") for k, v in self.capabilities.items()},
            "warnings": list(self.warnings),
        }


class ExternalModelContext(BaseModel):
    """Context for external model outputs (e.g. DARKO, external ratings)."""

    model_config = ConfigDict(frozen=True)

    provider: str
    model_name: str
    output_version: str
    effective_date: date
    observed_at: datetime
    research_context: FinalizedResearchContext | None = None


class FinancialContext(BaseModel):
    """Context for financial operations, contracts, and payroll queries."""

    model_config = ConfigDict(frozen=True)

    release_id: str
    financial_season: str
    effective_date: date
    known_at_boundary: datetime | None = None
    amount_types: list[str] = Field(default_factory=lambda: ["base_salary", "cap_hit"])
    rule_version: str = "cba-2023"
    coverage: dict[str, Any] = Field(default_factory=dict)


class LiveContext(BaseModel):
    """Context for provisional live scoreboard and in-game observations."""

    model_config = ConfigDict(frozen=True)

    provider: str
    slate_date: date
    observation_id: str
    observed_at: datetime
    status: str
    is_provisional: bool = True


class HypotheticalContext(BaseModel):
    """Context for hypothetical scenarios and what-if calculations."""

    model_config = ConfigDict(frozen=True)

    factual_context: FinalizedResearchContext
    scenario_version: str
    assumption_vector: dict[str, Any] = Field(default_factory=dict)
