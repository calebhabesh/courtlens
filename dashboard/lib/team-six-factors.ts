import { browserApi } from "./workbench-api";

/**
 * Team six factors (alignment row 4): each side's rating relative to league, split exactly into
 * shooting, turnover and rebound points per 100 (`courtlens-team-six-factors-v1`, see
 * `src/courtlens/domain/team_six_factors.py`). Every term reads "positive is better".
 */
export interface SixFactorRates {
  ts_pct: number | null; tov_per_100: number | null; orb_pct: number | null; ftr: number | null; fg3a_per_100: number | null; fg3_pct: number | null;
  opp_ts_pct: number | null; opp_tov_per_100: number | null; drb_pct: number | null; opp_ftr: number | null; opp_fg3a_per_100: number | null; opp_fg3_pct: number | null;
}
export interface SixFactorTeam {
  team_id: string; tricode: string; name: string; conference?: string | null; division?: string | null; games_played: number; wins: number; losses: number;
  /** Before 1973-74 the source's estimate (points / rating), null without a rating. */
  possessions: number | null; opp_possessions: number | null; points: number; opp_points: number;
  ortg: number | null; drtg: number | null; net: number | null;
  off: number | null; o_ts: number | null; o_tov: number | null; o_orb: number | null;
  def: number | null; d_ts: number | null; d_tov: number | null; d_drb: number | null;
  net_eff: number | null; net_poss: number | null; off_luck: number; def_luck: number; league_rating: number | null;
  rates: SixFactorRates;
  /** Schedule (`courtlens-team-context-v1`): opponents' average solved strength; adj_net = net + sos. */
  sos: number | null; adj_net: number | null;
  /** Pythagorean expected wins (exponent 14) and actual minus expected; close = final margin ≤ 5. */
  /** Null for seasons served as totals (before 1983-84): no game margins. */
  expected_wins: number | null; win_luck: number | null; close_wins: number | null; close_losses: number | null;
  /** Every game in scope, whatever the window or venue; streak is +n wins / −n losses (null without games). */
  standings: { wins: number; losses: number; last10_wins: number | null; last10_losses: number | null; streak: number | null };
  /** Net rating over the latest ten games, after each game from the tenth. */
  trend: { date: string; net: number }[];
  /** Derived in the browser over the teams shown (`withStandings`). */
  seed?: number; games_back?: number;
}
export interface SixFactorsResponse {
  context: Record<string, unknown>;
  teams: SixFactorTeam[];
  league: Record<string, number | null>;
  window: { days: number | null; start: string | null; first_game: string | null; last_game: string | null; games: number; excluded_games: number };
  venue: TeamVenue | null;
  luck: { offense: number; defense: number };
  method_version: string;
  context_method_version: string;
  warnings: string[];
}

export type TeamVenue = "home" | "away";
export async function getTeamSixFactors(p: { season?: string | null; phase?: string | null; beforeDate?: string | null; releaseId?: string | null; windowDays?: number | null; offenseLuck?: number | null; defenseLuck?: number | null; venue?: TeamVenue | null }, signal?: AbortSignal): Promise<SixFactorsResponse> {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(p)) if (value !== null && value !== undefined && value !== "" && value !== 0) query.set(key, String(value));
  const response = await fetch(`${browserApi}/api/workbench/teams/six-factors${query.size ? `?${query}` : ""}`, { cache: "no-store", signal });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(typeof body.detail === "string" ? body.detail : `Request failed (${response.status}).`);
  }
  return response.json();
}

export type TeamView = "overall" | "offense" | "defense" | "standings";
export type TeamCounting = "per_100" | "totals";
export type ColumnFormat = "signed" | "rating" | "pct" | "rate" | "ratio" | "count" | "wins";
export interface TeamColumn {
  key: string;
  label: string;
  title: string;
  /** Higher is better (ranks 1 = best); DRTG and opponent rates rank low-first. */
  higherBetter: boolean;
  format: ColumnFormat;
  /** Signed relative terms are coloured gold above league and blue below. */
  signed?: boolean;
  value: (team: SixFactorTeam, counting: TeamCounting) => number | null;
  /** Text in place of the formatted value (records, streaks); `value` still sorts and ranks. */
  display?: (team: SixFactorTeam) => string;
  /** No #rank under the value: the value is itself a rank or a gap (Seed, GB). */
  unranked?: boolean;
}
export interface TeamColumnGroup { label: string; columns: TeamColumn[] }

/** A per-100 relative term over the side's own possessions, for Totals. */
const scaled = (value: number | null, possessions: number | null, counting: TeamCounting) =>
  value == null ? null : counting === "totals" ? possessions == null ? null : value * possessions / 100 : value;
