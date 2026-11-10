/** Research → Win Probability: the frozen model's card, scorecard and player credit. */

export interface Interval { mean: number; low: number; high: number; games: number }
export interface CurvePoint { predicted: number; observed: number; share: number }
export interface ScoreGroup {
  games: number; first_date?: string; last_date?: string; espn_compared_games?: number;
  courtlens?: { log_loss: number; brier: number; calibration_error: number };
  curve_courtlens?: CurvePoint[]; curve_espn?: CurvePoint[];
  same_events?: {
    courtlens_log_loss: number; espn_log_loss: number; courtlens_brier: number; espn_brier: number;
    courtlens_calibration_error: number; espn_calibration_error: number; log_loss_gap: Interval | null; matched_state_share: number;
  };
}
export interface DriftPoint { date: string; games: number; status: DriftStatus; calibration_error: number | null; interval: { low: number; high: number } | null; minimum_games: number }
export type DriftStatus = "within" | "above" | "below" | "insufficient";
export interface RecentGame {
  date: string; game_id: string; home: string; away: string; home_score: number; away_score: number; prospective: boolean;
  availability: string | null; courtlens: { log_loss: number; brier: number };
  espn: { log_loss: number; brier: number; courtlens_log_loss: number; courtlens_brier: number } | null;
}
export interface Scorecard {
  updated_at: string; games_scored: number; prospective: ScoreGroup; pre_freeze_replay: ScoreGroup;
  drift: { basis: "prospective" | "pre_freeze_replay"; window_days: number; latest: DriftPoint; series: DriftPoint[] };
  recent_games: RecentGame[];
  availability_check: { games: number; mean_abs_mu_gap: number | null; p95_abs_mu_gap: number | null };
}
export interface ModelBlock { log_loss: Interval; brier: Interval; calibration_error: number; gain_on_baseline?: Interval | null }
export interface PhaseBlock extends ModelBlock { curve: CurvePoint[] }
export interface EspnPhase {
  log_loss: { courtlens: Interval; espn: Interval; espn_minus_courtlens: Interval };
  brier: { courtlens: Interval; espn: Interval; espn_minus_courtlens: Interval };
  ece?: { courtlens: number; espn: number };
}
export interface WinProbabilityPage {
  model: {
    version: string; registration: string; registration_sha256: string; manifest_sha256: string; frozen_at: string; selected: string; trained_through: string;
    models: Record<string, string>; pregame: { rating_rule: string; rating_source: string; player_rating: string; availability: string; form_half_life_days: number };
    drift_interval: { method: string; by_window_games: { games: number; low: number; high: number; median: number }[]; actual_30_day_windows: { count: number; minimum: number; maximum: number } };
  };
  card: {
    test_seasons: string[]; test_games: number; models: Record<string, ModelBlock>;
    phases: Record<string, PhaseBlock>; baseline_curve: CurvePoint[];
    espn: { games_compared: number; tipoff: EspnPhase; comparison: Record<string, EspnPhase> };
    market: { courtlens_rmse: number; market_rmse: number; games: number; squared_error_gap: Interval; source: string };
    pairs: { model: string; reference: string; label: string; overall: { log_loss: Interval; brier: Interval } }[];
  };
  scorecard: Scorecard | null;
  wpa_seasons: string[];
}
export interface WpaRow { player: string; player_id: string | null; name: string; team: string | null; games: number; wpa: number; events: number; clutch_wpa: number; clutch_events: number }
export interface WinProbabilityAdded { season: string; games: number; players: number; leaders: WpaRow[]; clutch_leaders: WpaRow[] }

/** A fixed-decimals value; unknown is a dash, never zero. */
export function metric(value: number | null | undefined, digits = 4): string {
  return value == null || !Number.isFinite(value) ? "—" : value.toFixed(digits);
}

export function signed(value: number | null | undefined, digits = 4): string {
  if (value == null || !Number.isFinite(value)) return "—";
  return `${value >= 0 ? "+" : ""}${value.toFixed(digits)}`;
}

export const PHASE_ORDER = ["overall", "first_half", "third_quarter", "fourth_early", "last_two", "overtime"];

export const PHASE_LABELS: Record<string, string> = {
  overall: "All states", first_half: "First half", third_quarter: "Third quarter",
  fourth_early: "Q4, before last 2 min", last_two: "Last 2 min", overtime: "Overtime",
};

export const DRIFT_COPY: Record<DriftStatus, { label: string; tone: "good" | "warning" | "unknown" }> = {
  within: { label: "Within the test-season interval", tone: "good" },
  above: { label: "Drift: above the test-season interval", tone: "warning" },
  below: { label: "Below the test-season interval", tone: "unknown" },
  insufficient: { label: "Too few games to judge", tone: "unknown" },
};
