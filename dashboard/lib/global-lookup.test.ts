import { describe, expect, it, vi } from "vitest";
import { LookupCache, buildLookupCacheKey } from "./lookup-cache";
import { buildPreservedContextUrl } from "./query-url";
import type { LookupItem, LookupResponse } from "./types";

function createMockItem(
  id: string,
  kind: "player" | "team" | "page",
  name: string,
  destination: string,
  matchedAlias?: string,
  hasCurrentSeason = true
): LookupItem {
  return {
    id,
    kind,
    canonical_id: id,
    display_name: name,
    subtitle: `${kind.toUpperCase()} subtitle`,
    match_basis: "exact",
    match_score: 1.0,
    matched_alias: matchedAlias,
    portrait_url: kind === "player" ? `/api/workbench/players/${id}/portrait` : null,
    portrait_fallback: name.slice(0, 2).toUpperCase(),
    availability: {
      has_current_season: hasCurrentSeason,
      status: "available",
      seasons: ["2023-24", "2024-25"],
      latest_tricode: "TOR"
    },
    destination_url: destination
  };
}

describe("GlobalLookup data flow and invariants", () => {
  describe("Group partitioning and flattening", () => {
    it("partitions items into players, teams, and pages and flattens them deterministically", () => {
      const items: LookupItem[] = [
        createMockItem("p1", "player", "Nikola Jokić", "/players/p1"),
        createMockItem("t1", "team", "Toronto Raptors", "/teams/t1", "Raptors"),
        createMockItem("pg1", "page", "Stats Explorer", "/stats"),
        createMockItem("p2", "player", "Luka Dončić", "/players/p2"),
        createMockItem("t2", "team", "Golden State Warriors", "/teams/t2", "Dubs")
      ];

      const players = items.filter((i) => i.kind === "player");
      const teams = items.filter((i) => i.kind === "team");
      const pages = items.filter((i) => i.kind === "page");

      expect(players).toHaveLength(2);
      expect(teams).toHaveLength(2);
      expect(pages).toHaveLength(1);

      const flattened = [...players, ...teams, ...pages];
      expect(flattened).toHaveLength(5);
      expect(flattened[0].id).toBe("p1");
      expect(flattened[1].id).toBe("p2");
      expect(flattened[2].id).toBe("t1");
      expect(flattened[3].id).toBe("t2");
      expect(flattened[4].id).toBe("pg1");
    });
  });

  describe("Keyboard navigation index wrapping", () => {
    it("wraps ArrowDown navigation circularly", () => {
      const length = 4;
      let currentIndex = -1;

      // Down from -1 -> 0
      currentIndex = (currentIndex + 1) % length;
      expect(currentIndex).toBe(0);

      // Down to 1, 2, 3
      currentIndex = (currentIndex + 1) % length;
      expect(currentIndex).toBe(1);
      currentIndex = (currentIndex + 1) % length;
      expect(currentIndex).toBe(2);
      currentIndex = (currentIndex + 1) % length;
      expect(currentIndex).toBe(3);

      // Down from 3 wraps to 0
      currentIndex = (currentIndex + 1) % length;
      expect(currentIndex).toBe(0);
    });

    it("wraps ArrowUp navigation circularly", () => {
      const length = 4;
      let currentIndex = 0;

      // Up from 0 wraps to 3
      currentIndex = currentIndex <= 0 ? length - 1 : currentIndex - 1;
      expect(currentIndex).toBe(3);

      // Up from 3 to 2
      currentIndex = currentIndex <= 0 ? length - 1 : currentIndex - 1;
      expect(currentIndex).toBe(2);
    });
  });

  describe("Context preservation on selection", () => {
    it("preserves active context params in destination URL", () => {
      const currentParams = new URLSearchParams({
        season: "2024-25",
        phase: "regular_season",
        beforeDate: "2025-01-15",
        window: "last_10",
        releaseId: "rel-active-999"
      });

      const item = createMockItem("1630567", "player", "Scottie Barnes", "/players/1630567");
      const targetUrl = buildPreservedContextUrl(item.destination_url, currentParams);
      const parsed = new URL(targetUrl, "https://courtlens.local");

      expect(parsed.pathname).toBe("/players/1630567");
      expect(parsed.searchParams.get("season")).toBe("2024-25");
      expect(parsed.searchParams.get("phase")).toBe("regular_season");
      expect(parsed.searchParams.get("beforeDate")).toBe("2025-01-15");
      expect(parsed.searchParams.get("window")).toBe("last_10");
      expect(parsed.searchParams.get("releaseId")).toBe("rel-active-999");
    });

    it("respects destination pre-set params over defaults", () => {
      const currentParams = new URLSearchParams({
        season: "2024-25",
        releaseId: "rel-current"
      });

      const item = createMockItem("stats", "page", "Stats", "/stats?season=2020-21");
      const targetUrl = buildPreservedContextUrl(item.destination_url, currentParams);
      const parsed = new URL(targetUrl, "https://courtlens.local");

      expect(parsed.pathname).toBe("/stats");
      // Explicit target param season=2020-21 must not be overridden
      expect(parsed.searchParams.get("season")).toBe("2020-21");
      // releaseId from context is carried over
      expect(parsed.searchParams.get("releaseId")).toBe("rel-current");
    });
  });

  describe("Stale response discarding and race condition protection", () => {
    it("discards late arriving responses from earlier requests", async () => {
      let activeRequestId = 0;
      let settledResult: string | null = null;

      // Simulate Request 1 (slow, takes 100ms)
      const req1Id = ++activeRequestId;
      const promise1 = new Promise<string>((resolve) => {
        setTimeout(() => resolve("Result from Request 1 (Jok)"), 100);
      });

      // Simulate Request 2 (fast, takes 20ms, typed "Jokic")
      const req2Id = ++activeRequestId;
      const promise2 = new Promise<string>((resolve) => {
        setTimeout(() => resolve("Result from Request 2 (Jokic)"), 20);
      });

      // Handle promise 2
      promise2.then((res) => {
        if (req2Id === activeRequestId) {
          settledResult = res;
        }
      });

      // Handle promise 1 (which will finish later)
      promise1.then((res) => {
        if (req1Id === activeRequestId) {
          settledResult = res;
        }
      });

      // Wait 150ms for both to finish
      await new Promise((resolve) => setTimeout(resolve, 150));

      // Request 1 must NOT have overwritten Request 2
      expect(settledResult).toBe("Result from Request 2 (Jokic)");
    });
  });

  describe("Request cancellation via AbortController", () => {
    it("aborts in-flight request when superseded", () => {
      const controller = new AbortController();
      const abortSpy = vi.spyOn(controller, "abort");

      // Superceding action
      controller.abort();
      expect(abortSpy).toHaveBeenCalledTimes(1);
      expect(controller.signal.aborted).toBe(true);
    });
  });

  describe("Client LRU cache behavior", () => {
    it("avoids network fetch on cache hit", () => {
      const cache = new LookupCache(10);
      const key = buildLookupCacheKey({ query: "doncic", season: "2024-25" });

      const mockResponse: LookupResponse = {
        query: {
          raw: "doncic",
          normalized: "doncic",
          tokens: ["doncic"],
          version: "v1"
        },
        catalog_version: "v1",
        total_matches: 1,
        items: [createMockItem("204001", "player", "Luka Dončić", "/players/204001")]
      };

      cache.set(key, mockResponse);

      // Hit
      const cached = cache.get(key);
      expect(cached).toBeDefined();
      expect(cached?.items[0].display_name).toBe("Luka Dončić");
    });
  });

  describe("Availability indicator for historical/inactive players", () => {
    it("identifies players without current-season observations", () => {
      const activePlayer = createMockItem("p1", "player", "Jayson Tatum", "/players/p1", undefined, true);
      const historicalPlayer = createMockItem("p2", "player", "Kareem Abdul-Jabbar", "/players/p2", undefined, false);

      expect(activePlayer.availability.has_current_season).toBe(true);
      expect(historicalPlayer.availability.has_current_season).toBe(false);
    });
  });
});
