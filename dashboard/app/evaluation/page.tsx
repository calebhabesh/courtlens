import type { Metadata } from "next";
import Link from "next/link";
import { browserApi, getAnalyticsEvaluation } from "@/lib/api";
import { PairedBars } from "@/components/charts";
import { formatDate } from "@/lib/format-date";
import type { AnalyticsEvaluation } from "@/lib/types";
import { CountChip, FilterBar } from "@/components/ui/filter-bar";
import { DataDetailsButton } from "@/components/ui/data-details";
import { GatedNote } from "@/components/ui/gated-note";
import { PageShell, ResearchLayout } from "@/components/ui/page-shell";
import { PageHeader } from "@/components/ui/panel";
import { StatTile } from "@/components/ui/stat-tile";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Evaluation Archive" };

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
const TITLE = "Evaluation Archive";
const SUBTITLE = "Frozen reference-points experiment · final test 2023–24.";

export default async function EvaluationPage({ searchParams }: {
  searchParams: Promise<{ snapshotId?: string }>;
}) {
  const { snapshotId } = await searchParams;
  const report = await loadEvaluation(snapshotId);
  if (report) return <EvaluationView report={report} />;
  return <PageShell template="research" className="research-view evaluation-page">
    <PageHeader title={TITLE} subtitle={SUBTITLE} />
    <div role="alert"><GatedNote action={<Link className="button" href={snapshotId ? "/evaluation" : "/forecasts"}>{snapshotId ? "Open Evaluation Archive" : "Points Forecasts"}</Link>} why={<p>{snapshotId ? "The requested snapshot has no matching, verified evaluation artifact. Its selection is preserved; the archive uses the frozen experiment's own inputs." : "The frozen experiment's retained inputs or verified report are unavailable. Points Forecasts has the separate basketball-points experiment."}</p>}>{snapshotId ? "Evaluation unavailable for the selected snapshot." : "Evaluation archive is unavailable."}</GatedNote></div>
  </PageShell>;
}

async function loadEvaluation(snapshotId?: string) {
  try {
    return await getAnalyticsEvaluation(snapshotId);
  } catch {
    return null;
  }
}

