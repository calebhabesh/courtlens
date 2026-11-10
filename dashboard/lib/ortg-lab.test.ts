import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { BOARD_KEYS, LAB_GROUPS, eq11, labBase, labMarginal, labRange, labSet, labTerms, labValue, type LabKey } from "./ortg-lab";
import type { FourFactorsSeason, FourFactorsSummary } from "./research-r10";

// The real R10 API answers (e2e/fixtures), the same ones the Playwright specs serve.
const summary = JSON.parse(readFileSync("e2e/fixtures/r10-four-factors.json", "utf8")) as FourFactorsSummary;
const seasons = JSON.parse(readFileSync("e2e/fixtures/r10-four-factors-seasons.json", "utf8")) as Record<string, FourFactorsSeason>;
const rows = [
  ...summary.seasons.map(s => ({ name: `league ${s.season}`, row: s.league, mu: s.mu })),
  ...Object.values(seasons).flatMap(s => s.teams.map(t => ({ name: `${t.team} ${s.season}`, row: t, mu: s.mu }))),
];

describe("ORTG Lab arithmetic", () => {
  it("reproduces the served Eq. (11) rating and inputs for every league and team row", () => {
    expect(rows.length).toBe(summary.seasons.length + 60);
    for (const { name, row, mu } of rows) {
      const base = labBase(row, mu)!;
      const t = labTerms(base, base.state);
      expect(t.ortg, name).toBeCloseTo(row.ortg_factors!, 4); // served to 6 places, mu too
      expect(t.efg, name).toBeCloseTo(row.inputs.efg!, 5);
      expect(t.fg, name).toBeCloseTo(row.inputs.fg!, 5);
      expect(t.ftr, name).toBeCloseTo(row.inputs.ftr!, 5);
      expect(t.orb, name).toBeCloseTo(row.inputs.orb_pct!, 5);
      expect(base.state.tov, name).toBeCloseTo(row.inputs.tov_pct!, 5);
      expect(base.state.ft, name).toBeCloseTo(row.inputs.ft!, 5);
      expect(base.state.p2, name).toBeCloseTo(row.fg2!, 5);
      expect(base.state.p3, name).toBeCloseTo(row.fg3!, 5);
      expect(base.state.r3, name).toBeCloseTo(row.fg3a_rate!, 5);
      expect(t.ts, name).toBeCloseTo(row.ts!, 5);
      expect(base.state.o2, name).toBeCloseTo(row.rebounds_by_miss.two.orb_rate!, 5);
      expect(base.state.o3, name).toBeCloseTo(row.rebounds_by_miss.three.orb_rate!, 5);
      expect(base.state.oft, name).toBeCloseTo(row.rebounds_by_miss.ft_end.orb_rate!, 5);
    }
  });

  it("is always Eq. (11) on the inputs it shows, after any move", () => {
    const s = summary.seasons.at(-1)!;
    const base = labBase(s.league, s.mu)!;
    let state = base.state;
    const moves: [LabKey, number][] = [["p2", 0.03], ["ft", -0.05], ["r3", 0.08], ["o3", 0.06], ["tov", -0.02], ["efg", 0.01], ["ts", -0.015], ["orb", 0.04], ["oft", 0.05], ["fta", -0.04]];
    for (const [key, d] of moves) {
      state = labSet(base, state, key, labValue(base, state, key) + d);
      const t = labTerms(base, state);
      expect(t.ortg, key).toBeCloseTo(eq11(t.efg, t.ftr, state.tov, t.orb, t.fg, state.ft, s.mu), 9);
      expect(t.ortg, key).toBeCloseTo(100 * t.xshot * t.xeff * t.xposs, 9);
    }
  });

  it("moves each master dial by exactly what was asked", () => {
    const s = summary.seasons.at(-1)!;
    const base = labBase(s.league, s.mu)!;
    for (const key of ["efg", "ts", "orb"] as const) {
      const before = labValue(base, base.state, key);
      expect(labValue(base, labSet(base, base.state, key, before + 0.02), key), key).toBeCloseTo(before + 0.02, 9);
    }
    const efg = labSet(base, base.state, "efg", labValue(base, base.state, "efg") + 0.01);
    expect(efg.p2 - base.state.p2).toBeCloseTo(0.01, 12);
    expect(efg.p3 - base.state.p3).toBeCloseTo(0.01 * 2 / 3, 12);
  });

  it("matches the served marginals where the controls are the paper's", () => {
    const s = summary.seasons.at(-1)!;
    const base = labBase(s.league, s.mu)!;
    // TOV% one point down and ORB% one point up, other inputs fixed: the same moves as the served board.
    expect(labMarginal(base, base.state, "tov")).toBeCloseTo(s.league.marginals.tov_pct!, 5);
    expect(labMarginal(base, base.state, "orb")).toBeCloseTo(s.league.marginals.orb_pct!, 5);
    expect(labMarginal(base, base.state, "tov")).toBeGreaterThan(0);
  });

  it("covers every control once, with ranges around the starting value", () => {
    const keys = LAB_GROUPS.flatMap(g => g.keys);
    expect(new Set(keys).size).toBe(12);
    expect([...BOARD_KEYS].sort()).toEqual([...keys].sort());
    const s = summary.seasons.at(-1)!;
    const base = labBase(s.league, s.mu)!;
    for (const key of keys) {
      const { min, max } = labRange(base, key), v = labValue(base, base.state, key);
      expect(min, key).toBeLessThan(v); expect(max, key).toBeGreaterThan(v);
      expect(min).toBeGreaterThanOrEqual(0); expect(max).toBeLessThanOrEqual(1);
    }
  });
});
