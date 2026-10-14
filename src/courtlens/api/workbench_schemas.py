"""Typed Pydantic schemas for the CourtLens research workbench API."""

from __future__ import annotations

from datetime import date
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field

from courtlens.domain.analytical_ops import (
    CohortSummary,
    ComparePeriodsRequest,
    ComparePeriodsResponse,
    DimensionStats,
    DistributionMeasure,
    DistributionRequest,
    DistributionResponse,
    DistributionSamplePoint,
    DistributionSummary,
    MetricDelta,
    OpponentContextRequest,
    OpponentContextResponse,
    PeerMatchItem,
    PeriodMode,
    PeriodSummary,
    RankOperationItem,
    RankOperationRequest,
    RankOperationResponse,
    SplitBucketSummary,
    SplitProfileRequest,
    SplitProfileResponse,
    SplitType,
    StatisticalPeersRequest,
    StatisticalPeersResponse,
    TargetPlayerProfile,
    TeamDefensiveAllowance,
)
from courtlens.domain.context import (
    CapabilityEntry,
    CapabilityStatus,
    ExternalModelContext,
    FinalizedResearchContext,
    FinancialContext,
    HypotheticalContext,
    LiveContext,
)
from courtlens.domain.personal_state import (
    AggregationMethod,
    BoardAggregationResult,
    CustomViewDefinition,
    ImportConflictMode,
    PersonalWorkspaceState,
    RankingBoardDefinition,
    RankingBoardType,
    RankingEntry,
    TierGroup,
    TierListDefinition,
    WorkspaceBundle,
    WorkspacePreferences,
)
from courtlens.domain.query_spec import (
    EntityKind,
    MetricSelector,
    NormalizationMode,
    PagingSpec,
    PredicateGroup,
    PredicateLeaf,
    PredicateOp,
    QuerySpec,
    SampleFilter,
    SeasonScope,
    SortSpec,
    TeamScope,
    ViewState,
    WindowKind,
    WindowSpec,
)
from courtlens.domain.stats_presentation import StatsCohort, StatsPresentation

__all__ = [
    "AggregateRankingBoardsRequest",
    "AggregationMethod",
    "AssistantAnswer",
    "AssistantQueryRequest",
    "AssistantStatusResponse",
    "AssistantToolCallTrace",
    "BoardAggregationResult",
    "CapabilityEntry",
    "CapabilityStatus",
    "ChartSpec",
    "CohortSummary",
    "ComparePeriodsRequest",
    "ComparePeriodsResponse",
    "CreateCustomViewRequest",
    "CreateJobRequest",
    "CreateRankingBoardRequest",
    "CreateTierListRequest",
    "CustomViewDefinition",
    "DimensionStats",
    "DistributionMeasure",
    "DistributionRequest",
    "DistributionResponse",
    "DistributionSamplePoint",
    "DistributionSummary",
    "EntityKind",
    "EvidenceCellRef",
    "ExplorerQuery",
    "ExternalModelContext",
    "FinalizedResearchContext",
    "FinancialContext",
    "ForecastAccuracyMetrics",
    "ForecastIssuanceDetailResponse",
    "ForecastIssuanceItem",
    "ForecastScoreItem",
    "ForecastsListResponse",
    "ForecastsSummary",
    "HypotheticalContext",
    "ImportConflictMode",
    "ImportWorkspaceRequest",
    "InvestigationDetailResponse",
    "InvestigationReproduceResponse",
    "JobResponse",
    "LineageFactItem",
    "LineageResponse",
    "LiveContext",
    "LookupAvailability",
    "LookupItem",
    "LookupResponse",
    "MetricCatalogResponse",
    "MetricComparisonItem",
    "MetricDefinitionSchema",
    "MetricDelta",
    "MetricSelector",
    "NormalizationMode",
    "OpponentContextRequest",
    "OpponentContextResponse",
    "PagingSpec",
    "PeerMatchItem",
    "PeriodMode",
    "PeriodSummary",
    "PersonalWorkspaceState",
    "PlayerComparisonResponse",
    "PlayerGameLogItem",
    "PlayerGameLogResponse",
    "PlayerProfileResponse",
    "PlayerProfileStint",
    "PlayerResearchItem",
    "PlayerResearchResponse",
    "PlayerSeriesStats",
    "PlayoffBracketResponse",
    "PlayoffGameCard",
    "PlayoffRoundResponse",
    "PlayoffSeedEvidence",
    "PlayoffSeriesDetailResponse",
    "PlayoffSeriesSummary",
    "PointsForecastEvaluationResponse",
    "PredicateGroup",
    "PredicateLeaf",
    "PredicateOp",
    "QueryNormalizationInfo",
    "QuerySpec",
    "RankOperationItem",
    "RankOperationRequest",
    "RankOperationResponse",
    "RankingBoardDefinition",
    "RankingBoardType",
    "RankingEntry",
    "ReorderViewsRequest",
    "ResearchQuerySchema",
    "ResultTable",
    "ResultTableColumn",
    "SampleFilter",
    "SaveInvestigationRequest",
    "SavedInvestigationResponse",
    "SeasonScope",
    "SortSpec",
    "SplitBucketSummary",
    "SplitProfileRequest",
    "SplitProfileResponse",
    "SplitType",
    "StatisticalPeersRequest",
    "StatisticalPeersResponse",
    "SupportedClaim",
    "TargetPlayerProfile",
    "TeamBackToBackSummary",
    "TeamDefensiveAllowance",
    "TeamDetailResponse",
    "TeamFourFactorsResponse",
    "TeamPeerItem",
    "TeamPeersResponse",
    "TeamResearchItem",
    "TeamResearchResponse",
    "TeamRestSplitItem",
    "TeamScheduleGameItem",
    "TeamScheduleResponse",
    "TeamScope",
    "TeamSeriesHeader",
    "TeamSeriesStats",
    "ThreePointVariationResponse",
    "ThreePointVariationScenario",
    "TierGroup",
    "TierListDefinition",
    "UpdateCompareTrayRequest",
    "UpdateCustomViewRequest",
    "UpdateFavoritesRequest",
    "UpdatePreferencesRequest",
    "ViewState",
    "WindowKind",
    "WindowSpec",
    "WorkbenchCatalogResponse",
    "WorkbenchQueryRequest",
    "WorkbenchQueryResponse",
    "WorkbenchStatusResponse",
    "WorkspaceBundle",
    "WorkspacePreferences",
]


