/** Research → Win Probability: the frozen model's card, scorecard and player credit. */

export interface Interval { mean: number; low: number; high: number; games: number }
export interface UpgradeResult {
  version: string; adopted: boolean; test_seasons: string[]; games: number;
  comparisons: { v3_vs_v2_frozen: Interval; B_vs_v2_frozen: Interval; v3_vs_B: Interval };
  pregame: { games: number; v2_mu0: { rmse: number }; v3_mu0: { rmse: number } };
  selection: Record<string, { accepted: boolean; improvement_90?: Interval; judged_on?: string }>;
}
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
  /** F05: a second model tested against the frozen one on the same games; null before it ran. */
  upgrade?: UpgradeResult | null;
  /** W3b: the Market-informed model against the Original on the same seals; null before the first scoring run. */
  head_to_head?: HeadToHead | null;
  protocol_notes?: ProtocolNote[];
  /** W5 */
  head_to_head_calibration?: HeadToHeadCalibration | null;
  worked_example?: WorkedExample | null;
  do_no_harm?: DoNoHarm | null;
  /** courtlens-pregame-nonlinear-v1: trees on the own read's inputs against the frozen linear fit; null before it ran. */
  pregame_nonlinear?: PregameNonlinear | null;
}
export interface TrialRead { games: number; through: string; v1: Interval & { result: string }; v2: Interval & { result: string; phases: Record<string, Interval & { result: string }> } }
export interface HeadToHead {
  games: number; report_from_games: number; verdict_at_games: number; games_without_line: number; updated_at: string;
  model: { version: string; manifest_sha256: string; frozen_at: string; w: number };
  record_of_calls: { games: number; original: number; market_informed: number; line: { games: number; right: number }; toss_ups: number; toss_ups_by_model?: { original: number; market_informed: number } };
  current: TrialRead | null; too_early_to_call: boolean; reads: (TrialRead & { kind: "verdict" | "final"; read_at: string })[];
  /** The model Live leads with (W-D16: the Original), and what the registered rule would serve. */
  serving_model: { model: "original" | "market_informed"; reason: string; since?: string; registered_rule?: { model: "original" | "market_informed"; reason: string; since?: string } };
  seal_age_minutes: { median: number | null; maximum: number | null };
}
export interface ProtocolNote { date: string; kind: string; note: string }
export interface HeadToHeadCalibration { games: number; market_informed: { curve: CurvePoint[]; calibration_error: number }; original: { curve: CurvePoint[]; calibration_error: number } }
export interface WorkedExample {
  rule: string; stored: boolean;
  game: { game_id: string; date: string; home: string; away: string; home_score: number; away_score: number; calls: Record<string, number | null> } | null;
  why: WinProbabilityWhy | null;
}
export interface PregameScore { games: number; rmse: number; winner_accuracy: number }
export type PregameCandidate = PregameScore & { squared_error_gain: Interval; result: "better" | "worse" | "not distinguishable" };
/** A diagnostic: above zero, a candidate's squared margin error is lower than the linear own read's. */
export interface PregameNonlinear {
  registration: string; registration_sha256: string; seasons: string[]; games: number; train_games: number; inputs: number;
  linear: PregameScore; candidates: { trees: PregameCandidate; linear_plus_trees: PregameCandidate };
  correction_points: { mean_abs: number; max_abs: number };
}
/** "worse", "better" or "no clear difference", from a candidate's registered result. */
export function candidateResult(candidate: Pick<PregameCandidate, "result">): string {
  return candidate.result === "not distinguishable" ? "no clear difference" : candidate.result;
}
export interface DoNoHarm { games: number; seasons: string[]; log_loss_gain: Interval; squared_error_gain: Interval; calibration_error: number; calibration_limit: number; passed: boolean }
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

/** W4: one input of the own forecast, coefficient x value = contribution (home margin points). */
export interface WhyRow { input: string; label: string; value: number; coefficient: number; contribution: number }
export interface WhyGroup { group: "players" | "form" | "home_court" | "rest_travel"; label: string; contribution: number; rows: WhyRow[] }
export interface WhyOutPlayer { name: string; player_id: string | null; minutes: number | null; rating: number | null; cost: number | null; default_rating: boolean | null }
export interface WhyPlayer { name: string; player_id: string; minutes: number; rating: number; default_rating: boolean }
/** The pregame "why" for one game, built from its seal (`/api/win-probability/games/{id}/breakdown`). */
export interface WinProbabilityWhy {
  game_id: string; date: string; home: string; away: string; tip_off: string | null; captured_at: string; seal: string;
  model: "original" | "market_informed"; serving: "original" | "market_informed";
  own: { own: number; groups: WhyGroup[] };
  market:
    | { status: "ok"; w: number; line: number; book: string | null; details: string | null; adjustment: number }
    | { status: "no_line"; w: number }
    | { status: "sealed_before_freeze" | "unavailable" };
  /** W-D16: the own read, the Original's margin and tip-off chance. */
  prediction: { home_margin: number; home_win: number };
  /** The Market-informed model on the same seal, when it had a line; shown beside the prediction. */
  market_informed?: { home_margin: number; home_win: number } | null;
  tip_off_home: { original: number; market_informed: number };
  out: { home: WhyOutPlayer[]; away: WhyOutPlayer[] } | null;
  players: { home: WhyPlayer[]; away: WhyPlayer[] } | null;
  ages: { box_through?: string; rating_snapshot_cutoff?: string; injury_report_at?: string; roster_observed_at?: string } | null;
  availability_note: string;
  result: { home_score: number; away_score: number; calls: Record<string, number | null> | null } | null;
  manifest_sha256: string;
}

