import { describe, expect, it } from "vitest";
import { applyScopeChange } from "./scope-url";
import type { WorkbenchCatalog } from "./types";

const catalog = {
  stats_scopes: [
    { season: "2025-26", phase: "regular_season", coverage_start: "2025-10-21", coverage_end: "2026-04-12", default_before_date: "2026-04-13" },
    { season: "2025-26", phase: "playoffs", coverage_start: "2026-04-18", coverage_end: "2026-06-14", default_before_date: "2026-06-15" },
    { season: "2024-25", phase: "regular_season", coverage_start: "2024-10-22", coverage_end: "2025-04-13", default_before_date: "2025-04-14" }
  ]
} as WorkbenchCatalog;

const context = { catalog, season: "2025-26", phase: "regular_season", releaseId: "release-a" };

describe("applyScopeChange (filter bar URL sync)", () => {
  it("moves the cutoff to the new season's default and keeps the phase when it exists", () => {
    const params = applyScopeChange("season=2025-26&phase=regular_season&beforeDate=2026-01-01&cursor=abc", "season", "2024-25", context);
    expect(params.get("season")).toBe("2024-25");
    expect(params.get("phase")).toBe("regular_season");
    expect(params.get("beforeDate")).toBe("2025-04-14");
    expect(params.has("cursor")).toBe(false);
  });

  it("applies the phase default cutoff and drops the legacy alias", () => {
    const params = applyScopeChange("before_date=2026-01-01", "phase", "playoffs", context);
    expect(params.get("phase")).toBe("playoffs");
    expect(params.get("beforeDate")).toBe("2026-06-15");
    expect(params.has("before_date")).toBe(false);
  });

  it("sets an explicit cutoff and binds the release", () => {
    const params = applyScopeChange("season=2025-26", "beforeDate", "2026-02-01", context);
    expect(params.get("beforeDate")).toBe("2026-02-01");
    expect(params.get("releaseId")).toBe("release-a");
  });

  it("clears window-specific parameters when the window changes", () => {
    const params = applyScopeChange("window=last_10&windowN=10&from_date=2026-01-01", "window", "season", context);
    expect(params.get("window")).toBe("season");
    expect(params.has("windowN")).toBe(false);
    expect(params.has("from_date")).toBe(false);
  });

  it("does not rebind a release already present under the legacy name", () => {
    const params = applyScopeChange("release_id=release-b", "window", "last_5", context);
    expect(params.get("release_id")).toBe("release-b");
    expect(params.has("releaseId")).toBe(false);
  });
});
