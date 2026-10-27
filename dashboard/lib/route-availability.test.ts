import { describe, expect, it } from "vitest";
import { humanLabel, routeAvailability } from "./route-availability";
import type { WorkbenchCatalog } from "./types";
const catalog = { default_season: "2025-26", default_phase: "regular_season", capabilities: {
  core_stats: { status: "partial", seasons: ["2025-26"], phases: ["regular_season"], limitations: [] }
} } as unknown as WorkbenchCatalog;
describe("release-bound route availability", () => {
  it("keeps partial data and independent research evidence accessible", () => {
    expect(routeAvailability("/stats", catalog).secondary).toBe(false);
    expect(routeAvailability("/research/rapm", null).secondary).toBe(false);
    expect(routeAvailability("/methodology", null).secondary).toBe(false);
  });
  it("separates missing source, unsupported context and unavailable backend", () => {
    expect(routeAvailability("/wowy", catalog).reason).toContain("not declared");
    expect(routeAvailability("/stats", catalog, "2020-21").reason).toContain("season or phase");
    expect(routeAvailability("/stats", null).reason).toContain("could not be verified");
  });
  it("lists a menu page whose source lacks the default season (the header's anySeason)", () => {
    const newSeason = { ...catalog, default_season: "2026-27", capabilities: { ...catalog.capabilities,
      on_off: { status: "partial", seasons: ["2025-26"], phases: ["regular_season"], limitations: [] } } } as unknown as WorkbenchCatalog;
    expect(routeAvailability("/stat-line-shift", newSeason).secondary).toBe(true);
    expect(routeAvailability("/stat-line-shift", newSeason, undefined, undefined, { anySeason: true }).secondary).toBe(false);
    // A missing source still hides it.
    expect(routeAvailability("/wowy", newSeason, undefined, undefined, { anySeason: true }).secondary).toBe(true);
  });
  it("reports admitted-but-pending sources by their limitation, not as blocked", () => {
    const pending = { ...catalog, capabilities: { ...catalog.capabilities, defensive_tracking: {
      status: "not_yet_observed", seasons: [], phases: [],
      limitations: ["Source admitted (hoopR NBA Stats raw); not yet ingested in this release."] } } } as unknown as WorkbenchCatalog;
    const result = routeAvailability("/research/defensive-matchups", pending);
    expect(result.secondary).toBe(true);
    expect(result.reason).toContain("not yet ingested");
    expect(result.reason).not.toContain("unavailable");
  });
  it("maps enum labels without changing canonical values", () => {
    expect(humanLabel("regular_season")).toBe("Regular Season");
    expect(humanLabel("selection_failed_negative_result")).toContain("Negative Result");
    expect(humanLabel("failed_or_limited")).toBe("Failed or Limited");
  });
});
