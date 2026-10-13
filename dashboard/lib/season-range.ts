/**
 * Multi-season Stats scope (alignment instruction 43e). The URL keeps `season` as the Through
 * season, which owns the cutoff and phase coverage, and adds `seasonFrom` for a range. A range
 * aggregates whole seasons; season-only joins (DARKO, tracking, impact fits) stay unknown.
 */

export const QUICK_RANGES = [5, 10, 15, 25] as const;
export const SEASON_FROM_PARAM = "seasonFrom";

/** Admitted seasons from `from` through `through`, oldest first; empty when either is unknown. */
export function seasonsBetween(all: readonly string[], from: string, through: string): string[] {
  const chronological = [...all].sort();
  const start = chronological.indexOf(from);
  const end = chronological.indexOf(through);
  if (start < 0 || end < 0 || start > end) return [];
  return chronological.slice(start, end + 1);
}

/** The range a URL asks for, or null for a single season (or an unusable `seasonFrom`). */
export function seasonRange(all: readonly string[], seasonFrom: unknown, through: string): string[] | null {
  if (typeof seasonFrom !== "string" || !seasonFrom || seasonFrom === through) return null;
  const seasons = seasonsBetween(all, seasonFrom, through);
  return seasons.length > 1 ? seasons : null;
}

/** First season of an N-season range ending at `through`, clamped to the earliest admitted. */
export function quickRangeFrom(all: readonly string[], through: string, years: number): string {
  const chronological = [...all].sort();
  const end = chronological.indexOf(through);
  if (end < 0) return through;
  return chronological[Math.max(0, end - years + 1)];
}

/** Moves a whole range one season earlier or later; null when it would leave the catalog. */
export function shiftRange(all: readonly string[], from: string, through: string, step: -1 | 1): { from: string; through: string } | null {
  const chronological = [...all].sort();
  const start = chronological.indexOf(from) + step;
  const end = chronological.indexOf(through) + step;
  if (start < 0 || end >= chronological.length || chronological.indexOf(from) < 0 || chronological.indexOf(through) < 0) return null;
  return { from: chronological[start], through: chronological[end] };
}

/** "2021-22 – 2025-26" for a range, the season itself otherwise. */
export function seasonScopeLabel(seasons: readonly string[] | null, season: string): string {
  return seasons && seasons.length > 1 ? `${seasons[0]} – ${seasons[seasons.length - 1]}` : season;
}
