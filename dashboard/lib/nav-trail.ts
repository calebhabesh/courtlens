import { analyticalNavItems, moreLinks } from "./nav-model";
import { mergedPagePath, TABBED_PAGES } from "./route-consolidation";
import { storageKeys } from "./storage-keys";

/**
 * The tab's trail of pages (back navigation, app shell row 0): every Back button returns to the
 * page before this one, or to its logical parent when the page was opened directly. A page is its
 * path (tabs of a merged page count as one) plus any identity parameter, so filter changes update
 * the current entry rather than adding one, and returning to the previous page pops the trail.
 */
export interface TrailEntry { key: string; href: string; label?: string }

const MAX = 20;
/** Query parameters that make a different page at the same path (Roster Shapes' team view). */
const IDENTITY_PARAMS: Record<string, string[]> = { "/roster-shapes": ["team"] };

export function pageKey(href: string): string {
  const url = new URL(href, "http://courtlens.local");
  const path = mergedPagePath(url.pathname);
  const identity = (IDENTITY_PARAMS[path] ?? []).map(name => url.searchParams.get(name)).filter(Boolean);
  return [path, ...identity].join("|");
}

/** The fallback name for a page that has not named itself. */
export function pageLabel(href: string): string {
  const url = new URL(href, "http://courtlens.local");
  const path = url.pathname;
  const items = [...analyticalNavItems(), ...moreLinks(false)];
  const exact = items.find(item => item.href.split("?")[0] === path);
  if (path === "/live" && url.searchParams.get("live_mode") === "history") return "Finals";
  if (path === "/roster-shapes") return "Roster Shapes";
  if (exact) return exact.label;
  const tabbed = Object.values(TABBED_PAGES).find(page => page.tabs.some(tab => tab.href === path));
  if (tabbed) return tabbed.title;
  if (path.startsWith("/players/")) return "Player";
  if (path.startsWith("/teams/")) return "Team";
  if (path === "/contracts/books") return "Source Books";
  if (path.startsWith("/contracts/")) return "Contracts";
  if (path.startsWith("/playoffs/")) return "Series";
  if (path.startsWith("/live")) return "Live";
  if (path.startsWith("/investigations/saved/")) return "Investigation";
  if (path.startsWith("/stats")) return "Stats";
  return "Previous Page";
}

function storage(): Storage | null {
  try { return window.sessionStorage; } catch { return null; }
}

export function readTrail(): TrailEntry[] {
  try {
    const raw = storage()?.getItem(storageKeys.navTrail);
    const value = raw ? JSON.parse(raw) as unknown : [];
    return Array.isArray(value) ? value.filter((entry): entry is TrailEntry => typeof entry?.key === "string" && typeof entry?.href === "string") : [];
  } catch {
    return [];
  }
}

function writeTrail(trail: TrailEntry[]): void {
  try { storage()?.setItem(storageKeys.navTrail, JSON.stringify(trail.slice(-MAX))); } catch { /* unavailable */ }
}

/** Pure step: the trail after visiting `href`. */
export function visit(trail: TrailEntry[], href: string): TrailEntry[] {
  const key = pageKey(href);
  const top = trail.at(-1);
  if (top?.key === key) return [...trail.slice(0, -1), { ...top, href }];
  if (trail.at(-2)?.key === key) return [...trail.slice(0, -2), { ...trail.at(-2)!, href }];
  return [...trail, { key, href }];
}

export function recordVisit(href: string): void {
  writeTrail(visit(readTrail(), href));
}

/** A page names itself ("Nikola Jokić", "San Antonio Spurs Roster Shape") for the next page's Back. */
export function nameCurrentPage(href: string, label: string): void {
  const trail = readTrail();
  const top = trail.at(-1);
  if (top && top.key === pageKey(href) && top.label !== label) writeTrail([...trail.slice(0, -1), { ...top, label }]);
}

/** Where Back goes from `href`: the page before it in this tab, else null. */
export function previousPage(href: string): TrailEntry | null {
  const trail = readTrail();
  const key = pageKey(href);
  for (let index = trail.length - 1; index > 0; index--) if (trail[index].key === key) return trail[index - 1];
  return null;
}
