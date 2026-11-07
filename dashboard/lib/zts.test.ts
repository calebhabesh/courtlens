import { describe, expect, it } from "vitest";
import { FAMILIES, defaultPair, density, difficultyBands, difficultyHistogram, extremes, familyTs, formatPoints, formatSigned, pearson, signTone, type LeagueType, type ZtsRow } from "./zts";

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

describe("RD03 presentation helpers", () => {
  it("tones a sign by the shown figure: gold above zero, blue below, none at zero", () => {
    expect(signTone(0.012)).toBe("a");
    expect(signTone(-0.012)).toBe("b");
    expect(signTone(0.0004)).toBeUndefined();
    expect(signTone(null)).toBeUndefined();
    expect(signTone(0.04, 1, 1)).toBeUndefined();
    expect(signTone(1.2, 1, 1)).toBe("a");
  });
  it("draws a Gaussian density that integrates to about one", () => {
    const xs = Array.from({ length: 2001 }, (_, i) => -10 + i * 0.01);
    const d = density([-1, 0, 0.5, 2], xs);
    expect(d.reduce((s, v) => s + v * 0.01, 0)).toBeCloseTo(1, 3);
    expect(density([], [0, 1])).toEqual([0, 0]);
  });
  it("computes a plain Pearson r over known pairs only", () => {
    expect(pearson([[1, 2], [2, 4], [3, 6], [null, 1]])!.r).toBeCloseTo(1, 12);
    expect(pearson([[1, 2], [2, 4], [3, 6], [null, 1]])!.n).toBe(3);
    expect(pearson([[1, 3], [2, 2], [3, 1]])!.r).toBeCloseTo(-1, 12);
    expect(pearson([[1, 2], [2, 3]])).toBeNull();
  });
  it("pools a family's league TS from points and scoring possessions, and every type sits in one family", () => {
    const t = (play_type: string, points: number, sp: number): LeagueType => ({ play_type, label: play_type, ts: points / (2 * sp), share: 0, points, scoring_possessions: sp });
    expect(familyTs([t("isolation", 100, 100), t("handoff", 60, 40), t("cut", 999, 1)], FAMILIES[0].types)).toBeCloseTo(160 / 280, 12);
    const all = FAMILIES.flatMap(f => [...f.types]);
    expect(new Set(all).size).toBe(11);
  });
  it("picks five easiest and five hardest roles among 1,000+ minute players", () => {
    const rows = Array.from({ length: 14 }, (_, i) => row(`p${i}`, (i - 7) / 100, i === 0 ? 900 : 1200));
    const { easiest, hardest } = extremes(rows);
    expect(easiest.map(r => r.player_id)).toEqual(["p1", "p2", "p3", "p4", "p5"]);
    expect(hardest.map(r => r.player_id)).toEqual(["p13", "p12", "p11", "p10", "p9"]);
  });
});
