import type { CountingMode, ColumnDefinition } from "./stats-presets";
import { ALL_CATALOG_METRICS } from "./stats-presets";
import type { QuerySpec, WorkbenchCatalog } from "./types";
import { decodeSearchParamsToQuery } from "./query-url";

const COUNTING_FAMILIES = ["pts", "reb", "oreb", "dreb", "ast", "stl", "blk", "tov", "pf"];

export function normalizedSortMetric(field: string, mode: CountingMode): string {
  const base = field.replace("reb_total", "reb").replace(/_per_(game|36)$/, "");
  if (COUNTING_FAMILIES.includes(base)) {
    return mode === "raw" ? base : `${base}_${mode}`;
  }
  if (["fga", "fg3a", "fta"].includes(base)) return mode === "per_36" ? `${base}_per_36` : base;
  return field;
}

export function normalizedColumn(column: ColumnDefinition, mode: CountingMode): ColumnDefinition {
  const key = column.countingModeKeys?.[mode] ?? normalizedSortMetric(column.key, mode);
  return { ...(ALL_CATALOG_METRICS[key] ?? column), key, sortMetric: key, group: column.group };
}

export function resolveStatsQuery(
  params: Record<string, string | string[] | undefined>,
  catalog: WorkbenchCatalog,
  mode: CountingMode
): QuerySpec {
  const query = decodeSearchParamsToQuery(params);
  query.release_id = query.release_id || catalog.release_id;
  query.season = typeof params.season === "string" ? params.season : catalog.default_season;
  const scopes = catalog.stats_scopes?.filter((scope) => scope.season === query.season) ?? [];
  query.phase = typeof params.phase === "string" ? params.phase :
    (scopes.find((scope) => scope.phase === "regular_season")?.phase ?? scopes[0]?.phase ?? catalog.default_phase);
  const scope = scopes.find((scope) => scope.phase === query.phase);
  query.before_date = query.before_date || scope?.default_before_date || catalog.default_before_date;
  query.sort = query.sort?.map((sort) => ({ ...sort, field: normalizedSortMetric(sort.field, mode) }));
  return query;
}
