import { describe, expect, it } from "vitest";
import { band, callRight, DRIFT_COPY, gapTone, listOf, marginText, metric, signed, sortWpa, towardTeam, verdictOf, whyBars, wpaRows, type WinProbabilityWhy } from "./win-probability";
import why from "../e2e/fixtures/win-probability-why-401909976.json";

describe("win probability formatting", () => {
  it("shows unknown as a dash, never zero", () => {
    expect(metric(null)).toBe("—");
    expect(metric(undefined)).toBe("—");
    expect(metric(Number.NaN)).toBe("—");
    expect(signed(null)).toBe("—");
  });
  it("signs gaps so a positive one reads as favouring CourtLens", () => {
    expect(signed(0.0034)).toBe("+0.0034");
    expect(signed(-0.0011)).toBe("-0.0011");
    expect(metric(0.40281)).toBe("0.4028");
  });
  it("only an interval breach above is called drift", () => {
    expect(DRIFT_COPY.above.label).toContain("Drift");
    expect(DRIFT_COPY.within.label).not.toContain("Drift");
    expect(DRIFT_COPY.insufficient.label).toContain("Too few");
  });
});

describe("F03 helpers", () => {
  const i = (low: number, high: number) => ({ mean: (low + high) / 2, low, high, games: 1 });
  it("colours a gap only where its interval clears zero", () => {
    expect(gapTone(i(-0.03, 0.02))).toBeUndefined();
    expect(gapTone(i(0.001, 0.02))).toBe("good");
    expect(gapTone(i(-0.02, -0.001))).toBe("bad");
    expect(verdictOf(i(-0.03, 0.02))).toBe("tied");
  });
  it("lists each WPA player once and sorts without ranking", () => {
    const row = (player: string, wpa: number, clutch_wpa: number) => ({ player, player_id: player, name: player, team: "LAL", games: 1, wpa, events: 1, clutch_wpa, clutch_events: 1 });
    const rows = wpaRows({ season: "2026-27", games: 1, players: 3, leaders: [row("a", 3, 0), row("b", 2, 1)], clutch_leaders: [row("c", 0, 2), row("b", 2, 1)] });
    expect(rows.map(r => r.player)).toEqual(["a", "b", "c"]);
    expect(sortWpa(rows, { key: "clutch_wpa", direction: "desc" }).map(r => r.player)).toEqual(["c", "b", "a"]);
    expect(band(i(-0.0336, 0.0167))).toBe("-0.0336 to +0.0167");
    expect(listOf(["a", "b", "c"])).toBe("a, b and c");
  });
});

describe("the pregame why (W4), on the real sealed 2026-11-12 TOR at PHI", () => {
  const real = why as unknown as WinProbabilityWhy;
  it("adds up: groups to the own read, own read plus the market row to the prediction", () => {
    const bars = whyBars(real);
    const groups = bars.filter(b => b.kind === "group").reduce((sum, b) => sum + b.points, 0);
    expect(groups).toBeCloseTo(real.own.own, 9);
    const own = bars.find(b => b.kind === "own")!.points, market = bars.find(b => b.kind === "market")!.points;
    expect(own + market).toBeCloseTo(bars.find(b => b.kind === "prediction")!.points, 9);
    expect(bars.map(b => b.key)).toEqual(["players", "form", "home_court", "rest_travel", "own", "market", "prediction"]);
  });
  it("drops the market row when the model used none", () => {
    expect(whyBars({ ...real, market: { status: "no_line", w: 1 } }).some(b => b.kind === "market")).toBe(false);
  });
  it("names the team the points favour", () => {
    expect(towardTeam(3.14, "PHI", "TOR")).toBe("PHI +3.1");
    expect(towardTeam(-0.4, "PHI", "TOR")).toBe("TOR +0.4");
    expect(towardTeam(0.04, "PHI", "TOR")).toBe("Even");
    expect(marginText(-10.5, "WAS", "DET")).toBe("DET by 10.5");
  });
  it("grades a final only when there is a result", () => {
    expect(callRight(real)).toBeNull();
    expect(callRight({ ...real, result: { home_score: 110, away_score: 101, calls: null } })).toBe(true);
    expect(callRight({ ...real, result: { home_score: 99, away_score: 101, calls: null } })).toBe(false);
  });
});
