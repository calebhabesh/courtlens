"use client";

import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { clearConversation, readResearchDestination, sendTurn, statusLabels, type Turn } from "@/lib/conversation";
import { SaveOperation } from "./save-operation";
import { ConversationResult } from "./conversation-result";

export function ResearchOperationView() {
  const params = useSearchParams();
  const serialized = params.toString();
  const [state, setState] = useState<{url: string; turn?: Turn; error?: string} | null>(null);
  const pending = useRef<{url: string; promise: Promise<Turn>} | null>(null);
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
      pending.current = {url: serialized, promise: (async () => {
        const { step, context } = readResearchDestination(new URLSearchParams(serialized));
        // Keep the executed turn available for an explicit evidence save until leaving.
        const turn = await sendTurn({ request_id: crypto.randomUUID(), message: "Open the exact manual Research operation", context, plan: {steps: [step]} });
        return turn;
      })()};
    }
    pending.current.promise.then(turn => {
      if(active) setState({url: serialized, turn});
    }).catch(error => {
      if(active) setState({url: serialized, error: error instanceof Error ? error.message : "Research operation unavailable"});
    });
    return () => { active = false; };
  }, [serialized]);
  const current = state?.url === serialized ? state : null;
  return <div className="workbench-content conversation"><h1>Research operation</h1><p>The retained release and every operation argument are preserved. This view runs without AI.</p>{!current && <p role="status">Loading retained observations…</p>}{current?.error && <p role="alert">{current.error}</p>}{current?.turn && <><p role="status">{statusLabels[current.turn.status]} · {current.turn.interpretation}</p><p className="conversation-context">{JSON.stringify(current.turn.context)}</p>{current.turn.results.map(result => <ConversationResult key={result.step_id} result={result} />)}<SaveOperation turn={current.turn} /></>}</div>;
}
