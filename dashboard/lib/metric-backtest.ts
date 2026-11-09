import { browserApi } from "./workbench-api";

/**
 * Research → Metric Backtest (R08, courtlens-metric-backtest-v1). Every number is the frozen
 * results' or the 2026-27 scorer's, served unrounded; the page rounds only for display and keeps
 * exact values on `data-value`. The verdict text is built from the served pair verdicts, which the
 * runner computed with the registered rule; the page never ranks anything itself.
 */
export const SCORES = ["rmse", "accuracy", "brier", "log_loss"] as const;
export type Score = (typeof SCORES)[number];
export interface Band { low: number; high: number }
export interface Gain extends Band { gain: number }
export interface Calibration { a: number; b: number; sigma: number; games: number; fitted_on: string }
export interface SeasonScore extends Record<Score, number> {
  games: number; calibration: Calibration; replaced_minutes_share: number; mean_error: number;
  intervals: Record<Score, Band>;
}
export interface CurveBin { low: number; high: number; games: number; predicted?: number; observed?: number }
export interface CandidateResult {
  test_seasons: string[];
  seasons: Record<string, SeasonScore>;
  pooled: Record<Score, number> & { games: number; intervals: Record<Score, Band> };
  calibration_curve: { bins: CurveBin[]; ece: number };
}
export type PairVerdict = "candidate_better" | "reference_better" | "no_ranking";
export interface Pair {
  candidate: string; reference: string; seasons: string[]; games: number;
  per_season: Record<string, Record<Score, Gain>>; pooled: Record<Score, Gain>;
  seasons_candidate_lower_rmse: number; verdict: PairVerdict;
}
export interface Results {
  version: string; results_sha256: string;
  registration: { identity: string; content_sha256: string; registered_on: string; parameters: { candidates: string[]; baseline: string; test_seasons: string[]; replicates: number; level: number; replacement_quantile: number; raw_min_controls: number; table_sha256: Record<string, string> } };
  candidates: Record<string, CandidateResult>;
  pairs: Pair[];
  verdict: { rule: string; orderings: { better: string; worse: string; seasons: string[] }[]; against_baseline: Record<string, PairVerdict>; best: string[]; unranked_pairs: number };
  leakage: Record<string, { game_ratings_checked: number; violations: number }>;
}
export interface MetricNote { label: string; short: string; what: string; source: string; credit: string }
export interface ProspectiveGroup {
  games: number;
  candidates?: Record<string, Record<Score, number> & { replaced_minutes_share: number }>;
  pairs?: ({ candidate: string; reference: string } & Record<Score, Gain>)[];
}
export interface MetricBacktestPage {
  results: Results;
  metrics: Record<string, MetricNote>;
  omitted: Record<string, string>;
  prospective: {
    manifest: { version: string; frozen_at: string; manifest_sha256: string; prospective_table_sha256: string; minimum_games_for_interval: number; first_prospective_rule: string; calibration: Record<string, Calibration> };
    summary: null | { frozen_at: string; scored_through: string | null; written_at: string; prospective: ProspectiveGroup; hindsight: ProspectiveGroup };
  };
}

export async function getMetricBacktest(signal?: AbortSignal): Promise<MetricBacktestPage> {
  const response = await fetch(`${browserApi}/api/metric-backtest`, { signal });
  if (!response.ok) {
    const body = await response.json().catch(() => null) as { detail?: string } | null;
    throw new Error(typeof body?.detail === "string" ? body.detail : `Metric backtest request failed (${response.status})`);
  }
  return response.json() as Promise<MetricBacktestPage>;
}

const flipVerdict = (v: PairVerdict): PairVerdict => v === "candidate_better" ? "reference_better" : v === "reference_better" ? "candidate_better" : v;
const flipGain = (g: Gain): Gain => ({ gain: -g.gain, low: -g.high, high: -g.low });

/** The pair with `candidate` first; gains flipped so positive still favours `candidate`. */
export function pairOf(pairs: readonly Pair[], candidate: string, reference: string): Pair | null {
  const found = pairs.find(p => (p.candidate === candidate && p.reference === reference) || (p.candidate === reference && p.reference === candidate));
  if (!found || found.candidate === candidate) return found ?? null;
  const flip = (row: Record<Score, Gain>) => Object.fromEntries(SCORES.map(s => [s, flipGain(row[s])])) as Record<Score, Gain>;
  return {
    ...found, candidate, reference,
    pooled: flip(found.pooled),
    per_season: Object.fromEntries(Object.entries(found.per_season).map(([s, row]) => [s, flip(row)])),
    seasons_candidate_lower_rmse: found.seasons.filter(s => found.per_season[s].rmse.gain < 0).length,
    verdict: flipVerdict(found.verdict),
  };
}