class MetricDefinitionSchema(BaseModel):
    key: str
    version: str
    display_name: str
    short_name: str
    category: str
    unit: str
    formula: str
    denominator: str | None = None
    phase_scope: list[str]
    default_sort_direction: str
    limitations: list[str]
    required_fields: list[str] = Field(default_factory=list)
    compatible_normalizations: list[str] = Field(default_factory=list)
    aggregation_recipe: str = "sum"
    validity_definition: str = "valid non-null values"
    aliases: list[str] = Field(default_factory=list)
    capability_requirement: str = "core_stats"
    classification: str = "observed"
    good_direction: str | None = None


class MetricCatalogResponse(BaseModel):
    version: str
    metrics: list[MetricDefinitionSchema]


class StatsScopeSchema(BaseModel):
    season: str
    phase: str
    coverage_start: str
    coverage_end: str
    default_before_date: str


class WorkbenchCatalogResponse(BaseModel):
    release_id: str
    snapshot_id: str
    dataset_id: str
    semantic_signature: str
    mode: str
    source: str
    seasons: list[str]
    phases: list[str]
    stats_scopes: list[StatsScopeSchema] = Field(default_factory=list)
    stats_windows: list[str] = Field(default_factory=list)
    stats_normalizations: list[str] = Field(default_factory=list)
    stats_sort_fields: list[str] = Field(default_factory=list)
    default_season: str
    default_phase: str
    default_before_date: str
    supported_dates: list[str]
    coverage_start: str
    coverage_end: str
    metric_version: str
    published_at: str | None = None
    capabilities: dict[str, Any] = Field(default_factory=dict)
    warnings: list[str]
    impact: dict[str, Any] | None = None
    darko: dict[str, Any] | None = None


class ResearchQuerySchema(BaseModel):
    release_id: str | None = None
    season: str
    phase: str
    before_date: str
    window: str
    team_id: str | None = None
    name: str | None = None
    min_games: int | None = None
    min_minutes: float | None = None
    min_avg_minutes: float | None = None
    sort_metric: str
    sort_direction: str
    limit: int
    cursor: str | None = None


class PlayerBioCurrentTeam(BaseModel):
    """The team the latest NBA player index lists; not the team a season's games belong to."""

    team_id: str
    team_tricode: str | None
    listing_season: str


class PlayerResearchItem(BaseModel):
    player_id: str
    player_name: str
    teams: list[str]
    stints_count: int
    games_played: int
    total_minutes: float
    metrics: dict[str, Any]
    sample_sizes: dict[str, int]
    portrait_url: str | None = None
    percentiles: dict[str, float | None] | None = None
    cohort_sample_sizes: dict[str, int] | None = None
    impact_support: dict[str, Any] | None = None
    table_qualified: bool | None = None
    table_percentiles: dict[str, float | None] | None = None
    table_cohort_sample_sizes: dict[str, int] | None = None
    # Estimated five-position label for the queried season (position-estimates-v1).
    position: Literal["PG", "SG", "SF", "PF", "C"] | None = None
    # Who the player is listed with today (active players); the row's teams stay its games' teams.
    current_team: PlayerBioCurrentTeam | None = None


class DraftClass(BaseModel):
    year: int
    players: int


class DraftClassesResponse(BaseModel):
    source: str = "NBA draft history via the hoopR-nba-stats-raw mirror (CC BY 4.0)"
    classes: list[DraftClass]


class PlayerCareerSeason(BaseModel):
    season: str
    # None when the player has no row in that season's Stats cohort.
    item: PlayerResearchItem | None


class PlayerCareerResponse(BaseModel):
    player_id: str
    release_id: str
    phase: str
    # Covered seasons with observed games, newest first; each ranked against its own league.
    seasons: list[PlayerCareerSeason]
    # Aggregated over the same seasons; season-only joins and ranks stay unknown.
    career: PlayerResearchItem | None


class PlayerSeasonsResponse(BaseModel):
    phase: str
    # Seasons with at least one game row per player, ascending; a missing season is unknown.
    seasons: dict[str, list[str]]


