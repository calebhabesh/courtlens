"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { buildLookupCacheKey, defaultLookupCache } from "./lookup-cache";
import { queryLookup } from "./workbench-api";
import { readStoredValue, storageKeys } from "./storage-keys";
import type { LookupItem } from "./types";

// Bounded local recents for the empty search state (polish-ui-contract, entity selection 4).
// Only identity and destination are kept. Team association depends on the scope that was active
// when the item was picked, so it is dropped rather than shown as if it applied to the current scope.
export const RECENT_SEARCH_LIMIT = 6;
const EVENT = "courtlens-recent-searches-change";
const EMPTY: LookupItem[] = [];

let cachedRaw: string | null = null;
let cachedItems: LookupItem[] = EMPTY;

function isLookupItem(value: unknown): value is LookupItem {
  if (!value || typeof value !== "object") return false;
  const item = value as Partial<LookupItem>;
  return typeof item.id === "string" && typeof item.canonical_id === "string" && typeof item.display_name === "string"
    && typeof item.destination_url === "string" && (item.kind === "player" || item.kind === "team" || item.kind === "page");
}

export function readRecentSearches(): LookupItem[] {
  const raw = readStoredValue(storageKeys.recentSearches);
  if (raw === cachedRaw) return cachedItems;
  cachedRaw = raw;
  try {
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    cachedItems = Array.isArray(parsed) ? parsed.filter(isLookupItem).slice(0, RECENT_SEARCH_LIMIT) : EMPTY;
  } catch {
    cachedItems = EMPTY;
  }
  return cachedItems;
}

export function rememberRecentSearch(item: LookupItem): void {
  const kept: LookupItem = {
    id: item.id, kind: item.kind, canonical_id: item.canonical_id, display_name: item.display_name,
    match_basis: item.match_basis, match_score: item.match_score, destination_url: item.destination_url,
    portrait_url: item.portrait_url ?? null, portrait_fallback: item.portrait_fallback ?? null,
    availability: item.availability, metadata: item.metadata
  };
  const next = [kept, ...readRecentSearches().filter(entry => !(entry.kind === item.kind && entry.canonical_id === item.canonical_id))]
    .slice(0, RECENT_SEARCH_LIMIT);
  try {
    window.localStorage.setItem(storageKeys.recentSearches, JSON.stringify(next));
  } catch {
    return;
  }
  window.dispatchEvent(new Event(EVENT));
}

export function forgetRecentSearch(item: Pick<LookupItem, "kind" | "canonical_id">): void {
  const next = readRecentSearches().filter(entry => !(entry.kind === item.kind && entry.canonical_id === item.canonical_id));
  try {
    window.localStorage.setItem(storageKeys.recentSearches, JSON.stringify(next));
  } catch {
    return;
  }
  window.dispatchEvent(new Event(EVENT));
}

export function clearRecentSearches(): void {
  try {
    window.localStorage.removeItem(storageKeys.recentSearches);
  } catch {
    return;
  }
  window.dispatchEvent(new Event(EVENT));
}

function subscribe(onChange: () => void): () => void {
  const onStorage = (event: StorageEvent) => { if (event.key === storageKeys.recentSearches) onChange(); };
  window.addEventListener(EVENT, onChange);
  window.addEventListener("storage", onStorage);
  return () => {
    window.removeEventListener(EVENT, onChange);
    window.removeEventListener("storage", onStorage);
  };
}

export function useRecentSearches(): LookupItem[] {
  return useSyncExternalStore(subscribe, readRecentSearches, () => EMPTY);
}

export interface RecentScope { releaseId?: string | null; season?: string | null; phase?: string | null; beforeDate?: string | null }

/** How long an empty search waits for its recents and leaders before showing what it has. */
export const IDLE_SETTLE_MS = 600;

/**
 * Recents as the current scope's own results (row 3, 70): each stored player or team is looked
 * up again by ID, so it shows the same team logo and caption as any other result. ``ready`` turns
 * true once every lookup has settled (or after ``IDLE_SETTLE_MS``), so a list can appear once,
 * complete, instead of re-laying out as entries fill in (72). Pages need no lookup.
 */
export function useScopedRecents(items: LookupItem[], scope: RecentScope, enabled: boolean): { items: LookupItem[]; ready: boolean } {
  const [fresh, setFresh] = useState<Record<string, LookupItem>>({});
  const [settled, setSettled] = useState<Record<string, true>>({});
  const [timedOut, setTimedOut] = useState<string | null>(null);
  const optionsOf = (item: LookupItem) => ({ query: item.canonical_id, releaseId: scope.releaseId, season: scope.season, phase: scope.phase, beforeDate: scope.beforeDate, kinds: [item.kind], limit: 1 });
  // Untyped suggestions stay plain, like the season leaders: no nickname list.
  const matchOf = (item: LookupItem, found: LookupItem[] | undefined) => {
    const match = found?.find(entry => entry.kind === item.kind && entry.canonical_id === item.canonical_id);
    return match ? { ...match, matched_alias: null, nicknames: [] } : undefined;
  };
  const scoped = items.filter(item => item.kind !== "page");
  const keys = scoped.map(item => buildLookupCacheKey(optionsOf(item)));
  const wanted = keys.join("|");
  useEffect(() => {
    if (!enabled) return;
    const abort = new AbortController();
    const timer = window.setTimeout(() => setTimedOut(wanted), IDLE_SETTLE_MS);
    scoped.forEach((item, index) => {
      const options = optionsOf(item), key = keys[index];
      if (defaultLookupCache.get(key)) return;
      queryLookup({ ...options, signal: AbortSignal.any([abort.signal, AbortSignal.timeout(5000)]) }).then(response => {
        if (abort.signal.aborted) return;
        defaultLookupCache.set(key, response);
        const match = matchOf(item, response.items);
        if (match) setFresh(current => ({ ...current, [key]: match }));
      }).catch(() => undefined).finally(() => { if (!abort.signal.aborted) setSettled(current => ({ ...current, [key]: true })); });
    });
    return () => { abort.abort(); window.clearTimeout(timer); };
    // ``wanted`` holds every item and scope value of the requests.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, wanted]);
  const ready = timedOut === wanted || keys.every(key => settled[key] || defaultLookupCache.get(key));
  return {
    ready,
    items: items.map(item => {
      if (item.kind === "page") return item;
      const key = buildLookupCacheKey(optionsOf(item));
      return matchOf(item, defaultLookupCache.get(key)?.items) ?? fresh[key] ?? item;
    })
  };
}
