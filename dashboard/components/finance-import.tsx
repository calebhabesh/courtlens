"use client";
import { useState } from "react";
import type { WorkbenchJobItem } from "@/lib/types";
export function FinanceImport({ onBooksChanged }: { onBooksChanged: () => void }) {
  const [hash,setHash] = useState(""); const [job,setJob] = useState<WorkbenchJobItem | null>(null);
  const [error,setError] = useState(""); const [busy,setBusy] = useState(false);
  async function jobRead() {
    if (!job) return;
    setBusy(true); setError("");
    try { const response = await fetch(`/api/jobs/${encodeURIComponent(job.job_id)}`); if (!response.ok) throw new Error("Job status unavailable"); const data = await response.json(); setJob(data); if (data.status === "succeeded") onBooksChanged(); }
    catch(err) {setError((err as Error).message);} finally {setBusy(false);}
  }
  return <details className="panel finance-import"><summary>Refresh / import / correction workflow</summary>
    <p>Automated finance acquisition is source-blocked. Refresh imports a content-addressed bundle already staged by the local operator; it does not fetch a current market feed. Read refresh below reruns the selected immutable book.</p>
    <ol><li>Generate the versioned CSV template with <code>courtload finance-template PATH.csv</code> and prepare its manifest and source evidence.</li><li>Validate with <code>courtload finance-preview BUNDLE_DIRECTORY</code>. Stage and enqueue using <code>courtload finance-import BUNDLE_DIRECTORY</code>, or submit an existing staged hash here. Staged hashes are directory names under the configured artifacts root at finance-import/SHA-256. The CLI already enqueues its import; this button reuses the same tracked allowlist.</li><li>A correction selects its parent book and references the original observation ID, reason and supporting source. Original books remain retained. After success, reload the book list and explicitly select the new book.</li></ol>
    <form className="finance-controls" onSubmit={async e => {e.preventDefault();setBusy(true);setError("");setJob(null);try { const response=await fetch("/api/finance-import",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({bundle_hash:hash})}); const data=await response.json();if(!response.ok) throw new Error(typeof data.detail === "string" ? data.detail : "Finance import rejected");setJob(data); }catch(err){setError((err as Error).message);}finally{setBusy(false);} }}>
      <label>Operator-staged bundle SHA-256<input required pattern="[a-f0-9]{64}" maxLength={64} value={hash} onChange={e => setHash(e.target.value)} /></label><button className="button" disabled={busy}>Refresh staged import</button>
    </form>{error && <p role="alert">{error}</p>}{job && <div role="status">Job {job.job_id} · {job.status} · {job.stage}<p>{job.error_summary}</p><pre>{JSON.stringify(job.output_refs,null,2)}</pre><button className="button" disabled={busy} onClick={jobRead}>Check import job</button></div>}
  </details>;
}