class PlayerResearchResponse(BaseModel):
    context: dict[str, Any]
    query: ResearchQuerySchema | QuerySpec
    total_eligible_players: int
    items: list[PlayerResearchItem]
    next_cursor: str | None = None
    has_more: bool
    warnings: list[str]


class WorkbenchQueryRequest(BaseModel):
    """Read-only typed v2 query execution request."""

    query: QuerySpec
    presentation: StatsPresentation | None = None


class WorkbenchQueryResponse(BaseModel):
    """Response for typed v2 research query execution."""

    context: dict[str, Any]
    query: QuerySpec
    total_eligible_players: int
    total_output_players: int | None = None
    output_offset: int | None = None
    cohort: StatsCohort | None = None
    table_cohort: dict[str, Any] | None = None
    items: list[PlayerResearchItem]
    next_cursor: str | None = None
    has_more: bool
    warnings: list[str] = Field(default_factory=list)
    impact: dict[str, Any] | None = None
    darko: dict[str, Any] | None = None


class ImpactPlayerResponse(BaseModel):
    player_id: str
    player_name: str
    metrics: dict[str, float | None]
    support: dict[str, Any]
    on_off: dict[str, Any]


class ImpactResponse(BaseModel):
    status: Literal["available", "unavailable"]
    source: str
    version: str
    methodology_url: str
    manifest_sha256: str | None
    artifacts: list[dict[str, Any]]
    coverage: list[dict[str, Any]]
    limitations: list[str]
    unavailable_columns: dict[str, str]
    reason: str | None = None
    players: list[ImpactPlayerResponse]
    total_players: int


class ValueArchetypePlayerResponse(BaseModel):
    player_id: str
    player_name: str
    value: dict[str, Any] | None
    value_reason: str | None
    archetype: dict[str, Any] | None
    archetype_reason: str | None


class RosterShapePlayerResponse(BaseModel):
    player_id: str
    player_name: str
    listed_position: str | None
    value: float | None
    value_qualified: bool
    value_percentile: float | None
    reference_minutes: float | None
    reference_games: int | None
    vor: float | None
    archetype: dict[str, Any] | None
    fit: Literal["returning", "new", "unknown"]
    previous_teams: list[str]
    unknown_reasons: list[str]


class RosterShapeTeamResponse(BaseModel):
    team_id: str
    team_tricode: str
    team_name: str
    players: int
    sized_players: int
    below_replacement_players: int
    unknown_players: int
    total_vor: float
    returning_share: float | None
    archetype_mix: list[dict[str, Any]]
    roster: list[RosterShapePlayerResponse]


class RosterShapesResponse(BaseModel):
    version: str
    season: str
    label: str
    projected_note: str
    reference_season: str
    phase: Literal["regular_season"]
    replacement_level: float
    full_season_minutes: int
    capacity: float
    value: dict[str, Any]
    archetypes: dict[str, Any]
    roster_context: dict[str, Any]
    statistics_release_id: str | None
    credit: str
    limitations: list[str]
    teams: list[RosterShapeTeamResponse]


class StatsFeedSource(BaseModel):
    dataset_id: str
    feed: str
    variant: str
    season: str
    season_type: str
    observed_at: str
    upstream_revision: str | None
    content_sha256: str


class StatsFeedScopeView(BaseModel):
    """PC11 envelope shared by the season-level NBA Stats feed views."""

    version: str
    season: str
    phase: Literal["regular_season", "playoffs"]
    label: str
    scopes: list[dict[str, str]]
    source: str
    qualification: dict[str, int]
    limitations: list[str]
    sources: list[StatsFeedSource]


class DefenseViewResponse(StatsFeedScopeView):
    category: str
    categories: list[dict[str, str]]
    matchups_observed: bool
    focus_rule: str | None
    players: list[dict[str, Any]]
    detail: dict[str, Any] | None


class MatchupsViewResponse(StatsFeedScopeView):
    side: Literal["offense", "defense"]
    focus_rule: str | None
    detail: dict[str, Any]


class PlayTypesViewResponse(StatsFeedScopeView):
    side: Literal["offensive", "defensive"]
    focus_player_id: str | None
    focus_rule: str | None
    focus: dict[str, Any] | None
    league: list[dict[str, Any]]
    players: list[dict[str, Any]]


class TrackingViewResponse(StatsFeedScopeView):
    group: str
    groups: list[dict[str, str]]
    columns: list[dict[str, Any]]
    players: list[dict[str, Any]]


class PlayerTrackingResponse(StatsFeedScopeView):
    player_id: str
    observed: bool
    player: dict[str, Any] | None
    groups: list[dict[str, Any]]


class WowyViewResponse(BaseModel):
    version: str
    season: str
    phase: Literal["regular_season", "playoffs"]
    scopes: list[dict[str, str]]
    games: int
    last_game_date: str
    team: dict[str, str]
    teams: list[dict[str, str]]
    players: list[dict[str, Any]]
    team_total: dict[str, Any]
    selected: dict[str, Any] | None
    pairs: list[dict[str, Any]]
    default_rule: str | None
    min_possessions: int
    artifact_sha256: str
    inputs: dict[str, Any]
    source: str
    limitations: list[str]


class PlayerBioDraft(BaseModel):
    year: int
    round: int | None
    pick: int | None
    team_id: str | None
    team_tricode: str | None
    organization: str | None


