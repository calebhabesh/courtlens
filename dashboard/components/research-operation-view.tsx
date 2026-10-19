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
import { Icon } from "./ui/icon";
import { ButtonLink } from "./ui/kit";

const OPERATION_PAGES = [
  { title: "Player Comparison", href: "/compare", icon: "swap" as const, description: "Aligned production, efficiency and per-metric differences." },
  { title: "Similar Players", href: "/similar-players", icon: "person" as const, description: "Closest observed production profiles and their sample support." },
  { title: "Shot Profile", href: "/similar-players/shot-profile", icon: "chart" as const, description: "Observed shooting zones and profile peers." },
  { title: "Shot Aftermath", href: "/research/shooting/aftermath", icon: "trend" as const, description: "Possession outcomes following mapped shots." },
  { title: "WOWY", href: "/wowy", icon: "person" as const, description: "Team exposure with and without selected players." },
  { title: "Stat Line Shift", href: "/stat-line-shift", icon: "chart-column" as const, description: "How a player's stat line changes with and without a teammate." },
  { title: "Player Matchups", href: "/matchups", icon: "swap" as const, description: "Explicit source assignments between offense and defense." },
  { title: "Recent Games", href: "/last-games", icon: "calendar" as const, description: "Confirmed appearances, trends and game logs." },
];

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
    if (!new URLSearchParams(serialized).get("operation")) return;
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
  if (!params.get("operation")) return <PageShell template="research"><PageHeader title="Research Operation" subtitle="Choose an operation to explore published observations." actions={<ButtonLink size="lg" href="/investigations">Saved Investigations</ButtonLink>} />
    <section className="pc04-operation-gallery" aria-label="Available research operations">{OPERATION_PAGES.map(operation => <Link className="pc04-operation-card" href={operation.href} key={operation.href}><Icon name={operation.icon} size={20} /><h2>{operation.title}</h2><p>{operation.description}</p></Link>)}</section>
  </PageShell>;
  return <PageShell template="research" className="research-view conversation research-operation">
    <PageHeader title="Research Operation" subtitle="One exact manual operation, rerun against its retained release without AI." actions={<ButtonLink size="lg" href="/investigations">Saved Investigations</ButtonLink>} />
    <FilterBar collapsible={false} label="Operation scope" summary="Retained scope" scope={<span className="research-scope-label">{turn ? contextLine(turn.context) : "Retained release and arguments are preserved"}</span>}
      details={<DataDetailsButton rows={turn ? [{ label: "Resolved context", value: JSON.stringify(turn.context), mono: true }, { label: "Context fingerprint", value: turn.context_fingerprint, mono: true }, { label: "Conversation", value: turn.conversation_id, mono: true }] : []} />} />
    {!current && <><p role="status" className="sr-only">Loading retained observations…</p><ResearchBodySkeleton tiles={3} /></>}
    {current?.error && <div role="alert"><GatedNote tone="warning" action={<ButtonLink size="lg" href="/research/ask">Open Ask</ButtonLink>}>{current.error}</GatedNote></div>}
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
