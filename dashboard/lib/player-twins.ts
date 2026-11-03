/** Player Twins (alignment row 17): the API's shape and the page's formatting rules. */

export type TwinsMode = "shot" | "box" | "all";
export type TwinsPool = "same" | "all";

export interface TwinDimension { key: string; group: string; label: string; kind: "rate" | "pct"; description: string }
export interface DimValue { value: number | null; league: number | null; relative: number | null; z: number | null; percentile: number | null }
/** The following season as recorded. Unknown when it is beyond the data or has no row. */
export interface TwinNext {
  season: string; status: "recorded" | "no_record" | "beyond_data";
  team?: string | null; games?: number; off_poss?: number; pts_per_game?: number | null; ts_pct?: number | null;
  pts_change?: number | null; ts_change?: number | null; relative?: Record<string, number | null>;
}
export interface TwinProfile {
  player_id: string; name: string; season: string; team: string | null; teams: string[];
  position: string | null; position_basis: "estimated" | "listed" | null;
  games: number; off_poss: number; pts_per_game: number | null; ts_pct: number | null;
  dims: Record<string, DimValue>;
}
export interface TwinCard extends TwinProfile { rank: number | null; match: number | null; overlap: number | null; next: TwinNext }
export interface CareerSeason {
  season: string; team: string | null; position: string | null; off_poss: number;
  twin: { player_id: string; name: string; season: string; team: string | null; match: number } | null;
}
export interface MapPoint { player_id: string; name: string; season: string; team: string | null; position: string | null; x: number; y: number }
export interface TwinMap {
  axes: { explained: number; loadings: { key: string; loading: number }[] }[];
  points: MapPoint[]; player: MapPoint; twins: (MapPoint & { rank: number })[];
}
export interface TwinMatch {
  rank: number; player_id: string; name: string; season: string; team: string | null; teams: string[];
  position: string | null; position_basis: "estimated" | "listed" | null;
  off_poss: number; match: number; distance: number; overlap: number;
  relative: Record<string, number | null>; gaps: Record<string, number>; next: TwinNext;
}
export interface TwinsView {
  mode: TwinsMode; season: string; seasons: string[];
  pool: { scope: TwinsPool; from_season: string; to_season: string; min_possessions: number; exclude_own: boolean; by_position: boolean; candidates: number };
  focus_rule: string | null;
  weights: Record<string, number>;
  player: TwinProfile & { next: TwinNext }; twin: TwinCard | null; matches: TwinMatch[];
  career: CareerSeason[]; map: TwinMap | null;
  dimensions: TwinDimension[];
  roster: { player_id: string; name: string; team: string | null; position: string | null; off_poss: number }[];
  method: { base_possessions: number; min_attempts: number; min_overlap: number; measures: number; match_scale: number };
  source: string;
}

/** Every player in the data, for the all-seasons search. */
export interface TwinsPlayerIndex {
  players: { player_id: string; name: string; first_season: string; last_season: string; last_team: string | null; seasons: number }[];
}

/**
 * Where a searched player opens: the selected season when he played it, else his most recent.
 * `season` is null for the latest season (the URL's default).
 */
export function searchTarget(
  player: TwinsPlayerIndex["players"][number], view: Pick<TwinsView, "season" | "seasons" | "roster">,
): { season: string | null; inSeason: boolean } {
  const inSeason = view.roster.some(entry => entry.player_id === player.player_id);
  const season = inSeason ? view.season : player.last_season;
  return { season: season === view.seasons.at(-1) ? null : season, inSeason };
}

export const MODES: { value: TwinsMode; label: string; title: string; blurb: string }[] = [
  { value: "shot", label: "Shot Profile", title: "Shot Profile Twin", blurb: "Closest player-seasons by league-relative free throw, rim, mid-range and three-point volume and efficiency." },
  { value: "box", label: "Box Score", title: "Box Score Twin", blurb: "Closest player-seasons by league-relative scoring, playmaking, rebounding and defensive rates." },
  { value: "all", label: "Combined", title: "Combined Twin", blurb: "Closest player-seasons by all sixteen shot-profile and box-score measures together." },
];
export const isMode = (value: string | null): value is TwinsMode => value === "shot" || value === "box" || value === "all";

