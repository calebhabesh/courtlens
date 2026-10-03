"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { downloadResearch, researchRead, type Experiment, type ResearchResult, type RunSummary } from "@/lib/advanced-research";

const titles: Record<string, string> = {
  "courtload-expected-shot-retrospective-v2": "CourtLoad expected-shot experiment",
  "courtload-rapm-v1": "CourtLoad RAPM",
  "courtload-six-factor-v1": "CourtLoad six-factor research",
  "courtload-adjusted-shooting-v1": "CourtLoad playtype-adjusted shooting"
};
export function ResearchResultsView({ experiment = "courtload-expected-shot-retrospective-v2" }: { experiment?: string }) {
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
  const fmt = (v: number | null | undefined) => v == null ? "—" : v.toFixed(9);
  return <div className="advanced-research">
    <h1>{titles[experiment] ?? experiment}</h1>
    <p>Registered offline research. Reports retain their own fit and evaluation horizons and do not replace historical profiles or the active points policy.</p>
    <nav className="research-links" aria-label="Research experiments">
      <Link href="/research/expected-shots">Expected shots</Link><Link href="/research/rapm">RAPM</Link><Link href="/six-factor-rapm">Six-factor</Link><Link href="/research/adjusted-shooting">Adjusted shooting</Link>
    </nav>
    {error ? <div role="alert" className="notice">Report unavailable: {error} <button className="button" onClick={() => { setError(null); setResult(null); setRegistry(null); setRetry(v => v+1); }}>Retry reads</button></div> : !registry && <p role="status">Loading registered experiments…</p>}
    {!error && registry && !entry && <p className="notice">This experiment has no registered entry. No model output is available.</p>}
    {!error && entry && <section className="panel"><h2>Experiment availability</h2><p><strong>{entry.status}</strong></p><p>{entry.gate ?? "Read the registered run below for its selection outcome and limits."}</p><p>Protocol SHA-256: <code>{entry.protocol_sha256}</code></p><p>Unfitted coefficients, uncertainty intervals and player impact rankings are unavailable. A completed negative result is available as research evidence only.</p></section>}
    {!error && runs.length > 0 && <label>Registered run <select value={runId} onChange={e => { setResult(null); setError(null); setRunId(e.target.value); }}>{runs.map(r => <option key={r.run_id} value={r.run_id}>{r.status} · {r.run_id}</option>)}</select></label>}
    {!error && runId && !result && <p role="status">Verifying and loading sealed run…</p>}
    {!error && result && <section aria-label="Registered research result" className="panel">
      <h2>{result.run.status === "selection_failed_negative_result" ? "Completed negative result · selection failed" : result.run.status}</h2>
      <p>Classification: {result.run.classification}. Previously exposed final history: {result.run.final_previously_exposed ? "yes" : "no"}. Final error report opened: {result.run.final_report_opened == null ? "unknown" : result.run.final_report_opened ? "yes" : "no"}. Prospective promotion authorized: {result.run.prospective_promotion_authorized ? "yes" : "no"}.</p>
      <dl className="research-facts"><dt>Model fit through</dt><dd>{result.model_fit_through_date ?? "No fit"}</dd><dt>Calibration fit through</dt><dd>{result.calibration_fit_through_date ?? "No calibration fit"}</dd><dt>Report through</dt><dd>{result.report_through_date}</dd></dl>
      {selection && <><h3>Selection metrics · lower is better</h3><p>These are selection errors, not final-test performance. Brier/log loss measure make-probability error; MAE measures expected-point error per shot; ECE uses ten fixed probability bins.</p>
        <div className="table-wrapper" tabIndex={0} role="region" aria-label="Selection metrics"><table className="data-table"><thead><tr><th>Metric</th><th>Baseline</th><th>Candidate</th></tr></thead><tbody>{([['Brier', 'brier'], ['Log loss', 'log_loss'], ['Expected-point MAE', 'expected_points_mae'], ['ECE', 'ece'], ['Shots', 'rows']] as const).map(([label,key]) => <tr key={key}><th>{label}</th><td>{key === "rows" ? selection.baseline[key] : fmt(selection.baseline[key])}</td><td>{key === "rows" ? selection.candidate[key] : fmt(selection.candidate[key])}</td></tr>)}</tbody></table></div>
        <p>Relative Brier improvement: {selection.baseline.brier > 0 ? ((1-selection.candidate.brier/selection.baseline.brier)*100).toFixed(5) : "—"}%. Registered selection gate: see model card. Selection passed: {result.evaluation?.selection_passed ? "yes" : "no"}.</p>
        <details><summary>Selection reliability bins and samples</summary><div className="table-wrapper" tabIndex={0} role="region" aria-label="Reliability bins"><table className="data-table"><thead><tr><th>Model</th><th>Bin</th><th>Shots</th><th>Mean probability</th><th>Observed make rate</th></tr></thead><tbody>{(["baseline", "candidate"] as const).flatMap(model => selection[model].calibration_bins.map((bin,i) => <tr key={`${model}-${i}`}><th>{model}</th><td>{bin.lower}–{bin.upper}</td><td>{bin.rows}</td><td>{fmt(bin.mean_probability)}</td><td>{fmt(bin.observed_rate)}</td></tr>))}</tbody></table></div></details>
      </>}
      {!selection && <p>No selection metrics recorded for this run.</p>}
      <details open><summary>Model card · definitions, sources and stopping rule</summary><pre className="research-document">{result.model_card}</pre></details>
      <details><summary>Artifact identities and resource accounting</summary><pre className="research-document">{JSON.stringify({ run: result.run, manifest_sha256: result.manifest_sha256, package_manifest_sha256: result.package_manifest_sha256, resource_accounting: result.resource_accounting }, null, 2)}</pre></details>
      <button className="button" onClick={() => downloadResearch(`courtload-research-${result.run.run_id}.json`, result)}>Export verified report JSON</button>
    </section>}
    <p className="notice">Vendor ShotQuality, optical tracking, nearest/second defender, spatial EPV and external impact outputs require independently admitted sources and models. CourtLoad expected-shot research does not inherit those identities.</p>
    <nav className="research-links" aria-label="Available research tools"><Link href="/roster-shapes">Roster allocations</Link><Link href="/wingspan">Measurements</Link><Link href="/calculator">Hypothetical calculator</Link><Link href="/stats">Conventional statistics</Link></nav>
  </div>;
}
