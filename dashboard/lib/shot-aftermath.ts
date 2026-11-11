import { browserApi } from "./workbench-api";

/**
 * Research R17: courtlens-shot-aftermath-v1 (RD18). Every number is the frozen run's, served unrounded by
 * `/api/shot-aftermath`; the page rounds for display and writes exact values on `data-*` for the real-data check.
 */

export type Zone = "rim" | "short_mid" | "long_mid" | "three" | "all";
export type Position = "all" | "guards" | "forwards" | "bigs";
export type Status = "ok" | "thin" | "unknown";
export type Tone = "benefit" | "cost";
export type View = "all" | "miss" | "dreb";
export type ValueKey =
  | "fg_pct" | "made" | "second_per_miss" | "second" | "own" | "dreb_share" | "ppp_make" | "ppp_dreb"
  | "cost" | "net" | "miss_cost" | "miss_net" | "dreb_cost";
export type CostKey = "cost" | "miss_cost" | "dreb_cost";

export const ZONES: readonly Zone[] = ["rim", "short_mid", "long_mid", "three", "all"];
export const SHOT_ZONES: readonly Zone[] = ["rim", "short_mid", "long_mid", "three"];
export const POSITIONS: readonly Position[] = ["all", "guards", "forwards", "bigs"];
export const LATEST_SEASON = "2025-26";

export interface Interval { value: number; low: number; high: number }
export interface Estimate extends Interval { undefined_replicates: number }
export interface Counts {
  attempts: number; makes: number; oreb: number; dreb: number; miss_unknown: number; make_possessions: number; dreb_possessions: number;
  blocks: number; and_ones: number; make_censored: number; make_same_team: number; make_followed: number; dreb_censored: number; dreb_same_team: number;
}
export interface Cell {
  team: string; team_code: string | null; position: Position; zone: Zone; status: Status; counts: Counts;
  values: Record<ValueKey, Estimate | null>; tones: Record<CostKey, Tone | null>;
}
export interface League { possessions: number; points: number; ppp: Interval }
export interface ZoneComparison { courtlens: number; databallr: number; difference: number }
export interface SeasonSummary {
  season: string; league: League; first_chance_by_zone: Record<Zone, number>; databallr_comparison: Record<Zone, ZoneComparison> | null;
  data_check: { shots: number; games: number; joined: number; counts: Record<string, number>; first_chance_vs_shot_table_after_oreb: Record<string, number>; blocked_attempts_all_shots: number };
  teams: { team_id: string; code: string }[]; statuses: Record<Status, number>;
}
export interface Summary {
  registration: { identity: string; registered_on: string; content_sha256: string }; results_sha256: string; latest_season: string;
  seasons: SeasonSummary[]; zones: Zone[]; positions: Position[];
  position_accuracy: { group_correct: number; samples: number; centres: number; centres_estimated_c: number; centres_estimated_pf: number };
  thresholds: { attempts: number; possessions: number; replicates: number; interval: number };
  definitions: Record<string, string>; limitations: string[]; credit: string;
}
export interface Scope { season: string; team: string; team_code: string | null; position: Position; league: League; rows: Cell[] }
export interface TeamBoard { season: string; position: Position; zone: Zone; league: League; all_teams: Cell; rows: Cell[] }

async function read<T>(path: string, params: Record<string, string>, signal?: AbortSignal): Promise<T> {
  const query = Object.keys(params).length ? `?${new URLSearchParams(params)}` : "";
  const response = await fetch(`${browserApi}/api/shot-aftermath${path}${query}`, { signal });
  if (!response.ok) {
    const body = await response.json().catch(() => null) as { detail?: string } | null;
    throw new Error(typeof body?.detail === "string" ? body.detail : `Shot Aftermath request failed (${response.status})`);
  }
  return response.json() as Promise<T>;
}
export const getSummary = (signal?: AbortSignal) => read<Summary>("", {}, signal);
export const getScope = (season: string, team: string | null, position: Position, signal?: AbortSignal) =>
  read<Scope>("/scope", { season, team: team ?? "all", position }, signal);
export const getTeams = (season: string, position: Position, zone: Zone, signal?: AbortSignal) =>
  read<TeamBoard>("/teams", { season, position, zone }, signal);

// ---- Labels and numbers -------------------------------------------------------------------------------------------------