class PlayerBioCombine(BaseModel):
    draft_year: int
    height_no_shoes_inches: float | None
    height_shoes_inches: float | None
    wingspan_inches: float | None
    standing_reach_inches: float | None
    weight_lbs: float | None


class PlayerBioResponse(BaseModel):
    """Profile header listings as of the page scope; combine values are measured."""

    player_id: str
    season: str
    as_of: date
    listing_source: Literal["season_roster", "player_index"] | None
    jersey: str | None
    listed_position: str | None
    listed_height_inches: int | None
    listed_weight_lbs: float | None
    prior_seasons: int | None
    birth_date: date | None
    age: int | None
    country: str | None
    college: str | None
    draft: PlayerBioDraft | None
    undrafted: bool
    combine: PlayerBioCombine | None
    current_team: PlayerBioCurrentTeam | None = None
    limitations: list[str]


class CombineViewResponse(BaseModel):
    version: str
    source: str
    draft_year: int | None
    draft_years: list[dict[str, int]]
    cohort: dict[str, int]
    default_rule: str | None
    selected_player_id: str | None
    limitations: list[str]
    rows: list[dict[str, Any]]
    sources: list[StatsFeedSource]


class ValueArchetypesResponse(BaseModel):
    status: Literal["available", "unavailable"]
    source: str
    version: str
    methodology_url: str
    manifest_sha256: str | None
    limitations: list[str]
    catalog: list[dict[str, Any]]
    credit: str
    reason: str | None = None
    value: dict[str, Any] | None = None
    evaluation: dict[str, Any] | None = None
    archetypes: dict[str, Any] | None = None
    players: list[ValueArchetypePlayerResponse]
    total_players: int


class PlayerProfileStint(BaseModel):
    team_id: str
    team_tricode: str
    team_name: str
    games_played: int
    metrics: dict[str, Any]


class PlayerProfileResponse(BaseModel):
    sample_sizes: dict[str, dict[str, int]] = Field(default_factory=dict)
    player: dict[str, str]
    context: dict[str, Any]
    summaries: dict[str, Any]
    stints: list[PlayerProfileStint]
    latest_team: dict[str, str] | None = None
    last_observed_date: str | None = None
    forecast_status: dict[str, Any]
    warnings: list[str]


class PlayerGameLogItem(BaseModel):
    game_id: str
    game_date: str
    season: str
    phase: str
    team_id: str
    team_tricode: str
    opponent_id: str
    opponent_tricode: str
    side: str | None = None
    appearance: str
    minutes: float | None = None
    points: int | None = None
    stats: dict[str, Any]
    legacy_fantasy_score: float | None = None
    lineage_ref: str


class PlayerGameLogResponse(BaseModel):
    player: dict[str, str]
    context: dict[str, Any]
    games: list[PlayerGameLogItem]
    next_cursor: str | None = None
    has_more: bool
    warnings: list[str]


class TeamResearchItem(BaseModel):
    team_id: str
    tricode: str
    name: str
    games_played: int
    wins: int
    losses: int
    win_pct: float | None = None
    production: dict[str, Any]
    allowance: dict[str, Any]
    observed_games: int
    exclusions: int
    conference: str | None = None
    division: str | None = None
    ratings: dict[str, Any] | None = None
    four_factors: dict[str, Any] | None = None
    table_percentiles: dict[str, float | None] | None = None
    table_cohort_sample_sizes: dict[str, int] | None = None


class TeamResearchResponse(BaseModel):
    context: dict[str, Any]
    teams: list[TeamResearchItem]
    warnings: list[str]
    order_notice: str
    league_averages: dict[str, Any] | None = None


class TeamDetailResponse(BaseModel):
    team: dict[str, str]
    context: dict[str, Any]
    record: dict[str, Any]
    production: dict[str, Any]
    allowance: dict[str, Any]
    player_cohort: list[dict[str, Any]]
    recent_games: list[dict[str, Any]]
    home_split: dict[str, Any] | None = None
    away_split: dict[str, Any] | None = None
    current_streak: str | None = None
    warnings: list[str]


class TeamScheduleGameItem(BaseModel):
    game_id: str
    game_date: str
    side: str
    opponent_id: str | None = None
    opponent_tricode: str
    opponent_name: str
    team_points: int | None = None
    opponent_points: int | None = None
    differential: int | None = None
    is_win: bool | None = None
    result: str | None = None
    rest_days: int | None = None
    is_back_to_back: bool
    rest_bucket: str
    streak: str | None = None
    venue_streak: str | None = None


class TeamRestSplitItem(BaseModel):
    bucket_key: str
    bucket_label: str
    games_played: int
    wins: int
    losses: int
    win_pct: float | None = None
    ppg: float | None = None
    opp_ppg: float | None = None
    differential: float = 0.0


class BackToBackSplit(BaseModel):
    games: int
    wins: int
    losses: int
    win_pct: float | None = None


class TeamBackToBackSummary(BaseModel):
    second_leg_games: BackToBackSplit
    first_leg_games: BackToBackSplit


class TeamScheduleResponse(BaseModel):
    team: dict[str, str]
    context: dict[str, Any]
    overall_record: dict[str, Any]
    home_split: dict[str, Any]
    away_split: dict[str, Any]
    rest_splits: list[TeamRestSplitItem]
    back_to_back_summary: TeamBackToBackSummary
    longest_homestand: int
    longest_road_trip: int
    games: list[TeamScheduleGameItem]
    warnings: list[str] = Field(default_factory=list)


