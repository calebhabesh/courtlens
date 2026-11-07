import { browserApi } from "./workbench-api";

/**
 * Research R10 data: Wingspan beside DARKO D-DPM (courtlens-wingspan-ddpm-v1) and the ORtg
 * calculator's four-factor inputs (courtlens-four-factors-inputs-v2). Every number is the frozen
 * results' (or DARKO's newest board for the current D-DPM), served unrounded; the page rounds only
 * for display and keeps exact values on `data-value`.
 */
export type WingspanVar = "height" | "wingspan" | "diff" | "d_dpm";
export type Position = "PG" | "SG" | "SF" | "PF" | "C";
export interface Correlation {
  x: WingspanVar; y: WingspanVar; n: number; r: number | null; low: number | null; high: number | null;
  verdict: "positive" | "negative" | "not_distinguishable_from_zero" | "unknown"; population?: "analysis" | "measured";
}
export interface Mean { n: number; mean: number | null; low: number | null; high: number | null }
export interface PositionalAverage { position: "ALL" | Position; height: Mean; wingspan: Mean; diff: Mean; weight: Mean; d_dpm: Mean }
/** RD01 round 2: where a row's height and wingspan come from (the combine wins where both exist). */
export type MeasurementSource = "combine" | "craftednba";
export interface WingspanPlayer {
  measurement_source: MeasurementSource | null;
  player_id: string; name: string; combine_year: number | null; position: Position | null; position_label: string | null;
  height: number | null; height_shoes: number | null; wingspan: number | null; diff: number | null; weight: number | null;
  standing_reach: number | null; measured: boolean; d_dpm: number | null; career_seasons: number; career_minutes: number;
  first_season: string | null; last_season: string | null; photo_season: string | null; photo_team: string | null;
  in_population: boolean; exclusion: string | null; percentiles: Partial<Record<WingspanVar, number>>;
  active: boolean | null; d_dpm_now: number | null;
}
export interface WingspanSummary {
  registration: { identity: string; registered_on: string; content_sha256: string; results_sha256: string; parameters: Record<string, unknown> & { replicates: number; seed: number; min_season_minutes: number } };
  population: { players_with_person_id: number; measured: number; analysis: number; position_unassigned: string[]; exclusions: Record<string, number> };
  correlations: Correlation[];
  within_position: (Correlation & { position: Position })[];
  partial: Correlation & { controlling_for: string };
  positional_averages: PositionalAverage[];
  nearest: { inputs: string[]; k: number; scaling: Record<string, { mean: number; sd: number }> };
  darko_seasons: [string, string] | null;
  current: { state: "ready" | "unavailable"; season: string | null; data_date: string | null };
  coverage: { state: "unavailable" } | {
    state: "ready"; version: string; observed_at: string; raw_sha256: string; seal_sha256: string;
    source: { name: string; host: string; url: string; policy: string; limitations: string[] };
    board: { season: string; data_date: string } | null;
    counts: { rows: number; matched: number; combine_measured: number; fills_combine_row: number; adds_player: number; ambiguous: number; unmatched: number; listed_length_differs: number };
    agreement_with_combine: { players: number; height_vs_barefoot?: { compared: number; equal: number; within_half_inch: number }; wingspan?: { compared: number; equal: number; within_half_inch: number } };
    aliases: Record<string, string>;
  };
  players: WingspanPlayer[];
  sources: { name: string; detail: string }[];
  credits: string[];
  caveats: string[];
}
export interface Nearest {
  player_id: string; name: string; inputs: string[]; metric: string; state: "ready" | "not_measured"; target_source?: MeasurementSource;
  neighbours: (WingspanPlayer & { distance: number })[];
}

