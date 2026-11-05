import { browserApi } from "./workbench-api";

/**
 * Research → zTS (R04, courtlens-zts-validation-v1). Every zTS number is the frozen run's, served
 * unrounded; minutes, scoring usage and TS add come from the served impact bundle. The page
 * rounds only for display and writes exact values on `data-value`.
 */
export type ZtsStatus = "known" | "no_rts" | "small_sample" | "no_play_types" | "source_rows_missing" | "low_coverage";
export interface Interval { value: number; low: number; high: number }
export interface ValidationBlock {
  rows: number; players: number; verdict_r: Verdict; verdict_mse?: Verdict;
  metrics: Record<"r_rts" | "r_zts" | "r_difficulty" | "delta_r", Interval> & Partial<Record<"mse_rts" | "mse_zts" | "delta_mse", Interval>>;
}
export type Verdict = "zts_better" | "rts_better" | "no_clear_difference";
export interface ValidationSplit { seasons: string[]; pooled: ValidationBlock; by_season: Record<string, ValidationBlock> }
export interface LeagueType { play_type: string; label: string; ts: number; share: number; points: number; scoring_possessions: number }
export interface ZtsSummary {
  registration: { identity: string; content_sha256: string; registered_on: string };
  results_sha256: string;
  inputs: { impact_bundle_sha256: string; dataset_id: string };
  fta_check: {
    population: string; player_seasons: number; exact_matches: number; derivable: boolean; rule: string;
    ratio_proxy_to_box_fta: Record<"p01" | "p05" | "p25" | "p50" | "p75" | "p95" | "p99", number>;
  };
  coverage: Record<string, { player_seasons: number; status: Partial<Record<ZtsStatus, number>> }>;
  references: Record<string, { ts: number; scoring_possessions: number; types: LeagueType[] }>;
  validation: Record<"predictive" | "tracking", Record<"choice" | "test", ValidationSplit>>;
  seasons: string[];
  definitions: Record<"rts" | "play_type_ts" | "expected_ts" | "difficulty" | "zts" | "league", string>;
  reasons: Record<string, string>;
  play_type_labels: Record<string, string>;
  parameters: { min_tsa: number; min_coverage: number; source_min_possessions: number };
  credit: string; no_interval: string; volume_note: string;
}
export interface TeamRef { team_id: string; tricode: string | null }
export interface ZtsRow {
  player_id: string; player_name: string; season: string; rank?: number;
  zts_status: ZtsStatus; reason: string | null;
  rts: number | null; tsa: number | null; expected_ts: number | null; difficulty: number | null; zts: number | null;
  synergy_ts: number | null; coverage: number | null; listed_possessions: number | null; implied_possessions: number | null;
  minutes: number | null; off_possessions: number | null; scoring_usage: number | null; ts_add: number | null; zts_add: number | null;
  teams: TeamRef[];
}
export type Unknown = { status: "unknown"; season: string; reason: string; seasons?: string[] };
export interface Leaderboard {
  status: "available"; season: string; seasons: string[]; sort: "zts" | "zts_add"; league_ts?: number;
  known: number; ranked: number; rows: ZtsRow[]; unknown: ZtsRow[]; results_sha256: string; volume_note: string;
}
export interface PlayerType {
  play_type: string; label: string; possessions: number; scoring_possessions: number; points: number;
  share: number; league_share: number; ts: number | null; league_ts: number; relative_ts: number | null; contribution: number;
}
export interface PlayerZts extends Omit<ZtsRow, "season"> {
  status: "available"; season: string; league_ts: number; dropped_row: boolean | null;
  play_types: PlayerType[]; history: ZtsRow[]; selection_rule: string | null;
}
export type PlayerResult = PlayerZts | (Unknown & { player_id: string; player_name: string; history: ZtsRow[]; selection_rule: string | null });

async function read<T>(path: string, params: Record<string, string>, signal?: AbortSignal): Promise<T> {
  const query = Object.keys(params).length ? `?${new URLSearchParams(params)}` : "";
  const response = await fetch(`${browserApi}/api/zts${path}${query}`, { signal });
  if (!response.ok) {
    const body = await response.json().catch(() => null) as { detail?: string } | null;
    throw new Error(typeof body?.detail === "string" ? body.detail : `zTS request failed (${response.status})`);
  }
  return response.json() as Promise<T>;
}
export const getZts = (signal?: AbortSignal) => read<ZtsSummary>("", {}, signal);
export const getLeaderboard = (season: string, sort: "zts" | "zts_add", limit: number, signal?: AbortSignal) =>
  read<Leaderboard | Unknown>("/leaderboard", { season, sort, limit: String(limit) }, signal);
