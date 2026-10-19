import { browserApi } from "./workbench-api";
import { formatDate } from "./format-date";
import type { ImpactResponse } from "./types";

/** PC11 read-only views over the PC07 NBA Stats feeds and the WOWY artifact. */
export type FeedPhase = "regular_season" | "playoffs";
export interface FeedScope { season: string; phase: FeedPhase }
export interface FeedSource { dataset_id: string; feed: string; variant: string; season: string; season_type: string; observed_at: string; upstream_revision: string | null; content_sha256: string }
export interface FeedEnvelope {
  version: string; season: string; phase: FeedPhase; label: string; scopes: FeedScope[]; source: string;
  qualification: Record<string, number>; limitations: string[]; sources: FeedSource[];
}
type Percentiles = Record<string, number | null>;

export interface Defender {
  player_id: string; player_name: string; team_id: string | null; team_tricode: string | null; games: number | null;
  defended_fga: number | null; defended_fgm: number | null; defended_fg_pct: number | null; expected_fg_pct: number | null;
  fg_pct_difference: number | null; makes_below_expected: number | null;
  contested_shots_per_game: number | null; deflections_per_game: number | null; charges_drawn: number | null;
  matchup_minutes: number | null; matchup_partial_possessions: number | null; matchup_points_per_100: number | null;
  qualified: boolean; percentiles: Percentiles;
}
export interface MatchupRow {
  player_id: string; player_name: string; team_tricode?: string | null; games: number | null; matchup_minutes: number | null; partial_possessions: number | null;
  player_points: number | null; points_per_100: number | null; fgm: number | null; fga: number | null; fg_pct: number | null;
  fg3m: number | null; fg3a: number | null; fg3_pct?: number | null; ftm?: number | null; fta?: number | null;
  assists: number | null; turnovers: number | null; blocks?: number | null;
}
export interface MatchupDetail {
  player_id: string; player_name: string; team_tricode?: string | null; side: "offense" | "defense"; opponents: number;
  matchup_minutes: number | null; partial_possessions: number | null; player_points: number | null;
  points_per_100: number | null; fg_pct: number | null; rows: MatchupRow[];
}
export interface DefenseView extends FeedEnvelope {
  category: string; categories: { value: string; label: string }[]; matchups_observed: boolean;
  focus_rule: string | null; players: Defender[]; detail: MatchupDetail | null;
}
/** Two players' direct matchup both ways; a direction never observed is null, not zero. */
export interface MatchupPair {
  player_id: string; player_name: string; team_tricode: string | null;
  player_on_offense: MatchupRow | null; opponent_on_offense: MatchupRow | null;
}
export interface MatchupsView extends FeedEnvelope { side: "offense" | "defense"; focus_rule: string | null; detail: MatchupDetail; pair?: MatchupPair | null }

export interface PlayTypeBreakdown {
  play_type: string; label: string; possessions: number; share: number | null; points_per_possession: number | null;
  league_points_per_possession: number | null; fg_pct: number | null;
}
export interface PlayTypePlayer {
  player_id: string; player_name: string; team_tricodes: string[]; games: number; possessions: number; points: number;
  points_per_possession: number | null; expected_points_per_possession: number | null; adjusted_per_100: number | null;
  top_play_type: string | null; qualified: boolean; percentiles: Percentiles; breakdown?: PlayTypeBreakdown[];
}
export interface PlayTypesView extends FeedEnvelope {
  side: "offensive" | "defensive"; focus_player_id: string | null; focus_rule: string | null; focus: PlayTypePlayer | null;
  league: { play_type: string; label: string; possessions: number; points: number; points_per_possession: number | null }[];
  players: PlayTypePlayer[];
}

export interface TrackingColumn { key: string; label: string; kind: "total" | "rate" | "pct"; higher_is_better: boolean | null }
export interface TrackingPlayer {
  player_id: string; player_name: string; team_tricode: string | null; games: number | null; minutes: number | null;
  values: Record<string, number | null>; qualified: boolean; percentiles: Percentiles;
}
export interface TrackingView extends FeedEnvelope {
  group: string; groups: { value: string; label: string }[]; columns: TrackingColumn[]; players: TrackingPlayer[];
}
export interface PlayerTracking extends FeedEnvelope {
  player_id: string; observed: boolean;
  player: { games: number | null; minutes: number | null; qualified: boolean; team_tricode: string | null } | null;
  groups: { group: string; label: string; columns: TrackingColumn[]; values: Record<string, number | null> | null; percentiles: Percentiles | null }[];
}

export interface CombineRow {
  row_key: string; player_id: string | null; player_name: string; draft_year: number; position: string | null;
  height_no_shoes_inches: number | null; height_shoes_inches: number | null; wingspan_inches: number | null;
  standing_reach_inches: number | null; weight_lbs: number | null; body_fat_pct: number | null;
  hand_length_inches: number | null; hand_width_inches: number | null; standing_vertical_inches: number | null;
  max_vertical_inches: number | null; lane_agility_seconds: number | null; three_quarter_sprint_seconds: number | null;
  span_minus_height: number | null; pick_overall: number | null; drafted_by: string | null; percentiles: Percentiles;
}
export interface CombineView {
  version: string; source: string; draft_year: number | null; draft_years: { year: number; players: number }[];
  cohort: { players: number; measured: number; first_year: number; last_year: number };
  default_rule: string | null; selected_player_id: string | null; limitations: string[]; rows: CombineRow[]; sources: FeedSource[];
}

