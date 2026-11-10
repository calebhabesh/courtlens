// RD17 (owner, 2026-11-10): Expected Shots folded into Shot Quality's Model tab as "An earlier attempt".
// Everything here reads the sealed `courtload-expected-shot-retrospective-v2` run as served by
// GET /api/workbench/research/runs/{id}; nothing is recomputed except the relative Brier change.
import type { Experiment, ResearchResult, RunSummary, ShotMetrics } from "./advanced-research";

export const EARLIER_EXPERIMENT = "courtload-expected-shot-retrospective-v2";

export interface EarlierAttempt {
  result: ResearchResult;
  entry: Experiment;
  /** Other registered runs of the experiment (the empty preflight failure), never shown as results. */
  otherRuns: RunSummary[];
}

/** Relative Brier change of the candidate against the baseline, as a share (0.0008127 = 0.08127%). */
export function relativeBrier(selection: { baseline: ShotMetrics; candidate: ShotMetrics }): number | null {
  const { baseline, candidate } = selection;
  return baseline.brier > 0 ? 1 - candidate.brier / baseline.brier : null;
}

/** The registered selection gate as written in the served model card ("Registered minimum: 1%"), as a share. */
export function registeredGate(modelCard: string): number | null {
  const match = /Registered minimum:\s*([\d.]+)%/.exec(modelCard);
  return match ? Number(match[1]) / 100 : null;
}

/** A share as a percentage with enough digits to stay non-zero: 0.0008127 → "0.08%", 0.01 → "1%". */
export function sharePercent(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "—";
  const pct = value * 100;
  const digits = Math.abs(pct) >= 1 ? 0 : Math.abs(pct) >= 0.1 ? 1 : 2;
  return `${Number(pct.toFixed(digits))}%`;
}

export interface EarlierMetricRow { key: "brier" | "log_loss" | "expected_points_mae" | "ece" | "rows"; label: string; note: string }
export const EARLIER_METRICS: readonly EarlierMetricRow[] = [
  { key: "brier", label: "Brier score", note: "make-probability error, lower is better" },
  { key: "log_loss", label: "Log loss", note: "make-probability error, lower is better" },
  { key: "expected_points_mae", label: "Points error per shot", note: "expected against scored points, lower is better" },
  { key: "ece", label: "Calibration error", note: "ten fixed bins, lower is better" },
  { key: "rows", label: "Shots", note: "scored for selection" },
];

export function metricText(key: EarlierMetricRow["key"], value: number): string {
  return key === "rows" ? value.toLocaleString("en-US") : value.toFixed(6);
}
