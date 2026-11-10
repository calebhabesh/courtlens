import { describe, expect, it } from "vitest";
import {
  answerOf, band, chanceLine, costAxis, CSV_HEADER, csvRows, pointsAxis, seasonCheck, shortBand, signed, sortTeams, ticks, unknowns, viewCharts,
  type Cell, type Estimate, type Scope, type Zone,
} from "./shot-aftermath";

const e = (value: number, low: number, high: number): Estimate => ({ value, low, high, undefined_replicates: 0 });
const counts = { attempts: 500, makes: 250, oreb: 50, dreb: 200, miss_unknown: 0, make_possessions: 240, dreb_possessions: 190, blocks: 10, and_ones: 5, make_censored: 10, make_same_team: 0, make_followed: 0, dreb_censored: 10, dreb_same_team: 0 };
function cell(zone: Zone, net: Estimate | null, extra: Partial<Cell> = {}): Cell {
  return {
    team: "all", team_code: null, position: "all", zone, status: "ok", counts,
    values: { fg_pct: e(0.5, 0.48, 0.52), made: e(1, 0.98, 1.02), second_per_miss: e(0.3, 0.28, 0.32), second: e(0.15, 0.14, 0.16), own: e(1.15, 1.1, 1.2),
      dreb_share: e(0.8, 0.79, 0.81), ppp_make: e(1.1, 1.09, 1.11), ppp_dreb: e(1.2, 1.18, 1.22), cost: e(-0.01, -0.02, -0.001), net, miss_cost: e(0.03, 0.01, 0.05),
      miss_net: e(0.27, 0.25, 0.29), dreb_cost: e(0.04, 0.02, 0.06) },
    tones: { cost: "benefit", miss_cost: null, dreb_cost: null },
    ...extra,
  };
}

describe("shot aftermath numbers", () => {
  it("signs costs with a true minus and leaves a rounded zero unsigned", () => {
    expect(signed(0.047)).toBe("+0.047");
    expect(signed(-0.0101)).toBe("−0.010");
    expect(signed(-0.0001)).toBe("0.000");
    expect(band(e(-0.01, -0.015, 0.006), true)).toBe("−0.015 to +0.006");
    expect(shortBand(e(-0.081, -0.389, 0.215))).toBe("−.389 to +.215");
    expect(shortBand(e(0.64, -0.241, 1.428))).toBe("−.241 to +1.428");
    expect(shortBand(e(0, -0.0001, 0.02))).toBe(".000 to +.020");
  });

  it("puts every points chart of a view on one axis from zero and cost on its own symmetric axis", () => {
    const rows = [cell("rim", e(1.4, 1.39, 1.41)), cell("three", e(1.25, 1.24, 1.26))];
    expect(pointsAxis(rows, ["own", "net", "second"])).toBe(1.5);
    expect(pointsAxis(rows, ["ppp_dreb"], 1.157)).toBe(1.5);
    expect(costAxis(rows, "cost")).toBeCloseTo(0.02);
    expect(costAxis([cell("rim", null, { values: { ...cell("rim", null).values, cost: e(0.03, 0.01, 0.041) } })], "cost")).toBeCloseTo(0.05);
    expect(ticks(0.04, "cost")).toEqual([-0.04, -0.02, 0, 0.02, 0.04]);
    expect(ticks(0.05, "cost")).toEqual([-0.05, 0, 0.05]);
    // RD18 suggestion 4: a thin scope reaching 1.428 ends on a round 2.00, ticks at whole points, never ±1.44 / ±0.72.
    expect(costAxis([cell("rim", null, { values: { ...cell("rim", null).values, cost: e(0.64, -0.241, 1.428) } })], "cost")).toBeCloseTo(2);
    expect(ticks(2, "cost")).toEqual([-2, -1, 0, 1, 2]);
    expect(ticks(0.2, "cost")).toEqual([-0.2, -0.1, 0, 0.1, 0.2]);
    expect(ticks(1.5, "points")).toEqual([0, 0.5, 1, 1.5]);
  });

  it("names the best and worst zone and claims a clear lead only when intervals don't touch", () => {
    const rows = [cell("rim", e(1.4, 1.39, 1.41)), cell("short_mid", e(1.07, 1.06, 1.09)), cell("long_mid", e(0.97, 0.94, 1.0)), cell("three", e(1.25, 1.24, 1.27)), cell("all", e(1.25, 1.24, 1.26))];
    const a = answerOf(rows)!;
    expect(a.best.zone).toBe("rim");
    expect(a.worst.zone).toBe("long_mid");
    expect(a.bestClear).toBe(true);
    const close = answerOf([cell("rim", e(1.3, 1.2, 1.4)), cell("three", e(1.25, 1.21, 1.29))])!;
    expect(close.bestClear).toBe(false);
  });

  it("picks the largest coloured rebound effect, or none", () => {
    const rim = cell("rim", e(1.4, 1.39, 1.41), { tones: { cost: null, miss_cost: "cost", dreb_cost: "cost" } });
    const three = cell("three", e(1.25, 1.24, 1.26));
    expect(answerOf([rim, three])!.reboundEffect?.zone).toBe("rim");
    expect(answerOf([cell("rim", e(1.4, 1.39, 1.41)), three])!.reboundEffect).toBeNull();
  });

  it("counts coloured team costs against the one in twenty expected by chance, skipping thin cells", () => {
    const rows = [cell("rim", null), cell("rim", null, { status: "thin", tones: { cost: null, miss_cost: null, dreb_cost: null } }), cell("rim", null, { tones: { cost: null, miss_cost: null, dreb_cost: null } })];
    expect(chanceLine(rows, "cost")).toEqual({ coloured: 1, eligible: 2, byChance: 0.1 });
  });

  it("sorts teams by a value with unknowns last in both directions", () => {
    const t = (code: string, net: Estimate | null) => cell("all", net, { team: code, team_code: code });
    const rows = [t("BOS", e(1.2, 1.1, 1.3)), t("ATL", null), t("CHI", e(1.3, 1.2, 1.4))];
    expect(sortTeams(rows, "net", "desc").map(r => r.team_code)).toEqual(["CHI", "BOS", "ATL"]);
    expect(sortTeams(rows, "net", "asc").map(r => r.team_code)).toEqual(["BOS", "CHI", "ATL"]);
    expect(sortTeams(rows, "team", "asc").map(r => r.team_code)).toEqual(["ATL", "BOS", "CHI"]);
  });

  it("writes one CSV row per zone matching the header, and sums unknowns by reason", () => {
    const scope: Scope = { season: "2025-26", team: "all", team_code: null, position: "all", league: { possessions: 10, points: 11, ppp: { value: 1.1, low: 1, high: 1.2 } }, rows: [cell("rim", e(1, 0.9, 1.1)), cell("all", e(1, 0.9, 1.1))] };
    const rows = csvRows(scope);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toHaveLength(CSV_HEADER.length);
    expect(rows[0].slice(0, 4)).toEqual(["2025-26", "NBA", "all", "rim"]);
    expect(unknowns(scope.rows[1])).toEqual({ missNoRebound: 0, periodEnd: 20, sameTeam: 0, makeFollowed: 0 });
  });

  it("gives each view its charts, with one cost chart each", () => {
    expect(viewCharts("all").map(c => c.key)).toEqual(["own", "second", "cost", "net"]);
    expect(viewCharts("miss").filter(c => c.kind === "cost").map(c => c.key)).toEqual(["miss_cost"]);
    expect(viewCharts("dreb").map(c => c.key)).toEqual(["ppp_dreb", "dreb_cost"]);
  });
});

