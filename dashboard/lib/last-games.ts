import type { PlayerGameLogItem } from "./types";

/** Last X Games (alignment row 6): box-score window math, all from summed makes and attempts. */

export type Exposure = "per_game" | "per_36";
export type StatGroup = "Counting" | "Scoring" | "Other";
type Field = "pts" | "ast" | "reb" | "oreb" | "dreb" | "stl" | "blk" | "tov" | "pf" | "fgm" | "fga" | "fg3m" | "fg3a" | "ftm" | "fta" | "min" | "pm";

const SOURCE: Record<Exclude<Field, "min">, string> = {
  pts: "points", ast: "assists", reb: "rebounds_total", oreb: "rebounds_offensive", dreb: "rebounds_defensive",
  stl: "steals", blk: "blocks", tov: "turnovers", pf: "fouls_personal", fgm: "field_goals_made",
  fga: "field_goals_attempted", fg3m: "three_pointers_made", fg3a: "three_pointers_attempted",
  ftm: "free_throws_made", fta: "free_throws_attempted", pm: "plus_minus",
};

/** Per field: the sum over games where it is known, how many games, and their minutes. */
export type Totals = Record<Field, { sum: number; n: number; min: number }>;

function fieldValue(game: PlayerGameLogItem, field: Field): number | null {
  if (field === "min") return game.minutes;
  const value = field === "pts" ? game.points ?? game.stats?.points : game.stats?.[SOURCE[field]];
  return typeof value === "number" ? value : null;
}

/** Unknown fields are left out of their own sums; they never count as zero. */
export function totals(games: PlayerGameLogItem[]): Totals {
  const out = Object.fromEntries((["min", ...Object.keys(SOURCE)] as Field[]).map(f => [f, { sum: 0, n: 0, min: 0 }])) as Totals;
  for (const game of games) {
    for (const field of Object.keys(out) as Field[]) {
      const value = fieldValue(game, field);
      if (value === null) continue;
      out[field].sum += value; out[field].n += 1; out[field].min += game.minutes ?? 0;
    }
  }
  return out;
}

const ratio = (top: number, bottom: number) => bottom > 0 ? top / bottom : null;

function counting(t: Totals, field: Field, mode: Exposure): number | null {
  const { sum, n, min } = t[field];
  if (!n) return null;
  return mode === "per_36" ? (min > 0 ? sum / min * 36 : null) : sum / n;
}

export interface LastGamesStat {
  key: string;
  label: string;
  group: StatGroup;
  title: string;
  kind: "count" | "pct" | "minutes";
  /** Lower is better (turnovers, fouls): a rise reads blue. */
  lowerBetter?: boolean;
  value: (t: Totals, mode: Exposure) => number | null;
}

const count = (key: string, label: string, field: Field, title: string, lowerBetter = false): LastGamesStat =>
  ({ key, label, group: "Counting", title, kind: "count", lowerBetter, value: (t, mode) => counting(t, field, mode) });

export const LAST_GAMES_STATS: LastGamesStat[] = [
  count("pts", "PTS", "pts", "Points"),
  count("ast", "AST", "ast", "Assists"),
  count("reb", "REB", "reb", "Total rebounds"),
  count("oreb", "OREB", "oreb", "Offensive rebounds"),
  count("dreb", "DREB", "dreb", "Defensive rebounds"),
  count("tov", "TOV", "tov", "Turnovers", true),
  count("stl", "STL", "stl", "Steals"),
  count("blk", "BLK", "blk", "Blocks"),
  count("pf", "PF", "pf", "Personal fouls", true),
  { key: "ts", label: "TS%", group: "Scoring", kind: "pct", title: "True shooting: points ÷ (2 × (FGA + 0.44 × FTA)), from summed totals",
    value: t => ratio(t.pts.sum, 2 * (t.fga.sum + 0.44 * t.fta.sum)) },
  { key: "fg", label: "FG%", group: "Scoring", kind: "pct", title: "Field-goal percentage: FGM ÷ FGA", value: t => ratio(t.fgm.sum, t.fga.sum) },
  { key: "2p", label: "2P%", group: "Scoring", kind: "pct", title: "Two-point percentage: (FGM − 3PM) ÷ (FGA − 3PA)",
    value: t => ratio(t.fgm.sum - t.fg3m.sum, t.fga.sum - t.fg3a.sum) },
  { key: "3p", label: "3P%", group: "Scoring", kind: "pct", title: "Three-point percentage: 3PM ÷ 3PA", value: t => ratio(t.fg3m.sum, t.fg3a.sum) },
  { key: "ft", label: "FT%", group: "Scoring", kind: "pct", title: "Free-throw percentage: FTM ÷ FTA", value: t => ratio(t.ftm.sum, t.fta.sum) },
  { key: "fta", label: "FTA", group: "Scoring", kind: "count", title: "Free-throw attempts", value: (t, mode) => counting(t, "fta", mode) },
  { key: "fga", label: "FGA", group: "Scoring", kind: "count", title: "Field-goal attempts", value: (t, mode) => counting(t, "fga", mode) },
  { key: "fg2a", label: "FG2A", group: "Scoring", kind: "count", title: "Two-point attempts: FGA − 3PA",
    value: (t, mode) => { const fga = counting(t, "fga", mode), fg3a = counting(t, "fg3a", mode); return fga === null || fg3a === null ? null : fga - fg3a; } },
  { key: "fg3a", label: "FG3A", group: "Scoring", kind: "count", title: "Three-point attempts", value: (t, mode) => counting(t, "fg3a", mode) },
  { key: "ftr", label: "FTR", group: "Scoring", kind: "pct", title: "Free-throw rate: FTA ÷ FGA", value: t => ratio(t.fta.sum, t.fga.sum) },
  { key: "mpg", label: "MPG", group: "Other", kind: "minutes", title: "Minutes per game", value: t => t.min.n ? t.min.sum / t.min.n : null },
  { key: "pm", label: "+/-", group: "Other", kind: "count", title: "Plus-minus: team points scored minus allowed while on the floor, from accepted play-by-play stints (2023-24 on); unknown elsewhere",
    value: (t, mode) => counting(t, "pm", mode) },
];

