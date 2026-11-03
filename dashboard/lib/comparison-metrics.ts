import type { MetricComparisonItem, MetricDefinition, PlayerComparisonResponse, PlayerResearchItem } from "./types";

export type ComparePresetId = "overall" | "offense" | "defense" | "sixfactor" | "custom";
export type CompareCountingMode = "per_game" | "raw" | "per_75" | "per_100";
/** Overall reads in career-table groups (alignment row 3); the other presets are one list. */
export const OVERALL_GROUPS = [
  { label: "Counting", metrics: ["pts", "reb", "ast", "stl", "blk", "tov"] },
  { label: "Efficiency", metrics: ["ts_pct", "efg_pct", "ftr"] },
  // Availability closes on the card's Avail % row, which needs the teams' games (row 3, 26).
  { label: "Availability", metrics: ["min", "gp"] }
] as const;

/** How decisively a side leads, for the pill's intensity: 1 slight, 2 clear, 3 large. */
export type PillStrength = 1 | 2 | 3;

/**
 * The stronger of two readings of a gap: in the stat's own terms (relative to the larger value,
 * or percentage points for a rate), and in league percentile when both players are ranked.
 * Percentiles bunch at the top of the league, so they alone would call a 7-point scoring gap
 * between two stars slight. Never a verdict: only how big a gap is.
 */
export function pillStrength(a: number, b: number, percentiles?: [number | null | undefined, number | null | undefined], unit = ""): PillStrength {
  let own: PillStrength;
  if (isPercentUnit(unit)) {
    const points = Math.abs(a - b) * 100;
    own = points < 2 ? 1 : points < 5 ? 2 : 3;
  } else {
    const scale = Math.max(Math.abs(a), Math.abs(b));
    const relative = scale ? Math.abs(a - b) / scale : 0;
    own = relative < 0.1 ? 1 : relative < 0.25 ? 2 : 3;
  }
  const [pa, pb] = percentiles ?? [];
  if (typeof pa !== "number" || typeof pb !== "number") return own;
  const gap = Math.abs(pa - pb);
  return Math.max(own, gap < 15 ? 1 : gap < 35 ? 2 : 3) as PillStrength;
}

/** Games played over the teams' games in the same span; null while the span is unknown. */
export function availabilityShare(availability: { games: number; team_games: number } | null | undefined): number | null {
  return availability && availability.team_games > 0 ? availability.games / availability.team_games : null;
}
export const COMPARE_PRESETS = {
  overall: { label: "Overall", metrics: OVERALL_GROUPS.flatMap(group => [...group.metrics]) },
  offense: { label: "Offense", metrics: ["pts", "ast", "tov", "ts_pct", "efg_pct", "fg3_pct", "ft_pct", "ftr", "oreb"] },
  defense: { label: "Defense", metrics: ["stl", "blk", "dreb", "pf"] },
  sixfactor: { label: "Six Factor", metrics: ["ts_pct", "efg_pct", "ftr", "tov", "oreb", "dreb"] },
  custom: { label: "Custom", metrics: [] }
} satisfies Record<ComparePresetId, { label: string; metrics: string[] }>;
export const CUSTOM_DEFAULT = ["pts", "ast", "reb", "ts_pct", "efg_pct"];
const COUNTS = new Set(["pts", "reb", "oreb", "dreb", "ast", "stl", "blk", "tov", "pf", "min"]);

/** Shooting volume the counting mode does not rate; these have registered per-game twins. */
const SHOT_COUNTS = new Set(["fgm", "fga", "fg3m", "fg3a", "ftm", "fta"]);

export type FantasyPresetId = "8cat" | "9cat" | "9cat_volume";

/**
 * Head-to-head category leagues (Edit Metrics quick picks). Each one replaces the Custom picks with
 * the league's scoring categories; the "volume" variant adds the attempts behind FG% and FT%,
 * which decide how much a percentage moves a fantasy team.
 */
export const FANTASY_PRESETS: { id: FantasyPresetId; label: string; description: string; metrics: string[] }[] = [
  { id: "8cat", label: "8-Cat", description: "FG%, FT%, 3PM, PTS, REB, AST, STL, BLK",
    metrics: ["fg_pct", "ft_pct", "fg3m", "pts", "reb", "ast", "stl", "blk"] },
  { id: "9cat", label: "9-Cat", description: "8-Cat plus turnovers (fewer is better)",
    metrics: ["fg_pct", "ft_pct", "fg3m", "pts", "reb", "ast", "stl", "blk", "tov"] },
  { id: "9cat_volume", label: "9-Cat + volume", description: "9-Cat plus FGA and FTA, the volume behind each percentage",
    metrics: ["fg_pct", "fga", "ft_pct", "fta", "fg3m", "pts", "reb", "ast", "stl", "blk", "tov"] }
];

/**
 * A fantasy preset's Custom keys. Box counts follow the counting mode on the card already; shooting
 * makes and attempts read as season totals in Totals mode and as their per-game twins otherwise.
 */
export function fantasyMetricKeys(id: FantasyPresetId, mode: CompareCountingMode, catalog: MetricDefinition[]) {
  const preset = FANTASY_PRESETS.find(entry => entry.id === id);
  if (!preset) return [];
  const known = new Set(catalog.map(metric => metric.key));
  return preset.metrics.map(key => {
    const rated = `${key}_per_game`;
    return SHOT_COUNTS.has(key) && mode !== "raw" && known.has(rated) ? rated : key;
  }).filter(key => known.has(key));
}

