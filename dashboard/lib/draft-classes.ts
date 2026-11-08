import { browserApi } from "./workbench-api";

/**
 * Research → Draft Classes (R09, courtlens-draft-value-v1). Every number is the frozen results'
 * or the rookie tracker's, served unrounded; the page rounds only for display and keeps exact
 * values on `data-value`. Verdicts and ranks come from the runner's registered rules; the page
 * never ranks anything itself.
 */
export type Era = "all" | "multi_round" | "two_round";
export type Measure = "ws" | "min";
export type ClassStatus = "complete" | "censored" | "rookies";

export interface SlotSummary {
  slot: number; n: number; mean: number | null; lo: number | null; hi: number | null;
  median: number | null; p90?: number | null; played_share?: number | null; unknown?: number; active?: number;
  picks?: number; no_rapm?: number;
}
export interface Band {
  band: string; a: [number, number]; b: [number, number]; era: Era; measure: Measure;
  n_a: number; n_b: number; mean_a: number; mean_b: number; diff: number; lo: number; hi: number;
  verdict: "higher" | "lower" | "no difference";
}
export interface PickRow {
  year: number; pick: number; round: number | null; name: string; source_name: string;
  player_id: string | null; identity: string | null; team: string | null; team_name: string | null;
  organization: string | null; played: boolean; active: boolean;
  window_ws: number | null; window_min: number | null; window_seasons_played: number;
  career_ws: number | null; career_min: number | null; career_seasons: number;
  window_rapm: number | null; window_rapm_seconds: number | null;
  redraft_window: number | null; redraft_career: number | null;
  expected_window_ws: number | null; surplus_window_ws: number | null;
  photo_season: string; photo_team: string | null;
}
export interface ClassIndex {
  year: number; status: ClassStatus; era: Exclude<Era, "all">; seasons_elapsed: number;
  picks: number; played: number; active: number; source: string;
}
export interface Correlation { measure: string; outcome: "window_ws" | "window_min"; n: number; r: number | null; lo: number | null; hi: number | null }
export interface Source { classes: [number, number]; name: string; license: string | null; note: string }
export interface DraftSummary {
  registration: { identity: string; registered_on: string; content_sha256: string; results_sha256: string; parameters: Record<string, unknown> & { replicates: number; seed: number } };
  value_by_pick: {
    window: Record<Era, Record<Measure, SlotSummary[]>>;
    career: Record<Era, Record<Measure, SlotSummary[]>>;
    rapm: SlotSummary[];
  };
  bands: Band[];
  steals: PickRow[];
  misses: PickRow[];
  classes: ClassIndex[];
  combine: { correlations: Correlation[] };
  rookie_pool: Record<string, number>;
  sources: Source[];
  credits: string[];
  caveats: string[];
}
export interface DraftClass extends Omit<ClassIndex, "source"> {
  source: Source; steals: number[]; misses: number[]; rows: PickRow[];
}
export interface CombineRow {
  year: number; player_id: string; name: string; pick: number; team: string | null; position: string | null;
  height: number | null; wingspan: number | null; wingspan_minus_height: number | null; standing_reach: number | null;
  weight: number | null; max_vertical: number | null; lane_agility: number | null; sprint: number | null;
  window_ws: number | null; window_min: number | null; photo_season: string; photo_team: string | null;
}
export const ROOKIE_STATS = ["mpg", "pts36", "reb36", "ast36", "stl36", "blk36", "tov36", "ts"] as const;
export type RookieStat = (typeof ROOKIE_STATS)[number];
export interface Line extends Record<RookieStat, number | null> { games: number; minutes: number | null }
export interface StatComparison { value: number | null; n: number; median: number | null; p10: number | null; p90: number | null; percentile: number | null }
export interface Rookie {
  pick: number; round: number | null; player_id: string | null; name: string; draft_team: string | null; team: string | null;
  photo_season: string; pool: number; state: "compared" | "no_games";
  comparison: null | { line: Line; pool: number; reached_games: number; small_sample: boolean; stats: Record<RookieStat, StatComparison> };
  darko: null | { dpm: number | null; o_dpm: number | null; d_dpm: number | null };
  rapm: null | { rapm: number | null; decayed_seconds: number | null };
}
export interface RookieTracker {
  season: string; class: number; dataset_id: string; comparison_date: string | null; rule: string;
  state: "ok" | "no_games" | "pool_unavailable";
  darko: null | { data_date: string; as_of: string };
  rapm: null | { cutoff: string; latest_game_date: string; sha256: string };
  rookies: Rookie[];
}
export interface PastRookie extends Line {
  player_id: string; name: string; year: number; first_season: string; first_season_games: number;
  photo_season: string; photo_team: string | null;
}
export interface RookieDetail extends Omit<RookieTracker, "rookies"> { rookie: Rookie; comparisons: PastRookie[] }

