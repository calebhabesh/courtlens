import { browserApi } from "./workbench-api";

/**
 * Research → Shot Quality (R05, courtlens-expected-shot-v2). Every number is the frozen run's,
 * served unrounded. The page rounds only for display and writes exact values on `data-value`.
 */
export type ModelName = "baseline" | "reference" | "logistic_spline" | "lightgbm_31" | "lightgbm_127";
export type Pair = [number, number];
export interface ModelMetrics {
  brier: number; log_loss: number; points_mae: number; ece: number;
  mean_predicted: number; observed: number; expected_points_per_shot: number; actual_points_per_shot: number;
}
export interface Difference {
  brier: { difference: number; interval: Pair }; log_loss: { difference: number; interval: Pair };
  points_mae: { difference: number; interval: Pair };
  relative_brier: { value: number; interval: Pair }; relative_log_loss: { value: number; interval: Pair };
}
export interface MetricBlock {
  attempts: number; games: number;
  models: Partial<Record<ModelName, ModelMetrics>>;
  versus_baseline: Partial<Record<ModelName, Difference>>;
}
export interface CurveBin { bin: number; count: number; low: number; high: number; mean_predicted: number; observed: number }
export interface Slice { family: string; label: string; attempts: number; metrics?: MetricBlock }
export interface Persistence { r: number; interval: Pair }
export interface LeagueSeason { league_term: number; league_pps: number; league_xpps: number; attempts: number; served: number }
export interface DataSeason {
  rows: number; games: number; join_rate: number; join: Record<string, number>;
  possession_known_rate: number; possession: Record<string, number>; and_ones: number;
  assist_in_description: Record<string, number>;
}
export type Outcome = "accepted" | "selection_failed_negative_result" | "test_failed_negative_result";
export interface ShotQualitySummary {
  registration: { identity: string; content_sha256: string; registered_on: string };
  results_sha256: string;
  outcome: Outcome; outcome_text: string; serving_model: ModelName;
  model_labels: Record<ModelName, string>;
  data: Record<string, DataSeason>;
  selection: {
    season: string; chosen: ModelName; relative_brier: number; gate: number; passed: boolean;
    metrics: MetricBlock; training_attempts: number; vocabulary_sizes: Record<string, number>;
    fits: Record<string, Record<string, number>>;
  };
  calibration: { season: string; platt: Partial<Record<ModelName, { a: number; b: number; iterations: number }>> };
  test: {
    seasons: string[]; accepted: boolean; failed_gates: string[];
    gates: Partial<{
      relative_brier: { value: number; threshold: number; brier_difference_interval: Pair; passed: boolean };
      log_loss: { difference: number; interval: Pair; passed: boolean };
      ece: { value: number; threshold: number; passed: boolean };
    }>;
    pooled: MetricBlock; uncalibrated: MetricBlock; by_season: Record<string, MetricBlock>;
    curves: Partial<Record<ModelName, CurveBin[]>>; slices: Slice[];
  };
  players: {
    model: ModelName; min_attempts: number; seasons: string[]; league: Record<string, LeagueSeason>;
    persistence: { pairs: number; players: number } & Record<"shot_making" | "xpps" | "pps_minus_league", Persistence>;
  };
  definitions: Record<"target" | "features" | "xpps" | "pps" | "shot_making" | "interval" | "metrics", string>;
  reasons: Record<string, string>;
  credit: string; reference_note: string; example_rule: string;
}
export interface TeamRef { team_id: string; tricode: string | null }
export interface PlayerRow {
  player_id: string; player_name: string; status: "served" | "small_sample"; reason: string | null;
  fga: number; games: number | null; pps: number; xpps: number; fg_pct: number; three_share: number;
  shot_making: number | null; interval: Pair | null; team_id: string; tricode: string | null; teams: TeamRef[];
}
export type Unknown = { status: "unknown"; season: string; reason: string; seasons?: string[] };
export interface Leaderboard {
  status: "available"; season: string; sort: Sort; team: string | null; min_fga: number;
  rows: PlayerRow[]; unknown: PlayerRow[]; league: LeagueSeason; teams: TeamRef[]; seasons: string[];
  model: ModelName; results_sha256: string;
}
export type Sort = "shot_making" | "xpps" | "pps" | "fga";
export interface PlayerHistory {
  status: "available" | "unknown"; player_id: string; player_name: string; selection_rule: string | null;
  reason?: string; seasons?: (Omit<PlayerRow, "player_name"> & { season: string })[];
}

