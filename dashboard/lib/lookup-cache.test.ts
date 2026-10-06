import { describe, expect, it, vi } from "vitest";
import { LookupCache, buildLookupCacheKey } from "./lookup-cache";
import type { LookupResponse } from "./types";

function createMockResponse(query: string, matches: number): LookupResponse {
  return {
    query: {
      raw: query,
      normalized: query.toLowerCase(),
      tokens: [query.toLowerCase()],
      version: "v1"
    },
    catalog_version: "v1",
    total_matches: matches,
    items: []
  };
}

describe("LookupCache", () => {
  it("stores and retrieves responses", () => {
    const cache = new LookupCache(10);
    const key = buildLookupCacheKey({ query: "jokic" });
    const resp = createMockResponse("jokic", 1);

    cache.set(key, resp);
    expect(cache.has(key)).toBe(true);
    expect(cache.get(key)).toBe(resp);
    expect(cache.size).toBe(1);
  });

  it("returns undefined for cache misses", () => {
    const cache = new LookupCache(10);
    expect(cache.get("non-existent")).toBeUndefined();
    expect(cache.has("non-existent")).toBe(false);
  });

  it("evicts the least recently used item when capacity is reached", () => {
    const cache = new LookupCache(3);

    const k1 = buildLookupCacheKey({ query: "q1" });
    const k2 = buildLookupCacheKey({ query: "q2" });
    const k3 = buildLookupCacheKey({ query: "q3" });
    const k4 = buildLookupCacheKey({ query: "q4" });

    cache.set(k1, createMockResponse("q1", 1));
    cache.set(k2, createMockResponse("q2", 2));
    cache.set(k3, createMockResponse("q3", 3));
    expect(cache.size).toBe(3);

    // Access k1 to make it most recently used; order of least to most recent is now k2, k3, k1
    cache.get(k1);

    // Insert k4, should evict k2
    cache.set(k4, createMockResponse("q4", 4));
    expect(cache.size).toBe(3);
    expect(cache.has(k2)).toBe(false);
    expect(cache.has(k1)).toBe(true);
    expect(cache.has(k3)).toBe(true);
    expect(cache.has(k4)).toBe(true);
  });

  it("overwriting an existing key updates the value and retains size", () => {
    const cache = new LookupCache(2);
    const k1 = buildLookupCacheKey({ query: "test" });
    const r1 = createMockResponse("test", 1);
    const r2 = createMockResponse("test", 5);

    cache.set(k1, r1);
    expect(cache.get(k1)?.total_matches).toBe(1);

    cache.set(k1, r2);
    expect(cache.get(k1)?.total_matches).toBe(5);
    expect(cache.size).toBe(1);
  });

  it("clears all items", () => {
    const cache = new LookupCache(5);
    cache.set("a", createMockResponse("a", 1));
    cache.set("b", createMockResponse("b", 2));
    expect(cache.size).toBe(2);

    cache.clear();
    expect(cache.size).toBe(0);
    expect(cache.has("a")).toBe(false);
  });
});

describe("buildLookupCacheKey", () => {
  it("normalizes query whitespace and case", () => {
    const k1 = buildLookupCacheKey({ query: "  Jokic  " });
    const k2 = buildLookupCacheKey({ query: "jokic" });
    expect(k1).toBe(k2);
  });

  it("differentiates based on context parameters", () => {
    const k1 = buildLookupCacheKey({ query: "tatum", season: "2024-25" });
    const k2 = buildLookupCacheKey({ query: "tatum", season: "2023-24" });
    const k3 = buildLookupCacheKey({ query: "tatum", releaseId: "rel-1" });

    expect(k1).not.toBe(k2);
    expect(k1).not.toBe(k3);
  });

  it("isolates phase and exclusive cutoff associations", () => {
    const regular = buildLookupCacheKey({ query: "doncic", phase: "regular_season", beforeDate: "2025-02-02" });
    expect(regular).not.toBe(buildLookupCacheKey({ query: "doncic", phase: "playoffs", beforeDate: "2025-02-02" }));
    expect(regular).not.toBe(buildLookupCacheKey({ query: "doncic", phase: "regular_season", beforeDate: "2025-02-03" }));
  });

  it("sorts kinds for stable cache keys", () => {
    const k1 = buildLookupCacheKey({ query: "tor", kinds: ["team", "player"] });
    const k2 = buildLookupCacheKey({ query: "tor", kinds: ["player", "team"] });
    expect(k1).toBe(k2);
  });
});

it("expires responses so an unresolved public pointer cannot remain stale indefinitely",()=>{vi.useFakeTimers();const cache=new LookupCache(2);cache.set("public",createMockResponse("x",1));vi.advanceTimersByTime(30_001);expect(cache.get("public")).toBeUndefined();vi.useRealTimers();});
it("does not collide when query/context contains old delimiter strings",()=>{expect(buildLookupCacheKey({query:"a__b",releaseId:"c"})).not.toBe(buildLookupCacheKey({query:"a",releaseId:"b__c"}));});
