import { describe, expect, it } from "vitest";
import { featureLabel, gapText, intervalTone, percent, signed, signTone } from "./projected-impact";

describe("projected impact copy", () => {
  it("names every feature family in words", () => {
    expect(featureLabel("td_rapm")).toBe("Time-decay RAPM");
    expect(featureLabel("per36_pts_1")).toBe("Points per 36");
    expect(featureLabel("pt_off_prrollman_1")).toBe("Offense: roll man");
    expect(featureLabel("six_ts_def_1")).toBe("Shooting factor, defense");
    expect(featureLabel("unknown_name")).toBe("unknown_name");
  });

  it("colours only by whether an interval excludes zero, never as a verdict", () => {
    expect(intervalTone({ low: .1, high: 2 })).toBe("good");
    expect(intervalTone({ low: -2, high: -.1 })).toBe("bad");
    expect(intervalTone({ low: -.1, high: 2 })).toBeUndefined();
    expect(intervalTone(undefined)).toBeUndefined();
  });

  it("gives gold or blue by sign, and none to a value that rounds to zero", () => {
    expect(signTone(.4)).toBe("a");
    expect(signTone(-.4)).toBe("b");
    expect(signTone(-.001)).toBeUndefined();
    expect(signTone(null)).toBeUndefined();
  });

  it("formats unknown values as a dash, not zero", () => {
    expect(signed(null)).toBe("—");
    expect(percent(undefined)).toBe("—");
    expect(gapText(undefined)).toBe("—");
    expect(signed(1.234)).toBe("+1.23");
    expect(signed(-1.234)).toBe("−1.23");
    expect(signed(-.001)).toBe("0.00");
  });
});
