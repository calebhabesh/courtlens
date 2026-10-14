"use client";

import { useState } from "react";
import { activeThreadKey, announceHistoryChange, assistantPrivacyNotice, clearAssistantHistory } from "@/lib/assistant-history";
import { ArticleSection } from "./ui/article-layout";
import { Button } from "./ui/kit";

// AR06 moved clearing all conversations and the privacy notice here from the chat page.
export function AssistantHistorySettings() {
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  async function clear() {
    setBusy(true); setStatus(null);
    try {
      await clearAssistantHistory();
      try { localStorage.removeItem(activeThreadKey); } catch { /* History itself is on the server. */ }
      announceHistoryChange("settings", null);
      setConfirming(false); setStatus("All local conversations were deleted. Saved findings remain available.");
    } catch (cause) { setStatus(cause instanceof Error ? cause.message : "Could not delete conversations."); }
    finally { setBusy(false); }
  }
  return <ArticleSection id="history" title="History and privacy" label="Assistant history and privacy">
    <p>{assistantPrivacyNotice}</p>
    {confirming
      ? <div role="alert" className="ui-article-actions"><p>Delete all local conversations? Saved findings remain available.</p><Button size="sm" disabled={busy} onClick={() => void clear()}>Confirm deletion</Button><Button size="sm" disabled={busy} onClick={() => setConfirming(false)}>Keep history</Button></div>
      : <div className="ui-article-actions"><Button size="sm" onClick={() => { setConfirming(true); setStatus(null); }}>Clear history</Button></div>}
    {status && <p role="status">{status}</p>}
  </ArticleSection>;
}
