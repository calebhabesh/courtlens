import type { PlayerResearchItem, CustomViewDefinition } from "./types";
import impactDefinitions from "./impact-metrics.json";

export type PresetId =
  | "overview"
  | "shooting"
  | "defense"
  | "trueshooting"
  | "advanced"
  | "playmaking"
  | "rebounding"
  | "impact"
  | "onoff"
  | "sixfactor";

export type CountingMode = "per_game" | "raw" | "per_36" | "per_75" | "per_100";
export type IdentityDensity = "photos" | "logos" | "initials" | "none";
export type TableDensity = "standard" | "compact";

export interface ColumnDefinition {
  key: string;
  label: string;
  group: string;
  tooltip?: string;
  num: boolean;
  sortMetric: string;
  format?: (val: number | null | undefined, item?: PlayerResearchItem) => string;
  countingModeKeys?: Partial<Record<CountingMode, string>>;
}

/** Table and preview must display the same server-owned value and normalization. */
export function formatColumnValue(column: ColumnDefinition, player: PlayerResearchItem): string {
  const value = column.key === "gp" || column.key === "games_played"
    ? player.games_played ?? player.metrics.gp
    : column.key === "min" || column.key === "total_minutes"
    ? player.total_minutes ?? player.metrics.min
    : player.metrics[column.key];
  return column.format ? column.format(value, player) : value == null ? "—" : String(value);
}

export interface HeaderGroup {
  label: string;
  colSpan: number;
}

export interface PresetDefinition {
  id: PresetId;
  label: string;
  description: string;
  columns: ColumnDefinition[];
  groupLabels?: Record<string, string>;
  gated?: {
    block: string;
    reason: string;
    status: "gated" | "partial";
  };
}

export const NBA_TEAMS = [
  { tricode: "ATL", name: "Atlanta Hawks" },
  { tricode: "BOS", name: "Boston Celtics" },
  { tricode: "BKN", name: "Brooklyn Nets" },
  { tricode: "CHA", name: "Charlotte Hornets" },
  { tricode: "CHI", name: "Chicago Bulls" },
  { tricode: "CLE", name: "Cleveland Cavaliers" },
  { tricode: "DAL", name: "Dallas Mavericks" },
  { tricode: "DEN", name: "Denver Nuggets" },
  { tricode: "DET", name: "Detroit Pistons" },
  { tricode: "GSW", name: "Golden State Warriors" },
  { tricode: "HOU", name: "Houston Rockets" },
  { tricode: "IND", name: "Indiana Pacers" },
  { tricode: "LAC", name: "LA Clippers" },
  { tricode: "LAL", name: "Los Angeles Lakers" },
  { tricode: "MEM", name: "Memphis Grizzlies" },
  { tricode: "MIA", name: "Miami Heat" },
  { tricode: "MIL", name: "Milwaukee Bucks" },
  { tricode: "MIN", name: "Minnesota Timberwolves" },
  { tricode: "NOP", name: "New Orleans Pelicans" },
  { tricode: "NYK", name: "New York Knicks" },
  { tricode: "OKC", name: "Oklahoma City Thunder" },
  { tricode: "ORL", name: "Orlando Magic" },
  { tricode: "PHI", name: "Philadelphia 76ers" },
  { tricode: "PHX", name: "Phoenix Suns" },
  { tricode: "POR", name: "Portland Trail Blazers" },
  { tricode: "SAC", name: "Sacramento Kings" },
  { tricode: "SAS", name: "San Antonio Spurs" },
  { tricode: "TOR", name: "Toronto Raptors" },
  { tricode: "UTA", name: "Utah Jazz" },
  { tricode: "WAS", name: "Washington Wizards" }
];

export const COUNTING_MODES: Array<{
  id: CountingMode;
  label: string;
  tooltip: string;
  gated?: boolean;
}> = [
  { id: "per_game", label: "Per Game", tooltip: "Average per confirmed active appearance" },
  { id: "raw", label: "Totals", tooltip: "Cumulative counting totals across valid appearances" },
  { id: "per_36", label: "Per 36", tooltip: "Normalized rate per 36 played minutes on jointly valid rows" },
  {
    id: "per_75",
    label: "Per 75",
    tooltip: "Per 75 on-court team possessions; requires admitted inputs",
    gated: true
  },
  {
    id: "per_100",
    label: "Per 100",
    tooltip: "Per 100 on-court team possessions; requires admitted inputs",
    gated: true
  }
];

export const IDENTITY_MODES: Array<{
  id: IdentityDensity;
  label: string;
  tooltip: string;
}> = [
  { id: "photos", label: "Photos", tooltip: "Repeat player portraits between metric groups" },
  { id: "logos", label: "Logos", tooltip: "Repeat represented-team logos between metric groups" },
  { id: "initials", label: "Initials", tooltip: "Repeat player initials between metric groups" },
  { id: "none", label: "None", tooltip: "Hide recurring guides; keep primary identity" }
];

export function formatStatValue(val: number | null | undefined, digits = 1): string {
  if (val === null || val === undefined || isNaN(val)) return "—";
  return val.toFixed(digits);
}

export function formatIntValue(val: number | null | undefined): string {
  if (val === null || val === undefined || isNaN(val)) return "—";
  return Math.round(val).toLocaleString();
}

