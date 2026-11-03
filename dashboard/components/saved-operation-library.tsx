"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { listOperations, type SavedSummary } from "@/lib/saved-operations";
import { formatDate, throughLabel } from "@/lib/format-date";
import { humanLabel } from "@/lib/route-availability";
import { publicInvestigation } from "@/lib/public-investigations";
import type { SavedInvestigation } from "@/lib/types";
import { WorkbenchInvestigationsList } from "./workbench-investigations-list";
import { CountChip, FilterBar } from "./ui/filter-bar";
import { DataDetailsButton } from "./ui/data-details";
import { GatedNote } from "./ui/gated-note";
import { ResearchLayout } from "./ui/page-shell";
import { Skeleton } from "./ui/skeleton";
import { StatTile } from "./ui/stat-tile";
import { Button, ButtonLink } from "./ui/kit";

const day = (value: string | null | undefined) => value ? formatDate(value.slice(0, 10)) : "—";
/** "2024-25 · Regular Season · Through Apr 14, 2025" from a retained context. */
export function contextLine(context: Record<string, unknown>): string {
  const before = typeof context.before_date === "string" ? context.before_date : null;
  return [context.season, typeof context.phase === "string" ? humanLabel(context.phase) : null, throughLabel(before)].filter(Boolean).join(" · ");
}

/**
 * Saved Investigations on the Research template: retained analytical operations (paginated) and
 * the legacy archive. Release IDs and hashes sit behind each row's Details (D5).
 */
export function SavedOperationLibrary({ legacy, legacyError }: { legacy: SavedInvestigation[]; legacyError: string | null }) {
  const [items, setItems] = useState<SavedSummary[]>([]);
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let active = true;
    listOperations(offset).then(value => { if (active) { setItems(value); setError(null); } }).catch(cause => { if (active) setError(cause instanceof Error ? cause.message : "Could not load retained operations"); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [offset, retry]);
  function page(next: number) { setLoading(true); setItems([]); setError(null); setOffset(next); }
  const latest = [...items.map(item => item.created_at), ...legacy.map(item => item.created_at)].sort().at(-1);
  return <>
    <FilterBar collapsible={false} label="Saved investigations" summary="Saved investigations" scope={<span className="research-scope-label">Retained results reopen against their pinned release</span>}
      count={<CountChip>{loading ? "…" : `${items.length}${items.length >= 50 ? "+" : ""}`} saved · {legacy.length} legacy</CountChip>} />
    <ResearchLayout findings={loading ? <>{[0, 1, 2].map(i => <Skeleton key={i} height={88} />)}</> : <>
      <StatTile label="Saved Operations" value={error ? null : `${offset + items.length}${items.length >= 50 ? "+" : ""}`} footnote="Manual or conversational results" />
      <StatTile label="Legacy Investigations" value={legacyError ? null : legacy.length} footnote="Original IDs and signatures kept" />
      <StatTile label="Last Saved" value={latest ? day(latest) : null} footnote={latest ? undefined : "Nothing saved yet"} />
    </>}>
      <section aria-label="Saved analytical operations" className="research-section">
        <h2>Saved Analytical Operations</h2>
        {loading && <p role="status" className="sr-only">Loading retained operations…</p>}
        {error && <div role="alert"><GatedNote tone="warning" action={<Button size="lg" onClick={() => { setLoading(true); setRetry(value => value + 1); }}>Retry library</Button>}>{error}</GatedNote></div>}
        {!loading && !error && items.length === 0 && <GatedNote action={<ButtonLink size="lg" href="/research/ask">Run an Investigation Without AI</ButtonLink>} why={<p>Explicitly retained manual or conversational results. Questions are optional metadata; provider narrative is excluded.</p>}>No retained operations on this page.</GatedNote>}
        {loading && <Skeleton height={240} />}
        {!loading && !error && items.length > 0 && <div className="table-wrapper research-table" role="region" aria-label="Saved operations table" tabIndex={0}>
          <table className="data-table">
            <thead><tr><th>Title</th><th>Operations</th><th>Scope</th><th>Saved</th><th>Question</th><th><span className="sr-only">Details</span></th></tr></thead>
            <tbody>{items.map(item => <tr key={item.id}>
              <th scope="row"><Link href={`/investigations/saved/${item.id}`}>{publicInvestigation(item)?.title ?? item.title}</Link></th>
              <td>{item.operations.map(humanLabel).join(" · ")}</td>
              <td>{contextLine(item.context)}</td>
              <td>{day(item.created_at)}</td>
              <td>{item.question_saved ? "Retained by opt-in" : "Excluded"}</td>
              <td><DataDetailsButton label="Details" rows={[{ label: "Release", value: String(item.context.release_id ?? "—"), mono: true }, { label: "Manifest SHA-256", value: item.manifest_sha256, mono: true }, { label: "Saved", value: item.created_at, mono: true }, { label: "ID", value: item.id, mono: true }]} /></td>
            </tr>)}</tbody>
          </table>
        </div>}
        <div className="research-pager"><Button size="lg" disabled={loading || offset === 0} onClick={() => page(Math.max(0, offset - 50))}>Previous saved operations</Button><span>Page {offset / 50 + 1}</span><Button size="lg" disabled={loading || !!error || items.length < 50} onClick={() => page(offset + 50)}>Next saved operations</Button></div>
      </section>
      <section aria-label="Legacy saved investigations" className="research-section">
        <h2>Legacy Saved Investigations</h2>
        {legacyError ? <GatedNote why={<p>{legacyError}</p>}>Legacy investigations are unavailable until the local API connection is restored.</GatedNote> : <WorkbenchInvestigationsList items={legacy} />}
      </section>
    </ResearchLayout>
  </>;
}