export const ZONE_LABEL: Record<Zone, string> = { rim: "Rim", short_mid: "Short mid", long_mid: "Long mid", three: "Three", all: "All shots" };
export const ZONE_SENTENCE: Record<Zone, string> = { rim: "rim attempts", short_mid: "short mid-range shots", long_mid: "long mid-range shots", three: "threes", all: "all shots" };
export const POSITION_LABEL: Record<Position, string> = { all: "All positions", guards: "Guards", forwards: "Forwards", bigs: "Bigs" };
export const VIEW_LABEL: Record<View, string> = { all: "All attempts", miss: "After a miss", dreb: "After a defensive rebound" };
export const VIEW_UNIT: Record<View, string> = { all: "points per first-chance attempt", miss: "points per first-chance miss", dreb: "points per miss the defence rebounded" };
export const VIEW_COST: Record<View, CostKey> = { all: "cost", miss: "miss_cost", dreb: "dreb_cost" };

const MINUS = "−";
const NBSP = " ";
export const whole = (value: number | null | undefined) => value == null ? "—" : Math.round(value).toLocaleString("en-US");
export const fixed = (value: number | null | undefined, digits = 3) => value == null || !Number.isFinite(value) ? "—" : value.toFixed(digits).replace("-", MINUS);
/** A signed value: "+0.047", "−0.010", "0.000" (no sign on a zero that rounds to zero). */
export function signed(value: number | null | undefined, digits = 3): string {
  if (value == null || !Number.isFinite(value)) return "—";
  const text = Math.abs(value).toFixed(digits);
  if (Number(text) === 0) return text;
  return `${value > 0 ? "+" : MINUS}${text}`;
}
export const pct = (value: number | null | undefined, digits = 1) => value == null ? "—" : `${(value * 100).toFixed(digits)}%`;
/** "0.131 to 0.140", signed for costs: "−0.015 to +0.006". */
export function band(entry: Interval | null | undefined, sign = false, digits = 3): string {
  if (!entry) return "";
  const f = sign ? signed : fixed;
  return `${f(entry.low, digits)} to ${f(entry.high, digits)}`;
}
/** A cost interval short enough for a phone chart label: leading zeros dropped, "−.389 to +.215" (RD18 suggestion 5). */
export function shortBand(entry: Interval | null | undefined, digits = 3): string {
  if (!entry) return "";
  const f = (v: number) => signed(v, digits).replace(/^([+−]?)0\./, "$1.");
  return `${f(entry.low)} to ${f(entry.high)}`;
}
export const pctBand = (entry: Interval | null | undefined) => entry ? `${pct(entry.low)} to ${pct(entry.high)}` : "";
/** The kit's tone words for a cost: green is a benefit (below the league), red a cost. */
export const gridTone = (tone: Tone | null | undefined): "good" | "bad" | undefined => tone === "benefit" ? "good" : tone === "cost" ? "bad" : undefined;
export const nb = (text: string) => text.replaceAll(" ", NBSP);

export const value = (cell: Cell | null | undefined, key: ValueKey) => cell?.values[key]?.value ?? null;

// ---- Views and charts ---------------------------------------------------------------------------------------------------

export interface ChartSpec { key: ValueKey; title: string; sub: string; kind: "points" | "cost" }

/** The charts of each view (Databallr's four for all attempts; what each narrower view has). */
export function viewCharts(view: View): ChartSpec[] {
  if (view === "miss") return [
    { key: "second_per_miss", title: "Second chances", sub: "Points per miss the shooting team scores before the opponent gets the ball. More is better", kind: "points" },
    { key: "miss_cost", title: "Opponent cost", sub: "Above the league average, per miss. Less is better", kind: "cost" },
    { key: "miss_net", title: "Scoring minus cost", sub: "Second chances minus opponent cost, per miss. More is better", kind: "points" },
  ];
  if (view === "dreb") return [
    { key: "ppp_dreb", title: "Opponent scoring", sub: "Points per possession after the defensive rebound. The marker is the league average", kind: "points" },
    { key: "dreb_cost", title: "Opponent cost", sub: "Above the league average, per rebounded miss. Less is better", kind: "cost" },
  ];
  return [
    { key: "own", title: "Own scoring", sub: "Made field goals plus second chances, per attempt. More is better", kind: "points" },
    { key: "second", title: "Second chances", sub: "Points per attempt after a miss, included in own scoring", kind: "points" },
    { key: "cost", title: "Opponent cost", sub: "Above the league average, per attempt. Less is better", kind: "cost" },
    { key: "net", title: "Scoring minus cost", sub: "Own scoring minus opponent cost, per attempt. More is better", kind: "points" },
  ];
}

