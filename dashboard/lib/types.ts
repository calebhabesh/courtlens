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
