import type { CountingMode, ColumnDefinition } from "./stats-presets";
import { ALL_CATALOG_METRICS } from "./stats-presets";
import type { QuerySpec, WorkbenchCatalog } from "./types";
import { decodeSearchParamsToQuery } from "./query-url";
import { SEASON_FROM_PARAM, seasonRange } from "./season-range";

// One rating per player-season: a season range cannot rank by DARKO.
const SEASON_ONLY_SORTS = ["dpm", "o_dpm", "d_dpm"];
// The NBA first recorded player minutes in 1951-52.
const FIRST_MINUTES_SEASON = "1951-52";

/** The sort used when a scope cannot rank by its default: the most-used players first. */
export function fallbackSortMetric(season: string | null | undefined): string {
  return season && season < FIRST_MINUTES_SEASON ? "pts" : "min";
}

/**
 * Whether DARKO rates this whole-season scope: a sealed board for the phase dated before the
 * cutoff, or (a regular season in progress, nothing sealed yet) the daily board whose ratings
 * end before it. Mirrors the server's darko_scope; the server still decides coverage.
 */
export function darkoRates(catalog: WorkbenchCatalog, query: Pick<QuerySpec, "season" | "phase" | "before_date">): boolean {
  const scopes = catalog.darko?.scopes?.filter(scope => scope.season === query.season) ?? [];
  const before = query.before_date ?? "";
  if (!before) return false;
  const sealed = scopes.filter(scope => scope.phase === query.phase);
  if (sealed.length) return sealed.some(scope => scope.as_of < before);
  return query.phase === "regular_season" &&
    scopes.some(scope => scope.phase === "current" && scope.data_date < before);
}

/** Overview ranks by DPM where DARKO rates the scope, otherwise by minutes. */
export function overviewSortMetric(catalog: WorkbenchCatalog) {
  return (query: QuerySpec): string => darkoRates(catalog, query) ? "dpm" : fallbackSortMetric(query.season);
}

const COUNTING_FAMILIES = ["pts", "reb", "oreb", "dreb", "ast", "stl", "blk", "tov", "pf"];

export function normalizedSortMetric(field: string, mode: CountingMode): string {
  const base = field.replace("reb_total", "reb").replace(/_per_(game|36)$/, "");
  if (COUNTING_FAMILIES.includes(base)) {
    return mode === "raw" ? base : `${base}_${mode}`;
  }
  if (["fga", "fg3a", "fta"].includes(base)) return mode === "raw" ? base : `${base}_${mode}`;
  return field;
}

export function normalizedColumn(column: ColumnDefinition, mode: CountingMode): ColumnDefinition {
  const key = column.countingModeKeys?.[mode] ?? normalizedSortMetric(column.key, mode);
  const base = ALL_CATALOG_METRICS[key] ?? column;
  const kept = column.keepLabel ? { label: column.label, format: column.format ?? base.format } : {};
  return { ...base, ...kept, key, sortMetric: key, group: column.group };
}

export function resolveStatsQuery(
  params: Record<string, string | string[] | undefined>,
  catalog: WorkbenchCatalog,
  mode: CountingMode,
  // A metric, or a choice made once the season, phase and cutoff are resolved.
  defaultSortMetric: string | ((query: QuerySpec) => string) = "pts"
): QuerySpec {
  const query = decodeSearchParamsToQuery(params);
  query.release_id = query.release_id || catalog.release_id;
  query.season = typeof params.season === "string" ? params.season : catalog.default_season;
  const range = seasonRange(catalog.seasons ?? [], params[SEASON_FROM_PARAM], query.season);
  if (range) query.season_scope = { seasons: range, aggregate_multi_season: true };
  const scopes = catalog.stats_scopes?.filter((scope) => scope.season === query.season) ?? [];
  query.phase = typeof params.phase === "string" ? params.phase :
    (scopes.find((scope) => scope.phase === "regular_season")?.phase ?? scopes[0]?.phase ?? catalog.default_phase);
  const scope = scopes.find((scope) => scope.phase === query.phase);
  query.before_date = query.before_date || scope?.default_before_date || catalog.default_before_date;
  if (!params.sortMetric && !params.sort_metric && !params.sort) {
    const metric = typeof defaultSortMetric === "function" ? defaultSortMetric(query) : defaultSortMetric;
    const field = range && SEASON_ONLY_SORTS.includes(metric) ? fallbackSortMetric(range[0]) : metric;
    query.sort = [{ field, direction: query.sort?.[0]?.direction ?? "desc" }];
  }
  query.sort = query.sort?.map((sort) => ({ ...sort, field: normalizedSortMetric(sort.field, mode) }));
  return query;
}
