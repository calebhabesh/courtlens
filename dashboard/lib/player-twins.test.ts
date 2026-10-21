import { describe, expect, it } from "vitest";
import { barShare, biggestGap, dimName, groups, relativeText, tone, valueText, type TwinDimension } from "./player-twins";

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
});
