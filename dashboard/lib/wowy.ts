// WOWY combos (alignment row 5): request state in the URL, the GET client and table columns.
// Contract: docs/design/wowy-combos-v1.md.

import { browserApi, WorkbenchApiError } from "./workbench-api";

export type Role = "combo" | "on" | "off";
export type Clock = "full" | "h1" | "h2" | "q1" | "q2" | "q3" | "q4" | "ot" | "clutch" | "custom";
export type TierMetric = "offense" | "defense" | "net";
export type Tier = "top" | "mid" | "bottom";
export type VsState = "on" | "off" | "split";
export type WowyTab = "overview" | "offense" | "defense" | "expanded";

export const MAX_COMBO = 5;

export interface Interval { lower: number | null; upper: number | null; games: number; reason: string | null }

export interface ComboCell {
  key: string;
  present: string[];
  absent: string[];
  games: number;
  stints: number;
  minutes: number;
  offensive_possessions: number;
  defensive_possessions: number;
  sample_status: "available" | "insufficient_sample" | "empty";
  offensive_rating: number | null;
  defensive_rating: number | null;
  net_rating: number | null;
  net_interval: Interval;
  factors: Record<string, number | null>;
  /** Teammates other than the combo players, by minutes; empty on the total row. */
  teammates?: Teammate[];
  teammate_help?: TeammateHelp | null;
}

export interface Teammate { player_id: string; minutes: number; share: number; dpm: number | null; o_dpm: number | null; d_dpm: number | null }
/** Minutes-weighted average DARKO of the other teammates on the floor. */
export interface TeammateHelp { players: number; net: number | null; offense: number | null; defense: number | null; coverage: number }

export interface OnOffShift {
  player_id: string;
  on_minutes: number;
  off_minutes: number;
  on_net: number | null;
  off_net: number | null;
  net_difference: number | null;
  offense_difference: number | null;
  defense_difference: number | null;
  interval: Interval;
}

export interface WowyRosterPlayer { player_id: string; name: string | null; games: number; minutes: number }
export interface OpponentTeam { team_id: string; tricode: string; rank: number | null; value: number | null }

export interface WowyCombosResponse {
  operation_version: string;
  context: Record<string, unknown>;
  request: { combo: string[]; on: string[]; off: string[]; vs_team: string | null; vs_player: string | null; vs_state: VsState };
  team_id: string | null;
  available_scopes: { season: string; phase: string }[];
  coverage_status: "available" | "partial" | "source_blocked";
  expected_games: number;
  observed_games: number;
  excluded_stints: number;
  first_game: string | null;
  last_game: string | null;
  roster: WowyRosterPlayer[];
  names: Record<string, string>;
  opponents: OpponentTeam[];
  league_rating: number | null;
  /** Pooled league ts_pct, tov_100, oreb_pct and fg3_pct (offense equals defense). */
  league_factors?: Record<string, number | null>;
  darko_as_of?: string | null;
  /** The season is under way; its stints are the newest daily build. */
  provisional?: boolean;
  cells: ComboCell[];
  shifts: OnOffShift[];
  total: ComboCell | null;
  input_hash: string;
  evidence_hash: string;
  limitations: string[];
}

/** Every page input, as read from the URL. */
export interface WowyState {
  team: string | null;
  season: string | null;
  phase: string;
  combo: string[];
  on: string[];
  off: string[];
  from: string | null;
  to: string | null;
  clock: Clock;
  periods: number[];
  clockFrom: number;
  clockTo: number;
  garbage: boolean;
  common: boolean;
  opponents: string[];
  tierMetric: TierMetric | null;
  tier: Tier | null;
  vsTeam: string | null;
  vs: string | null;
  vsState: VsState;
  tab: WowyTab;
}

const CLOCKS: Clock[] = ["full", "h1", "h2", "q1", "q2", "q3", "q4", "ot", "clutch", "custom"];
const list = (value: string | null) => (value ?? "").split(",").filter(Boolean);
const oneOf = <T extends string>(value: string | null, options: readonly T[], fallback: T): T => options.includes(value as T) ? value as T : fallback;
const minutes = (value: string | null, fallback: number) => {
  const n = Number(value);
  return value != null && Number.isFinite(n) && n >= 0 && n <= 12 ? n : fallback;
};

