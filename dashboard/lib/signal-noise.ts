import { browserApi } from "./workbench-api";

/**
 * Research → Signal vs Noise (R03, courtlens-signal-noise-v1). Every number is the frozen run's,
 * served unrounded; the page rounds only for display. Shrunk values sit beside raw values and
 * never replace them.
 */
export type LevelKey = "0.5" | "0.7";
export type LevelStatus = "reached" | "not_reached" | "inconsistent" | "no_signal";
export interface Interval { low: number | null; high: number | null }
export interface Level {
  status: LevelStatus; n: number | null; extrapolated: number | null;
  largest_n: number | null; largest_rho: number | null; interval: Interval;
}
export interface Bin {
  bin: number; sample_low: number; sample_high: number; player_seasons: number; players_per_split: number;
  reported: boolean; half_sample: number; n: number; r: number; r_split_sd: number; rho: number; rho_interval: Interval;
}
export interface StatResult {
  key: string; label: string; family: "percentage" | "per_36"; unit: string; eligible_player_seasons: number;
  status: "measured" | "too_few_players"; median_sample?: number;
  m?: { value: number; low: number | null; high: number | null; on_bound: boolean };
  levels: Partial<Record<LevelKey, Level>>; bins: Bin[];
}
export interface PriorFit {
  alpha: number; beta: number; mean: number; strength: number; player_seasons: number;
  converged: boolean; on_bound: boolean; seasons: string[];
}
export interface ValidationBlock {
  pairs: number; players?: number; mse?: { raw: number; prior: number; shrunk: number };
  raw_minus_shrunk?: { value: number } & Interval; prior_minus_shrunk?: { value: number } & Interval;
}
export interface SignalNoiseSummary {
  registration: { identity: string; content_sha256: string; registered_on: string; parameters: Record<string, unknown> };
  results_sha256: string;
  inputs: { release_id: string; dataset_id: string; game_log_seasons: [string, string]; shot_detail: { source: string } };
  coverage: {
    game_logs: Record<string, { player_games: number; players: number }>;
    rim: Record<string, { games_in_logs: number; games_with_shot_detail: number; player_games: number; player_games_fga_mismatch: number; fga_absolute_gap: number; shot_rows: number }>;
    ts_identity_failures: number;
  };
  stabilization: { player_seasons_split: number; players: number; stats: StatResult[] };
  stabilization_seasons: string[];
  priors: Record<string, ({ season: string } & PriorFit)[]>;
  validation: Record<string, { pooled: ValidationBlock; bands: ({ band: string } & ValidationBlock)[] }>;
  not_covered: { family: string; reason: string }[];
  shrunk_stats: string[];
}
export type Unknown = { status: "unknown"; reason: string };
export type SeasonPrior = ({ status: "available" } & PriorFit) | Unknown;
export interface Posterior { value: number | null; low: number | null; high: number | null }
export interface RimPlayer { makes: number; attempts: number; raw: number | null; shrunk: Posterior }
export interface Shrinkage {
  season: string; phase: string; registration: string; results_sha256: string; ts_rule: string;
  priors: Record<"fg3_pct" | "ft_pct" | "fg2_pct" | "rim_fg_pct", SeasonPrior>;
  rim: ({ status: "available"; scope: string; players: Record<string, RimPlayer> }) | Unknown;
}
export interface ComponentEstimate { makes: number; attempts: number; raw: number | null; prior: SeasonPrior; shrunk: Posterior }
export interface PathPoint { attempts: number; raw: number | null; shrunk: number | null }
export interface PlayerExample {
  player_id: string; player_name: string; season: string; games: number; teams: string[]; selection_rule: string | null;
  estimates: {
    fg2_pct: ComponentEstimate; fg3_pct: ComponentEstimate; ft_pct: ComponentEstimate;
    ts_pct: { points: number; attempts: number; raw: number | null; shrunk: Posterior };
  } | null;
  rim: ({ status: "available"; prior: SeasonPrior } & Omit<ComponentEstimate, "prior">) | Unknown;
  path: ({ game_id: string; game_date: string } & Record<"fg3_pct" | "ft_pct" | "ts_pct", PathPoint>)[];
  results_sha256: string;
}

