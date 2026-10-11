"use client";
import { humanLabel } from "@/lib/route-availability";
import { formatDate } from "@/lib/format-date";
import { useEffect, useState } from "react";
import { downloadResearch, researchRead, type Experiment, type ResearchResult, type RunSummary } from "@/lib/advanced-research";
import { FilterBar, CountChip } from "./ui/filter-bar";
import { DataDetailsButton, type DataDetailRow } from "./ui/data-details";
import { Field } from "./ui/field";
import { Select } from "./ui/select";
import { GatedNote } from "./ui/gated-note";
import { ResearchLayout } from "./ui/page-shell";
import { StatTile } from "./ui/stat-tile";
import { Skeleton } from "./ui/skeleton";

const titles: Record<string, string> = {
  "courtload-expected-shot-retrospective-v2": "Expected-Shot Experiment",
  "courtload-rapm-v1": "RAPM Experiment",
  "courtload-six-factor-v1": "Six-Factor Experiment",
  "courtload-adjusted-shooting-v1": "Playtype-Adjusted Shooting Experiment"
};
const yesNo = (value: boolean | null | undefined) => value == null ? "unknown" : value ? "yes" : "no";
const fmt = (v: number | null | undefined) => v == null ? "—" : v.toFixed(9);

/** Limits shared by every registered experiment; required wording lives behind Why? (D14). */
function ExperimentLimits() {
  return <>
    <p>Registered offline research. Reports retain their own fit and evaluation horizons and do not replace historical profiles or the active points policy.</p>
    <p>Unfitted coefficients, uncertainty intervals and rankings from this registered experiment are unavailable. A completed negative result is available as research evidence only.</p>
    <p>Vendor ShotQuality, optical tracking, nearest/second defender, spatial EPV and external impact outputs require independently admitted sources and models. CourtLens expected-shot research does not inherit those identities.</p>
  </>;
}

/**
 * A sealed, registered research experiment on the Research template: key findings, then the
 * selection metrics and model card. IDs and hashes live in Data details. `embedded` renders it as
 * a section inside another page (RAPM's served ratings), which owns the filter bar.
 */