/** One bar of the "why" chart, in home-margin points (above zero: toward the home team). */
export interface WhyBar { key: string; label: string; points: number; kind: "group" | "prediction" | "market"; homeWin?: number }

/**
 * The panel's rows in order: each group, then the prediction they add up to (the own read), then,
 * when the seal had a line, the Market-informed model's margin as a comparison row.
 */
export function whyBars(why: Pick<WinProbabilityWhy, "own" | "market" | "prediction" | "market_informed">): WhyBar[] {
  const bars: WhyBar[] = why.own.groups.map(g => ({ key: g.group, label: g.label, points: g.contribution, kind: "group" }));
  bars.push({ key: "prediction", label: "Prediction: CourtLens' own read", points: why.prediction.home_margin, kind: "prediction", homeWin: why.prediction.home_win });
  if (why.market.status === "ok" && why.market_informed) bars.push({ key: "market", label: "With the betting line", points: why.market_informed.home_margin, kind: "market", homeWin: why.market_informed.home_win });
  return bars;
}

/** "PHI +3.1" toward the team the points favour; "Even" when they round to zero. */
export function towardTeam(points: number, home: string, away: string, digits = 1): string {
  const rounded = Number(Math.abs(points).toFixed(digits));
  if (rounded === 0) return "Even";
  return `${points > 0 ? home : away} +${rounded.toFixed(digits)}`;
}

/** "PHI by 7.5" for a home margin. */
export function marginText(points: number, home: string, away: string, digits = 1): string {
  const rounded = Number(Math.abs(points).toFixed(digits));
  return rounded === 0 ? "Even" : `${points > 0 ? home : away} by ${rounded.toFixed(digits)}`;
}

/** Whether a final game went the way the sealed call said (null: exactly even, or no result). */
export function callRight(why: Pick<WinProbabilityWhy, "prediction" | "result">): boolean | null {
  if (!why.result || why.prediction.home_win === 0.5) return null;
  return (why.result.home_score > why.result.away_score) === (why.prediction.home_win > 0.5);
}

// ---- Round 3: the "How the model works" flow --------------------------------------------------------------------

/** One stream into the flow diagram, in home-margin points (above zero: toward the home team). */
export interface FlowStream { key: WhyGroup["group"]; label: string; points: number }
export interface WhyFlow {
  inputs: FlowStream[];
  own: number;
  /**
   * The second path (W-D16): the betting line's home margin, its fitted weight, and the margin and
   * chance the Market-informed model gets from it; or why there is none.
   */
  line: { status: "ok"; points: number; w: number; book: string | null; margin: number; homeWin: number } | { status: "no_line" | "sealed_before_freeze" | "unavailable" };
  /** The pregame margin CourtLens leads with: the own read. */
  margin: number;
  homeWin: number;
}

/** The seal's numbers in the diagram's order: inputs, own read, the pregame margin, the win chance; the line's path beside them. */
export function whyFlow(why: Pick<WinProbabilityWhy, "own" | "market" | "prediction" | "market_informed">): WhyFlow {
  const m = why.market;
  const line: WhyFlow["line"] = m.status === "ok" && why.market_informed
    ? { status: "ok", points: m.line, w: m.w, book: m.book, margin: why.market_informed.home_margin, homeWin: why.market_informed.home_win }
    : { status: m.status === "ok" ? "unavailable" : m.status };
  return {
    inputs: why.own.groups.map(g => ({ key: g.group, label: g.label, points: g.contribution })),
    own: why.own.own,
    line,
    margin: why.prediction.home_margin,
    homeWin: why.prediction.home_win,
  };
}

/** A ribbon between two columns of the diagram: its top edge at each end and its thickness, in SVG units. */
export interface Ribbon { x0: number; y0: number; x1: number; y1: number; size: number }

/** A filled band from (x0, y0) to (x1, y1), `size` thick, as one SVG path. */
export function ribbonPath({ x0, y0, x1, y1, size }: Ribbon): string {
  const mid = (x0 + x1) / 2;
  const r = (n: number) => Math.round(n * 100) / 100;
  return `M${r(x0)} ${r(y0)}C${r(mid)} ${r(y0)} ${r(mid)} ${r(y1)} ${r(x1)} ${r(y1)}L${r(x1)} ${r(y1 + size)}C${r(mid)} ${r(y1 + size)} ${r(mid)} ${r(y0 + size)} ${r(x0)} ${r(y0 + size)}Z`;
}

/** Ribbon thickness for a number of points: proportional, with a visible floor for anything above zero. */
export function ribbonSize(points: number, scale: number, floor = 3): number {
  const size = Math.abs(points) * scale;
  return size === 0 ? 0 : Math.max(floor, size);
}
