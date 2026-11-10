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

// ---- RD03: team playtype difficulty, role moves and presentation helpers ------------------------

export interface TeamPlayer {
  player_id: string; player_name: string; scoring_possessions: number; share: number;
  difficulty: number | null; zts_status: ZtsStatus | null; multi_team: boolean;
}
export interface ZtsTeam {
  team_id: string; tricode: string | null; rank: number; difficulty: number; expected_ts: number; synergy_ts: number;
  scoring_possessions: number; players: TeamPlayer[];
}
export interface TeamBoard {
  status: "available"; season: string; seasons: string[]; league_ts: number; league_difficulty: number; teams: ZtsTeam[];
  spread: { seasons: [string, string]; players: { values: number[]; sd: number }; teams: { values: number[]; sd: number } };
  note: string; teams_sha256: string;
}
export interface RoleMove { player_id: string; player_name: string; change: number; history: ZtsRow[] }
export interface RoleMoves { status: "available"; season: string; window: string[]; pool: number; rule: string; players: RoleMove[] }

export const getTeams = (season: string, signal?: AbortSignal) => read<TeamBoard | Unknown>("/teams", { season }, signal);
export const getRoleMoves = (season: string, signal?: AbortSignal) => read<RoleMoves | Unknown>("/role-moves", { season }, signal);

/** Gold above zero, blue below, none when the shown figure rounds to zero (no interval: identity tones, never green/red). */
export function signTone(value: number | null | undefined, digits = 1, scale = 100): "a" | "b" | undefined {
  if (!known(value)) return undefined;
  const shown = Number((value * scale).toFixed(digits));
  return shown > 0 ? "a" : shown < 0 ? "b" : undefined;
}

/** Gaussian kernel density on `xs` (Silverman's bandwidth unless given); values and xs share units. */
export function density(values: readonly number[], xs: readonly number[], bandwidth?: number): number[] {
  const n = values.length;
  if (!n) return xs.map(() => 0);
  const mean = values.reduce((s, v) => s + v, 0) / n;
  const sd = Math.sqrt(values.reduce((s, v) => s + (v - mean) ** 2, 0) / n);
  const h = bandwidth ?? Math.max(1.06 * sd * n ** -0.2, 1e-9);
  const k = 1 / (n * h * Math.sqrt(2 * Math.PI));
  return xs.map(x => k * values.reduce((s, v) => s + Math.exp(-0.5 * ((x - v) / h) ** 2), 0));
}

/** Plain (unweighted) Pearson correlation over pairs where both values are known; null under three pairs. */
export function pearson(pairs: readonly (readonly [number | null | undefined, number | null | undefined])[]): { r: number; n: number } | null {
  const ok = pairs.filter((p): p is readonly [number, number] => known(p[0]) && known(p[1]));
  const n = ok.length;
  if (n < 3) return null;
  const mx = ok.reduce((s, p) => s + p[0], 0) / n, my = ok.reduce((s, p) => s + p[1], 0) / n;
  let sxy = 0, sxx = 0, syy = 0;
  for (const [x, y] of ok) { sxy += (x - mx) * (y - my); sxx += (x - mx) ** 2; syy += (y - my) ** 2; }
  return sxx > 0 && syy > 0 ? { r: sxy / Math.sqrt(sxx * syy), n } : null;
}

/** The page's four play-type families (league TS pooled from the served points and scoring possessions). */
export const FAMILIES = [
  { key: "creation", label: "Creation", types: ["isolation", "prballhandler", "offscreen", "handoff"] },
  { key: "spacing", label: "Spot-up & post", types: ["spotup", "postup"] },
  { key: "finishing", label: "Finishing", types: ["prrollman", "offrebound", "cut", "misc"] },
  { key: "transition", label: "Transition", types: ["transition"] },
] as const;
export function familyTs(types: readonly LeagueType[], keys: readonly string[]): number | null {
  const rows = types.filter(t => keys.includes(t.play_type));
  const sp = rows.reduce((s, t) => s + t.scoring_possessions, 0);
  return sp > 0 ? rows.reduce((s, t) => s + t.points, 0) / (2 * sp) : null;
}

/** Five most negative and five most positive Playtype Difficulty among 1,000+ minute players. */
export function extremes(rows: readonly ZtsRow[]): { easiest: ZtsRow[]; hardest: ZtsRow[] } {
  const pool = rows.filter(r => (r.minutes ?? 0) >= 1000 && known(r.difficulty))
    .sort((x, y) => (x.difficulty as number) - (y.difficulty as number) || x.player_id.localeCompare(y.player_id));
  return { easiest: pool.slice(0, 5), hardest: pool.slice(-5).reverse() };
}