const sum = (...values: (number | null)[]) => values.some(v => v == null) ? null : values.reduce<number>((total, v) => total + (v as number), 0);
const offTerm = (pick: (t: SixFactorTeam) => number | null) => (t: SixFactorTeam, c: TeamCounting) => scaled(pick(t), t.possessions, c);
const defTerm = (pick: (t: SixFactorTeam) => number | null) => (t: SixFactorTeam, c: TeamCounting) => scaled(pick(t), t.opp_possessions, c);

const ORTG: TeamColumn = { key: "ortg", label: "ORTG", title: "Offensive rating: points scored per 100 possessions (Totals: points scored)", higherBetter: true, format: "rating",
  value: (t, c) => c === "totals" ? t.points : t.ortg };
const DRTG: TeamColumn = { key: "drtg", label: "DRTG", title: "Defensive rating: points allowed per 100 opponent possessions (Totals: points allowed)", higherBetter: false, format: "rating",
  value: (t, c) => c === "totals" ? t.opp_points : t.drtg };
const NET: TeamColumn = { key: "net", label: "Net", title: "Net rating: ORTG minus DRTG, which equals OFF + DEF (Totals: point differential)", higherBetter: true, format: "signed", signed: true,
  value: (t, c) => c === "totals" ? t.points - t.opp_points : t.net };

const OFF: TeamColumn = { key: "off", label: "OFF", title: "Offense against league average: oTS + oTOV + ORB", higherBetter: true, format: "signed", signed: true, value: offTerm(t => t.off) };
const O_TS: TeamColumn = { key: "o_ts", label: "oTS", title: "Points per 100 from shooting efficiency (true shooting) against league average", higherBetter: true, format: "signed", signed: true, value: offTerm(t => t.o_ts) };
const O_TOV: TeamColumn = { key: "o_tov", label: "oTOV", title: "Points per 100 from taking care of the ball: fewer turnovers per possession than league is positive", higherBetter: true, format: "signed", signed: true, value: offTerm(t => t.o_tov) };
const O_ORB: TeamColumn = { key: "o_orb", label: "ORB", title: "Points per 100 from offensive rebounds per possession against league average", higherBetter: true, format: "signed", signed: true, value: offTerm(t => t.o_orb) };
const DEF: TeamColumn = { key: "def", label: "DEF", title: "Defense against league average: dTS + dTOV + DRB", higherBetter: true, format: "signed", signed: true, value: defTerm(t => t.def) };
const D_TS: TeamColumn = { key: "d_ts", label: "dTS", title: "Points per 100 saved by holding opponents' true shooting below league average", higherBetter: true, format: "signed", signed: true, value: defTerm(t => t.d_ts) };
const D_TOV: TeamColumn = { key: "d_tov", label: "dTOV", title: "Points per 100 from forcing more opponent turnovers per possession than league", higherBetter: true, format: "signed", signed: true, value: defTerm(t => t.d_tov) };
const D_DRB: TeamColumn = { key: "d_drb", label: "DRB", title: "Points per 100 from allowing fewer opponent offensive rebounds per possession than league", higherBetter: true, format: "signed", signed: true, value: defTerm(t => t.d_drb) };
const NET_EFF: TeamColumn = { key: "net_eff", label: "NetEff", title: "Shooting on both ends: oTS + dTS", higherBetter: true, format: "signed", signed: true,
  value: (t, c) => sum(scaled(t.o_ts, t.possessions, c), scaled(t.d_ts, t.opp_possessions, c)) };
const NET_POSS: TeamColumn = { key: "net_poss", label: "NetPoss", title: "Possession battle on both ends: oTOV + ORB + dTOV + DRB", higherBetter: true, format: "signed", signed: true,
  value: (t, c) => sum(scaled(t.o_tov, t.possessions, c), scaled(t.o_orb, t.possessions, c), scaled(t.d_tov, t.opp_possessions, c), scaled(t.d_drb, t.opp_possessions, c)) };

const record = (wins: number | null, losses: number | null) => wins == null || losses == null ? "—" : `${wins}–${losses}`;
const winPct = (wins: number | null, losses: number | null) => wins != null && losses != null && wins + losses ? wins / (wins + losses) : null;
const STANDINGS_NOTE = " Every game in scope, whatever the window or venue.";
const SEED: TeamColumn = { key: "seed", label: "Seed", title: `Order by win percentage among the teams shown (league or conference), ties by net rating; not the NBA's tiebreakers.${STANDINGS_NOTE}`,
  higherBetter: false, format: "count", unranked: true, value: t => t.seed ?? null, display: t => t.seed == null ? "—" : String(t.seed) };
const WIN_PCT: TeamColumn = { key: "win_pct", label: "W–L", title: `Record and win percentage.${STANDINGS_NOTE}`, higherBetter: true, format: "ratio",
  value: t => winPct(t.standings.wins, t.standings.losses), display: t => record(t.standings.wins, t.standings.losses) };
