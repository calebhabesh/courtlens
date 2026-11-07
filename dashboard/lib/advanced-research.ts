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

