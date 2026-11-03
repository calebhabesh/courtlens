import type { PlayoffRoundResponse, PlayoffSeriesSummary } from "./types";

/**
 * The mirrored bracket (alignment row 8): each conference's rounds as columns, outermost first,
 * each column twice as many slots as the next, with the Finals between the two sides.
 *
 * A slot is a played series, a future series not yet set ("tbd"), or nothing because the team
 * above it had a bye ("bye"). Seasons that do not fit two conference trees (division playoffs with
 * a third group, league-wide rounds before the Finals) return null and keep the round columns.
 */
export type BracketSlot =
  | { kind: "series"; series: PlayoffSeriesSummary }
  | { kind: "tbd" }
  | { kind: "bye" };

export interface BracketSide {
  conference: "Western" | "Eastern";
  /** Outermost round first; column i has 2^(columns - 1 - i) slots. */
  columns: BracketSlot[][];
  roundNames: string[];
}

export interface BracketLayout {
  west: BracketSide;
  east: BracketSide;
  finals: PlayoffSeriesSummary | null;
  finalsName: string;
  /** Round 0 series (tiebreakers), listed beside the bracket. */
  extras: PlayoffSeriesSummary[];
}

const SIDES = ["Western", "Eastern"] as const;

/** Top seeds in standard bracket order: 1 meets the 4/5 winner, 2 the 3/6 winner. */
export function seedOrder(series: number): number[] {
  let order = [1];
  while (order.length < series) {
    const size = order.length * 2;
    order = order.flatMap(seed => [seed, size + 1 - seed]);
  }
  return order;
}

function topSeed(series: PlayoffSeriesSummary): number {
  return Math.min(series.team1.seed ?? 99, series.team2.seed ?? 99);
}

function teams(series: PlayoffSeriesSummary): string[] {
  return [series.team1.team_id, series.team2.team_id];
}

function feeder(round: PlayoffSeriesSummary[], team: string): PlayoffSeriesSummary | undefined {
  return round.find(series => teams(series).includes(team));
}

function buildSide(conference: "Western" | "Eastern", rounds: { number: number; name: string; series: PlayoffSeriesSummary[] }[]): BracketSide | null {
  const depth = rounds.length;
  const columns: BracketSlot[][] = rounds.map((_, index) => Array.from({ length: 2 ** (depth - 1 - index) }, () => ({ kind: "tbd" }) as BracketSlot));
  const placed = new Set<string>();
  const place = (column: number, index: number, series: PlayoffSeriesSummary) => {
    columns[column][index] = { kind: "series", series };
    placed.add(series.series_id);
  };

  const top = rounds[depth - 1].series;
  if (top.length > 1) return null;
  if (top[0]) place(depth - 1, 0, top[0]);

  for (let column = depth - 2; column >= 0; column -= 1) {
    const round = rounds[column].series;
    // Below a played series, each team's previous series sits on its side; none means a bye.
    columns[column + 1].forEach((parent, index) => {
      if (parent.kind !== "series") return;
      // The higher seed's path sits on top, as brackets are drawn.
      const sides = [parent.series.team1, parent.series.team2].map(team => ({ team: team.team_id, found: feeder(round, team.team_id), seed: team.seed ?? 99 }))
        .sort((a, b) => (a.found ? topSeed(a.found) : a.seed) - (b.found ? topSeed(b.found) : b.seed));
      sides.forEach(({ found }, offset) => {
        if (found && !placed.has(found.series_id)) place(column, index * 2 + offset, found);
        else if (!found) columns[column][index * 2 + offset] = { kind: "bye" };
      });
    });
    // Series whose next round is not set yet fill the open pairs in seed order.
    const open = columns[column].flatMap((slot, index) => (slot.kind === "tbd" && columns[column + 1][index >> 1].kind !== "series" ? [index] : []));
    const waiting = round.filter(series => !placed.has(series.series_id));
    const ranked = [...waiting].sort((a, b) => topSeed(a) - topSeed(b) || a.matchup_index - b.matchup_index);
    const order = seedOrder(columns[column].length);
    const bySlot = order.map(seed => ranked.find(series => topSeed(series) === seed)).filter((series): series is PlayoffSeriesSummary => Boolean(series));
    const sequence = bySlot.length === ranked.length ? bySlot : [...waiting].sort((a, b) => a.matchup_index - b.matchup_index);
    if (sequence.length > open.length) return null;
    sequence.forEach((series, index) => place(column, open[index], series));
  }

  const all = rounds.flatMap(round => round.series);
  if (all.some(series => !placed.has(series.series_id))) return null;
  return { conference, columns, roundNames: rounds.map(round => round.name) };
}

function roundName(round: PlayoffRoundResponse, conference: "Western" | "Eastern"): string {
  const listed = conference === "Western" ? round.western_series : round.eastern_series;
  const name = listed[0]?.round_name ?? round.round_name;
  return name === "Conference Finals" || name === "Division Finals" ? name : name.replace(/^(Conference|Division) /, "");
}

export function buildBracket(rounds: PlayoffRoundResponse[]): BracketLayout | null {
  const extras = rounds.filter(round => round.round_number === 0).flatMap(round => round.series);
  const played = rounds.filter(round => round.round_number > 0);
  if (!played.some(round => round.series.length)) return null;
  const finalsRound = Math.max(...played.map(round => round.round_number));
  const finalsList = played.find(round => round.round_number === finalsRound)?.series ?? [];
  // Only the Finals may be league-wide, and every other series belongs to East or West.
  if (finalsList.some(series => series.conference !== null) || finalsList.length > 1) return null;
  const inner = played.filter(round => round.round_number < finalsRound);
  if (!inner.length || inner.some(round => round.series.some(series => !SIDES.includes(series.conference as (typeof SIDES)[number])))) return null;

  const sides = SIDES.map(conference => buildSide(conference, inner.map(round => ({
    number: round.round_number,
    name: roundName(round, conference),
    series: conference === "Western" ? round.western_series : round.eastern_series
  }))));
  if (!sides[0] || !sides[1]) return null;
  const finals = finalsList[0] ?? null;
  return {
    west: sides[0],
    east: sides[1],
    finals,
    finalsName: finals?.round_name ?? "NBA Finals",
    extras
  };
}

/** "OKC 3–1" from the regular-season meetings, or null when the teams never met. */
export function seasonSeriesLabel(series: Pick<PlayoffSeriesSummary, "team1" | "team2">): string | null {
  const one = series.team1.season_series_wins;
  const two = series.team2.season_series_wins;
  if (one == null || two == null) return null;
  if (one === two) return `Split ${one}–${two}`;
  return one > two ? `${series.team1.tricode} ${one}–${two}` : `${series.team2.tricode} ${two}–${one}`;
}

export function recordLabel(team: { record_wins?: number | null; record_losses?: number | null }): string | null {
  return team.record_wins != null && team.record_losses != null ? `${team.record_wins}–${team.record_losses}` : null;
}