/** A measure's weight: off, half, normal (the default) or double. */
export const WEIGHT_STEPS = [
  { value: "0", label: "Off", title: "Leave this measure out" },
  { value: "0.5", label: "½×", title: "Half weight" },
  { value: "1", label: "1×", title: "Normal weight" },
  { value: "2", label: "2×", title: "Double weight" },
] as const;

/** The `w` URL value: "three_vol:2,ft_eff:0" in dimension order, normal weights left out. */
export function weightsParam(weights: Record<string, number>, dimensions: Pick<TwinDimension, "key">[]): string | null {
  const parts = dimensions.filter(dim => (weights[dim.key] ?? 1) !== 1).map(dim => `${dim.key}:${weights[dim.key]}`);
  return parts.length ? parts.join(",") : null;
}

/** "82nd": a percentile rounded to a whole rank. */
export function ordinal(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "—";
  const n = Math.min(99, Math.max(0, Math.round(value)));
  const tail = n % 100 >= 11 && n % 100 <= 13 ? "th" : ({ 1: "st", 2: "nd", 3: "rd" } as Record<number, string>)[n % 10] ?? "th";
  return `${n}${tail}`;
}

export function median(values: number[]): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b), mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/** What the shown twins did the following season: how many have a record, and the median changes. */
export function nextSummary(matches: Pick<TwinMatch, "next">[]) {
  const recorded = matches.map(match => match.next).filter(next => next.status === "recorded");
  const pts = recorded.flatMap(next => next.pts_change == null ? [] : [next.pts_change]);
  const ts = recorded.flatMap(next => next.ts_change == null ? [] : [next.ts_change]);
  return { shown: matches.length, recorded: recorded.length, pts: median(pts), ts: median(ts) };
}

/** A signed change: +2.1 or −0.8 (percent points for TS%). */
export function signed(value: number | null | undefined, digits = 1, scale = 1): string {
  if (value == null || !Number.isFinite(value)) return "—";
  const text = Math.abs(value * scale).toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits });
  return `${Number(text) === 0 ? "" : value > 0 ? "+" : "−"}${text}`;
}

/**
 * Map geometry: both axes share one scale (they are the same z-score units), centred on the data.
 * Returns a projector from data to viewBox coordinates.
 */
export function mapFrame(points: Pick<MapPoint, "x" | "y">[], width: number, height: number, pad: number, withOrigin = true, minSpan = 1e-6) {
  const xs = points.map(point => point.x), ys = points.map(point => point.y);
  if (withOrigin) { xs.push(0); ys.push(0); }
  const [x0, x1] = [Math.min(...xs), Math.max(...xs)], [y0, y1] = [Math.min(...ys), Math.max(...ys)];
  const scale = Math.min((width - 2 * pad) / Math.max(x1 - x0, minSpan), (height - 2 * pad) / Math.max(y1 - y0, minSpan));
  const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
  return (point: Pick<MapPoint, "x" | "y">) => ({ x: width / 2 + (point.x - cx) * scale, y: height / 2 - (point.y - cy) * scale });
}
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

/** Plain words for a measure, for the map's axis ends: "rim attempts", "3P%". */
export const PLAIN: Record<string, string> = {
  ft_vol: "free throws", ft_eff: "FT%", rim_vol: "rim attempts", rim_eff: "rim FG%",
  mid_vol: "mid-range", mid_eff: "mid FG%", three_vol: "threes", three_eff: "3P%",
  pts: "scoring", ts: "TS%", ast: "assists", tov: "turnovers", oreb: "off. rebounds",
  dreb: "def. rebounds", stl: "steals", blk: "blocks",
};

const PERCENT = new Set(["ft_eff", "rim_eff", "mid_eff", "three_eff", "ts"]);

/** What each end of a map axis means, from its two strongest measures, each in its own
 * direction: "More rim attempts, fewer threes" at the high end and the reverse at the low end. */
export function axisEnds(loadings: { key: string; loading: number }[]): { high: string; low: string } {
  const top = [...loadings].sort((a, b) => Math.abs(b.loading) - Math.abs(a.loading)).slice(0, 2);
  const phrase = (sign: 1 | -1) => {
    const text = top.map(row => {
      const up = row.loading * sign > 0, pct = PERCENT.has(row.key);
      return `${pct ? (up ? "higher" : "lower") : (up ? "more" : "fewer")} ${PLAIN[row.key] ?? row.key}`;
    }).join(", ");
    return text.charAt(0).toUpperCase() + text.slice(1);
  };
  return { high: phrase(1), low: phrase(-1) };
}
