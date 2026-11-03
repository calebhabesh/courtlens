import { describe, expect, it } from "vitest";
import {
  axisEnds, barShare, biggestGap, searchTarget, dimName, groups, mapFrame, median, nextSummary, ordinal, relativeText, signed, tone, valueText, weightsParam,
  type TwinDimension, type TwinNext,
} from "./player-twins";

const dim = (key: string, group: string, label: string, kind: "rate" | "pct"): TwinDimension => ({ key, group, label, kind, description: key });
const SHOT = [dim("ft_vol", "FT", "VOL", "rate"), dim("ft_eff", "FT", "EFF", "pct"), dim("three_vol", "3P", "VOL", "rate"), dim("three_eff", "3P", "EFF", "pct")];

describe("player twins formatting", () => {
  it("groups dimensions in API order", () => {
    expect(groups(SHOT).map(entry => [entry.group, entry.dims.map(d => d.label)])).toEqual([["FT", ["VOL", "EFF"]], ["3P", ["VOL", "EFF"]]]);
  });
  it("formats values and signed relatives; unknown is a dash, rounding to zero is unsigned", () => {
    expect(valueText(SHOT[0], 7.84)).toBe("7.8");
    expect(valueText(SHOT[1], 0.7372)).toBe("73.7%");
    expect(relativeText(SHOT[0], 3.06)).toBe("+3.1");
    expect(relativeText(SHOT[1], -0.046)).toBe("−4.6%");
    expect(relativeText(SHOT[1], 0.0004)).toBe("0.0%");
    expect(relativeText(SHOT[0], null)).toBe("—");
  });
  it("fills a half track at three standard deviations", () => {
    expect(barShare(1.5)).toBe(0.5);
    expect(barShare(-9)).toBe(1);
    expect(barShare(null)).toBe(0);
  });
  it("colours efficiency by sign and volume as neutral", () => {
    expect(tone(SHOT[0], -2)).toBe("volume");
    expect(tone(SHOT[1], 0.02)).toBe("above");
    expect(tone(SHOT[1], -0.02)).toBe("below");
    expect(tone(SHOT[1], null)).toBe("even");
  });
  it("names the furthest measure", () => {
    const gap = biggestGap({ gaps: { ft_vol: 0.4, three_eff: -1.2 } }, SHOT);
    expect(gap && [dimName(gap.dim), gap.gap]).toEqual(["3P EFF", -1.2]);
    expect(dimName(dim("ts", "SCORING", "TS%", "pct"))).toBe("TS%");
  });
  it("writes only changed weights, in dimension order", () => {
    expect(weightsParam({}, SHOT)).toBeNull();
    expect(weightsParam({ three_vol: 2, ft_vol: 0, ft_eff: 1 }, SHOT)).toBe("ft_vol:0,three_vol:2");
  });
  it("ranks percentiles as ordinals", () => {
    expect([ordinal(0.4), ordinal(1), ordinal(12), ordinal(22.6), ordinal(100), ordinal(null)]).toEqual(["0th", "1st", "12th", "23rd", "99th", "—"]);
  });
  it("summarises recorded next seasons only; unknown ones are counted out, not as zero", () => {
    const next = (status: TwinNext["status"], pts?: number | null, ts?: number | null): { next: TwinNext } =>
      ({ next: { season: "2013-14", status, pts_change: pts, ts_change: ts } });
    const summary = nextSummary([next("recorded", 2, 0.01), next("recorded", 4, 0.03), next("no_record"), next("beyond_data"), next("recorded", -1, null)]);
    expect(summary).toEqual({ shown: 5, recorded: 3, pts: 2, ts: 0.02 });
    expect(median([])).toBeNull();
    expect([signed(2.06), signed(-0.004, 1, 100), signed(0.0001), signed(null)]).toEqual(["+2.1", "−0.4", "0.0", "—"]);
  });
  it("maps both axes on one scale, centred", () => {
    const at = mapFrame([{ x: -2, y: -1 }, { x: 2, y: 1 }], 400, 400, 20);
    expect(at({ x: 0, y: 0 })).toEqual({ x: 200, y: 200 });
    expect(at({ x: 2, y: 1 })).toEqual({ x: 380, y: 110 });
  });
  it("opens a searched player in the selected season when he played it, else his latest", () => {
    const view = { season: "2012-13", seasons: ["2011-12", "2012-13", "2025-26"], roster: [{ player_id: "1", name: "A", team: null, position: null, off_poss: 1 }] };
    const player = (id: string, last: string) => ({ player_id: id, name: id, first_season: "2010-11", last_season: last, last_team: null, seasons: 3 });
    expect(searchTarget(player("1", "2025-26"), view)).toEqual({ season: "2012-13", inSeason: true });
    expect(searchTarget(player("2", "2011-12"), view)).toEqual({ season: "2011-12", inSeason: false });
    expect(searchTarget(player("3", "2025-26"), view)).toEqual({ season: null, inSeason: false });
  });
  it("names each axis end in plain words", () => {
    expect(axisEnds([{ key: "rim_vol", loading: 0.6 }, { key: "three_vol", loading: -0.5 }, { key: "ft_vol", loading: 0.4 }]))
      .toEqual({ high: "More rim attempts, fewer threes", low: "Fewer rim attempts, more threes" });
    expect(axisEnds([{ key: "mid_eff", loading: 0.6 }, { key: "mid_vol", loading: 0.5 }])).toEqual({ high: "Higher mid FG%, more mid-range", low: "Lower mid FG%, fewer mid-range" });
  });
});
