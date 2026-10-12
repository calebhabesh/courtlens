import { browserApi } from "./workbench-api";
import type { Category, ShapeItem } from "@/components/charts";

/** PC10 Roster Shapes: 2026-27 projected rosters sized by sealed BPR value over replacement. */
export type ShapeFit = "returning" | "new" | "unknown";
export type ShapeSort = "fullest" | "fit" | "az";

export interface ShapeArchetype {
  season: string; minutes: number; games: number; small_sample: boolean;
  primary: number; primary_name: string; membership: { cluster: number; name: string; probability: number }[];
}
export interface ShapePlayer {
  player_id: string; player_name: string; listed_position: string | null;
  value: number | null; value_qualified: boolean; value_percentile: number | null;
  reference_minutes: number | null; reference_games: number | null; vor: number | null;
  archetype: ShapeArchetype | null; fit: ShapeFit; previous_teams: string[]; unknown_reasons: string[];
}
export interface ShapeTeam {
  team_id: string; team_tricode: string; team_name: string;
  players: number; sized_players: number; below_replacement_players: number; unknown_players: number;
  total_vor: number; returning_share: number | null;
  archetype_mix: { cluster: number; vor: number; share: number }[];
  roster: ShapePlayer[];
}
export interface ShapeCluster { cluster: number; name: string; short: string; description: string; color_token: string | null }
export interface RosterShapes {
  version: string; season: string; label: string; projected_note: string; reference_season: string;
  replacement_level: number; full_season_minutes: number; capacity: number;
  value: { label: string; unit: string; artifact_sha256: string; scope: { seasons: string[]; phase: string; cutoff: string } };
  archetypes: { artifact_sha256: string; names_status: string; clusters: ShapeCluster[] };
  roster_context: { dataset_id: string; observed_at: string; source_url: string; content_sha256: string };
  statistics_release_id: string | null; credit: string; limitations: string[]; teams: ShapeTeam[];
}

export const SORTS: { value: ShapeSort; label: string }[] = [
  { value: "fullest", label: "Fullest" }, { value: "fit", label: "Best fit" }, { value: "az", label: "A–Z" }
];
export const FIT_LABELS: Record<ShapeFit, string> = { returning: "Returning", new: "New arrival", unknown: "No 2025-26 sample" };
export const SOURCE = "NBA player index · CourtLens BPR and derived archetypes";

export async function getRosterShapes(params: { datasetId?: string | null; releaseId?: string | null }, signal?: AbortSignal): Promise<RosterShapes> {
  const query = new URLSearchParams();
  if (params.datasetId) query.set("datasetId", params.datasetId);
  if (params.releaseId) query.set("releaseId", params.releaseId);
  const response = await fetch(`${browserApi}/api/workbench/roster-shapes${query.size ? `?${query}` : ""}`, { cache: "no-store", signal });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(typeof body.detail === "string" ? body.detail : `Roster Shapes request failed (${response.status}).`);
  }
  return response.json();
}

export const parseSort = (value: string | null): ShapeSort => (value === "fit" || value === "az" ? value : "fullest");

/** Unknown fit share sorts last; ties fall back to the team name so the order is stable. */
export function sortTeams(teams: ShapeTeam[], sort: ShapeSort): ShapeTeam[] {
  const byName = (a: ShapeTeam, b: ShapeTeam) => a.team_name.localeCompare(b.team_name);
  if (sort === "az") return [...teams].sort(byName);
  if (sort === "fit") return [...teams].sort((a, b) => (b.returning_share ?? -1) - (a.returning_share ?? -1) || byName(a, b));
  return [...teams].sort((a, b) => b.total_vor - a.total_vor || byName(a, b));
}

/** Cluster index 0..5 maps to the six v1.2 categorical tokens; anything else stays unknown. */
export function category(cluster: number | null | undefined): Category | null {
  return cluster !== null && cluster !== undefined && cluster >= 0 && cluster < 6 ? (cluster + 1) as Category : null;
}

export function categoryLabels(clusters: ShapeCluster[]): Record<Category, string> {
  const labels = { 1: "", 2: "", 3: "", 4: "", 5: "", 6: "" } as Record<Category, string>;
  for (const cluster of clusters) { const key = category(cluster.cluster); if (key) labels[key] = cluster.name; }
  return labels;
}

const FIT_SHAPE: Record<ShapeFit, ShapeItem["fit"]> = { returning: "observed", new: "projected", unknown: "unknown" };
export const SHAPE_FIT_LABELS: Record<ShapeItem["fit"], string> = { observed: "returning", projected: "new arrival", unknown: "no 2025-26 sample" };

/** Area is value over replacement; below replacement is a known 0-area row, unknown stays null. */
export function shapeItems(team: ShapeTeam): ShapeItem[] {
  return team.roster.map(player => ({
    id: player.player_id,
    label: player.player_name,
    value: player.vor === null ? null : Math.max(0, player.vor),
    category: category(player.archetype?.primary),
    fit: FIT_SHAPE[player.fit]
  }));
}

export const one = (value: number | null | undefined) => value === null || value === undefined ? "—" : value.toFixed(1);
/** Signs follow the displayed (rounded) value, so a tiny negative never reads "−0.0". */
export function signed(value: number | null | undefined): string {
  if (value === null || value === undefined) return "—";
  const shown = Math.round(value * 10) / 10;
  return `${shown > 0 ? "+" : shown < 0 ? "−" : ""}${Math.abs(shown).toFixed(1)}`;
}
export const percent = (value: number | null | undefined) => value === null || value === undefined ? "—" : `${Math.round(value * 100)}%`;
export const wholeMinutes = (value: number | null) => value === null ? "—" : Math.round(value).toLocaleString("en-US");

export function rankOf(teams: ShapeTeam[], tricode: string): number | null {
  const index = sortTeams(teams, "fullest").findIndex(team => team.team_tricode === tricode);
  return index < 0 ? null : index + 1;
}
