import { describe, expect, it } from "vitest";
import { fmt, inches, pct, signed, sourceLabel, trackingValue } from "./stats-feeds";

describe("PC11 feed formatting", () => {
  it("never turns unknown into zero", () => {
    for (const format of [fmt, pct, signed, inches]) {
      expect(format(null)).toBe("—");
      expect(format(undefined)).toBe("—");
      expect(format(Number.NaN)).toBe("—");
    }
    expect(fmt(0)).toBe("0.0");
    expect(signed(0)).toBe("0.0");
  });
  it("formats signs, percentages and lengths", () => {
    expect(signed(2.345, 2)).toBe("+2.35");
    expect(signed(-1.2)).toBe("−1.2");
    expect(pct(0.4567)).toBe("45.7%");
    expect(inches(87.25)).toBe("7′ 3.25″");
    expect(inches(84)).toBe("7′ 0″");
  });
  it("shows tracking values in their column's unit", () => {
    expect(trackingValue({ key: "x", label: "x", kind: "pct", higher_is_better: true }, 0.531)).toBe("53.1%");
    expect(trackingValue({ key: "x", label: "x", kind: "rate", higher_is_better: null }, 3.152)).toBe("3.15");
    expect(trackingValue({ key: "x", label: "x", kind: "total", higher_is_better: true }, 27.83)).toBe("27.8");
  });
  it("labels the latest source observation", () => {
    const source = { dataset_id: "d", feed: "f", variant: "v", season: "2025-26", season_type: "regular_season", upstream_revision: null, content_sha256: "c" };
    expect(sourceLabel([{ ...source, observed_at: "2026-10-01T00:00:00Z" }, { ...source, observed_at: "2026-10-11T22:00:00Z" }])).toBe("NBA Stats (hoopR mirror) · observed Oct 11, 2026");
    expect(sourceLabel([])).toBe("NBA Stats (hoopR mirror)");
  });
});
