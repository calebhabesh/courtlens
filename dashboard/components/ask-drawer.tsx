"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";
import { useSearchParams } from "next/navigation";
import { AskCourtLoad } from "./ask-courtload";
import { buildPreservedContextUrl } from "@/lib/query-url";

export function AskDrawer({ onClose }: {onClose: () => void}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const params = useSearchParams();
  useEffect(() => {
    const node=dialog.current;
    node?.showModal();
  }, []);
  return <dialog ref={dialog} className="conversation-dialog" aria-labelledby="ask-drawer-title" onClose={onClose}>
    <div className="conversation-row"><h2 id="ask-drawer-title">Research conversation</h2><button className="button" onClick={() => dialog.current?.close()}>Close research conversation</button><Link href={buildPreservedContextUrl(params.get("experience") === "manual" ? "/research/ask?experience=manual" : "/research/ask",params)} onClick={() => dialog.current?.close()}>Open full research page</Link></div>
    <AskCourtLoad variant="panel" initialReleaseId={params.get("releaseId") ?? params.get("release_id") ?? undefined} initialSeason={params.get("season") ?? undefined} initialPhase={params.get("phase") ?? undefined} initialBeforeDate={params.get("beforeDate") ?? params.get("before_date") ?? undefined} initialWindow={params.get("window") ?? undefined} />
  </dialog>;
}
