import { describe, expect, it } from "vitest";
import {
  aggregateCareerStats,
  calculateRecentFormSummary,
  formatRecentGamesCsv,
  scaleToPer36,
  sliceRecentGames,
  SHOWCASE_PRESETS,
  type SeasonCareerRow
} from "./player-pages";
import type { PlayerGameLogItem } from "./types";

describe("player-pages math and aggregations", () => {
  const mockGames: PlayerGameLogItem[] = [
    {
      game_id: "001",
      game_date: "2026-01-10",
      season: "2025-26",
      phase: "regular_season",
      team_id: "MIA",
      team_tricode: "MIA",
      opponent_id: "BOS",
      opponent_tricode: "BOS",
      side: "home",
      appearance: "appeared",
      minutes: 36.0,
      points: 24,
      stats: {
        rebounds_total: 10,
        assists: 5,
        steals: 2,
        blocks: 1,
        field_goals_made: 10,
        field_goals_attempted: 18,
        three_pointers_made: 1,
        three_pointers_attempted: 3,
        free_throws_made: 3,
        free_throws_attempted: 4
      },
      legacy_fantasy_score: 48.0,
      lineage_ref: "hash001"
    },
    {
      game_id: "002",
      game_date: "2026-01-08",
      season: "2025-26",
      phase: "regular_season",
      team_id: "MIA",
      team_tricode: "MIA",
      opponent_id: "NYK",
      opponent_tricode: "NYK",
      side: "away",
      appearance: "appeared",
      minutes: 30.0,
      points: 16,
      stats: {
        rebounds_total: 8,
        assists: 3,
        steals: 1,
        blocks: 0,
        field_goals_made: 6,
        field_goals_attempted: 12,
        three_pointers_made: 0,
        three_pointers_attempted: 1,
        free_throws_made: 4,
        free_throws_attempted: 6
      },
      legacy_fantasy_score: 32.5,
      lineage_ref: "hash002"
    },
    {
      game_id: "003",
      game_date: "2026-01-05",
      season: "2025-26",
      phase: "regular_season",
      team_id: "MIA",
      team_tricode: "MIA",
      opponent_id: "ORL",
      opponent_tricode: "ORL",
      side: "home",
      appearance: "inactive",
      minutes: null,
      points: null,
      stats: {},
      legacy_fantasy_score: null,
      lineage_ref: "hash003"
    },
    {
      game_id: "004",
      game_date: "2026-01-03",
      season: "2025-26",
      phase: "regular_season",
      team_id: "MIA",
      team_tricode: "MIA",
      opponent_id: "CLE",
      opponent_tricode: "CLE",
      side: "away",
      appearance: "appeared",
      minutes: 34.0,
      points: 20,
      stats: {
        rebounds_total: 12,
        assists: 4,
        steals: 0,
        blocks: 2,
        field_goals_made: 8,
        field_goals_attempted: 15,
        three_pointers_made: 0,
        three_pointers_attempted: 0,
        free_throws_made: 4,
        free_throws_attempted: 5
      },
      legacy_fantasy_score: 43.0,
      lineage_ref: "hash004"
    }
  ];

  it("slices recent games to confirmed active appearances only", () => {
    const last5 = sliceRecentGames(mockGames, "last_5");
    expect(last5.length).toBe(3); // excludes inactive game 003
    expect(last5.every((g) => g.appearance === "appeared")).toBe(true);

    const all = sliceRecentGames(mockGames, "all");
    expect(all.length).toBe(3);
  });

  it("scales counting statistics to per-36 minutes accurately", () => {
    expect(scaleToPer36(24, 36.0)).toBe(24.0);
    expect(scaleToPer36(16, 30.0)).toBe(19.2); // (16 / 30) * 36 = 19.2
    expect(scaleToPer36(null, 30.0)).toBeNull();
    expect(scaleToPer36(16, null)).toBeNull();
    expect(scaleToPer36(16, 0)).toBeNull();
  });

  it("computes descriptive recent form summary and tracks statistical highs", () => {
    const summary = calculateRecentFormSummary(mockGames);
    expect(summary.sampleSize).toBe(3);
    // Total minutes = 36 + 30 + 34 = 100
    expect(summary.totalMinutes).toBe(100.0);
    expect(summary.avgMinutes).toBe(33.3);
    // Total points = 24 + 16 + 20 = 60 => avg 20.0
    expect(summary.ptsPerGame).toBe(20.0);
    // Total rebounds = 10 + 8 + 12 = 30 => avg 10.0
    expect(summary.rebPerGame).toBe(10.0);
    // Total assists = 5 + 3 + 4 = 12 => avg 4.0
    expect(summary.astPerGame).toBe(4.0);

    // High points game
    expect(summary.highGamePoints).toEqual({
      points: 24,
      date: "2026-01-10",
      opponent: "BOS"
    });
    // High rebounds game
    expect(summary.highGameRebounds).toEqual({
      rebounds: 12,
      date: "2026-01-03",
      opponent: "CLE"
    });

    // Shooting percentages:
    // FGM = 10 + 6 + 8 = 24, FGA = 18 + 12 + 15 = 45 => 24 / 45 = 0.5333
    expect(summary.fgPct).toBe(0.5333);
    // 3PM = 1, 3PA = 4 => 0.2500
    expect(summary.fg3Pct).toBe(0.25);
    // FTM = 3 + 4 + 4 = 11, FTA = 4 + 6 + 5 = 15 => 11 / 15 = 0.7333
    expect(summary.ftPct).toBe(0.7333);
    // TS% = 60 / (2 * (45 + 0.44 * 15)) = 60 / (2 * 51.6) = 60 / 103.2 = 0.581395...
    expect(summary.tsPct).toBe(0.5814);
  });

  it("handles empty games array without throwing", () => {
    const emptySummary = calculateRecentFormSummary([]);
    expect(emptySummary.sampleSize).toBe(0);
    expect(emptySummary.ptsPerGame).toBeNull();
    expect(emptySummary.avgMinutes).toBeNull();
    expect(emptySummary.highGamePoints).toBeNull();
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

  it("formats recent games CSV with escaped player names and headers", () => {
    const csv = formatRecentGamesCsv("Bam Adebayo", mockGames.slice(0, 1), "per_game");
    expect(csv).toContain("Date,Player,Team,Opponent");
    expect(csv).toContain('"Bam Adebayo"');
    expect(csv).toContain("2026-01-10");
  });
});
