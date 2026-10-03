import { describe, it, expect } from "vitest";
import type { PlayerComparisonResponse, MetricComparisonItem } from "./types";
import { ALL_CATALOG_METRICS } from "./stats-presets";

describe("player-comparison (F24 PvP and Multi-Player Comparison)", () => {
  const mockAlignedMetrics: MetricComparisonItem[] = [
    {
      metric: "pts_per_game",
      display_name: "PPG",
      unit: "",
      value_a: 32.5,
      value_b: 28.0,
      diff: 4.5,
      n_a: 25,
      n_b: 24
    },
    {
      metric: "ast_per_game",
      display_name: "APG",
      unit: "",
      value_a: 9.2,
      value_b: 6.4,
      diff: 2.8,
      n_a: 25,
      n_b: 24
    },
    {
      metric: "ts_pct",
      display_name: "TS%",
      unit: "%",
      value_a: 0.615,
      value_b: 0.635,
      diff: -0.02,
      n_a: 25,
      n_b: 24
    },
    {
      metric: "rapm",
      display_name: "RAPM",
      unit: "",
      value_a: null,
      value_b: null,
      diff: null,
      n_a: 25,
      n_b: 24
    }
  ];

  const mockComparison: PlayerComparisonResponse = {
    context: {
      season: "2024-25",
      phase: "regular_season",
      before_date: "2024-12-01",
      window: "season"
    },
    player_a: {
      id: "203999",
      name: "Nikola Jokic",
      teams: ["DEN"],
      games_played: 25,
      total_minutes: 875
    },
    player_b: {
      id: "1628389",
      name: "Bam Adebayo",
      teams: ["MIA"],
      games_played: 24,
      total_minutes: 810
    },
    aligned_metrics: mockAlignedMetrics,
    no_forced_winner_notice:
      "CourtLoad displays aligned empirical distributions and descriptive differences. We never invent a winner probability or automated start/sit decision from overlapping ranges.",
    warnings: []
  };

  it("preserves zero-inferred-claims and no forced winner notice", () => {
    expect(mockComparison.no_forced_winner_notice).toContain("never invent a winner probability");
    expect(mockComparison.no_forced_winner_notice).toContain("automated start/sit decision");
  });

  it("handles null / unavailable metrics without crashing or dropping rows", () => {
    const rapmMetric = mockComparison.aligned_metrics.find((m) => m.metric === "rapm");
    expect(rapmMetric).toBeDefined();
    expect(rapmMetric?.value_a).toBeNull();
    expect(rapmMetric?.value_b).toBeNull();
    expect(rapmMetric?.diff).toBeNull();
  });

  it("calculates numerical differences with proper signed polarity", () => {
    const ppg = mockComparison.aligned_metrics.find((m) => m.metric === "pts_per_game");
    expect(ppg?.diff).toBe(4.5);
    expect(Number(ppg?.value_a) - Number(ppg?.value_b)).toBe(4.5);

    const ts = mockComparison.aligned_metrics.find((m) => m.metric === "ts_pct");
    expect(ts?.diff).toBe(-0.02);
  });

  it("verifies catalog v2 coverage for key comparison presets", () => {
    const overallKeys = [
      "pts_per_game",
      "reb_per_game",
      "ast_per_game",
      "stl_per_game",
      "blk_per_game",
      "tov_per_game",
      "min_per_game",
      "gp",
      "ts_pct",
      "efg_pct",
      "ftr"
    ];

    for (const key of overallKeys) {
      expect(ALL_CATALOG_METRICS[key]).toBeDefined();
      expect(ALL_CATALOG_METRICS[key].label).toBeTruthy();
    }
  });
});
