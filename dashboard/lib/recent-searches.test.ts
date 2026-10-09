// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from "vitest";
import { RECENT_SEARCH_LIMIT, clearRecentSearches, readRecentSearches, rememberRecentSearch } from "./recent-searches";
import type { LookupItem } from "./types";

function player(id: string): LookupItem {
  return {
    id: `player-${id}`, kind: "player", canonical_id: id, display_name: `Player ${id}`, match_basis: "exact", match_score: 1,
    destination_url: `/players/${id}`,
    availability: { has_current_season: true, status: "available", seasons: ["2025-26"] },
    team_association: { basis: "selected_scope", teams: ["DEN"], observed_through: null, season: "2025-26", phase: "regular_season", before_date: null }
  };
}

afterEach(() => clearRecentSearches());

describe("recent searches", () => {
  it("keeps the newest first, removes duplicates and stays bounded", () => {
    for (let index = 0; index < RECENT_SEARCH_LIMIT + 3; index++) rememberRecentSearch(player(String(index)));
    rememberRecentSearch(player("4"));
    const recents = readRecentSearches();
    expect(recents).toHaveLength(RECENT_SEARCH_LIMIT);
    expect(recents[0].canonical_id).toBe("4");
    expect(recents.filter(item => item.canonical_id === "4")).toHaveLength(1);
  });

  it("drops scope-dependent team association instead of replaying it under another scope", () => {
    rememberRecentSearch(player("1"));
    expect(readRecentSearches()[0].team_association).toBeUndefined();
  });

  it("ignores malformed storage", () => {
    window.localStorage.setItem("courtlens-recent-searches-v1", "{not json");
    expect(readRecentSearches()).toEqual([]);
    window.localStorage.setItem("courtlens-recent-searches-v1", JSON.stringify([{ id: 1 }, player("9")]));
    expect(readRecentSearches().map(item => item.canonical_id)).toEqual(["9"]);
  });
});