export function formatPctValue(val: number | null | undefined): string {
  if (val === null || val === undefined || isNaN(val)) return "—";
  return `${(val * 100).toFixed(1)}%`;
}

export const IMPACT_COLUMNS: Record<string, ColumnDefinition> = Object.fromEntries(
  impactDefinitions.metrics.map(metric => [metric.key, {
    key: metric.key, label: metric.short_name, group: metric.category === "impact" ? "CourtLens impact" : "CourtLens extras",
    num: true, sortMetric: metric.key, tooltip: `${metric.display_name}: ${metric.formula}. ${metric.unit}. ${metric.validity_definition}`,
    format: (value: number | null | undefined) => metric.unit === "ratio" || metric.unit === "ratio difference"
      ? formatPctValue(value) : formatStatValue(value, 2)
  }])
);

function impactColumns(keys: string[], group: string): ColumnDefinition[] {
  return keys.map(key => ({ ...IMPACT_COLUMNS[key], group }));
}

export const STATS_PRESETS: PresetDefinition[] = [
  {
    id: "overview",
    groupLabels: { Participation: "Profile", Scoring: "Counting", Rebounding: "Counting", Playmaking: "Counting" },
    label: "Overview",
    description: "Core box-score volume, conventional averages, and efficiency benchmarks.",
    columns: [
      { key: "gp", label: "GP", group: "Participation", num: true, sortMetric: "gp", format: formatIntValue, tooltip: "Games Played (confirmed appearances)" },
      { key: "min", label: "MIN", group: "Participation", num: true, sortMetric: "min", format: formatIntValue, tooltip: "Total Minutes Played" },
      { key: "min_per_game", label: "MPG", group: "Participation", num: true, sortMetric: "min_per_game", format: (v) => formatStatValue(v, 1), tooltip: "Minutes Per Game" },
      {
        key: "pts_per_game",
        label: "PTS",
        group: "Scoring",
        num: true,
        sortMetric: "pts_per_game",
        format: (v, it) => (v !== undefined ? formatStatValue(v, 1) : formatIntValue(it?.metrics.pts)),
        countingModeKeys: { raw: "pts", per_game: "pts_per_game", per_36: "pts_per_36" },
        tooltip: "Points (respects counting mode)"
      },
      {
        key: "reb_per_game",
        label: "REB",
        group: "Rebounding",
        num: true,
        sortMetric: "reb_per_game",
        format: (v, it) => (v !== undefined ? formatStatValue(v, 1) : formatIntValue(it?.metrics.reb)),
        countingModeKeys: { raw: "reb", per_game: "reb_per_game", per_36: "reb_per_36" },
        tooltip: "Total Rebounds (respects counting mode)"
      },
      {
        key: "ast_per_game",
        label: "AST",
        group: "Playmaking",
        num: true,
        sortMetric: "ast_per_game",
        format: (v, it) => (v !== undefined ? formatStatValue(v, 1) : formatIntValue(it?.metrics.ast)),
        countingModeKeys: { raw: "ast", per_game: "ast_per_game", per_36: "ast_per_36" },
        tooltip: "Assists (respects counting mode)"
      },
      {
        key: "stl_per_game",
        label: "STL",
        group: "Defense",
        num: true,
        sortMetric: "stl_per_game",
        format: (v, it) => (v !== undefined ? formatStatValue(v, 1) : formatIntValue(it?.metrics.stl)),
        countingModeKeys: { raw: "stl", per_game: "stl_per_game", per_36: "stl_per_36" },
        tooltip: "Steals (respects counting mode)"
      },
      {
        key: "blk_per_game",
        label: "BLK",
        group: "Defense",
        num: true,
        sortMetric: "blk_per_game",
        format: (v, it) => (v !== undefined ? formatStatValue(v, 1) : formatIntValue(it?.metrics.blk)),
        countingModeKeys: { raw: "blk", per_game: "blk_per_game", per_36: "blk_per_36" },
        tooltip: "Blocks (respects counting mode)"
      },
      { key: "fg_pct", label: "FG%", group: "Efficiency", num: true, sortMetric: "fg_pct", format: formatPctValue, tooltip: "Field Goal Percentage (FGM / FGA)" },
      { key: "fg3_pct", label: "3P%", group: "Efficiency", num: true, sortMetric: "fg3_pct", format: formatPctValue, tooltip: "3-Point Field Goal Percentage (3PM / 3PA)" },
      { key: "ft_pct", label: "FT%", group: "Efficiency", num: true, sortMetric: "ft_pct", format: formatPctValue, tooltip: "Free Throw Percentage (FTM / FTA)" },
      { key: "ts_pct", label: "TS%", group: "Efficiency", num: true, sortMetric: "ts_pct", format: formatPctValue, tooltip: "True Shooting %: PTS / (2 * (FGA + 0.44 * FTA))" },
      { key: "efg_pct", label: "eFG%", group: "Efficiency", num: true, sortMetric: "efg_pct", format: formatPctValue, tooltip: "Effective Field Goal %: (FGM + 0.5 * 3PM) / FGA" }
    ]
  },
  {
    id: "shooting",
    label: "Shooting",
    description: "Detailed shot breakdown: makes, attempts, and true efficiency indicators.",
    columns: [
      { key: "gp", label: "GP", group: "Participation", num: true, sortMetric: "gp", format: formatIntValue, tooltip: "Games Played" },
      { key: "fgm", label: "FGM", group: "Field Goals", num: true, sortMetric: "fgm", format: formatIntValue, tooltip: "Field Goals Made" },
      {
        key: "fga",
        label: "FGA",
        group: "Field Goals",
        num: true,
        sortMetric: "fga",
        format: (v, it) => (v !== undefined ? formatIntValue(v) : formatIntValue(it?.metrics.fga)),
        countingModeKeys: { raw: "fga", per_game: "fga", per_36: "fga_per_36" },
        tooltip: "Field Goal Attempts"
      },
      { key: "fg_pct", label: "FG%", group: "Field Goals", num: true, sortMetric: "fg_pct", format: formatPctValue, tooltip: "Field Goal Percentage" },
      { key: "fg3m", label: "3PM", group: "3-Pointers", num: true, sortMetric: "fg3m", format: formatIntValue, tooltip: "3-Point Field Goals Made" },
      {
        key: "fg3a",
        label: "3PA",
        group: "3-Pointers",
        num: true,
        sortMetric: "fg3a",
        format: (v, it) => (v !== undefined ? formatIntValue(v) : formatIntValue(it?.metrics.fg3a)),
        countingModeKeys: { raw: "fg3a", per_game: "fg3a", per_36: "fg3a_per_36" },
        tooltip: "3-Point Field Goal Attempts"
      },
      { key: "fg3_pct", label: "3P%", group: "3-Pointers", num: true, sortMetric: "fg3_pct", format: formatPctValue, tooltip: "3-Point Percentage" },
      { key: "ftm", label: "FTM", group: "Free Throws", num: true, sortMetric: "ftm", format: formatIntValue, tooltip: "Free Throws Made" },
      {
        key: "fta",
        label: "FTA",
        group: "Free Throws",
        num: true,
        sortMetric: "fta",
        format: (v, it) => (v !== undefined ? formatIntValue(v) : formatIntValue(it?.metrics.fta)),
        countingModeKeys: { raw: "fta", per_game: "fta", per_36: "fta_per_36" },
        tooltip: "Free Throw Attempts"
      },
      { key: "ft_pct", label: "FT%", group: "Free Throws", num: true, sortMetric: "ft_pct", format: formatPctValue, tooltip: "Free Throw Percentage" },
      { key: "efg_pct", label: "eFG%", group: "Advanced Shooting", num: true, sortMetric: "efg_pct", format: formatPctValue, tooltip: "Effective Field Goal %" },
      { key: "ts_pct", label: "TS%", group: "Advanced Shooting", num: true, sortMetric: "ts_pct", format: formatPctValue, tooltip: "True Shooting %" },
      { key: "ftr", label: "FTR", group: "Advanced Shooting", num: true, sortMetric: "ftr", format: (v) => formatStatValue(v, 3), tooltip: "Free Throw Rate: FTA / FGA" }
    ]
  },
  {
    id: "defense",
    label: "Defense",
    description: "Defensive activity metrics: steals, blocks, defensive boards, and fouls.",
    columns: [
      { key: "gp", label: "GP", group: "Participation", num: true, sortMetric: "gp", format: formatIntValue, tooltip: "Games Played" },
      { key: "min", label: "MIN", group: "Participation", num: true, sortMetric: "min", format: formatIntValue, tooltip: "Total Minutes" },
      {
        key: "stl_per_game",
        label: "STL/G",
        group: "Steals",
        num: true,
        sortMetric: "stl_per_game",
        format: (v) => formatStatValue(v, 1),
        countingModeKeys: { raw: "stl", per_game: "stl_per_game", per_36: "stl_per_36" },
        tooltip: "Steals per game"
      },
      { key: "stl_per_36", label: "STL/36", group: "Steals", num: true, sortMetric: "stl_per_36", format: (v) => formatStatValue(v, 1), tooltip: "Steals per 36 minutes" },
      {
        key: "blk_per_game",
        label: "BLK/G",
        group: "Blocks",
        num: true,
        sortMetric: "blk_per_game",
        format: (v) => formatStatValue(v, 1),
        countingModeKeys: { raw: "blk", per_game: "blk_per_game", per_36: "blk_per_36" },
        tooltip: "Blocks per game"
      },
      { key: "blk_per_36", label: "BLK/36", group: "Blocks", num: true, sortMetric: "blk_per_36", format: (v) => formatStatValue(v, 1), tooltip: "Blocks per 36 minutes" },
      {
        key: "dreb_per_game",
        label: "DREB/G",
        group: "Def Rebounds",
        num: true,
        sortMetric: "dreb_per_game",
        format: (v) => formatStatValue(v, 1),
        countingModeKeys: { raw: "dreb", per_game: "dreb_per_game", per_36: "dreb_per_36" },
        tooltip: "Defensive rebounds per game"
      },
      { key: "dreb_per_36", label: "DREB/36", group: "Def Rebounds", num: true, sortMetric: "dreb_per_36", format: (v) => formatStatValue(v, 1), tooltip: "Defensive rebounds per 36 minutes" },
      {
        key: "pf_per_game",
        label: "PF/G",
        group: "Fouls",
        num: true,
        sortMetric: "pf_per_game",
        format: (v) => formatStatValue(v, 1),
        countingModeKeys: { raw: "pf", per_game: "pf_per_game", per_36: "pf_per_36" },
        tooltip: "Personal fouls per game"
      },
      { key: "pf_per_36", label: "PF/36", group: "Fouls", num: true, sortMetric: "pf_per_36", format: (v) => formatStatValue(v, 1), tooltip: "Personal fouls per 36 minutes" }
    ]
  },
  {
    id: "trueshooting",
    label: "True Shooting",
    description: "True shooting efficiency decomposition, volume context, and shot distribution.",
    columns: [
      { key: "gp", label: "GP", group: "Volume", num: true, sortMetric: "gp", format: formatIntValue, tooltip: "Games Played" },
      { key: "pts", label: "PTS", group: "Volume", num: true, sortMetric: "pts", format: formatIntValue, tooltip: "Total Points" },
      { key: "fga", label: "FGA", group: "Volume", num: true, sortMetric: "fga", format: formatIntValue, tooltip: "Total Field Goal Attempts" },
      { key: "fg3a", label: "3PA", group: "Volume", num: true, sortMetric: "fg3a", format: formatIntValue, tooltip: "Total 3-Point Attempts" },
      { key: "fta", label: "FTA", group: "Volume", num: true, sortMetric: "fta", format: formatIntValue, tooltip: "Total Free Throw Attempts" },
      { key: "fg_pct", label: "FG%", group: "Percentages", num: true, sortMetric: "fg_pct", format: formatPctValue, tooltip: "Field Goal Percentage" },
      { key: "fg3_pct", label: "3P%", group: "Percentages", num: true, sortMetric: "fg3_pct", format: formatPctValue, tooltip: "3-Point Percentage" },
      { key: "ft_pct", label: "FT%", group: "Percentages", num: true, sortMetric: "ft_pct", format: formatPctValue, tooltip: "Free Throw Percentage" },
      { key: "ts_pct", label: "TS%", group: "True Efficiency", num: true, sortMetric: "ts_pct", format: formatPctValue, tooltip: "Conventional True Shooting %" },
      { key: "efg_pct", label: "eFG%", group: "True Efficiency", num: true, sortMetric: "efg_pct", format: formatPctValue, tooltip: "Effective Field Goal %" },
      { key: "ftr", label: "FTR", group: "True Efficiency", num: true, sortMetric: "ftr", format: (v) => formatStatValue(v, 3), tooltip: "Free Throw Rate: FTA / FGA" }
    ]
  },
  {
    id: "advanced",
    label: "Rates (Per 36)",
    description: "Standardized per-36 minute rates across all primary box-score categories.",
    columns: [
      { key: "gp", label: "GP", group: "Exposure", num: true, sortMetric: "gp", format: formatIntValue, tooltip: "Games Played" },
      { key: "min", label: "MIN", group: "Exposure", num: true, sortMetric: "min", format: formatIntValue, tooltip: "Total Minutes" },
      { key: "min_per_game", label: "MPG", group: "Exposure", num: true, sortMetric: "min_per_game", format: (v) => formatStatValue(v, 1), tooltip: "Minutes Per Game" },
      { key: "pts_per_36", label: "PTS/36", group: "Per-36 Rates", num: true, sortMetric: "pts_per_36", format: (v) => formatStatValue(v, 1), tooltip: "Points per 36 minutes" },
      { key: "reb_per_36", label: "REB/36", group: "Per-36 Rates", num: true, sortMetric: "reb_per_36", format: (v) => formatStatValue(v, 1), tooltip: "Rebounds per 36 minutes" },
      { key: "ast_per_36", label: "AST/36", group: "Per-36 Rates", num: true, sortMetric: "ast_per_36", format: (v) => formatStatValue(v, 1), tooltip: "Assists per 36 minutes" },
      { key: "stl_per_36", label: "STL/36", group: "Per-36 Rates", num: true, sortMetric: "stl_per_36", format: (v) => formatStatValue(v, 1), tooltip: "Steals per 36 minutes" },
      { key: "blk_per_36", label: "BLK/36", group: "Per-36 Rates", num: true, sortMetric: "blk_per_36", format: (v) => formatStatValue(v, 1), tooltip: "Blocks per 36 minutes" },
      { key: "tov_per_36", label: "TOV/36", group: "Per-36 Rates", num: true, sortMetric: "tov_per_36", format: (v) => formatStatValue(v, 1), tooltip: "Turnovers per 36 minutes" },
      { key: "pf_per_36", label: "PF/36", group: "Per-36 Rates", num: true, sortMetric: "pf_per_36", format: (v) => formatStatValue(v, 1), tooltip: "Personal fouls per 36 minutes" },
      { key: "fga_per_36", label: "FGA/36", group: "Shot Rates", num: true, sortMetric: "fga_per_36", format: (v) => formatStatValue(v, 1), tooltip: "FGA per 36 minutes" },
      { key: "fg3a_per_36", label: "3PA/36", group: "Shot Rates", num: true, sortMetric: "fg3a_per_36", format: (v) => formatStatValue(v, 1), tooltip: "3PA per 36 minutes" },
      { key: "fta_per_36", label: "FTA/36", group: "Shot Rates", num: true, sortMetric: "fta_per_36", format: (v) => formatStatValue(v, 1), tooltip: "FTA per 36 minutes" },
      { key: "ts_pct", label: "TS%", group: "Efficiency", num: true, sortMetric: "ts_pct", format: formatPctValue, tooltip: "True Shooting %" },
      { key: "efg_pct", label: "eFG%", group: "Efficiency", num: true, sortMetric: "efg_pct", format: formatPctValue, tooltip: "Effective Field Goal %" }
    ]
  },
  {
    id: "playmaking",
    label: "Playmaking",
    description: "Assist creation, turnover economy, and ball-handling workload.",
    columns: [
      { key: "gp", label: "GP", group: "Participation", num: true, sortMetric: "gp", format: formatIntValue, tooltip: "Games Played" },
      { key: "min_per_game", label: "MPG", group: "Participation", num: true, sortMetric: "min_per_game", format: (v) => formatStatValue(v, 1), tooltip: "Minutes Per Game" },
      { key: "ast", label: "AST", group: "Passing", num: true, sortMetric: "ast", format: formatIntValue, tooltip: "Total Assists" },
      { key: "ast_per_game", label: "APG", group: "Passing", num: true, sortMetric: "ast_per_game", format: (v) => formatStatValue(v, 1), tooltip: "Assists Per Game" },
      { key: "ast_per_36", label: "AST/36", group: "Passing", num: true, sortMetric: "ast_per_36", format: (v) => formatStatValue(v, 1), tooltip: "Assists Per 36 Minutes" },
      { key: "tov", label: "TOV", group: "Turnovers", num: true, sortMetric: "tov", format: formatIntValue, tooltip: "Total Turnovers" },
      { key: "tov_per_game", label: "TOPG", group: "Turnovers", num: true, sortMetric: "tov_per_game", format: (v) => formatStatValue(v, 1), tooltip: "Turnovers Per Game" },
      { key: "tov_per_36", label: "TOV/36", group: "Turnovers", num: true, sortMetric: "tov_per_36", format: (v) => formatStatValue(v, 1), tooltip: "Turnovers Per 36 Minutes" },
      { key: "pts_per_game", label: "PPG", group: "Scoring", num: true, sortMetric: "pts_per_game", format: (v) => formatStatValue(v, 1), tooltip: "Points Per Game" },
      { key: "ts_pct", label: "TS%", group: "Scoring", num: true, sortMetric: "ts_pct", format: formatPctValue, tooltip: "True Shooting %" }
    ]
  },
  {
    id: "rebounding",
    label: "Rebounding",
    description: "Total, offensive, and defensive rebounding volume and rates.",
    columns: [
      { key: "gp", label: "GP", group: "Participation", num: true, sortMetric: "gp", format: formatIntValue, tooltip: "Games Played" },
      { key: "min_per_game", label: "MPG", group: "Participation", num: true, sortMetric: "min_per_game", format: (v) => formatStatValue(v, 1), tooltip: "Minutes Per Game" },
      { key: "reb_total", label: "REB", group: "Total Rebounds", num: true, sortMetric: "reb_total", format: formatIntValue, tooltip: "Total Rebounds" },
      { key: "reb_total_per_game", label: "RPG", group: "Total Rebounds", num: true, sortMetric: "reb_total_per_game", format: (v) => formatStatValue(v, 1), tooltip: "Rebounds Per Game" },
      { key: "reb_per_36", label: "REB/36", group: "Total Rebounds", num: true, sortMetric: "reb_per_36", format: (v) => formatStatValue(v, 1), tooltip: "Rebounds Per 36 Minutes" },
      { key: "oreb", label: "OREB", group: "Offensive", num: true, sortMetric: "oreb", format: formatIntValue, tooltip: "Offensive Rebounds" },
      { key: "oreb_per_game", label: "OREB/G", group: "Offensive", num: true, sortMetric: "oreb_per_game", format: (v) => formatStatValue(v, 1), tooltip: "Offensive Rebounds Per Game" },
      { key: "oreb_per_36", label: "OREB/36", group: "Offensive", num: true, sortMetric: "oreb_per_36", format: (v) => formatStatValue(v, 1), tooltip: "Offensive Rebounds Per 36 Minutes" },
      { key: "dreb", label: "DREB", group: "Defensive", num: true, sortMetric: "dreb", format: formatIntValue, tooltip: "Defensive Rebounds" },
      { key: "dreb_per_game", label: "DREB/G", group: "Defensive", num: true, sortMetric: "dreb_per_game", format: (v) => formatStatValue(v, 1), tooltip: "Defensive Rebounds Per Game" },
      { key: "dreb_per_36", label: "DREB/36", group: "Defensive", num: true, sortMetric: "dreb_per_36", format: (v) => formatStatValue(v, 1), tooltip: "Defensive Rebounds Per 36 Minutes" }
    ]
  },
  { id: "impact", label: "Impact", description: "CourtLens descriptive RAPM and Box-Prior RAPM, with declared fit windows.",
    columns: impactColumns(["rapm", "orapm", "drapm", "bpr", "obpr", "dbpr", "rapm_2y", "orapm_2y", "drapm_2y", "rapm_3y", "orapm_3y", "drapm_3y"], "CourtLens impact") },
  { id: "onoff", label: "On-Off", description: "Observed per-team on/off ratings from accepted public play-by-play.",
    columns: impactColumns(["on_net_rating", "onoff_net_rating", "on_offensive_rating", "onoff_offensive_rating", "on_defensive_rating", "onoff_defensive_rating"], "On/off · per 100 controls") },
  { id: "sixfactor", label: "Six Factor", description: "Six separate favorable-sign factor estimates; factors are not additive.",
    columns: [...impactColumns(["rapm", "orapm", "drapm"], "1Y RAPM"), ...impactColumns(["o_ts", "o_tov", "o_reb", "d_ts", "d_tov", "d_reb"], "Six factors · percentage points")] }

];

