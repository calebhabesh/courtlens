/**
 * Domain calculations, mathematical aggregations, and preset definitions
 * for Player Pages, Recent Games, Showcase Cards, and Multi-Season Career Views (Block B11).
 *
 * Adheres strictly to CourtLoad core principles:
 * 1. Temporal discipline: only appearances strictly prior to cutoff are evaluated.
 * 2. Zero inferred claims: absent box-score rows are unknown, not zero outcomes.
 * 3. Incomplete careers labelled: careers are explicitly bounded to admitted dataset seasons.
 */

import type { PlayerGameLogItem } from "./types";

export type RecentGamesWindow = "last_5" | "last_10" | "last_20" | "all";
export type CountingExposureMode = "per_game" | "per_36";
export type RecentGamesViewMode = "table" | "cards";

export interface RecentFormSummary {
  sampleSize: number;
  totalMinutes: number;
  avgMinutes: number | null;
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
  // Highlights
  highGamePoints: { points: number; date: string; opponent: string } | null;
  highGameRebounds: { rebounds: number; date: string; opponent: string } | null;
  highGameAssists: { assists: number; date: string; opponent: string } | null;
}

/**
 * Filter game log to confirmed active appearances and slice to requested recent window.
 */
export function sliceRecentGames(
  games: PlayerGameLogItem[],
  window: RecentGamesWindow
): PlayerGameLogItem[] {
  // Games are typically supplied reverse-chronological (newest first).
  // Filter for confirmed active appearances (exclude inactive/unobserved).
  const appeared = games.filter((g) => g.appearance === "appeared");

  switch (window) {
    case "last_5":
      return appeared.slice(0, 5);
    case "last_10":
      return appeared.slice(0, 10);
    case "last_20":
      return appeared.slice(0, 20);
    case "all":
    default:
      return appeared;
  }
}

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

/**
 * Compute descriptive recent form statistics across a window of games.
 */
