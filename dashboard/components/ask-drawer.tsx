"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { AskCourtLens } from "./ask-courtlens";
import { useEffect, useRef } from "react";
import { ThreadedAssistant } from "./threaded-assistant";
import type { AssistantPageContext } from "@/lib/assistant-v2.generated";

export function AskDrawer({ onClose, pageContext, pageLabel }: {onClose: () => void; pageContext: AssistantPageContext; pageLabel: string}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const manual = useSearchParams().get("experience") === "manual";
  const scopeParams = new URLSearchParams();
  for (const [key, value] of Object.entries(pageContext.selections)) {
    if (value != null) scopeParams.set(key, String(value));
  }
  if (manual) scopeParams.set("experience", "manual");
  const fullPageUrl = `/research/ask?${scopeParams}`;
  useEffect(() => {
    const node=dialog.current;
    node?.showModal();
  }, []);
  return <dialog ref={dialog} className="conversation-dialog" aria-labelledby="ask-drawer-title" onClose={onClose}>
    <div className="conversation-row"><h2 id="ask-drawer-title">Research conversation</h2><button className="button" onClick={() => dialog.current?.close()}>Close research conversation</button><Link href={fullPageUrl} onClick={() => dialog.current?.close()}>Open full research page</Link></div>
    {manual ? <AskCourtLens variant="panel" initialReleaseId={pageContext.selections.release_id ?? undefined} initialSeason={pageContext.selections.season ?? undefined} initialPhase={pageContext.selections.phase} initialBeforeDate={pageContext.selections.before_date ?? undefined} initialWindow={pageContext.selections.window} /> : <ThreadedAssistant variant="panel" initialContext={pageContext.selections} pageContext={pageContext} pageLabel={pageLabel} />}
  </dialog>;
}
