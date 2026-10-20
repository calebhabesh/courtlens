/**
 * Domain calculations, mathematical aggregations, and preset definitions
 * for Player Pages, Recent Games, Showcase Cards, and Multi-Season Career Views (Block B11).
 *
 * Adheres strictly to CourtLens core principles:
 * 1. Temporal discipline: only appearances strictly prior to cutoff are evaluated.
 * 2. Zero inferred claims: absent box-score rows are unknown, not zero outcomes.
 * 3. Incomplete careers labelled: careers are explicitly bounded to admitted dataset seasons.
 */

export type CountingExposureMode = "per_game" | "per_36";

/**
 * Scale a counting stat to per-36 minutes exposure.
 * Returns null if minutes are missing, zero, or non-positive.
 */
export function scaleToPer36(value: number | null | undefined, minutes: number | null | undefined): number | null {
  if (value === null || value === undefined || minutes === null || minutes === undefined || minutes <= 0) {
    return null;
  }
  return Number(((value / minutes) * 36).toFixed(1));
}

// =========================================================================
// Multi-Season Career View Aggregations (F13)
// =========================================================================

export interface SeasonCareerRow {
  season: string;
  teams: string;
  gamesPlayed: number;
  minutes: number | null;
  minPerGame: number | null;
  ptsPerGame: number | null;
  rebPerGame: number | null;
  astPerGame: number | null;
  stlPerGame: number | null;
  blkPerGame: number | null;
  fgPct: number | null;
  fg3Pct: number | null;
  ftPct: number | null;
  tsPct: number | null;
  efgPct: number | null;
  fantasyPerGame: number | null;
}

export interface CareerRollup {
  admittedSeasons: string[];
  totalGames: number;
  totalMinutes: number;
  avgMinutes: number | null;
  careerPtsPerGame: number | null;
  careerRebPerGame: number | null;
  careerAstPerGame: number | null;
  careerTsPct: number | null;
  careerEfgPct: number | null;
  disclaimer: string;
}

/**
 * Aggregates multi-season profile rows into a career rollup with explicit boundary disclosures.
 */
export function aggregateCareerStats(
  seasonRows: SeasonCareerRow[],
  admittedSeasonsList: string[]
): CareerRollup {
  const seasonsPresent = seasonRows.map((r) => r.season);
  const admittedSorted = [...admittedSeasonsList].sort();

  if (seasonRows.length === 0) {
    return {
      admittedSeasons: admittedSorted,
      totalGames: 0,
      totalMinutes: 0,
      avgMinutes: null,
      careerPtsPerGame: null,
      careerRebPerGame: null,
      careerAstPerGame: null,
      careerTsPct: null,
      careerEfgPct: null,
      disclaimer: `Career data is strictly scoped to admitted dataset seasons (${admittedSorted.join(", ")}). Historical seasons outside admitted coverage are not silently completed or inferred.`
    };
  }

  let totGp = 0;
  let totMin = 0;
  let weightedPts = 0;
  let weightedReb = 0;
  let weightedAst = 0;
  let weightedTs = 0;
  let tsGp = 0;
  let weightedEfg = 0;
  let efgGp = 0;

  for (const r of seasonRows) {
    const gp = r.gamesPlayed;
    if (gp <= 0) continue;

    totGp += gp;
    totMin += r.minutes ?? (r.minPerGame ? r.minPerGame * gp : 0);

    if (r.ptsPerGame !== null) weightedPts += r.ptsPerGame * gp;
    if (r.rebPerGame !== null) weightedReb += r.rebPerGame * gp;
    if (r.astPerGame !== null) weightedAst += r.astPerGame * gp;

    if (r.tsPct !== null) {
      weightedTs += r.tsPct * gp;
      tsGp += gp;
    }
    if (r.efgPct !== null) {
      weightedEfg += r.efgPct * gp;
      efgGp += gp;
    }
  }

  const avgMin = totGp > 0 ? Number((totMin / totGp).toFixed(1)) : null;
  const ppg = totGp > 0 ? Number((weightedPts / totGp).toFixed(1)) : null;
  const rpg = totGp > 0 ? Number((weightedReb / totGp).toFixed(1)) : null;
  const apg = totGp > 0 ? Number((weightedAst / totGp).toFixed(1)) : null;
  const ts = tsGp > 0 ? Number((weightedTs / tsGp).toFixed(4)) : null;
  const efg = efgGp > 0 ? Number((weightedEfg / efgGp).toFixed(4)) : null;

  const disclaimer = `Career statistics represent ${totGp} appearances across admitted dataset seasons (${seasonsPresent.join(", ")}). Prior or unadmitted seasons are strictly excluded from career totals to avoid silent false completeness.`;

  return {
    admittedSeasons: admittedSorted,
    totalGames: totGp,
    totalMinutes: Number(totMin.toFixed(1)),
    avgMinutes: avgMin,
    careerPtsPerGame: ppg,
    careerRebPerGame: rpg,
    careerAstPerGame: apg,
    careerTsPct: ts,
    careerEfgPct: efg,
    disclaimer
  };
}

