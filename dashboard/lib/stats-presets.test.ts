import { describe, it, expect } from "vitest";
import {
  STATS_PRESETS,
  getPresetById,
  computeHeaderGroups,
  tableGroups,
  calculateCohortPercentiles,
  formatStatValue,
  formatIntValue,
  formatPctValue,
  NBA_TEAMS,
  COUNTING_MODES,
  IDENTITY_MODES,
  buildCustomViewPreset
} from "./stats-presets";
import type { PlayerResearchItem, CustomViewDefinition } from "./types";

describe("stats-presets", () => {
  it("defines all 10 standard presets including gated disclosures", () => {
    expect(STATS_PRESETS.length).toBe(10);
    const ids = STATS_PRESETS.map((p) => p.id);
    expect(ids).toContain("overview");
    expect(ids).toContain("shooting");
    expect(ids).toContain("defense");
    expect(ids).toContain("trueshooting");
    expect(ids).toContain("advanced");
    expect(ids).toContain("playmaking");
    expect(ids).toContain("rebounding");
    expect(ids).toContain("impact");
    expect(ids).toContain("onoff");
    expect(ids).toContain("sixfactor");
  });

  it("getPresetById returns matching preset or falls back to overview", () => {
    const shooting = getPresetById("shooting");
    expect(shooting.id).toBe("shooting");
    expect(shooting.label).toBe("Shooting");

    const fallback = getPresetById("non_existent_preset");
    expect(fallback.id).toBe("overview");
  });

  it("impact presets use served keys with runtime scope disclosures", () => {
    for (const id of ["impact", "onoff", "sixfactor"]) {
      const preset = getPresetById(id);
      expect(preset.gated).toBeUndefined();
      expect(preset.columns.length).toBeGreaterThan(0);
    }
    expect(getPresetById("impact").columns.map(column => column.key)).toContain("rapm_3y");
    expect(getPresetById("sixfactor").columns.map(column => column.key)).toContain("d_tov");
    expect(getPresetById("onoff").columns.map(column => column.key)).toContain("onoff_net_rating");
  });

  it("computeHeaderGroups calculates contiguous group colSpans accurately", () => {
    const overview = getPresetById("overview");
    const groups = computeHeaderGroups(overview.columns);
    expect(groups.length).toBeGreaterThan(0);

    const totalColSpan = groups.reduce((acc, g) => acc + g.colSpan, 0);
    expect(totalColSpan).toBe(overview.columns.length);
  });

  it("NBA_TEAMS lists all 30 NBA franchises with tricode and name", () => {
    expect(NBA_TEAMS.length).toBe(30);
    const tricodes = NBA_TEAMS.map((t) => t.tricode);
    expect(tricodes).toContain("BOS");
    expect(tricodes).toContain("DAL");
    expect(tricodes).toContain("GSW");
    expect(tricodes).toContain("LAL");
    expect(tricodes).toContain("TOR");
  });

  it("counting and identity modes define expected keys", () => {
    const countingIds = COUNTING_MODES.map((c) => c.id);
    expect(countingIds).toEqual(["per_game", "raw", "per_36", "per_75", "per_100"]);

    const identityIds = IDENTITY_MODES.map((i) => i.id);
    expect(identityIds).toEqual(["photos", "logos", "initials", "none"]);
  });

  it("formatting helpers handle valid numbers and missing/NaN gracefully", () => {
    expect(formatStatValue(24.56, 1)).toBe("24.6");
    expect(formatStatValue(null)).toBe("—");
    expect(formatStatValue(undefined)).toBe("—");
    expect(formatStatValue(NaN)).toBe("—");

    expect(formatIntValue(2370)).toBe("2,370");
    expect(formatIntValue(null)).toBe("—");

    expect(formatPctValue(0.6173)).toBe("61.7%");
    expect(formatPctValue(null)).toBe("—");
  });

  it("calculateCohortPercentiles applies midrank formula correctly with ties and bounds", () => {
    const mockItems: PlayerResearchItem[] = [
      {
        player_id: "p1",
        player_name: "Player 1",
        teams: ["DAL"],
        stints_count: 1,
        games_played: 50,
        total_minutes: 1500,
        metrics: { pts: 1000, ts_pct: 0.60 },
        sample_sizes: { pts: 50, ts_pct: 50 }
      },
      {
        player_id: "p2",
        player_name: "Player 2",
        teams: ["BOS"],
        stints_count: 1,
        games_played: 50,
        total_minutes: 1500,
        metrics: { pts: 500, ts_pct: 0.55 },
        sample_sizes: { pts: 50, ts_pct: 50 }
      },
      {
        player_id: "p3",
        player_name: "Player 3",
        teams: ["DEN"],
        stints_count: 1,
        games_played: 50,
        total_minutes: 1500,
        metrics: { pts: 500, ts_pct: null },
        sample_sizes: { pts: 50, ts_pct: 0 }
      },
      {
        player_id: "p4",
        player_name: "Player 4",
        teams: ["MIA"],
        stints_count: 1,
        games_played: 50,
        total_minutes: 1500,
        metrics: { pts: 200, ts_pct: 0.50 },
        sample_sizes: { pts: 50, ts_pct: 50 }
      }
    ];

    const percentiles = calculateCohortPercentiles(mockItems, ["pts", "ts_pct"]);

    // p1 has 1000: 3 less (p2, p3, p4), 1 equal (itself) -> (3 + 0.5) / 4 = 3.5 / 4 = 87.5% -> 88%
    expect(percentiles["p1"]["pts"]).toBe(88);

    // p2 and p3 tied at 500: 1 less (p4), 2 equal (p2, p3) -> (1 + 0.5 * 2) / 4 = 2 / 4 = 50%
    expect(percentiles["p2"]["pts"]).toBe(50);
    expect(percentiles["p3"]["pts"]).toBe(50);

    // p4 has 200: 0 less, 1 equal -> 0.5 / 4 = 12.5% -> 13%
    expect(percentiles["p4"]["pts"]).toBe(13);

    // p3 has null ts_pct -> null
    expect(percentiles["p3"]["ts_pct"]).toBeNull();

    // ts_pct has 3 valid items: p1 (0.60), p2 (0.55), p4 (0.50)
    expect(percentiles["p1"]["ts_pct"]).toBe(83); // (2 + 0.5) / 3 = 83.3% -> 83%
    expect(percentiles["p4"]["ts_pct"]).toBe(17); // (0 + 0.5) / 3 = 16.7% -> 17%
  });

  it("buildCustomViewPreset creates a valid preset and preserves unavailable columns", () => {
    const customView: CustomViewDefinition = {
      id: "my_custom_view",
      name: "My Custom View",
      columns: ["gp", "pts_per_game", "rapm", "unknown_metric"],
      unavailable_columns: ["rapm"],
      created_at: "2026-03-30T00:00:00Z",
      updated_at: "2026-03-30T00:00:00Z"
    };

    const preset = buildCustomViewPreset(customView);
    expect(preset.id).toBe("my_custom_view");
    expect(preset.label).toBe("My Custom View");
    expect(preset.columns.length).toBe(4);

    // GP column matches catalog
    expect(preset.columns[0].key).toBe("gp");
    expect(preset.columns[0].group).toBe("Participation");

    // PTS column matches catalog
    expect(preset.columns[1].key).toBe("pts_per_game");
    expect(preset.columns[1].group).toBe("Scoring");

    // rapm column is marked Unavailable
    expect(preset.columns[2].key).toBe("rapm");
    expect(preset.columns[2].group).toBe("Unavailable");
    expect(preset.columns[2].format?.(10)).toBe("—");

    // unknown_metric is assigned Custom group
    expect(preset.columns[3].key).toBe("unknown_metric");
    expect(preset.columns[3].group).toBe("Custom");

    // Preset gated metadata is populated
    expect(preset.gated).toBeDefined();
    expect(preset.gated?.block).toBe("Rich Data");
    expect(preset.gated?.status).toBe("partial");
  });

  it("getPresetById resolves custom views when provided", () => {
    const customViews: CustomViewDefinition[] = [
      {
        id: "view_123",
        name: "Clutch Stars",
        columns: ["gp", "pts_per_game"],
        created_at: "2026-03-30T00:00:00Z",
        updated_at: "2026-03-30T00:00:00Z"
      }
    ];

    const resolved = getPresetById("view_123", customViews);
    expect(resolved.id).toBe("view_123");
    expect(resolved.label).toBe("Clutch Stars");
    expect(resolved.columns.length).toBe(2);

    // Falls back to built-in if not in customViews
    const builtin = getPresetById("defense", customViews);
    expect(builtin.id).toBe("defense");

    // Falls back to overview if neither found
    const fallback = getPresetById("random_id", customViews);
    expect(fallback.id).toBe("overview");
  });
});

describe("table guide boundaries", () => {
  it("combines Overview counting metrics into one section", () => {
    expect(tableGroups(getPresetById("overview"))).toEqual([
      { label: "Profile", start: 0, colSpan: 3 },
      { label: "Counting", start: 3, colSpan: 3 },
      { label: "Defense", start: 6, colSpan: 2 },
      { label: "Efficiency", start: 8, colSpan: 5 }
    ]);
  });
  it("preserves noncontiguous custom groups and selected column order", () => {
    const view = buildCustomViewPreset({ id: "custom", name: "Reordered", columns: ["pts", "fg_pct", "pts_per_36", "fga"], unavailable_columns: [] });
    expect(tableGroups(view)).toEqual([
      { label: "Scoring", start: 0, colSpan: 1 },
      { label: "Shooting", start: 1, colSpan: 1 },
      { label: "Scoring", start: 2, colSpan: 1 },
      { label: "Shooting", start: 3, colSpan: 1 }
    ]);
  });
});
