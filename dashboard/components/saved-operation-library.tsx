"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { listOperations, type SavedSummary } from "@/lib/saved-operations";

export function SavedOperationLibrary() {
  const [items, setItems] = useState<SavedSummary[]>([]);
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let active = true;
    listOperations(offset).then(value => { if(active) {setItems(value);setError(null);} }).catch(cause => {if(active) setError(cause instanceof Error ? cause.message : "Could not load retained operations");}).finally(() => {if(active) setLoading(false);});
    return () => {active=false;};
  }, [offset, retry]);
  function page(next: number) {setLoading(true);setItems([]);setError(null);setOffset(next);}
  return <section aria-label="Saved analytical operations">
    <h2>Saved analytical operations</h2>
    <p>Explicitly retained manual or conversational results. Questions are optional metadata; provider narrative is excluded.</p>
    {loading && <p role="status">Loading retained operations…</p>}
    {error && <div role="alert"><p>{error}</p><button className="button" onClick={()=>{setLoading(true);setRetry(value=>value+1);}}>Retry library</button></div>}
    {!loading && !error && items.length === 0 && <p>No retained operations on this page. <Link href="/research/ask">Run an investigation without AI</Link>.</p>}
    {!loading && !error && items.map(item => <article className="panel" key={item.id}><h3><Link href={`/investigations/saved/${item.id}`}>{item.title}</Link></h3><p>{item.operations.join(" · ")} · Saved {item.created_at}</p><p className="conversation-context">Release {String(item.context.release_id)} · {String(item.context.season)} · {String(item.context.phase)} · before {String(item.context.before_date)}</p><p>{item.question_saved ? "Question retained by opt-in" : "Question excluded"}</p><code className="saved-hash">{item.manifest_sha256}</code></article>)}
    <div className="page-actions"><button className="button" disabled={loading || offset===0} onClick={()=>page(Math.max(0,offset-50))}>Previous saved operations</button><span>Page {offset/50+1}</span><button className="button" disabled={loading || !!error || items.length<50} onClick={()=>page(offset+50)}>Next saved operations</button></div>
  </section>;
}