async function read<T>(path: string, params: Record<string, string>, signal?: AbortSignal): Promise<T> {
  const query = Object.keys(params).length ? `?${new URLSearchParams(params)}` : "";
  const response = await fetch(`${browserApi}/api/shot-quality${path}${query}`, { signal });
  if (!response.ok) {
    const body = await response.json().catch(() => null) as { detail?: string } | null;
    throw new Error(typeof body?.detail === "string" ? body.detail : `Shot Quality request failed (${response.status})`);
  }
  return response.json() as Promise<T>;
}
export const getShotQuality = (signal?: AbortSignal) => read<ShotQualitySummary>("", {}, signal);
export const getPlayers = (season: string, sort: Sort, team: string | null, minFga: number, signal?: AbortSignal) =>
  read<Leaderboard | Unknown>("/players", { season, sort, minFga: String(minFga), ...(team ? { team } : {}) }, signal);
export const getPlayerShots = (playerId: string | null, signal?: AbortSignal) =>
  read<PlayerHistory>("/player", playerId ? { playerId } : {}, signal);

const known = (value: number | null | undefined): value is number => typeof value === "number" && Number.isFinite(value);
const sign = (value: number) => (value > 0 ? "+" : value < 0 ? "−" : "");

export const formatSigned = (value: number | null | undefined, digits = 1) =>
  known(value) ? `${sign(value)}${Math.abs(value).toFixed(digits)}` : "—";
export const formatFixed = (value: number | null | undefined, digits = 3) => (known(value) ? value.toFixed(digits) : "—");
export const formatShare = (value: number | null | undefined, digits = 1) => (known(value) ? `${(value * 100).toFixed(digits)}%` : "—");
export const formatPercentSigned = (value: number | null | undefined, digits = 2) =>
  known(value) ? `${sign(value)}${Math.abs(value * 100).toFixed(digits)}%` : "—";
export const formatWhole = (value: number | null | undefined) => (known(value) ? Math.round(value).toLocaleString("en-US") : "—");
export const formatInterval = (pair: Pair | null | undefined, format: (v: number) => string) =>
  pair ? `${format(pair[0])} to ${format(pair[1])}` : "—";
/** +/- tone for a good/bad signal: green above zero, red below, none at zero or unknown. */
export const signTone = (value: number | null | undefined): "positive" | "negative" | undefined =>
  known(value) && value !== 0 ? (value > 0 ? "positive" : "negative") : undefined;

export const MIN_FGA = ["300", "500", "750", "1000"] as const;
export const SORT_OPTIONS: { value: Sort; label: string }[] = [
  { value: "shot_making", label: "Shot-making" }, { value: "xpps", label: "xPPS" },
  { value: "pps", label: "PPS" }, { value: "fga", label: "FGA" },
];
export const GATE_LABELS: Record<"relative_brier" | "log_loss" | "ece", string> = {
  relative_brier: "Brier improves by at least 1%, interval above 0",
  log_loss: "Log loss improves, interval above 0",
  ece: "Calibration error (ECE) at most 0.02",
};
export const SLICE_FAMILIES: Record<string, string> = {
  zone: "Shot zone", value: "Shot value", season: "Test season",
  possession_seconds: "Seconds since possession start", offensive_rebound: "Possession",
};

/** Calibration bins in the shared ReliabilityPlot's shape. */
export const reliabilityBins = (bins: CurveBin[] | undefined) => (bins ?? []).map(b => ({
  lower: b.low, upper: b.high, rows: b.count, mean_probability: b.mean_predicted, observed_rate: b.observed,
}));
