import { browserApi } from "./workbench-api";

/** Research → Six-Factor RAPM (R02). Values are the served impact bundle's, unrounded. */
export type RatingKey = "rapm" | "orapm" | "drapm";
export type FactorKey = "o_ts" | "o_tov" | "o_reb" | "d_ts" | "d_tov" | "d_reb";
export type NodeKey = RatingKey | FactorKey;
export type NodeStatus = "estimate" | "no_interval" | "below_qualification" | "not_in_fit";
export type SixFactorPhase = "regular_season" | "playoffs";

export interface ImpactNode {
  value: number | null; low: number | null; high: number | null;
  replicates: number | null; percentile: number | null; status: NodeStatus;
}
export interface Composites { net_efficiency: number | null; possession_control: number | null; reconstructed_rapm: number | null }
export interface SixFactorPlayer {
  player_id: string; player_name: string; team: string | null; games: number | null; minutes: number | null;
  metrics: Record<NodeKey, ImpactNode>; composites: Composites;
}
export interface Provenance {
  version: string; manifest_sha256: string; artifact_sha256: string; cutoff: string; last_included_date: string;
  interval_sha256: string | null; interval_registration: string | null;
}
export interface R2 { value: number | null; p10: number | null; p90: number | null }
export interface Reconstruction {
  registration: string; registration_sha256: string; players: number;
  in_sample: R2; cross_validated: R2; cross_season: R2; orapm_in_sample: R2; drapm_in_sample: R2;
  weights: Record<FactorKey | "intercept", number>;
  range_in_sample: [number, number]; range_cross_validated: [number, number]; seasons: number;
}
export interface Archetype { key: string; label: string; rule: string; factors: FactorKey[]; player_id: string }
export interface SixFactorPage {
  status: "available"; season: string; phase: SixFactorPhase;
  scopes: { season: string; phase: SixFactorPhase }[];
  provenance: Provenance; intervals_available: boolean;
  coverage: { admitted_games: number; scheduled_games: number } | null;
  fit_players: number; reconstruction: Reconstruction | null; archetypes: Archetype[]; players: SixFactorPlayer[];
}
/** A season with no fit (a season in progress, or before 2014-15) still lists those that have one. */
export interface SixFactorUnavailable { status: "unavailable"; season: string; phase: SixFactorPhase; scopes: SixFactorPage["scopes"] }
export interface ImpactTreeData extends SixFactorPlayer {
  status: "available"; season: string; phase: SixFactorPhase; in_fit: boolean; rated_seasons: string[]; provenance: Provenance;
}

async function read<T>(path: string, params: Record<string, string>, signal?: AbortSignal): Promise<T> {
  const response = await fetch(`${browserApi}/api/six-factor${path}?${new URLSearchParams(params)}`, { signal });
  if (!response.ok) {
    const body = await response.json().catch(() => null) as { detail?: string } | null;
    throw new Error(body?.detail ?? `Six-factor request failed (${response.status})`);
  }
  return response.json() as Promise<T>;
}
export const getSixFactorPage = (season: string, phase: SixFactorPhase, signal?: AbortSignal) =>
  read<SixFactorPage | SixFactorUnavailable>("", { season, phase }, signal);
export const getImpactTree = (playerId: string, season: string, phase: SixFactorPhase, signal?: AbortSignal) =>
  read<ImpactTreeData>("/tree", { playerId, season, phase }, signal);

export interface FactorMeta { key: FactorKey; label: string; short: string; side: "offense" | "defense"; family: "Shooting" | "Turnovers" | "Rebounding"; help: string }
/** Favorable sign: positive always helps the player's team. */
export const FACTORS: readonly FactorMeta[] = [
  { key: "o_ts", label: "Offensive Shooting", short: "oTS", side: "offense", family: "Shooting", help: "Team true shooting with the player on offense" },
  { key: "o_tov", label: "Offensive Ball Security", short: "oTOV", side: "offense", family: "Turnovers", help: "Fewer team turnovers with the player on offense" },
  { key: "o_reb", label: "Offensive Rebounding", short: "oREB", side: "offense", family: "Rebounding", help: "Team offensive rebound share with the player on" },
  { key: "d_ts", label: "Shooting Defense", short: "dTS", side: "defense", family: "Shooting", help: "Lower opponent true shooting with the player on defense" },
  { key: "d_tov", label: "Forcing Turnovers", short: "dTOV", side: "defense", family: "Turnovers", help: "More opponent turnovers with the player on defense" },
  { key: "d_reb", label: "Defensive Rebounding", short: "dREB", side: "defense", family: "Rebounding", help: "Lower opponent offensive rebound share with the player on" },
];
export const factorMeta = (key: FactorKey): FactorMeta => FACTORS.find(factor => factor.key === key)!;
export const NODE_LABELS: Record<NodeKey, { short: string; label: string }> = {
  rapm: { short: "RAPM", label: "Total impact" },
  orapm: { short: "ORAPM", label: "Offense" },
  drapm: { short: "DRAPM", label: "Defense" },
  ...Object.fromEntries(FACTORS.map(factor => [factor.key, { short: factor.short, label: factor.label }])) as Record<FactorKey, { short: string; label: string }>,
};

