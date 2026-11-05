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
