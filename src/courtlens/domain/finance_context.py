"""Strict, independent PC06 source observations; no inferred cap compliance."""

from datetime import date, datetime
from typing import Literal, Self

from pydantic import Field, model_validator

from courtlens.domain.finance import StrictModel
from courtlens.domain.finance_query import QueryModel, Status
from courtlens.ingestion.player_context import valid_season


class ThresholdInput(StrictModel):
    schema_version: Literal["finance-thresholds-v1"] = "finance-thresholds-v1"
    season: str
    source_url: str
    effective_date: date
    cap_cents: str = Field(pattern=r"^[0-9]{1,14}$")
    tax_cents: str = Field(pattern=r"^[0-9]{1,14}$")
    first_apron_cents: str = Field(pattern=r"^[0-9]{1,14}$")
    second_apron_cents: str = Field(pattern=r"^[0-9]{1,14}$")
    minimum_cents: str = Field(pattern=r"^[0-9]{1,14}$")
    capture_method: Literal["manual_official_release"] = "manual_official_release"

    @model_validator(mode="after")
    def semantics(self) -> Self:
        valid_season(self.season)
        if self.source_url != f"https://www.nba.com/news/nba-salary-cap-{self.season}-season":
            raise ValueError("thresholds require the official season release URL")
        if self.effective_date != date(int(self.season[:4]), 7, 1):
            raise ValueError("thresholds require the documented season start")
        values = [
            int(getattr(self, key))
            for key in (
                "minimum_cents",
                "cap_cents",
                "tax_cents",
                "first_apron_cents",
                "second_apron_cents",
            )
        ]
        if values != sorted(set(values)) or values[0] <= 0:
            raise ValueError("threshold amounts must be positive and strictly ordered")
        return self


class ThresholdInfo(ThresholdInput):
    threshold_id: str
    observed_at: datetime
    content_sha256: str
    attribution: Literal["NBA"] = "NBA"
    limitation: str = "Official markers only; no exact cap room, tax or apron compliance claim."


class SalaryCoverage(QueryModel):
    player_id: str
    name: str
    team_id: str
    salary_cents: str | None
    unknown_reason: str | None
    source: str | None
    source_url: str | None
    source_sha256: str | None
    source_locator: str | None
    effective_date: date | None = None
    option: Literal["player", "team"] | None = None
    option_state: None = None


class FreeAgentEntry(QueryModel):
    player_id: str | None
    identity_reason: str | None
    provider_id: str
    name: str
    class_year: int
    free_agent_type: Literal["UFA", "RFA"] | None
    previous_team_id: str | None
    new_team_id: str | None
    status: Status
    status_label: str
    average_value_cents: str | None
    total_value_cents: str | None
    observed_at: datetime
    effective_date: date | None = None
    source_url: str
    source_sha256: str
    source_locator: str


class FinanceAttempt(QueryModel):
    acquisition_id: str
    source: str
    source_url: str
    status: str
    http_status: int | None
    reason: str | None
    observed_at: datetime


class RefreshInfo(QueryModel):
    refresh_id: str
    season: str
    roster_dataset_id: str
    threshold_id: str | None
    book_id: str | None
    observed_at: datetime
    content_sha256: str
    parser_version: str
    expected_players: int
    salary_observed_players: int
    unknown_players: int
    state: Literal["partial", "verification_blocked"]
    coverage: tuple[SalaryCoverage, ...]
    free_agents: tuple[FreeAgentEntry, ...]
    attempts: tuple[FinanceAttempt, ...]
    unresolved_source_rows: int
    limitations: tuple[str, ...]