for (const [id, keys] of Object.entries({
  defense: ["drapm", "dbpr", "d_ts", "d_tov", "d_reb", "pbp_stl_per100", "pbp_blk_per100", "pbp_drb_pct", "pbp_foul_frequency", "pbp_block_recovered_pct", "matchup_fga_per100", "pbp_charges_drawn", "pbp_credited_ftov_per100"],
  advanced: ["impact_ts_pct", "impact_rts", "impact_tsadd_per100", "impact_three_point_rate", "impact_ftr", "impact_ast_per100", "pbp_bad_pass_tov", "pbp_rim_assists", "pbp_self_miss_orb_pct", "pbp_team_miss_orb_pct"],
  trueshooting: impactDefinitions.metrics.filter(metric => /^pbp_(create|space|trans|finish|unknown)_/.test(metric.key)).map(metric => metric.key)
})) {
  STATS_PRESETS.find(preset => preset.id === id)?.columns.push(...impactColumns(keys, "CourtLens public-source sample"));
}

// Comprehensive catalog of registered and formatted metrics for column selection
export const ALL_CATALOG_METRICS: Record<string, ColumnDefinition> = {
  // Participation
  gp: { key: "gp", label: "GP", group: "Participation", num: true, sortMetric: "gp", format: formatIntValue, tooltip: "Games Played" },
  min: { key: "min", label: "MIN", group: "Participation", num: true, sortMetric: "min", format: formatIntValue, tooltip: "Total Minutes Played" },
  min_per_game: { key: "min_per_game", label: "MPG", group: "Participation", num: true, sortMetric: "min_per_game", format: (v) => formatStatValue(v, 1), tooltip: "Minutes Per Game" },

  // Scoring
  pts: { key: "pts", label: "PTS", group: "Scoring", num: true, sortMetric: "pts", format: formatIntValue, tooltip: "Total Points Scored" },
  pts_per_game: { key: "pts_per_game", label: "PPG", group: "Scoring", num: true, sortMetric: "pts_per_game", format: (v) => formatStatValue(v, 1), countingModeKeys: { raw: "pts", per_game: "pts_per_game", per_36: "pts_per_36" }, tooltip: "Points Per Game" },
  pts_per_36: { key: "pts_per_36", label: "PTS/36", group: "Scoring", num: true, sortMetric: "pts_per_36", format: (v) => formatStatValue(v, 1), tooltip: "Points Per 36 Minutes" },

  // Shooting & Efficiency
  fgm: { key: "fgm", label: "FGM", group: "Shooting", num: true, sortMetric: "fgm", format: formatIntValue, tooltip: "Field Goals Made" },
  fga: { key: "fga", label: "FGA", group: "Shooting", num: true, sortMetric: "fga", format: formatIntValue, tooltip: "Field Goals Attempted" },
  fg_pct: { key: "fg_pct", label: "FG%", group: "Shooting", num: true, sortMetric: "fg_pct", format: formatPctValue, tooltip: "Field Goal Percentage (FGM / FGA)" },
  fg3m: { key: "fg3m", label: "3PM", group: "Shooting", num: true, sortMetric: "fg3m", format: formatIntValue, tooltip: "3-Point Field Goals Made" },
  fg3a: { key: "fg3a", label: "3PA", group: "Shooting", num: true, sortMetric: "fg3a", format: formatIntValue, tooltip: "3-Point Field Goals Attempted" },
  fg3_pct: { key: "fg3_pct", label: "3P%", group: "Shooting", num: true, sortMetric: "fg3_pct", format: formatPctValue, tooltip: "3-Point Percentage (3PM / 3PA)" },
  fg3a_per_36: { key: "fg3a_per_36", label: "3PA/36", group: "Shooting", num: true, sortMetric: "fg3a_per_36", format: (v) => formatStatValue(v, 1), tooltip: "3-Point Attempts Per 36 Minutes" },
  fga_per_36: { key: "fga_per_36", label: "FGA/36", group: "Shooting", num: true, sortMetric: "fga_per_36", format: (v) => formatStatValue(v, 1), tooltip: "Field Goal Attempts Per 36 Minutes" },
  ftm: { key: "ftm", label: "FTM", group: "Shooting", num: true, sortMetric: "ftm", format: formatIntValue, tooltip: "Free Throws Made" },
  fta: { key: "fta", label: "FTA", group: "Shooting", num: true, sortMetric: "fta", format: formatIntValue, tooltip: "Free Throws Attempted" },
  ft_pct: { key: "ft_pct", label: "FT%", group: "Shooting", num: true, sortMetric: "ft_pct", format: formatPctValue, tooltip: "Free Throw Percentage (FTM / FTA)" },
  fta_per_36: { key: "fta_per_36", label: "FTA/36", group: "Shooting", num: true, sortMetric: "fta_per_36", format: (v) => formatStatValue(v, 1), tooltip: "Free Throw Attempts Per 36 Minutes" },
  ts_pct: { key: "ts_pct", label: "TS%", group: "Efficiency", num: true, sortMetric: "ts_pct", format: formatPctValue, tooltip: "True Shooting %: PTS / (2 * (FGA + 0.44 * FTA))" },
  efg_pct: { key: "efg_pct", label: "eFG%", group: "Efficiency", num: true, sortMetric: "efg_pct", format: formatPctValue, tooltip: "Effective Field Goal %: (FGM + 0.5 * 3PM) / FGA" },
  ftr: { key: "ftr", label: "FTR", group: "Efficiency", num: true, sortMetric: "ftr", format: (v) => formatStatValue(v, 3), tooltip: "Free Throw Rate: FTA / FGA" },

  // Rebounding
  reb: { key: "reb", label: "REB", group: "Rebounding", num: true, sortMetric: "reb", format: formatIntValue, tooltip: "Total Rebounds" },
  reb_per_game: { key: "reb_per_game", label: "RPG", group: "Rebounding", num: true, sortMetric: "reb_per_game", format: (v) => formatStatValue(v, 1), countingModeKeys: { raw: "reb", per_game: "reb_per_game", per_36: "reb_per_36" }, tooltip: "Rebounds Per Game" },
  reb_per_36: { key: "reb_per_36", label: "REB/36", group: "Rebounding", num: true, sortMetric: "reb_per_36", format: (v) => formatStatValue(v, 1), tooltip: "Rebounds Per 36 Minutes" },
  oreb: { key: "oreb", label: "OREB", group: "Rebounding", num: true, sortMetric: "oreb", format: formatIntValue, tooltip: "Offensive Rebounds" },
  oreb_per_game: { key: "oreb_per_game", label: "OREB/G", group: "Rebounding", num: true, sortMetric: "oreb_per_game", format: (v) => formatStatValue(v, 1), tooltip: "Offensive Rebounds Per Game" },
  oreb_per_36: { key: "oreb_per_36", label: "OREB/36", group: "Rebounding", num: true, sortMetric: "oreb_per_36", format: (v) => formatStatValue(v, 1), tooltip: "Offensive Rebounds Per 36 Minutes" },
  dreb: { key: "dreb", label: "DREB", group: "Rebounding", num: true, sortMetric: "dreb", format: formatIntValue, tooltip: "Defensive Rebounds" },
  dreb_per_game: { key: "dreb_per_game", label: "DREB/G", group: "Rebounding", num: true, sortMetric: "dreb_per_game", format: (v) => formatStatValue(v, 1), tooltip: "Defensive Rebounds Per Game" },
  dreb_per_36: { key: "dreb_per_36", label: "DREB/36", group: "Rebounding", num: true, sortMetric: "dreb_per_36", format: (v) => formatStatValue(v, 1), tooltip: "Defensive Rebounds Per 36 Minutes" },

  // Playmaking & Ball Security
  ast: { key: "ast", label: "AST", group: "Playmaking", num: true, sortMetric: "ast", format: formatIntValue, tooltip: "Assists" },
  ast_per_game: { key: "ast_per_game", label: "APG", group: "Playmaking", num: true, sortMetric: "ast_per_game", format: (v) => formatStatValue(v, 1), countingModeKeys: { raw: "ast", per_game: "ast_per_game", per_36: "ast_per_36" }, tooltip: "Assists Per Game" },
  ast_per_36: { key: "ast_per_36", label: "AST/36", group: "Playmaking", num: true, sortMetric: "ast_per_36", format: (v) => formatStatValue(v, 1), tooltip: "Assists Per 36 Minutes" },
  tov: { key: "tov", label: "TOV", group: "Ball Security", num: true, sortMetric: "tov", format: formatIntValue, tooltip: "Turnovers" },
  tov_per_game: { key: "tov_per_game", label: "TOV/G", group: "Ball Security", num: true, sortMetric: "tov_per_game", format: (v) => formatStatValue(v, 1), tooltip: "Turnovers Per Game" },
  tov_per_36: { key: "tov_per_36", label: "TOV/36", group: "Ball Security", num: true, sortMetric: "tov_per_36", format: (v) => formatStatValue(v, 1), tooltip: "Turnovers Per 36 Minutes" },

  // Defense & Fouls
  stl: { key: "stl", label: "STL", group: "Defense", num: true, sortMetric: "stl", format: formatIntValue, tooltip: "Steals" },
  stl_per_game: { key: "stl_per_game", label: "SPG", group: "Defense", num: true, sortMetric: "stl_per_game", format: (v) => formatStatValue(v, 1), countingModeKeys: { raw: "stl", per_game: "stl_per_game", per_36: "stl_per_36" }, tooltip: "Steals Per Game" },
  stl_per_36: { key: "stl_per_36", label: "STL/36", group: "Defense", num: true, sortMetric: "stl_per_36", format: (v) => formatStatValue(v, 1), tooltip: "Steals Per 36 Minutes" },
  blk: { key: "blk", label: "BLK", group: "Defense", num: true, sortMetric: "blk", format: formatIntValue, tooltip: "Blocks" },
  blk_per_game: { key: "blk_per_game", label: "BPG", group: "Defense", num: true, sortMetric: "blk_per_game", format: (v) => formatStatValue(v, 1), countingModeKeys: { raw: "blk", per_game: "blk_per_game", per_36: "blk_per_36" }, tooltip: "Blocks Per Game" },
  blk_per_36: { key: "blk_per_36", label: "BLK/36", group: "Defense", num: true, sortMetric: "blk_per_36", format: (v) => formatStatValue(v, 1), tooltip: "Blocks Per 36 Minutes" },
  pf: { key: "pf", label: "PF", group: "Fouls", num: true, sortMetric: "pf", format: formatIntValue, tooltip: "Personal Fouls" },
  pf_per_game: { key: "pf_per_game", label: "PFG", group: "Fouls", num: true, sortMetric: "pf_per_game", format: (v) => formatStatValue(v, 1), tooltip: "Personal Fouls Per Game" },
  pf_per_36: { key: "pf_per_36", label: "PF/36", group: "Fouls", num: true, sortMetric: "pf_per_36", format: (v) => formatStatValue(v, 1), tooltip: "Personal Fouls Per 36 Minutes" },

  ...IMPACT_COLUMNS,

  // Gated / Unavailable Metrics
  six_factor_impact: { key: "six_factor_impact", label: "SIX FACTOR", group: "Impact", num: true, sortMetric: "six_factor_impact", tooltip: "Six-Factor RAPM Impact; requires admitted inputs", format: () => "—" }
};