async function read<T>(path: string, params: Record<string, string>, signal?: AbortSignal): Promise<T> {
  const response = await fetch(`${browserApi}/api/signal-noise${path}${Object.keys(params).length ? `?${new URLSearchParams(params)}` : ""}`, { signal });
  if (!response.ok) {
    const body = await response.json().catch(() => null) as { detail?: string } | null;
    throw new Error(typeof body?.detail === "string" ? body.detail : `Signal vs Noise request failed (${response.status})`);
  }
  return response.json() as Promise<T>;
}
export const getSignalNoise = (signal?: AbortSignal) => read<SignalNoiseSummary>("", {}, signal);
export const getShrinkage = (season: string, phase: string, signal?: AbortSignal) =>
  read<Shrinkage>("/shrinkage", { season, phase }, signal);
export const getPlayerExample = (playerId: string | null, season: string, signal?: AbortSignal) =>
  read<PlayerExample>("/player", playerId ? { playerId, season } : {}, signal);

/** Beta-binomial posterior mean (makes + α) / (attempts + α + β); null with no attempts. */
export function shrunkRate(makes: number, attempts: number, alpha: number, beta: number): number | null {
  return attempts > 0 ? (makes + alpha) / (attempts + alpha + beta) : null;
}

/** TS% from component percentages and the player's own attempt mix (the registration's rule). */
export function composedTs(fg2a: number, fg3a: number, fta: number, p2: number | null, p3: number | null, pft: number | null): number | null {
  const tsa = fg2a + fg3a + 0.44 * fta;
  if (tsa <= 0) return null;
  let points = 0;
  for (const [attempts, rate, value] of [[fg2a, p2, 2], [fg3a, p3, 3], [fta, pft, 1]] as const) {
    if (attempts > 0) {
      if (rate === null) return null;
      points += value * attempts * rate;
    }
  }
  return points / (2 * tsa);
}

export type ShrunkKey = "fg3_pct" | "ft_pct" | "ts_pct";
type Totals = Partial<Record<"fgm" | "fga" | "fg3m" | "fg3a" | "ftm" | "fta", number | null>>;
type Priors = Partial<Record<"fg2_pct" | "fg3_pct" | "ft_pct", { alpha: number; beta: number }>>;

/** Shrunk 3P%, FT% and TS% for one Stats row from its own makes and attempts in the scope shown. */
export function shrinkRow(row: Totals, priors: Priors): Record<ShrunkKey, number | null> {
  const value = (key: keyof Totals) => typeof row[key] === "number" ? row[key] as number : null;
  const [fgm, fga, fg3m, fg3a, ftm, fta] = (["fgm", "fga", "fg3m", "fg3a", "ftm", "fta"] as const).map(value);
  const rate = (made: number | null, attempts: number | null, prior: Priors[keyof Priors]) =>
    made === null || attempts === null || !prior ? null : shrunkRate(made, attempts, prior.alpha, prior.beta);
  const fg2m = fgm === null || fg3m === null ? null : fgm - fg3m;
  const fg2a = fga === null || fg3a === null ? null : fga - fg3a;
  const p2 = rate(fg2m, fg2a, priors.fg2_pct), p3 = rate(fg3m, fg3a, priors.fg3_pct), pft = rate(ftm, fta, priors.ft_pct);
  return {
    fg3_pct: p3,
    ft_pct: pft,
    ts_pct: fg2a === null || fg3a === null || fta === null ? null : composedTs(fg2a, fg3a, fta, p2, p3, pft)
  };
}

export const LEVEL_LABELS: Record<LevelStatus, string> = {
  reached: "Reached", not_reached: "Not reached in any bin", inconsistent: "Inconsistent", no_signal: "No signal"
};

/** Sample sizes as whole units: attempts, true-shooting attempts or minutes. */
export const formatSample = (value: number | null | undefined) =>
  typeof value === "number" && Number.isFinite(value) ? Math.round(value).toLocaleString("en-US") : "—";
export const formatPct = (value: number | null | undefined, digits = 1) =>
  typeof value === "number" && Number.isFinite(value) ? `${(value * 100).toFixed(digits)}%` : "—";

// ---- RD13 page helpers -----------------------------------------------------------------------------

export type Family = StatResult["family"];
/** Short unit names for sample sizes, after the served unit (FGA, 3PA, rim FGA …); per-36 rates are measured in minutes. */
export const sampleUnit = (stat: StatResult) => stat.family === "per_36" ? "min" : stat.unit;
export const sampleText = (value: number | null | undefined, stat: StatResult) => value == null ? "—" : `${formatSample(value)} ${sampleUnit(stat)}`;

