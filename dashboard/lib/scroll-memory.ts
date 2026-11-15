// Back and Forward return a page to where it was scrolled (site links SL04). The App Router keeps
// these navigations in the document and nothing restores the window's scroll, so a list left from
// row 30 came back at the top. Positions are kept per URL (filters live in the URL) for this tab.
import { storageKeys } from "./storage-keys";

const LIMIT = 60;

export type ScrollPositions = Record<string, number>;

/** Positions with `url` set to `y`, the most recent last, at most `LIMIT` kept. */
export function rememberScroll(positions: ScrollPositions, url: string, y: number): ScrollPositions {
  const next = { ...positions };
  delete next[url];
  next[url] = Math.max(0, Math.round(y));
  const keys = Object.keys(next);
  for (const key of keys.slice(0, Math.max(0, keys.length - LIMIT))) delete next[key];
  return next;
}

/** Where to scroll now: the saved position once the page is tall enough to reach it, else null. */
export function reachable(saved: number | undefined, maxScroll: number): number | null {
  if (saved == null || saved <= 0) return null;
  return maxScroll >= saved ? saved : null;
}

export function readScrollPositions(storage: Storage | null): ScrollPositions {
  try {
    const value = JSON.parse(storage?.getItem(storageKeys.scrollMemory) ?? "{}") as unknown;
    return value && typeof value === "object" ? value as ScrollPositions : {};
  } catch {
    return {};
  }
}

export function writeScrollPositions(storage: Storage | null, positions: ScrollPositions): void {
  try { storage?.setItem(storageKeys.scrollMemory, JSON.stringify(positions)); } catch { /* unavailable */ }
}
