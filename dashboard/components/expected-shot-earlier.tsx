"use client";

import { useEffect, useRef, useState } from "react";
import { ReliabilityPlot } from "./charts";
import { FeedFailure, useFeed, useUrlState } from "./stats-feed-ui";
import { Button, ButtonSummary } from "./ui/kit";
import { MethodBlock, ResearchSection } from "./research/research-page";
import { GridValue, StatsGrid } from "./research/stats-grid";
import { downloadResearch, researchRead, type Experiment, type ResearchResult, type RunSummary } from "@/lib/advanced-research";
import { formatDate } from "@/lib/format-date";
import {
  EARLIER_EXPERIMENT, EARLIER_METRICS, metricText, registeredGate, relativeBrier, sharePercent,
  type EarlierAttempt, type EarlierMetricRow,
} from "@/lib/expected-shot-earlier";

/*
 * RD17 (owner, 2026-11-10): the old Expected Shots page as Shot Quality's earlier attempt, after RD16's earlier-experiment
 * section: one visible line computed from the sealed run, the numbers behind a small toggle in the same section (RD16's ledger
 * toggle), and the identifiers in the Model tab's collapsed Caveats & Methodology. No interval is served, so nothing is coloured;
 * the gate result is a word. `/research/shooting` redirects here with `earlier=open`, which opens the toggle and brings it into view.
 */

async function loadEarlier(signal: AbortSignal): Promise<EarlierAttempt | null> {
  const [experiments, runs] = await Promise.all([
    researchRead<Experiment[]>("experiments", signal),
    researchRead<RunSummary[]>("runs?limit=100", signal),
  ]);
  const entry = experiments.find(e => e.experiment === EARLIER_EXPERIMENT);
  if (!entry?.run_id) return null;
  const result = await researchRead<ResearchResult>(`runs/${encodeURIComponent(entry.run_id)}`, signal);
  return { entry, result, otherRuns: runs.filter(r => r.experiment === EARLIER_EXPERIMENT && r.run_id !== entry.run_id) };
}

export function useEarlierAttempt() {
  return useFeed([EARLIER_EXPERIMENT], loadEarlier);
}

type Feed = ReturnType<typeof useEarlierAttempt>;

export function EarlierAttemptSection({ feed }: { feed: Feed }) {
  const { get } = useUrlState();
  const arrived = get("earlier") === "open";
  const [open, setOpen] = useState(arrived);
  const ref = useRef<HTMLDivElement>(null);
  const { data, error, retry } = feed;
  // Arriving from the old Expected Shots URL is a deep link, not a selection: bring the section into view once.
  useEffect(() => { if (arrived && data) ref.current?.scrollIntoView({ block: "start" }); }, [arrived, data]);
  if (error) return <ResearchSection id="earlier-attempt" icon="history" title="An earlier attempt"><FeedFailure error={error} retry={retry} what="The earlier attempt" /></ResearchSection>;
  if (!data) return null;
  const { result } = data;
  const selection = result.evaluation?.selection;
  const gain = selection ? relativeBrier(selection) : null;
  const gate = registeredGate(result.model_card);
  const passed = result.evaluation?.selection_passed;
  return <div ref={ref} className="sq-earlier" data-section="earlier-attempt">
    <ResearchSection id="earlier-attempt" icon="history" title="An earlier attempt">
      <p className="sq-text sq-lead" data-field="earlier-line" data-gain={gain ?? ""} data-gate={gate ?? ""} data-passed={String(passed)}>
        Before this model, CourtLens tested a simpler one that read only where a shot was taken and whether it was a three. Trained on games
        through {formatDate(result.model_fit_through_date)}, it beat a make rate by zone by <strong>{sharePercent(gain)}</strong> on Brier score
        {gate != null ? <> against the <strong>{sharePercent(gate)}</strong> it needed</> : null}, so it {passed === false ? "failed its gate and was stopped there: never calibrated and never tested" : "was not taken further"}.
      </p>
      {selection && <details className="sq-earlier-list" open={open} onToggle={e => setOpen(e.currentTarget.open)}>
        <ButtonSummary size="sm" variant="ghost" iconAfter="chevron-down">Show the earlier attempt&apos;s numbers</ButtonSummary>
        <div className="sq-earlier-body">
          <p className="sq-note" data-field="earlier-sample">Scored on {selection.candidate.rows.toLocaleString("en-US")} shots from games through {formatDate(result.report_through_date)}, the
            half of 2024-25 used to choose a model. No interval is served for these numbers, so none is coloured, and they are not a test result.</p>
          <StatsGrid<EarlierMetricRow> label="The earlier attempt's selection scores" name="earlier" density="compact" height="auto" leadWidth="lg" className="sq-earlier-grid"
            rows={EARLIER_METRICS} rowKey={r => r.key} rowData={r => ({ metric: r.key })}
            lead={{ label: "Score", cell: r => <><span className="sq-earlier-name">{r.label}</span><span className="sq-earlier-sub">{r.note}</span></> }}
            columns={[
              { key: "baseline", label: "Zone rate", title: "Make rate by zone and shot type from the training games", width: "md",
                data: r => ({ field: "baseline", value: selection.baseline[r.key] }), cell: r => <GridValue text={metricText(r.key, selection.baseline[r.key])} /> },
              { key: "candidate", label: "Location model", title: "Logistic model on shot location and type", width: "md",
                data: r => ({ field: "candidate", value: selection.candidate[r.key] }), cell: r => <GridValue text={metricText(r.key, selection.candidate[r.key])} /> },
            ]} />
          <p className="sq-text" data-field="earlier-result" data-passed={String(passed)}>Gate result: <strong>{passed === false ? "Failed" : passed ? "Passed" : "Unknown"}</strong>.
            {" "}The location model was also worse calibrated ({selection.candidate.ece.toFixed(4)} against {selection.baseline.ece.toFixed(4)}).</p>
          <ReliabilityPlot title="Predicted against observed make rate" label="The earlier attempt: predicted make probability against observed make rate" source="The sealed earlier expected-shot run"
            sample={`${selection.candidate.rows.toLocaleString("en-US")} selection shots, ten fixed bins`} note="Empty bins are left out."
            series={[{ name: "Zone rate", bins: selection.baseline.calibration_bins }, { name: "Location model", bins: selection.candidate.calibration_bins }]} />
        </div>
      </details>}
    </ResearchSection>
  </div>;
}

