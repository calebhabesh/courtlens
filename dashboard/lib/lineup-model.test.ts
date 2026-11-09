import { describe, expect, it } from "vitest";
import { gainBand, gainText, gainTone, gridTone, identityOf, ratingGap, scaleRatio, signed, stripScale, visitorText } from "./lineup-model";

const gain = (g: number, low: number, high: number) => ({ gain: g, low, high });

describe("lineup model page helpers", () => {
  it("colours a gain only when its whole interval is on one side of zero", () => {
    expect(gainTone(gain(0.1, 0.01, 0.2))).toBe("positive");
    expect(gainTone(gain(-0.1, -0.2, -0.01))).toBe("negative");
    expect(gainTone(gain(0.1, -0.01, 0.2))).toBeUndefined();
  });

  it("gives the grid the same colour rule, and gold or blue by sign", () => {
    expect(gridTone(gain(0.1, 0.01, 0.2))).toBe("good");
    expect(gridTone(gain(-0.1, -0.2, -0.01))).toBe("bad");
    expect(gridTone(gain(0.1, -0.01, 0.2))).toBeUndefined();
    expect(identityOf(1.2)).toBe("a");
    expect(identityOf(-1.2)).toBe("b");
    expect(identityOf(0.001)).toBeUndefined();
  });

  it("measures the scale of the gap and fits the strip around zero", () => {
    expect(scaleRatio(0.18865603687203247, -1.0977819457025362e-05)).toBe(17000);
    const { left, right } = stripScale([gain(0.19, 0.12, 0.25), gain(-0.000011, -0.000014, -0.000008)]);
    expect(left).toBeCloseTo(-0.05);
    expect(right).toBeCloseTo(0.25);
    expect(gainBand(gain(0, -0.5, 1))).toBe("−0.50 to +1.00");
  });

  it("finds the largest gap between a player's two ratings", () => {
    expect(ratingGap([{ ridge_rating: 1, lineup_additive_rating: 1.0066 }, { ridge_rating: -1, lineup_additive_rating: -1 }])).toBeCloseTo(0.0066);
  });

  it("removes project codes and paths from served text", () => {
    const excluded = "R01's admission (IM02 + event gate) excluded 3 to 26 games a season; their stints are not in the sealed bundles. Counts and reasons: docs/evidence/research/r01/coverage.json.";
    expect(visitorText(excluded)).toBe("Checks on the source data left out 3 to 26 games a season; their stints aren't in the data.");
    expect(visitorText("R08's: pooled 95% interval")).toBe("pooled 95% interval");
    expect(visitorText("restored after a defect in the frozen runner overwrote it")).toBe("restored after a fault in the original run overwrote it");
  });

  it("signs numbers with a true minus", () => {
    expect(signed(-1.234)).toBe("−1.23");
    expect(signed(0)).toBe("0.00");
    expect(signed(-0.001)).toBe("0.00");
  });
});

describe("tiny gains stay legible", () => {
  it("shows two significant figures of values far below the default decimals", async () => {
    const { digitsFor } = await import("./lineup-model");
    expect(digitsFor([-0.000011, -0.000014, -0.0000079])).toBe(6);
    expect(gainText(gain(-0.000011, -0.000014, -0.0000079))).toBe("−0.000011 (−0.000014 to −0.000008)");
    expect(gainText(gain(0.19, 0.12, 0.25))).toBe("+0.19 (+0.12 to +0.25)");
  });
});
