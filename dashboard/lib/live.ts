// Live (alignment row 7): ESPN reads the API fetches on demand and caches (docs/design/shared-live-v2.md).

import { teamNameAt } from "./team-era";
export type LiveStatus = "scheduled" | "in_progress" | "final" | "postponed" | "cancelled" | "unknown";

export interface LiveOdds {
  provider: string | null; details: string | null; spread: number | null; over_under: number | null;
  over_odds: number | null; under_odds: number | null; home_moneyline: number | null; away_moneyline: number | null;
  home_spread_odds: number | null; away_spread_odds: number | null;
}
export interface LiveTeam {
  source_id: string; canonical_id: string | null; tricode?: string | null; identity_status: string; name: string;
  side: "home" | "away"; score: number | null; abbreviation?: string | null; record?: string | null; venue_record?: string | null;
  linescores?: (number | null)[] | null; winner?: boolean | null;
  /** Players ESPN's injury report lists as Out (upcoming games only). */
  out?: number;
  /** Finalized research team box (the historical read only). */
  statistics?: Record<string, number | null>;
}
export interface LiveGame {
  source_id: string; canonical_id: string | null; identity_status: string; namespace?: string; slate_date: string;
  event_time: string | null; status: LiveStatus; period: number | null; clock: string | null; teams: LiveTeam[];
  provisional?: boolean; status_detail?: string | null; odds?: LiveOdds | null;
  /** W4: the sealed CourtLens call (null before any real seal existed). */
  prediction?: LivePrediction | null;
}
export type WinModel = "original" | "market_informed";
export interface LivePrediction {
  status: "sealed" | "no_seal"; model?: WinModel; home_win?: number; favourite?: "home" | "away";
  probability?: number; toss_up?: boolean; captured_at?: string; right?: boolean | null;
}
export interface LivePlayer {
  source_id: string; team_source_id: string; name: string; short_name?: string | null; position?: string | null;
  jersey?: string | null; starter?: boolean | null; dnp_reason?: string | null; canonical_id: string | null;
  identity_status: string; reported_nonappearance: boolean | null; statistics: Record<string, string | null>;
  appearance_label?: string;
}
export interface LivePlay {
  id: string; period: number | null; clock: string | null; text: string; type: string; team_source_id: string | null;
  side: "home" | "away" | null; away_score: number | null; home_score: number | null; scoring: boolean;
  score_value: number | null; shot: "field_goal" | "free_throw" | null; points_attempted: number | null;
  x: number | null; y: number | null; player_source_id: string | null;
}
export interface LiveLeader {
  team_source_id: string; category: string; label: string; value: string; source_id: string; name: string;
  position: string | null; canonical_id: string | null; identity_status: string;
}
export interface LiveInjury { source_id: string; name: string; position: string | null; status: string | null; detail?: string | null; canonical_id: string | null }
export interface LiveInfo { venue: string | null; venue_image?: string | null; city: string | null; state: string | null; attendance: number | null; officials: string[]; broadcasts: string[] }
export interface LiveWinPoint { play_id: string; home: number }
/** The frozen CourtLens model on one game: its line, biggest swings and identity. */
export interface WinProbabilityPoint { play_id: string | null; t: number; home: number; home_score: number; away_score: number; period: number }
export interface WinProbabilitySwing { play_id: string; t: number; home_after: number; delta_home: number; period: number | null; clock: string | null; text: string | null; side: string | null; home_score: number; away_score: number }
export interface WinProbabilityLine {
  status: "ok" | "no_inputs" | "no_plays";
  model: { version: string; manifest_sha256: string; frozen_at: string };
  availability?: "tip_off_capture" | "hindsight_box" | null; captured_at?: string;
  points?: WinProbabilityPoint[]; swings?: WinProbabilitySwing[]; reason?: string;
}
export interface LiveSeriesGame {
  source_id: string; date: string | null; state: "pre" | "in" | "post" | null; detail: string | null;
  teams: { source_id: string; side: "home" | "away" | null; score: number | null; winner: boolean | null }[];
}
export interface LiveSeries { summary: string | null; short_summary: string | null; score: string | null; total: number | null; games: LiveSeriesGame[] }
export interface LiveStandingRow { team_source_id: string; tricode?: string | null; name: string | null; wins?: string | null; losses?: string | null; pct?: string | null; gb?: string | null; streak?: string | null }
export interface LiveDivision { division: string | null; conference: string | null; entries: LiveStandingRow[] }
export interface LiveStory { headline: string; description: string | null; published: string | null; source: string | null; type: string | null; link: string | null; image: string | null }
export interface LiveTeamSection { team: { id: string }; statistics?: { name?: string; label?: string; displayValue?: string | null }[] }

