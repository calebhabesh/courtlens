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
  required_fields?: string[];
  compatible_normalizations?: string[];
  aggregation_recipe?: string;
  validity_definition?: string;
  aliases?: string[];
  capability_requirement?: string;
  classification?: string;
  good_direction?: "high" | "low" | null;
};

export type MetricCatalog = {
  version: string;
  metrics: MetricDefinition[];
};

export type WorkbenchCatalog = {
  impact?: { status: string; scopes: ImpactArtifact[]; manifest_sha256: string | null } | null;
  release_id: string;
  snapshot_id: string;
  dataset_id: string;
  semantic_signature: string;
  mode: string;
  source: string;
  seasons: string[];
  phases: string[];
  stats_scopes?: { season: string; phase: string; coverage_start: string; coverage_end: string; default_before_date: string }[];
  stats_windows?: string[];
  stats_normalizations?: string[];
  stats_sort_fields?: string[];
  default_season: string;
  default_phase: string;
  default_before_date: string;
  supported_dates: string[];
  coverage_start: string;
  coverage_end: string;
  metric_version: string;
  published_at: string | null;
  capabilities?: Record<string, CapabilityEntry>;
  warnings: string[];
};

export type CapabilityStatus =
  | "available"
  | "partial"
  | "source_blocked"
  | "not_configured"
  | "not_yet_observed"
  | "not_implemented";

export type CapabilityEntry = {
  name: string;
  status: CapabilityStatus;
  seasons: string[];
  phases: string[];
  coverage_start?: string | null;
  coverage_end?: string | null;
  expected_grains: string[];
  metric_requirements: string[];
  source_freshness?: string | null;
  limitations: string[];
};

export type FinalizedResearchContext = {
  release_id: string;
  snapshot_id: string;
  dataset_id: string;
  dataset_type: "archive" | "workbench";
  semantic_signature: string;
  mode: string;
  source: string;
  season: string;
  seasons: string[];
  phase: string;
  phases: string[];
  before_date: string;
  lower_date?: string | null;
  cutoff_utc: string;
  window: string;
  coverage_start: string;
  coverage_end: string;
  default_before_date: string;
  supported_dates: string[];
  metric_version: string;
  published_at?: string | null;
  capabilities?: Record<string, CapabilityEntry>;
  warnings: string[];
};

export type EntityKind =
  | "player"
  | "team"
  | "player_season"
  | "team_season"
  | "game"
  | "stint"
  | "assignment";

export type WindowKind =
  | "season"
  | "last_5"
  | "last_10"
  | "last_n_appearances"
  | "last_n_team_games"
  | "date_range";

export type WindowSpec = {
  kind: WindowKind;
  n?: number | null;
  from_date?: string | null;
  to_date?: string | null;
};

export type SeasonScope = {
  seasons: string[];
  aggregate_multi_season?: boolean;
};

export type TeamScope = {
  team_id?: string | null;
  participation_only?: boolean;
  current_roster_only?: boolean;
};

export type NormalizationMode =
  | "raw"
  | "per_game"
  | "per_minute"
  | "per_36"
  | "per_75"
  | "per_100"
  | "totals";

export type MetricSelector = {
  key: string;
  version?: string | null;
  normalization?: NormalizationMode;
  denominator_type?: string | null;
};

export type PredicateOp =
  | "eq"
  | "ne"
  | "lt"
  | "lte"
  | "gt"
  | "gte"
  | "between"
  | "in";

export type PredicateLeaf = {
  field: string;
  op: PredicateOp;
  value: unknown;
};

export type PredicateGroup = {
  conjunction: "and" | "or";
  predicates: Array<PredicateLeaf | PredicateGroup>;
};

export type SampleFilter = {
  min_games?: number | null;
  min_minutes?: number | null;
  min_avg_minutes?: number | null;
  min_possessions?: number | null;
  min_attempts?: number | null;
};

export type SortSpec = {
  field: string;
  direction: "asc" | "desc";
  nulls_last?: boolean;
};

export type ViewState = {
  view_id?: string | null;
  columns?: string[];
  density?: "compact" | "standard" | "expanded" | null;
  identity_mode?: "photos" | "logos" | "initials" | "none" | null;
};

export type PagingSpec = {
  limit: number;
  cursor?: string | null;
};