/** The identifiers, the model card and the empty preflight run, inside the Model tab's collapsed Caveats & Methodology. */
export function EarlierAttemptMethod({ feed }: { feed: Feed }) {
  const data = feed.data;
  if (!data) return null;
  const { result, entry, otherRuns } = data;
  const horizons = Object.entries(result.run.horizons ?? {}).map(([key, date]) => `${key.replace(/_/g, " ")} ${formatDate(date)}`).join(" · ");
  const ids: [string, string][] = [
    ["Experiment", EARLIER_EXPERIMENT], ["Run", result.run.run_id], ["Protocol SHA-256", entry.protocol_sha256],
    ["Manifest SHA-256", result.manifest_sha256], ["Package manifest SHA-256", result.package_manifest_sha256 ?? "—"],
    ["Binding SHA-256", result.run.binding_sha256], ["Dataset content SHA-256", result.run.dataset_content_sha256],
  ];
  return <MethodBlock title="The earlier attempt">
    <p className="sq-text">A registered experiment, sealed before Shot Quality v2 was built: one fit of a logistic model on shot location and shot type against
      a make rate by zone and shot type, both from the training games only. It needed at least {sharePercent(registeredGate(result.model_card))} lower Brier
      score on the selection games; it fell short, so the run stopped before calibration and before any test error was opened.
      {result.run.final_previously_exposed ? " Its final season had already been seen by earlier work, which the registration discloses." : ""} Dates: {horizons}.</p>
    {otherRuns.length > 0 && <p className="sq-text" data-field="earlier-other-runs" data-count={otherRuns.length}>
      {otherRuns.length === 1 ? "One other run is registered" : `${otherRuns.length} other runs are registered`}: a launcher check that failed before any fit, kept on record and never a result.</p>}
    <dl className="sq-earlier-ids">{ids.map(([k, v]) => <div key={k}><dt>{k}</dt><dd><code>{v}</code></dd></div>)}</dl>
    <details className="sq-earlier-card"><ButtonSummary size="sm" variant="ghost" iconAfter="chevron-down">Model card</ButtonSummary><pre className="sq-earlier-pre">{result.model_card}</pre></details>
    <div><Button size="sm" variant="secondary" icon="download" onClick={() => downloadResearch(`courtlens-research-${result.run.run_id}.json`, result)}>Download the sealed report</Button></div>
  </MethodBlock>;
}
