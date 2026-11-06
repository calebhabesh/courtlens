import { browserApi } from "./workbench-api";

/**
 * Research → Models → Lineup Model (R14, courtlens-lineup-model-v1). Every number is the frozen
 * results', the serving manifest's or the lineup tool's, served unrounded; the page rounds only
 * for display and keeps exact values on `data-value`. Verdicts are the runner's, computed with the
 * registered rule; the page never ranks anything itself.
 */
export interface Band { low: number; high: number }
export interface Gain extends Band { gain: number }
export interface Scored extends Band { wrmse: number }
export interface ModelBlock { seasons: Record<string, Scored>; pooled: Scored }
export type Verdict = "lineup_better" | "ridge_better" | "no_difference";
export type PairVerdict = "candidate_better" | "reference_better" | "no_ranking";
export type Status = "own" | "box" | "newcomer";

export interface Identity {
  player_id: string; name: string | null; photo_season: string | null; team_id: string | null;
  tricode: string | null; status: Status | null; window_possessions: number | null;
}
export interface MapPoint extends Identity { x: number; y: number }
export interface Diagnostics {
  test_stints: number; test_games: number; own_players: number; interaction_sd_per100: number;
  additive_sd_per100: number; prediction_correlation_with_ridge: number; max_abs_interaction_per100: number;
}
export interface Subset { stints: number; possession_share: number; ridge: number; lineup: number }
export interface GridRow { seasons: Record<string, number>; pooled: number; dim?: number; penalty?: number }
export interface SeasonCoverage {
  games: number; stints: number; usable_stints: number; dropped_stints_one_side_no_possession: number;
  possessions: number; usable_possessions: number; players: number; neutral_stints: number; first_date: string; last_date: string;
}
export interface ColdStart {
  window: string[]; training_stints: number; players_in_window: number; own_embedding: number;
  fallback_in_window: number; window_possession_share_own: number;
  threshold_sensitivity_players_at_or_above: Record<string, number>;
  target?: {
    stints: number; players: number; own_embedding: number; box_fallback: number; newcomer_no_box_in_window: number;
    possession_share_own: number; possession_share_box_fallback: number; possession_share_newcomer: number;
    stints_with_any_fallback_player: number;
  };
  fallback_reads: { features: string[]; seasons: string[]; standardized_on: string; newcomer: string };
}
export interface BacktestScore { rmse: number; accuracy: number; brier: number; log_loss: number; games: number; intervals: Record<string, Band> }
export interface BacktestPair {
  candidate: string; reference: string; seasons: string[]; games: number;
  per_season: Record<string, Record<string, Gain>>; pooled: Record<string, Gain>;
  seasons_candidate_lower_rmse: number; verdict: PairVerdict;
}
export interface Backtest {
  version: string; results_sha256: string; registration_sha256: string;
  games_per_season: Record<string, number>; games_without_stints: Record<string, number>;
  candidates: Record<string, { test_seasons: string[]; seasons: Record<string, BacktestScore>; pooled: BacktestScore }>;
  pairs: BacktestPair[];
  verdict: { rule: string; lineup_model_against: Record<string, "lineup_better" | "other_better" | "no_ranking">; best: string[]; unranked_pairs: number };
}
export interface LineupModelPage {
  results: {
    version: string; results_sha256: string; selection_sha256: string; selected_alpha: number;
    selected_config: { dim: number; penalty: number }; test_seasons: string[];
    models: Record<"lineup" | "ridge" | "home_only", ModelBlock>;
    gains: Record<"lineup_over_ridge" | "lineup_over_home_only" | "ridge_over_home_only", { seasons: Record<string, Gain>; pooled: Gain }>;
    verdict: Verdict; seasons_lineup_lower: number; rule: string;
    subsets: Record<"all_ten_own" | "any_fallback", Record<string, Subset>>;
    diagnostics: Record<string, Diagnostics>; versions: Record<string, string>; game_strengths_sha256: string;
  };
  registration: {
    identity: string; content_sha256: string; registered_on: string;
    parameters: {
      window_seasons: number; selection_seasons: string[]; test_seasons: string[]; min_possessions: number; box_features: string[];
      seeds: number[]; heads: number; epochs: number; rounds: number; replicates: number; level: number; bootstrap_refits: number;
      panel_lineups: number; umap: Record<string, string | number>; package_versions: Record<string, string>;
      dataset_sha256: { stints_sha256: string; boxes_sha256: string };
    };
  };
  selection: {
    seasons: string[]; ridge_alpha_grid: Record<string, GridRow>; selected_alpha: number;
    lineup_grid: Record<string, GridRow>; selected_config: { dim: number; penalty: number; key: string }; rule: string; selection_sha256: string;
  };
  coverage: {
    seasons: Record<string, SeasonCoverage>; totals: Record<string, number>; cold_start: Record<string, ColdStart>;
    threshold: number; excluded_games: string; leakage_plan: string[];
  };
  map: {
    method: Record<string, string | number>; window: string[];
    seed_stability: { neighbours: number; players: number; overlap_with_seed_1401: Record<string, number>; mean_overlap: number; chance: number };
    points: MapPoint[];
  };
  serving: {
    season: string; window: string[]; panel_season: string; panel_size: number; serving_sha256: string;
    bootstrap_refits: number; interval_percentiles: number[]; tool_available: boolean; default_five: string[];
  };
  backtest: Backtest | null;
  credits: { what: string; who: string }[];
  caveats: string[];
}
export interface ToolPlayer extends Identity { ridge_rating: number; lineup_additive_rating: number }
export interface PlayersPage { state: "ready" | "unavailable"; window?: string[]; players: ToolPlayer[] }
export interface FitResult {
  state: "ready" | "unavailable" | "no_opponents"; reason?: string; players?: Identity[]; opponents?: number; panel_size?: number;
  lineup_model?: { net: number; low: number; high: number; additive: number; interaction: number; seeds: number[] };
  ridge?: { net: number; low: number; high: number };
  refits?: number;
}