/** Databallr's sixteen, in its order. */
export const DEFAULT_LAST_GAMES_STATS = ["pts", "ast", "reb", "ts", "2p", "3p", "ft", "fta", "tov", "stl", "blk", "mpg", "pm", "fg2a", "fg3a", "ftr"];

/** Chosen stats in catalog order, so each group is one run of columns. */
export function chosenStats(param: string | null): LastGamesStat[] {
  const keys = (param ?? "").split(",").filter(key => LAST_GAMES_STATS.some(s => s.key === key));
  const chosen = keys.length ? keys : DEFAULT_LAST_GAMES_STATS;
  return LAST_GAMES_STATS.filter(s => chosen.includes(s.key));
}

/** Played games only, oldest first. A missing row stays missing; it is not a zero game. */
export function playedChronological(games: PlayerGameLogItem[]): PlayerGameLogItem[] {
  return games.filter(g => g.appearance === "appeared")
    .sort((a, b) => a.game_date.localeCompare(b.game_date) || a.game_id.localeCompare(b.game_id));
}

export function clampWindow(n: number, played: number): number {
  return Math.max(1, Math.min(Math.round(n) || 1, Math.max(1, played - 1)));
}

/** The last `n` games against every game before them. */
export function splitWindow(games: PlayerGameLogItem[], n: number) {
  const size = clampWindow(n, games.length);
  return { first: games.slice(0, Math.max(0, games.length - size)), last: games.slice(-size) };
}

/** Each point averages the games up to it, at most `size`; early points use what has been played. */
export function rolling(games: PlayerGameLogItem[], stat: LastGamesStat, size: number, mode: Exposure): (number | null)[] {
  return games.map((_, index) => stat.value(totals(games.slice(Math.max(0, index - size + 1), index + 1)), mode));
}

const trim = (text: string) => text.replace(/\.0$/, "");

export function formatStat(stat: LastGamesStat, value: number | null, single = false): string {
  if (value === null || !Number.isFinite(value)) return "—";
  if (stat.kind === "pct") return `${(value * 100).toFixed(1)}%`;
  if (single && stat.kind === "minutes") return String(Math.round(value));
  return trim(value.toFixed(1));
}

/** A change too small to show at the page's precision (0.1, or 0.1 points of a percentage). */
const shownAsZero = (stat: LastGamesStat, change: number) => Math.abs(change) < (stat.kind === "pct" ? 0.0005 : 0.05);

export function formatChange(stat: LastGamesStat, change: number): string {
  const sign = change < 0 && !shownAsZero(stat, change) ? "-" : "+";
  const size = shownAsZero(stat, change) ? 0 : Math.abs(change);
  return stat.kind === "pct" ? `${sign}${(size * 100).toFixed(1)}%` : `${sign}${trim(size.toFixed(1))}`;
}

/** Gold when the window is better, blue when worse; a flat or unknown change has no tone. */
export function changeTone(stat: LastGamesStat, change: number | null): "up" | "down" | null {
  if (change === null || shownAsZero(stat, change)) return null;
  return (change > 0) !== Boolean(stat.lowerBetter) ? "up" : "down";
}

export function phaseLabel(phase: string): string {
  return phase === "all" ? "RS + PO" : phase === "playoffs" ? "Playoffs" : "Regular Season";
}

