/**
 * Research → Points Forecasts and its Evaluation Archive tab (designed in RD16). Names, labels and the pure rules the page applies to the
 * served, frozen results: the points experiment (`/api/workbench/forecasts/evaluation`), its issuance ledger (`/api/workbench/forecasts`) and the
 * earlier reference-points experiment (`/api/analytics/evaluations?archive=true`). Nothing here fits or recomputes a model; a gap is the served
 * difference turned to the favourable sign (above zero, the model named first missed by less).
 */
import { intervalTone, signed, type SignalTone } from "./research-values";
import type { AnalyticsEvaluation, ForecastIssuanceItem, PointsForecastEvaluation } from "./types";

/** Each model reads as a plain name with what it is under it (RD11); the technical name lives in About. */
export const MODELS: Record<string, { name: string; sub: string }> = {
  prior_blend: { name: "Prior blend", sub: "Recent games, eased in from last season" },
  player_only: { name: "Player trees", sub: "Boosted trees on the player's own history" },
  player_plus_context: { name: "Player + context trees", sub: "The same, plus home, rest and opponent" },
  ewma_20_hl5: { name: "EWMA-20", sub: "A weighted average of the last 20 games" },
  rolling_mean: { name: "Last 10", sub: "The mean of the last 10 games" },
  last_10: { name: "Last 10", sub: "The mean of the last 10 games" },
};
export const modelName = (key: string) => MODELS[key]?.name ?? key.replaceAll("_", " ");
export const modelSub = (key: string) => MODELS[key]?.sub ?? "";

/** Served slice dimensions and subgroups, in reading order, for both experiments. Unlisted keys fall back to a tidied key. */
export const DIMENSIONS: Record<string, { label: string; values: Record<string, string> }> = {
  current_appearances_slice: { label: "Games played this season", values: { "1_to_4": "1 to 4", "5_to_9": "5 to 9", "10_to_19": "10 to 19", "20_to_39": "20 to 39", "40_plus": "40 or more" } },
  prior_history: { label: "Games played before", values: { "10_to_19": "10 to 19", "20_to_39": "20 to 39", "40_plus": "40 or more" } },
  prior_season_eligibility: { label: "Last season", values: { eligible: "20 or more games", not_eligible: "Fewer than 20 games" } },
  prior_minutes_slice: { label: "Minutes, last 10 games", values: { "<15": "Under 15", "15_<28": "15 to 28", ">=28": "28 or more" } },
  prior_minutes: { label: "Minutes, recent games", values: { under_15: "Under 15", "15_to_under_28": "15 to 28", "28_plus": "28 or more" } },
  team_rest_slice: { label: "Team rest", values: { back_to_back: "Back-to-back", "1_day": "1 day", "2_to_3_days": "2 to 3 days", "4_plus_days": "4 or more days" } },
  days_since_appearance: { label: "Days since last game", values: { "0_to_1": "0 to 1", "2_to_3": "2 to 3", "4_plus": "4 or more" } },
  lead_days_slice: { label: "Days ahead", values: { "0": "Game day", "1_to_3": "1 to 3 days", "4_to_6": "4 to 6 days" } },
  team_changed_slice: { label: "Team this season", values: { same: "Same team", changed: "Changed team" } },
  opponent_context_slice: { label: "Opponent data", values: { complete: "Available", missing: "Missing" } },
  opponent_context: { label: "Opponent data", values: { complete: "Available", missing: "Missing" } },
  season_slice: { label: "Season", values: {} },
};
const tidy = (key: string) => key.replace(/_slice$/, "").replaceAll("_", " ").replace(/^./, c => c.toUpperCase());
export const dimensionLabel = (key: string) => DIMENSIONS[key]?.label ?? tidy(key);
export const subgroupLabel = (dimension: string, key: string) => DIMENSIONS[dimension]?.values[key] ?? tidy(key);
/** Dimensions in the order above, then any others the API adds. */
export function orderedDimensions(keys: readonly string[]): string[] {
  const known = Object.keys(DIMENSIONS);
  return [...keys].sort((a, b) => (known.indexOf(a) + 1 || 99) - (known.indexOf(b) + 1 || 99) || a.localeCompare(b));
}
/** Subgroups in their label order when listed, otherwise as served. */
export function orderedSubgroups(dimension: string, keys: readonly string[]): string[] {
  const known = Object.keys(DIMENSIONS[dimension]?.values ?? {});
  return [...keys].sort((a, b) => (known.indexOf(a) + 1 || 99) - (known.indexOf(b) + 1 || 99));
}

