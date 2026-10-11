"use client";

import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { clearConversation, readResearchDestination, sendTurn, statusLabels, type Turn } from "@/lib/conversation";
import { humanLabel } from "@/lib/route-availability";
import { SaveOperation } from "./save-operation";
import { ConversationResult } from "./conversation-result";
import { contextLine } from "./saved-operation-library";
import { FilterBar } from "./ui/filter-bar";
import { DataDetailsButton } from "./ui/data-details";
import { GatedNote } from "./ui/gated-note";
import { PageShell, ResearchLayout } from "./ui/page-shell";
import { PageHeader } from "./ui/panel";
import { StatTile } from "./ui/stat-tile";
import { ResearchBodySkeleton } from "./research-investigation";

/** Deep-link target that reruns one exact manual operation against its retained release, without AI. */
export function ResearchOperationView() {
  const params = useSearchParams();
  const serialized = params.toString();
  const [state, setState] = useState<{ url: string; turn?: Turn; error?: string } | null>(null);
  const pending = useRef<{ url: string; promise: Promise<Turn> } | null>(null);
  const mounted = useRef(false);
  useEffect(() => {
    mounted.current = true;
    const current = pending;
    return () => {
      mounted.current = false;
      queueMicrotask(() => { if (!mounted.current) void current.current?.promise.then(turn => clearConversation(turn.conversation_id)).catch(() => {}); });
    };
  }, []);
  useEffect(() => {
    let active = true;
    if (pending.current?.url !== serialized) {
      if (pending.current) void pending.current.promise.then(turn => clearConversation(turn.conversation_id)).catch(() => {});
      pending.current = { url: serialized, promise: (async () => {
        const { step, context } = readResearchDestination(new URLSearchParams(serialized));
        // Keep the executed turn available for an explicit evidence save until leaving.
        const turn = await sendTurn({ request_id: crypto.randomUUID(), message: "Open the exact manual Research operation", context, plan: { steps: [step] } });
        return turn;
      })() };
    }
    pending.current.promise.then(turn => {
      if (active) setState({ url: serialized, turn });
    }).catch(error => {
      if (active) setState({ url: serialized, error: error instanceof Error ? error.message : "Research operation unavailable" });
    });
    return () => { active = false; };
  }, [serialized]);
  const current = state?.url === serialized ? state : null;
  const turn = current?.turn;
  return <PageShell template="research" className="research-view conversation research-operation">
    <PageHeader title="Research Operation" subtitle="One exact manual operation, rerun against its retained release without AI." actions={<Link className="button" href="/investigations">Saved Investigations</Link>} />
    <FilterBar collapsible={false} label="Operation scope" summary="Retained scope" scope={<span className="research-scope-label">{turn ? contextLine(turn.context) : "Retained release and arguments are preserved"}</span>}
      details={<DataDetailsButton rows={turn ? [{ label: "Resolved context", value: JSON.stringify(turn.context), mono: true }, { label: "Context fingerprint", value: turn.context_fingerprint, mono: true }, { label: "Conversation", value: turn.conversation_id, mono: true }] : []} />} />
    {!current && <><p role="status" className="sr-only">Loading retained observations…</p><ResearchBodySkeleton tiles={3} /></>}
    {current?.error && <div role="alert"><GatedNote tone="warning" action={<Link className="button" href="/research/ask">Open Ask</Link>}>{current.error}</GatedNote></div>}
    {turn && <ResearchLayout findings={<>
      <StatTile label="Status" value={statusLabels[turn.status]} />
      <StatTile label="Operations" value={turn.results.length} footnote={turn.results.map(result => humanLabel(result.operation)).join(" · ")} />
      <StatTile label="Provider Calls" value={typeof turn.accounting?.provider_calls === "number" ? turn.accounting.provider_calls : null} footnote="Runs without AI" />
    </>}>
      <p role="status" className="research-caption">{statusLabels[turn.status]} · {turn.interpretation}</p>
      {turn.results.map(result => <ConversationResult key={result.step_id} result={result} />)}
      <SaveOperation turn={turn} />
    </ResearchLayout>}
  </PageShell>;
}
