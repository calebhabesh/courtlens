import { describe, expect, it } from "vitest";
import { defaultPair, difficultyBands, difficultyHistogram, formatPoints, formatSigned, type ZtsRow } from "./zts";

const row = (id: string, difficulty: number | null, minutes = 1500, usage = 30): ZtsRow => ({
  player_id: id, player_name: id, season: "2025-26", zts_status: "known", reason: null,
  rts: 0, tsa: 500, expected_ts: 0.55, difficulty, zts: difficulty, synergy_ts: 0.56, coverage: 0.95,
  listed_possessions: 400, implied_possessions: 420, minutes, off_possessions: 2000, scoring_usage: usage,
  ts_add: 0, zts_add: 0, teams: [],
});

describe("zTS page rules", () => {
  it("formats TS fractions as signed points", () => {
    expect(formatPoints(0.0123)).toBe("+1.2");
    expect(formatPoints(-0.054)).toBe("−5.4");
    expect(formatPoints(null)).toBe("—");
    expect(formatSigned(2.5)).toBe("+2.5");
  });

  it("counts the named bands in TS points", () => {
    const bands = difficultyBands([row("a", 0.025), row("b", -0.03), row("c", 0.005), row("d", -0.015), row("e", null)]);
    expect(bands).toMatchObject({ players: 4, hard: 1, easy: 1, middle: 1 });
    expect(bands.mean).toBeCloseTo((2.5 - 3 + 0.5 - 1.5) / 4);
    expect(bands.median).toBeCloseTo((-1.5 + 0.5) / 2);
  });

  it("bins every value into one-point bins", () => {
    const bins = difficultyHistogram([row("a", 0.025), row("b", -0.03), row("c", 0.005)]);
    expect(bins.map(bin => bin.from)).toEqual([-3, -2, -1, 0, 1, 2]);
    expect(bins.reduce((sum, bin) => sum + bin.count, 0)).toBe(3);
    expect(difficultyHistogram([])).toEqual([]);
  });

  it("picks the default pair by its named rule", () => {
    const pair = defaultPair([row("hard", 0.03), row("easy", -0.05), row("low-minutes", 0.09, 500), row("low-usage", -0.09, 1500, 20)]);
    expect(pair?.map(p => p.player_id)).toEqual(["hard", "easy"]);
    expect(defaultPair([row("only", 0.01)])).toBeNull();
  });
});