async function get<T>(path: string, what: string, signal?: AbortSignal): Promise<T> {
  const response = await fetch(`${browserApi}/api/draft${path}`, { signal });
  if (!response.ok) {
    const body = await response.json().catch(() => null) as { detail?: string } | null;
    throw new Error(typeof body?.detail === "string" ? body.detail : `${what} request failed (${response.status})`);
  }
  return response.json() as Promise<T>;
}

export const getDraftSummary = (signal?: AbortSignal) => get<DraftSummary>("", "Draft Classes", signal);
export const getDraftClass = (year: number, signal?: AbortSignal) => get<DraftClass>(`/classes/${year}`, "Draft class", signal);
export const getDraftCombine = (signal?: AbortSignal) => get<{ rows: CombineRow[]; correlations: Correlation[] }>("/combine", "Combine", signal);
export const getRookies = (signal?: AbortSignal) => get<RookieTracker>("/rookies", "Rookie tracker", signal);
export const getRookie = (playerId: string, signal?: AbortSignal) => get<RookieDetail>(`/rookies/${encodeURIComponent(playerId)}`, "Rookie comparison", signal);

export const ERA_LABELS: Record<Era, string> = { all: "All", multi_round: "1966–88", two_round: "1989–2022" };
export const CAREER_ERA_LABELS: Record<Era, string> = { all: "All", multi_round: "1966–88", two_round: "1989–2005" };
export const MEASURE_LABELS: Record<Measure, string> = { ws: "Win shares", min: "Minutes" };
export const STAT_LABELS: Record<RookieStat, string> = {
  mpg: "MPG", pts36: "PTS/36", reb36: "REB/36", ast36: "AST/36", stl36: "STL/36", blk36: "BLK/36", tov36: "TOV/36", ts: "TS%",
};
export const COMBINE_LABELS: Record<string, string> = {
  height: "Height (no shoes)", wingspan: "Wingspan", wingspan_minus_height: "Wingspan minus height", standing_reach: "Standing reach",
  weight: "Weight", max_vertical: "Max vertical", lane_agility: "Lane agility", sprint: "Three-quarter sprint",
};
export const COMBINE_UNITS: Record<string, string> = {
  height: "in", wingspan: "in", wingspan_minus_height: "in", standing_reach: "in", weight: "lb", max_vertical: "in", lane_agility: "s", sprint: "s",
};
export const BAND_LABELS: Record<string, string> = {
  pick_1_vs_2: "Pick 1 vs pick 2", top_3_vs_4_to_10: "Picks 1–3 vs 4–10", top_10_vs_11_to_30: "Picks 1–10 vs 11–30",
  "21_to_30_vs_31_to_40": "Picks 21–30 vs 31–40", "31_to_45_vs_46_to_60": "Picks 31–45 vs 46–60",
};

/** A true minus sign, and no sign on a value that rounds to zero. */
const minus = (text: string) => /^-0(\.0+)?$/.test(text) ? text.slice(1) : text.replace(/^-/, "−");
export const fixed = (v: number | null | undefined, digits = 1) => v === null || v === undefined ? "—" : minus(v.toFixed(digits));
export const whole = (v: number | null | undefined) => v === null || v === undefined ? "—" : minus(Math.round(v).toLocaleString("en-US"));
export const percent = (v: number | null | undefined, digits = 0) => v === null || v === undefined ? "—" : `${(v * 100).toFixed(digits)}%`;
export const signed = (v: number | null | undefined, digits = 1) => {
  if (v === null || v === undefined) return "—";
  const text = minus(v.toFixed(digits));
  return Number(v.toFixed(digits)) > 0 ? `+${text}` : text;
};
export const rangeText = (lo: number | null | undefined, hi: number | null | undefined, digits = 1) =>
  lo === null || lo === undefined || hi === null || hi === undefined ? "—" : `${minus(lo.toFixed(digits))} to ${minus(hi.toFixed(digits))}`;
export const seasonLabel = (year: number) => `${year}-${String((year + 1) % 100).padStart(2, "0")}`;

/** Green or red only when the 95% interval sits wholly on one side of zero. */
export function intervalTone(lo: number | null | undefined, hi: number | null | undefined): "positive" | "negative" | undefined {
  if (lo === null || lo === undefined || hi === null || hi === undefined) return undefined;
  if (lo > 0) return "positive";
  if (hi < 0) return "negative";
  return undefined;
}

/** A rookie stat outside past same-pick rookies' 10th-90th range; turnovers count the other way. */
export function rookieTone(stat: RookieStat, c: StatComparison): "positive" | "negative" | undefined {
  if (c.value === null || c.p10 === null || c.p90 === null || c.n < 5) return undefined;
  const high = c.value > c.p90, low = c.value < c.p10;
  if (stat === "tov36") return high ? "negative" : low ? "positive" : undefined;
  if (stat === "mpg") return undefined;
  return high ? "positive" : low ? "negative" : undefined;
}

export function statText(stat: RookieStat, v: number | null | undefined): string {
  if (stat === "ts") return percent(v, 1);
  return fixed(v, 1);
}
