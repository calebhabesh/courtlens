"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { getSavedOperation, operationExportUrl, reproduceOperation, type SavedDetail, type SavedReproduction } from "@/lib/saved-operations";
import { ConversationResult } from "./conversation-result";
import { useToast } from "./ui/toast";

export function SavedOperationDetail({ id }: {id: string}) {
  const [detail, setDetail] = useState<SavedDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [report, setReport] = useState<SavedReproduction | null>(null);
  const [verifying, setVerifying] = useState(false);
  const [verifyError, setVerifyError] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);
  const busy = useRef(false);
  const { toast } = useToast();

  useEffect(() => {let active=true;getSavedOperation(id).then(value=>{if(active){setDetail(value);setError(null);}}).catch(cause=>{if(active)setError(cause instanceof Error ? cause.message : "Could not read retained evidence");});return()=>{active=false;};},[id,retry]);
  async function verify() {
    if(busy.current) return;
    busy.current=true;setVerifying(true);setVerifyError(null);setReport(null);
    try {
      const rep = await reproduceOperation(id);
      setReport(rep);
      if (rep.match) {
        toast({
          title: "Reproduction Verified",
          description: "All retained results, evidence and destinations match.",
          variant: "positive",
        });
      } else {
        toast({
          title: "Reproduction Mismatch",
          description: rep.reason ?? "Retained semantics differ",
          variant: "negative",
        });
      }
    } catch(cause) {
      const msg = cause instanceof Error ? cause.message : "Reproduction failed";
      setVerifyError(msg);
      toast({
        title: "Verification Failed",
        description: msg,
        variant: "negative",
      });
    } finally {
      busy.current=false;setVerifying(false);
    }
  }
  if(error) return <div role="alert"><p>{error}</p><button className="button" onClick={()=>{setError(null);setRetry(value=>value+1);}}>Retry saved detail</button><Link href="/investigations">Back to library</Link></div>;
  if(!detail) return <p role="status">Loading retained evidence…</p>;
  const manifest=detail.manifest;
  return <article className="saved-operation-detail">
    <Link href="/investigations">All saved investigations</Link><h1>{detail.title}</h1><p>Saved {detail.created_at} · immutable analytical evidence</p>
    <p className="conversation-context">Release {String(manifest.context.release_id)} · {String(manifest.context.season)} · {String(manifest.context.phase)} · before {String(manifest.context.before_date)} · {String(manifest.context.window)}</p>
    <p>Metric version: {manifest.metric_version}. Stats retains the complete bounded cohort; other operations retain their declared windows, samples and top-k. Reopening runs the canonical operation against pinned inputs; retained results below remain immutable.</p>
    <p>{detail.metadata.question_saved ? `Opted-in question: ${detail.metadata.question}` : "The question was not retained."} The title and opted-in question are durable metadata separate from the analytical hash.</p>
    <p>Manifest SHA-256: <code className="saved-hash">{detail.manifest_sha256}</code></p>
    <div className="page-actions"><button className="button" disabled={verifying} onClick={()=>void verify()}>{verifying ? "Reproducing…" : "Verify reproduction without AI"}</button><a className="button" href={operationExportUrl(id,"json")}>Export JSON</a><a className="button" href={operationExportUrl(id,"csv")}>Export CSV</a><Link className="button" href="/data-status">Data lineage and operations</Link></div>
    {verifyError && <p role="alert">Reproduction unavailable: {verifyError}. Retained exports remain available.</p>}
    {report && <div role="status"><p>{report.match ? "PASS · all retained results, evidence and destinations match" : `MISMATCH · ${report.reason ?? "Retained semantics differ"}`} · Provider calls: {report.provider_calls}</p><ul>{report.operations.map(step=><li key={step.step_id}>{step.step_id} · {step.operation} · {step.match ? "MATCH" : "MISMATCH"}<details><summary>Result hashes</summary><code className="saved-hash">Saved: {step.saved_result_sha256}<br />Recomputed: {step.recomputed_result_sha256}</code></details></li>)}</ul></div>}
    <p>JSON retains exact types and precision. CSV includes chunked manifest JSON and exact evidence cells with formula escaping. Zero and null differ; large manifests are better read as JSON. Exports and reproduction need the local API and retained inputs.</p>
    {manifest.limitations.length>0 && <ul>{manifest.limitations.map((text,index)=><li key={index}>{text}</li>)}</ul>}
    {manifest.results.map(result=><ConversationResult key={result.step_id} result={result} />)}
    <details><summary>Canonical manifest, original plan and retained plan</summary><pre>{JSON.stringify(manifest,null,2)}</pre></details>
  </article>;
}
