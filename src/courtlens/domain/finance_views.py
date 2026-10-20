"""PC08 read-only Contracts views over one pinned finance refresh; no inferred cap claims."""

from datetime import datetime
from typing import Literal

from courtlens.domain.finance_context import ThresholdInfo
from courtlens.domain.finance_query import QueryModel

PositionGroup = Literal["G", "F", "C", "unlisted"]


class ContractSeason(QueryModel):
    season: str
    salary_cents: str | None
    option: Literal["player", "team"] | None = None


class ReferenceImpact(QueryModel):
    """Prior-season references attached to a current roster; not forecasts."""

    season: str
    games: int | None
    minutes_per_game: float | None
    points_per_game: float | None
    rebounds_per_game: float | None
    assists_per_game: float | None
    rapm: float | None


class TeamContractPlayer(QueryModel):
    player_id: str
    name: str
    on_index_roster: bool
    listed_position: str | None
    position_group: PositionGroup
    current_salary_cents: str | None
    unknown_reason: str | None
    remaining_guaranteed_cents: str | None
    seasons: tuple[ContractSeason, ...]
    source_url: str | None
    source_locator: str | None
    reference: ReferenceImpact | None
    # DARKO's latest board (Small vs Big): its market value in whole dollars and its DPM.
    darko_value_dollars: int | None = None
    darko_dpm: float | None = None


class DarkoValueContext(QueryModel):
    """The sealed DARKO board the market values come from; never a CourtLens estimate."""

    season: str
    as_of: str
    data_date: str
    source: str
    raw_sha256: str


class RefreshContext(QueryModel):
    refresh_id: str
    season: str
    observed_at: datetime
    # When the daily refresh last confirmed this is still the newest contracts data.
    checked_at: datetime | None = None
    state: Literal["partial", "verification_blocked"]
    book_id: str | None
    roster_dataset_id: str
    thresholds: ThresholdInfo | None
    source: str = "Basketball-Reference contracts pages; NBA player index; NBA salary cap release"
    label: str


class TeamContractsResponse(QueryModel):
    context: RefreshContext
    team_id: str
    team_tricode: str
    team_name: str
    seasons: tuple[str, ...]
    roster_players: int
    roster_known_players: int
    roster_known_cents: str
    other_source_rows: int
    other_source_known_cents: str
    source_page_known_cents: str
    players: tuple[TeamContractPlayer, ...]
    reference_season: str
    statistics_release_id: str | None
    impact_version: str | None
    darko: DarkoValueContext | None = None
    limitations: tuple[str, ...]


class TeamPayroll(QueryModel):
    team_id: str
    team_tricode: str
    team_name: str
    roster_players: int
    roster_known_players: int
    source_page_known_cents: str
    other_source_rows: int
    top_player_name: str | None
    top_salary_cents: str | None


class LeaguePayrollResponse(QueryModel):
    context: RefreshContext
    teams: tuple[TeamPayroll, ...]
    expected_players: int
    salary_observed_players: int
    unresolved_source_rows: int
    limitations: tuple[str, ...]
