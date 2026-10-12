"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { getSavedOperation, operationExportUrl, reproduceOperation, type SavedDetail, type SavedReproduction } from "@/lib/saved-operations";
import { formatDate } from "@/lib/format-date";
import { humanLabel } from "@/lib/route-availability";
import { publicInvestigation } from "@/lib/public-investigations";
import { PlayerIdentity } from "./ui/identity";
import { ConversationResult } from "./conversation-result";
import { contextLine } from "./saved-operation-library";
import { FilterBar } from "./ui/filter-bar";
import { DataDetailsButton } from "./ui/data-details";
import { GatedNote } from "./ui/gated-note";
import { PageShell, ResearchLayout } from "./ui/page-shell";
import { PageHeader } from "./ui/panel";
import { StatTile } from "./ui/stat-tile";
import { TemplateSkeleton } from "./ui/template-skeleton";
import { useToast } from "./ui/toast";

/** One retained investigation on the Research template; results below stay immutable. */
export function SavedOperationDetail({ id }: { id: string }) {
  const [detail, setDetail] = useState<SavedDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [report, setReport] = useState<SavedReproduction | null>(null);
  const [verifying, setVerifying] = useState(false);
  const [verifyError, setVerifyError] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);
  const busy = useRef(false);
  const { toast } = useToast();

  useEffect(() => { let active = true; getSavedOperation(id).then(value => { if (active) { setDetail(value); setError(null); } }).catch(cause => { if (active) setError(cause instanceof Error ? cause.message : "Could not read retained evidence"); }); return () => { active = false; }; }, [id, retry]);
  async function verify() {
    if (busy.current) return;
    busy.current = true; setVerifying(true); setVerifyError(null); setReport(null);
    try {
      const rep = await reproduceOperation(id);
      setReport(rep);
      toast(rep.match
        ? { title: "Reproduction Verified", description: "All retained results, evidence and destinations match.", variant: "positive" }
        : { title: "Reproduction Mismatch", description: rep.reason ?? "Retained semantics differ", variant: "negative" });
    } catch (cause) {
      const msg = cause instanceof Error ? cause.message : "Reproduction failed";
      setVerifyError(msg);
      toast({ title: "Verification Failed", description: msg, variant: "negative" });
    } finally {
      busy.current = false; setVerifying(false);
    }
  }
  const back = <Link className="button" href="/investigations">All Investigations</Link>;
  if (error) return <PageShell template="research" className="research-view saved-operation-detail">
    <PageHeader title="Saved Investigation" actions={back} />
    <div role="alert"><GatedNote tone="warning" action={<button className="button" onClick={() => { setError(null); setRetry(value => value + 1); }}>Retry saved detail</button>}>{error}</GatedNote></div>
  </PageShell>;
  if (!detail) return <><p role="status" className="sr-only">Loading retained evidence…</p><TemplateSkeleton template="research" /></>;
  const manifest = detail.manifest;
  const context = manifest.context;
  const entry = publicInvestigation(detail);
  const primary = manifest.results.find(result => result.operation === "distribution");
  return <PageShell template="research" className="research-view saved-operation-detail">
    <PageHeader title={entry?.title ?? detail.title} subtitle={`Saved ${formatDate(detail.created_at.slice(0, 10))} · retained analytical evidence`} actions={<>
      {back}
      <button className="button button-primary" aria-label="Verify reproduction without AI" disabled={verifying} onClick={() => void verify()}>{verifying ? "Reproducing…" : "Verify Without AI"}</button>
      <a className="button" href={operationExportUrl(id, "json")}>Export JSON</a>
      <a className="button" href={operationExportUrl(id, "csv")}>Export CSV</a>
    </>} />
    <FilterBar collapsible={false} label="Retained scope" summary={String(context.season ?? "Retained scope")} scope={<span className="research-scope-label">{contextLine(context)}{typeof context.window === "string" ? ` · ${humanLabel(context.window)}` : ""}</span>}
      details={<DataDetailsButton rows={[
        { label: "Original title", value: detail.title },
        { label: "Release", value: String(context.release_id ?? "—"), mono: true },
        { label: "Manifest SHA-256", value: detail.manifest_sha256, mono: true },
        { label: "Context fingerprint", value: manifest.context_fingerprint, mono: true },
        { label: "Metric version", value: manifest.metric_version, mono: true },
        { label: "Cutoff rule", value: typeof context.before_date === "string" ? `Exclusive: game_date < ${context.before_date}` : "—" },
        { label: "Lineage", value: <Link href="/data-status">Data lineage and operations</Link> },
        ...(report ? report.operations.map(step => ({ label: `${step.step_id} result hashes`, value: `Saved ${step.saved_result_sha256} · recomputed ${step.recomputed_result_sha256}`, mono: true })) : [])
      ]}><details className="ui-data-details-section"><summary>Canonical manifest, original plan and retained plan</summary><pre className="research-document">{JSON.stringify(manifest, null, 2)}</pre></details></DataDetailsButton>} />
    {entry && <PlayerIdentity playerId="1630567" name="Scottie Barnes" team="TOR" size="sm" />}
    {primary && <ConversationResult result={primary} retained />}
    <ResearchLayout findings={<>
      <StatTile label="Operations" value={manifest.results.length} footnote={manifest.results.map(result => humanLabel(result.operation)).join(" · ") || "None retained"} />
      <StatTile label="Season" value={String(context.season ?? "—")} footnote={typeof context.phase === "string" ? humanLabel(context.phase) : undefined} />
      <StatTile label="Saved" value={formatDate(detail.created_at.slice(0, 10))} footnote={detail.metadata.question_saved ? "Question retained" : "Question excluded"} />
      <StatTile label="Reproduction" value={report ? (report.match ? "Pass" : "Mismatch") : verifying ? "Running…" : "Not run"} footnote={report ? `${report.provider_calls} provider calls` : "Runs without AI"} />
    </>}>
      <p className="research-caption">{detail.metadata.question_saved ? `Opted-in question: ${detail.metadata.question}` : "The question was not retained."}</p>
      {verifyError && <div role="alert"><GatedNote tone="warning">Reproduction unavailable: {verifyError}. Retained exports remain available.</GatedNote></div>}
      {report && <div role="status" className="panel research-section">
        <p>{report.match ? "PASS · all retained results, evidence and destinations match" : `MISMATCH · ${report.reason ?? "Retained semantics differ"}`} · Provider calls: {report.provider_calls}</p>
        <ul>{report.operations.map(step => <li key={step.step_id}>{step.step_id} · {humanLabel(step.operation)} · {step.match ? "MATCH" : "MISMATCH"}</li>)}</ul>
      </div>}
      <GatedNote why={<>
        <p>Metric version: {manifest.metric_version}. Stats retains the complete bounded cohort; other operations retain their declared windows, samples and top-k. Reopening runs the canonical operation against pinned inputs; retained results below remain immutable.</p>
        <p>The title and opted-in question are durable metadata separate from the analytical hash.</p>
        <p>JSON retains exact types and precision. CSV includes chunked manifest JSON and exact evidence cells with formula escaping. Zero and null differ; large manifests are better read as JSON. Exports and reproduction need the local API and retained inputs.</p>
        {manifest.limitations.length > 0 && <ul>{manifest.limitations.map((text, index) => <li key={index}>{text}</li>)}</ul>}
      </>}>Retained results reopen against their pinned release; zero and unknown stay distinct.</GatedNote>
      {manifest.results.filter(result => result !== primary).map(result => <ConversationResult key={result.step_id} result={result} retained />)}
    </ResearchLayout>
  </PageShell>;
}
