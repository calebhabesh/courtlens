import { describe, expect, it } from "vitest";
import { intervalLabel, intervalTone, signed, toCsv, toneReason } from "./research-values";

describe("research values", () => {
  it("colours only intervals that exclude zero", () => {
    expect(intervalTone(0.1, 2)).toBe("good");
    expect(intervalTone(-2, -0.1)).toBe("bad");
    expect(intervalTone(-0.1, 2)).toBeUndefined();
    expect(intervalTone(0, 2)).toBeUndefined();
    expect(intervalTone(null, 2)).toBeUndefined();
    expect(intervalTone(undefined, undefined)).toBeUndefined();
    expect(toneReason(undefined)).toContain("includes zero or is unknown");
  });

  it("writes unknowns as unknown, never zero, with a real minus sign", () => {
    expect(signed(null)).toBe("—");
    expect(signed(-0.004)).toBe("−0.00");
    expect(signed(1.234, 1)).toBe("+1.2");
    expect(intervalLabel(null, 1)).toBe("Interval unknown");
    expect(intervalLabel(-1.5, 2.25)).toBe("−1.50 to +2.25");
  });

  it("writes CSV with quoting and empty unknowns", () => {
    expect(toCsv(["a", "b"], [["x,y", null], ['say "hi"', 0]])).toBe('a,b\r\n"x,y",\r\n"say ""hi""",0\r\n');
  });
});
