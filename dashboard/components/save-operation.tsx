"use client";

import Link from "next/link";
import { useId, useRef, useState } from "react";
import type { Turn } from "@/lib/conversation";
import { canSaveTurn, makeSaveRequest, saveOperation, type SaveRequest, type SavedDetail } from "@/lib/saved-operations";
import { Button } from "./ui/kit";

export function SaveOperation({ turn, disabled = false }: { turn: Turn; disabled?: boolean }) {
  const id = useId();
  const [title, setTitle] = useState("");
  const [includeQuestion, setIncludeQuestion] = useState(false);
  const [pending, setPending] = useState(false);
  const [saved, setSaved] = useState<SavedDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const attempt = useRef<SaveRequest | null>(null);
  const busy = useRef(false);
  const errorRef = useRef<HTMLParagraphElement>(null);
  if (!canSaveTurn(turn)) return null;
  async function save() {
    if (busy.current || disabled) return;
    busy.current = true; setPending(true); setError(null);
    const request = makeSaveRequest(turn, title.trim(), includeQuestion, attempt.current?.request_id ?? crypto.randomUUID());
    attempt.current = request;
    try { setSaved(await saveOperation(request)); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Saving failed. Execute this operation again if the conversation expired."); requestAnimationFrame(() => errorRef.current?.focus()); }
    finally { busy.current = false; setPending(false); }
  }
  if (saved) return <p role="status">Saved permanently: <Link href={`/investigations/saved/${saved.id}`}>{saved.title}</Link>. Clearing the conversation keeps this investigation.</p>;
  return <form className="saved-operation-form" onSubmit={event => { event.preventDefault(); void save(); }}>
    <h3>Save this investigation</h3>
    <p>Retain an immutable manifest, complete Stats cohort (up to 2,000 eligible rows) and each other operation’s declared bounds. Saving uses pinned inputs without AI. Images are presentation artifacts.</p>
    <p>The title is durable metadata. Your question is excluded unless you opt in. Saved evidence persists after the 30-minute conversation expires or is cleared; provider retention is separate.</p>
    {error && <p role="alert" tabIndex={-1} ref={errorRef}>{error}</p>}
    <label htmlFor={`${id}-title`}>Investigation title</label>
    <input id={`${id}-title`} required maxLength={255} pattern=".*\S.*" value={title} disabled={pending || disabled} onChange={event => {setTitle(event.target.value);attempt.current=null;setError(null);}} />
    <label><input type="checkbox" checked={includeQuestion} disabled={pending || disabled} onChange={event => {setIncludeQuestion(event.target.checked);attempt.current=null;setError(null);}} /> Retain my selected question as durable metadata</label>
    <Button size="lg" variant="primary" type="submit" disabled={pending || disabled || !title.trim()}>{pending ? "Saving…" : error ? "Retry saving investigation" : "Save investigation"}</Button>
  </form>;
}
