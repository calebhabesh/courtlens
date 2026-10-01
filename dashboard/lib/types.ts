export type RunSummary = {
  id: string;
  source: string;
  status: string;
  started_at: string;
  finished_at: string | null;
  received: number;
  inserted: number;
  updated: number;
  unchanged: number;
  error: string | null;
};

export type DataStatus = {
  provider: string;
  classification: "fixture" | "operational" | "empty" | "unavailable";
  unofficial: boolean;
  latest_attempt: RunSummary | null;
  latest_success: RunSummary | null;
  latest_source_observation: string | null;
  freshness: {
    status: "fixture" | "fresh" | "degraded" | "stale" | "unknown";
    age_hours: number | null;
    warn_after_hours: number;
    error_after_hours: number;
  };
  quality: {
    status: string;
    executed_at: string;
    passed: number;
    failed: number;
    checks: Array<{
      name: string;
      passed: boolean;
      observed: number | string;
      expectation: string;
    }>;
  } | null;
  coverage: Record<string, number>;
  source_contract_checked_on: string;
  source_contract_url: string;
  terms_url: string;
  limitations: string[];
};

export type ScheduleGame = {
  id: number;
  tipoff_utc: string;
  away: { id: number; abbreviation: string; name: string; back_to_back: boolean };
  home: { id: number; abbreviation: string; name: string; back_to_back: boolean };
  status: string;
  postponed: boolean;
};

export type ScheduleWeek = {
  week_start: string;
  week_end: string;
  timezone: string;
  light_slate_threshold: number;
  days: Array<{
    date: string;
    game_count: number;
    is_light_slate: boolean;
    games: ScheduleGame[];
  }>;
};

export type PlannerPlayer = {
  id: number;
  name: string;
  team: string | null;
  eligible_slots: string[];
  roster_role: string;
  recent_form: {
    calculated_as_of: string;
    games_played: number;
    avg_minutes: number | null;
    fantasy_points_per_game: number | null;
    data_completeness: number;
  };
};

export type Plan = {
  league: {
    id: string;
    name: string;
    timezone: string;
    lineup_slots: Record<string, number>;
    acquisition_limit: number;
    scoring_rules_version: string;
    roster_version: number;
  };
  week_start: string;
  week_end: string;
  week_state: {
    acquisitions_used: number;
    acquisitions_remaining: number;
  };
  dates: string[];
  players: PlannerPlayer[];
  days: Array<{
    date: string;
    nba_games: number;
    is_light_slate: boolean;
    scheduled_player_games: number;
    startable_player_games: number;
    lineup_conflicts: number;
    cells: Record<
      string,
      {
        status: string;
        opponent?: string;
        is_home?: boolean;
        slot?: string;
        reason?: string;
      }
    >;
  }>;
  summary: {
    scheduled_player_games: number;
    startable_player_games: number;
    lineup_conflicts: number;
    light_slate_threshold: number;
  };
  data_snapshot: {
    id: string | null;
    source: string | null;
    finished_at: string | null;
    classification: "fixture" | "operational";
  };
  caveats: string[];
};

export type PrivatePlayer = {
  player_id: number;
  name: string;
  team: string | null;
  eligible_slots?: string[];
  roster_role?: string;
  label?: string | null;
  availability_claimed?: boolean;
};

export type Scenario = {
  id: string;
  valid: boolean;
  before: Plan;
  after: Plan;
  delta: {
    scheduled_player_games: number;
    startable_player_games: number;
    lineup_conflicts: number;
    recent_fantasy_points_per_game: number | null;
  };
  explanation: string;
};

export type AnalyticsCatalog = {
  snapshot_id: string;
  dataset_id: string;
  replay_date: string;
  mode: "historical_reconstruction" | string;
  source: string;
  coverage_start: string;
  coverage_end: string;
  default_replay_date: string;
  supported_replay_dates: string[];
  supported_seasons: string[];
  published_at: string | null;
  metric_version: string;
  feature_version: string;
  scoring_version: string;
  estimator: { status: string; version: string | null };
  warnings: string[];
};

export type AnalyticsSummary = {
  n: number;
  minutes_n: number | null;
  minutes_per_game: number | null;
  points_n: number;
  points_per_game: number | null;
  reference_points_n: number;
  reference_points_per_game: number | null;
  reference_points_stddev?: number | null;
  reference_points_per_minute: number | null;
  fg_pct: number | null;
  fg3_pct: number | null;
  ft_pct: number | null;
};