export function readState(get: (name: string) => string | null): WowyState {
  const tierMetric = oneOf<TierMetric | "">(get("tierMetric"), ["offense", "defense", "net"], "");
  const tier = oneOf<Tier | "">(get("tier"), ["top", "mid", "bottom"], "");
  return {
    team: get("team"),
    season: get("season"),
    phase: get("phase") ?? "regular_season",
    combo: list(get("combo")).slice(0, MAX_COMBO),
    on: list(get("on")),
    off: list(get("off")),
    from: get("from"),
    to: get("to"),
    clock: oneOf(get("clock"), CLOCKS, "full"),
    periods: list(get("periods")).map(Number).filter(n => Number.isInteger(n) && n >= 1 && n <= 5),
    clockFrom: minutes(get("cfrom"), 12),
    clockTo: minutes(get("cto"), 0),
    garbage: get("garbage") === "1",
    common: get("common") === "1",
    opponents: list(get("opp")),
    tierMetric: tierMetric && tier ? tierMetric : null,
    tier: tierMetric && tier ? tier : null,
    vsTeam: get("vsTeam"),
    vs: get("vsTeam") ? get("vs") : null,
    vsState: oneOf(get("vsState"), ["on", "off", "split"] as const, "on"),
    tab: oneOf(get("tab"), ["overview", "offense", "defense", "expanded"] as const, "overview"),
  };
}

/** The player's role, or null when they hold none. */
export function roleOf(state: WowyState, id: string): Role | null {
  return state.combo.includes(id) ? "combo" : state.on.includes(id) ? "on" : state.off.includes(id) ? "off" : null;
}

/** URL updates that give a player a role (or clear it when they already hold it). */
export function assignRole(state: WowyState, id: string, role: Role): Record<string, string | null> {
  const current = roleOf(state, id);
  const strip = (ids: string[]) => ids.filter(p => p !== id);
  const next = { combo: strip(state.combo), on: strip(state.on), off: strip(state.off) };
  if (current !== role) {
    // A split opponent takes one of the five combo slots; the oldest combo player gives way.
    const room = MAX_COMBO - (state.vs && state.vsState === "split" ? 1 : 0);
    next[role] = role === "combo" ? [...next.combo, id].slice(-room) : [...next[role], id];
  }
  return { combo: next.combo.join(",") || null, on: next.on.join(",") || null, off: next.off.join(",") || null };
}

/** URL keys reset by "Reset" in the Filters header: everything but the team, season and players. */
export const FILTER_KEYS = ["from", "to", "clock", "periods", "cfrom", "cto", "garbage", "common", "opp", "tierMetric", "tier", "vsTeam", "vs", "vsState"] as const;

export function activeFilters(state: WowyState): number {
  return [state.from || state.to, state.clock !== "full", state.garbage, state.common,
    state.opponents.length || state.tierMetric, state.vs].filter(Boolean).length;
}

export function requestParams(state: WowyState): URLSearchParams {
  const params = new URLSearchParams();
  const add = (key: string, value: string | number | null | undefined) => { if (value != null && value !== "") params.append(key, String(value)); };
  add("team_id", state.team);
  add("season", state.season);
  add("phase", state.phase);
  for (const [key, ids] of [["combo", state.combo], ["on", state.on], ["off", state.off], ["opponents", state.opponents]] as const) ids.forEach(id => add(key, id));
  add("start_date", state.from);
  add("end_date", state.to);
  if (state.clock !== "full") add("clock", state.clock);
  if (state.clock === "custom") {
    state.periods.forEach(p => add("periods", p));
    add("clock_from", state.clockFrom);
    add("clock_to", state.clockTo);
  }
  if (state.garbage) add("exclude_garbage", "true");
  if (state.common) add("common_games", "true");
  if (state.tierMetric && state.tier) { add("tier_metric", state.tierMetric); add("tier", state.tier); }
  if (state.vsTeam) add("vs_team", state.vsTeam);
  if (state.vsTeam && state.vs) { add("vs_player", state.vs); add("vs_state", state.vsState); }
  return params;
}

export async function getWowyCombos(params: URLSearchParams, signal?: AbortSignal): Promise<WowyCombosResponse> {
  const response = await fetch(`${browserApi}/api/workbench/operations/wowy-combos?${params}`, {
    cache: "no-store",
    signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(30000)]) : AbortSignal.timeout(30000),
  });
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    const detail = body?.detail;
    throw new WorkbenchApiError(response.status, typeof detail === "string" ? detail : JSON.stringify(detail ?? body ?? "WOWY request failed"));
  }
  return response.json();
}

export interface WowyColumn {
  key: string;
  label: string;
  title: string;
  /** Which way is better, for the change against the team total; null for volume columns. */
  better: "up" | "down" | null;
  value: (cell: ComboCell) => number | null;
  /** Ratings show their change against the team total under the value. */
  delta?: boolean;
  percent?: boolean;
}

