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
    gates?: { A1?: { improvement: Interval; passed: boolean }; A2?: { ece: number; limit: number; passed: boolean } };
    steps?: Record<string, { accepted: boolean; selection_gain: Interval }>;
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

// ---- F03 (RD14) page helpers ------------------------------------------------------------------------------------------------

/** "−0.0336 to +0.0167": a 95% interval's ends, signed. */
export function band(value: Interval | null | undefined, digits = 4): string {
  return value ? `${signed(value.low, digits)} to ${signed(value.high, digits)}` : "—";
}

/** Green or red only where the 95% interval excludes zero (RD04); positive means CourtLens did better. */
export function gapTone(value: Interval | null | undefined): "good" | "bad" | undefined {
  if (!value) return undefined;
  if (value.low > 0) return "good";
  if (value.high < 0) return "bad";
  return undefined;
}

export type Verdict = "better" | "worse" | "tied";
export function verdictOf(value: Interval | null | undefined): Verdict | null {
  if (!value) return null;
  return value.low > 0 ? "better" : value.high < 0 ? "worse" : "tied";
}

/** Phases of the final test where the gap against ESPN clears zero, in page order. */
export function clearPhases(card: WinProbabilityPage["card"]): { better: string[]; worse: string[]; tied: string[] } {
  const out = { better: [] as string[], worse: [] as string[], tied: [] as string[] };
  for (const name of PHASE_ORDER) {
    const row = card.espn.comparison[name];
    if (!row) continue;
    const v = verdictOf(row.log_loss.espn_minus_courtlens);
    if (v) out[v === "better" ? "better" : v === "worse" ? "worse" : "tied"].push(name);
  }
  return out;
}

/** "a", "a and b", "a, b and c". */
export function listOf(items: readonly string[]): string {
  return items.length < 2 ? (items[0] ?? "") : `${items.slice(0, -1).join(", ")} and ${items.at(-1)}`;
}

/** One table of a season's credited players: the served WPA leaders and clutch leaders, each player once (both lists carry both values). */
export function wpaRows(table: WinProbabilityAdded): WpaRow[] {
  const seen = new Map<string, WpaRow>();
  for (const row of [...table.leaders, ...table.clutch_leaders]) if (!seen.has(row.player)) seen.set(row.player, row);
  return [...seen.values()];
}

export type WpaSortKey = "wpa" | "events" | "clutch_wpa" | "clutch_events" | "games";
export interface WpaSort { key: WpaSortKey; direction: "asc" | "desc" }
export const WPA_DEFAULT_SORT: WpaSort = { key: "wpa", direction: "desc" };

/** Sorted by the chosen value, ties by name; never ranked (no interval is served). */
export function sortWpa(rows: readonly WpaRow[], sort: WpaSort): WpaRow[] {
  const sign = sort.direction === "asc" ? 1 : -1;
  return [...rows].sort((a, b) => sign * (a[sort.key] - b[sort.key]) || a.name.localeCompare(b.name));
}
