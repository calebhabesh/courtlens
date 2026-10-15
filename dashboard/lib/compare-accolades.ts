import type { ComparisonChampionships, PlayerBio } from "./types";

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
  /** Text shown for each side; counts print as numbers, season honours as words. */
  shown: [string, string];
  /** Which side leads, by the row's own order; null for ties, unknowns and absent honours. */
  leader: "a" | "b" | null;
}

export interface AccoladeGroups {
  career: AccoladeRow[];
  season: AccoladeRow[];
  /** The compared season's honours were not yet announced at the cutoff. */
  seasonPending: boolean;
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

const ORDINAL = ["", "1st", "2nd", "3rd"];
function ordinal(place: number) { return ORDINAL[place] ?? `${place}th`; }

/** One season-honour row: the best place each player reached for codes matching ``prefix``. */
function placeRow(key: string, label: string, title: string, seasonA: string[] | null, seasonB: string[] | null, place: (code: string) => number | null, word: (place: number) => string): AccoladeRow | null {
  const best = (codes: string[] | null) => {
    if (codes == null) return undefined;
    const places = codes.map(place).filter((value): value is number => value != null);
    return places.length ? Math.min(...places) : null;
  };
  const a = best(seasonA), b = best(seasonB);
  if (a == null && b == null) return null;
  const shown = (value: number | null | undefined) => value === undefined ? "—" : value === null ? "—" : word(value);
  // Placed beats unplaced; between places the lower one leads.
  const leader = a === undefined || b === undefined ? null : a === null ? (b === null ? null : "b") : b === null ? "a" : leaderOf(a, b, "low");
  return { key, label, title, a: a ?? null, b: b ?? null, shown: [shown(a), shown(b)], leader };
}

export function accoladeGroups(bios: [PlayerBio | null, PlayerBio | null], championships: [ComparisonChampionships | null | undefined, ComparisonChampionships | null | undefined], season: string, beforeDate: string): AccoladeGroups {
  const [codesA, codesB] = bios.map(bio => seasonCodes(bio, beforeDate));
  const vote = (award: string) => (code: string) => { const match = code.match(new RegExp(`^${award}-(\\d+)$`)); return match ? Number(match[1]) : null; };
  const career = [
    countRow("titles", "Titles", "NBA championships, from admitted playoff box scores", titles(championships[0]), titles(championships[1])),
    countRow("mvp", "MVP", "Most Valuable Player awards", count(codesA, code => code === "MVP-1"), count(codesB, code => code === "MVP-1")),
    countRow("dpoy", "DPOY", "Defensive Player of the Year awards", count(codesA, code => code === "DPOY-1"), count(codesB, code => code === "DPOY-1")),
    countRow("all_nba", "All-NBA", "All-NBA team selections", count(codesA, code => /^NBA[123]$/.test(code)), count(codesB, code => /^NBA[123]$/.test(code))),
    countRow("all_def", "All-Def", "All-Defensive team selections", count(codesA, code => /^DEF[12]$/.test(code)), count(codesB, code => /^DEF[12]$/.test(code))),
    countRow("all_star", "All-Star", "All-Star selections", count(codesA, code => code === "AS"), count(codesB, code => code === "AS"))
  ];
  const seasonA = codesA ? codesA.get(season) ?? [] : null, seasonB = codesB ? codesB.get(season) ?? [] : null;
  const seasonRows = [
    placeRow("season_mvp", "MVP Vote", `${season} MVP voting finish`, seasonA, seasonB, vote("MVP"), place => place === 1 ? "Won" : ordinal(place)),
    placeRow("season_dpoy", "DPOY Vote", `${season} DPOY voting finish`, seasonA, seasonB, vote("DPOY"), place => place === 1 ? "Won" : ordinal(place)),
    placeRow("season_all_nba", "All-NBA", `${season} All-NBA team`, seasonA, seasonB, code => code.match(/^NBA([123])$/) ? Number(code[3]) : null, place => `${ordinal(place)} Team`),
    placeRow("season_all_def", "All-Def", `${season} All-Defensive team`, seasonA, seasonB, code => code.match(/^DEF([12])$/) ? Number(code[3]) : null, place => `${ordinal(place)} Team`),
    placeRow("season_all_star", "All-Star", `${season} All-Star selection`, seasonA, seasonB, code => code === "AS" ? 1 : null, () => "Selected")
  ].filter((row): row is AccoladeRow => row != null);
  const seasonPending = !announcedBefore(season, "MVP-1", beforeDate);
  // Like Stathead, honours neither player holds are left out; an unknown side keeps its row.
  const held = career.filter(row => !(row.a === 0 && row.b === 0));
  return { career: (codesA || codesB || championships.some(Boolean)) ? held : [], season: seasonRows, seasonPending };
}