const GB: TeamColumn = { key: "games_back", label: "GB", title: `Games behind the leader among the teams shown.${STANDINGS_NOTE}`, higherBetter: false, format: "count", unranked: true,
  value: t => t.games_back ?? null, display: t => t.games_back == null ? "—" : t.games_back === 0 ? "—" : t.games_back.toFixed(1) };
const L10: TeamColumn = { key: "last10", label: "L10", title: `Record over the latest ten games.${STANDINGS_NOTE}`, higherBetter: true, format: "count",
  value: t => t.standings.last10_wins, display: t => record(t.standings.last10_wins, t.standings.last10_losses) };
const STREAK: TeamColumn = { key: "streak", label: "Strk", title: `Current winning or losing streak.${STANDINGS_NOTE}`, higherBetter: true, format: "count", signed: true,
  value: t => t.standings.streak, display: t => t.standings.streak ? `${t.standings.streak > 0 ? "W" : "L"}${Math.abs(t.standings.streak)}` : "—" };
const SOS: TeamColumn = { key: "sos", label: "SOS", title: "Strength of schedule: the average schedule-adjusted net rating of the opponents faced, per 100 (Totals: × possessions / 100)", higherBetter: true, format: "signed", signed: true,
  value: offTerm(t => t.sos) };
const ADJ_NET: TeamColumn = { key: "adj_net", label: "AdjNet", title: "Schedule-adjusted net rating: Net + SOS, solved jointly for every team like Basketball-Reference's SRS, per 100 (Totals: × possessions / 100)", higherBetter: true, format: "signed", signed: true,
  value: offTerm(t => t.adj_net) };
const X_WINS: TeamColumn = { key: "expected_wins", label: "xW", title: "Expected wins from points scored and allowed: games × PF¹⁴ / (PF¹⁴ + PA¹⁴)", higherBetter: true, format: "wins", value: t => t.expected_wins };
const WIN_LUCK: TeamColumn = { key: "win_luck", label: "Luck", title: "Wins above expected: actual wins minus xW. Positive means the record beats the point margin", higherBetter: true, format: "signed", signed: true,
  value: t => t.win_luck };
const CLOSE: TeamColumn = { key: "close", label: "Close", title: "Record in games decided by five points or fewer", higherBetter: true, format: "ratio",
  value: t => winPct(t.close_wins, t.close_losses), display: t => record(t.close_wins, t.close_losses) };

const rate = (key: keyof SixFactorRates, label: string, title: string, format: ColumnFormat, higherBetter: boolean): TeamColumn =>
  ({ key, label, title, format, higherBetter, value: t => t.rates[key] });

export const TEAM_VIEWS: Record<TeamView, TeamColumnGroup[]> = {
  overall: [
    { label: "Ratings", columns: [ORTG, DRTG, NET] },
    { label: "Offense", columns: [OFF, O_TS, O_TOV, O_ORB] },
    { label: "Defense", columns: [DEF, D_TS, D_TOV, D_DRB] },
    { label: "Net", columns: [NET_EFF, NET_POSS] },
  ],
  offense: [
    { label: "Rating", columns: [ORTG] },
    { label: "Offense", columns: [OFF, O_TS, O_TOV, O_ORB] },
    { label: "Rates", columns: [
      rate("ts_pct", "TS%", "True shooting: points / (2 × (FGA + 0.44 FTA))", "pct", true),
      rate("tov_per_100", "TOV", "Turnovers per 100 possessions", "rate", false),
      rate("orb_pct", "ORB%", "Share of available offensive rebounds collected", "pct", true),
      rate("ftr", "FTr", "Free throw rate: FTA / FGA", "ratio", true),
      rate("fg3a_per_100", "3PA", "Three-point attempts per 100 possessions", "rate", true),
      rate("fg3_pct", "3P%", "Three-point percentage", "pct", true),
    ] },
  ],
  defense: [
    { label: "Rating", columns: [DRTG] },
    { label: "Defense", columns: [DEF, D_TS, D_TOV, D_DRB] },
    { label: "Opponent Rates", columns: [
      rate("opp_ts_pct", "TS%", "Opponents' true shooting", "pct", false),
      rate("opp_tov_per_100", "TOV", "Opponent turnovers per 100 opponent possessions", "rate", true),
      rate("drb_pct", "DRB%", "Share of available defensive rebounds collected", "pct", true),
      rate("opp_ftr", "FTr", "Opponents' free throw rate: FTA / FGA", "ratio", false),
      rate("opp_fg3a_per_100", "3PA", "Opponent three-point attempts per 100 opponent possessions", "rate", false),
      rate("opp_fg3_pct", "3P%", "Opponents' three-point percentage", "pct", false),
    ] },
  ],
  standings: [
    { label: "Standings", columns: [SEED, WIN_PCT, GB, L10, STREAK] },
    { label: "Schedule", columns: [NET, SOS, ADJ_NET] },
    { label: "Expected", columns: [X_WINS, WIN_LUCK, CLOSE] },
  ],
};