async function get<T>(path: string, what: string, signal?: AbortSignal): Promise<T> {
  const response = await fetch(`${browserApi}${path}`, { signal });
  if (!response.ok) {
    const body = await response.json().catch(() => null) as { detail?: string } | null;
    throw new Error(typeof body?.detail === "string" ? body.detail : `${what} request failed (${response.status})`);
  }
  return response.json() as Promise<T>;
}

export const getLineupModel = (signal?: AbortSignal) => get<LineupModelPage>("/api/lineup-model", "Lineup model", signal);
export const getLineupPlayers = (signal?: AbortSignal) => get<PlayersPage>("/api/lineup-model/players", "Lineup players", signal);
export const getLineupFit = (ids: readonly string[], signal?: AbortSignal) =>
  get<FitResult>(`/api/lineup-model/fit?players=${ids.map(encodeURIComponent).join(",")}`, "Lineup fit", signal);

export const VERDICT_TEXT: Record<Verdict, string> = {
  lineup_better: "The lineup model predicts held-out stints better than ridge",
  ridge_better: "Ridge predicts held-out stints better than the lineup model",
  no_difference: "No difference: neither model predicts held-out stints better",
};
export const SHORT_VERDICT: Record<Verdict, string> = { lineup_better: "Lineup model better", ridge_better: "Ridge better", no_difference: "No difference" };
export const PAIR_TEXT: Record<"lineup_better" | "other_better" | "no_ranking", string> = {
  lineup_better: "Lineup model better", other_better: "Lineup model worse", no_ranking: "No ranking",
};
export const STATUS_TEXT: Record<Status, string> = {
  own: "Own vector (1,000+ possessions)", box: "Box-score fallback", newcomer: "Newcomer (no window minutes)",
};
export const CANDIDATE_LABELS: Record<string, string> = {
  team_net: "Team net (baseline)", plus_minus: "Plus-minus", on_off: "On/off", rapm_1y: "RAPM 1Y", rapm_3y: "RAPM 3Y",
  box_prior_rapm: "Box-prior RAPM", time_decay: "Time decay, monthly", time_decay_opener: "Time decay, opener",
  projected_impact: "Projected Impact", lineup_model: "Lineup model", lineup_ridge: "Ridge, same stints",
};

export const fixed = (v: number, digits = 2) => v.toFixed(digits);
export const signed = (v: number, digits = 2) => `${v >= 0 ? "+" : "−"}${Math.abs(v).toFixed(digits)}`;
export const percent = (v: number, digits = 1) => `${(100 * v).toFixed(digits)}%`;
export const whole = (v: number) => Math.round(v).toLocaleString("en-US");
export const bandText = (b: Band, digits = 2) => `${fixed(b.low, digits)} to ${fixed(b.high, digits)}`;
/** Enough decimals to show two significant figures of the largest value (tiny gains stay legible). */
export function digitsFor(values: readonly number[], digits = 2): number {
  const largest = Math.max(...values.map(Math.abs));
  if (!(largest > 0) || largest >= 10 ** -digits * 10) return digits;
  return Math.min(10, Math.max(digits, 1 - Math.floor(Math.log10(largest))));
}
export const gainText = (g: Gain, digits = 2) => {
  const d = digitsFor([g.gain, g.low, g.high], digits);
  return `${signed(g.gain, d)} (${signed(g.low, d)} to ${signed(g.high, d)})`;
};
/** Green or red only when the whole interval is on one side of zero. */
export const gainTone = (g: Band): "positive" | "negative" | undefined => g.low > 0 ? "positive" : g.high < 0 ? "negative" : undefined;

/** The page's lead sentences, built from the served verdict and gains only. */
export function verdictSentences(page: LineupModelPage): string[] {
  const r = page.results;
  const g = r.gains.lineup_over_ridge.pooled;
  const seasons = r.test_seasons.length;
  const out = [
    `${VERDICT_TEXT[r.verdict]} (registered rule).`,
    `Pooled over ${seasons} held-out seasons, ridge's error minus the lineup model's is ${gainText(g)} points per 100 possessions (95% interval); the lineup model is lower in ${r.seasons_lineup_lower} of ${seasons} seasons.`,
  ];
  const h = r.gains.ridge_over_home_only.pooled;
  out.push(`For scale: ridge beats a model that knows only home court by ${gainText(h)} points per 100.`);
  return out;
}