export type QuerySpec = {
  impact_manifest_sha256?: string | null;
  release_id?: string | null;
  season: string;
  phase: string;
  before_date?: string | null;
  name?: string | null;
  entity_kind?: EntityKind;
  window?: WindowSpec;
  season_scope?: SeasonScope;
  team_scope?: TeamScope;
  metric_selectors?: MetricSelector[];
  predicates?: PredicateGroup | null;
  sample_filters?: SampleFilter;
  sort?: SortSpec[];
  view_state?: ViewState | null;
  page?: PagingSpec;
};

export type WorkbenchQueryRequest = {
  query: QuerySpec;
  presentation?: StatsPresentation | null;
};

export type StatsPresentation = {
  version?: "pf01a-v1";
  // null/omitted selects all; [] selects none. Does not redefine the cohort.
  player_ids?: string[] | null;
  table_percentiles?: boolean;
};

export type TableCohort = {
  version: string;
  scope_hash: string;
  qualified_players: number;
  min_season_minutes: number;
  reference: string;
  formula: string;
};

export type WorkbenchQueryResponse = {
  table_cohort?: TableCohort | null;
  impact?: ImpactDisclosureData | null;
  context: Record<string, unknown>;
  query: QuerySpec;
  total_eligible_players: number;
  total_output_players?: number | null;
  output_offset?: number | null;
  cohort?: {
    version: string;
    scope_hash: string;
    eligible_players: number;
    formula: string;
    good_directions: Record<string, "high" | "low" | null>;
  } | null;
  items: PlayerResearchItem[];
  next_cursor: string | null;
  has_more: boolean;
  warnings: string[];
};

export type PlayerResearchItem = {
  table_qualified?: boolean | null;
  table_percentiles?: Record<string, number | null> | null;
  table_cohort_sample_sizes?: Record<string, number> | null;
  impact_support?: Record<string, ImpactSupport> | null;
  player_id: string;
  player_name: string;
  teams: string[];
  stints_count: number;
  games_played: number;
  total_minutes: number;
  metrics: Record<string, number | null>;
  sample_sizes: Record<string, number>;
  portrait_url?: string | null;
  percentiles?: Record<string, number | null> | null;
  cohort_sample_sizes?: Record<string, number> | null;
};

export type LookupAvailability = {
  has_current_season: boolean;
  status: string;
  seasons: string[];
  latest_team_id?: string | null;
  latest_tricode?: string | null;
  conference?: string | null;
  division?: string | null;
};

export type LookupTeamAssociation = {
  basis: "selected_scope" | "last_observed";
  teams: string[];
  observed_through: string | null;
  season: string | null;
  phase: string | null;
  before_date: string | null;
};

export type LookupItem = {
  id: string;
  kind: "player" | "team" | "page";
  canonical_id: string;
  display_name: string;
  subtitle?: string | null;
  match_basis: "exact" | "prefix" | "token_prefix" | "substring" | "typo" | "suggestion";
  match_score: number;
  matched_alias?: string | null;
  portrait_url?: string | null;
  portrait_fallback?: string | null;
  availability: LookupAvailability;
  team_association?: LookupTeamAssociation | null;
  destination_url: string;
  metadata?: Record<string, unknown>;
};

export type QueryNormalizationInfo = {
  raw: string;
  normalized: string;
  tokens: string[];
  version: string;
};

export type LookupResponse = {
  query: QueryNormalizationInfo;
  catalog_version: string;
  release_id?: string | null;
  season?: string | null;
  total_matches: number;
  items: LookupItem[];
  latency_ms?: number | null;
};

export type PlayerResearchQuery = {
  impact_manifest_sha256?: string;
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
  cursor?: string | null;
};

export type PlayerResearchResponse = {
  table_cohort?: TableCohort | null;
  impact?: ImpactDisclosureData | null;
  total_output_players?: number | null;
  output_offset?: number | null;
  cohort?: WorkbenchQueryResponse["cohort"];
  context: {
    release_id: string;
    season: string;
    phase: string;
    before_date: string;
    window: string;
    last_included_date: string | null;
    sample_size?: number;
    warnings: string[];
  };
  query: PlayerResearchQuery;
  total_eligible_players: number;
  items: PlayerResearchItem[];
  next_cursor: string | null;
  has_more: boolean;
  warnings: string[];
};

