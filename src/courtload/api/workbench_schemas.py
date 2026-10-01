"""Typed Pydantic schemas for the CourtLoad research workbench API."""

from __future__ import annotations

from typing import Any

from pydantic import BaseModel, Field


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


class MetricCatalogResponse(BaseModel):
    version: str
    metrics: list[MetricDefinitionSchema]


class WorkbenchCatalogResponse(BaseModel):
    release_id: str
    snapshot_id: str
    dataset_id: str
    semantic_signature: str
    mode: str
    source: str
    seasons: list[str]
    phases: list[str]
    default_season: str
    default_phase: str
    default_before_date: str
    supported_dates: list[str]
    coverage_start: str
    coverage_end: str
    metric_version: str
    published_at: str | None = None
    warnings: list[str]


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


class PlayerResearchResponse(BaseModel):
    context: dict[str, Any]
    query: ResearchQuerySchema
    total_eligible_players: int
    items: list[PlayerResearchItem]
    next_cursor: str | None = None
    has_more: bool
    warnings: list[str]


class PlayerProfileStint(BaseModel):
    team_id: str
    team_tricode: str
    team_name: str
    games_played: int
    metrics: dict[str, Any]


class PlayerProfileResponse(BaseModel):
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


class TeamResearchResponse(BaseModel):
    context: dict[str, Any]
    teams: list[TeamResearchItem]
    warnings: list[str]
    order_notice: str


class TeamDetailResponse(BaseModel):
    team: dict[str, str]
    context: dict[str, Any]
    record: dict[str, Any]
    production: dict[str, Any]
    allowance: dict[str, Any]
    player_cohort: list[dict[str, Any]]
    recent_games: list[dict[str, Any]]
    warnings: list[str]


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
