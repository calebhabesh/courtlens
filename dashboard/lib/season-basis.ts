// Full NBA history (FH05): seasons before 1983-84 have season totals only, no game rows.
import type { WorkbenchCatalog } from "./types";

/** The first season with complete game logs (Basketball-Reference, 1983-84). */
export const FIRST_GAME_LOG_SEASON = "1983-84";

/** True when the catalog serves this season as whole-season totals (no games, no windows). */
export function isTotalsSeason(catalog: WorkbenchCatalog | null | undefined, season: string): boolean {
  const scopes = (catalog?.stats_scopes ?? []).filter(scope => scope.season === season);
  return scopes.length > 0 && scopes.every(scope => scope.basis === "season_totals");
}

/** Seasons with game rows, for pages built on games (game logs, teams, playoffs, lineups). */
export function gameSeasons(catalog: WorkbenchCatalog | null | undefined): string[] {
  return (catalog?.seasons ?? []).filter(season => !isTotalsSeason(catalog, season));
}

/** A catalog narrowed to its game seasons, for views that read `catalog.seasons` directly. */
export function withGameSeasons<T extends WorkbenchCatalog | null | undefined>(catalog: T): T {
  if (!catalog) return catalog;
  return { ...catalog, seasons: gameSeasons(catalog), stats_scopes: (catalog.stats_scopes ?? []).filter(scope => scope.basis !== "season_totals") };
}

/** The last season of the Basketball Association of America, before it became the NBA (1949-50). */
export const LAST_BAA_SEASON = "1948-49";

/** A season as season pickers show it: "1946-47 · BAA" for the league's first three seasons. */
export function seasonOptionLabel(season: string): string {
  return /^\d{4}-\d{2}$/.test(season) && season <= LAST_BAA_SEASON ? `${season} · BAA` : season;
}