export type AnalyticsProfile = {
  snapshot_id: string;
  dataset_id: string;
  replay_date: string;
  cutoff_utc: string | null;
  mode: string;
  source: string;
  coverage_end: string;
  metric_version: string;
  scoring_version: string;
  warnings: string[];
  player: { id: string; name: string; season: string };
  last_observed: { team_id: string; date: string; association: string } | null;
  summaries: {
    last_5: AnalyticsSummary | null;
    last_10: AnalyticsSummary | null;
    season: AnalyticsSummary | null;
  };
  target: {
    game_id: string;
    date: string;
    team_id: string;
    team: string | null;
    opponent_id: string;
    opponent: string | null;
    side: "home" | "away" | null;
    lead_days: number;
    rest_days: number | null;
    reconstruction: string;
  } | null;
  opponent_context: {
    eligible_games: number;
    values: Record<string, number | null>;
    max_history_date: string | null;
  } | null;
  estimate: {
    status: string;
    history_n: number;
    point: number | null;
    interval: { lower: number; upper: number; nominal_coverage: number } | null;
    estimator?: string;
    prediction_mode?: string;
  };
};

export type AnalyticsGame = {
  game_id: string;
  date: string;
  season: string;
  team_id: string;
  team: string | null;
  opponent_id: string;
  opponent: string | null;
  appearance: string;
  minutes: number | null;
  stats: Record<string, number | null>;
  reference_points: number | null;
  lineage_url: string;
};

export type AnalyticsGames = {
  snapshot_id: string;
  dataset_id: string;
  replay_date: string;
  player_id: string;
  games: AnalyticsGame[];
  next_cursor: string | null;
};

export type AnalyticsCompare = {
  snapshot_id: string;
  dataset_id: string;
  replay_date: string;
  cutoff_utc: string;
  mode: string;
  source: string;
  coverage_end: string;
  warnings: string[];
  player_a: AnalyticsProfile;
  player_b: AnalyticsProfile;
  estimate_gap: number | null;
};

export type AnalyticsEvaluation = {
  snapshot_id: string;
  dataset_id: string;
  run_id: string;
  report_sha256: string;
  coverage_start: string;
  coverage_end: string;
  published_at: string | null;
  source: string;
  validation: Record<string, unknown>;
  final_test: {
    metrics: Record<string, { forecast_rows: number; mae: number; rmse: number }>;
    intervals: Record<string, { coverage: number | null; mean_width: number | null; rows: number }>;
    counts: Record<string, number>;
    paired_uncertainty: { lower: number; upper: number };
    prespecified_slices: Record<string, unknown>;
  };
  promotion: Record<string, unknown>;
  serving_policy: { historical_s3_primary: string; challenger_is_serving: boolean };
  limitations: string[];
  record_counts: Record<string, number>;
  latest_build: { status: string; created_at: string; finished_at: string | null } | null;
  warnings: string[];
};

export type AnalyticsSearch = {
  snapshot_id: string;
  dataset_id: string;
  query: string;
  season: string | null;
  players: Array<{ id: string; name: string; last_observed_date: string }>;
};

// Workbench Types (P3-P5)
export type MetricDefinition = {
  key: string;
  version: string;
  display_name: string;
  short_name: string;
  category: string;
  unit: string;
  formula: string;
  denominator: string | null;
  phase_scope: string[];
  default_sort_direction: "asc" | "desc";
  limitations: string[];
};

export type MetricCatalog = {
  version: string;
  metrics: MetricDefinition[];
};

export type WorkbenchCatalog = {
  release_id: string;
  snapshot_id: string;
  dataset_id: string;
  semantic_signature: string;
  mode: string;
  source: string;
  seasons: string[];
  phases: string[];
  default_season: string;
  default_phase: string;
  default_before_date: string;
  supported_dates: string[];
  coverage_start: string;
  coverage_end: string;
  metric_version: string;
  published_at: string | null;
  warnings: string[];
};

export type PlayerResearchItem = {
  player_id: string;
  player_name: string;
  teams: string[];
  stints_count: number;
  games_played: number;
  total_minutes: number;
  metrics: Record<string, number | null>;
  sample_sizes: Record<string, number>;
  portrait_url?: string | null;
};

