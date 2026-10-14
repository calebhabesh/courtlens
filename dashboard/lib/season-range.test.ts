import { describe, expect, it } from "vitest";
import { quickRangeFrom, seasonRange, seasonScopeLabel, seasonsBetween, shiftRange } from "./season-range";
import { resolveStatsQuery } from "./stats-query";
import type { WorkbenchCatalog } from "./types";

const all = ["2023-24", "2000-01", "2024-25", "2001-02", "2025-26", "2002-03"];

describe("43e multi-season scope", () => {
  it("lists a range oldest first and rejects reversed or unknown ends", () => {
    expect(seasonsBetween(all, "2023-24", "2025-26")).toEqual(["2023-24", "2024-25", "2025-26"]);
    expect(seasonsBetween(all, "2025-26", "2023-24")).toEqual([]);
    expect(seasonsBetween(all, "1999-00", "2025-26")).toEqual([]);
  });
  it("treats a missing, equal or unusable seasonFrom as one season", () => {
    expect(seasonRange(all, undefined, "2025-26")).toBeNull();
    expect(seasonRange(all, "2025-26", "2025-26")).toBeNull();
    expect(seasonRange(all, "1990-91", "2025-26")).toBeNull();
    expect(seasonRange(all, "2024-25", "2025-26")).toEqual(["2024-25", "2025-26"]);
  });
  it("clamps quick ranges to the earliest season and steps whole windows", () => {
    expect(quickRangeFrom(all, "2025-26", 3)).toBe("2023-24");
    expect(quickRangeFrom(all, "2025-26", 25)).toBe("2000-01");
    expect(shiftRange(all, "2023-24", "2025-26", -1)).toEqual({ from: "2002-03", through: "2024-25" });
    expect(shiftRange(all, "2023-24", "2025-26", 1)).toBeNull();
    expect(seasonScopeLabel(["2023-24", "2024-25"], "2024-25")).toBe("2023-24 – 2024-25");
    expect(seasonScopeLabel(null, "2024-25")).toBe("2024-25");
  });
  it("binds the range into the query and never ranks a range by DARKO", () => {
    const catalog = { release_id: "r", default_season: "2025-26", default_phase: "regular_season", default_before_date: "2026-04-13",
      seasons: all, stats_scopes: [{ season: "2025-26", phase: "regular_season", default_before_date: "2026-04-13" }] } as WorkbenchCatalog;
    const range = resolveStatsQuery({ season: "2025-26", seasonFrom: "2024-25" }, catalog, "per_game", "dpm");
    expect(range.season_scope).toEqual({ seasons: ["2024-25", "2025-26"], aggregate_multi_season: true });
    expect(range.sort).toEqual([{ field: "pts_per_game", direction: "desc" }]);
    const single = resolveStatsQuery({ season: "2025-26" }, catalog, "per_game", "dpm");
    expect(single.season_scope).toBeUndefined();
    expect(single.sort).toEqual([{ field: "dpm", direction: "desc" }]);
  });
});