describe("shot aftermath answer with thin zones", () => {
  it("never ranks a thin zone and names it instead", () => {
    const rows = [cell("rim", e(1.5, 1.4, 1.6)), cell("long_mid", e(-0.34, -1, 0.3), { status: "thin" }), cell("three", e(1.4, 1.3, 1.5)), cell("short_mid", e(1.1, 1.0, 1.2))];
    const a = answerOf(rows)!;
    expect(a.worst.zone).toBe("short_mid");
    expect(a.thin.map(z => z.zone)).toEqual(["long_mid"]);
  });
});

describe("shot aftermath other-season check", () => {
  const rebound = (zone: Zone, n: number, cost: Estimate, tone: "cost" | "benefit" | null) =>
    cell(zone, e(n, n - 0.01, n + 0.01), { tones: { cost: null, miss_cost: null, dreb_cost: tone }, values: { ...cell(zone, e(n, n - 0.01, n + 0.01)).values, dreb_cost: cost } });
  const now = [rebound("rim", 1.3, e(0.045, 0.02, 0.07), "cost"), rebound("three", 1.2, e(0.01, -0.02, 0.04), null), rebound("long_mid", 0.8, e(0, -0.03, 0.03), null)];

  it("says the order and the rebound effect held when they did", () => {
    const then = [rebound("rim", 1.32, e(0.05, 0.02, 0.08), "cost"), rebound("three", 1.18, e(0.0, -0.03, 0.03), null), rebound("long_mid", 0.79, e(0, -0.03, 0.03), null)];
    expect(seasonCheck(now, then, "2024-25")).toEqual({ season: "2024-25", sameOrder: true, order: ["rim", "three", "long_mid"], rebound: { zone: "rim", held: "held" } });
  });

  it("reports a changed order and an unclear rebound effect", () => {
    const then = [rebound("rim", 1.1, e(0.03, -0.01, 0.07), null), rebound("three", 1.2, e(0, -0.03, 0.03), null), rebound("long_mid", 0.8, e(0, -0.03, 0.03), null)];
    const check = seasonCheck(now, then, "2024-25")!;
    expect(check.sameOrder).toBe(false);
    expect(check.order).toEqual(["three", "rim", "long_mid"]);
    expect(check.rebound).toEqual({ zone: "rim", held: "unclear" });
  });

  it("has nothing to say when either season can't rank zones", () => {
    expect(seasonCheck(now, [now[0]], "2024-25")).toBeNull();
  });
});