export type PlayerResearchQuery = {
  release_id?: string;
  season: string;
  phase: string;
  before_date: string;
  window: string;
  team_id?: string;
  name?: string;
  min_games?: number;
  min_minutes?: number;
  min_avg_minutes?: number;
  sort_metric: string;
  sort_direction?: string;
  limit: number;
};

export type PlayerResearchResponse = {
  context: {
    release_id: string;
    season: string;
    phase: string;
    before_date: string;
    window: string;
    last_included_date: string | null;
    sample_size: number;
    warnings: string[];
  };
  query: PlayerResearchQuery;
  total_eligible_players: number;
  items: PlayerResearchItem[];
  next_cursor: string | null;
  has_more: boolean;
  warnings: string[];
};

export type PlayerProfileStint = {
  team_id: string;
  team_tricode: string;
  team_name: string;
  games_played: number;
  metrics: Record<string, number | null>;
};

export type PlayerProfile = {
  player: {
    id: string;
    name: string;
    portrait_url?: string;
  };
  context: {
    release_id: string;
    season: string;
    phase: string;
    before_date: string;
    window: string;
    last_included_date: string | null;
    sample_size: number;
    warnings: string[];
  };
  summaries: {
    season: Record<string, number | null>;
    last_5: Record<string, number | null>;
    last_10: Record<string, number | null>;
  };
  stints: PlayerProfileStint[];
  latest_team: { id: string; tricode: string; name: string } | null;
  last_observed_date: string | null;
  forecast_status: {
    status: string;
    message: string;
    horizon_days: number;
    point_estimate?: number;
    interval_lower?: number;
    interval_upper?: number;
    target_game_id?: string;
    target_game_date?: string;
    target_opponent?: string;
    policy_name?: string;
  };
  warnings: string[];
};

export type PlayerGameLogItem = {
  game_id: string;
  game_date: string;
  season: string;
  phase: string;
  team_id: string;
  team_tricode: string;
  opponent_id: string;
  opponent_tricode: string;
  side: "home" | "away" | null;
  appearance: string;
  minutes: number | null;
  points: number | null;
  stats: Record<string, number | null>;
  legacy_fantasy_score: number | null;
  lineage_ref: string;
};

export type PlayerGameLogResponse = {
  player: { id: string; name: string };
  context: Record<string, unknown>;
  games: PlayerGameLogItem[];
  next_cursor: string | null;
  has_more: boolean;
  warnings: string[];
};

export type TeamResearchItem = {
  team_id: string;
  tricode: string;
  name: string;
  games_played: number;
  wins: number;
  losses: number;
  win_pct: number | null;
  production: Record<string, number | null>;
  allowance: Record<string, number | null>;
  observed_games: number;
  exclusions: number;
};

export type TeamResearchResponse = {
  context: Record<string, unknown>;
  teams: TeamResearchItem[];
  warnings: string[];
  order_notice: string;
};

export type TeamDetailResponse = {
  team: { id: string; tricode: string; name: string };
  context: Record<string, unknown>;
  record: {
    games_played: number;
    wins: number;
    losses: number;
    win_pct: number | null;
  };
  production: Record<string, number | null>;
  allowance: Record<string, number | null>;
  player_cohort: Array<{
    player_id: string;
    player_name: string;
    games_played: number;
    total_minutes: number;
    points: number | null;
    points_per_game: number | null;
  }>;
  recent_games: Array<{
    game_id: string;
    game_date: string;
    opponent_id: string;
    opponent_tricode: string;
    side: "home" | "away" | null;
    team_points: number | null;
    opponent_points: number | null;
    is_win: boolean | null;
  }>;
  warnings: string[];
};

export type MetricComparisonItem = {
  metric: string;
  display_name: string;
  unit: string;
  value_a: number | string | null;
  value_b: number | string | null;
  diff: number | null;
  n_a: number;
  n_b: number;
};

export type PlayerComparisonResponse = {
  context: Record<string, unknown>;
  player_a: {
    id: string;
    name: string;
    teams: string[];
    games_played: number;
    total_minutes: number;
    portrait_url?: string;
  };
  player_b: {
    id: string;
    name: string;
    teams: string[];
    games_played: number;
    total_minutes: number;
    portrait_url?: string;
  };
  aligned_metrics: MetricComparisonItem[];
  no_forced_winner_notice: string;
  warnings: string[];
};