class FourFactorMetricItem(BaseModel):
    key: str
    display_name: str
    factor: str | None = None
    weight: float | None = None
    value: float | None = None
    league_avg: float | None = None
    rank: int | None = None
    percentile: float | None = None
    total_teams: int = 30
    good_direction: str = "high"
    unit: str = "percentage"
    formula: str = ""


class ThreePointVariationScenario(BaseModel):
    observed_fg3m: float
    observed_fg3a: float
    observed_3p_pct: float
    league_3p_pct: float
    hypothetical_fg3m: float
    delta_points: float
    actual_ppg: float
    hypothetical_ppg: float
    actual_off_rating: float | None = None
    hypothetical_off_rating: float | None = None
    delta_off_rating: float | None = None
    actual_net_rating: float | None = None
    hypothetical_net_rating: float | None = None
    delta_net_rating: float | None = None
    disclaimer: str


class TeamFourFactorsResponse(BaseModel):
    team: dict[str, str]
    context: dict[str, Any]
    games_played: int
    pace: float | None = None
    off_rating: float | None = None
    def_rating: float | None = None
    net_rating: float | None = None
    ratings: list[FourFactorMetricItem]
    offense_factors: list[FourFactorMetricItem]
    defense_factors: list[FourFactorMetricItem]
    shooting_percentages: dict[str, float | None]
    league_averages: dict[str, float]
    three_point_scenario: ThreePointVariationScenario
    warnings: list[str] = Field(default_factory=list)


class TeamPeerItem(BaseModel):
    team_id: str
    tricode: str
    name: str
    city: str = ""
    conference: str = ""
    distance: float
    similarity_score: float
    dimension_diffs: dict[str, Any] = Field(default_factory=dict)


class TeamPeersResponse(BaseModel):
    team: dict[str, str]
    context: dict[str, Any]
    peers: list[TeamPeerItem]
    dimensions_used: list[str]
    warnings: list[str] = Field(default_factory=list)


class ThreePointVariationResponse(BaseModel):
    team: dict[str, str]
    context: dict[str, Any]
    scenario: ThreePointVariationScenario
    warnings: list[str] = Field(default_factory=list)


class MetricComparisonItem(BaseModel):
    metric: str
    display_name: str
    unit: str
    value_a: Any
    value_b: Any
    diff: float | None = None
    n_a: int
    n_b: int


class PlayerComparisonResponse(BaseModel):
    context: dict[str, Any]
    player_a: dict[str, Any]
    player_b: dict[str, Any]
    aligned_metrics: list[MetricComparisonItem]
    no_forced_winner_notice: str
    warnings: list[str]


class LineageFactItem(BaseModel):
    kind: str
    fact_id: str
    game_id: str
    game_date: str
    source_version_id: str
    source_observation_id: str


class LineageResponse(BaseModel):
    release_id: str
    dataset_id: str
    semantic_signature: str
    source_namespace: str
    contributing_facts: list[LineageFactItem]
    transform_path: list[str]
    warnings: list[str]


class SaveInvestigationRequest(BaseModel):
    title: str = Field(..., min_length=1, max_length=255)
    query: dict[str, Any]


class SavedInvestigationResponse(BaseModel):
    id: str
    title: str
    manifest_sha256: str
    result_sha256: str
    query: dict[str, Any]
    context: dict[str, Any]
    metric_version: str
    total_rows: int
    created_at: str


class InvestigationDetailResponse(BaseModel):
    id: str
    title: str
    manifest_sha256: str
    result_sha256: str
    query: dict[str, Any]
    context: dict[str, Any]
    metric_version: str
    total_rows: int
    results: list[dict[str, Any]]
    created_at: str


class InvestigationReproduceResponse(BaseModel):
    id: str
    reproducible: bool
    saved_result_sha256: str
    recomputed_result_sha256: str
    match: bool
    reason: str | None = None


class CreateJobRequest(BaseModel):
    job_type: str = Field(..., alias="jobType")
    arguments: dict[str, Any] = Field(default_factory=dict)


class JobResponse(BaseModel):
    job_id: str
    job_type: str
    status: str
    stage: str | None = None
    owner: str | None = None
    started_at: str | None = None
    finished_at: str | None = None
    heartbeat_at: str | None = None
    timings: dict[str, Any] = Field(default_factory=dict)
    output_refs: dict[str, Any] = Field(default_factory=dict)
    error_summary: str | None = None
    created_at: str


class WorkbenchStatusResponse(BaseModel):
    status: str
    release: dict[str, Any]
    source: dict[str, Any]
    worker: dict[str, Any]
    capabilities: dict[str, Any]


class PointsForecastEvaluationResponse(BaseModel):
    available: bool
    run_id: str | None = None
    task: str | None = None
    limitations: list[str] = Field(default_factory=list)
    active_policy: dict[str, Any] | None = None
    promotion: dict[str, Any] | None = None
    final_test: dict[str, Any] | None = None
    validation: dict[str, Any] | None = None
    calibration: dict[str, Any] | None = None
    model_card_markdown: str | None = None
    message: str | None = None