export interface LiveSlateData { games: LiveGame[]; calendar?: string[] | null }
export interface LiveGameData {
  game: LiveGame; players: LivePlayer[] | null; team_totals?: Record<string, Record<string, string | null>> | null;
  team_sections: LiveTeamSection[] | null; plays?: LivePlay[] | null; play_scores?: "scoring_plays" | "source" | null;
  leaders?: LiveLeader[] | null; injuries?: { team_source_id: string; players: LiveInjury[] }[] | null;
  odds?: LiveOdds | null; info?: LiveInfo | null;
  win_probability?: LiveWinPoint[] | null; season_series?: LiveSeries | null; standings?: LiveDivision[] | null;
  news?: { recap: LiveStory | null; stories: LiveStory[] } | null;
}
export interface LiveRead<T> {
  namespace: "espn"; resource: string; status: "observed" | "source_error" | "unavailable"; final: boolean; stale: boolean;
  age_seconds: number | null; acquired_at: string | null; source_time: string | null; http_date: string | null;
  refresh_seconds: number | null; error: string | null; observation_id: string | null; content_sha256: string | null; data: T | null;
}

export function validSlate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(`${value}T12:00:00Z`)) && new Date(`${value}T12:00:00Z`).toISOString().slice(0, 10) === value;
}
export function easternToday(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}
export function shiftSlate(value: string, days: number): string { return new Date(Date.parse(`${value}T12:00:00Z`) + days * 86400000).toISOString().slice(0, 10); }

/** The NBA season a date belongs to ("2026-27"), for season photos and team eras. */
export function seasonOf(slate: string): string {
  const [year, month] = slate.split("-").map(Number);
  const start = month >= 8 ? year : year - 1;
  return `${start}-${String(start + 1).slice(-2)}`;
}

export function periodLabel(period: number): string { return period <= 4 ? `Q${period}` : `OT${period - 4}`; }

/** Tipoff in Eastern time with its zone, as on Databallr ("8:00 PM EDT"). */
export function tipoff(value: string | null): string | null {
  if (!value) return null;
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) return null;
  return new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit", timeZone: "America/New_York", timeZoneName: "short" }).format(parsed);
}

/** The card and banner status: "Final", "Final/OT", "Q3 4:21", or the tipoff time. */
export function gameStatus(game: LiveGame): string {
  if (game.status === "in_progress") {
    if (game.status_detail && /half|end of/i.test(game.status_detail)) return game.status_detail;
    return game.period == null ? "In progress" : `${periodLabel(game.period)} ${game.clock ?? ""}`.trim();
  }
  if (game.status === "final") return game.status_detail && /OT/.test(game.status_detail) ? game.status_detail : "Final";
  if (game.status === "scheduled") return tipoff(game.event_time) ?? "Scheduled";
  return ({ postponed: "Postponed", cancelled: "Cancelled", unknown: "Status unknown" } as Record<string, string>)[game.status] ?? "Status unknown";
}

export function awayFirst<T extends { side: "home" | "away" }>(teams: readonly T[]): T[] {
  return [...teams].sort((a, b) => a.side === b.side ? 0 : a.side === "away" ? -1 : 1);
}

/** The team's short code: our tricode when the ESPN team maps, else ESPN's abbreviation. */
/** A win-loss record with an en dash, as elsewhere on CourtLens ("2-3" from ESPN becomes "2–3"). */
export function formatRecord(record: string | null | undefined): string | null {
  if (!record) return null;
  return /^\d+-\d+$/.test(record) ? record.replace("-", "–") : record;
}

export function teamCode(team: Pick<LiveTeam, "tricode" | "abbreviation" | "name">): string {
  return team.tricode ?? team.abbreviation ?? team.name.slice(0, 3).toUpperCase();
}

/** "6-9" → [6, 9]; anything else is unknown. */
export function madeAttempted(value: string | null | undefined): [number, number] | null {
  const match = value ? /^(\d+)-(\d+)$/.exec(value) : null;
  return match ? [Number(match[1]), Number(match[2])] : null;
}

export const STAT_KEYS = {
  min: "minutes", pts: "points", fg: "fieldGoalsMade-fieldGoalsAttempted", tp: "threePointFieldGoalsMade-threePointFieldGoalsAttempted",
  ft: "freeThrowsMade-freeThrowsAttempted", reb: "rebounds", oreb: "offensiveRebounds", ast: "assists", stl: "steals",
  blk: "blocks", pf: "fouls", to: "turnovers", pm: "plusMinus",
} as const;

