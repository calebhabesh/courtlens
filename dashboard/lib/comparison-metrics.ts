import type { MetricComparisonItem, MetricDefinition, PlayerComparisonResponse, WorkbenchQueryResponse } from "./types";

export type ComparePresetId = "overall" | "offense" | "defense" | "sixfactor" | "custom";
export type CompareCountingMode = "per_game" | "raw" | "per_75" | "per_100";
/** Overall reads in career-table groups (alignment row 3); the other presets are one list. */
export const OVERALL_GROUPS = [
  { label: "Counting", metrics: ["pts", "reb", "ast", "stl", "blk", "tov"] },
  { label: "Efficiency", metrics: ["ts_pct", "efg_pct", "ftr"] },
  { label: "Profile", metrics: ["min", "gp"] }
] as const;
export const COMPARE_PRESETS = {
  overall: { label: "Overall", metrics: OVERALL_GROUPS.flatMap(group => [...group.metrics]) },
  offense: { label: "Offense", metrics: ["pts", "ast", "tov", "ts_pct", "efg_pct", "fg3_pct", "ft_pct", "ftr", "oreb"] },
  defense: { label: "Defense", metrics: ["stl", "blk", "dreb", "pf"] },
  sixfactor: { label: "Six Factor", metrics: ["ts_pct", "efg_pct", "ftr", "tov", "oreb", "dreb"] },
  custom: { label: "Custom", metrics: [] }
} satisfies Record<ComparePresetId, { label: string; metrics: string[] }>;
export const CUSTOM_DEFAULT = ["pts", "ast", "reb", "ts_pct", "efg_pct"];
const COUNTS = new Set(["pts", "reb", "oreb", "dreb", "ast", "stl", "blk", "tov", "pf", "min"]);

export function customMetricKeys(value: string | null | undefined, catalog: MetricDefinition[]) {
  if (value == null) return CUSTOM_DEFAULT;
  const known = new Set(catalog.map(metric => metric.key));
  return [...new Set(value.split(",").filter(key => known.has(key)))].slice(0, 25);
}

export function compareMetricKey(key: string, mode: CompareCountingMode) {
  // Explicit per-game/per-36 custom metrics keep their registered unit.
  return COUNTS.has(key) && mode !== "raw" ? `${key}_${mode}` : key;
}

export function comparisonRows(keys: string[], mode: CompareCountingMode, comparison: PlayerComparisonResponse, catalog: MetricDefinition[], cohort?: WorkbenchQueryResponse | null): MetricComparisonItem[] {
  const a = cohort?.items.find(row => row.player_id === comparison.player_a.id);
  const b = cohort?.items.find(row => row.player_id === comparison.player_b.id);
  return keys.map(key => {
    const output = compareMetricKey(key, mode);
    const definition = catalog.find(metric => metric.key === output) ?? catalog.find(metric => metric.key === key);
    const aligned = comparison.aligned_metrics.find(metric => metric.metric === output);
    // Server-owned values only. Unsupported normalizations never fall back to a different unit.
    const valueA = a && Object.hasOwn(a.metrics, output) ? a.metrics[output] : aligned?.value_a ?? null;
    const valueB = b && Object.hasOwn(b.metrics, output) ? b.metrics[output] : aligned?.value_b ?? null;
    return { metric: output, display_name: definition?.display_name ?? aligned?.display_name ?? key,
      unit: definition?.unit ?? aligned?.unit ?? "", value_a: valueA, value_b: valueB,
      diff: typeof valueA === "number" && typeof valueB === "number" ? valueA - valueB : null,
      n_a: a?.sample_sizes[output] ?? aligned?.n_a ?? 0, n_b: b?.sample_sizes[output] ?? aligned?.n_b ?? 0 };
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

/** Card value: the row label carries the unit, so percentages read 66.5 and games 68. */
export function formatCardValue(value: number | string | null, unit: string, metric = "") {
  if (typeof value === "number" && Number.isFinite(value)) {
    if (isPercentUnit(unit)) return (value * 100).toFixed(1);
    return metric === "gp" ? value.toFixed(0) : value.toFixed(1);
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