export type LineageFactItem = {
  kind: string;
  fact_id: string;
  game_id: string;
  game_date: string;
  source_version_id: string;
  source_observation_id: string;
};

export type LineageResponse = {
  release_id: string;
  dataset_id: string;
  semantic_signature: string;
  source_namespace: string;
  contributing_facts: LineageFactItem[];
  transform_path: string[];
  warnings: string[];
};

export type SavedInvestigation = {
  id: string;
  title: string;
  manifest_sha256: string;
  result_sha256: string;
  query: Record<string, unknown>;
  context: Record<string, unknown>;
  metric_version: string;
  total_rows: number;
  created_at: string;
};

export type InvestigationDetail = SavedInvestigation & {
  results: Array<Record<string, unknown>>;
};

export type InvestigationReproduce = {
  id: string;
  reproducible: boolean;
  saved_result_sha256: string;
  recomputed_result_sha256: string;
  match: boolean;
  reason?: string | null;
};

export type WorkbenchJobItem = {
  job_id: string;
  job_type: string;
  status: string;
  stage: string | null;
  owner: string | null;
  started_at: string | null;
  finished_at: string | null;
  heartbeat_at: string | null;
  timings: Record<string, number>;
  output_refs: Record<string, unknown>;
  error_summary: string | null;
  created_at: string;
};

export type WorkbenchStatus = {
  status: string;
  release: {
    channel: string;
    snapshot_id: string | null;
    dataset_id: string | null;
    semantic_signature: string | null;
    published_at: string | null;
    coverage_start: string | null;
    coverage_end: string | null;
  };
  source: {
    namespace: string;
    admitted_seasons: string[];
    latest_finalized_date: string | null;
  };
  worker: {
    scheduled_refresh_utc: string;
    active_job: {
      id: string;
      job_type: string;
      stage: string | null;
      started_at: string | null;
    } | null;
    latest_job: {
      id: string;
      job_type: string;
      status: string;
      stage: string | null;
      finished_at: string | null;
    } | null;
  };
  capabilities: {
    research: boolean;
    forecasting: string;
    teams_count: number;
    portraits?: {
      total_cached: number;
      active: number;
      total_players: number;
      storage_path: string;
    };
  };
};

export type PointsForecastEvaluation = {
  available: boolean;
  run_id?: string | null;
  task?: string | null;
  limitations?: string[];
  active_policy?: {
    id: string;
    policy_name: string;
    target_metric: string;
    estimator_identity: string;
    calibration_identity: string;
    eligibility_criteria: Record<string, unknown>;
    activated_at: string;
    experiment_run_id?: string | null;
  } | null;
  promotion?: {
    decision: "promote" | "do_not_promote";
    gates: {
      validation_improvement: {
        passed: boolean;
        pooled_relative_improvement: number;
        fold_differences: Record<string, number>;
      };
      final_paired_superiority: {
        passed: boolean;
        mae_difference: number;
        lower?: number;
        upper?: number;
        estimand?: string;
      };
      supported_slices: {
        passed: boolean;
        supported_count: number;
        regressions_over_limit: Array<Record<string, unknown>>;
      };
      interval_guardrails: {
        passed: boolean;
        challenger_coverage?: number;
        width_ratio?: number;
      };
    };
  } | null;
  final_test?: {
    split: {
      season?: string | null;
      seasons?: string[] | null;
      start: string;
      end: string;
      role: string;
    };
    metrics: Record<string, {
      mae: number;
      rmse: number;
      player_balanced_mae?: number;
      player_game_balanced_mae?: number;
      forecast_rows: number;
      players: number;
      target_dates: number;
      unique_player_games: number;
    }>;
    intervals: Record<string, {
      core: { coverage: number; mean_width: number; rows: number };
      early_season: { coverage: number; mean_width: number; rows: number };
    }>;
    prespecified_slices: Record<string, Record<string, Record<string, {
      mae: number;
      rmse: number;
      forecast_rows: number;
      players: number;
      unique_player_games?: number;
      target_dates?: number;
    }>>>;
    counts?: Record<string, number>;
  } | null;
  validation?: {
    baseline: string;
    challenger_finalist: string;
    selected_configs: Record<string, string>;
  } | null;
  calibration?: Record<string, {
    core: { absolute_residual_quantile: number; rows: number; target_dates: number; available: boolean };
    early_season: { absolute_residual_quantile: number; rows: number; target_dates: number; available: boolean };
  }> | null;
  model_card_markdown?: string | null;
  message?: string | null;
};

