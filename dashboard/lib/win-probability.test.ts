import { describe, expect, it } from "vitest";
import { DRIFT_COPY, metric, signed } from "./win-probability";

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
