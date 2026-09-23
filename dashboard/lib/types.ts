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