export const fixed = (value: number | null | undefined, digits = 2) => value == null || !Number.isFinite(value) ? "—" : value.toFixed(digits);
export const pct = (value: number | null | undefined, digits = 1) => value == null || !Number.isFinite(value) ? "—" : `${(value * 100).toFixed(digits)}%`;
export const whole = (value: number | null | undefined) => value == null || !Number.isFinite(value) ? "—" : Math.round(value).toLocaleString("en-US");

/** A served paired difference `A_MAE - B_MAE` as A's gain over B: positive means A missed by less. Bounds swap with the sign. */
export interface Gain { value: number; low: number; high: number }
export function gainFromDifference(difference: number, lower: number, upper: number): Gain {
  return { value: -difference, low: -upper, high: -lower };
}
/** Green or red only where the 95% interval excludes zero (owner, RD16 contract). */
export const gainTone = (g: Gain | null | undefined): SignalTone | undefined => g ? intervalTone(g.low, g.high) : undefined;
export const gainBand = (g: Gain, digits = 3) => `${signed(g.low, digits)} to ${signed(g.high, digits)}`;

/** The two models named in a served estimand such as "player_only_MAE - prior_blend_MAE". */
export function estimandModels(estimand: string | null | undefined): [string, string] | null {
  const match = /^(\w+?)_MAE\s*-\s*(\w+?)_MAE$/.exec(estimand ?? "");
  return match ? [match[1], match[2]] : null;
}

// ---- The issuance ledger ----------------------------------------------------------------------

export type Timing = "before" | "same_day" | "after";
/** When a forecast was issued against its game's date (UTC calendar dates; a back-dated run is months apart). */
export function issueTiming(item: Pick<ForecastIssuanceItem, "issued_at_utc" | "target_game_date">): Timing {
  const issued = item.issued_at_utc.slice(0, 10);
  return issued < item.target_game_date ? "before" : issued === item.target_game_date ? "same_day" : "after";
}
export function timingCounts(items: readonly Pick<ForecastIssuanceItem, "issued_at_utc" | "target_game_date">[]) {
  const counts = { before: 0, same_day: 0, after: 0 };
  for (const item of items) counts[issueTiming(item)] += 1;
  return counts;
}
const minMax = (values: readonly string[]) => values.length ? [values.reduce((a, b) => a < b ? a : b), values.reduce((a, b) => a > b ? a : b)] as const : null;
/** The issue days and game days a list of forecasts spans. */
export function ledgerSpan(items: readonly ForecastIssuanceItem[]) {
  return { issued: minMax(items.map(i => i.issued_at_utc.slice(0, 10))), games: minMax(items.map(i => i.target_game_date)) };
}
/** True when every game day falls inside the served test split. */
export const insideSplit = (games: readonly [string, string] | null, split: { start: string; end: string } | null | undefined) =>
  Boolean(games && split && games[0] >= split.start && games[1] <= split.end);

/** The NBA season a game date belongs to (the season turns over in August). */
export function seasonOf(date: string): string {
  const year = Number(date.slice(0, 4)), month = Number(date.slice(5, 7));
  const start = month >= 8 ? year : year - 1;
  return `${start}-${String((start + 1) % 100).padStart(2, "0")}`;
}

export type Outcome = "scored" | "did_not_play" | "absent" | "cancelled" | "pending";
/** A forecast's result as served. An absent box-score row is unknown, never zero. */
export function outcomeOf(item: ForecastIssuanceItem): Outcome {
  const s = item.latest_score;
  if (!s) return "pending";
  if (s.score_status === "scored" || s.score_status === "revised") return "scored";
  if (s.score_status === "unscored_cancelled") return "cancelled";
  if (s.score_status === "unscored_dnp") return s.reason === "did_not_appear_dnp" ? "did_not_play" : "absent";
  return "pending";
}
export const OUTCOME_TEXT: Record<Outcome, string> = {
  scored: "Scored", did_not_play: "Did not play", absent: "Not in the box score, unknown", cancelled: "Game cancelled", pending: "Waiting for the game",
};

export const ELIGIBILITY_TEXT: Record<string, string> = {
  eligible_core: "10 or more games this season",
  eligible_early_season: "Early season, from last season",
  eligible_available_history_fallback: "5 to 9 games, no prior season",
};
export const eligibilityText = (reason: string | null | undefined) => ELIGIBILITY_TEXT[reason ?? ""] ?? (reason ? tidy(reason.replace(/^eligible_/, "")) : "—");

// ---- The archive --------------------------------------------------------------------------------

