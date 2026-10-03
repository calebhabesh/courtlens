import { browserApi, WorkbenchApiError } from "./workbench-api";

export type Experiment = {
  experiment: string; protocol_sha256: string; status: string; run_id: string | null;
  gate: string | null; classification: string; http_fitting_available: boolean;
};
export type RunSummary = {
  run_id: string; experiment: string; status: string; classification: string;
  final_previously_exposed: boolean; final_report_opened: boolean | null;
  prospective_promotion_authorized: boolean; protocol_sha256: string;
  binding_sha256: string; dataset_content_sha256: string; horizons: Record<string, string>;
};
export type ShotMetrics = {
  brier: number; log_loss: number; expected_points_mae: number; ece: number; rows: number;
  calibration_bins: Array<{ lower: number; upper: number; rows: number; mean_probability: number | null; observed_rate: number | null }>;
};
export type ResearchResult = {
  run: RunSummary; manifest_sha256: string; package_manifest_sha256: string | null;
  evaluation: { selection?: { baseline: ShotMetrics; candidate: ShotMetrics }; selection_passed?: boolean } | null;
  model_card: string; resource_accounting: Record<string, unknown>;
  model_fit_through_date: string | null; calibration_fit_through_date: string | null;
  report_through_date: string;
};
export async function researchRead<T>(path: string, signal: AbortSignal): Promise<T> {
  const response = await fetch(`${browserApi}/api/workbench/research/${path}`, {
    cache: "no-store", signal: AbortSignal.any([signal, AbortSignal.timeout(15000)])
  });
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new WorkbenchApiError(response.status, body?.detail ?? `Research read failed (${response.status})`);
  }
  return response.json() as Promise<T>;
}
export function downloadResearch(name: string, data: unknown) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }));
  const link = document.createElement("a"); link.href = url; link.download = name; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export const flowVersion = "hypothetical-possession-flow-v1";
export const flowLabels = {
  t: "Turnover probability per chance", p2: "2P category probability", p3: "3P category probability",
  pft: "Two-FT trip category probability", m2: "2P make probability", m3: "3P make probability",
  mft: "FT make probability", r: "Miss recovery probability"
};
export type FlowInputs = Record<keyof typeof flowLabels, number>;
export const flowDefaults: FlowInputs = { t: .12, p2: .55, p3: .35, pft: .1, m2: .52, m3: .36, mft: .78, r: .25 };
export function possessionFlow(a: FlowInputs) {
  if (Object.values(a).some(v => !Number.isFinite(v) || v < 0 || v > 1)) throw new Error("Every probability must be between 0 and 1.");
  if (Math.abs(a.p2 + a.p3 + a.pft - 1) > 1e-9) throw new Error("2P, 3P and two-FT category probabilities must sum to 1.");
  const components = { two: (1-a.t)*2*a.p2*a.m2, three: (1-a.t)*3*a.p3*a.m3, ft: (1-a.t)*2*a.pft*a.mft };
  const s = components.two + components.three + components.ft;
  const q = (1-a.t)*a.r*(a.p2*(1-a.m2)+a.p3*(1-a.m3)+a.pft*(1-a.mft));
  if (q >= 1) throw new Error("Recovery continuation must be below 1 for a finite scenario.");
  return { s, q, ppp: s/(1-q), ortg: 100*s/(1-q), components };
}
export function flowSensitivities(a: FlowInputs) {
  return (Object.keys(flowLabels) as Array<keyof FlowInputs>).map(key => {
    const next = { ...a, [key]: a[key] + .01 };
    // Category changes exchange one percentage point with another category.
    const offset: keyof FlowInputs | null = key === "p2" ? "p3" : key === "p3" || key === "pft" ? "p2" : null;
    if (offset) next[offset] -= .01;
    try { return { key, offset, delta: possessionFlow(next).ortg - possessionFlow(a).ortg }; }
    catch { return { key, offset, delta: null }; }
  });
}
