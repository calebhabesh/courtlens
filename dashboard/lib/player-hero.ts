import { formatNumber, formatPercent } from "./player-pages";
import { DARKO_COLUMNS } from "./stats-presets";

/** The latest-season summary: Stats row values with Stats-cohort percentiles (owner row 2, item 12). */
export const HERO_METRICS: { key: string; label: string; format: (value: number | null) => string }[] = [
  { key: "pts_per_game", label: "PTS", format: value => formatNumber(value, 1) },
  { key: "reb_per_game", label: "REB", format: value => formatNumber(value, 1) },
  { key: "ast_per_game", label: "AST", format: value => formatNumber(value, 1) },
  { key: "ts_pct", label: "TS%", format: formatPercent },
  { key: "dpm", label: "DPM", format: value => DARKO_COLUMNS.dpm.format?.(value) ?? formatNumber(value, 1) },
  { key: "min_per_game", label: "MPG", format: value => formatNumber(value, 1) },
];
