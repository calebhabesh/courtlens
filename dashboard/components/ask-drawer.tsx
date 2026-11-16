"use client";

import { useSearchParams } from "next/navigation";
import { AskCourtLens } from "./ask-courtlens";
import { useEffect, useRef } from "react";
import { ThreadedAssistant } from "./threaded-assistant";
import type { AssistantPageContext } from "@/lib/assistant-v2.generated";
import { IconButton, IconButtonLink } from "./ui/kit";

export function AskDrawer({ onClose, pageContext, pageLabel }: {onClose: () => void; pageContext: AssistantPageContext; pageLabel: string}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
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
    // Focus starts on Close, as it did when the drawer had its own header row.
    closeButton.current?.focus();
  }, []);
  const close = () => dialog.current?.close();
  // The panel's expand and close end the chat's own top bar, so the drawer has one header row.
  const actions = <>
    <IconButtonLink size="sm" variant="ghost" icon="expand" label="Open Full Page" href={fullPageUrl} onClick={close} />
    <IconButton ref={closeButton} size="sm" variant="ghost" icon="close" label="Close Ask" onClick={close} />
  </>;
  return <dialog ref={dialog} className="conversation-dialog ask-drawer" aria-labelledby="ask-drawer-title" onClose={onClose}>
    <h2 id="ask-drawer-title" className="sr-only">Ask</h2>
    {manual
      ? <><div className="ask-drawer-head">{actions}</div><AskCourtLens variant="panel" initialReleaseId={pageContext.selections.release_id ?? undefined} initialSeason={pageContext.selections.season ?? undefined} initialPhase={pageContext.selections.phase} initialBeforeDate={pageContext.selections.before_date ?? undefined} initialWindow={pageContext.selections.window} /></>
      : <ThreadedAssistant variant="panel" initialContext={pageContext.selections} pageContext={pageContext} pageLabel={pageLabel} headerActions={actions} />}
  </dialog>;
}
