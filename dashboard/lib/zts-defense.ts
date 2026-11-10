// RD17 (owner, 2026-11-10): zTS's Defense tab, the defensive half of the old Adjusted Shooting page. It reads the live
// play-type feed (GET /api/workbench/play-types?side=defensive) unchanged: points allowed per play-type possession against
// what the league scored on the same mix. No interval is served, so nothing is ranked or coloured; the one computed line
// names the lowest and highest qualified defender and calls it a pattern, not a result (RD16).
import type { PlayTypePlayer, PlayTypesView } from "./stats-feeds";

export type DefenseSortKey = "adjusted_per_100" | "points_per_possession" | "expected_points_per_possession" | "possessions" | "games";
export interface DefenseSort { key: DefenseSortKey; direction: "asc" | "desc" }
export const DEFAULT_SORT: DefenseSort = { key: "adjusted_per_100", direction: "asc" };

const known = (v: number | null | undefined): v is number => typeof v === "number" && Number.isFinite(v);

/** Qualified defenders first, then thin samples (never ranked); each group sorted by the key, unknown values last, then by name. */
export function sortDefenders(players: readonly PlayTypePlayer[], sort: DefenseSort): PlayTypePlayer[] {
  const sign = sort.direction === "asc" ? 1 : -1;
  return [...players].sort((a, b) => {
    if (a.qualified !== b.qualified) return a.qualified ? -1 : 1;
    const x = a[sort.key], y = b[sort.key];
    if (!known(x) || !known(y)) return known(x) === known(y) ? a.player_name.localeCompare(b.player_name) : known(x) ? -1 : 1;
    return x === y ? a.player_name.localeCompare(b.player_name) : sign * (x - y);
  });
}

export interface DefensePattern { lowest: PlayTypePlayer; highest: PlayTypePlayer; qualified: number }

/** The qualified defenders with the lowest and highest points allowed against expectation; null when fewer than two are known. */
export function defensePattern(players: readonly PlayTypePlayer[]): DefensePattern | null {
  const pool = players.filter(p => p.qualified && known(p.adjusted_per_100));
  if (pool.length < 2) return null;
  const sorted = sortDefenders(pool, DEFAULT_SORT);
  return { lowest: sorted[0], highest: sorted[sorted.length - 1], qualified: pool.length };
}

/** "−19.3" / "+4.0" / "0.0" with a true minus. */
export function signedPoints(value: number | null | undefined, digits = 1): string {
  if (!known(value)) return "—";
  const text = Math.abs(value).toFixed(digits);
  if (Number(text) === 0) return (0).toFixed(digits);
  return `${value < 0 ? "−" : "+"}${text}`;
}

export function fixed(value: number | null | undefined, digits = 2): string {
  return known(value) ? value.toFixed(digits) : "—";
}

export function share(value: number | null | undefined, digits = 0): string {
  return known(value) ? `${(value * 100).toFixed(digits)}%` : "—";
}

export function whole(value: number | null | undefined): string {
  return known(value) ? Math.round(value).toLocaleString("en-US") : "—";
}

/** "2025-26 regular season" / "2024-25 playoffs". */
export function scopeLabel(view: Pick<PlayTypesView, "season" | "phase">): string {
  return `${view.season} ${view.phase === "playoffs" ? "playoffs" : "regular season"}`;
}

/** The play type's served label, or the raw key if the league list doesn't name it. */
export function playTypeLabel(view: Pick<PlayTypesView, "league">, key: string | null): string {
  if (!key) return "—";
  return view.league.find(row => row.play_type === key)?.label ?? key;
}

/** League points per possession over every listed play type (the old page's "League play-type PPP"). */
export function leaguePointsPerPossession(view: Pick<PlayTypesView, "league">): number | null {
  const possessions = view.league.reduce((sum, row) => sum + row.possessions, 0);
  return possessions > 0 ? view.league.reduce((sum, row) => sum + row.points, 0) / possessions : null;
}
