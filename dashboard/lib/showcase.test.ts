import { describe, expect, it } from "vitest";
import { cardStats, changeText, nextSeason, rankChanges, readShowcaseState, seasonBadge, showcaseQuery } from "./showcase";
import type { PlayerResearchItem, WorkbenchCatalog } from "./types";

const catalog = {
  release_id: "r1", default_season: "2025-26", default_before_date: "2026-04-13", seasons: ["2000-01", "2024-25", "2025-26"],
  stats_scopes: [
    { season: "2025-26", phase: "regular_season", default_before_date: "2026-04-13" },
    { season: "2025-26", phase: "playoffs", default_before_date: "2026-06-20" },
    { season: "2000-01", phase: "regular_season", default_before_date: "2001-04-19" },
  ],
  darko: { manifest_sha256: "darko-sha" }, stats_normalizations: ["per_game", "raw", "per_36"],
} as unknown as WorkbenchCatalog;
const item = (id: string) => ({ player_id: id }) as PlayerResearchItem;

describe("showcase state", () => {
  it("defaults to DPM leaders over 400 minutes, 24 cards, the latest season", () => {
    const state = readShowcaseState({}, catalog);
    expect(state).toMatchObject({ season: "2025-26", phase: "regular_season", sort: "dpm", minMinutes: 400, shown: 24, view: "cards" });
    const { query, presentation } = showcaseQuery(catalog, state);
    expect(query.sort).toEqual([{ field: "dpm", direction: "desc", nulls_last: true }]);
    expect(query.sample_filters).toEqual({ min_minutes: 400, min_games: null });
    expect(query.darko_manifest_sha256).toBe("darko-sha");
    expect(query.view_state?.columns).toEqual(["dpm", "pts_per_game", "ast_per_game", "ts_pct"]);
    expect(presentation).toEqual({ table_percentiles: true, positions: null, draft_year: null });
  });

  it("uses 100 minutes for playoffs, ignores unknown stats and rounds Load More to pages", () => {
    const state = readShowcaseState({ phase: "playoffs", stats: "bogus,reb", show: "30", mode: "per_36", sort: "pts", dir: "asc" }, catalog);
    expect(state.minMinutes).toBe(100);
    expect(state.extras).toEqual(["reb"]);
    expect(state.shown).toBe(48);
    expect(cardStats(state).map(stat => stat.key)).toEqual(["pts_per_36", "reb_per_36", "ast_per_36", "ts_pct"]);
    const { query } = showcaseQuery(catalog, state);
    expect(query.sort?.[0]).toMatchObject({ field: "pts_per_36", direction: "asc" });
    expect(query.darko_manifest_sha256).toBeUndefined();
  });

  it("a season without the chosen phase falls back to the regular season", () => {
    const state = readShowcaseState({ phase: "playoffs" }, catalog);
    expect(showcaseQuery(catalog, state, "2000-01").query).toMatchObject({ phase: "regular_season", before_date: "2001-04-19" });
  });
});

describe("slideshow helpers", () => {
  it("wraps from the latest season to the first on file", () => {
    expect(nextSeason(catalog.seasons!, "2025-26")).toBe("2000-01");
    expect(nextSeason(catalog.seasons!, "2000-01")).toBe("2024-25");
    expect(seasonBadge("2025-26")).toBe("'26");
  });

  it("ranks change against the previous board; absentees are new", () => {
    const changes = rankChanges([item("a"), item("b"), item("c"), item("d")], [item("b"), item("a"), item("c")], "2024-25");
    expect(changes.get("a")).toEqual({ kind: "up", by: 1, was: 2, season: "2024-25" });
    expect(changes.get("b")).toEqual({ kind: "down", by: 1, was: 1, season: "2024-25" });
    expect(changes.get("c")).toEqual({ kind: "same", by: 0, was: 3, season: "2024-25" });
    expect(changes.get("d")).toEqual({ kind: "new", season: "2024-25" });
    expect(rankChanges([item("a")], null, null).size).toBe(0);
  });

  it("spells out each badge with last season's rank", () => {
    expect(changeText({ kind: "up", by: 37, was: 48, season: "2024-25" })).toBe("Up 37: 48th in 2024-25");
    expect(changeText({ kind: "down", by: 1, was: 2, season: "2024-25" })).toBe("Down 1: 2nd in 2024-25");
    expect(changeText({ kind: "same", by: 0, was: 11, season: "2024-25" })).toBe("Same rank: 11th in 2024-25");
    expect(changeText({ kind: "new", season: "2024-25" })).toBe("New: outside the top 100 in 2024-25");
    expect(changeText(null)).toBeNull();
  });
});
