import { describe, expect, it } from "vitest";
import fixture from "./signal-noise.fixture.json";
import { composedTs, shrinkRow, shrunkRate } from "./signal-noise";

describe("Signal vs Noise shrinkage in the browser (R03)", () => {
  it("equals the Python module on every fixture case", () => {
    for (const c of fixture.cases) {
      const row = { fgm: c.fg2m + c.fg3m, fga: c.fg2a + c.fg3a, fg3m: c.fg3m, fg3a: c.fg3a, ftm: c.ftm, fta: c.fta };
      const shrunk = shrinkRow(row, c.priors);
      for (const key of ["fg3_pct", "ft_pct", "ts_pct"] as const) {
        const expected = c.expected[key];
        if (expected === null) expect(shrunk[key]).toBeNull();
        else expect(shrunk[key]).toBeCloseTo(expected, 12);
      }
    }
  });

  it("is unknown without attempts, a prior or a field", () => {
    expect(shrunkRate(0, 0, 1, 1)).toBeNull();
    expect(shrinkRow({ fgm: 5, fga: 10, fg3m: 1, fg3a: 3, ftm: 2, fta: 2 }, {}).fg3_pct).toBeNull();
    expect(shrinkRow({ fgm: 5, fga: 10, fg3m: null, fg3a: 3, ftm: 2, fta: 2 }, { fg3_pct: { alpha: 1, beta: 2 } }).ts_pct).toBeNull();
    expect(composedTs(0, 0, 0, 0.5, 0.3, 0.8)).toBeNull();
  });
});

import served from "../e2e/fixtures/signal-noise.json";
import { exampleSeasons, reached, rmsePoints, shrinkingWins, squaredPoints, stripOrder, stripReach, type SignalNoiseSummary, type StatResult } from "./signal-noise";

describe("Signal vs Noise page helpers (RD13)", () => {
  const summary = served.summary as unknown as SignalNoiseSummary;
  const stats = summary.stabilization.stats as StatResult[];

  it("sorts each family fastest first and puts a stat that never reaches 0.5 last", () => {
    const pct = stripOrder(stats, "percentage");
    expect(pct).toHaveLength(8);
    expect(pct.at(-1)?.key).toBe("fg3_pct");
    const ns = pct.slice(0, -1).map(s => s.levels["0.5"]!.n!);
    expect(ns).toEqual([...ns].sort((a, b) => a - b));
    expect(stripOrder(stats, "per_36")).toHaveLength(12);
  });

  it("never treats a fitted, unobserved level as reached, and keeps it off the strip's scale", () => {
    const three = stats.find(s => s.key === "fg3_pct")!;
    expect(reached(three.levels["0.5"])).toBe(false);
    const pct = stats.filter(s => s.family === "percentage");
    // 3P%'s fitted 0.7 interval reaches past 1,000 3PA; the scale stops at what was observed.
    expect(three.levels["0.7"]!.interval.high!).toBeGreaterThan(1000);
    expect(stripReach(pct)).toBe(Math.max(three.levels["0.5"]!.largest_n!, ...pct.map(s => s.median_sample ?? 0), ...pct.filter(s => reached(s.levels["0.7"])).map(s => s.levels["0.7"]!.interval.high!)));
  });

  it("converts mean squared error of a proportion to squared points and RMSE in points", () => {
    expect(squaredPoints(0.003876)).toBeCloseTo(38.76, 10);
    expect(rmsePoints(0.0036)).toBeCloseTo(6, 10);
  });

  it("counts a stat as a win for shrinking only when the pooled 95% interval is above zero", () => {
    expect(shrinkingWins(summary)).toHaveLength(5);
    const tied = structuredClone(summary);
    tied.validation.fg3_pct.pooled.raw_minus_shrunk!.low = -0.0001;
    expect(shrinkingWins(tied)).not.toContain("fg3_pct");
  });

  it("lists only the player's own seasons that have a prior, newest first, and always the one shown", () => {
    const priors = summary.priors.fg3_pct.map(p => p.season);
    expect(exampleSeasons(["1975-76", "1984-85", "1988-89"], priors, "1988-89")).toEqual(["1988-89", "1984-85"]);
    expect(exampleSeasons([], priors, "2025-26")).toEqual(["2025-26"]);
  });
});