export function buildCustomViewPreset(customView: CustomViewDefinition): PresetDefinition {
  const unavailableSet = new Set(customView.unavailable_columns ?? []);
  const columns: ColumnDefinition[] = customView.columns.map((key) => {
    if (unavailableSet.has(key)) {
      return {
        key,
        label: key.toUpperCase(),
        group: "Unavailable",
        num: true,
        sortMetric: key,
        tooltip: `Unavailable metric (${key}) — gated pending rich analytical data`,
        format: () => "—"
      };
    }
    const def = ALL_CATALOG_METRICS[key];
    if (def) return def;
    return {
      key,
      label: key.toUpperCase(),
      group: "Custom",
      num: true,
      sortMetric: key,
      format: (v) => formatStatValue(v, 1)
    };
  });

  return {
    id: customView.id as PresetId,
    label: customView.name,
    description: `Personal custom view: ${customView.name} (${columns.length} columns)`,
    columns,
    gated:
      customView.unavailable_columns && customView.unavailable_columns.length > 0
        ? {
            block: "Rich Data",
            reason: `Contains ${customView.unavailable_columns.length} unavailable metric(s): ${customView.unavailable_columns.join(", ")}.`,
            status: "partial"
          }
        : undefined
  };
}

export function getPresetById(
  id: string,
  customViews?: CustomViewDefinition[]
): PresetDefinition {
  if (customViews && customViews.length > 0) {
    const custom = customViews.find((v) => v.id === id);
    if (custom) {
      return buildCustomViewPreset(custom);
    }
  }
  const found = STATS_PRESETS.find((p) => p.id === id);
  return found ?? STATS_PRESETS[0];
}