export interface WowyCell {
  seconds: number; points_for: number; points_against: number; possessions_for: number; possessions_against: number; stints: number;
  minutes: number; offensive_rating: number | null; defensive_rating: number | null; net_rating: number | null; small_sample: boolean;
}
export type WowyCellName = "both" | "a_only" | "b_only" | "neither";
export interface WowyPair { a: string; b: string; cells: Record<WowyCellName, WowyCell>; shared_minutes: number; net_together_minus_apart: number | null }
export interface WowyTeam { team_id: string; team_tricode: string; team_name: string }
export interface WowyView {
  version: string; season: string; phase: FeedPhase; scopes: FeedScope[]; games: number; last_game_date: string;
  team: WowyTeam; teams: WowyTeam[]; players: { player_id: string; player_name: string; minutes: number }[];
  team_total: WowyCell; selected: WowyPair | null; pairs: WowyPair[]; default_rule: string | null; min_possessions: number;
  artifact_sha256: string; inputs: { acceptance_sha256: string; datasets: Record<string, string> }; source: string; limitations: string[];
}

export const PHASE_LABELS: Record<FeedPhase, string> = { regular_season: "Regular Season", playoffs: "Playoffs" };

async function getJson<T>(path: string, params: Record<string, string | number | null | undefined>, signal?: AbortSignal): Promise<T> {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) if (value !== null && value !== undefined && value !== "") query.set(key, String(value));
  const response = await fetch(`${browserApi}/api/workbench/${path}${query.size ? `?${query}` : ""}`, { cache: "no-store", signal });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(typeof body.detail === "string" ? body.detail : `Request failed (${response.status}).`);
  }
  return response.json();
}

export const getDefense = (p: { season?: string | null; phase?: string | null; category?: string | null; playerId?: string | null }, signal?: AbortSignal) =>
  getJson<DefenseView>("defense", p, signal);
export const getSeasonMatchups = (p: { season?: string | null; phase?: string | null; playerId?: string | null; side?: string | null; limit?: number | null; opponentId?: string | null }, signal?: AbortSignal) =>
  getJson<MatchupsView>("season-matchups", p, signal);
export const getPlayTypes = (p: { season?: string | null; phase?: string | null; side?: string | null; playerId?: string | null }, signal?: AbortSignal) =>
  getJson<PlayTypesView>("play-types", p, signal);
export const getTracking = (p: { season?: string | null; phase?: string | null; group?: string | null }, signal?: AbortSignal) =>
  getJson<TrackingView>("tracking", p, signal);
export const getPlayerTracking = (playerId: string, p: { season?: string | null; phase?: string | null }, signal?: AbortSignal) =>
  getJson<PlayerTracking>(`players/${encodeURIComponent(playerId)}/tracking`, p, signal);
export const getCombine = (p: { draftYear?: string | number | null; playerId?: string | null }, signal?: AbortSignal) =>
  getJson<CombineView>("combine", p, signal);
export const getWowy = (p: { season?: string | null; phase?: string | null; teamId?: string | null; a?: string | null; b?: string | null }, signal?: AbortSignal) =>
  getJson<WowyView>("wowy", p, signal);

export const getSixFactor = (p: { season: string; phase: string; beforeDate: string; sortMetric: string; limit?: number }, signal?: AbortSignal) =>
  getJson<ImpactResponse>("impact", { ...p, limit: p.limit ?? 25 }, signal);

/** Formatting shared by the PC11 pages. Unknown is always an em dash, never zero. */
export const fmt = (value: number | null | undefined, digits = 1): string =>
  value === null || value === undefined || !Number.isFinite(value) ? "—" : value.toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits });
export const pct = (value: number | null | undefined, digits = 1): string =>
  value === null || value === undefined || !Number.isFinite(value) ? "—" : `${(value * 100).toFixed(digits)}%`;
export const signed = (value: number | null | undefined, digits = 1): string =>
  value === null || value === undefined || !Number.isFinite(value) ? "—" : `${value > 0 ? "+" : value < 0 ? "−" : ""}${Math.abs(value).toFixed(digits)}`;
export const inches = (value: number | null | undefined): string => {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  const feet = Math.floor(value / 12);
  return `${feet}′ ${(value - feet * 12).toFixed(2).replace(/\.?0+$/, "")}″`;
};
/** A tracking value in its column's unit. */
export const trackingValue = (column: TrackingColumn, value: number | null | undefined): string =>
  column.kind === "pct" ? pct(value) : fmt(value, column.kind === "rate" && Math.abs(value ?? 0) < 10 ? 2 : 1);
export const sourceLabel = (sources: FeedSource[]): string => {
  const observed = sources.map(source => source.observed_at).sort().at(-1);
  return observed ? `NBA Stats (hoopR mirror) · observed ${formatDate(observed.slice(0, 10))}` : "NBA Stats (hoopR mirror)";
};
