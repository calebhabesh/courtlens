import { describe, expect, it } from "vitest";
import { diffText, lengthText, percentileText, signIdentity } from "./wingspan-format";

describe("wingspan formats", () => {
  it("writes quarter-inch lengths with glyphs and other lengths with two decimals", () => {
    expect(lengthText(87.75, "ftin")).toBe("7′3¾″");
    expect(lengthText(88, "ftin")).toBe("7′4″");
    expect(lengthText(74.5, "ftin")).toBe("6′2½″");
    expect(lengthText(77.67, "ftin")).toBe("6′5.67″");
    expect(lengthText(83.999, "ftin")).toBe("7′0″");
    expect(lengthText(87.75, "in")).toBe("87.75″");
  });

  it("signs differences and keeps unknowns as an em dash", () => {
    expect(diffText(10.75, "ftin")).toBe("+10¾″");
    expect(diffText(-1, "ftin")).toBe("−1″");
    expect(diffText(4.69, "in")).toBe("+4.69″");
    expect(diffText(0, "in")).toBe("0.00″");
    expect(diffText(null, "ftin")).toBe("—");
    expect(lengthText(undefined, "in")).toBe("—");
  });

  it("rounds percentiles and maps signs to identity tones", () => {
    expect(percentileText(98.6)).toBe("p99");
    expect(percentileText(null)).toBeNull();
    expect(signIdentity(0.4)).toBe("a");
    expect(signIdentity(-0.2)).toBe("b");
    expect(signIdentity(0)).toBeUndefined();
    expect(signIdentity(null)).toBeUndefined();
  });
});