export function gamesCsv(name: string, games: PlayerGameLogItem[], stats: LastGamesStat[], mode: Exposure): string {
  const head = ["player", "date", "season", "phase", "team", "opponent", "side", ...stats.map(s => s.label)];
  const rows = games.map(g => {
    const t = totals([g]);
    return [name, g.game_date, g.season, g.phase, g.team_tricode, g.opponent_tricode, g.side ?? "", ...stats.map(s => { const v = s.value(t, mode); return v === null ? "" : String(Number(v.toFixed(4))); })];
  });
  return [head, ...rows].map(row => row.map(cell => /[",\n]/.test(cell) ? `"${cell.replace(/"/g, '""')}"` : cell).join(",")).join("\n");
}

/* ---- Follow-up 24: is the window unusual for him? ---- */

/** Fewer full stretches than this and the window is not judged. */
export const MIN_STRETCHES = 10;

export type Verdict = { kind: "low" | "high" | "lower" | "higher" | "normal"; text: string; unusual: boolean; extreme: boolean };

/**
 * Ranks the last `n` games against every n-game stretch of the season (consecutive played games,
 * the window itself included). Outside the middle 80% is unusual; the season's lowest or highest
 * stretch is an extreme. Null when the value is unknown or there are too few stretches.
 */
export function stretchVerdict(games: PlayerGameLogItem[], stat: LastGamesStat, n: number, mode: Exposure): Verdict | null {
  const count = games.length - n + 1;
  if (n < 1 || count < MIN_STRETCHES) return null;
  const values: number[] = [];
  for (let start = 0; start < count; start++) {
    const value = stat.value(totals(games.slice(start, start + n)), mode);
    if (value !== null && Number.isFinite(value)) values.push(value);
  }
  const current = stat.value(totals(games.slice(-n)), mode);
  if (current === null || values.length < MIN_STRETCHES) return null;
  const below = values.filter(v => v < current - 1e-9).length, above = values.filter(v => v > current + 1e-9).length;
  const scope = `${n}-game ${stat.label}`;
  if (below === 0 && above > 0) return { kind: "low", text: `Lowest ${scope} of the season (${stat.lowerBetter ? "best" : "worst"})`, unusual: true, extreme: true };
  if (above === 0 && below > 0) return { kind: "high", text: `Highest ${scope} of the season (${stat.lowerBetter ? "worst" : "best"})`, unusual: true, extreme: true };
  const share = (below + (values.length - below - above) / 2) / values.length;
  if (share < 0.1) return { kind: "lower", text: `Lower than ${Math.round((1 - share) * 100)}% of his ${scope} stretches this season`, unusual: true, extreme: false };
  if (share > 0.9) return { kind: "higher", text: `Higher than ${Math.round(share * 100)}% of his ${scope} stretches this season`, unusual: true, extreme: false };
  return { kind: "normal", text: `Within his normal range: the middle 80% of his ${scope} stretches this season`, unusual: false, extreme: false };
}

/* ---- Follow-up 27: "Since…" anchors, from facts in the log only ---- */

export type SinceAnchor = { date: string; label: string; kind: "team" | "playoffs" | "gap" };
/** A gap this long between games is named by its length, never as an injury. */
export const GAP_DAYS = 10;

const days = (a: string, b: string) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);

/** Team changes, the first playoff game and long gaps, newest first; the first game never is one. */
export function sinceAnchors(games: PlayerGameLogItem[]): SinceAnchor[] {
  const out: SinceAnchor[] = [];
  games.forEach((game, i) => {
    if (i === 0) return;
    const before = games[i - 1];
    // One anchor per date: a team change says more than the gap around it.
    if (game.team_id !== before.team_id) out.push({ date: game.game_date, kind: "team", label: `Since joining ${game.team_tricode}` });
    else if (game.phase === "playoffs" && before.phase !== "playoffs") out.push({ date: game.game_date, kind: "playoffs", label: "Since the playoffs began" });
    else if (game.phase === before.phase && days(before.game_date, game.game_date) >= GAP_DAYS)
      out.push({ date: game.game_date, kind: "gap", label: `Since a ${days(before.game_date, game.game_date)}-day gap` });
  });
  return out.reverse();
}

/** Games on or after `date`. */
export function gamesSince(games: PlayerGameLogItem[], date: string): number {
  return games.filter(g => g.game_date >= date).length;
}

/* ---- Follow-ups 25 and 28: game context and opponent defence ---- */

export type GameContext = { result: "W" | "L" | null; teamPoints: number | null; opponentPoints: number | null; side: "home" | "away" | null; restDays: number | null; backToBack: boolean };
export type OpponentDefence = { rating: number; rank: number };

/** Average opponent defensive rank and rating over games whose opponent is known, and the record. */
export function contextSummary(games: PlayerGameLogItem[], context: Record<string, GameContext>, defence: (game: PlayerGameLogItem) => OpponentDefence | null) {
  const ranks = games.map(defence).filter((d): d is OpponentDefence => d !== null);
  const results = games.map(g => context[g.game_id]?.result).filter((r): r is "W" | "L" => r === "W" || r === "L");
  return {
    rank: ranks.length ? ranks.reduce((n, d) => n + d.rank, 0) / ranks.length : null,
    rating: ranks.length ? ranks.reduce((n, d) => n + d.rating, 0) / ranks.length : null,
    known: ranks.length,
    wins: results.filter(r => r === "W").length,
    losses: results.filter(r => r === "L").length,
    b2b: games.filter(g => context[g.game_id]?.backToBack).length,
  };
}