// =========================================================================
// Showcase Card Focus Presets (F12)
// =========================================================================

export type ShowcasePresetId = "overall" | "scoring" | "playmaking_defense" | "per_36";

export interface ShowcaseMetricDefinition {
  key: string;
  label: string;
  format: (val: number | null | undefined) => string;
}

export interface ShowcasePresetConfig {
  id: ShowcasePresetId;
  label: string;
  metrics: ShowcaseMetricDefinition[];
}

export const SHOWCASE_PRESETS: ShowcasePresetConfig[] = [
  {
    id: "overall",
    label: "Overall Impact",
    metrics: [
      { key: "pts_per_game", label: "PPG", format: (v) => formatNumber(v, 1) },
      { key: "reb_total_per_game", label: "RPG", format: (v) => formatNumber(v, 1) },
      { key: "ast_per_game", label: "APG", format: (v) => formatNumber(v, 1) },
      { key: "min_per_game", label: "MPG", format: (v) => formatNumber(v, 1) },
      { key: "ts_pct", label: "TS%", format: formatPercent },
      { key: "efg_pct", label: "eFG%", format: formatPercent },
      { key: "legacy_fantasy_score_per_game", label: "FANTASY", format: (v) => formatNumber(v, 1) }
    ]
  },
  {
    id: "scoring",
    label: "Scoring & Shooting",
    metrics: [
      { key: "pts_per_game", label: "PPG", format: (v) => formatNumber(v, 1) },
      { key: "fg_pct", label: "FG%", format: formatPercent },
      { key: "fg3_pct", label: "3P%", format: formatPercent },
      { key: "ft_pct", label: "FT%", format: formatPercent },
      { key: "efg_pct", label: "eFG%", format: formatPercent },
      { key: "ts_pct", label: "TS%", format: formatPercent },
      { key: "ftr", label: "FTR", format: (v) => formatNumber(v, 3) }
    ]
  },
  {
    id: "playmaking_defense",
    label: "Playmaking & Defense",
    metrics: [
      { key: "ast_per_game", label: "APG", format: (v) => formatNumber(v, 1) },
      { key: "stl_per_game", label: "SPG", format: (v) => formatNumber(v, 1) },
      { key: "blk_per_game", label: "BPG", format: (v) => formatNumber(v, 1) },
      { key: "tov_per_game", label: "TOV/G", format: (v) => formatNumber(v, 1) },
      { key: "reb_total_per_game", label: "RPG", format: (v) => formatNumber(v, 1) },
      { key: "oreb_per_game", label: "OREB/G", format: (v) => formatNumber(v, 1) },
      { key: "dreb_per_game", label: "DREB/G", format: (v) => formatNumber(v, 1) }
    ]
  },
  {
    id: "per_36",
    label: "Per 36 Exposure",
    metrics: [
      { key: "pts_per_36", label: "PTS/36", format: (v) => formatNumber(v, 1) },
      { key: "reb_per_36", label: "REB/36", format: (v) => formatNumber(v, 1) },
      { key: "ast_per_36", label: "AST/36", format: (v) => formatNumber(v, 1) },
      { key: "stl_per_36", label: "STL/36", format: (v) => formatNumber(v, 1) },
      { key: "blk_per_36", label: "BLK/36", format: (v) => formatNumber(v, 1) },
      { key: "fga_per_36", label: "FGA/36", format: (v) => formatNumber(v, 1) },
      { key: "min_per_game", label: "MPG", format: (v) => formatNumber(v, 1) }
    ]
  }
];

export function formatNumber(val: number | null | undefined, digits = 1): string {
  if (val === null || val === undefined || isNaN(val)) return "—";
  return val.toFixed(digits);
}

export function formatPercent(val: number | null | undefined): string {
  if (val === null || val === undefined || isNaN(val)) return "—";
  return `${(val * 100).toFixed(1)}%`;
}
