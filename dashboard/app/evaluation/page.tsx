import type { Metadata } from "next";
import Link from "next/link";
import { browserApi, getAnalyticsCatalog, getAnalyticsEvaluation } from "@/lib/api";
import type { AnalyticsEvaluation } from "@/lib/types";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Historical evaluation" };

type Metric = { forecast_rows: number; mae: number; rmse: number };
type Validation = {
  baseline_validation: { pooled: Metric };
  variants: Record<string, { selected_config: string; configs: Record<string, { pooled: Metric }> }>;
};
type Promotion = { decision: string; gates: Record<string, { passed: boolean }> };

const estimators = [
  ["ewma_20_hl5", "EWMA · 20 appearances"],
  ["player_only", "Player only"],
  ["player_plus_context", "Player + context"]
] as const;

export default async function EvaluationPage({ searchParams }: {
  searchParams: Promise<{ snapshotId?: string }>;
}) {
  const { snapshotId } = await searchParams;
  const report = await loadEvaluation(snapshotId);
  if (report) return <EvaluationView report={report} />;
  return <section className="page shell"><div className="empty-state tall" role="alert"><h1>Evaluation unavailable</h1><p>The published snapshot has no matching, verified evaluation artifact. Historical profiles remain available.</p><Link className="button button-dark" href="/players">Explore players</Link></div></section>;
}

async function loadEvaluation(snapshotId?: string) {
  try {
    const catalog = await getAnalyticsCatalog(snapshotId);
    return await getAnalyticsEvaluation(catalog.snapshot_id);
  } catch {
    return null;
  }
}

function EvaluationView({ report }: { report: AnalyticsEvaluation }) {
  const validation = report.validation as unknown as Validation;
  const promotion = report.promotion as unknown as Promotion;
  const counts = report.final_test.counts;
  return <main className="page shell evaluation-page">
    <header className="page-heading"><div><p className="kicker">Frozen historical experiment</p><h1>Evaluation</h1><p>Did a context model improve estimates of next team-game CourtLens points, conditional on appearance?</p></div></header>
    <div className="replay-banner"><strong>No challenger promoted</strong><span>EWMA-20 remains the historical replay estimator. The player + context finalist was worse on the final season.</span></div>
    <section className="evaluation-section" aria-labelledby="result-heading"><h2 id="result-heading">Final test · 2023–24</h2><p>39,988 identical scored core forecasts across 142 target dates. Lower MAE and RMSE are better.</p>
      <div className="evaluation-table-wrap" tabIndex={0} aria-label="Final test metrics, scroll horizontally"><table className="evaluation-table"><thead><tr><th>Estimator</th><th>MAE</th><th>RMSE</th><th>80% interval coverage</th><th>Mean interval width</th><th>Rows</th></tr></thead><tbody>{estimators.map(([key, label]) => {
        const metric = report.final_test.metrics[key];
        const interval = report.final_test.intervals[key];
        return <tr key={key}><th scope="row">{label}</th><td>{metric?.mae.toFixed(2) ?? "—"}</td><td>{metric?.rmse.toFixed(2) ?? "—"}</td><td>{interval?.coverage == null ? "Unavailable" : `${(interval.coverage * 100).toFixed(1)}%`}</td><td>{interval?.mean_width?.toFixed(1) ?? "Unavailable"}</td><td>{metric?.forecast_rows.toLocaleString() ?? "—"}</td></tr>;
      })}</tbody></table></div>
      <p>The context model&apos;s MAE exceeded EWMA by 0.14 points. The seven-day calendar-block 95% interval for that difference was +{report.final_test.paired_uncertainty.lower.toFixed(2)} to +{report.final_test.paired_uncertainty.upper.toFixed(2)}.</p>
    </section>
    <section className="evaluation-section" aria-labelledby="validation-heading"><h2 id="validation-heading">Validation came first</h2><p>Selection used V1 and V2 in 2022–23 before opening the final test season. Pooled validation MAE: EWMA {validation.baseline_validation.pooled.mae.toFixed(2)}, selected player-only {selectedMae(validation, "player_only")}, selected context {selectedMae(validation, "player_plus_context")}.</p></section>
    <section className="evaluation-section" aria-labelledby="decision-heading"><h2 id="decision-heading">Why the challenger was not promoted</h2><ul className="gate-list">{Object.entries(promotion.gates).map(([key, gate]) => <li key={key}><strong>{gate.passed ? "Passed" : "Failed"}</strong> · {gateLabel(key)}</li>)}</ul><p>EWMA is the served policy. No winner probability or future live performance claim follows from this historical test.</p></section>
    <section className="evaluation-section" aria-labelledby="health-heading"><h2 id="health-heading">Data health and coverage</h2><dl className="health-grid"><div><dt>Historical coverage</dt><dd>{report.coverage_start} to {report.coverage_end}</dd></div><div><dt>Last published build</dt><dd>{report.published_at ?? "Unavailable"}</dd></div><div><dt>Latest build attempt</dt><dd>{report.latest_build ? `${report.latest_build.status} · ${report.latest_build.created_at}` : "Unavailable"}</dd></div><div><dt>Source</dt><dd>{report.source}</dd></div><div><dt>Published player/game facts</dt><dd>{report.record_counts.player_fact_rows?.toLocaleString() ?? "Unavailable"}</dd></div><div><dt>Published dated profiles</dt><dd>{report.record_counts.profile_rows?.toLocaleString() ?? "Unavailable"}</dd></div><div><dt>Final-test candidates</dt><dd>{counts.candidate_rows?.toLocaleString() ?? "Unavailable"}</dd></div><div><dt>Scored core forecasts</dt><dd>{report.final_test.metrics.ewma_20_hl5?.forecast_rows.toLocaleString() ?? "Unavailable"}</dd></div></dl><p>Candidate-side counts do not establish total player coverage: M6 did not count observed S3 appearances with no candidate.</p></section>
    <section className="evaluation-section" aria-labelledby="limits-heading"><h2 id="limits-heading">What this can establish</h2><ul>{report.limitations.map((limit) => <li key={limit}>{limit}</li>)}</ul><p>Dates, schedules and team links are reconstructed from revised archive records. An interval describes conditional production error on held-out historical appearances; it does not estimate whether a player will appear.</p><p><Link href="/methodology">Read the methodology</Link> · <Link href="/players">Inspect player histories</Link></p></section>
    <details className="calculation-details"><summary>Run and reproducibility details</summary><p>Run {report.run_id} · report SHA-256 {report.report_sha256} · snapshot {report.snapshot_id} · dataset {report.dataset_id}</p><p><a href={`${browserApi}/api/analytics/evaluations?runId=${report.run_id}&snapshotId=${report.snapshot_id}`}>Open the validated JSON report</a></p><p>Full model card: docs/evidence/model-evaluation.md in the project repository.</p></details>
  </main>;
}

function selectedMae(validation: Validation, variant: string) {
  const selection = validation.variants[variant];
  return selection?.configs[selection.selected_config]?.pooled.mae.toFixed(2) ?? "unavailable";
}

function gateLabel(key: string) {
  return ({ validation_improvement: "Required validation improvement", final_paired_superiority: "Final-test superiority", supported_slices: "Supported-slice regression limit", interval_guardrails: "Interval coverage and width" } as Record<string, string>)[key] ?? key.replaceAll("_", " ");
}
