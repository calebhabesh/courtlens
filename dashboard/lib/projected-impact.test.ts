import { describe, expect, it } from "vitest";
import { featureLabel, gapText, gapTone, percent, signed } from "./projected-impact";

describe("projected impact copy", () => {
  it("names every feature family in words", () => {
    expect(featureLabel("td_rapm")).toBe("Time-decay RAPM");
    expect(featureLabel("per36_pts_1")).toBe("Points per 36");
    expect(featureLabel("pt_off_prrollman_1")).toBe("Offense: roll man");
    expect(featureLabel("six_ts_def_1")).toBe("Shooting factor, defense");
    expect(featureLabel("unknown_name")).toBe("unknown_name");
  });

  it("reads an interval by whether it excludes zero, never as a verdict", () => {
    expect(gapTone({ gap: 1, low: .1, high: 2, units: 2, level: .95 })).toBe("better");
    expect(gapTone({ gap: -1, low: -2, high: -.1, units: 2, level: .95 })).toBe("worse");
    expect(gapTone({ gap: 1, low: -.1, high: 2, units: 2, level: .95 })).toBe("unclear");
    expect(gapTone(undefined)).toBe("unclear");
  });

  it("formats unknown values as a dash, not zero", () => {
    expect(signed(null)).toBe("—");
    expect(percent(undefined)).toBe("—");
    expect(gapText(undefined)).toBe("—");
    expect(signed(1.234)).toBe("+1.23");
  });
});
