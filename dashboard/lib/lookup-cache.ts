import type { LookupResponse } from "./types";

/**
 * Bounded client-side LRU cache for incremental lookup responses.
 * Avoids repeated network round-trips for backspaces, common prefixes,
 * and rapid queries while respecting memory limits.
 */
export class LookupCache {
  private readonly capacity: number;
  private readonly expires = new Map<string, number>();
  private readonly map: Map<string, LookupResponse>;

  constructor(capacity = 64) {
    this.capacity = Math.max(1, capacity);
    this.map = new Map();
  }

  get(key: string): LookupResponse | undefined {
    if ((this.expires.get(key) ?? 0) <= Date.now()) {
      this.map.delete(key);
      this.expires.delete(key);
    }
    if (!this.map.has(key)) {
      return undefined;
    }
    // Refresh LRU order by delete and re-insert
    const value = this.map.get(key)!;
    this.map.delete(key);
    this.map.set(key, value);
    return value;
  }

  set(key: string, value: LookupResponse): void {
    if (this.map.has(key)) {
      this.map.delete(key);
    } else if (this.map.size >= this.capacity) {
      // Evict oldest entry (first item in Map keys)
      const oldestKey = this.map.keys().next().value;
      if (oldestKey !== undefined) {
        this.map.delete(oldestKey);
        this.expires.delete(oldestKey);
      }
    }
    this.map.set(key, value);
    this.expires.set(key, Date.now() + 30_000);
  }

  has(key: string): boolean {
    return this.get(key) !== undefined;
  }

  clear(): void {
    this.map.clear();
    this.expires.clear();
  }

  get size(): number {
    return this.map.size;
  }
}

/**
 * Build a deterministic cache key for lookup requests.
 */
export function buildLookupCacheKey(options: {
  query: string;
  releaseId?: string | null;
  season?: string | null;
  phase?: string | null;
  beforeDate?: string | null;
  kinds?: Array<"player" | "team" | "page">;
  limit?: number;
}): string {
  return JSON.stringify(["pf04-v1", (options.query || "").trim().toLowerCase(), options.releaseId || "", options.season || "", options.phase || "", options.beforeDate || "", options.kinds ? [...options.kinds].sort() : "all", options.limit ?? 10]);
}

export const defaultLookupCache = new LookupCache(64);