/** One points axis from zero shared by every points chart of a view (owner, RD18 Q2): the top is the next half point above every interval. */
export function pointsAxis(rows: readonly Cell[], keys: readonly ValueKey[], league?: number): number {
  const highs = rows.flatMap(r => keys.map(k => r.values[k]?.high ?? 0));
  return Math.max(0.5, Math.ceil(Math.max(...highs, league ?? 0) * 2) / 2);
}
/** Round steps for the cost axis: never more than two ticks either side of zero, each a round number (RD18 suggestion 4). */
const COST_STEPS = [0.01, 0.02, 0.05, 0.1, 0.2, 0.5, 1, 2, 5] as const;
const EPS = 1e-9;
function costStep(reach: number): number {
  return COST_STEPS.find(step => reach / step <= 2 + EPS) ?? COST_STEPS.at(-1)!;
}
/** Cost gets its own axis centred on zero, wide enough for every interval, ending on a round step (0.04, 0.10, 2.00 — never 1.44). */
export function costAxis(rows: readonly Cell[], key: CostKey): number {
  const reach = Math.max(0, ...rows.flatMap(r => { const e = r.values[key]; return e ? [Math.abs(e.low), Math.abs(e.high)] : [0]; }));
  const r = Math.max(reach, 0.02);
  const step = costStep(r);
  return Number((Math.ceil(r / step - EPS) * step).toFixed(4));
}
export function ticks(top: number, kind: "points" | "cost"): number[] {
  if (kind === "cost") {
    const step = COST_STEPS.find(s => top / s <= 2 + EPS && Math.abs(top / s - Math.round(top / s)) < 1e-6) ?? top;
    const n = Math.round(top / step);
    return Array.from({ length: 2 * n + 1 }, (_, i) => Number(((i - n) * step).toFixed(4)));
  }
  const step = top <= 1 ? 0.25 : 0.5;
  return Array.from({ length: Math.round(top / step) + 1 }, (_, i) => i * step);
}

// ---- The answer -----------------------------------------------------------------------------------------------------------

export interface Answer {
  best: Cell; worst: Cell; bestClear: boolean; worstClear: boolean;
  overall: Cell | null; reboundEffect: Cell | null; reboundAll: "none" | "some";
  /** Thin zones left out of the ranking: a handful of attempts never anchors the answer. */
  thin: Cell[];
}

const net = (c: Cell) => c.values.net;
/**
 * Rank zones by net value among cells that aren't thin; "clear" only where the leader's interval doesn't touch any other zone's (no
 * ranking claim from overlap). Thin zones are named, not ranked.
 */
export function answerOf(rows: readonly Cell[]): Answer | null {
  const zones = rows.filter(r => r.zone !== "all" && r.status === "ok" && net(r));
  const thin = rows.filter(r => r.zone !== "all" && r.status === "thin");
  if (zones.length < 2) return null;
  const sorted = [...zones].sort((a, b) => net(b)!.value - net(a)!.value);
  const best = sorted[0], worst = sorted.at(-1)!;
  const bestClear = sorted.slice(1).every(z => net(z)!.high < net(best)!.low);
  const worstClear = sorted.slice(0, -1).every(z => net(z)!.low > net(worst)!.high);
  const toned = zones.filter(z => z.tones.dreb_cost && z.values.dreb_cost)
    .sort((a, b) => Math.abs(b.values.dreb_cost!.value) - Math.abs(a.values.dreb_cost!.value));
  return { best, worst, bestClear, worstClear, overall: rows.find(r => r.zone === "all") ?? null, reboundEffect: toned[0] ?? null, reboundAll: toned.length ? "some" : "none", thin };
}

/** Zones in net order (thin zones left out), best first. */
export const zoneOrder = (rows: readonly Cell[]): Zone[] =>
  rows.filter(r => r.zone !== "all" && r.status === "ok" && net(r)).sort((a, b) => net(b)!.value - net(a)!.value).map(r => r.zone);

