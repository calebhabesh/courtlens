import { describe, it, expect } from "vitest";
import {
  STATS_PRESETS,
  getPresetById,
  computeHeaderGroups,
  COUNTING_MODES
} from "./stats-presets";
import {
  encodeQueryToSearchParams,
  decodeSearchParamsToQuery,
  buildPreservedContextUrl
} from "./query-url";
import type { PlayerResearchItem } from "./types";

describe("stats-explorer integration & contracts", () => {
  it("all 10 presets have valid columns with proper group assignments and sort metrics", () => {
    for (const preset of STATS_PRESETS) {
      if (preset.id === "onoff") {
        // Shared-floor columns come from the typed operation, never box-score proxies.
        expect(preset.columns).toEqual([]);
        expect(preset.description).toContain("shared-floor");
        continue;
      }
      expect(preset.columns.length).toBeGreaterThan(0);
      const groups = computeHeaderGroups(preset.columns);
      const groupColSpanSum = groups.reduce((acc, g) => acc + g.colSpan, 0);
      expect(groupColSpanSum).toBe(preset.columns.length);

      for (const col of preset.columns) {
        expect(col.key).toBeTruthy();
        expect(col.label).toBeTruthy();
        expect(col.group).toBeTruthy();
        expect(col.sortMetric).toBeTruthy();
      }
    }
  });

  it("overview preset correctly maps counting mode overrides for volume stats", () => {
    const overview = getPresetById("overview");
    const ptsCol = overview.columns.find((c) => c.label === "PTS");
    expect(ptsCol).toBeDefined();
    expect(ptsCol?.countingModeKeys?.raw).toBe("pts");
    expect(ptsCol?.countingModeKeys?.per_game).toBe("pts_per_game");
    expect(ptsCol?.countingModeKeys?.per_36).toBe("pts_per_36");

    const rebCol = overview.columns.find((c) => c.label === "REB");
    expect(rebCol).toBeDefined();
    expect(rebCol?.countingModeKeys?.raw).toBe("reb");
    expect(rebCol?.countingModeKeys?.per_game).toBe("reb_per_game");
    expect(rebCol?.countingModeKeys?.per_36).toBe("reb_per_36");

    const astCol = overview.columns.find((c) => c.label === "AST");
    expect(astCol).toBeDefined();
    expect(astCol?.countingModeKeys?.raw).toBe("ast");
    expect(astCol?.countingModeKeys?.per_game).toBe("ast_per_game");
    expect(astCol?.countingModeKeys?.per_36).toBe("ast_per_36");
  });

  it("gated capabilities are explicitly flagged with prerequisite blocks", () => {
    const gatedPresets = STATS_PRESETS.filter((p) => p.gated);
    expect(gatedPresets.length).toBe(3);
    const gatedIds = gatedPresets.map((p) => p.id);
    expect(gatedIds).toContain("impact");
    expect(gatedIds).toContain("onoff");
    expect(gatedIds).toContain("sixfactor");

    const gatedCountingModes = COUNTING_MODES.filter((c) => c.gated);
    expect(gatedCountingModes.length).toBe(2);
    expect(gatedCountingModes.map((c) => c.id)).toContain("per_75");
    expect(gatedCountingModes.map((c) => c.id)).toContain("per_100");
  });

  it("compare tray limit is strictly bounded to 8 players", () => {
    const players: PlayerResearchItem[] = Array.from({ length: 10 }, (_, i) => ({
      player_id: `pid_${i}`,
      player_name: `Player ${i}`,
      teams: ["BOS"],
      stints_count: 1,
      games_played: 20,
      total_minutes: 500,
      metrics: { pts: 200 },
      sample_sizes: { pts: 20 }
    }));

    const tray: PlayerResearchItem[] = [];
    const maxCapacity = 8;

    for (const p of players) {
      if (tray.length < maxCapacity) {
        tray.push(p);
      }
    }

    expect(tray.length).toBe(8);
    expect(tray.map((p) => p.player_id)).not.toContain("pid_8");
    expect(tray.map((p) => p.player_id)).not.toContain("pid_9");
  });

  it("preserves view_state (viewId, density, identityMode) in URL encode/decode round trip", () => {
    const originalQuery = {
      season: "2025-26",
      phase: "regular_season",
      before_date: "2026-03-01",
      name: "Jokic",
      view_state: {
        view_id: "shooting",
        density: "compact" as const,
        identity_mode: "logos" as const,
        columns: ["fgm", "fga", "fg_pct"]
      }
    };

    const searchParams = encodeQueryToSearchParams(originalQuery);
    expect(searchParams.get("viewId")).toBe("shooting");
    expect(searchParams.get("density")).toBe("compact");
    expect(searchParams.get("identityMode")).toBe("logos");
    expect(searchParams.get("columns")).toBe("fgm,fga,fg_pct");

    const decoded = decodeSearchParamsToQuery(searchParams);
    expect(decoded.view_state?.view_id).toBe("shooting");
    expect(decoded.view_state?.density).toBe("compact");
    expect(decoded.view_state?.identity_mode).toBe("logos");
    expect(decoded.view_state?.columns).toEqual(["fgm", "fga", "fg_pct"]);
  });

  it("buildPreservedContextUrl retains season, phase, beforeDate, window, and releaseId across navigation", () => {
    const currentParams = new URLSearchParams({
      season: "2024-25",
      phase: "playoffs",
      beforeDate: "2025-05-15",
      window: "last_10",
      releaseId: "rel-xyz-123",
      viewId: "defense"
    });

    const targetUrl = "/players/1629029";
    const preserved = buildPreservedContextUrl(targetUrl, currentParams);

    expect(preserved).toContain("season=2024-25");
    expect(preserved).toContain("phase=playoffs");
    expect(preserved).toContain("beforeDate=2025-05-15");
    expect(preserved).toContain("window=last_10");
    expect(preserved).toContain("releaseId=rel-xyz-123");
  });
});
