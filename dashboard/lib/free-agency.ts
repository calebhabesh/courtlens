import { browserApi } from "./api";

// Alignment row 14: NBA.com's free-agent class (sealed operator import), kept current with Wikipedia's
// dated moves and ESPN's rosters on a schedule (never a visitor fetch).
export type FreeAgentStatus = "unsigned" | "signed" | "returned";
/** Where a player stands now; `abroad` = signed with a club outside the NBA (Wikipedia). */
export type CurrentStatus = FreeAgentStatus | "abroad";
export type LatestMove = {
  kind: "signed" | "two_way" | "waived" | "cut" | "abroad" | "retired"; date: string | null;
  team_id: string | null; team_tricode: string | null; club: string | null; country: string | null;
};
export type FreeAgent = {
  player_id: string; name: string; position: string | null; class: "ufa" | "rfa";
  option: "player" | "team" | "early_termination" | null; two_way: boolean; status: FreeAgentStatus;
  old_team_id: string | null; new_team_id: string | null; old_team_tricode: string | null; new_team_tricode: string | null;
  points_per_game: number | null; rebounds_per_game: number | null; assists_per_game: number | null;
  age: number | null; experience: number | null; note: string | null; note_url: string | null;
  /** NBA.com's own note says the player retired. */
  retired: boolean;
  /** The latest NBA player index: his roster team now (null on no roster), and how it compares. */
  roster_team_id: string | null; roster_team_tricode: string | null;
  roster_check: "agrees" | "not_on_roster" | "other_team" | "on_roster" | null;
  /** NBA.com's status, then Wikipedia's latest move, then the roster (`status_source` says which decided). */
  current_status: CurrentStatus; current_team_id: string | null; current_team_tricode: string | null;
  status_source: "nba" | "wikipedia" | "roster"; latest_move: LatestMove | null;
  /** The current status or team differs from NBA.com's tracker. */
  changed: boolean;
};
/** Wikipedia's transactions article behind the latest moves. */
export type MovesIndex = { source: string; url: string; revision_id: number; observed_at: string; events: number; ambiguous: string[] };
/** The roster source behind the cross-check: ESPN's scheduled team rosters, or else the NBA player index. */
export type RosterIndex = { source: string; observed_at: string; dataset_id?: string; manifest_sha256?: string; players?: number; unmatched?: string[] };
export type FreeAgencyResponse =
  | { status: "not_configured"; source: string; limitations: string[] }
  | { status: "available"; source: string; version: string; manifest_sha256: string; year: number; url: string; observed_at: string;
      capture: "scheduled_fetch" | "operator_import"; raw_sha256: string; roster_index: RosterIndex | null; moves: MovesIndex | null; limitations: string[]; players: FreeAgent[] };

export async function getFreeAgency(signal?: AbortSignal): Promise<FreeAgencyResponse> {
  const response = await fetch(`${browserApi}/api/workbench/operations/free-agency`, { cache: "no-store", signal });
  if (!response.ok) throw new Error(`Free agency request failed (${response.status}).`);
  return response.json();
}

export type FreeAgencyFilter = "all" | CurrentStatus | "option" | "two-way" | "changed" | "retired";
export const FILTERS: { value: FreeAgencyFilter; label: string }[] = [
  { value: "all", label: "All" }, { value: "unsigned", label: "Unsigned" }, { value: "signed", label: "Signed" },
  { value: "returned", label: "Returned" }, { value: "abroad", label: "Abroad" }, { value: "option", label: "Option" },
  { value: "two-way", label: "Two-Way" }, { value: "changed", label: "Changed Since Tracker" }, { value: "retired", label: "Retired" },
];
export const OPTION_LABELS = { player: "Player Option", team: "Team Option", early_termination: "Early Termination" } as const;


/** Retired players (per NBA.com's note) show only under Retired; every other view leaves them out. */
export function matchesFilter(player: FreeAgent, filter: FreeAgencyFilter): boolean {
  if (filter === "retired") return player.retired;
  if (player.retired) return false;
  if (filter === "all") return true;
  if (filter === "changed") return player.changed;
  if (filter === "option") return player.option !== null;
  if (filter === "two-way") return player.two_way;
  return player.current_status === filter;
}
export function matchesSearch(player: FreeAgent, query: string): boolean {
  const needle = query.trim().toLowerCase();
  if (!needle) return true;
  return [player.name, player.old_team_tricode, player.current_team_tricode, player.latest_move?.club, player.note].some(text => text?.toLowerCase().includes(needle));
}
/** "stats" is points per game (the default, and the key older links carry). */
export type FreeAgencySort = "stats" | "reb" | "ast" | "name" | "age" | "exp" | "status";
const STATUS_ORDER: Record<CurrentStatus, number> = { unsigned: 0, signed: 1, returned: 2, abroad: 3 };
const SORT_KEY: Record<FreeAgencySort, (p: FreeAgent) => number | string | null> = {
  stats: p => p.points_per_game, reb: p => p.rebounds_per_game, ast: p => p.assists_per_game,
  age: p => p.age, exp: p => p.experience, status: p => STATUS_ORDER[p.current_status], name: p => p.name,
};
/** Text sorts ascending, numbers descending; unknown values sort last in either direction, never as zero. */
export function sortAgents(players: FreeAgent[], sort: FreeAgencySort): FreeAgent[] {
  const key = SORT_KEY[sort];
  const descending = sort !== "name" && sort !== "status";
  return [...players].sort((a, b) => {
    const x = key(a), y = key(b);
    if (x === null || y === null) return x === y ? a.name.localeCompare(b.name) : x === null ? 1 : -1;
    const order = typeof x === "string" ? x.localeCompare(String(y)) : x - Number(y);
    return (descending ? -order : order) || a.name.localeCompare(b.name);
  });
}
/** A stale tracker says so: Databallr's "Source stale" after a week without an observation. */
export const isStale = (observedAt: string, now = Date.now()) => now - Date.parse(observedAt) > 7 * 24 * 3600 * 1000;
/** Rosters refresh every 6 hours and Wikipedia daily; a day without a run means a timer stopped or a source refused. */
export const isRosterStale = (observedAt: string, now = Date.now()) => now - Date.parse(observedAt) > 24 * 3600 * 1000;
