import { describe, expect, it } from "vitest";
import {
  aggregateCareerStats,
  scaleToPer36,
  SHOWCASE_PRESETS,
  type SeasonCareerRow
} from "./player-pages";

describe("player-pages math and aggregations", () => {
  it("scales counting statistics to per-36 minutes accurately", () => {
    expect(scaleToPer36(24, 36.0)).toBe(24.0);
    expect(scaleToPer36(16, 30.0)).toBe(19.2); // (16 / 30) * 36 = 19.2
    expect(scaleToPer36(null, 30.0)).toBeNull();
    expect(scaleToPer36(16, null)).toBeNull();
    expect(scaleToPer36(16, 0)).toBeNull();
  });

  it("aggregates multi-season career statistics with strict incomplete career disclaimer", () => {
    const seasons: SeasonCareerRow[] = [
      {
        season: "2023-24",
        teams: "MIA",
        gamesPlayed: 71,
        minutes: 2416.4,
        minPerGame: 34.0,
        ptsPerGame: 19.3,
        rebPerGame: 10.4,
        astPerGame: 3.9,
        stlPerGame: 1.1,
        blkPerGame: 0.9,
        fgPct: 0.521,
        fg3Pct: 0.357,
        ftPct: 0.755,
        tsPct: 0.576,
        efgPct: 0.529,
        fantasyPerGame: 41.5
      },
      {
        season: "2024-25",
        teams: "MIA",
        gamesPlayed: 77,
        minutes: 2600.0,
        minPerGame: 33.8,
        ptsPerGame: 18.2,
        rebPerGame: 9.6,
        astPerGame: 4.1,
        stlPerGame: 1.2,
        blkPerGame: 1.0,
        fgPct: 0.515,
        fg3Pct: 0.333,
        ftPct: 0.76,
        tsPct: 0.57,
        efgPct: 0.52,
        fantasyPerGame: 40.2
      }
    ];

    const rollup = aggregateCareerStats(seasons, ["2023-24", "2024-25", "2025-26"]);
    expect(rollup.totalGames).toBe(148);
    expect(rollup.totalMinutes).toBe(5016.4);
    expect(rollup.careerPtsPerGame).toBe(18.7); // (19.3*71 + 18.2*77) / 148 = 18.727 -> 18.7
    expect(rollup.admittedSeasons).toEqual(["2023-24", "2024-25", "2025-26"]);
    expect(rollup.disclaimer).toContain("Career statistics represent 148 appearances");
    expect(rollup.disclaimer).toContain("admitted dataset seasons");
    expect(rollup.disclaimer).toContain("Prior or unadmitted seasons are strictly excluded");
  });

  it("handles empty career rows with disclaimer", () => {
    const emptyRollup = aggregateCareerStats([], ["2023-24", "2024-25"]);
    expect(emptyRollup.totalGames).toBe(0);
    expect(emptyRollup.careerPtsPerGame).toBeNull();
    expect(emptyRollup.disclaimer).toContain("Career data is strictly scoped to admitted dataset seasons");
  });

  it("verifies showcase preset definitions cover all 4 required focus areas", () => {
    const ids = SHOWCASE_PRESETS.map((p) => p.id);
    expect(ids).toEqual(["overall", "scoring", "playmaking_defense", "per_36"]);

    const overall = SHOWCASE_PRESETS.find((p) => p.id === "overall")!;
    expect(overall.metrics.some((m) => m.key === "pts_per_game")).toBe(true);
    expect(overall.metrics.some((m) => m.key === "ts_pct")).toBe(true);
  });

});