function EvaluationView({ report }: { report: AnalyticsEvaluation }) {
  const validation = report.validation as unknown as Validation;
  const promotion = report.promotion as unknown as Promotion;
  const counts = report.final_test.counts;
  const ewma = report.final_test.metrics.ewma_20_hl5;
  const context = report.final_test.metrics.player_plus_context;
  const gap = ewma && context ? context.mae - ewma.mae : null;
  const build = report.latest_build;
  return <PageShell template="research" className="research-view evaluation-page">
    <PageHeader title={TITLE} subtitle={SUBTITLE} actions={<Link className="button" href="/forecasts">Points Forecasts</Link>} />
    <FilterBar collapsible={false} label="Evaluation archive" summary="Final test · 2023–24" scope={<span className="research-scope-label">Frozen historical experiment · final test 2023–24</span>}
      count={ewma ? <CountChip>{ewma.forecast_rows.toLocaleString("en-US")} scored forecasts</CountChip> : undefined}
      details={<DataDetailsButton rows={[
        { label: "Run", value: report.run_id, mono: true },
        { label: "Report SHA-256", value: report.report_sha256, mono: true },
        { label: "Snapshot", value: report.snapshot_id, mono: true },
        { label: "Dataset", value: report.dataset_id, mono: true },
        { label: "Validated JSON report", value: <a href={`${browserApi}/api/analytics/evaluations?runId=${report.run_id}&snapshotId=${report.snapshot_id}`}>Open the report</a> },
        { label: "Model card", value: "docs/evidence/model-evaluation.md", mono: true },
        { label: "Source", value: report.source }
      ]} />} />
    <PairedBars title="Final-Test Error" source="Frozen M6 archive · registered, hash-verified report" sample={`${ewma?.forecast_rows.toLocaleString("en-US") ?? "Unknown"} scored core forecasts · 2023–24`} note="Reference points = PTS + 1.2 REB + 1.5 AST + 3 STL + 3 BLK − TOV; lower error is better."
      names={["EWMA-20", "Player + context"]} rows={[{ key: "mae", label: "Mean Absolute Error · reference points", a: ewma?.mae, b: context?.mae, formattedA: ewma?.mae.toFixed(2), formattedB: context?.mae.toFixed(2) }]} />
    <ResearchLayout findings={<>
      <StatTile label="Decision" value="No challenger promoted" footnote="EWMA-20 remains the replay estimator" />
      <StatTile label="EWMA-20 MAE" value={ewma ? ewma.mae.toFixed(2) : null} unit=" ref pts" footnote="Final test, lower is better" />
      <StatTile label="Context Model MAE" value={context ? context.mae.toFixed(2) : null} unit=" ref pts" footnote={gap === null ? undefined : `${gap >= 0 ? "+" : ""}${gap.toFixed(2)} against EWMA`} />
      <StatTile label="Paired 95% Interval" value={`+${report.final_test.paired_uncertainty.lower.toFixed(2)} to +${report.final_test.paired_uncertainty.upper.toFixed(2)}`} footnote="Context minus EWMA MAE" />
    </>}>
      <GatedNote why={<>
        <p>EWMA-20 remains the historical replay estimator. The player + context finalist was worse on the final season. The seven-day calendar-block 95% interval for that difference was +{report.final_test.paired_uncertainty.lower.toFixed(2)} to +{report.final_test.paired_uncertainty.upper.toFixed(2)}.</p>
        <p>EWMA is the archived reference-points replay policy. Points Forecasts is a separate basketball-points experiment. No winner probability or future live performance claim follows from this historical test.</p>
      </>}>The context model did not beat EWMA-20 on the final season.</GatedNote>
      <section className="panel research-section" aria-labelledby="result-heading">
        <h2 id="result-heading">Final Test · 2023–24</h2>
        <div className="table-wrapper research-table" tabIndex={0} role="region" aria-label="Final test metrics"><table className="data-table"><caption>Identical scored core forecasts; lower MAE and RMSE are better</caption>
          <thead><tr><th>Estimator</th><th className="num">MAE</th><th className="num">RMSE</th><th className="num">80% Interval Coverage</th><th className="num">Mean Interval Width</th><th className="num">Rows</th></tr></thead>
          <tbody>{estimators.map(([key, label]) => {
            const metric = report.final_test.metrics[key];
            const interval = report.final_test.intervals[key];
            return <tr key={key}><th scope="row">{label}</th><td className="num">{metric?.mae.toFixed(2) ?? "—"}</td><td className="num">{metric?.rmse.toFixed(2) ?? "—"}</td><td className="num">{interval?.coverage == null ? "Unavailable" : `${(interval.coverage * 100).toFixed(1)}%`}</td><td className="num">{interval?.mean_width?.toFixed(1) ?? "Unavailable"}</td><td className="num">{metric?.forecast_rows.toLocaleString("en-US") ?? "—"}</td></tr>;
          })}</tbody>
        </table></div>
        <p className="research-caption">Selection used V1 and V2 in 2022–23 before the final season opened. Pooled validation MAE: EWMA {validation.baseline_validation.pooled.mae.toFixed(2)}, player-only {selectedMae(validation, "player_only")}, context {selectedMae(validation, "player_plus_context")}.</p>
      </section>
      <section className="panel research-section" aria-labelledby="decision-heading">
        <h2 id="decision-heading">Promotion Gates</h2>
        <ul className="gate-list">{Object.entries(promotion.gates).map(([key, gate]) => <li key={key}><span className={`badge ${gate.passed ? "badge-positive" : "badge-accent"}`}>{gate.passed ? "Passed" : "Failed"}</span> {gateLabel(key)}</li>)}</ul>
      </section>
      <section className="panel research-section" aria-labelledby="health-heading">
        <h2 id="health-heading">Data Health and Coverage</h2>
        <dl className="research-facts">
          <dt>Historical coverage</dt><dd>{formatDate(report.coverage_start)} – {formatDate(report.coverage_end)}</dd>
          <dt>Last published build</dt><dd>{report.published_at ? formatDate(report.published_at.slice(0, 10)) : "Unavailable"}</dd>
          <dt>Latest build attempt</dt><dd>{build ? `${build.status} · ${formatDate(build.created_at.slice(0, 10))}` : "Unavailable"}</dd>
          <dt>Published player/game facts</dt><dd>{report.record_counts.player_fact_rows?.toLocaleString("en-US") ?? "Unavailable"}</dd>
          <dt>Published dated profiles</dt><dd>{report.record_counts.profile_rows?.toLocaleString("en-US") ?? "Unavailable"}</dd>
          <dt>Final-test candidates</dt><dd>{counts.candidate_rows?.toLocaleString("en-US") ?? "Unavailable"}</dd>
        </dl>
        <GatedNote why={<>
          <p>Candidate-side counts do not establish total player coverage: M6 did not count observed S3 appearances with no candidate.</p>
          <ul>{report.limitations.map(limit => <li key={limit}>{limit}</li>)}</ul>
          <p>Dates, schedules and team links are reconstructed from revised archive records. An interval describes conditional production error on held-out historical appearances; it does not estimate whether a player will appear.</p>
        </>} action={<Link className="button" href="/methodology">Methodology</Link>}>What this historical test can and cannot establish.</GatedNote>
      </section>
    </ResearchLayout>
  </PageShell>;
}

function selectedMae(validation: Validation, variant: string) {
  const selection = validation.variants[variant];
  return selection?.configs[selection.selected_config]?.pooled.mae.toFixed(2) ?? "unavailable";
}

function gateLabel(key: string) {
  return ({ validation_improvement: "Required validation improvement", final_paired_superiority: "Final-test superiority", supported_slices: "Supported-slice regression limit", interval_guardrails: "Interval coverage and width" } as Record<string, string>)[key] ?? key.replaceAll("_", " ");
}