export type ImpactArtifact = {
  sha256?: string;
  season: string;
  seasons: string[];
  phase: string;
  years: number;
  cutoff: string;
  last_included_date: string;
};
export type ImpactSupport = {
  qualified: boolean;
  /** Oriented percentiles among qualified players (six factors: offense for o_*, defense for d_*). */
  offense_percentile?: number | null;
  defense_percentile?: number | null;
  covered_games?: number;
  total_games?: number;
  games?: number;
  seconds?: number;
  off_opportunities?: number;
  def_opportunities?: number;
  numerator?: number | null;
  denominator?: number | null;
  reference?: number | null;
  cutoff?: string;
  years?: number;
  reason?: string;
  artifact_sha256?: string;
  team_id?: string;
  on?: { seconds: number; off_controls: number; def_controls: number };
  off?: { seconds: number; off_controls: number; def_controls: number };
};
export type ImpactDisclosureData = {
  status: string;
  source: string;
  version: string;
  methodology_url: string;
  manifest_sha256: string | null;
  artifacts: ImpactArtifact[];
  coverage: {
    season: string; phase: string; scheduled_games: number; admitted_games: number;
    clean_games: number; patched_games: number; excluded_games: number; patch_rate: number;
    estimate_within_two_percent: number;
  }[];
  limitations: string[];
  unavailable_columns: Record<string, string>;
  reason?: string | null;
};
export type ImpactResponse = ImpactDisclosureData & {
  total_players: number;
  players: { player_id: string; player_name: string; metrics: Record<string, number | null>;
    support: Record<string, ImpactSupport>; on_off: Record<string, unknown> }[];
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
  table_percentiles?: Record<string, number | null> | null;
  table_cohort_sample_sizes?: Record<string, number> | null;
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
  conference?: string | null;
  division?: string | null;
  ratings?: {
    off_rating?: number | null;
    def_rating?: number | null;
    net_rating?: number | null;
    pace?: number | null;
  } | null;
  four_factors?: {
    efg_pct?: number | null;
    tov_pct?: number | null;
    oreb_pct?: number | null;
    ftr?: number | null;
    opp_efg_pct?: number | null;
    opp_tov_pct?: number | null;
    opp_oreb_pct?: number | null;
    opp_ftr?: number | null;
  } | null;
};

export type TeamResearchResponse = {
  context: Record<string, unknown>;
  teams: TeamResearchItem[];
  warnings: string[];
  order_notice: string;
  league_averages?: Record<string, number> | null;
};

