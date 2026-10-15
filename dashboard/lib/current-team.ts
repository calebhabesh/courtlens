import { formatDate } from "./format-date";
import catalog from "./team-branding.json";
import type { PlayerResearchItem, WorkbenchCatalog } from "./types";

function teamName(tricode: string): string {
  return catalog.teams.find(entry => entry.tricode === tricode)?.artwork_name ?? tricode;
}

/** The newest season CourtLens has Stats for; rows of that season are the ones a move can flag. */
export function latestStatsSeason(workbench: WorkbenchCatalog | null | undefined): string | null {
  const seasons = workbench?.stats_scopes?.map(scope => scope.season) ?? [];
  return seasons.length ? seasons.reduce((a, b) => (b > a ? b : a)) : workbench?.default_season ?? null;
}

export interface TeamMove {
  /** The team the NBA player index lists the player with today. */
  tricode: string;
  /** Hover text naming both teams and the source. */
  title: string;
  /** For the row link's accessible name. */
  spoken: string;
}

/**
 * When a Stats row should say where the player is now (owner, Stats row): only for an active
 * player (the index lists a team), only on a single latest-season row, and only when that team is
 * not one he played for in the row. A mid-season trade already shows both teams on the row; older
 * seasons would flag nearly everyone. The row's own teams always stay the teams of its games.
 */
export function teamMove(item: PlayerResearchItem, rowSeason: string | null, latestSeason: string | null): TeamMove | null {
  const now = item.current_team?.team_tricode;
  if (!now || !rowSeason || rowSeason !== latestSeason) return null;
  const played = item.teams ?? [];
  if (played.length === 0 || played.includes(now)) return null;
  const before = played.map(teamName).join(" and ");
  const listing = item.current_team;
  const refreshed = listing?.index_refreshed_at ? ` Index refreshed ${formatDate(listing.index_refreshed_at)}.` : "";
  const trade = listing?.trade_date ? ` Traded ${formatDate(listing.trade_date)} (Basketball-Reference).` : "";
  return {
    tricode: now,
    title: `Played ${rowSeason} for the ${before}. Now listed with the ${teamName(now)} (NBA player index).${refreshed}${trade}`,
    spoken: `now with the ${teamName(now)}`,
  };
}
