/** Player Twins (alignment row 17): the API's shape and the page's formatting rules. */

export type TwinsMode = "shot" | "box";
export type TwinsPool = "same" | "all";

export interface TwinDimension { key: string; group: string; label: string; kind: "rate" | "pct"; description: string }
export interface DimValue { value: number | null; league: number | null; relative: number | null; z: number | null }
export interface TwinProfile {
  player_id: string; name: string; season: string; team: string | null; teams: string[];
  games: number; off_poss: number; pts_per_game: number | null; ts_pct: number | null;
  dims: Record<string, DimValue>;
}
export interface TwinCard extends TwinProfile { rank: number | null; match: number | null; overlap: number | null }
export interface TwinMatch {
  rank: number; player_id: string; name: string; season: string; team: string | null; teams: string[];
  off_poss: number; match: number; distance: number; overlap: number;
  relative: Record<string, number | null>; gaps: Record<string, number>;
}
export interface TwinsView {
  mode: TwinsMode; season: string; seasons: string[];
  pool: { scope: TwinsPool; from_season: string; to_season: string; min_possessions: number; exclude_own: boolean; candidates: number };
  focus_rule: string | null;
  player: TwinProfile; twin: TwinCard | null; matches: TwinMatch[];
  dimensions: TwinDimension[];
  roster: { player_id: string; name: string; team: string | null; off_poss: number }[];
  method: { base_possessions: number; min_attempts: number; min_overlap: number; match_scale: number };
  source: string;
}

export const MODES: { value: TwinsMode; label: string; title: string; blurb: string }[] = [
  { value: "shot", label: "Shot Profile", title: "Shot Profile Twin", blurb: "Closest player-seasons by league-relative free throw, rim, mid-range and three-point volume and efficiency." },
  { value: "box", label: "Box Score", title: "Box Score Twin", blurb: "Closest player-seasons by league-relative scoring, playmaking, rebounding and defensive rates." },
];
export const POSSESSION_FLOORS = [500, 1000, 2000, 3000] as const;
export const DEFAULT_MIN_POSSESSIONS = 1000;
export const PAGE = 12;
export const MAX_ROWS = 96;

/** The groups in API order, each with its two dimensions. */
export function groups(dimensions: TwinDimension[]) {
  const result: { group: string; dims: TwinDimension[] }[] = [];
  for (const dim of dimensions) {
    const last = result.at(-1);
    if (last?.group === dim.group) last.dims.push(dim); else result.push({ group: dim.group, dims: [dim] });
  }
  return result;
}

const number = (value: number, digits: number) => value.toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits });

/** A dimension's own value: rates to one decimal, percentages as 45.1%. Unknown is a dash. */
export function valueText(dim: Pick<TwinDimension, "kind">, value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "—";
  return dim.kind === "pct" ? `${number(value * 100, 1)}%` : number(value, 1);
}

/** Relative to the league average, always signed: +3.1 or −4.6%. A value that rounds to zero is unsigned. */
export function relativeText(dim: Pick<TwinDimension, "kind">, value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "—";
  const scaled = dim.kind === "pct" ? value * 100 : value;
  const text = number(Math.abs(scaled), 1);
  const sign = text === "0.0" ? "" : scaled > 0 ? "+" : "−";
  return `${sign}${text}${dim.kind === "pct" ? "%" : ""}`;
}

/** Half-track share for a standardized value: three standard deviations fill one side. */
export function barShare(z: number | null | undefined): number {
  if (z == null || !Number.isFinite(z)) return 0;
  return Math.min(Math.abs(z) / 3, 1);
}

/** Tone for a relative value: efficiency reads good or bad; volume is neutral blue. */
export function tone(dim: Pick<TwinDimension, "kind">, relative: number | null | undefined): "volume" | "above" | "below" | "even" {
  if (dim.kind === "rate") return "volume";
  if (relative == null || Math.abs(relative) < 0.0005) return "even";
  return relative > 0 ? "above" : "below";
}

/** The dimension furthest apart (largest standardized gap) for a match row. */
export function biggestGap(match: Pick<TwinMatch, "gaps">, dimensions: TwinDimension[]) {
  let best: { dim: TwinDimension; gap: number } | null = null;
  for (const dim of dimensions) {
    const gap = match.gaps[dim.key];
    if (gap == null) continue;
    if (!best || Math.abs(gap) > Math.abs(best.gap)) best = { dim, gap };
  }
  return best;
}

/** "3P EFF" for shot groups; box labels already name the stat. */
export const dimName = (dim: TwinDimension) => dim.label === "VOL" || dim.label === "EFF" ? `${dim.group} ${dim.label}` : dim.label;
