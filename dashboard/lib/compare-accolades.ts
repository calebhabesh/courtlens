import type { ComparisonChampionships, PlayerBio } from "./types";
import { seasonAwardChips } from "./awards";
import type { PillStrength } from "./comparison-metrics";

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

/**
 * Completed regular seasons: season -> the exclusive cutoff that covers all of it. A season is
 * complete only once the catalog has its play-in or playoffs, so one in progress never is.
 */
export type SeasonEnds = Record<string, string>;

export function completedSeasons(scopes: { season: string; phase: string; default_before_date: string }[] | undefined): SeasonEnds {
  const ends: SeasonEnds = {};
  for (const scope of scopes ?? []) {
    if (scope.phase !== "regular_season") continue;
    if (scopes!.some(entry => entry.season === scope.season && (entry.phase === "playoffs" || entry.phase === "play_in"))) ends[scope.season] = scope.default_before_date;
  }
  return ends;
}

/**
 * True when the season's honours of this kind count at the cutoff: announced strictly before
 * it, or (alignment row 3, 75) the cutoff covers that season's whole regular season. Awards
 * describe the regular season, so a comparison of a finished season shows them although they
 * were announced after its last game; a cutoff inside the season still never does.
 */
export function announcedBefore(season: string, code: string, beforeDate: string, ends?: SeasonEnds) {
  const end = ends?.[season];
  if (end && beforeDate >= end) return true;
  return `${endYear(season)}${code === "AS" ? ALL_STAR_KNOWN : AWARDS_KNOWN}` < beforeDate;
}