export function calculateRecentFormSummary(games: PlayerGameLogItem[]): RecentFormSummary {
  const appeared = games.filter((g) => g.appearance === "appeared");
  const n = appeared.length;

  if (n === 0) {
    return {
      sampleSize: 0,
      totalMinutes: 0,
      avgMinutes: null,
      ptsPerGame: null,
      rebPerGame: null,
      astPerGame: null,
      stlPerGame: null,
      blkPerGame: null,
      fgPct: null,
      fg3Pct: null,
      ftPct: null,
      tsPct: null,
      efgPct: null,
      fantasyPerGame: null,
      highGamePoints: null,
      highGameRebounds: null,
      highGameAssists: null
    };
  }

  let totalMin = 0;
  let totalPts = 0;
  let totalReb = 0;
  let totalAst = 0;
  let totalStl = 0;
  let totalBlk = 0;
  let totalFgm = 0;
  let totalFga = 0;
  let totalFg3m = 0;
  let totalFg3a = 0;
  let totalFtm = 0;
  let totalFta = 0;
  let totalFantasy = 0;

  let highPts: { points: number; date: string; opponent: string } | null = null;
  let highReb: { rebounds: number; date: string; opponent: string } | null = null;
  let highAst: { assists: number; date: string; opponent: string } | null = null;

  for (const g of appeared) {
    const mins = g.minutes ?? 0;
    const pts = g.points ?? 0;
    const reb = g.stats?.rebounds_total ?? 0;
    const ast = g.stats?.assists ?? 0;
    const stl = g.stats?.steals ?? 0;
    const blk = g.stats?.blocks ?? 0;
    const fgm = g.stats?.field_goals_made ?? 0;
    const fga = g.stats?.field_goals_attempted ?? 0;
    const fg3m = g.stats?.three_pointers_made ?? 0;
    const fg3a = g.stats?.three_pointers_attempted ?? 0;
    const ftm = g.stats?.free_throws_made ?? 0;
    const fta = g.stats?.free_throws_attempted ?? 0;
    const fantasy = g.legacy_fantasy_score ?? 0;

    totalMin += mins;
    totalPts += pts;
    totalReb += reb;
    totalAst += ast;
    totalStl += stl;
    totalBlk += blk;
    totalFgm += fgm;
    totalFga += fga;
    totalFg3m += fg3m;
    totalFg3a += fg3a;
    totalFtm += ftm;
    totalFta += fta;
    totalFantasy += fantasy;

    const opp = g.opponent_tricode ?? "OPP";
    if (!highPts || pts > highPts.points) {
      highPts = { points: pts, date: g.game_date, opponent: opp };
    }
    if (!highReb || reb > highReb.rebounds) {
      highReb = { rebounds: reb, date: g.game_date, opponent: opp };
    }
    if (!highAst || ast > highAst.assists) {
      highAst = { assists: ast, date: g.game_date, opponent: opp };
    }
  }

  // True Shooting: PTS / (2 * (FGA + 0.44 * FTA))
  const tsDenom = 2 * (totalFga + 0.44 * totalFta);
  const tsPct = tsDenom > 0 ? totalPts / tsDenom : null;

  // Effective FG: (FGM + 0.5 * 3PM) / FGA
  const efgPct = totalFga > 0 ? (totalFgm + 0.5 * totalFg3m) / totalFga : null;

  const fgPct = totalFga > 0 ? totalFgm / totalFga : null;
  const fg3Pct = totalFg3a > 0 ? totalFg3m / totalFg3a : null;
  const ftPct = totalFta > 0 ? totalFtm / totalFta : null;

  return {
    sampleSize: n,
    totalMinutes: Number(totalMin.toFixed(1)),
    avgMinutes: Number((totalMin / n).toFixed(1)),
    ptsPerGame: Number((totalPts / n).toFixed(1)),
    rebPerGame: Number((totalReb / n).toFixed(1)),
    astPerGame: Number((totalAst / n).toFixed(1)),
    stlPerGame: Number((totalStl / n).toFixed(1)),
    blkPerGame: Number((totalBlk / n).toFixed(1)),
    fgPct: fgPct !== null ? Number(fgPct.toFixed(4)) : null,
    fg3Pct: fg3Pct !== null ? Number(fg3Pct.toFixed(4)) : null,
    ftPct: ftPct !== null ? Number(ftPct.toFixed(4)) : null,
    tsPct: tsPct !== null ? Number(tsPct.toFixed(4)) : null,
    efgPct: efgPct !== null ? Number(efgPct.toFixed(4)) : null,
    fantasyPerGame: Number((totalFantasy / n).toFixed(1)),
    highGamePoints: highPts,
    highGameRebounds: highReb,
    highGameAssists: highAst
  };
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

/**
 * Format CSV rows for recent games export.
 */
export function formatRecentGamesCsv(
  playerName: string,
  games: PlayerGameLogItem[],
  mode: CountingExposureMode
): string {
  const headers = [
    "Date",
    "Player",
    "Team",
    "Opponent",
    "Home/Away",
    "Appearance",
    "Minutes",
    mode === "per_36" ? "PTS/36" : "PTS",
    mode === "per_36" ? "REB/36" : "REB",
    mode === "per_36" ? "AST/36" : "AST",
    mode === "per_36" ? "STL/36" : "STL",
    mode === "per_36" ? "BLK/36" : "BLK",
    "FGM",
    "FGA",
    "FG%",
    "3PM",
    "3PA",
    "3P%",
    "FTM",
    "FTA",
    "FT%",
    "Fantasy Score"
  ];

  const rows = games.map((g) => {
    const mins = g.minutes;
    const pts = mode === "per_36" ? scaleToPer36(g.points, mins) : g.points;
    const reb = mode === "per_36" ? scaleToPer36(g.stats?.rebounds_total, mins) : g.stats?.rebounds_total;
    const ast = mode === "per_36" ? scaleToPer36(g.stats?.assists, mins) : g.stats?.assists;
    const stl = mode === "per_36" ? scaleToPer36(g.stats?.steals, mins) : g.stats?.steals;
    const blk = mode === "per_36" ? scaleToPer36(g.stats?.blocks, mins) : g.stats?.blocks;

    const fgm = g.stats?.field_goals_made ?? "";
    const fga = g.stats?.field_goals_attempted ?? "";
    const fgPct = typeof fgm === "number" && typeof fga === "number" && fga > 0 ? (fgm / fga).toFixed(3) : "";

    const fg3m = g.stats?.three_pointers_made ?? "";
    const fg3a = g.stats?.three_pointers_attempted ?? "";
    const fg3Pct = typeof fg3m === "number" && typeof fg3a === "number" && fg3a > 0 ? (fg3m / fg3a).toFixed(3) : "";

    const ftm = g.stats?.free_throws_made ?? "";
    const fta = g.stats?.free_throws_attempted ?? "";
    const ftPct = typeof ftm === "number" && typeof fta === "number" && fta > 0 ? (ftm / fta).toFixed(3) : "";

    return [
      g.game_date,
      `"${playerName.replaceAll('"', '""')}"`,
      g.team_tricode,
      g.opponent_tricode,
      g.side,
      g.appearance,
      mins ?? "",
      pts ?? "",
      reb ?? "",
      ast ?? "",
      stl ?? "",
      blk ?? "",
      fgm,
      fga,
      fgPct,
      fg3m,
      fg3a,
      fg3Pct,
      ftm,
      fta,
      ftPct,
      g.legacy_fantasy_score ?? ""
    ].join(",");
  });

  return [headers.join(","), ...rows].join("\n");
}
