import { storageKeys } from "./storage-keys";

/** A player page opened from the Stats table carries `from=stats`; only then does Back show. */
export const STATS_RETURN_PARAM = "from";

/** Where the Stats table was when a player was opened: its URL and scroll positions. */
export type StatsReturn = { href: string; pageY: number; tableTop: number; tableLeft: number; restore?: boolean };

function storage(): Storage | null {
  try { return window.sessionStorage; } catch { return null; }
}

export function saveStatsReturn(entry: StatsReturn): void {
  try { storage()?.setItem(storageKeys.statsReturn, JSON.stringify(entry)); } catch { /* unavailable */ }
}

export function readStatsReturn(): StatsReturn | null {
  try {
    const raw = storage()?.getItem(storageKeys.statsReturn);
    const value = raw ? JSON.parse(raw) as StatsReturn : null;
    return value && typeof value.href === "string" && value.href.startsWith("/stats") ? value : null;
  } catch {
    return null;
  }
}

/** Back to table was pressed: the Stats page restores its scroll once it lands. */
export function markStatsRestore(): void {
  const entry = readStatsReturn();
  if (entry) saveStatsReturn({ ...entry, restore: true });
}

/** The pending restore for this Stats URL, consumed once. */
export function takeStatsRestore(href: string): StatsReturn | null {
  const entry = readStatsReturn();
  if (!entry?.restore || entry.href !== href) return null;
  saveStatsReturn({ ...entry, restore: false });
  return entry;
}
