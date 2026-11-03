/** ESPN's NBA standings (alignment row 23): the season's teams grouped and ranked as ESPN does. */
import type { LiveStandingRow } from "./live";

export interface StandingEntry extends LiveStandingRow {
  short_name?: string | null; abbreviation?: string | null; seed?: string | null; clincher?: string | null;
  home?: string | null; away?: string | null; div?: string | null; conf?: string | null;
  ppg?: string | null; opp_ppg?: string | null; diff?: string | null; l10?: string | null;
}
export interface StandingsDivision { division: string | null; conference: string | null; entries: StandingEntry[] }
export interface StandingsData { season: string; year: number; standings: StandingsDivision[] | null }

export type StandingsGroup = "league" | "conference" | "division";
export const STANDINGS_GROUPS: { value: StandingsGroup; label: string }[] = [
  { value: "league", label: "League" }, { value: "conference", label: "Conference" }, { value: "division", label: "Division" },
];
/** The first season ESPN's feed lists in full. */
export const FIRST_STANDINGS_SEASON = "1984-85";

export type StandingsColumn = "w" | "l" | "pct" | "gb" | "home" | "away" | "div" | "conf" | "ppg" | "opp_ppg" | "diff" | "strk" | "l10";
export const STANDINGS_COLUMNS: { key: StandingsColumn; label: string; title: string; sortable: boolean }[] = [
  { key: "w", label: "W", title: "Wins", sortable: true },
  { key: "l", label: "L", title: "Losses", sortable: true },
  { key: "pct", label: "PCT", title: "Win percentage", sortable: true },
  { key: "gb", label: "GB", title: "Games behind the group's leader", sortable: true },
  { key: "home", label: "HOME", title: "Home record", sortable: false },
  { key: "away", label: "AWAY", title: "Away record", sortable: false },
  { key: "div", label: "DIV", title: "Record against the division", sortable: false },
  { key: "conf", label: "CONF", title: "Record against the conference", sortable: false },
  { key: "ppg", label: "PPG", title: "Points per game", sortable: true },
  { key: "opp_ppg", label: "OPP PPG", title: "Opponent points per game", sortable: true },
  { key: "diff", label: "DIFF", title: "Average point differential", sortable: true },
  { key: "strk", label: "STRK", title: "Current streak", sortable: true },
  { key: "l10", label: "L10", title: "Record in the last ten games", sortable: false },
];

export const CLINCH_MARKS: Record<string, string> = {
  z: "Clinched the No. 1 seed in the league", y: "Clinched the division", x: "Clinched a playoff berth",
  pb: "Clinched a play-in berth", e: "Eliminated from the playoffs", o: "Eliminated from the playoffs", "*": "Clinched the best conference record",
};

const num = (value: string | null | undefined) => {
  const n = Number(value);
  return value != null && value !== "" && Number.isFinite(n) ? n : null;
};

export function wins(row: StandingEntry) { return num(row.wins) ?? 0; }
export function losses(row: StandingEntry) { return num(row.losses) ?? 0; }
export function winPct(row: StandingEntry) {
  const games = wins(row) + losses(row);
  return games ? wins(row) / games : 0;
}

/** Streak as a signed number for sorting: W3 → 3, L2 → -2. */
function streak(value: string | null | undefined) {
  const match = /^([WL])(\d+)$/.exec(value ?? "");
  return match ? (match[1] === "W" ? 1 : -1) * Number(match[2]) : 0;
}

/** ESPN's order: the playoff seed (NBA tiebreakers applied) when listed, else win percentage. */
export function bySeed(a: StandingEntry, b: StandingEntry) {
  const sa = num(a.seed), sb = num(b.seed);
  if (sa != null && sb != null && sa !== sb) return sa - sb;
  return winPct(b) - winPct(a) || wins(b) - wins(a) || (a.name ?? "").localeCompare(b.name ?? "");
}

/** By record for the league table (seeds are per conference). */
export function byRecord(a: StandingEntry, b: StandingEntry) {
  return winPct(b) - winPct(a) || wins(b) - wins(a) || (a.name ?? "").localeCompare(b.name ?? "");
}

/** Games behind a group's leader (the best record in the group); "-" for the leader. */
export function gamesBehind(row: StandingEntry, group: readonly StandingEntry[]) {
  const leader = [...group].sort(byRecord)[0];
  if (!leader) return null;
  const gb = ((wins(leader) - wins(row)) + (losses(row) - losses(leader))) / 2;
  return gb <= 0 ? "-" : String(gb);
}

export interface StandingsTable { key: string; title: string; conference: string | null; rows: StandingEntry[]; lines: boolean }

/** The tables a grouping shows: one league table, two conferences, or six divisions. */
export function standingsTables(divisions: readonly StandingsDivision[], group: StandingsGroup): StandingsTable[] {
  const all = divisions.flatMap(d => d.entries.map(entry => ({ ...entry, conference: d.conference })));
  if (group === "league") return [{ key: "league", title: "National Basketball Association", conference: null, rows: [...all].sort(byRecord), lines: false }];
  if (group === "division") return divisions.filter(d => d.entries.length).map(d => ({
    key: `${d.conference}-${d.division}`, title: d.division ?? "Division", conference: d.conference, rows: [...d.entries].sort(bySeed), lines: false,
  }));
  const conferences = [...new Set(divisions.map(d => d.conference ?? ""))];
  return conferences.map(conference => ({
    key: conference, title: conference || "Conference", conference: conference || null,
    rows: all.filter(entry => (entry.conference ?? "") === conference).sort(bySeed), lines: true,
  }));
}

/**
 * The seeding lines a conference table draws after these ranks: the top six and the play-in
 * (seeds 7 to 10) from 2020-21, when the play-in began; eight playoff teams before that.
 */
export function seedLines(season: string) {
  return Number(season.slice(0, 4)) >= 2020 ? [6, 10] : [8];
}

export function sortValue(row: StandingEntry, key: StandingsColumn, group: readonly StandingEntry[]): number {
  switch (key) {
    case "w": return wins(row);
    case "l": return losses(row);
    case "pct": return winPct(row);
    case "gb": return Number(gamesBehind(row, group)?.replace("-", "0") ?? 0);
    case "ppg": return num(row.ppg) ?? 0;
    case "opp_ppg": return num(row.opp_ppg) ?? 0;
    case "diff": return num(row.diff?.replace("+", "")) ?? 0;
    case "strk": return streak(row.streak);
    default: return 0;
  }
}

/** Seasons with standings, newest first, down to 1984-85. */
export function standingsSeasons(current: string) {
  const last = Number(current.slice(0, 4)), first = Number(FIRST_STANDINGS_SEASON.slice(0, 4));
  return Array.from({ length: last - first + 1 }, (_, i) => {
    const start = last - i;
    return `${start}-${String(start + 1).slice(-2)}`;
  });
}

/** The season under way on a date: October 2026 is 2026-27, May 2026 is 2025-26. */
export function currentSeason(today: Date = new Date()) {
  const year = today.getUTCMonth() >= 7 ? today.getUTCFullYear() : today.getUTCFullYear() - 1;
  return `${year}-${String(year + 1).slice(-2)}`;
}