const factor = (key: string) => (cell: ComboCell) => cell.factors[key] ?? null;
const rating = (label: string, title: string, value: (cell: ComboCell) => number | null, better: "up" | "down"): WowyColumn =>
  ({ key: label.toLowerCase(), label, title, better, value, delta: true });
const pct = (key: string, label: string, title: string, better: "up" | "down" | null): WowyColumn =>
  ({ key, label, title, better, value: factor(key), percent: true });

const ORTG = rating("ORtg", "Points scored per 100 offensive possessions", c => c.offensive_rating, "up");
const DRTG = rating("DRtg", "Points allowed per 100 defensive possessions", c => c.defensive_rating, "down");

/** Column sets per tab; MIN and NET frame every set. */
export const TAB_COLUMNS: Record<WowyTab, WowyColumn[]> = {
  overview: [ORTG, DRTG,
    pct("fg3_pct", "3P%", "Three-point percentage", "up"),
    pct("opp_fg3_pct", "Opp 3P%", "Opponent three-point percentage", "down")],
  offense: [ORTG,
    pct("efg_pct", "eFG%", "Effective field goal percentage", "up"),
    pct("tov_pct", "TOV%", "Player turnovers per 100 plays (FGA + 0.44 FTA + TOV)", "down"),
    pct("oreb_pct", "OREB%", "Share of available offensive rebounds", "up"),
    pct("ft_rate", "FTr", "Free throw attempts per field goal attempt", "up"),
    pct("fg3a_rate", "3PAr", "Share of field goal attempts from three", null)],
  defense: [DRTG,
    pct("opp_efg_pct", "Opp eFG%", "Opponent effective field goal percentage", "down"),
    pct("opp_tov_pct", "Opp TOV%", "Opponent player turnovers per 100 plays", "up"),
    pct("dreb_pct", "DREB%", "Share of available defensive rebounds", "up"),
    pct("opp_ft_rate", "Opp FTr", "Opponent free throw attempts per field goal attempt", "down"),
    pct("opp_fg3a_rate", "Opp 3PAr", "Share of opponent field goal attempts from three", null)],
  // Databallr's Expanded tab: both ends' factors in one wide table.
  expanded: [ORTG, DRTG,
    pct("efg_pct", "eFG%", "Effective field goal percentage", "up"),
    pct("tov_pct", "TOV%", "Player turnovers per 100 plays (FGA + 0.44 FTA + TOV)", "down"),
    pct("oreb_pct", "OREB%", "Share of available offensive rebounds", "up"),
    pct("ft_rate", "FTr", "Free throw attempts per field goal attempt", "up"),
    pct("opp_efg_pct", "Opp eFG%", "Opponent effective field goal percentage", "down"),
    pct("opp_tov_pct", "Opp TOV%", "Opponent player turnovers per 100 plays", "up"),
    pct("dreb_pct", "DREB%", "Share of available defensive rebounds", "up"),
    pct("opp_ft_rate", "Opp FTr", "Opponent free throw attempts per field goal attempt", "down")],
};

export const CLOCK_OPTIONS: { value: Clock; label: string }[] = [
  { value: "full", label: "Full Game" }, { value: "h1", label: "1st Half" }, { value: "h2", label: "2nd Half + OT" },
  { value: "q1", label: "Q1" }, { value: "q2", label: "Q2" }, { value: "q3", label: "Q3" }, { value: "q4", label: "Q4" },
  { value: "ot", label: "OT" }, { value: "clutch", label: "Last 5 of Q4 + OT" }, { value: "custom", label: "Custom" },
];

export const fmt = (value: number | null | undefined, digits = 1) => value == null ? "—" : value.toFixed(digits);
export const signed = (value: number | null | undefined, digits = 1) => {
  if (value == null) return "—";
  // Sign the shown value, so −0.04 reads 0.0 rather than −0.0.
  const shown = Number(value.toFixed(digits));
  return `${shown > 0 ? "+" : shown < 0 ? "−" : ""}${Math.abs(shown).toFixed(digits)}`;
};

/** "better" / "worse" / null for a signed change, given which way is better. */
export function tone(change: number | null, better: "up" | "down" | null): "better" | "worse" | undefined {
  if (change == null || better == null || Math.abs(change) < 0.05) return undefined;
  return (change > 0) === (better === "up") ? "better" : "worse";
}

/** Databallr's short lineup label: the last name, or initials when it would not fit ("CMB"). */
export function shortName(name: string): string {
  const parts = name.split(" ").filter(Boolean);
  const last = parts.slice(1).join(" ") || name;
  if (last.length <= 9 && !last.includes("-")) return last;
  return parts.flatMap(part => part.split("-")).map(part => part[0]?.toUpperCase() ?? "").join("");
}
