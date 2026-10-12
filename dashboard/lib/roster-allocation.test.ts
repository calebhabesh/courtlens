import { describe, expect, it } from "vitest";
import {
  allocationExport, buildAllocations, gaugeStatus, parseProjected, summarize, type Lane
} from "./roster-allocation";
import type { TeamDetailResponse } from "./types";

const data = {
  team: { id: "1610612738", tricode: "BOS", name: "Boston Celtics" },
  context: { release_id: "r", season: "2025-26", phase: "regular_season", before_date: "2026-04-13" },
  record: { games_played: 1, wins: 1, losses: 0, win_pct: 1 },
  production: {}, allowance: {},
  player_cohort: [
    { player_id: "1", player_name: "A", games_played: 2, total_minutes: 60, pts_per_game: 5, reb_per_game: 3, ast_per_game: 1 },
    { player_id: "2", player_name: "B", games_played: 1, total_minutes: 20, pts_per_game: null, reb_per_game: null, ast_per_game: null },
    // Reported non-appearances only: minutes are unknown (null), never zero.
    { player_id: "3", player_name: "C", games_played: 0, total_minutes: null, pts_per_game: null, reb_per_game: null, ast_per_game: null }
  ],
  recent_games: [],
  warnings: ["Fixture scope only"]
} satisfies TeamDetailResponse;

/** The pre-FO05 export, copied verbatim from the old roster-allocation-view.tsx. */
function legacyExport(mode: string, positions: Record<string, string>, minutes: Record<string, string>) {
  const rows = data.player_cohort;
  const allocations = rows.map(row => ({...row, allocation_position: positions[row.player_id] ?? "Unassigned", allocation_minutes: mode === "observed" ? row.total_minutes : minutes[row.player_id]?.trim() ? Number(minutes[row.player_id]) : null}));
  return {version:"roster-minute-allocation-v1",context:data.context,team:data.team,source:"team-detail-player-game-boxes",basis:mode,position_source:"user_assigned",units:mode === "observed" ? "total_team_stint_minutes" : "projected_minutes_per_game",allocations,warnings:data.warnings};
}

describe("roster allocation", () => {
  it("export is byte-compatible with roster-minute-allocation-v1 in both modes", () => {
    const positions: Record<string, Lane> = { "1": "PG" };
    for (const mode of ["observed", "projected"] as const) {
      const minutes = { "1": "24.5", "2": " " };
      const ours = allocationExport(data, mode, buildAllocations(data.player_cohort, mode, positions, minutes));
      expect(JSON.stringify(ours, null, 2)).toBe(JSON.stringify(legacyExport(mode, positions, minutes), null, 2));
    }
  });

  it("blank projected minutes stay unknown, not zero", () => {
    expect(parseProjected("")).toBeNull();
    expect(parseProjected("  ")).toBeNull();
    expect(parseProjected("0")).toBe(0);
    const summary = summarize(buildAllocations(data.player_cohort, "projected", {}, { "1": "30" }));
    expect(summary.total).toBe(30);
    expect(summary.unknown).toBe(2);
  });

  it("observed rows without recorded minutes stay unknown, not zero", () => {
    const observed = summarize(buildAllocations(data.player_cohort, "observed", {}, {}));
    expect(observed.total).toBe(80);
    expect(observed.unknown).toBe(1);
    expect(observed.invalid).toBe(false);
  });

  it("lane shares use the known total and flag invalid minutes", () => {
    const observed = summarize(buildAllocations(data.player_cohort, "observed", { "1": "C" }, {}));
    expect(observed.lanes.C).toEqual({ minutes: 60, share: 0.75, players: 1 });
    expect(observed.lanes.Unassigned.share).toBe(0.25);
    expect(observed.lanes.PG.share).toBe(0);
    const invalid = summarize(buildAllocations(data.player_cohort, "projected", {}, { "1": "-1", "2": "abc" }));
    expect(invalid.invalid).toBe(true);
    expect(invalid.total).toBe(0);
    expect(invalid.lanes.PG.share).toBeNull();
  });

  it("gauge compares against 240 at the input precision", () => {
    expect(gaugeStatus(239.9)).toBe("under");
    expect(gaugeStatus(240.04)).toBe("full");
    expect(gaugeStatus(240.1)).toBe("over");
  });
});
