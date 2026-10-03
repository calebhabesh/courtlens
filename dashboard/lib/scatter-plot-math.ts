/**
 * Statistical calculations for Two-Axis Scatter Plot (F06).
 *
 * Implements paired observation extraction, sample standard deviation,
 * outlier detection via normalized Euclidean distance from cohort centroid,
 * median/mean reference lines, and linear scale mappings.
 */

import type { PlayerResearchItem } from "./types";

export interface ScatterPoint {
  playerId: string;
  playerName: string;
  teams: string[];
  gamesPlayed: number;
  totalMinutes: number;
  x: number;
  y: number;
  isOutlier: boolean;
  outlierReason?: string;
}

export interface ScatterDataset {
  points: ScatterPoint[];
  omittedCount: number;
  totalCount: number;
  xStats: MetricSummaryStats;
  yStats: MetricSummaryStats;
  xDomain: [number, number];
  yDomain: [number, number];
}

export interface MetricSummaryStats {
  mean: number;
  median: number;
  sd: number;
  min: number;
  max: number;
  n: number;
}

/**
 * Compute descriptive summary statistics for an array of numbers.
 */
export function computeSummaryStats(values: number[]): MetricSummaryStats {
  if (values.length === 0) {
    return { mean: 0, median: 0, sd: 0, min: 0, max: 0, n: 0 };
  }

  const n = values.length;
  const sorted = [...values].sort((a, b) => a - b);
  const min = sorted[0];
  const max = sorted[n - 1];

  const sum = sorted.reduce((acc, v) => acc + v, 0);
  const mean = sum / n;

  // Median
  const mid = Math.floor(n / 2);
  const median = n % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;

  // Sample standard deviation (Bessel's correction n-1 for n > 1)
  let variance = 0;
  if (n > 1) {
    const sumSquares = sorted.reduce((acc, v) => acc + Math.pow(v - mean, 2), 0);
    variance = sumSquares / (n - 1);
  }
  const sd = Math.sqrt(variance);

  return { mean, median, sd, min, max, n };
}

/**
 * Build scatter plot dataset from player items and selected X / Y metric keys.
 * Strictly enforces paired valid observations (omits players missing either metric).
 */
export function buildScatterDataset(
  items: PlayerResearchItem[],
  xKey: string,
  yKey: string,
  outlierThreshold = 1.75
): ScatterDataset {
  const paired: Array<{ player: PlayerResearchItem; x: number; y: number }> = [];
  let omittedCount = 0;

  for (const player of items) {
    const rawX = player.metrics[xKey];
    const rawY = player.metrics[yKey];

    if (
      rawX !== null &&
      rawX !== undefined &&
      typeof rawX === "number" &&
      Number.isFinite(rawX) &&
      rawY !== null &&
      rawY !== undefined &&
      typeof rawY === "number" &&
      Number.isFinite(rawY)
    ) {
      paired.push({ player, x: rawX, y: rawY });
    } else {
      omittedCount++;
    }
  }

  const xVals = paired.map((p) => p.x);
  const yVals = paired.map((p) => p.y);

  const xStats = computeSummaryStats(xVals);
  const yStats = computeSummaryStats(yVals);

  // Identify statistical outliers (e.g. > threshold standard deviations from mean)
  const points: ScatterPoint[] = paired.map((item) => {
    const xDist = xStats.sd > 0 ? (item.x - xStats.mean) / xStats.sd : 0;
    const yDist = yStats.sd > 0 ? (item.y - yStats.mean) / yStats.sd : 0;
    const euclideanDist = Math.sqrt(Math.pow(xDist, 2) + Math.pow(yDist, 2));

    const isOutlier = euclideanDist >= outlierThreshold || Math.abs(xDist) >= 2.0 || Math.abs(yDist) >= 2.0;

    let outlierReason: string | undefined;
    if (isOutlier) {
      const reasons: string[] = [];
      if (xDist >= 1.0) reasons.push(`High X (+${xDist.toFixed(1)}σ)`);
      else if (xDist <= -1.0) reasons.push(`Low X (${xDist.toFixed(1)}σ)`);
      if (yDist >= 1.0) reasons.push(`High Y (+${yDist.toFixed(1)}σ)`);
      else if (yDist <= -1.0) reasons.push(`Low Y (${yDist.toFixed(1)}σ)`);
      outlierReason = reasons.length > 0 ? reasons.join(", ") : `Outlier (${euclideanDist.toFixed(1)}σ)`;
    }

    return {
      playerId: item.player.player_id,
      playerName: item.player.player_name,
      teams: item.player.teams || [],
      gamesPlayed: item.player.games_played,
      totalMinutes: item.player.total_minutes,
      x: item.x,
      y: item.y,
      isOutlier,
      outlierReason
    };
  });

  // Calculate domains with 6% margins for visual padding
  const xSpan = Math.max(xStats.max - xStats.min, 1);
  const ySpan = Math.max(yStats.max - yStats.min, 1);
  const xPadding = xSpan * 0.06;
  const yPadding = ySpan * 0.06;

  const xDomain: [number, number] = [
    Math.max(0, xStats.min - xPadding),
    xStats.max + xPadding
  ];

  // If min is 0 or positive, don't drop below 0 unless min is already negative
  const yMinBound = yStats.min >= 0 ? Math.max(0, yStats.min - yPadding) : yStats.min - yPadding;
  const yDomain: [number, number] = [
    yMinBound,
    yStats.max + yPadding
  ];

  return {
    points,
    omittedCount,
    totalCount: items.length,
    xStats,
    yStats,
    xDomain,
    yDomain
  };
}

/**
 * Coordinate projection helpers for SVG viewport.
 */
export function projectX(
  value: number,
  domain: [number, number],
  width: number,
  paddingLeft: number,
  paddingRight: number
): number {
  const plotWidth = width - paddingLeft - paddingRight;
  const [min, max] = domain;
  if (max === min) return paddingLeft + plotWidth / 2;
  const fraction = (value - min) / (max - min);
  return paddingLeft + Math.max(0, Math.min(1, fraction)) * plotWidth;
}

export function projectY(
  value: number,
  domain: [number, number],
  height: number,
  paddingTop: number,
  paddingBottom: number
): number {
  const plotHeight = height - paddingTop - paddingBottom;
  const [min, max] = domain;
  if (max === min) return paddingTop + plotHeight / 2;
  const fraction = (value - min) / (max - min);
  // Invert for SVG (0 is top)
  return height - paddingBottom - Math.max(0, Math.min(1, fraction)) * plotHeight;
}