function seasonCodes(bio: PlayerBio | null, beforeDate: string, ends?: SeasonEnds): Map<string, string[]> | null {
  const awards = bio?.reference?.awards;
  if (!awards) return null;
  return new Map(Object.entries(awards).map(([season, codes]) => [season, codes.filter(code => announcedBefore(season, code, beforeDate, ends))]));
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

/** The career accolade rows, in card order; each counts one player's codes (or titles). */
export const ACCOLADE_KINDS: { key: string; label: string; title: string; test?: (code: string) => boolean }[] = [
  { key: "titles", label: "Titles", title: "NBA championships, from admitted playoff box scores" },
  { key: "mvp", label: "MVP", title: "Most Valuable Player awards", test: code => code === "MVP-1" },
  { key: "dpoy", label: "DPOY", title: "Defensive Player of the Year awards", test: code => code === "DPOY-1" },
  { key: "all_nba", label: "All-NBA", title: "All-NBA team selections", test: code => /^NBA[123]$/.test(code) },
  { key: "all_def", label: "All-Def", title: "All-Defensive team selections", test: code => /^DEF[12]$/.test(code) },
  { key: "all_star", label: "All-Star", title: "All-Star selections", test: code => code === "AS" }
];

export interface PlayerAccolades {
  /** Count per ``ACCOLADE_KINDS`` key through the cutoff; null is unknown, never zero. */
  counts: Record<string, number | null>;
  /** True when any source (awards or titles) is known for this player. */
  known: boolean;
  honors: SeasonHonors;
}

/** One player's accolades through the cutoff and their compared season's honors (row 3, 64). */
export function playerAccolades(bio: PlayerBio | null, championships: ComparisonChampionships | null | undefined, season: string, beforeDate: string, ends?: SeasonEnds): PlayerAccolades {
  const codes = seasonCodes(bio, beforeDate, ends);
  const counts = Object.fromEntries(ACCOLADE_KINDS.map(kind => [kind.key, kind.test ? count(codes, kind.test) : titles(championships)]));
  return { counts, known: codes != null || championships != null, honors: seasonHonors(season, codes, championships) };
}

/**
 * ``season`` and ``beforeDate`` are one value for both players, or a pair when each player is
 * compared in their own season (alignment row 3, 38).
 */
export function accoladeGroups(bios: [PlayerBio | null, PlayerBio | null], championships: [ComparisonChampionships | null | undefined, ComparisonChampionships | null | undefined], seasons: string | [string, string], beforeDates: string | [string, string], ends?: SeasonEnds): AccoladeGroups {
  const [seasonOfA, seasonOfB] = typeof seasons === "string" ? [seasons, seasons] : seasons;
  const [cutA, cutB] = typeof beforeDates === "string" ? [beforeDates, beforeDates] : beforeDates;
  const a = playerAccolades(bios[0], championships[0], seasonOfA, cutA, ends), b = playerAccolades(bios[1], championships[1], seasonOfB, cutB, ends);
  const career = ACCOLADE_KINDS.map(kind => countRow(kind.key, kind.label, kind.title, a.counts[kind.key], b.counts[kind.key]));
  // Like Stathead, honours neither player holds are left out; an unknown side keeps its row.
  const held = career.filter(row => !(row.a === 0 && row.b === 0));
  return { career: a.known || b.known ? held : [], season: [a.honors, b.honors] };
}

/**
 * One player's result in an honour category: "Winner", "4th", "1st Team", "Selected". ``rank``
 * orders results within the category, lower is better: a win, title, All-Star or 1st Team is 1,
 * a vote finish its place, a 2nd Team 2.
 */
export type HonorCell = { text: string; description: string; win: boolean; star: boolean; rank: number };

/** One honour category across every compared player, for a row-per-award section (76). */
export type HonorRow = { key: string; label: string; cells: (HonorCell | null)[] };

const HONOR_ORDER = ["TITLE", "MVP", "DPOY", "ROY", "6MOY", "MIP", "CPOY", "NBA", "DEF", "AS"];
const HONOR_LABELS: Record<string, string> = { TITLE: "Title", MVP: "MVP", DPOY: "DPOY", ROY: "Rookie", "6MOY": "6th Man", MIP: "MIP", CPOY: "Clutch", NBA: "All-NBA", DEF: "All-Def", AS: "All-Star" };

/** A badge's category and its short result, so each award reads on its own row. */
function honorCategory(badge: SeasonHonorBadge): { key: string; cell: HonorCell } {
  const team = badge.code.match(/^(NBA|DEF)([123])$/);
  if (team) return { key: team[1], cell: { text: `${["", "1st", "2nd", "3rd"][Number(team[2])]} Team`, description: badge.description, win: false, star: false, rank: Number(team[2]) } };
  if (badge.code === "TITLE") return { key: "TITLE", cell: { text: "Champion", description: badge.description, win: true, star: false, rank: 1 } };
  if (badge.code === "AS") return { key: "AS", cell: { text: "Selected", description: badge.description, win: false, star: true, rank: 1 } };
  const vote = badge.code.match(/^([A-Z0-9]+)-([1-9]\d*)$/);
  if (vote) {
    const key = vote[1] === "SMOY" ? "6MOY" : vote[1];
    // "MVP Winner" / "MVP 4th": the category is the row label, the result is the cell.
    return { key, cell: { text: badge.win ? "Winner" : badge.label.split(" ").at(-1) ?? badge.label, description: badge.description, win: badge.win, star: false, rank: Number(vote[2]) } };
  }
  return { key: badge.code, cell: { text: badge.label, description: badge.description, win: badge.win, star: false, rank: 1 } };
}

/**
 * Season honours as rows (alignment row 3, 76): one row per category any player holds, in a
 * fixed order (titles and major awards first), each player's result in their own column.
 * A player whose honours are unknown has no cells, never an empty record.
 */
export function honorRows(honors: SeasonHonors[]): HonorRow[] {
  const rows = new Map<string, HonorRow>();
  honors.forEach((entry, index) => {
    for (const badge of entry.badges ?? []) {
      const { key, cell } = honorCategory(badge);
      const row = rows.get(key) ?? { key, label: HONOR_LABELS[key] ?? key, cells: honors.map(() => null) };
      row.cells[index] = cell;
      rows.set(key, row);
    }
  });
  const rank = (key: string) => { const at = HONOR_ORDER.indexOf(key); return at < 0 ? HONOR_ORDER.length : at; };
  return [...rows.values()].sort((a, b) => rank(a.key) - rank(b.key));
}

/**
 * Who holds the better result in an honour row (alignment row 3, 80), and how decisively, in
 * the stat pills' three tiers: one place apart is slight, two or three clear, more is large.
 * Against no honour at all the result itself decides: a win or 1st Team is large, a top-five
 * vote or 2nd/3rd Team clear, a lower vote slight. Ties have no leader; this describes one row,
 * never an overall verdict.
 */
export function honorLead(cells: (HonorCell | null)[]): { leaders: number[]; strength: PillStrength } | null {
  const ranks = cells.map(cell => cell?.rank ?? Infinity);
  const best = Math.min(...ranks);
  const leaders = ranks.flatMap((rank, index) => rank === best ? [index] : []);
  if (!Number.isFinite(best) || leaders.length === cells.length) return null;
  const next = Math.min(...ranks.filter(rank => rank !== best));
  const strength: PillStrength = Number.isFinite(next)
    ? next - best <= 1 ? 1 : next - best <= 3 ? 2 : 3
    : best === 1 ? 3 : best <= 5 ? 2 : 1;
  return { leaders, strength };
}

/** Selections several players can hold at once; the team (or selection) itself is the result. */
const SHARED_HONORS = new Set(["AS", "NBA", "DEF"]);

/**
 * How each player's result in an honour row is coloured (owner, 2026-10-17), as stat-pill tiers
 * in that player's colour, or null for plain:
 * - Winning outright (an award, a title) is absolute: the winner is solid, whatever the others did.
 * - Shared selections colour everyone selected, by the result itself: All-Star and a 1st Team are
 *   solid, a 2nd Team the stronger tint, a 3rd Team the faint one.
 * - Otherwise (vote finishes, nobody won) the better finish leads, as honorLead measures it, at
 *   most the stronger tint: solid is kept for results that were won.
 * ``tied`` is a row where everyone holds the same uncoloured result: shown as held equally.
 */
export function honorMarks(key: string, cells: (HonorCell | null)[]): { marks: (PillStrength | null)[]; tied: boolean } {
  let marks: (PillStrength | null)[];
  if (SHARED_HONORS.has(key)) marks = cells.map(cell => cell ? (cell.rank <= 1 ? 3 : cell.rank === 2 ? 2 : 1) : null);
  else if (cells.some(cell => cell?.win)) marks = cells.map(cell => cell?.win ? 3 : null);
  else {
    const lead = honorLead(cells);
    marks = cells.map((_, index) => lead?.leaders.includes(index) ? Math.min(lead.strength, 2) as PillStrength : null);
  }
  return { marks, tied: marks.every(mark => mark === null) && cells.every(Boolean) };
}
