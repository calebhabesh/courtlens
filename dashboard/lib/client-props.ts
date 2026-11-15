import { ORDERED_COUNTING_MODES, ORDERED_PRESETS } from "./stats-presets";
import { normalizedColumn } from "./stats-query";
import type { PlayerBio, PlayerCareerResponse, PlayerResearchItem, PlayerResearchResponse } from "./types";

// Speed plan SP05: server pages send each client component only the fields it reads. Every helper
// here copies values as the API sent them and never computes, rounds or reorders anything; a map
// that was null or absent stays so.

/** Only the keys of a per-metric map that a client reads. */
export function pickMetricKeys<V>(values: Record<string, V> | null | undefined, keys: ReadonlySet<string>): Record<string, V> | null | undefined {
  if (!values) return values;
  const kept: Record<string, V> = {};
  for (const key of keys) if (key in values) kept[key] = values[key];
  return kept;
}

/**
 * A query row narrowed to what a table reads: whole `metrics`, the league percentile, cohort size
 * and impact support of the `columns` it can show, and the `sizes` of `sample_sizes` it reads. The
 * analytical `percentiles` and `cohort_sample_sizes` (no reader on any page) are dropped.
 */
export function tableRow(item: PlayerResearchItem, columns: ReadonlySet<string>, sizes: ReadonlySet<string>): PlayerResearchItem {
  const { percentiles: _percentiles, cohort_sample_sizes: _cohortSizes, ...rest } = item;
  void _percentiles; void _cohortSizes;
  return {
    ...rest,
    sample_sizes: pickMetricKeys(item.sample_sizes, sizes) ?? {},
    table_percentiles: pickMetricKeys(item.table_percentiles, columns),
    table_cohort_sample_sizes: pickMetricKeys(item.table_cohort_sample_sizes, columns),
    impact_support: pickMetricKeys(item.impact_support, columns)
  };
}

/**
 * The Stats table's query response as its client component reads it. The query returns every
 * metric's percentiles and sample sizes four times over for each row (about 12 KB a row, 620 KB
 * for Stats' 50 rows). The table, its preview rail and its trend buttons read percentiles only for
 * the view's own `columns`, and the detail drawer one sample size (points, for its games line).
 * `metrics` stays whole: the scatter view plots any catalog metric without a new query.
 */
export function statsTableData(data: PlayerResearchResponse, columns: readonly string[]): PlayerResearchResponse {
  const keys = new Set(columns);
  const drawerSizes = new Set(["pts"]);
  return { ...data, items: data.items.map(item => tableRow(item, keys, drawerSizes)) };
}

/**
 * Every column the player page's career table can show: it switches views and counting modes in
 * the browser without a new read, so it needs each view's columns in each mode.
 */
export function careerTableColumns(): Set<string> {
  const keys = new Set<string>();
  for (const preset of ORDERED_PRESETS) {
    for (const mode of ORDERED_COUNTING_MODES) {
      for (const column of preset.columns) keys.add(normalizedColumn(column, mode.id).key);
    }
  }
  return keys;
}

/** The career read as the career table reads it: no sample sizes (no reader) and its own columns' ranks. */
export function careerTableData(career: PlayerCareerResponse): PlayerCareerResponse {
  const keys = careerTableColumns();
  const none = new Set<string>();
  return {
    ...career,
    seasons: career.seasons.map(entry => ({ ...entry, item: entry.item ? tableRow(entry.item, keys, none) : null })),
    career: career.career ? tableRow(career.career, keys, none) : null
  };
}

/**
 * The bio as the player page reads it: of Basketball-Reference's game highs only the career rows
 * (the Game Highs table); the per-season rows (most of a long career's 80 KB) have no reader.
 */
export function playerBioData(bio: PlayerBio): PlayerBio {
  const highs = bio.reference?.game_highs;
  if (!bio.reference || !highs) return bio;
  return { ...bio, reference: { ...bio.reference, game_highs: highs.filter(row => row.scope === "career") } };
}
