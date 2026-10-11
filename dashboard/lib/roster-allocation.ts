import type { TeamDetailResponse } from "./types";

/** Depth-chart lanes (D17). Positions are user assignments; no positional source exists. */
export const POSITION_LANES = ["PG", "SG", "SF", "PF", "C"] as const;
export const LANES = [...POSITION_LANES, "Unassigned"] as const;
export type Lane = (typeof LANES)[number];
export type AllocationMode = "observed" | "projected";

/** A regulation team rotation allocates 240 player-minutes per game (D18 gauge target). */
export const REGULATION_TEAM_MINUTES = 240;

export type CohortRow = TeamDetailResponse["player_cohort"][number];
export type Allocation = CohortRow & { allocation_position: Lane; allocation_minutes: number | null };

export function isLane(value: unknown): value is Lane {
  return typeof value === "string" && (LANES as readonly string[]).includes(value);
}

/** Projected input text → minutes. Blank stays unknown (null); it is never a zero. */
export function parseProjected(text: string | undefined): number | null {
  return text?.trim() ? Number(text) : null;
}

export function isValidMinutes(value: number | null): boolean {
  return value === null || (Number.isFinite(value) && value >= 0);
}

/** Rows in API order with the user's lane and the minutes for the chosen basis. */
export function buildAllocations(
  rows: CohortRow[], mode: AllocationMode, positions: Record<string, Lane>, projected: Record<string, string>
): Allocation[] {
  return rows.map((row) => ({
    ...row,
    allocation_position: positions[row.player_id] ?? "Unassigned",
    allocation_minutes: mode === "observed" ? row.total_minutes : parseProjected(projected[row.player_id])
  }));
}

export interface AllocationSummary {
  /** Sum of known, valid minutes. */
  total: number;
  unknown: number;
  invalid: boolean;
  lanes: Record<Lane, { minutes: number; share: number | null; players: number }>;
}

export function summarize(allocations: Allocation[]): AllocationSummary {
  const known = (value: number | null) => (value !== null && isValidMinutes(value) ? value : 0);
  const total = allocations.reduce((sum, row) => sum + known(row.allocation_minutes), 0);
  const lanes = Object.fromEntries(LANES.map((lane) => {
    const members = allocations.filter((row) => row.allocation_position === lane);
    const minutes = members.reduce((sum, row) => sum + known(row.allocation_minutes), 0);
    return [lane, { minutes, share: total > 0 ? minutes / total : null, players: members.length }];
  })) as AllocationSummary["lanes"];
  return {
    total,
    unknown: allocations.filter((row) => row.allocation_minutes === null).length,
    invalid: allocations.some((row) => !isValidMinutes(row.allocation_minutes)),
    lanes
  };
}

export type GaugeStatus = "under" | "full" | "over";

/** Projected total against 240 (compared at 0.1-minute precision, the input step). */
export function gaugeStatus(total: number): GaugeStatus {
  const tenths = Math.round(total * 10);
  return tenths > REGULATION_TEAM_MINUTES * 10 ? "over" : tenths < REGULATION_TEAM_MINUTES * 10 ? "under" : "full";
}

/**
 * The `roster-minute-allocation-v1` export. Key order and values match the pre-FO05 page exactly,
 * so files stay byte-compatible: allocations keep API order, not lane order.
 */
export function allocationExport(data: TeamDetailResponse, mode: AllocationMode, allocations: Allocation[]) {
  return {
    version: "roster-minute-allocation-v1",
    context: data.context,
    team: data.team,
    source: "team-detail-player-game-boxes",
    basis: mode,
    position_source: "user_assigned",
    units: mode === "observed" ? "total_team_stint_minutes" : "projected_minutes_per_game",
    allocations,
    warnings: data.warnings
  };
}

export const ALLOCATION_EXPORT_FILENAME = "courtlens-roster-allocation.json";
