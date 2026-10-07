"use client";

import { useState } from "react";
import { activeThreadKey, announceHistoryChange, assistantPrivacyNotice, clearAssistantHistory } from "@/lib/assistant-history";
import { Button, Section } from "./ui/controls";

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
  return <Section title="Assistant history and privacy" aria-label="Assistant history and privacy">
    <p className="text-muted">{assistantPrivacyNotice}</p>
    {confirming
      ? <div role="alert"><p>Delete all local conversations? Saved findings remain available.</p><Button disabled={busy} onClick={() => void clear()}>Confirm deletion</Button> <Button disabled={busy} onClick={() => setConfirming(false)}>Keep history</Button></div>
      : <Button onClick={() => { setConfirming(true); setStatus(null); }}>Clear history</Button>}
    {status && <p role="status">{status}</p>}
  </Section>;
}