export const getPlayerZts = (playerId: string | null, season: string, signal?: AbortSignal) =>
  read<PlayerResult>("/player", playerId ? { playerId, season } : {}, signal);

const known = (value: number | null | undefined): value is number => typeof value === "number" && Number.isFinite(value);

/** TS-scale fractions shown as points (0.0123 → "+1.2"), the scale Databallr and the Stats table use. */
export const formatPoints = (value: number | null | undefined, digits = 1) =>
  known(value) ? `${value > 0 ? "+" : value < 0 ? "−" : ""}${Math.abs(value * 100).toFixed(digits)}` : "—";
export const formatTs = (value: number | null | undefined, digits = 1) => known(value) ? (value * 100).toFixed(digits) : "—";
export const formatShare = (value: number | null | undefined, digits = 1) => known(value) ? `${(value * 100).toFixed(digits)}%` : "—";
export const formatNumber = (value: number | null | undefined, digits = 1) =>
  known(value) ? value.toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits }) : "—";
export const formatSigned = (value: number | null | undefined, digits = 1) =>
  known(value) ? `${value > 0 ? "+" : value < 0 ? "−" : ""}${Math.abs(value).toFixed(digits)}` : "—";
export const formatWhole = (value: number | null | undefined) => known(value) ? Math.round(value).toLocaleString("en-US") : "—";

export const VERDICT_LABELS: Record<Verdict, string> = {
  zts_better: "zTS better", rts_better: "rTS better", no_clear_difference: "No clear difference"
};
export const STATUS_LABELS: Record<ZtsStatus, string> = {
  known: "Served", no_rts: "No rTS", small_sample: "Under 200 TSA", no_play_types: "No play types",
  source_rows_missing: "Source rows missing", low_coverage: "Under 90% covered"
};

/** Bands named on the page: Hard role ≥ +2 points, Easy role ≤ −2, Middle band within ±1. */
export function difficultyBands(rows: Pick<ZtsRow, "difficulty">[]) {
  const values = rows.map(row => row.difficulty).filter(known).map(value => value * 100);
  const sorted = [...values].sort((a, b) => a - b);
  const mid = sorted.length / 2;
  const median = sorted.length === 0 ? null : sorted.length % 2 ? sorted[Math.floor(mid)] : (sorted[mid - 1] + sorted[mid]) / 2;
  return {
    players: values.length,
    hard: values.filter(v => v >= 2).length,
    easy: values.filter(v => v <= -2).length,
    middle: values.filter(v => Math.abs(v) < 1).length,
    mean: values.length ? values.reduce((sum, v) => sum + v, 0) / values.length : null,
    median,
  };
}

/** One-point bins of difficulty (in TS points), floor-aligned, covering every value. */
export function difficultyHistogram(rows: Pick<ZtsRow, "difficulty">[]) {
  const values = rows.map(row => row.difficulty).filter(known).map(value => value * 100);
  if (!values.length) return [];
  const lo = Math.floor(Math.min(...values)), hi = Math.floor(Math.max(...values));
  return Array.from({ length: hi - lo + 1 }, (_, i) => {
    const from = lo + i;
    return { from, to: from + 1, count: values.filter(v => v >= from && v < from + 1).length };
  });
}

/** The page's named rule for the default pair: hardest and easiest role among 1,000+ minute players with scoring usage ≥ 25. */
export function defaultPair(rows: ZtsRow[]): [ZtsRow, ZtsRow] | null {
  const pool = rows.filter(row => known(row.difficulty) && (row.minutes ?? 0) >= 1000 && (row.scoring_usage ?? 0) >= 25);
  if (pool.length < 2) return null;
  const byDifficulty = [...pool].sort((a, b) => (b.difficulty as number) - (a.difficulty as number) || a.player_id.localeCompare(b.player_id));
  return [byDifficulty[0], byDifficulty[byDifficulty.length - 1]];
}
export const DEFAULT_PAIR_RULE = "Default pair: in the chosen season, the hardest and easiest role (Playtype Difficulty) among players with 1,000+ minutes and scoring usage of 25 or more. A selection rule, not a judgement of the players.";
export const EXTREMES_RULE = "Players with 1,000+ minutes in the chosen season, five most negative and five most positive Playtype Difficulty.";
