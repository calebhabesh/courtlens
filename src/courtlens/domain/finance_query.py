"""Versioned financial context, independent of basketball releases and model ratings."""

from datetime import date, datetime
from typing import Literal, Self
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from courtlens.domain.finance import AmountKind, FinanceRow, SourceEvidence
from courtlens.domain.teams import NBA_TEAMS

Status = Literal["unknown_review", "unsigned", "signed", "returned", "option_pending", "two_way"]
STATUSES: tuple[Status, ...] = (
    "unknown_review",
    "unsigned",
    "signed",
    "returned",
    "option_pending",
    "two_way",
)
SeasonalKind = Literal["base_salary", "cash", "cap_hit", "cap_hold", "dead_money", "tax_component"]


class QueryModel(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)


class FinanceQuery(QueryModel):
    operation_version: Literal["finance-query-v1"] = "finance-query-v1"
    book_id: UUID
    financial_season: str = Field(pattern=r"^20\d{2}-\d{2}$")
    known_at: datetime
    effective_on: date
    unknown_dates: Literal["include_labelled", "exclude"] = "include_labelled"
    team_id: str | None = None
    player_ids: tuple[str, ...] = Field(default=(), max_length=100)
    statuses: tuple[Status, ...] = Field(default=(), max_length=6)
    amount_kind: SeasonalKind = "base_salary"
    small_big_threshold_cents: int = Field(default=1_200_000_000, ge=0, le=99_999_999_999_999)
    scenario: Literal["reported-v1", "include-unexercised-options-v1"] = "reported-v1"

    @field_validator("known_at")
    @classmethod
    def aware(cls, value: datetime) -> datetime:
        if value.tzinfo is None or value.utcoffset() is None:
            raise ValueError("timezone-aware known_at required")
        return value

    @model_validator(mode="after")
    def semantics(self) -> Self:
        if (int(self.financial_season[:4]) + 1) % 100 != int(self.financial_season[-2:]):
            raise ValueError("financial season must be consecutive")
        if self.team_id is not None and self.team_id not in NBA_TEAMS:
            raise ValueError("canonical NBA team required")
        if len(set(self.player_ids)) != len(self.player_ids) or any(
            not p.isdigit() or len(p) > 12 for p in self.player_ids
        ):
            raise ValueError("distinct canonical player IDs required")
        if len(set(self.statuses)) != len(self.statuses):
            raise ValueError("duplicate statuses")
        return self


class FinancialObservation(QueryModel):
    observation_id: str
    origin_book_id: str
    content_sha256: str
    supersedes_id: str | None
    temporal_label: Literal["dated_report", "unknown_effective_date", "future_effective"]
    terms: FinanceRow
    source: SourceEvidence


class ContractResult(QueryModel):
    player_id: str
    contract_id: str
    team_id: str | None
    team_status: Literal["explicit", "unknown", "conflicting"]
    status: Status
    status_scope: Literal["source_book_contract_observation"] = "source_book_contract_observation"
    observations: tuple[FinancialObservation, ...]
    scenario_amount_cents: str | None
    known_amount_cents: str | None
    amount_status: Literal["known", "missing", "unknown", "unknown_date", "conditional", "declined"]
    size_group: Literal["small", "big", "unknown"]
    derived_aav_usd: str | None
    aav_definition: str = "reported total / documented years; not seasonal salary"


class FinancialSubtotal(QueryModel):
    amount_kind: AmountKind
    scenario_subtotal_cents: str | None
    scenario_contracts: int
    known_subtotal_cents: str | None
    expected_book_contracts: int
    known_contracts: int
    unknown_contracts: int
    known_player_ids: tuple[str, ...]
    unknown_player_ids: tuple[str, ...]
    expected_roster_identities: None = None
    coverage: Literal["bounded_book_incomplete"] = "bounded_book_incomplete"
    threshold_status: Literal["threshold_status_pending"] = "threshold_status_pending"
    position_allocations_cents: dict[str, str | None]


class FinanceResult(QueryModel):
    operation_version: Literal["finance-query-v1"] = "finance-query-v1"
    context: FinanceQuery
    book_sha256: str
    coverage_note: str
    source_scope: Literal["historical_source_observations_not_current_market"] = (
        "historical_source_observations_not_current_market"
    )
    timeline: tuple[FinancialObservation, ...]
    historical_reconstruction: bool
    subtotal: FinancialSubtotal
    contracts: tuple[ContractResult, ...]
    status_groups_unfiltered: dict[Status, int]
    status_groups_filtered: dict[Status, int]
    unfiltered_contract_count: int
    filtered_contract_count: int
    excluded_observations: dict[str, int]
    external_value_status: Literal["source_blocked"] = "source_blocked"
    limitations: tuple[str, ...]
    analytical_content_sha256: str
    result_sha256: str