export function customMetricKeys(value: string | null | undefined, catalog: MetricDefinition[]) {
  if (value == null) return CUSTOM_DEFAULT;
  const known = new Set(catalog.map(metric => metric.key));
  return [...new Set(value.split(",").filter(key => known.has(key)))].slice(0, 25);
}

export function compareMetricKey(key: string, mode: CompareCountingMode) {
  // Explicit per-game/per-36 custom metrics keep their registered unit.
  return COUNTS.has(key) && mode !== "raw" ? `${key}_${mode}` : key;
}

/**
 * Rows for the card. ``source`` holds each player's row (the season cohort, or careers through the
 * cutoff). With ``strict`` (careers) a missing value stays unknown instead of reading the season's.
 */
export function comparisonRows(keys: string[], mode: CompareCountingMode, comparison: PlayerComparisonResponse, catalog: MetricDefinition[], source?: { items: PlayerResearchItem[] } | null, strict = false): MetricComparisonItem[] {
  const cohort = source;
  const a = cohort?.items.find(row => row.player_id === comparison.player_a.id);
  const b = cohort?.items.find(row => row.player_id === comparison.player_b.id);
  return keys.map(key => {
    const output = compareMetricKey(key, mode);
    const definition = catalog.find(metric => metric.key === output) ?? catalog.find(metric => metric.key === key);
    const aligned = comparison.aligned_metrics.find(metric => metric.metric === output);
    // Server-owned values only. Unsupported normalizations never fall back to a different unit.
    const valueA = a && Object.hasOwn(a.metrics, output) ? a.metrics[output] : strict ? null : aligned?.value_a ?? null;
    const valueB = b && Object.hasOwn(b.metrics, output) ? b.metrics[output] : strict ? null : aligned?.value_b ?? null;
    return { metric: output, display_name: definition?.display_name ?? aligned?.display_name ?? key,
      unit: definition?.unit ?? aligned?.unit ?? "", value_a: valueA, value_b: valueB,
      diff: typeof valueA === "number" && typeof valueB === "number" ? valueA - valueB : null,
      n_a: a?.sample_sizes[output] ?? (strict ? 0 : aligned?.n_a ?? 0), n_b: b?.sample_sizes[output] ?? (strict ? 0 : aligned?.n_b ?? 0) };
  });
}

const PERCENT_UNITS = new Set(["percentage", "%", "ratio", "ratio difference"]);
export function isPercentUnit(unit: string) { return PERCENT_UNITS.has(unit); }

/** The group a metric opens on Overall, matched on its base key (`pts_per_game` opens Counting). */
export function overallGroupStart(metric: string): string | null {
  for (const group of OVERALL_GROUPS) {
    const first = group.metrics[0];
    if (metric === first || metric.startsWith(`${first}_per_`)) return group.label;
  }
  return null;
}

/** Games and season totals of counted stats read as whole numbers (pts, not pts_per_game). */
export function isWholeCount(metric: string) { return metric === "gp" || COUNTS.has(metric); }

/** Card value: the row label carries the unit, so percentages read 66.5, games 68, totals 14,984. */
export function formatCardValue(value: number | string | null, unit: string, metric = "") {
  if (typeof value === "number" && Number.isFinite(value)) {
    if (isPercentUnit(unit)) return (value * 100).toFixed(1);
    return isWholeCount(metric) ? Math.round(value).toLocaleString("en-US") : value.toFixed(1);
  }
  return value == null ? "—" : String(value);
}

export function formatComparisonValue(value: number | string | null, unit: string) {
  if (typeof value === "number" && Number.isFinite(value)) return isPercentUnit(unit) ? `${(value * 100).toFixed(1)}%` : value.toFixed(1);
  return value == null ? "—" : String(value);
}

const CARD_WORDS: Record<string, string> = {
  pts: "Points", reb: "Rebounds", reb_total: "Rebounds", oreb: "Off Rebounds", dreb: "Def Rebounds", ast: "Assists",
  stl: "Steals", blk: "Blocks", tov: "Turnovers", pf: "Fouls", min: "Minutes", gp: "Games"
};

/** The card's centre label: a word for counts (the mode names the rate), else the catalog short name. */
export function cardLabel(metric: string, definition?: Pick<MetricDefinition, "short_name" | "display_name">) {
  const base = metric.replace(/_per_(game|75|100)$/, "");
  return CARD_WORDS[base] ?? definition?.short_name ?? definition?.display_name ?? metric;
}

/** Catalog aliases of a listed metric (`reb_total` is `reb`). */
const ALIASES = new Set(["reb_total", "reb_total_per_game"]);

const CATEGORY_LABELS: Record<string, string> = {
  scoring: "Scoring", counting: "Counting", efficiency: "Efficiency", playmaking: "Playmaking", rebounding: "Rebounding",
  defense: "Defense", participation: "Profile", rates: "Per 36"
};

/**
 * Edit Metrics groups. Per-game twins of counted metrics are left out (the counting mode chooses
 * the rate), as are team factors and legacy scores, which describe no single player.
 */
export function pickerMetrics(catalog: MetricDefinition[]) {
  const groups = new Map<string, MetricDefinition[]>();
  for (const metric of catalog) {
    const label = CATEGORY_LABELS[metric.category];
    if (!label || ALIASES.has(metric.key) || (metric.key.endsWith("_per_game") && COUNTS.has(metric.key.replace(/_per_game$/, "")))) continue;
    groups.set(label, [...(groups.get(label) ?? []), metric]);
  }
  return [...groups].map(([label, metrics]) => ({ label, metrics }));
}