/** `StatsGrid`'s tone names for `gainTone`. */
export const gridTone = (g: Band | undefined): "good" | "bad" | undefined => {
  const tone = gainTone(g);
  return tone === "positive" ? "good" : tone === "negative" ? "bad" : undefined;
};

/** Green only when the whole 95% interval favours the candidate, red only when it all goes against. */
export function gainTone(g: Band | undefined): "positive" | "negative" | undefined {
  if (!g) return undefined;
  if (g.low > 0) return "positive";
  if (g.high < 0) return "negative";
  return undefined;
}

export const VERDICT_TEXT: Record<PairVerdict, string> = {
  candidate_better: "Better",
  reference_better: "Worse",
  no_ranking: "No ranking",
};

export function fixed(value: number | null | undefined, digits = 2): string {
  return typeof value === "number" && Number.isFinite(value) ? value.toFixed(digits) : "—";
}
export function signed(value: number | null | undefined, digits = 2): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return "—";
  const text = Math.abs(value).toFixed(digits);
  return Number(text) === 0 ? text : `${value > 0 ? "+" : "−"}${text}`;
}
export const percent = (value: number | null | undefined, digits = 1) =>
  typeof value === "number" && Number.isFinite(value) ? `${(value * 100).toFixed(digits)}%` : "—";
export const gainText = (g: Gain | undefined, digits = 2) => g ? `${signed(g.gain, digits)} (${signed(g.low, digits)} to ${signed(g.high, digits)})` : "—";
/** Both ends with their signs: "+0.72 to +0.88". */
export const gainBand = (b: Band | undefined, digits = 2) => b ? `${signed(b.low, digits)} to ${signed(b.high, digits)}` : "—";
export const bandText = (b: Band | undefined, digits = 2) => b ? `${fixed(b.low, digits)} to ${fixed(b.high, digits)}` : "—";
export const seasonRange = (seasons: readonly string[]) => seasons.length === 0 ? "none" : seasons.length === 1 ? seasons[0] : `${seasons[0]} to ${seasons.at(-1)}`;

/** Score digits: RMSE in points, the probability scores to four places. */
export const SCORE_DIGITS: Record<Score, number> = { rmse: 2, accuracy: 3, brier: 4, log_loss: 4 };
export const SCORE_LABELS: Record<Score, string> = { rmse: "Margin RMSE", accuracy: "Winner picked", brier: "Brier", log_loss: "Log loss" };

/** Plain-language verdict, sentence by sentence, from the served pair verdicts only. */
export function verdictSentences(page: MetricBacktestPage): string[] {
  const { results, metrics } = page;
  const name = (key: string) => metrics[key]?.label ?? key;
  const baseline = results.registration.parameters.baseline;
  const out: string[] = [];
  const best = results.verdict.best;
  if (best.length === 1) {
    const rival = results.pairs.filter(p => p.candidate === best[0] || p.reference === best[0]).length;
    // A label with its own comma ("Time-decay RAPM, refreshed monthly") closes it before the verb.
    out.push(`${name(best[0])}${name(best[0]).includes(",") ? "," : ""} predicted game margins better than each of the other ${rival} metrics.`);
  } else {
    out.push("No single metric predicted game margins better than every other.");
  }
  const against = results.verdict.against_baseline;
  const beat = Object.keys(against).filter(k => against[k] === "candidate_better");
  const lost = Object.keys(against).filter(k => against[k] === "reference_better");
  const tied = Object.keys(against).filter(k => against[k] === "no_ranking");
  if (beat.length === Object.keys(against).length) out.push(`Every player metric beat ${name(baseline)}.`);
  else {
    if (beat.length) out.push(`${beat.map(name).join(", ")} beat ${name(baseline)}.`);
    if (lost.length) out.push(`${lost.map(name).join(", ")} lose to ${name(baseline)}.`);
    if (tied.length) out.push(`${tied.map(name).join(", ")} cannot be ranked against ${name(baseline)}.`);
  }
  const unranked = results.pairs.filter(p => p.verdict === "no_ranking");
  if (unranked.length) {
    out.push(`No ranking for ${unranked.length === 1 ? "one pair" : `${unranked.length} pairs`}: ${unranked.map(p => `${name(p.candidate)} and ${name(p.reference)} (${signed(p.pooled.rmse.gain)} points, 95% ${gainBand(p.pooled.rmse)}, over ${seasonRange(p.seasons)})`).join("; ")}. Their intervals include zero, so neither is called better.`);
  }
  return out;
}

/** Ranked pairs in the served order, as "better over worse". */
export function orderings(page: MetricBacktestPage): { better: string; worse: string; pair: Pair }[] {
  return page.results.verdict.orderings.map(o => ({ ...o, pair: pairOf(page.results.pairs, o.better, o.worse)! }));
}