export type ForecastScoreItem = {
  id: string;
  issuance_id: string;
  observed_points?: number | null;
  scored_at: string;
  scoring_policy_id: string;
  outcome_observation_id?: string | null;
  absolute_error?: number | null;
  interval_hit?: boolean | null;
  score_status: string;
  reason?: string | null;
};

export type ForecastIssuanceItem = {
  id: string;
  policy_id: string;
  player_id: string;
  player_name: string;
  team_id: string;
  team_tricode: string;
  target_game_id: string;
  target_game_date: string;
  target_opponent_id: string;
  target_opponent_tricode: string;
  issued_at_utc: string;
  dataset_id: string;
  features_hash: string;
  point_estimate: number;
  interval_lower: number;
  interval_upper: number;
  availability_reason?: string | null;
  issuance_status: string;
  latest_score?: ForecastScoreItem | null;
};

export type ForecastIssuanceDetailResponse = ForecastIssuanceItem & {
  features_json: Record<string, unknown>;
  schedule_evidence_json: Record<string, unknown>;
  team_evidence_json: Record<string, unknown>;
  scores: ForecastScoreItem[];
};

export type ForecastAccuracyMetrics = {
  scored_count: number;
  mae?: number | null;
  interval_coverage?: number | null;
};

export type ForecastsSummary = {
  total_issued: number;
  total_scored: number;
  total_pending: number;
  total_unscored_dnp: number;
  total_unscored_cancelled: number;
  prospective_accuracy_status: string;
  accuracy_metrics?: ForecastAccuracyMetrics | null;
  active_policy?: Record<string, unknown> | null;
  message?: string | null;
};

export type ForecastsListResponse = {
  items: ForecastIssuanceItem[];
  summary: ForecastsSummary;
  page: number;
  page_size: number;
  total_items: number;
  warnings: string[];
};

export type AssistantStatusResponse = {
  configured: boolean;
  model: string;
  provider: string;
  limits: {
    max_question_length: number;
    max_rounds: number;
    max_total_tool_calls: number;
    max_rows_per_call: number;
    max_total_rows: number;
    timeout_seconds: number;
  };
  allowed_tools: string[];
  privacy_notice: string;
  setup_instructions: string;
};

export type AssistantQueryRequest = {
  question: string;
  context?: {
    release_id?: string;
    season?: string;
    phase?: string;
    before_date?: string;
    window?: string;
  } | null;
};

export type EvidenceCellRef = {
  ref_id: string;
  entity_type: string;
  entity_id: string;
  entity_name: string;
  field_name: string;
  metric?: string | null;
  raw_value: unknown;
  formatted_value: string;
  source_tool: string;
};

export type SupportedClaim = {
  statement: string;
  evidence_ref_ids: string[];
  subject?: string | null;
  metric?: string | null;
  verified_value?: unknown;
  unit?: string | null;
};

export type ResultTableColumn = {
  key: string;
  label: string;
  align?: string | null;
};

export type ResultTable = {
  title: string;
  columns: ResultTableColumn[];
  rows: Record<string, unknown>[];
  row_count: number;
};

export type ChartSpec = {
  chart_type: string;
  title: string;
  x_key: string;
  y_key: string;
  data: Record<string, unknown>[];
};

export type ExplorerQuery = {
  view: string;
  params: Record<string, string>;
  target_url: string;
};

export type AssistantToolCallTrace = {
  round: number;
  tool_name: string;
  arguments: Record<string, unknown>;
  status: string;
  result_summary: string;
  execution_ms: number;
};

export type AssistantAnswer = {
  status: "answered" | "model_not_available" | "disabled" | "error";
  resolved_context: Record<string, unknown>;
  interpretation: string;
  tool_trace: AssistantToolCallTrace[];
  evidence_refs: EvidenceCellRef[];
  result_tables: ResultTable[];
  chart_specs: ChartSpec[];
  supported_claims: SupportedClaim[];
  limitations: string[];
  explorer_query?: ExplorerQuery | null;
  narrative?: string | null;
  reproducible_manifest?: {
    manifest_sha256: string;
    canonical_query: string;
    context: Record<string, unknown>;
    metric_catalog_version: string;
    tool_rounds: number;
    evidence_cells_count: number;
    explorer_query?: Record<string, unknown>;
  } | null;
  error_detail?: string | null;
};


