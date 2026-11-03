import { formatDate } from "./format-date";
import catalog from "./team-branding.json";
import type { PlayerCurrentStatus, PlayerResearchItem, WorkbenchCatalog } from "./types";

function teamName(tricode: string): string {
  return catalog.teams.find(entry => entry.tricode === tricode)?.artwork_name ?? tricode;
}

/** The newest season CourtLens has Stats for; rows of that season are the ones a move can flag. */
export function latestStatsSeason(workbench: WorkbenchCatalog | null | undefined): string | null {
  const seasons = workbench?.stats_scopes?.map(scope => scope.season) ?? [];
  return seasons.length ? seasons.reduce((a, b) => (b > a ? b : a)) : workbench?.default_season ?? null;
}

export interface TeamMove {
  /** On a roster (`team`) or on none: a free agent, abroad or retired. */
  kind: "team" | "free_agent" | "abroad" | "retired";
  /** The team the player is on today; null off every roster. */
  tricode: string | null;
  /** The chip's text after "now": the team code, or the off-roster state. */
  label: string;
  /** Hover text naming both teams (or the move) and the source. */
  title: string;
  /** For the row link's accessible name. */
  spoken: string;
}

const STATE_LABEL = { free_agent: "Free agent", abroad: "Abroad", retired: "Retired" } as const;

function offRosterReason(status: PlayerCurrentStatus): string {
  const move = status.move;
  const on = move?.date ? ` ${formatDate(move.date)}` : "";
  const by = move?.team_tricode ? ` by the ${teamName(move.team_tricode)}` : "";
  if (status.state === "abroad") {
    const club = move?.club ? ` with ${move.club}${move.country ? ` (${move.country})` : ""}` : "";
    return `Now playing outside the NBA${club ? `: signed${club}${on}` : ""}.`;
  }
  if (status.state === "retired") return `Retired${on}.`;
  if (move?.kind === "cut") return `Now on no NBA roster: cut${by} in training camp.`;
  if (move?.kind === "waived") return `Now on no NBA roster: waived${by}${on}.`;
  return "Now on no NBA roster.";
}

/**
 * When a Stats row should say where the player is now (owner, Stats row): only on a single
 * latest-season row. A player on a roster is flagged only when that team is not one he played
 * for in the row (a mid-season trade already shows both teams); a player on no roster (free
 * agent, abroad, retired) is always flagged. Older seasons would flag nearly everyone. The
 * row's own teams always stay the teams of its games. The placement uses the free-agency
 * tracker's evidence (rosters, then Wikipedia's dated moves), so both pages agree.
 */
export function teamMove(item: PlayerResearchItem, rowSeason: string | null, latestSeason: string | null): TeamMove | null {
  if (!rowSeason || rowSeason !== latestSeason) return null;
  const played = item.teams ?? [];
  if (played.length === 0) return null;
  const before = `Played ${rowSeason} for the ${played.map(teamName).join(" and ")}.`;
  const status = item.current_status;
  if (status && !item.current_team) {
    const source = status.source ? ` Source: ${status.source}.` : "";
    const checked = status.as_of ? ` Checked ${formatDate(status.as_of)}.` : "";
    const label = STATE_LABEL[status.state];
    return {
      kind: status.state, tricode: null, label,
      title: `${before} ${offRosterReason(status)}${source}${checked}`,
      spoken: status.state === "free_agent" ? "now a free agent" : status.state === "abroad" ? "now playing abroad" : "now retired",
    };
  }
  const now = item.current_team?.team_tricode;
  if (!now || played.includes(now)) return null;
  const listing = item.current_team;
  const refreshed = listing?.index_refreshed_at ? ` Checked ${formatDate(listing.index_refreshed_at)}.` : "";
  const trade = listing?.trade_date ? ` Traded ${formatDate(listing.trade_date)} (Basketball-Reference).` : "";
  return {
    kind: "team", tricode: now, label: now,
    title: `${before} Now listed with the ${teamName(now)} (${listing?.listing_source ?? "NBA player index"}).${refreshed}${trade}`,
    spoken: `now with the ${teamName(now)}`,
  };
}
