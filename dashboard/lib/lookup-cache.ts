import type { LookupResponse } from "./types";

/**
 * Bounded client-side LRU cache for incremental lookup responses.
 * Avoids repeated network round-trips for backspaces, common prefixes,
 * and rapid queries while respecting memory limits.
 */
export class LookupCache {
  private readonly capacity: number;
  private readonly map: Map<string, LookupResponse>;

  constructor(capacity = 64) {
    this.capacity = Math.max(1, capacity);
    this.map = new Map();
  }

  get(key: string): LookupResponse | undefined {
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
      }
    }
    this.map.set(key, value);
  }

  has(key: string): boolean {
    return this.map.has(key);
  }

  clear(): void {
    this.map.clear();
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
  kinds?: Array<"player" | "team" | "page">;
  limit?: number;
}): string {
  const normQ = (options.query || "").trim().toLowerCase();
  const rel = options.releaseId || "";
  const sea = options.season || "";
  const kindsStr = options.kinds ? [...options.kinds].sort().join(",") : "all";
  const lim = options.limit ?? 10;
  return `${normQ}__${rel}__${sea}__${kindsStr}__${lim}`;
}

export const defaultLookupCache = new LookupCache(64);