export const UNKNOWN = "Unknown";
export const signed = (value: number | null | undefined, digits = 2): string =>
  value == null || !Number.isFinite(value) ? "—" : `${value > 0 ? "+" : value < 0 ? "−" : ""}${Math.abs(value).toFixed(digits)}`;
export const intervalText = (node: ImpactNode, digits = 2): string =>
  node.low == null || node.high == null ? UNKNOWN : `${signed(node.low, digits)} to ${signed(node.high, digits)}`;
export const signTone = (value: number | null | undefined): "up" | "down" | undefined =>
  value == null || Math.abs(value) < 0.005 ? undefined : value > 0 ? "up" : "down";
/** Why a node has no value or no interval, in the reader's words. */
export const unknownReason = (status: NodeStatus): string | null => ({
  estimate: null,
  no_interval: "No interval served for this fit",
  below_qualification: "Below the fit's qualification",
  not_in_fit: "Not in this fit",
}[status]);

/** The player with all six factors, or the note that the composites stay unknown. */
export const hasEveryFactor = (player: SixFactorPlayer) => FACTORS.every(factor => player.metrics[factor.key].value != null);

export type SortKey = NodeKey | "net_efficiency" | "possession_control" | "games" | "minutes";
export function sortValue(player: SixFactorPlayer, key: SortKey): number | null {
  if (key === "games" || key === "minutes") return player[key];
  if (key === "net_efficiency" || key === "possession_control") return player.composites[key];
  return player.metrics[key].value;
}
/** Unknowns always sort last, whichever way the column runs; ties keep a stable player order. */
export function sortPlayers(players: readonly SixFactorPlayer[], key: SortKey, direction: "asc" | "desc"): SixFactorPlayer[] {
  const sign = direction === "asc" ? 1 : -1;
  return [...players].sort((a, b) => {
    const x = sortValue(a, key), y = sortValue(b, key);
    if (x == null || y == null) return (x == null ? 1 : 0) - (y == null ? 1 : 0) || a.player_id.localeCompare(b.player_id);
    return sign * (x - y) || a.player_id.localeCompare(b.player_id);
  });
}

/** Symmetric-free axis for interval marks: covers every shown low, high and zero, on a nice step. */
export function intervalDomain(nodes: readonly ImpactNode[]): [number, number] {
  const values = nodes.flatMap(node => [node.low, node.high, node.value]).filter((value): value is number => value != null);
  return [Math.floor(Math.min(0, ...values)), Math.ceil(Math.max(0, ...values, 1))];
}

/**
 * CourtLens' own explainer copy for each factor (design phase, owner 2026-11-06): what can move it
 * and what a box score would not show. Descriptive, not a claim about any player.
 */
export interface FactorCopy { tagline: string; showsUp: readonly string[]; boxMisses: readonly string[]; pair: FactorKey }
export const FACTOR_COPY: Record<FactorKey, FactorCopy> = {
  o_ts: {
    tagline: "Team shoots better",
    showsUp: ["The player's own scoring efficiency", "Shots created for teammates", "Spacing that keeps help defenders home", "Ball movement that ends in better looks"],
    boxMisses: ["Gravity that never becomes an assist", "Screens that free a shooter", "Non-shooters who shrink the floor despite a high personal TS%"],
    pair: "o_reb",
  },
  o_tov: {
    tagline: "Team turns it over less",
    showsUp: ["The player's own ball security", "Safe passing and handling under pressure", "Decisions that end possessions in a shot"],
    boxMisses: ["Turnovers a player prevents for teammates", "Calm handling that never shows as an assist", "Roles that keep the ball moving without risk"],
    pair: "o_ts",
  },
  o_reb: {
    tagline: "Team grabs more of its misses",
    showsUp: ["Crashing the glass and tipping misses", "Position and size near the rim", "Second chances that start a new shot clock"],
    boxMisses: ["Box-outs that free a teammate's rebound", "Tips that keep the ball alive without a credit", "The cost of crashing: fewer players back on defense"],
    pair: "o_ts",
  },
  d_ts: {
    tagline: "Opponents shoot worse",
    showsUp: ["Rim protection and contests", "Help rotations and scheme", "Keeping shooters off clean looks"],
    boxMisses: ["Shots opponents never take", "Contests without a block or a steal", "Communication that holds a scheme together"],
    pair: "d_tov",
  },
  d_tov: {
    tagline: "Opponents turn it over more",
    showsUp: ["Steals, deflections and charges", "Ball pressure and active hands", "Passing lanes jumped"],
    boxMisses: ["Deflections a teammate turns into a steal", "Passes denied before they are thrown", "Gambles that give up shots, which show in dTS instead"],
    pair: "d_ts",
  },
  d_reb: {
    tagline: "Opponents grab fewer of their misses",
    showsUp: ["Defensive rebounds and boxing out", "Size and position near the rim", "Ending possessions after a miss"],
    boxMisses: ["Box-outs that let a teammate secure the ball", "Rebounds conceded to a teammate", "Second chances prevented without a rebound credit"],
    pair: "d_ts",
  },
};
