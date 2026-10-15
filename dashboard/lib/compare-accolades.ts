import type { ComparisonChampionships, PlayerBio } from "./types";
import { seasonAwardChips } from "./awards";

/**
 * The comparison card's accolades (alignment row 3, 9), dated to the compared cutoff.
 *
 * Season honours come from the Basketball-Reference season award codes on the player bio
 * ("MVP-1", "NBA2", "AS"). A season's honours count only once they were announced before the
 * cutoff: All-Star selections from mid-February of the season's final year, the rest from June 1
 * (awards are announced from late May). Championships come from admitted playoff box scores.
 * A player without a Basketball-Reference match has unknown accolades, never zero.
 */

export interface AccoladeRow {
  key: string;
  label: string;
  title: string;
  a: number | null;
  b: number | null;
  /** Career counts as numbers, or an em dash for unknown. */
  shown: [string, string];
  /** Which side leads, by the row's own order; null for ties, unknowns and absent honours. */
  leader: "a" | "b" | null;
}

export type SeasonHonorBadge = ReturnType<typeof seasonAwardChips>[number];

export interface SeasonHonors {
  season: string;
  /** null means the reference source is unknown, not that the player earned no honors. */
  badges: SeasonHonorBadge[] | null;
}

export interface AccoladeGroups {
  career: AccoladeRow[];
  season: [SeasonHonors, SeasonHonors];
}

const ALL_STAR_KNOWN = "-02-15";
const AWARDS_KNOWN = "-06-01";

function endYear(season: string) { return `${Number(season.slice(0, 4)) + 1}`; }

/** True when the season's honours of this kind were announced strictly before the cutoff. */
export function announcedBefore(season: string, code: string, beforeDate: string) {
  return `${endYear(season)}${code === "AS" ? ALL_STAR_KNOWN : AWARDS_KNOWN}` < beforeDate;
}

function seasonCodes(bio: PlayerBio | null, beforeDate: string): Map<string, string[]> | null {
  const awards = bio?.reference?.awards;
  if (!awards) return null;
  return new Map(Object.entries(awards).map(([season, codes]) => [season, codes.filter(code => announcedBefore(season, code, beforeDate))]));
}

function count(codes: Map<string, string[]> | null, test: (code: string) => boolean) {
  return codes ? [...codes.values()].reduce((total, list) => total + list.filter(test).length, 0) : null;
}

function leaderOf(a: number | null, b: number | null, better: "high" | "low"): "a" | "b" | null {
  if (a == null || b == null || a === b) return null;
  return (better === "high" ? a > b : a < b) ? "a" : "b";
}

function countRow(key: string, label: string, title: string, a: number | null, b: number | null): AccoladeRow {
  return { key, label, title, a, b, shown: [a == null ? "—" : String(a), b == null ? "—" : String(b)], leader: leaderOf(a, b, "high") };
}

function titles(championships: ComparisonChampionships | null | undefined): number | null {
  if (!championships) return null;
  // Before the first admitted season titles are unknown, so a count could understate a career.
  return championships.complete ? championships.seasons.length : null;
}

/** Reuse the player page's labels, with every supplied season code and admitted titles. */
function seasonHonors(season: string, codes: Map<string, string[]> | null, championships: ComparisonChampionships | null | undefined): SeasonHonors {
  const known = codes?.get(season) ?? [];
  const badges = seasonAwardChips(known);
  if (known.includes("AS")) badges.push({ code: "AS", label: "All-Star", description: "All-Star selection", win: false });
  if (championships?.seasons.includes(season)) badges.unshift({ code: "TITLE", label: "NBA Champ", description: "NBA championship, from admitted playoff box scores", win: true });
  // Award wins first, then team selections, All-Star and voting finishes. The source order
  // breaks ties; gold denotes an earned award, never a winning side of the comparison.
  const priority = (badge: SeasonHonorBadge) => badge.win ? 0 : /^(NBA|DEF|ALLR)/.test(badge.code) ? 1 : badge.code === "AS" ? 2 : 3;
  badges.sort((a, b) => priority(a) - priority(b));
  return { season, badges: codes || badges.length ? badges : null };
}

/**
 * ``season`` and ``beforeDate`` are one value for both players, or a pair when each player is
 * compared in their own season (alignment row 3, 38).
 */
export function accoladeGroups(bios: [PlayerBio | null, PlayerBio | null], championships: [ComparisonChampionships | null | undefined, ComparisonChampionships | null | undefined], seasons: string | [string, string], beforeDates: string | [string, string]): AccoladeGroups {
  const [seasonOfA, seasonOfB] = typeof seasons === "string" ? [seasons, seasons] : seasons;
  const [cutA, cutB] = typeof beforeDates === "string" ? [beforeDates, beforeDates] : beforeDates;
  const codesA = seasonCodes(bios[0], cutA), codesB = seasonCodes(bios[1], cutB);
  const career = [
    countRow("titles", "Titles", "NBA championships, from admitted playoff box scores", titles(championships[0]), titles(championships[1])),
    countRow("mvp", "MVP", "Most Valuable Player awards", count(codesA, code => code === "MVP-1"), count(codesB, code => code === "MVP-1")),
    countRow("dpoy", "DPOY", "Defensive Player of the Year awards", count(codesA, code => code === "DPOY-1"), count(codesB, code => code === "DPOY-1")),
    countRow("all_nba", "All-NBA", "All-NBA team selections", count(codesA, code => /^NBA[123]$/.test(code)), count(codesB, code => /^NBA[123]$/.test(code))),
    countRow("all_def", "All-Def", "All-Defensive team selections", count(codesA, code => /^DEF[12]$/.test(code)), count(codesB, code => /^DEF[12]$/.test(code))),
    countRow("all_star", "All-Star", "All-Star selections", count(codesA, code => code === "AS"), count(codesB, code => code === "AS"))
  ];
  // Like Stathead, honours neither player holds are left out; an unknown side keeps its row.
  const held = career.filter(row => !(row.a === 0 && row.b === 0));
  return { career: (codesA || codesB || championships.some(Boolean)) ? held : [], season: [seasonHonors(seasonOfA, codesA, championships[0]), seasonHonors(seasonOfB, codesB, championships[1])] };
}
