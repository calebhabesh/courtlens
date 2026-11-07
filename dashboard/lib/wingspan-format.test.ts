import { describe, expect, it } from "vitest";
import { diffText, lengthText, lengthTicks, percentileText, signIdentity } from "./wingspan-format";

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

  it("converts to metres and centimetres, differences always in centimetres", () => {
    expect(lengthText(88, "m")).toBe("2.24 m");
    expect(lengthText(88, "cm")).toBe("223.5 cm");
    expect(diffText(8, "m")).toBe("+20.3 cm");
    expect(diffText(-1, "cm")).toBe("−2.5 cm");
    expect(lengthText(null, "m")).toBe("—");
  });

  it("ticks every foot, 24 inches, half metre or 50 cm from zero", () => {
    expect(lengthTicks(96, "ftin").map(t => t.label)).toEqual(["0′", "1′", "2′", "3′", "4′", "5′", "6′", "7′", "8′"]);
    expect(lengthTicks(96, "in").map(t => t.label)).toEqual(["0″", "24″", "48″", "72″", "96″"]);
    expect(lengthTicks(100, "m").map(t => t.label)).toEqual(["0.0 m", "0.5 m", "1.0 m", "1.5 m", "2.0 m", "2.5 m"]);
    expect(lengthTicks(100, "cm").at(-1)?.label).toBe("250 cm");
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
