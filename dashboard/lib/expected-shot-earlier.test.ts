import { describe, expect, it } from "vitest";
import { metricText, registeredGate, relativeBrier, sharePercent } from "./expected-shot-earlier";
import type { ShotMetrics } from "./advanced-research";

const metrics = (brier: number): ShotMetrics => ({ brier, log_loss: 0.66, expected_points_mae: 1.13, ece: 0.01, rows: 106080, calibration_bins: [] });

describe("Shot Quality's earlier attempt (RD17)", () => {
  it("computes the relative Brier change from the served selection metrics", () => {
    expect(relativeBrier({ baseline: metrics(0.23396131498165826), candidate: metrics(0.2337711826581986) })).toBeCloseTo(0.0008126656, 9);
    expect(relativeBrier({ baseline: metrics(0), candidate: metrics(0.2) })).toBeNull();
  });

  it("reads the registered gate from the served model card", () => {
    expect(registeredGate("Selection Brier improvement: 0.08126656%. Registered minimum: 1%. Fit through")).toBe(0.01);
    expect(registeredGate("no gate here")).toBeNull();
  });

  it("keeps small shares visible and whole numbers plain", () => {
    expect(sharePercent(0.0008126656)).toBe("0.08%");
    expect(sharePercent(0.01)).toBe("1%");
    expect(sharePercent(0.0034)).toBe("0.3%");
    expect(sharePercent(null)).toBe("—");
    expect(metricText("rows", 106080)).toBe("106,080");
    expect(metricText("brier", 0.23396131498165826)).toBe("0.233961");
  });
});