export type TeamDetailResponse = {
  team: { id: string; tricode: string; name: string };
  context: Record<string, unknown>;
  record: {
    games_played: number;
    wins: number;
    losses: number;
    win_pct: number | null;
    differential?: number;
  };
  production: Record<string, number | null>;
  allowance: Record<string, number | null>;
  home_split?: {
    games_played: number;
    wins: number;
    losses: number;
    win_pct: number | null;
    ppg: number | null;
    opp_ppg: number | null;
    differential: number;
  } | null;
  away_split?: {
    games_played: number;
    wins: number;
    losses: number;
    win_pct: number | null;
    ppg: number | null;
    opp_ppg: number | null;
    differential: number;
  } | null;
  current_streak?: string | null;
  player_cohort: Array<{
    player_id: string;
    player_name: string;
    games_played: number;
    /** Null when the player has no appeared game with recorded minutes (unknown, never zero). */
    total_minutes: number | null;
    pts_per_game: number | null;
    reb_per_game: number | null;
    ast_per_game: number | null;
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

export type TeamScheduleGameItem = {
  game_id: string;
  game_date: string;
  side: "home" | "away";
  opponent_id?: string | null;
  opponent_tricode: string;
  opponent_name: string;
  team_points?: number | null;
  opponent_points?: number | null;
  differential?: number | null;
  is_win?: boolean | null;
  result?: string | null;
  rest_days?: number | null;
  is_back_to_back: boolean;
  rest_bucket: string;
  streak?: string | null;
  venue_streak?: string | null;
};

export type TeamRestSplitItem = {
  bucket_key: string;
  bucket_label: string;
  games_played: number;
  wins: number;
  losses: number;
  win_pct: number | null;
  ppg: number | null;
  opp_ppg: number | null;
  differential: number;
};

export type TeamBackToBackSummary = {
  second_leg_games: {
    games: number;
    wins: number;
    losses: number;
    win_pct: number | null;
  };
  first_leg_games: {
    games: number;
    wins: number;
    losses: number;
    win_pct: number | null;
  };
};

export type TeamScheduleResponse = {
  team: { id: string; tricode: string; name: string; city?: string; conference?: string; division?: string };
  context: Record<string, unknown>;
  overall_record: {
    games_played: number;
    wins: number;
    losses: number;
    win_pct: number | null;
    differential: number;
    current_streak?: string | null;
  };
  home_split: {
    games_played: number;
    wins: number;
    losses: number;
    win_pct: number | null;
    ppg: number | null;
    opp_ppg: number | null;
    differential: number;
  };
  away_split: {
    games_played: number;
    wins: number;
    losses: number;
    win_pct: number | null;
    ppg: number | null;
    opp_ppg: number | null;
    differential: number;
  };
  rest_splits: TeamRestSplitItem[];
  back_to_back_summary: TeamBackToBackSummary;
  longest_homestand: number;
  longest_road_trip: number;
  games: TeamScheduleGameItem[];
  warnings: string[];
};

export type FourFactorMetricItem = {
  key: string;
  display_name: string;
  factor?: string | null;
  weight?: number | null;
  value?: number | null;
  league_avg?: number | null;
  rank?: number | null;
  percentile?: number | null;
  total_teams: number;
  good_direction: string;
  unit: string;
  formula: string;
};

export type ThreePointVariationScenario = {
  observed_fg3m: number;
  observed_fg3a: number;
  observed_3p_pct: number;
  league_3p_pct: number;
  hypothetical_fg3m: number;
  delta_points: number;
  actual_ppg: number;
  hypothetical_ppg: number;
  actual_off_rating?: number | null;
  hypothetical_off_rating?: number | null;
  delta_off_rating?: number | null;
  actual_net_rating?: number | null;
  hypothetical_net_rating?: number | null;
  delta_net_rating?: number | null;
  disclaimer: string;
};

export type TeamFourFactorsResponse = {
  team: { id: string; tricode: string; name: string; city?: string; conference?: string; division?: string };
  context: Record<string, unknown>;
  games_played: number;
  pace?: number | null;
  off_rating?: number | null;
  def_rating?: number | null;
  net_rating?: number | null;
  ratings: FourFactorMetricItem[];
  offense_factors: FourFactorMetricItem[];
  defense_factors: FourFactorMetricItem[];
  shooting_percentages: Record<string, number | null>;
  league_averages: Record<string, number>;
  three_point_scenario: ThreePointVariationScenario;
  warnings: string[];
};

export type TeamPeerItem = {
  team_id: string;
  tricode: string;
  name: string;
  city?: string;
  conference?: string;
  distance: number;
  similarity_score: number;
  dimension_diffs: Record<string, Record<string, number>>;
};

export type TeamPeersResponse = {
  team: { id: string; tricode: string; name: string };
  context: Record<string, unknown>;
  peers: TeamPeerItem[];
  dimensions_used: string[];
  warnings: string[];
};

export type ThreePointVariationResponse = {
  team: { id: string; tricode: string; name: string };
  context: Record<string, unknown>;
  scenario: ThreePointVariationScenario;
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
  limited_mode?: boolean;
  prompt_version?: string;
  limits: {
    max_steps?: number;
    max_web_searches?: number;
    max_tokens?: number;
    turn_timeout_seconds?: number;
    max_question_chars?: number;
    max_question_length?: number;
    max_rounds: number;
    max_calls?: number;
    max_total_tool_calls?: number;
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
  };

// =========================================================================
// Personal Workspace & State Persistence Types (Block B08/B09)
// =========================================================================

export type DensityMode = "compact" | "standard" | "expanded";
export type IdentityPresentationMode = "photos" | "logos" | "initials" | "none";
export type CountingMode = "per_game" | "raw" | "per_36" | "per_75" | "per_100";
export type RankingBoardType = "overall" | "offense" | "defense" | "position" | "custom";
export type ImportConflictMode = "replace" | "merge";
export type AggregationMethod = "borda" | "average_rank";

export interface CustomViewDefinition {
  id: string;
  name: string;
  metric_version?: "v2" | "courtlens-stats-v3";
  unavailable_columns?: string[];
  columns: string[];
  sort_field?: string | null;
  sort_direction?: "asc" | "desc";
  is_default?: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface RankingEntry {
  rank: number;
  player_id: string;
  player_name?: string | null;
  notes?: string | null;
  tags?: string[];
}

export interface RankingBoardDefinition {
  id: string;
  title: string;
  board_type: RankingBoardType;
  scope?: Record<string, unknown> | null;
  notes?: string | null;
  entries: RankingEntry[];
  created_at?: string;
  updated_at?: string;
}

export interface TierGroup {
  tier_id: string;
  label: string;
  color?: string | null;
  player_ids: string[];
}

export interface TierListDefinition {
  id: string;
  title: string;
  description?: string | null;
  tiers: TierGroup[];
  created_at?: string;
  updated_at?: string;
}

export interface WorkspacePreferences {
  density: DensityMode;
  identity_mode: IdentityPresentationMode;
  counting_mode: CountingMode;
  default_view_id: string;
  table_expanded: boolean;
  theme: string;
  updated_at?: string;
}

export interface PersonalWorkspaceState {
  workspace_id: string;
  name: string;
  version: number;
  views: CustomViewDefinition[];
  favorites: string[];
  compare_tray: string[];
  ranking_boards: RankingBoardDefinition[];
  tier_lists: TierListDefinition[];
  preferences: WorkspacePreferences;
  created_at: string;
  updated_at: string;
}

export interface WorkspaceBundle {
  bundle_version: "1.0";
  exported_at: string;
  workspace_id: string;
  name: string;
  version: number;
  views: CustomViewDefinition[];
  favorites: string[];
  compare_tray: string[];
  ranking_boards: RankingBoardDefinition[];
  tier_lists: TierListDefinition[];
  preferences: WorkspacePreferences;
  checksum_sha256?: string | null;
}

export interface AggregatedRankingItem {
  player_id: string;
  player_name?: string | null;
  aggregated_rank: number;
  borda_score: number;
  average_rank: number;
  boards_present_count: number;
  total_boards_count: number;
  best_rank: number;
  worst_rank: number;
}

export interface BoardAggregationResult {
  method: AggregationMethod;
  boards_evaluated: string[];
  missing_rank_penalty: number;
  ranked_players: AggregatedRankingItem[];
  methodology_notes: string;
}

// =========================================================================
// Analytical Operations & Investigation Tools Types (Block B12/B13)
// =========================================================================

export type PeriodMode = "appearances" | "date_range";
export type SplitType = "venue" | "rest" | "opponent" | "all";
export type DistributionMeasure = "iqr" | "population_sd" | "mean" | "median";

export interface MetricDelta {
  metric_key: string;
  display_name: string;
  period_a_value: number | null;
  period_b_value: number | null;
  absolute_delta: number | null;
  percentage_delta: number | null;
  period_a_n: number;
  period_b_n: number;
}

export interface PeriodSummary {
  label: string;
  mode: PeriodMode;
  start_date: string | null;
  end_date: string | null;
  appearances_count: number;
  total_minutes: number;
  min_per_game: number | null;
  stints: string[];
  metrics: Record<string, number | null>;
  sample_counts: Record<string, number>;
}

export interface ComparePeriodsRequest {
  player_id: string;
  season?: string | null;
  phase?: string;
  before_date?: string | null;
  release_id?: string | null;
  mode?: PeriodMode;
  period_a_n?: number;
  period_b_n?: number;
  period_a_from?: string | null;
  period_a_to?: string | null;
  period_b_from?: string | null;
  period_b_to?: string | null;
  metrics?: string[] | null;
}

export interface ComparePeriodsResponse {
  operation_version: string;
  evidence_hash: string;
  player_id: string;
  player_name: string;
  season: string;
  phase: string;
  before_date: string;
  period_a: PeriodSummary;
  period_b: PeriodSummary;
  deltas: MetricDelta[];
  has_calendar_overlap: boolean;
  disclosures: string[];
}

export interface DistributionSamplePoint {
  game_id: string;
  game_date: string;
  team_tricode: string;
  opponent_tricode: string;
  is_home: boolean;
  minutes: number | null;
  value: number | null;
}

export interface DistributionSummary {
  summary_available: boolean;
  reason: string | null;
  n: number;
  mean: number | null;
  median: number | null;
  min: number | null;
  max: number | null;
  population_sd: number | null;
  p10: number | null;
  p25: number | null;
  p75: number | null;
  p90: number | null;
  iqr: number | null;
}

export interface DistributionRequest {
  player_id: string;
  metric?: string;
  season?: string | null;
  phase?: string;
  before_date?: string | null;
  release_id?: string | null;
  window_n?: number;
  from_date?: string | null;
  to_date?: string | null;
}

export interface DistributionResponse {
  operation_version: string;
  evidence_hash: string;
  player_id: string;
  player_name: string;
  metric: string;
  metric_display_name: string;
  metric_unit: string;
  season: string;
  phase: string;
  before_date: string;
  summary: DistributionSummary;
  samples: DistributionSamplePoint[];
  disclosures: string[];
}

export interface SplitBucketSummary {
  bucket_key: string;
  bucket_label: string;
  games_played: number;
  total_minutes: number;
  min_per_game: number | null;
  appearance_gap_days_avg: number | null;
  metrics: Record<string, number | null>;
  sample_counts: Record<string, number>;
}

export interface SplitProfileRequest {
  player_id: string;
  split_type?: SplitType;
  season?: string | null;
  phase?: string;
  before_date?: string | null;
  release_id?: string | null;
}

export interface SplitProfileResponse {
  operation_version: string;
  evidence_hash: string;
  player_id: string;
  player_name: string;
  season: string;
  phase: string;
  before_date: string;
  venue_splits: SplitBucketSummary[];
  rest_splits: SplitBucketSummary[];
  opponent_splits: SplitBucketSummary[];
  disclosures: string[];
}

export interface TeamDefensiveAllowance {
  opponent_team_id: string;
  opponent_tricode: string;
  opponent_name: string;
  games_observed: number;
  pts_allowed_per_game: number;
  fg_pct_allowed: number | null;
  fg3_pct_allowed: number | null;
  reb_allowed_per_game: number;
  ast_allowed_per_game: number;
  tov_forced_per_game: number;
  league_rank_pts_allowed: number | null;
  total_teams_in_rank: number | null;
}

export interface OpponentContextRequest {
  team_id?: string | null;
  season?: string | null;
  phase?: string;
  before_date?: string | null;
  release_id?: string | null;
}

export interface OpponentContextResponse {
  operation_version: string;
  evidence_hash: string;
  season: string;
  phase: string;
  before_date: string;
  teams_analyzed: number;
  allowances: TeamDefensiveAllowance[];
  disclosures: string[];
}

export interface DimensionStats {
  dimension_key: string;
  display_name: string;
  cohort_mean: number;
  cohort_sd: number;
  is_active: boolean;
  exclusion_reason: string | null;
}

export interface CohortSummary {
  cohort_size: number;
  window_description: string;
  min_appearances: number;
  min_minutes: number;
  active_dimensions_count: number;
  dimensions: DimensionStats[];
}

export interface TargetPlayerProfile {
  player_id: string;
  player_name: string;
  team_tricode: string | null;
  games_played: number;
  total_minutes: number;
  raw_values: Record<string, number | null>;
  standardized_values: Record<string, number | null>;
}

export interface PeerMatchItem {
  player_id: string;
  player_name: string;
  team_tricode: string | null;
  games_played: number;
  total_minutes: number;
  distance: number;
  overlapping_dimensions_count: number;
  raw_values: Record<string, number | null>;
  standardized_values: Record<string, number | null>;
  dimension_contributions: Record<string, number>;
}

export interface StatisticalPeersRequest {
  target_player_id: string;
  season?: string | null;
  phase?: string;
  before_date?: string | null;
  release_id?: string | null;
  window?: "last_10" | "season";
  min_appearances?: number;
  min_minutes?: number;
  top_k?: number;
  dimensions?: string[] | null;
}

export interface StatisticalPeersResponse {
  operation_version: string;
  evidence_hash: string;
  target: TargetPlayerProfile;
  cohort: CohortSummary;
  peers: PeerMatchItem[];
  disclosures: string[];
}

export interface RankOperationItem {
  rank: number;
  player_id: string;
  player_name: string;
  team_tricode: string | null;
  games_played: number;
  total_minutes: number;
  baseline_value: number | null;
  comparison_value: number | null;
  delta_value: number | null;
  metric_key: string;
  details: Record<string, unknown>;
}

export interface RankOperationRequest {
  operation_type: "compare_periods" | "distribution";
  metric?: string;
  season?: string | null;
  phase?: string;
  before_date?: string | null;
  release_id?: string | null;
  sort_direction?: "asc" | "desc";
  min_games?: number;
  min_minutes?: number;
  limit?: number;
  measure?: DistributionMeasure;
}

export interface RankOperationResponse {
  operation_version: string;
  evidence_hash: string;
  operation_type: string;
  metric: string;
  season: string;
  phase: string;
  before_date: string;
  total_eligible: number;
  items: RankOperationItem[];
  disclosures: string[];
}

// ---------------------------------------------------------------------------
// Measurements, Draft, Crosswalk, and Backfill Types (Block B14)
// ---------------------------------------------------------------------------

export interface PlayerMeasurementItem {
  player_id: string;
  display_name: string;
  measurement_type: string;
  source_name: string;
  draft_year: number | null;
  pick_overall: number | null;
  drafting_team_id: string | null;
  height_no_shoes_inches: number | null;
  height_shoes_inches: number | null;
  wingspan_inches: number | null;
  standing_reach_inches: number | null;
  weight_lbs: number | null;
  body_fat_pct: number | null;
  wingspan_to_height_ratio: number | null;
}

export interface MeasurementsQueryResponse {
  items: PlayerMeasurementItem[];
  count: number;
  disclaimer: string;
}

export interface PlayerCombineDetail {
  draft_year: number | null;
  height_no_shoes_inches: number | null;
  height_shoes_inches: number | null;
  wingspan_inches: number | null;
  standing_reach_inches: number | null;
  weight_lbs: number | null;
  body_fat_pct: number | null;
  standing_vertical_inches: number | null;
  max_vertical_inches: number | null;
  lane_agility_seconds: number | null;
  three_quarter_sprint_seconds: number | null;
  wingspan_to_height_ratio: number | null;
  source_attribution: string;
}

export interface PlayerListedDetail {
  season: string | null;
  height_shoes_inches: number | null;
  weight_lbs: number | null;
  source_attribution: string;
}

export interface PlayerDraftDetail {
  draft_year: number;
  round_number: number | null;
  pick_overall: number | null;
  drafting_team_id: string | null;
  drafting_team_name: string | null;
  draft_type: string;
  college_or_prior_team: string | null;
}

export interface PlayerMeasurementsDetailResponse {
  player_id: string;
  display_name: string;
  has_measurements: boolean;
  combine: PlayerCombineDetail | null;
  listed: PlayerListedDetail | null;
  draft: PlayerDraftDetail | null;
  disclaimer: string;
}

export interface CrosswalkItem {
  source_namespace: string;
  source_id: string;
  target_namespace: string;
  target_id: string;
  kind: string;
  confidence: string;
  mapping_method: string;
  evidence: Record<string, unknown>;
}

export interface CrosswalkResponse {
  item: CrosswalkItem | null;
  resolved: boolean;
}

export interface BackfillStatusResponse {
  range: [number, number];
  total_seasons: number;
  imported_count: number;
  acquired_count: number;
  pending_count: number;
  imported_years: number[];
  acquired_years: number[];
  pending_years: number[];
}

// ---------------------------------------------------------------------------
// Playoff Series and Bracket Types (Blocks B17–B18)
// ---------------------------------------------------------------------------

export interface PlayoffSeedEvidence {
  team_id: string;
  tricode: string;
  team_name: string;
  conference: string;
  seed: number;
  wins: number;
  losses: number;
  win_pct: number;
  is_tied: boolean;
  tie_note: string | null;
  source_label: string;
}

export interface TeamSeriesHeader {
  team_id: string;
  tricode: string;
  name: string;
  seed: number | null;
  wins: number;
}

export interface PlayoffSeriesSummary {
  series_id: string;
  slug: string;
  season: string;
  round_number: number;
  round_name: string;
  conference: string | null;
  matchup_index: number;
  team1: TeamSeriesHeader;
  team2: TeamSeriesHeader;
  series_score: string;
  status: "finished" | "final" | "in_progress" | "scheduled" | string;
  winner_team_id: string | null;
  winner_tricode: string | null;
  games_count: number;
  total_scheduled: number;
  is_sweep: boolean;
  summary_text: string;
}

export interface PlayoffRoundResponse {
  round_number: number;
  round_name: string;
  eastern_series: PlayoffSeriesSummary[];
  western_series: PlayoffSeriesSummary[];
  finals_series: PlayoffSeriesSummary[];
  series: PlayoffSeriesSummary[];
}

export interface PlayoffBracketResponse {
  season: string;
  season_year: number;
  cutoff_date: string | null;
  rounds: PlayoffRoundResponse[];
  seeds: Record<string, PlayoffSeedEvidence[]>;
  capabilities: Record<string, string>;
  disclaimers: string[];
}

export interface PlayoffGameCard {
  game_id: string;
  game_number: number;
  game_date: string | null;
  home_team_id: string;
  home_team_tricode: string;
  away_team_id: string;
  away_team_tricode: string;
  home_score: number | null;
  away_score: number | null;
  status: "final" | "scheduled" | "unplayed_placeholder" | string;
  venue: string | null;
  winner_team_id: string | null;
  margin: number | null;
}

export interface TeamSeriesStats {
  team_id: string;
  tricode: string;
  team_name: string;
  seed: number | null;
  wins: number;
  losses: number;
  games_played: number;
  points_per_game: number | null;
  opponent_points_per_game: number | null;
  average_margin: number | null;
  pace: number | null;
  off_rating: number | null;
  def_rating: number | null;
  net_rating: number | null;
  efg_pct: number | null;
  tov_pct: number | null;
  oreb_pct: number | null;
  ftr: number | null;
  totals: Record<string, unknown>;
}

export interface PlayerSeriesStats {
  player_id: string;
  player_name: string;
  team_id: string;
  team_tricode: string;
  games_played: number;
  games_started: number | null;
  minutes_total_seconds: number;
  minutes_per_game: number;
  points_total: number;
  points_per_game: number;
  rebounds_total: number;
  rebounds_per_game: number;
  offensive_rebounds: number;
  defensive_rebounds: number;
  assists_total: number;
  assists_per_game: number;
  steals_total: number;
  steals_per_game: number;
  blocks_total: number;
  blocks_per_game: number;
  turnovers_total: number;
  turnovers_per_game: number;
  fouls_total: number;
  fouls_per_game: number;
  fgm: number;
  fga: number;
  fg_pct: number | null;
  fg3m: number;
  fg3a: number;
  fg3_pct: number | null;
  ftm: number;
  fta: number;
  ft_pct: number | null;
  efg_pct: number | null;
  ts_pct: number | null;
}

export interface PlayoffSeriesDetailResponse {
  series_id: string;
  slug: string;
  season: string;
  season_year: number;
  round_number: number;
  round_name: string;
  conference: string | null;
  matchup_index: number;
  status: "finished" | "final" | "in_progress" | "scheduled" | string;
  series_score: string;
  winner_team_id: string | null;
  winner_tricode: string | null;
  cutoff_date: string | null;
  team1: TeamSeriesStats;
  team2: TeamSeriesStats;
  game_cards: PlayoffGameCard[];
  team1_players: PlayerSeriesStats[];
  team2_players: PlayerSeriesStats[];
  capabilities: Record<string, string>;
  disclaimers: string[];
}

/** Per-date counts from a release's retained schedule and admitted finals (FO08 Live date strip). */
export interface ScheduleDateCount {
  date: string;
  /** Null when the dataset retains no schedule (unknown, not zero). */
  scheduled: number | null;
  /** Null when finals are unknown for the phase (archive non-regular season). */
  finals: number | null;
}
export interface NearestGameDates { before: string | null; after: string | null }
export interface ScheduleDatesResponse {
  release_id: string;
  dataset_id: string;
  start: string;
  end: string;
  phase: string | null;
  before_date: string | null;
  focus: string;
  days: ScheduleDateCount[];
  nearest_scheduled: NearestGameDates;
  nearest_finals: NearestGameDates;
  warnings: string[];
}
