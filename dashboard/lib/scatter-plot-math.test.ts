import { describe, it, expect } from "vitest";
import {
  computeSummaryStats,
  buildScatterDataset,
  projectX,
  projectY
} from "./scatter-plot-math";
import type { PlayerResearchItem } from "./types";

describe("scatter-plot-math (F06 Table plots)", () => {
  describe("computeSummaryStats", () => {
    it("computes correct summary statistics for odd-length sample", () => {
      const stats = computeSummaryStats([10, 20, 30, 40, 50]);
      expect(stats.n).toBe(5);
      expect(stats.mean).toBe(30);
      expect(stats.median).toBe(30);
      expect(stats.min).toBe(10);
      expect(stats.max).toBe(50);
      // Sample SD: sqrt(((10-30)^2 + (20-30)^2 + (30-30)^2 + (40-30)^2 + (50-30)^2) / 4)
      // sqrt((400 + 100 + 0 + 100 + 400) / 4) = sqrt(1000 / 4) = sqrt(250) ≈ 15.811
      expect(stats.sd).toBeCloseTo(15.811, 2);
    });

    it("computes correct median for even-length sample", () => {
      const stats = computeSummaryStats([10, 20, 30, 40]);
      expect(stats.n).toBe(4);
      expect(stats.mean).toBe(25);
      expect(stats.median).toBe(25);
    });

    it("handles empty arrays gracefully without crashing", () => {
      const stats = computeSummaryStats([]);
      expect(stats.n).toBe(0);
      expect(stats.mean).toBe(0);
      expect(stats.median).toBe(0);
      expect(stats.sd).toBe(0);
    });
  });

  describe("buildScatterDataset", () => {
    const mockPlayers: PlayerResearchItem[] = [
      {
        player_id: "p1",
        player_name: "Luka Doncic",
        teams: ["DAL"],
        stints_count: 1,
        games_played: 20,
        total_minutes: 700,
        metrics: { pts_per_game: 34.0, ts_pct: 0.62 },
        sample_sizes: {}
      },
      {
        player_id: "p2",
        player_name: "Shai Gilgeous-Alexander",
        teams: ["OKC"],
        stints_count: 1,
        games_played: 22,
        total_minutes: 750,
        metrics: { pts_per_game: 31.0, ts_pct: 0.64 },
        sample_sizes: {}
      },
      {
        player_id: "p3",
        player_name: "Role Player A",
        teams: ["MEM"],
        stints_count: 1,
        games_played: 15,
        total_minutes: 300,
        metrics: { pts_per_game: 12.0, ts_pct: 0.54 },
        sample_sizes: {}
      },
      {
        player_id: "p4",
        player_name: "Role Player B",
        teams: ["BOS"],
        stints_count: 1,
        games_played: 18,
        total_minutes: 360,
        metrics: { pts_per_game: 14.0, ts_pct: 0.55 },
        sample_sizes: {}
      },
      {
        player_id: "p5",
        player_name: "Defensive Specialist (No TS%)",
        teams: ["ORL"],
        stints_count: 1,
        games_played: 10,
        total_minutes: 150,
        metrics: { pts_per_game: 4.0, ts_pct: null }, // Missing Y metric
        sample_sizes: {}
      },
      {
        player_id: "p6",
        player_name: "Injured Player (No PTS)",
        teams: ["MIA"],
        stints_count: 0,
        games_played: 0,
        total_minutes: 0,
        metrics: { pts_per_game: null, ts_pct: 0.5 }, // Missing X metric
        sample_sizes: {}
      }
    ];

    it("strictly requires paired valid observations and counts omitted rows", () => {
      const dataset = buildScatterDataset(mockPlayers, "pts_per_game", "ts_pct");

      expect(dataset.totalCount).toBe(6);
      expect(dataset.omittedCount).toBe(2); // p5 and p6 omitted
      expect(dataset.points.length).toBe(4);

      const names = dataset.points.map((pt) => pt.playerName);
      expect(names).toContain("Luka Doncic");
      expect(names).toContain("Shai Gilgeous-Alexander");
      expect(names).toContain("Role Player A");
      expect(names).toContain("Role Player B");
      expect(names).not.toContain("Defensive Specialist (No TS%)");
      expect(names).not.toContain("Injured Player (No PTS)");
    });

    it("detects statistical outliers beyond threshold distance", () => {
      const dataset = buildScatterDataset(mockPlayers, "pts_per_game", "ts_pct", 1.1);

      // In this 4-player sample, high-volume scorers are flagged as outliers relative to the cohort
      const luka = dataset.points.find((p) => p.playerName === "Luka Doncic");
      const shai = dataset.points.find((p) => p.playerName === "Shai Gilgeous-Alexander");
      expect(luka?.isOutlier).toBe(true);
      expect(luka?.outlierReason).toBeDefined();
      expect(shai?.isOutlier).toBe(true);
      expect(shai?.outlierReason).toBeDefined();
    });
  });

  describe("projectX and projectY", () => {
    it("projects coordinates accurately within bounds and inverts Y for SVG", () => {
      const domain: [number, number] = [0, 100];
      const width = 800;
      const height = 500;
      const padLeft = 50;
      const padRight = 50;
      const padTop = 40;
      const padBottom = 40;

      // X min should project to padLeft
      expect(projectX(0, domain, width, padLeft, padRight)).toBe(50);
      // X max should project to width - padRight
      expect(projectX(100, domain, width, padLeft, padRight)).toBe(750);
      // X mid should project to center
      expect(projectX(50, domain, width, padLeft, padRight)).toBe(400);

      // Y min should project to bottom (height - padBottom)
      expect(projectY(0, domain, height, padTop, padBottom)).toBe(460);
      // Y max should project to top (padTop)
      expect(projectY(100, domain, height, padTop, padBottom)).toBe(40);
      // Y mid should project to vertical center
      expect(projectY(50, domain, height, padTop, padBottom)).toBe(250);
    });
  });
});
