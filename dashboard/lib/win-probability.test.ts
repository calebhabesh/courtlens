import { describe, expect, it } from "vitest";
import { band, callRight, candidateResult, DRIFT_COPY, gapTone, listOf, marginText, metric, signed, sortWpa, towardTeam, verdictOf, whyBars, whyFlow, ribbonPath, ribbonSize, wpaRows, type WinProbabilityWhy } from "./win-probability";
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
  it("adds up: the groups to the prediction, which is the own read; the line's version sits beside it", () => {
    const bars = whyBars(real);
    const groups = bars.filter(b => b.kind === "group").reduce((sum, b) => sum + b.points, 0);
    const prediction = bars.find(b => b.kind === "prediction")!;
    expect(groups).toBeCloseTo(prediction.points, 9);
    expect(prediction.points).toBe(real.own.own);
    expect(prediction.homeWin).toBe(real.tip_off_home.original);
    const market = bars.find(b => b.kind === "market")!;
    expect(market.points).toBeCloseTo(real.own.own + (real.market.status === "ok" ? real.market.adjustment : 0), 9);
    expect(market.homeWin).toBe(real.tip_off_home.market_informed);
    expect(bars.map(b => b.key)).toEqual(["players", "form", "home_court", "rest_travel", "prediction", "market"]);
  });
  it("drops the comparison row when the seal had no line", () => {
    expect(whyBars({ ...real, market: { status: "no_line", w: 1 }, market_informed: null }).some(b => b.kind === "market")).toBe(false);
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

describe("the non-linear own-read diagnostic", () => {
  it("says a result in plain words, and never calls an interval through zero a win or a loss", () => {
    expect(candidateResult({ result: "not distinguishable" })).toBe("no clear difference");
    expect(candidateResult({ result: "worse" })).toBe("worse");
    expect(candidateResult({ result: "better" })).toBe("better");
  });
});

describe("round 3: the model flow, on the same sealed game", () => {
  const w = why as unknown as WinProbabilityWhy;
  it("keeps the seal's numbers: inputs add to the own read, which is the margin; the line is a second path", () => {
    const flow = whyFlow(w);
    expect(flow.inputs.map(i => i.key)).toEqual(["players", "form", "home_court", "rest_travel"]);
    expect(flow.inputs.reduce((s, i) => s + i.points, 0)).toBeCloseTo(flow.own, 9);
    expect(flow.margin).toBe(flow.own);
    expect(flow.homeWin).toBe(w.tip_off_home.original);
    expect(w.market.status).toBe("ok");
    if (w.market.status === "ok") expect(flow.line).toEqual({ status: "ok", points: w.market.line, w: w.market.w, book: w.market.book, margin: 7.5, homeWin: w.tip_off_home.market_informed });
  });
  it("with no line, there is no second path", () => {
    const flow = whyFlow({ ...w, market: { status: "no_line", w: 1 }, market_informed: null });
    expect(flow.line.status).toBe("no_line");
    expect(flow.margin).toBe(flow.own);
  });
  it("draws bands as closed paths, with a visible floor and zero for nothing", () => {
    expect(ribbonPath({ x0: 0, y0: 10, x1: 100, y1: 50, size: 4 })).toBe("M0 10C50 10 50 50 100 50L100 54C50 54 50 14 0 14Z");
    expect(ribbonSize(0.1, 9)).toBe(3);
    expect(ribbonSize(-2, 9)).toBe(18);
    expect(ribbonSize(0, 9)).toBe(0);
  });
});
