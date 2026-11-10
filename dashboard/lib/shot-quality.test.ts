import { describe, expect, it } from "vitest";
import { formatInterval, formatPercentSigned, formatSigned, reliabilityBins, signTone } from "./shot-quality";

describe("Shot Quality page rules", () => {
  it("formats signed values with a true minus", () => {
    expect(formatSigned(2.46)).toBe("+2.5");
    expect(formatSigned(-1.04)).toBe("−1.0");
    expect(formatSigned(null)).toBe("—");
    expect(formatPercentSigned(0.025566)).toBe("+2.56%");
    expect(formatInterval([-1, 2], v => formatSigned(v))).toBe("−1.0 to +2.0");
  });

  it("colours only known, non-zero good/bad values", () => {
    expect(signTone(0.4)).toBe("positive");
    expect(signTone(-0.4)).toBe("negative");
    expect(signTone(0)).toBeUndefined();
    expect(signTone(null)).toBeUndefined();
  });

  it("maps served bins to the shared reliability plot", () => {
    expect(reliabilityBins([{ bin: 1, count: 10, low: 0.1, high: 0.2, mean_predicted: 0.15, observed: 0.16 }]))
      .toEqual([{ lower: 0.1, upper: 0.2, rows: 10, mean_probability: 0.15, observed_rate: 0.16 }]);
    expect(reliabilityBins(undefined)).toEqual([]);
  });
});