/** The unit spelled out for sentences, where "480 3PA" can read as one number (owner, RD13 round 4); tables and strips keep the short unit. */
const UNIT_WORDS: Record<string, string> = {
  FGA: "field-goal attempts", "2PA": "two-point attempts", "3PA": "three-point attempts", FTA: "free-throw attempts", TSA: "true-shooting attempts", "rim FGA": "attempts at the rim", minutes: "minutes",
};
export const unitWords = (stat: StatResult) => stat.family === "per_36" ? "minutes" : UNIT_WORDS[stat.unit] ?? stat.unit;
export const sampleWords = (value: number | null | undefined, stat: StatResult) => value == null ? "—" : `${formatSample(value)} ${unitWords(stat)}`;

/** What-if shrinkage (RD13 round 4, owner-approved): the served prior applied to makes and attempts the reader picks. A posterior mean only; no interval. */
export function whatIf(rate: number, attempts: number, alpha: number, beta: number) {
  const makes = Math.round(rate * attempts);
  return { makes, raw: attempts > 0 ? makes / attempts : null, shrunk: (makes + alpha) / (attempts + alpha + beta), weight: attempts / (attempts + alpha + beta) };
}

/** Reliability, a correlation stepped up to the full sample: three decimals. */
export const formatRho = (value: number | null | undefined, digits = 3) =>
  typeof value === "number" && Number.isFinite(value) ? value.toFixed(digits) : "—";

/** A stat reaches a level only where a bin shows it; anything else draws no point (the contract: 3P%'s fitted M is not a stabilization point). */
export const reached = (level: Level | undefined): level is Level & { n: number } => level?.status === "reached" && typeof level.n === "number";

/**
 * The strip's rows for one family, fastest to slowest at reliability 0.5 (owner, RD13 Q1: sorted, never ranked). A stat that never
 * reaches 0.5 goes last, ordered by its largest observed bin.
 */
export function stripOrder(stats: readonly StatResult[], family: Family): StatResult[] {
  const key = (s: StatResult) => { const l = s.levels["0.5"]; return reached(l) ? [0, l.n] : [1, l?.largest_n ?? Infinity]; };
  return stats.filter(s => s.family === family).sort((a, b) => { const [ga, va] = key(a), [gb, vb] = key(b); return ga - gb || va - vb; });
}

/** The right-hand end the strip must reach: every 0.7 interval, typical season and, for a stat not reached, its largest bin. */
export function stripReach(stats: readonly StatResult[]): number {
  return Math.max(1, ...stats.flatMap(s => {
    const half = s.levels["0.5"], seventy = s.levels["0.7"];
    // An unreached level's interval belongs to the fitted curve, not to anything observed, so it never stretches the scale.
    return [s.median_sample ?? 0, reached(seventy) ? seventy.interval.high ?? 0 : 0, reached(half) ? half.interval.high ?? 0 : half?.largest_n ?? 0];
  }));
}

/** Mean squared error of a proportion in squared percentage points (the served value ×10,000), and its root in points. */
export const squaredPoints = (mse: number) => mse * 10000;
export const rmsePoints = (mse: number) => Math.sqrt(mse) * 100;

export const BAND_LABELS: Record<string, string> = { "under 50": "Under 50", "50-199": "50–199", "200 or more": "200 or more" };
export const TEST_STATS = ["fg3_pct", "ft_pct", "fg2_pct", "ts_pct", "rim_fg_pct"] as const;
export const PRIOR_STATS = ["fg3_pct", "fg2_pct", "ft_pct", "rim_fg_pct"] as const;

/** Every stat in the test where shrunk beats raw on the pooled sample, with the whole 95% interval above zero. */
export function shrinkingWins(summary: Pick<SignalNoiseSummary, "validation">): string[] {
  return TEST_STATS.filter(stat => { const g = summary.validation[stat]?.pooled.raw_minus_shrunk; return typeof g?.low === "number" && g.low > 0; });
}

/**
 * The example's season picker: the seasons this player played (from their career), limited to seasons with a fitted prior, newest first.
 * The season shown is always listed, so the control never loses its value while the career loads.
 */
export function exampleSeasons(playerSeasons: readonly string[], priorSeasons: readonly string[], shown: string): string[] {
  const priors = new Set(priorSeasons);
  return [...new Set([...playerSeasons.filter(s => priors.has(s)), shown])].sort().reverse();
}