export interface SeasonCheck {
  season: string; sameOrder: boolean; order: Zone[];
  /** The current season's clearest rebound effect, read in the other season: held (same sign, interval clear of zero), unclear, or none to check. */
  rebound: { zone: Zone; held: "held" | "unclear" } | null;
}
/** RD18 suggestion 1: did the zone order and the rebound effect hold in the other season of the same scope? */
export function seasonCheck(current: readonly Cell[], other: readonly Cell[], season: string): SeasonCheck | null {
  const a = answerOf(current);
  if (!a || !answerOf(other)) return null;
  const order = zoneOrder(other), mine = zoneOrder(current);
  const sameOrder = order.length === mine.length && order.every((z, i) => z === mine[i]);
  let rebound: SeasonCheck["rebound"] = null;
  if (a.reboundEffect) {
    const zone = a.reboundEffect.zone;
    const there = other.find(r => r.zone === zone);
    const sign = Math.sign(a.reboundEffect.values.dreb_cost!.value);
    const held = there?.tones.dreb_cost && there.values.dreb_cost && Math.sign(there.values.dreb_cost.value) === sign ? "held" : "unclear";
    rebound = { zone, held };
  }
  return { season, sameOrder, order, rebound };
}

/** Team cells coloured in a view, against what 95% intervals would colour by chance alone (1 in 20 of the cells that can take a colour). */
export function chanceLine(rows: readonly Cell[], key: CostKey): { coloured: number; eligible: number; byChance: number } {
  const eligible = rows.filter(r => r.status === "ok" && r.values[key]).length;
  const coloured = rows.filter(r => r.tones[key]).length;
  return { coloured, eligible, byChance: eligible / 20 };
}

// ---- The team table ---------------------------------------------------------------------------------------------------------

export type TeamSort = "team" | "attempts" | "fg_pct" | "own" | "cost" | "net";
export function sortTeams(rows: readonly Cell[], key: TeamSort, direction: "asc" | "desc", costKey: CostKey = "cost"): Cell[] {
  const of = (c: Cell): number | null => key === "attempts" ? c.counts.attempts : key === "team" ? null : value(c, key === "cost" ? costKey : key);
  const out = [...rows];
  if (key === "team") return out.sort((a, b) => (a.team_code ?? "").localeCompare(b.team_code ?? "") * (direction === "asc" ? 1 : -1));
  // Unknowns last in both directions; ties fall back to the team code.
  return out.sort((a, b) => {
    const x = of(a), y = of(b);
    if (x == null || y == null) return x == null && y == null ? (a.team_code ?? "").localeCompare(b.team_code ?? "") : x == null ? 1 : -1;
    return (direction === "asc" ? x - y : y - x) || (a.team_code ?? "").localeCompare(b.team_code ?? "");
  });
}

// ---- CSV ----------------------------------------------------------------------------------------------------------------------

export const CSV_HEADER = [
  "season", "team", "position", "zone", "status", "attempts", "makes", "fg_pct", "fg_pct_low", "fg_pct_high",
  "made_points", "second_chances", "second_low", "second_high", "own_scoring", "own_low", "own_high",
  "opponent_cost", "cost_low", "cost_high", "net", "net_low", "net_high",
  "opp_ppp_after_make", "possessions_after_make", "opp_ppp_after_dreb", "possessions_after_dreb", "dreb_share", "second_per_miss",
  "miss_cost", "miss_cost_low", "miss_cost_high", "dreb_cost", "dreb_cost_low", "dreb_cost_high", "blocks", "and_ones", "league_ppp",
] as const;

export function csvRows(scope: Scope): (string | number | null)[][] {
  return scope.rows.map(c => {
    const v = c.values;
    const triple = (k: ValueKey) => [v[k]?.value ?? null, v[k]?.low ?? null, v[k]?.high ?? null];
    return [
      scope.season, scope.team_code ?? "NBA", c.position, c.zone, c.status, c.counts.attempts, c.counts.makes, ...triple("fg_pct"),
      v.made?.value ?? null, ...triple("second"), ...triple("own"), ...triple("cost"), ...triple("net"),
      v.ppp_make?.value ?? null, c.counts.make_possessions, v.ppp_dreb?.value ?? null, c.counts.dreb_possessions, v.dreb_share?.value ?? null, v.second_per_miss?.value ?? null,
      ...triple("miss_cost"), ...triple("dreb_cost"), c.counts.blocks, c.counts.and_ones, scope.league.ppp.value,
    ];
  });
}

/** Unknowns behind a scope's all-shots row, by reason (never counted as zero). */
export function unknowns(cell: Cell | null | undefined) {
  if (!cell) return null;
  const c = cell.counts;
  return {
    missNoRebound: c.miss_unknown,
    periodEnd: c.make_censored + c.dreb_censored,
    sameTeam: c.make_same_team + c.dreb_same_team,
    makeFollowed: c.make_followed,
  };
}