export const viewColumns = (view: TeamView) => TEAM_VIEWS[view].flatMap(group => group.columns);
/** Every column any view shows, so a sort survives a view change when the column does. */
export const ALL_COLUMNS = [...new Map(Object.values(TEAM_VIEWS).flat().flatMap(group => group.columns).map(column => [column.key, column])).values()];

export function formatValue(value: number | null, format: ColumnFormat, counting: TeamCounting): string {
  if (value == null || !Number.isFinite(value)) return "—";
  if (format === "wins") return value.toFixed(1);
  const digits = counting === "totals" && format !== "pct" && format !== "ratio" && format !== "rate" ? 0 : format === "ratio" ? 3 : 1;
  if (format === "pct") return `${(value * 100).toFixed(1)}%`;
  const text = value.toFixed(digits);
  if (format !== "signed") return text;
  // "-0.0" reads as a sign error; a rounded zero has no sign.
  return Number(text) === 0 ? text.replace("-", "") : value > 0 ? `+${text}` : text;
}

/** League rank of each team for a column, 1 = best; tied values share a rank. */
export function columnRanks(teams: SixFactorTeam[], column: TeamColumn, counting: TeamCounting): Map<string, number> {
  const values = teams.map(team => ({ id: team.team_id, value: column.value(team, counting) })).filter(entry => entry.value != null) as { id: string; value: number }[];
  values.sort((a, b) => column.higherBetter ? b.value - a.value : a.value - b.value);
  const ranks = new Map<string, number>();
  values.forEach((entry, index) => ranks.set(entry.id, index > 0 && entry.value === values[index - 1].value ? ranks.get(values[index - 1].id)! : index + 1));
  return ranks;
}

/** Sorted by a column, unknown values last, then by name. */
export function sortTeams(teams: SixFactorTeam[], column: TeamColumn, direction: "asc" | "desc", counting: TeamCounting): SixFactorTeam[] {
  return [...teams].sort((x, y) => {
    const vx = column.value(x, counting), vy = column.value(y, counting);
    if (vx == null && vy == null) return x.name.localeCompare(y.name);
    if (vx == null) return 1;
    if (vy == null) return -1;
    return (direction === "asc" ? vx - vy : vy - vx) || x.name.localeCompare(y.name);
  });
}

/** Seed and games back among the teams shown: win percentage, then net rating, then name. */
/**
 * The group a team is seeded in: its conference, or before 1970-71 (no conferences) its division,
 * the Eastern and Western Divisions of those seasons. Null when the season names neither.
 */
export function standingGroup(team: Pick<SixFactorTeam, "conference" | "division">): { key: string; label: string; short: string } | null {
  if (team.conference) return { key: team.conference, label: `${team.conference} Conference`, short: team.conference.replace("ern", "") };
  if (team.division) return { key: `division:${team.division}`, label: `${team.division} Division`, short: `${team.division} Division` };
  return null;
}

export function withStandings(teams: SixFactorTeam[]): SixFactorTeam[] {
  const pct = (t: SixFactorTeam) => winPct(t.standings.wins, t.standings.losses) ?? -1;
  const ordered = [...teams].sort((a, b) => pct(b) - pct(a) || (b.net ?? -Infinity) - (a.net ?? -Infinity) || a.name.localeCompare(b.name));
  const leader = ordered[0];
  const seeds = new Map(ordered.map((team, index) => [team.team_id, index + 1]));
  return teams.map(team => ({ ...team, seed: seeds.get(team.team_id),
    games_back: leader ? ((leader.standings.wins - team.standings.wins) + (team.standings.losses - leader.standings.losses)) / 2 : undefined }));
}

export const VENUES = [
  { value: "", label: "All Games" },
  { value: "home", label: "Home" },
  { value: "away", label: "Away" },
] as const;

export const WINDOWS = [
  { value: "", label: "Full Season", days: null },
  { value: "60", label: "Last 60 Days", days: 60 },
  { value: "30", label: "Last 30 Days", days: 30 },
  { value: "14", label: "Last 2 Weeks", days: 14 },
] as const;
/** Shares of each side's 3P% regressed toward league; defense first, where it is mostly noise. */
export const LUCK_SHARES = [0, 0.5, 1] as const;
export const luckLabel = (share: number) => share === 0 ? "Actual" : share === 1 ? "League 3P%" : `${Math.round(share * 100)}% to League`;
