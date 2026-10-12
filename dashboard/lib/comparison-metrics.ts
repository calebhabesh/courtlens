import type { MetricComparisonItem, MetricDefinition, PlayerComparisonResponse, WorkbenchQueryResponse } from "./types";

export type ComparePresetId = "overall" | "offense" | "defense" | "sixfactor" | "custom";
export type CompareCountingMode = "per_game" | "raw" | "per_75" | "per_100";
export const COMPARE_PRESETS = {
  overall: { label: "Overall", metrics: ["pts", "reb", "ast", "stl", "blk", "tov", "min", "gp", "ts_pct", "efg_pct", "ftr"] },
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

export function formatComparisonValue(value: number | string | null, unit: string) {
  if (typeof value === "number" && Number.isFinite(value)) return ["percentage", "%", "ratio", "ratio difference"].includes(unit) ? `${(value * 100).toFixed(1)}%` : value.toFixed(1);
  return value == null ? "—" : String(value);
}