class ForecastScoreItem(BaseModel):
    id: str
    issuance_id: str
    observed_points: int | None = None
    scored_at: str
    scoring_policy_id: str
    outcome_observation_id: str | None = None
    absolute_error: float | None = None
    interval_hit: bool | None = None
    score_status: str
    reason: str | None = None


class ForecastIssuanceItem(BaseModel):
    id: str
    policy_id: str
    player_id: str
    player_name: str
    team_id: str
    team_tricode: str
    target_game_id: str
    target_game_date: str
    target_opponent_id: str
    target_opponent_tricode: str
    issued_at_utc: str
    dataset_id: str
    features_hash: str
    point_estimate: float
    interval_lower: float
    interval_upper: float
    availability_reason: str | None = None
    issuance_status: str
    latest_score: ForecastScoreItem | None = None


class ForecastIssuanceDetailResponse(BaseModel):
    id: str
    policy_id: str
    player_id: str
    player_name: str
    team_id: str
    team_tricode: str
    target_game_id: str
    target_game_date: str
    target_opponent_id: str
    target_opponent_tricode: str
    issued_at_utc: str
    dataset_id: str
    features_hash: str
    point_estimate: float
    interval_lower: float
    interval_upper: float
    availability_reason: str | None = None
    issuance_status: str
    features_json: dict[str, Any]
    schedule_evidence_json: dict[str, Any]
    team_evidence_json: dict[str, Any]
    scores: list[ForecastScoreItem] = Field(default_factory=list)


class ForecastAccuracyMetrics(BaseModel):
    scored_count: int
    mae: float | None = None
    interval_coverage: float | None = None


class ForecastsSummary(BaseModel):
    total_issued: int
    total_scored: int
    total_pending: int
    total_unscored_dnp: int
    total_unscored_cancelled: int
    prospective_accuracy_status: str
    accuracy_metrics: ForecastAccuracyMetrics | None = None
    active_policy: dict[str, Any] | None = None
    message: str | None = None


class ForecastsListResponse(BaseModel):
    items: list[ForecastIssuanceItem]
    summary: ForecastsSummary
    page: int
    page_size: int
    total_items: int
    warnings: list[str] = Field(default_factory=list)


class AssistantQueryRequest(BaseModel):
    question: str = Field(..., min_length=1, max_length=2000)
    context: dict[str, Any] | None = None


class AssistantStatusResponse(BaseModel):
    configured: bool
    model: str
    provider: str = "gemini"
    limited_mode: bool = True
    prompt_version: str | None = None
    limits: dict[str, Any]
    allowed_tools: list[str]
    privacy_notice: str
    setup_instructions: str


class EvidenceCellRef(BaseModel):
    ref_id: str
    entity_type: str
    entity_id: str
    entity_name: str
    field_name: str
    metric: str | None = None
    raw_value: Any = None
    formatted_value: str
    source_tool: str


class SupportedClaim(BaseModel):
    statement: str
    evidence_ref_ids: list[str] = Field(default_factory=list)
    subject: str | None = None
    metric: str | None = None
    verified_value: Any = None
    unit: str | None = None


class ResultTableColumn(BaseModel):
    key: str
    label: str
    unit: str | None = None
    align: str = "left"


class ResultTable(BaseModel):
    title: str
    columns: list[ResultTableColumn]
    rows: list[dict[str, Any]]
    row_count: int


class ChartSpec(BaseModel):
    chart_type: str = "bar"
    title: str
    x_metric: str
    y_metric: str
    series: list[dict[str, Any]] = Field(default_factory=list)


class ExplorerQuery(BaseModel):
    view: str
    params: dict[str, str] = Field(default_factory=dict)
    target_url: str


class AssistantToolCallTrace(BaseModel):
    round: int
    tool_name: str
    arguments: dict[str, Any] = Field(default_factory=dict)
    status: str
    result_summary: str
    execution_ms: float


class AssistantAnswer(BaseModel):
    status: str
    resolved_context: dict[str, Any]
    interpretation: str
    tool_trace: list[AssistantToolCallTrace] = Field(default_factory=list)
    evidence_refs: list[EvidenceCellRef] = Field(default_factory=list)
    result_tables: list[ResultTable] = Field(default_factory=list)
    chart_specs: list[ChartSpec] = Field(default_factory=list)
    supported_claims: list[SupportedClaim] = Field(default_factory=list)
    limitations: list[str] = Field(default_factory=list)
    explorer_query: ExplorerQuery | None = None
    narrative: str | None = None
    reproducible_manifest: dict[str, Any] | None = None
    error_detail: str | None = None


class QueryNormalizationInfo(BaseModel):
    raw: str
    normalized: str
    tokens: list[str] = Field(default_factory=list)
    version: str = "v1"


class LookupAvailability(BaseModel):
    has_current_season: bool = True
    status: str = "available"
    seasons: list[str] = Field(default_factory=list)
    latest_team_id: str | None = None
    latest_tricode: str | None = None
    conference: str | None = None
    division: str | None = None


class LookupTeamAssociation(BaseModel):
    basis: Literal["selected_scope", "last_observed"]
    teams: list[str] = Field(default_factory=list)
    observed_through: date | None = None
    season: str | None = None
    phase: str | None = None
    before_date: date | None = None


