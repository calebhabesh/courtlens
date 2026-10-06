import { describe, expect, it } from "vitest";
import { normalizedColumn, normalizedSortMetric, resolveStatsQuery } from "./stats-query";
import { ALL_CATALOG_METRICS } from "./stats-presets";
import { buildPreservedContextUrl } from "./query-url";
import type { WorkbenchCatalog } from "./types";

const catalog = {
  release_id: "retained", default_season: "2024-25", default_phase: "regular_season",
  default_before_date: "2025-04-14", stats_scopes: [
    { season: "2023-24", phase: "playoffs", default_before_date: "2024-06-18" },
    { season: "2024-25", phase: "regular_season", default_before_date: "2025-04-14" }
  ]
} as WorkbenchCatalog;

describe("PF01b Stats scope and normalization", () => {
  it("uses catalog defaults and matching scope cutoff", () => {
    expect(resolveStatsQuery({}, catalog, "per_game")).toMatchObject({
      release_id: "retained", season: "2024-25", phase: "regular_season", before_date: "2025-04-14",
      sort: [{ field: "pts_per_game", direction: "desc" }]
    });
    expect(resolveStatsQuery({ season: "2023-24" }, catalog, "raw")).toMatchObject({
      phase: "playoffs", before_date: "2024-06-18", sort: [{ field: "pts" }]
    });
  });
  it("preserves explicit unsupported scope and direction", () => {
    expect(resolveStatsQuery({ season: "1999-00", phase: "preseason", before_date: "2000-01-01", sort_metric: "ast_per_game", sort_direction: "asc" }, catalog, "per_36")).toMatchObject({
      season: "1999-00", phase: "preseason", before_date: "2000-01-01", sort: [{ field: "ast_per_36", direction: "asc" }]
    });
  });
  it.each(["pts", "reb", "oreb", "dreb", "ast", "stl", "blk", "tov", "pf"])("keeps %s values, labels, formats and sorts together", (key) => {
    for (const mode of ["raw", "per_game", "per_36"] as const) {
      const column = normalizedColumn(ALL_CATALOG_METRICS[`${key}_per_game`], mode);
      expect(column.sortMetric).toBe(normalizedSortMetric(key, mode));
      expect(column.key).toBe(column.sortMetric);
      expect(column.format?.(18.8)).toBe(mode === "raw" ? "19" : "18.8");
    }
    expect(normalizedSortMetric("ts_pct", "raw")).toBe("ts_pct");
  });
  it("preserves complete window context and respects target aliases", () => {
    const url = buildPreservedContextUrl("/compare?before_date=2025-01-01", new URLSearchParams({ release_id: "retained", beforeDate: "2026-01-01", season: "2024-25", phase: "playoffs", window: "date_range", from_date: "2024-11-01", to_date: "2024-12-01", window_n: "7" }));
    const params = new URLSearchParams(url.split("?")[1]);
    expect(params.get("releaseId")).toBe("retained");
    expect(params.get("before_date")).toBe("2025-01-01");
    expect(params.has("beforeDate")).toBe(false);
    expect(params.get("fromDate")).toBe("2024-11-01");
    expect(params.get("toDate")).toBe("2024-12-01");
    expect(params.get("windowN")).toBe("7");
  });
});