export function computeHeaderGroups(columns: ColumnDefinition[]): HeaderGroup[] {
  const groups: HeaderGroup[] = [];
  let currentGroup = "";
  let currentSpan = 0;

  for (const col of columns) {
    if (col.group === currentGroup) {
      currentSpan++;
    } else {
      if (currentSpan > 0) {
        groups.push({ label: currentGroup, colSpan: currentSpan });
      }
      currentGroup = col.group;
      currentSpan = 1;
    }
  }

  if (currentSpan > 0) {
    groups.push({ label: currentGroup, colSpan: currentSpan });
  }

  return groups;
}

export function calculateCohortPercentiles(
  items: PlayerResearchItem[],
  metricKeys: string[]
): Record<string, Record<string, number | null>> {
  const result: Record<string, Record<string, number | null>> = {};
  for (const item of items) {
    result[item.player_id] = {};
  }

  for (const key of metricKeys) {
    const entries: { playerId: string; val: number }[] = [];
    for (const item of items) {
      const v = item.metrics[key];
      if (typeof v === "number" && !isNaN(v)) {
        entries.push({ playerId: item.player_id, val: v });
      } else {
        result[item.player_id][key] = null;
      }
    }

    if (entries.length < 2) {
      for (const e of entries) {
        result[e.playerId][key] = null;
      }
      continue;
    }

    // Midrank percentile formula from contract:
    // 100 * (count_less + 0.5 * count_equal) / n
    const values = entries.map((e) => e.val);
    const n = values.length;

    for (const e of entries) {
      let countLess = 0;
      let countEqual = 0;
      for (const val of values) {
        if (val < e.val) countLess++;
        else if (val === e.val) countEqual++;
      }
      const pct = Math.round((100 * (countLess + 0.5 * countEqual)) / n);
      result[e.playerId][key] = Math.min(99, Math.max(1, pct));
    }
  }

  return result;
}

/** Contiguous runs preserve custom column order, including repeated group names. */
export function tableGroups(preset: PresetDefinition): Array<HeaderGroup & { start: number }> {
  const groups: Array<HeaderGroup & { start: number }> = [];
  preset.columns.forEach((column, index) => {
    const label = preset.groupLabels?.[column.group] ?? column.group;
    const last = groups.at(-1);
    if (last?.label === label) last.colSpan++;
    else groups.push({ label, colSpan: 1, start: index });
  });
  return groups;
}
