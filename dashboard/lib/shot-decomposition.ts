import { browserApi } from "./workbench-api";
import type { Pair } from "./shot-quality";

/**
 * Research R06: courtlens-shot-decomposition-v1 and courtlens-defensive-shot-quality-v1. Every number
 * is the frozen run's, served unrounded; the pages round for display and write exact values on `data-value`.
 */
export type Side = "offense" | "defense" | "combined";
export type Target = "ts" | "sq" | "make" | "ft";
export type DecompositionSort = Target | "shots";
export type ShotKind = "all" | "2pt" | "3pt";
export type DefenseSort = "dsq" | "rapm" | "fga" | "xpps" | "pps";
export const TARGETS: Target[] = ["ts", "sq", "make", "ft"];
export const MIN_SHOTS = ["1000", "2000", "3000", "4000"] as const;

export interface Correlation { r: number; interval: Pair }
export interface TeamOption { team_id: string; tricode: string | null }
export interface DecompositionRow {
  player_id: string; player_name: string; team_id: string | null; tricode: string | null; games: number;
  offense_shots: number; defense_shots: number; shots: number; status: string;
  values: Record<Target, number>; intervals: Record<Target, Pair>;
}
export interface DecompositionUnknown extends Omit<DecompositionRow, "values" | "intervals"> { reason: string }
export interface SecondStage { players: number; coefficients: number[]; r2: number }
export interface DecompositionBoard {
  status: "available"; season: string; side: Side; sort: DecompositionSort; team: string | null; min_shots: number;
  labels: Record<Target, string>; rows: DecompositionRow[]; unknown: DecompositionUnknown[]; teams: TeamOption[]; seasons: string[];
  second_stage: SecondStage; additivity_residual: number; median_interval_width: Record<Target, number>;
  league_per_100_shots: Record<Target, number>; avg_points: number; expected_shift: number; results_sha256: string;
}
export interface UnknownSeason { status: "unknown"; season: string; reason: string; seasons: string[] }
export interface DecompositionSeason {
  attempts: number; shots: number; games: number; avg_points: number; expected_shift: number; groups: number;
  players_rated: number; players_qualified: number; zero_shot_groups: number;
  coefficient_additivity_residual: Record<Side, number>; row_additivity_residual: number;
  second_stage: Record<Side, SecondStage>; median_interval_width: Record<Side, Record<Target, number>>;
  league_per_100_shots: Record<Target, number>;
}
export interface DecompositionData {
  rows: number; kinds: Record<string, number>;
  r05_shots: { shots: number; joined: number; join_rate: number; unjoined: Record<string, number>; unjoined_games: number };
  free_throws: { season_free_throws: number; joined: number; classified: Record<string, number>; unknown_sub_types: Record<string, number>; shooter_without_earlier_attempts: number };
  possessions: { counted_possessions: number; counted_possessions_without_attempt: number; counted_possessions_with_attempt_and_turnover: number };
}
export interface DecompositionSummary {
  registration: { identity: string; registered_on: string; content_sha256: string }; results_sha256: string;
  seasons: Record<string, DecompositionSeason>; data: Record<string, DecompositionData>;
  persistence: {
    pairs: number; players: number; pairs_by_season: Record<string, number>; verdict: string; registered_statistic: string;
    correlations: Record<string, Correlation>;
  };
  labels: Record<Side, Record<Target, string>>; definitions: Record<string, string>; method: string[]; reference_note: string; credit: string;
}

export interface KindValue { status: string; fga: number; pps: number | null; xpps: number | null; dsq: number | null; interval: Pair | null }
export interface KeyMatchup { player_id: string; player_name: string; team_id: string; tricode: string | null; fga: number; pps: number; xpps: number }
export interface DefenseCard {
  player_id: string; player_name: string; team_id: string; tricode: string | null; games: number; value: KindValue; reason: string | null;
  rank: Record<"fga" | "xpps" | "pps" | "dsq", number> | null;
  rapm: { value: number | null; interval: Pair | null; reason: string | null }; key_matchups: KeyMatchup[];
}
export interface DefenseBoard {
  status: "available"; season: string; kind: ShotKind; sort: DefenseSort; team: string | null; rows: DefenseCard[]; ranked: number;
  unknown_count: number; league: { fga: number; pps: number; xpps: number; term: number }; interval_excludes_zero: number; defenders_served: number;
  teams: TeamOption[]; seasons: string[]; results_sha256: string;
}
export interface DefenseSummary {
  registration: { identity: string; registered_on: string; content_sha256: string }; results_sha256: string;
  seasons: Record<string, { games: number; defenders: number; defenders_served: number; interval_excludes_zero: number; interval_excludes_zero_share: number; median_interval_width: number; league: Record<ShotKind, { fga: number; pps: number; xpps: number; term: number }> }>;
  signal: { defender_seasons: number; interval_excludes_zero: number; share: number; share_expected_if_no_signal: number };
  persistence: { pairs: number; players: number; correlations: Record<"dsq" | "xpps" | "pps", Correlation> };
  agreement_with_rapm: { pairs: number; players: number; correlations: Record<"sq" | "make" | "ts", Correlation> };
  definitions: Record<string, string>; reference_note: string; credit: string;
}

async function read<T>(path: string, params: Record<string, string>, what: string, signal?: AbortSignal): Promise<T> {
  const query = Object.keys(params).length ? `?${new URLSearchParams(params)}` : "";
  const response = await fetch(`${browserApi}/api${path}${query}`, { signal });
  if (!response.ok) {
    const body = await response.json().catch(() => null) as { detail?: string } | null;
    throw new Error(typeof body?.detail === "string" ? body.detail : `${what} request failed (${response.status})`);
  }
  return response.json() as Promise<T>;
}
export const getDecomposition = (signal?: AbortSignal) => read<DecompositionSummary>("/shot-quality/decomposition", {}, "Decomposition", signal);
export const getDecompositionBoard = (season: string, side: Side, sort: DecompositionSort, team: string | null, minShots: number, signal?: AbortSignal) =>
  read<DecompositionBoard | UnknownSeason>("/shot-quality/decomposition/players", { season, side, sort, minShots: String(minShots), ...(team ? { team } : {}) }, "Decomposition", signal);
export const getDefensiveSummary = (signal?: AbortSignal) => read<DefenseSummary>("/defensive-shot-quality", {}, "Defensive Shot Quality", signal);
export const getDefensiveCards = (season: string, kind: ShotKind, sort: DefenseSort, team: string | null, signal?: AbortSignal) =>
  read<DefenseBoard | UnknownSeason>("/defensive-shot-quality/cards", { season, kind, sort, ...(team ? { team } : {}) }, "Defensive Shot Quality", signal);

const cell = (value: string | number) => {
  const text = String(value);
  return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
};
/** The table as shown, with exact values and intervals. */
export function decompositionCsv(board: DecompositionBoard): string {
  const head = ["player_id", "player", "team", "shots", ...TARGETS.flatMap(t => [board.labels[t], `${board.labels[t]}_p10`, `${board.labels[t]}_p90`])];
  const rows = board.rows.map(r => [r.player_id, r.player_name, r.tricode ?? "", r.shots, ...TARGETS.flatMap(t => [r.values[t], r.intervals[t][0], r.intervals[t][1]])]);
  return [head, ...rows].map(row => row.map(cell).join(",")).join("\n") + "\n";
}