export function ResearchResultsView({ experiment = "courtload-expected-shot-retrospective-v2", embedded = false, title: heading }: { experiment?: string; embedded?: boolean; title?: string }) {
  const [registry, setRegistry] = useState<Experiment[] | null>(null);
  const [runs, setRuns] = useState<RunSummary[]>([]);
  const [runId, setRunId] = useState("");
  const [result, setResult] = useState<ResearchResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    Promise.all([researchRead<Experiment[]>("experiments", controller.signal), researchRead<RunSummary[]>("runs?limit=100", controller.signal)])
      .then(([items, history]) => {
        if (controller.signal.aborted) return;
        setRegistry(items); setRuns(history.filter(r => r.experiment === experiment));
        setRunId(items.find(e => e.experiment === experiment)?.run_id ?? "");
      }).catch(e => { if (!controller.signal.aborted) setError(e.message); });
    return () => controller.abort();
  }, [experiment, retry]);
  useEffect(() => {
    if (!runId) return;
    const controller = new AbortController();
    researchRead<ResearchResult>(`runs/${encodeURIComponent(runId)}`, controller.signal)
      .then(value => { if (!controller.signal.aborted) setResult(value); }).catch(e => { if (!controller.signal.aborted) setError(e.message); });
    return () => controller.abort();
  }, [runId, retry]);
  const entry = registry?.find(e => e.experiment === experiment);
  const selection = result?.evaluation?.selection;
  const improvement = selection && selection.baseline.brier > 0 ? `${((1 - selection.candidate.brier / selection.baseline.brier) * 100).toFixed(5)}%` : null;
  const title = heading ?? titles[experiment] ?? humanLabel(experiment);
  const detailRows: DataDetailRow[] = [
    { label: "Experiment", value: experiment, mono: true },
    ...(entry ? [{ label: "Protocol SHA-256", value: entry.protocol_sha256, mono: true }] : []),
    ...(result ? [
      { label: "Run", value: result.run.run_id, mono: true },
      { label: "Manifest SHA-256", value: result.manifest_sha256, mono: true },
      { label: "Package manifest SHA-256", value: result.package_manifest_sha256 ?? "—", mono: true },
      { label: "Binding SHA-256", value: result.run.binding_sha256, mono: true },
      { label: "Dataset content SHA-256", value: result.run.dataset_content_sha256, mono: true },
      { label: "Horizons", value: Object.entries(result.run.horizons ?? {}).map(([key, date]) => `${humanLabel(key)} ${formatDate(date)}`).join(" · ") },
      { label: "Resource accounting", value: JSON.stringify(result.resource_accounting), mono: true }
    ] : [])
  ];
  const exportButton = result && <button className="button" onClick={() => downloadResearch(`courtlens-research-${result.run.run_id}.json`, result)}>Export verified report JSON</button>;
  const details = <DataDetailsButton rows={detailRows} />;
  const runPicker = runs.length > 1 && <Field label="Run" layout="inline"><Select aria-label="Registered run" value={runId} onChange={e => { setResult(null); setError(null); setRunId(e.target.value); }}>{runs.map((r, index) => <option key={r.run_id} value={r.run_id}>Run {runs.length - index} · {humanLabel(r.status)}</option>)}</Select></Field>;
  const status = result ? (result.run.status === "selection_failed_negative_result" ? "Completed negative result" : humanLabel(result.run.status)) : entry ? humanLabel(entry.status) : null;

  let findings: React.ReactNode = null;
  let body: React.ReactNode;
  if (error) {
    body = <div role="alert"><GatedNote tone="warning" action={<button className="button" onClick={() => { setError(null); setResult(null); setRegistry(null); setRetry(v => v + 1); }}>Retry reads</button>}>Report unavailable: {error}</GatedNote></div>;
  } else if (!registry || (runId && !result)) {
    findings = <>{[0, 1, 2, 3].map(i => <Skeleton key={i} height={88} />)}</>;
    body = <p className="sr-only" role="status">Loading the registered experiment…</p>;
  } else if (!entry) {
    body = <GatedNote why={<ExperimentLimits />}>This experiment has no registered entry. No model output is available.</GatedNote>;
  } else if (!result) {
    findings = <>
      <StatTile label="Status" value={status} />
      <StatTile label="Classification" value={entry.classification ? humanLabel(entry.classification) : null} />
      <StatTile label="Registered Runs" value={runs.length} />
    </>;
    body = <GatedNote why={<ExperimentLimits />}>{entry.gate ? `Unavailable: ${entry.gate}.` : "Read the registered run for its selection outcome and limits."}</GatedNote>;
  } else {
    findings = <>
      <StatTile label="Status" value={status} />
      <StatTile label="Selection Gate" value={result.evaluation?.selection_passed == null ? null : result.evaluation.selection_passed ? "Passed" : "Failed"} />
      <StatTile label="Relative Brier Improvement" value={improvement} />
      <StatTile label="Report Through" value={formatDate(result.report_through_date)} />
    </>;
    body = <section aria-label="Registered research result" className="panel research-result">
      <div className="research-result-head"><h3 className="research-result-title">{status}{result.run.status === "selection_failed_negative_result" ? " · selection failed" : ""}</h3>{!embedded && exportButton}</div>
      <dl className="research-facts">
        <dt>Model fit through</dt><dd>{result.model_fit_through_date ? formatDate(result.model_fit_through_date) : "No fit"}</dd>
        <dt>Calibration fit through</dt><dd>{result.calibration_fit_through_date ? formatDate(result.calibration_fit_through_date) : "No calibration fit"}</dd>
        <dt>Report through</dt><dd>{formatDate(result.report_through_date)}</dd>
        <dt>Classification</dt><dd>{result.run.classification ? humanLabel(result.run.classification) : "—"}</dd>
      </dl>
      {selection ? <>
        <h4>Selection Metrics · Lower Is Better</h4>
        <div className="table-wrapper" tabIndex={0} role="region" aria-label="Selection metrics"><table className="data-table"><thead><tr><th>Metric</th><th className="num">Baseline</th><th className="num">Candidate</th></tr></thead><tbody>{([["Brier", "brier"], ["Log loss", "log_loss"], ["Expected-point MAE", "expected_points_mae"], ["ECE", "ece"], ["Shots", "rows"]] as const).map(([label, key]) => <tr key={key}><th>{label}</th><td className="num">{key === "rows" ? selection.baseline[key].toLocaleString("en-US") : fmt(selection.baseline[key])}</td><td className="num">{key === "rows" ? selection.candidate[key].toLocaleString("en-US") : fmt(selection.candidate[key])}</td></tr>)}</tbody></table></div>
        <details><summary>Selection reliability bins and samples</summary><div className="table-wrapper" tabIndex={0} role="region" aria-label="Reliability bins"><table className="data-table"><thead><tr><th>Model</th><th>Bin</th><th className="num">Shots</th><th className="num">Mean probability</th><th className="num">Observed make rate</th></tr></thead><tbody>{(["baseline", "candidate"] as const).flatMap(model => selection[model].calibration_bins.map((bin, i) => <tr key={`${model}-${i}`}><th>{model}</th><td>{bin.lower}–{bin.upper}</td><td className="num">{bin.rows}</td><td className="num">{fmt(bin.mean_probability)}</td><td className="num">{fmt(bin.observed_rate)}</td></tr>))}</tbody></table></div></details>
      </> : <GatedNote>No selection metrics recorded for this run.</GatedNote>}
      <GatedNote why={<>
        <p>Classification: {result.run.classification}. Previously exposed final history: {yesNo(result.run.final_previously_exposed)}. Final error report opened: {yesNo(result.run.final_report_opened)}. Prospective promotion authorized: {yesNo(result.run.prospective_promotion_authorized)}.</p>
        {selection && <p>These are selection errors, not final-test performance. Brier/log loss measure make-probability error; MAE measures expected-point error per shot; ECE uses ten fixed probability bins. Relative Brier improvement: {improvement ?? "—"}. Registered selection gate: see model card. Selection passed: {yesNo(result.evaluation?.selection_passed)}.</p>}
        <ExperimentLimits />
      </>}>Selection metrics are research evidence, not final-test performance.</GatedNote>
      <details><summary>Model card · definitions, sources and stopping rule</summary><pre className="research-document">{result.model_card}</pre></details>
    </section>;
  }

  if (embedded) return <section className="research-view research-embedded" aria-label={title}>
    <div className="research-embedded-head"><h3>{title}</h3><div className="research-embedded-actions">{runPicker}{exportButton}{details}</div></div>
    <ResearchLayout findings={findings}>{body}</ResearchLayout>
  </section>;
  return <div className="research-view">
    <FilterBar collapsible={Boolean(runPicker)} label="Experiment controls" summary={title} scope={<span className="research-scope-label">{title}</span>} filters={runPicker || undefined}
      count={registry ? <CountChip>{runs.length} {runs.length === 1 ? "run" : "runs"}</CountChip> : undefined}
      details={details} />
    <ResearchLayout findings={findings}>{body}</ResearchLayout>
  </div>;
}