export interface Rebounds { misses: number; offensive: number; defensive: number; unrebounded: number; orb_rate: number | null }
export type MissKind = "two" | "three" | "ft_end" | "and_one";
export type FactorInput = "efg" | "ftr" | "tov_pct" | "orb_pct" | "fg" | "ft";
export interface FactorRow {
  counts: Record<string, number>;
  inputs: Record<FactorInput, number | null>;
  fg2: number | null; fg3: number | null; fg3a_rate: number | null; ts: number | null; possessions: number | null;
  ortg_box: number | null; ortg_factors: number | null;
  rebounds_by_miss: Record<MissKind, Rebounds>;
  marginals: Partial<Record<"efg" | "ftr" | "tov_pct" | "orb_pct" | "ft", number>>;
}
export interface FactorSeasonHead {
  season: string; mu: number; ft_end_make_rate: number; ft_end_orb_rate: number | null; games: number;
  games_points_differ: number; unattributed_rows: Record<string, Record<string, number>>;
}
export interface FourFactorsSummary {
  registration: { identity: string; registered_on: string; content_sha256: string; results_sha256: string };
  paper: { authors: string; title: string; earlier_title: string; arxiv: string; url: string; version: string; formula: string; equation: string;
    published_2024_25: { mu: number; ft_end_make_rate: number; ft_end_orb_rate: number } };
  seasons: (FactorSeasonHead & { league: FactorRow })[];
  credits: string[];
  caveats: string[];
}
export interface FourFactorsSeason extends FactorSeasonHead { league: FactorRow; teams: (FactorRow & { team: string })[] }

async function get<T>(path: string, what: string, signal?: AbortSignal): Promise<T> {
  const response = await fetch(`${browserApi}/api${path}`, { signal });
  if (!response.ok) {
    const body = await response.json().catch(() => null) as { detail?: string } | null;
    throw new Error(typeof body?.detail === "string" ? body.detail : `${what} request failed (${response.status})`);
  }
  return response.json() as Promise<T>;
}

export const getWingspan = (signal?: AbortSignal) => get<WingspanSummary>("/wingspan", "Wingspan", signal);
export const getNearest = (playerId: string, signal?: AbortSignal) => get<Nearest>(`/wingspan/nearest/${encodeURIComponent(playerId)}`, "Nearest builds", signal);
export const getFourFactors = (signal?: AbortSignal) => get<FourFactorsSummary>("/four-factors", "Four-factor inputs", signal);
export const getFourFactorsSeason = (season: string, signal?: AbortSignal) => get<FourFactorsSeason>(`/four-factors/seasons/${encodeURIComponent(season)}`, "Season inputs", signal);

export const VAR_LABELS: Record<WingspanVar, string> = { height: "Height (no shoes)", wingspan: "Wingspan", diff: "Wingspan − height", d_dpm: "Career D-DPM" };
export const VERDICT_LABELS: Record<Correlation["verdict"], string> = {
  positive: "Positive", negative: "Negative", not_distinguishable_from_zero: "Not distinguishable from zero", unknown: "Unknown",
};
export const EXCLUSION_LABELS: Record<string, string> = {
  not_measured: "No barefoot height and wingspan at any combine",
  no_nba_minutes: "No NBA regular-season minutes 2000-01 to 2025-26",
  no_season_at_min_minutes: "No season with 500 or more minutes",
  no_darko_rating_in_qualifying_seasons: "No DARKO rating in any 500-minute season",
  not_at_combine: "Not measured at a combine since 2000 (reported by CraftedNBA)",
};
export const MISS_LABELS: Record<MissKind, string> = { two: "Missed two", three: "Missed three", ft_end: "Missed final free throw", and_one: "Missed and-one" };
export const INPUT_LABELS: Record<FactorInput, string> = { efg: "eFG%", ftr: "FT rate (FTM/FGA)", tov_pct: "TOV% (Eq. 10)", orb_pct: "ORB% (Eq. 9)", fg: "FG%", ft: "FT%" };
export const MARGINAL_LABELS: Record<string, string> = { efg: "eFG% +1 point (with FG%)", tov_pct: "TOV% −1 point", orb_pct: "ORB% +1 point", ftr: "FT rate +1 point", ft: "FT% +1 point" };

/** Inches as Databallr writes them: feet′ inches″ to a quarter inch. */
export const feetInches = (value: number | null | undefined): string => {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  const feet = Math.floor(value / 12);
  return `${feet}′${(value - feet * 12).toFixed(2).replace(/\.?0+$/, "")}″`;
};
