"use client";

import { useSyncExternalStore } from "react";
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