class LookupItem(BaseModel):
    id: str
    kind: str
    canonical_id: str
    display_name: str
    subtitle: str | None = None
    match_basis: str
    match_score: float
    matched_alias: str | None = None
    portrait_url: str | None = None
    portrait_fallback: str | None = None
    availability: LookupAvailability = Field(default_factory=LookupAvailability)
    team_association: LookupTeamAssociation | None = None
    destination_url: str
    metadata: dict[str, Any] = Field(default_factory=dict)


class LookupResponse(BaseModel):
    query: QueryNormalizationInfo
    catalog_version: str = "v1"
    release_id: str | None = None
    season: str | None = None
    total_matches: int
    items: list[LookupItem]
    latency_ms: float | None = None


# ---------------------------------------------------------------------------
# Personal Workspace State Persistence Request Schemas (Block B08)
# ---------------------------------------------------------------------------


class CreateCustomViewRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    metric_version: Literal["v2", "courtlens-stats-v3", "courtlens-stats-v4"] = "v2"

    unavailable_columns: list[str] = Field(default_factory=list)

    name: str = Field(min_length=1, max_length=100)
    columns: list[str] = Field(default_factory=list)
    sort_field: str | None = None
    sort_direction: Literal["asc", "desc"] = "desc"
    is_default: bool = False


class UpdateCustomViewRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    metric_version: Literal["v2", "courtlens-stats-v3", "courtlens-stats-v4"] | None = None

    unavailable_columns: list[str] | None = None

    name: str | None = Field(default=None, min_length=1, max_length=100)
    columns: list[str] | None = None
    sort_field: str | None = None
    sort_direction: Literal["asc", "desc"] | None = None
    is_default: bool | None = None


class ReorderViewsRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    ordered_view_ids: list[str]


class UpdateFavoritesRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    favorites: list[str] = Field(default_factory=list)


class UpdateCompareTrayRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    compare_tray: list[str] = Field(default_factory=list)


class CreateRankingBoardRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    title: str = Field(min_length=1, max_length=200)
    board_type: RankingBoardType = "overall"
    scope: dict[str, Any] | None = None
    notes: str | None = None
    entries: list[RankingEntry] = Field(default_factory=list)


class AggregateRankingBoardsRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    board_ids: list[str]
    method: AggregationMethod = "borda"
    missing_rank_penalty: int | None = Field(default=None, ge=1)


class CreateTierListRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    title: str = Field(min_length=1, max_length=200)
    description: str | None = None
    tiers: list[TierGroup] = Field(default_factory=list)


class UpdatePreferencesRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    density: Literal["compact", "standard", "expanded"] | None = None
    identity_mode: Literal["photos", "logos", "initials", "none"] | None = None
    counting_mode: Literal["per_game", "raw", "per_36", "per_75", "per_100"] | None = None
    default_view_id: str | None = None
    table_expanded: bool | None = None
    theme: str | None = None


class ImportWorkspaceRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    bundle: WorkspaceBundle
    mode: ImportConflictMode = "replace"


# ---------------------------------------------------------------------------
# Measurements, Draft, Crosswalk, and Backfill Schemas (Block B14)
# ---------------------------------------------------------------------------


class PlayerMeasurementItem(BaseModel):
    player_id: str
    display_name: str
    measurement_type: str
    source_name: str
    draft_year: int | None = None
    pick_overall: int | None = None
    drafting_team_id: str | None = None
    height_no_shoes_inches: float | None = None
    height_shoes_inches: float | None = None
    wingspan_inches: float | None = None
    standing_reach_inches: float | None = None
    weight_lbs: float | None = None
    body_fat_pct: float | None = None
    wingspan_to_height_ratio: float | None = None


class MeasurementsQueryResponse(BaseModel):
    items: list[PlayerMeasurementItem]
    count: int
    disclaimer: str


class PlayerCombineDetail(BaseModel):
    draft_year: int | None = None
    height_no_shoes_inches: float | None = None
    height_shoes_inches: float | None = None
    wingspan_inches: float | None = None
    standing_reach_inches: float | None = None
    weight_lbs: float | None = None
    body_fat_pct: float | None = None
    standing_vertical_inches: float | None = None
    max_vertical_inches: float | None = None
    lane_agility_seconds: float | None = None
    three_quarter_sprint_seconds: float | None = None
    wingspan_to_height_ratio: float | None = None
    source_attribution: str


class PlayerListedDetail(BaseModel):
    season: str | None = None
    height_shoes_inches: float | None = None
    weight_lbs: float | None = None
    source_attribution: str


class PlayerDraftDetail(BaseModel):
    draft_year: int
    round_number: int | None = None
    pick_overall: int | None = None
    drafting_team_id: str | None = None
    drafting_team_name: str | None = None
    draft_type: str
    college_or_prior_team: str | None = None


class PlayerMeasurementsDetailResponse(BaseModel):
    player_id: str
    display_name: str
    has_measurements: bool
    combine: PlayerCombineDetail | None = None
    listed: PlayerListedDetail | None = None
    draft: PlayerDraftDetail | None = None
    disclaimer: str


class CrosswalkItem(BaseModel):
    source_namespace: str
    source_id: str
    target_namespace: str
    target_id: str
    kind: str
    confidence: str
    mapping_method: str
    evidence: dict[str, Any] = Field(default_factory=dict)


class CrosswalkResponse(BaseModel):
    item: CrosswalkItem | None = None
    resolved: bool