/** True shooting %: PTS / (2 × (FGA + 0.44 × FTA)). None without attempts. */
export function trueShooting(stats: Record<string, string | null>): number | null {
  const points = Number(stats[STAT_KEYS.pts]);
  const fg = madeAttempted(stats[STAT_KEYS.fg]), ft = madeAttempted(stats[STAT_KEYS.ft]);
  if (!fg || !ft || !Number.isFinite(points)) return null;
  const attempts = fg[1] + 0.44 * ft[1];
  return attempts > 0 ? (100 * points) / (2 * attempts) : null;
}

/** Two-point makes-attempts: field goals minus threes. */
export function twoPoint(stats: Record<string, string | null>): string | null {
  const fg = madeAttempted(stats[STAT_KEYS.fg]), tp = madeAttempted(stats[STAT_KEYS.tp]);
  return fg && tp ? `${fg[0] - tp[0]}/${fg[1] - tp[1]}` : null;
}

/** Databallr's TS% colours: gold at 60 and up, blue under 52. */
export function shootingTone(ts: number | null): "high" | "low" | undefined {
  if (ts == null) return undefined;
  return ts >= 60 ? "high" : ts < 52 ? "low" : undefined;
}

/** The nearest game date to land on when the requested one has none: the latest earlier one, else the next. */
export function nearestGameDate(calendar: readonly string[] | null | undefined, day: string): string | null {
  if (!calendar?.length) return null;
  const before = calendar.filter(d => d < day);
  return before.at(-1) ?? calendar.find(d => d > day) ?? null;
}

/**
 * Who the line favours, in team terms (follow-up 8). ESPN's `spread` is the home team's line:
 * negative means the home team is favoured by that many points. Its `details` uses ESPN's own
 * codes ("NY -4.5"), so labels are built from our codes instead.
 */
export function lineFavourite(odds: Pick<LiveOdds, "spread"> | null | undefined, teams: readonly LiveTeam[]): { team: LiveTeam; points: number } | "even" | null {
  if (odds?.spread == null) return null;
  if (odds.spread === 0) return "even";
  const team = teams.find(t => t.side === (odds.spread! < 0 ? "home" : "away"));
  return team ? { team, points: Math.abs(odds.spread) } : null;
}

export function moneyline(value: number | null): string | null {
  if (value == null) return null;
  return value > 0 ? `+${value}` : String(value);
}

export async function liveRead<T>(path: string, signal?: AbortSignal): Promise<LiveRead<T>> {
  const response = await fetch(`/api/live${path}`, { cache: "no-store", signal: signal ?? AbortSignal.timeout(20000) });
  if (!response.ok) throw new Error(`Live request failed (${response.status})`);
  return response.json();
}

/** Admitted finals from the research release (Team Compare's game logs), not ESPN. */
export interface HistoricalSlate { context: Record<string, string>; games: LiveGame[]; players: LivePlayer[] | null; status: string; warnings: string[] }

export async function liveRequest<T>(path: string): Promise<T> {
  const response = await fetch(`/api/live${path}`, { cache: "no-store", signal: AbortSignal.timeout(10000) });
  if (!response.ok) throw new Error(`Live request failed (${response.status})`);
  return response.json();
}

export const WIN_MODEL_NAMES: Record<WinModel, string> = { market_informed: "Market-informed model (on trial)", original: "Original model" };

/**
 * W4: the card's CourtLens row from the sealed call. The number is the sealed tip-off probability and
 * never moves during the game. `right` is set only for a final game whose call was not exactly even.
 */
export function predictionCall(game: Pick<LiveGame, "status" | "prediction">): {
  kind: "none" | "favours" | "toss_up" | "pregame" | "called"; side?: "home" | "away"; percent?: number; right?: boolean | null; title: string;
} | null {
  const p = game.prediction;
  if (!p) return null;
  if (p.status === "no_seal" || p.favourite == null || p.probability == null) return { kind: "none", title: "No prediction was sealed before tip-off" };
  const percent = Math.round(p.probability * 100);
  const sealed = tipoff(p.captured_at ?? null);
  const title = `${p.model ? WIN_MODEL_NAMES[p.model] : "CourtLens"}: the sealed tip-off probability${sealed ? `, sealed ${sealed}` : ""}. Not betting advice.`;
  const base = { side: p.favourite, percent, title };
  if (game.status === "final") return { ...base, kind: "called", right: p.right ?? null };
  if (game.status === "in_progress") return { ...base, kind: "pregame" };
  return { ...base, kind: p.toss_up ? "toss_up" : "favours" };
}

/** A team's full name ("Philadelphia 76ers"), from ESPN's name or, when only a code is known, the team's name that season. */
export function teamFullName(team: Pick<LiveTeam, "tricode" | "abbreviation" | "name">, season?: string | null): string {
  const code = teamCode(team);
  if (team.name && team.name !== code) return team.name;
  return teamNameAt(code, season) ?? code;
}