export interface ArchiveMetric { forecast_rows: number; mae: number; rmse: number; player_balanced_mae?: number; players?: number; target_dates?: number }
export interface ArchiveSliceMetric extends ArchiveMetric { interval?: { available: boolean; coverage: number | null; mean_width: number | null; rows: number } }
export interface ArchiveValidation {
  baseline?: string;
  challenger_finalist?: string;
  baseline_validation?: { pooled?: ArchiveMetric; folds?: Record<string, ArchiveMetric> };
  variants?: Record<string, { selected_config: string; configs: Record<string, { pooled?: ArchiveMetric; folds?: Record<string, ArchiveMetric> }> }>;
}
export interface ArchiveGates {
  validation_improvement?: { passed: boolean; pooled_relative_improvement?: number; fold_absolute_improvements?: Record<string, number> };
  final_paired_superiority?: { passed: boolean; mae_difference?: number; lower?: number; upper?: number; estimand?: string };
  supported_slices?: { passed: boolean; regressions_over_limit?: { dimension: string; value: string; relative_mae_regression: number }[]; supported?: unknown[] };
  interval_guardrails?: { passed: boolean; challenger_coverage?: number; width_ratio?: number };
}
export const archiveValidation = (report: AnalyticsEvaluation) => report.validation as ArchiveValidation;
export const archiveGates = (report: AnalyticsEvaluation) => ((report.promotion as { gates?: ArchiveGates }).gates ?? {});
export const archiveDecision = (report: AnalyticsEvaluation) => (report.promotion as { decision?: string }).decision ?? null;
export const archiveSlices = (report: AnalyticsEvaluation) => report.final_test.prespecified_slices as Record<string, Record<string, Record<string, ArchiveSliceMetric>>>;
export function selectedValidationMae(validation: ArchiveValidation, variant: string): number | null {
  const v = validation.variants?.[variant];
  return v?.configs[v.selected_config]?.pooled?.mae ?? null;
}

/**
 * The archive's frozen protocol (`evaluation/config/baseline-v1.yaml`, frozen 2026-09-21). The API serves its results, not these settings,
 * so they are written here once and checked against the file by the RD16 real-data check.
 */
export const ARCHIVE_PROTOCOL = {
  frozenOn: "2026-09-21",
  target: "PTS + 1.2 REB + 1.5 AST + 3 STL + 3 BLK − TOV",
  splits: [
    { key: "S1", role: "Training", season: "2021-22", start: "2021-10-19", end: "2022-04-10" },
    { key: "V1", role: "Validation, fold 1", season: "2022-23", start: "2022-10-18", end: "2022-12-14" },
    { key: "V2", role: "Validation, fold 2", season: "2022-23", start: "2022-12-15", end: "2023-02-10" },
    { key: "C", role: "Interval calibration", season: "2022-23", start: "2023-02-11", end: "2023-04-09" },
    { key: "S3", role: "Final test", season: "2023-24", start: "2023-10-24", end: "2024-04-14" },
  ],
} as const;

/** The points experiment's frozen splits (`evaluation/config/points-v1.yaml`, frozen 2026-10-01; the served model card repeats them). */
export const POINTS_PROTOCOL = {
  frozenOn: "2026-10-01",
  splits: [
    { key: "T", role: "Training", season: "2021-22 and 2022-23", start: "2021-10-19", end: "2023-04-09" },
    { key: "V1", role: "Validation, fold 1", season: "2023-24", start: "2023-10-24", end: "2024-01-15" },
    { key: "V2", role: "Validation, fold 2", season: "2023-24", start: "2024-01-16", end: "2024-04-14" },
    { key: "C", role: "Interval calibration", season: "2024-25", start: "2024-10-22", end: "2025-04-13" },
    { key: "F", role: "Final test", season: "2025-26", start: "2025-10-21", end: "2026-04-12" },
  ],
  thresholds: { validationImprovement: 0.05, sliceRegression: 0.05, coverage: 0.75, widthRatio: 1.1, nominal: 0.8 },
} as const;

/** The model rows of a points evaluation, served model first, then the finalist, then the rest as served. */
export function modelOrder(evaluation: PointsForecastEvaluation): string[] {
  const keys = Object.keys(evaluation.final_test?.metrics ?? {});
  const first = [evaluation.validation?.baseline, evaluation.validation?.challenger_finalist].filter((k): k is string => Boolean(k && keys.includes(k)));
  return [...first, ...keys.filter(k => !first.includes(k))];
}

/** Served text that names a project code is replaced on the page (RD10); the API is unchanged. */
export const visitorText = (text: string) => text.replace(/\bS3\b/g, "the final test").replace(/\bM6\b ?/g, "");