class BackfillStatusResponse(BaseModel):
    range: list[int]
    total_seasons: int
    imported_count: int
    acquired_count: int
    pending_count: int
    imported_years: list[int] = Field(default_factory=list)
    acquired_years: list[int] = Field(default_factory=list)
    pending_years: list[int] = Field(default_factory=list)


# --- Block B17: Playoff / Series Schemas ---


class PlayoffSeedEvidence(BaseModel):
    team_id: str
    tricode: str
    team_name: str
    conference: str
    seed: int
    wins: int
    losses: int
    win_pct: float
    is_tied: bool
    tie_note: str | None = None
    source_label: str = "reconstructed_regular_season_standings"


class TeamSeriesHeader(BaseModel):
    team_id: str
    tricode: str
    name: str
    seed: int | None = None
    wins: int = 0


class PlayoffSeriesSummary(BaseModel):
    series_id: str
    slug: str
    season: str
    round_number: int
    round_name: str
    conference: str | None = None
    matchup_index: int
    team1: TeamSeriesHeader
    team2: TeamSeriesHeader
    series_score: str
    status: str
    winner_team_id: str | None = None
    winner_tricode: str | None = None
    games_count: int
    total_scheduled: int = 7
    is_sweep: bool = False
    summary_text: str


class PlayoffRoundResponse(BaseModel):
    round_number: int
    round_name: str
    eastern_series: list[PlayoffSeriesSummary] = Field(default_factory=list)
    western_series: list[PlayoffSeriesSummary] = Field(default_factory=list)
    finals_series: list[PlayoffSeriesSummary] = Field(default_factory=list)
    series: list[PlayoffSeriesSummary] = Field(default_factory=list)


class PlayoffBracketResponse(BaseModel):
    season: str
    season_year: int
    cutoff_date: str | None = None
    rounds: list[PlayoffRoundResponse]
    seeds: dict[str, list[PlayoffSeedEvidence]]
    capabilities: dict[str, str] = Field(default_factory=dict)
    disclaimers: list[str] = Field(default_factory=list)


class PlayoffGameCard(BaseModel):
    game_id: str
    game_number: int
    game_date: str | None = None
    home_team_id: str
    home_team_tricode: str
    away_team_id: str
    away_team_tricode: str
    home_score: int | None = None
    away_score: int | None = None
    status: str  # "final", "scheduled", "unplayed_placeholder"
    venue: str | None = None
    winner_team_id: str | None = None
    margin: int | None = None


class TeamSeriesStats(BaseModel):
    team_id: str
    tricode: str
    team_name: str
    seed: int | None = None
    wins: int
    losses: int
    games_played: int
    points_per_game: float | None = None
    opponent_points_per_game: float | None = None
    average_margin: float | None = None
    pace: float | None = None
    off_rating: float | None = None
    def_rating: float | None = None
    net_rating: float | None = None
    efg_pct: float | None = None
    tov_pct: float | None = None
    oreb_pct: float | None = None
    ftr: float | None = None
    totals: dict[str, Any] = Field(default_factory=dict)


class PlayerSeriesStats(BaseModel):
    player_id: str
    player_name: str
    team_id: str
    team_tricode: str
    games_played: int
    games_started: int | None = None
    minutes_total_seconds: int
    minutes_per_game: float
    points_total: int
    points_per_game: float
    rebounds_total: int
    rebounds_per_game: float
    offensive_rebounds: int
    defensive_rebounds: int
    assists_total: int
    assists_per_game: float
    steals_total: int
    steals_per_game: float
    blocks_total: int
    blocks_per_game: float
    turnovers_total: int
    turnovers_per_game: float
    fouls_total: int
    fouls_per_game: float
    fgm: int
    fga: int
    fg_pct: float | None = None
    fg3m: int
    fg3a: int
    fg3_pct: float | None = None
    ftm: int
    fta: int
    ft_pct: float | None = None
    efg_pct: float | None = None
    ts_pct: float | None = None


class PlayoffSeriesDetailResponse(BaseModel):
    series_id: str
    slug: str
    season: str
    season_year: int
    round_number: int
    round_name: str
    conference: str | None = None
    matchup_index: int
    status: str
    series_score: str
    winner_team_id: str | None = None
    winner_tricode: str | None = None
    cutoff_date: str | None = None
    team1: TeamSeriesStats
    team2: TeamSeriesStats
    game_cards: list[PlayoffGameCard] = Field(default_factory=list)
    team1_players: list[PlayerSeriesStats] = Field(default_factory=list)
    team2_players: list[PlayerSeriesStats] = Field(default_factory=list)
    capabilities: dict[str, str] = Field(default_factory=dict)
    disclaimers: list[str] = Field(default_factory=list)


class ScheduleDateCount(BaseModel):
    date: date
    scheduled: int | None
    finals: int | None


class NearestGameDates(BaseModel):
    before: date | None
    after: date | None


class ScheduleDatesResponse(BaseModel):
    """Per-date counts from a release's retained schedule and admitted finals (FO08)."""

    release_id: str
    dataset_id: str
    start: date
    end: date
    phase: str | None
    before_date: date | None
    focus: date
    days: list[ScheduleDateCount]
    nearest_scheduled: NearestGameDates
    nearest_finals: NearestGameDates
    warnings: list[str] = Field(default_factory=list)
