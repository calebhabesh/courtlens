"use client";

import { useEffect, useId, useRef, useState } from "react";
import Link from "next/link";
import type { ConversationContext, DurableThreadHeader, DurableTurnRecord, HybridTurnRequest } from "@/lib/assistant-v2.generated";
import { assistantPrivacyNotice, assistantThreads, assistantTurns, clearAssistantHistory, deleteAssistantThread, newAssistantThread, stopAssistantTurn } from "@/lib/assistant-history";
import { phaseLabels, streamAssistantTurn, type TurnPhase } from "@/lib/assistant-stream";
import { CatalogScopeFields } from "./catalog-scope-fields";
import { HybridAnswer } from "./hybrid-answer";
import { Button } from "./ui/controls";

function mergeTurns(previous: DurableTurnRecord[], fresh: DurableTurnRecord[]) {
  const replacements = new Map(fresh.map(turn => [turn.turn_id, turn]));
  return [...previous.map(turn => replacements.get(turn.turn_id) ?? turn), ...fresh.filter(turn => !previous.some(old => old.turn_id === turn.turn_id))];
}
const changeKey = "courtload-assistant-history-change-v2";
const changeEvent = "courtload-assistant-history-change";
const activeKey = "courtload-assistant-active-thread-v2";
const examples = ["Explain pick and roll", "How do I compare two players here?", "Which point guard had the most assists per game last season?"];
const messageOf = (cause: unknown) => cause instanceof Error ? cause.message : "The assistant service could not be reached. Your question is preserved.";
type LiveTurn = { requestId: string; phase?: TurnPhase; narrative: string };
function remember(thread: string | null) { try { if (thread) localStorage.setItem(activeKey, thread); else localStorage.removeItem(activeKey); } catch { /* History itself remains on the server. */ } }

export function ThreadedAssistant({ initialContext = {} }: { initialContext?: ConversationContext }) {
  const id = useId();
  const [threads, setThreads] = useState<DurableThreadHeader[]>([]);
  const [threadCursor, setThreadCursor] = useState<string | null>(null);
  const [thread, setThread] = useState<string | null>(null);
  const [turns, setTurns] = useState<DurableTurnRecord[]>([]);
  const [turnCursor, setTurnCursor] = useState<string | null>(null);
  const [question, setQuestion] = useState("");
  const [context, setContext] = useState<ConversationContext>(initialContext);
  const [scopeEdited, setScopeEdited] = useState(false);
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [transportRetry, setTransportRetry] = useState<HybridTurnRequest | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<"thread" | "all" | null>(null);
  // AR05 progress for the outstanding request; retained history stays authoritative.
  const [live, setLive] = useState<LiveTurn | null>(null);
  const input = useRef<HTMLTextAreaElement>(null);
  const epoch = useRef(0);
  const lock = useRef(false);
  const currentThread = useRef<string | null>(null);
  const scopeChanged = useRef(false);
  const outstanding = useRef<HybridTurnRequest | null>(null);
  const instance = useRef("");
  const incomingScope = JSON.stringify(initialContext);
  const lastIncomingScope = useRef(incomingScope);
  const tailCursor = useRef<string | undefined>(undefined);

  function notifyHistory() {
    const change = { source: instance.current, thread: currentThread.current, nonce: crypto.randomUUID() };
    window.dispatchEvent(new CustomEvent(changeEvent, { detail: change }));
    try { localStorage.setItem(changeKey, JSON.stringify(change)); } catch { /* Same-page synchronization still works. */ }
  }
  useEffect(() => {
    if (lastIncomingScope.current === incomingScope) return;
    lastIncomingScope.current = incomingScope;
    const value = JSON.parse(incomingScope) as ConversationContext;
    // Navigation changes only the next question; retained turns remain immutable.
    queueMicrotask(() => { setContext(value); setScopeEdited(true); scopeChanged.current = true; });
  }, [incomingScope]);
  useEffect(() => {
    instance.current = crypto.randomUUID();
    let active = true;
    let revision = 0;
    async function synchronize(change?: { source?: string; thread?: string | null }) {
      if (change?.source === instance.current) return;
      const version = ++revision;
      const owned = epoch.current;
      try {
        const list = await assistantThreads();
        if (!active || version !== revision || owned !== epoch.current) return;
        setThreads(list.threads); setThreadCursor(list.next_cursor ?? null);
        const tid = change && !lock.current ? change.thread : currentThread.current;
        if (!tid) {
          if (change && !lock.current) { currentThread.current = null; setThread(null); setTurns([]); setTurnCursor(null); tailCursor.current = undefined; }
          return;
        }
        const switched = tid !== currentThread.current;
        const cursor = switched ? undefined : tailCursor.current;
        const page = await assistantTurns(tid, cursor, 100);
        if (!active || version !== revision || owned !== epoch.current) return;
        if (switched) { currentThread.current = tid; setThread(tid); tailCursor.current = undefined; setScopeEdited(false); scopeChanged.current = false; }
        setTurns(previous => !switched && cursor ? mergeTurns(previous, page.turns) : page.turns);
        setTurnCursor(page.next_cursor ?? null);
      } catch (cause) { if (active && owned === epoch.current) setError(messageOf(cause)); }
    }
    const changed = (event: Event) => { void synchronize((event as CustomEvent).detail); };
    const stored = (event: StorageEvent) => {
      if (event.key === changeKey && event.newValue) {
        try { void synchronize(JSON.parse(event.newValue)); } catch { /* Ignore unrelated malformed browser storage. */ }
      }
    };
    const focused = () => { if (document.visibilityState === "visible") void synchronize(); };
    window.addEventListener(changeEvent, changed); window.addEventListener("storage", stored);
    window.addEventListener("focus", focused); document.addEventListener("visibilitychange", focused);
    return () => { active = false; window.removeEventListener(changeEvent, changed); window.removeEventListener("storage", stored); window.removeEventListener("focus", focused); document.removeEventListener("visibilitychange", focused); };
  }, []);

  async function refreshThreads(cursor?: string) {
    const owned = epoch.current;
    const page = await assistantThreads(cursor);
    if (epoch.current !== owned) return;
    setThreads(previous => cursor ? [...previous, ...page.threads.filter(row => !previous.some(old => old.thread_id === row.thread_id))] : page.threads);
    setThreadCursor(page.next_cursor ?? null);
  }
  async function readTurns(tid: string, owned: number, cursor?: string) {
    const selectedCursor = cursor ?? tailCursor.current;
    const page = await assistantTurns(tid, selectedCursor, 100);
    if (epoch.current !== owned || currentThread.current !== tid) return;
    if (cursor) tailCursor.current = cursor;
    setTurns(previous => selectedCursor ? mergeTurns(previous, page.turns) : page.turns);
    setTurnCursor(page.next_cursor ?? null);
    if (page.next_cursor && outstanding.current && epoch.current === owned) await readTurns(tid, owned, page.next_cursor);
  }
  async function openThread(tid: string) {
    if (lock.current) return;
    const owned = ++epoch.current;
    tailCursor.current = undefined; currentThread.current = tid; setThread(tid); remember(tid); setTurns([]); setTurnCursor(null); setError(null); setTransportRetry(null); setScopeEdited(false); scopeChanged.current = false; setQuestion(""); setBusy(true); lock.current = true;
    try { await readTurns(tid, owned); notifyHistory(); }
    catch (cause) { if (epoch.current === owned) setError(messageOf(cause)); }
    finally { if (epoch.current === owned) { lock.current = false; setBusy(false); } }
  }
  useEffect(() => {
    let active = true;
    const generation = epoch;
    async function restore() {
      try {
        const list = await assistantThreads();
        if (!active) return;
        setThreads(list.threads); setThreadCursor(list.next_cursor ?? null);
        let retained: string | null = null;
        try { retained = localStorage.getItem(activeKey); } catch { /* Optional browser convenience. */ }
        if (retained) {
          try {
            const page = await assistantTurns(retained, undefined, 100);
            if (!active) return;
            currentThread.current = retained; setThread(retained); setTurns(page.turns); setTurnCursor(page.next_cursor ?? null);
          } catch (cause) { if (active) { setError(messageOf(cause)); remember(null); } }
        }
      } catch (cause) { if (active) setError(messageOf(cause)); }
      finally { if (active) setReady(true); }
    }
    void restore();
    return () => { active = false; generation.current++; };
  }, []);

  const pending = turns.find(turn => turn.state === "running" || turn.state === "pending");
  const pendingId = pending?.turn_id;
  useEffect(() => {
    if (!pendingId || !thread || turnCursor) return;
    let active = true;
    const owned = epoch.current;
    let timer: ReturnType<typeof setTimeout>;
    async function poll() {
      try { const cursor = tailCursor.current; const page = await assistantTurns(thread!, cursor, 100); if (active && epoch.current === owned) { setTurns(previous => cursor ? mergeTurns(previous, page.turns) : page.turns); setTurnCursor(page.next_cursor ?? null); } }
      catch (cause) { if (active && epoch.current === owned) setError(messageOf(cause)); }
      if (active) timer = setTimeout(() => void poll(), 1500);
    }
    timer = setTimeout(() => void poll(), 1500);
    return () => { active = false; clearTimeout(timer); };
  }, [pendingId, thread, turnCursor]);

  async function createThread() {
    if (lock.current || pending) return;
    lock.current = true; setBusy(true); setError(null);
    const owned = ++epoch.current;
    setQuestion("");
    try {
      const header = await newAssistantThread();
      if (epoch.current !== owned) return;
      tailCursor.current = undefined; currentThread.current = header.thread_id; setThread(header.thread_id); remember(header.thread_id); setTurns([]); setTurnCursor(null); setTransportRetry(null); setScopeEdited(false); scopeChanged.current = false; setContext(initialContext); setConfirmDelete(null);
      await refreshThreads(); notifyHistory(); input.current?.focus();
    } catch (cause) { if (epoch.current === owned) setError(messageOf(cause)); }
    finally { if (epoch.current === owned) { lock.current = false; setBusy(false); } }
  }
  async function execute(request: HybridTurnRequest) {
    if (lock.current) return;
    const owned = epoch.current;
    lock.current = true; setBusy(true); setError(null); setTransportRetry(null); outstanding.current = request;
    setLive({ requestId: request.request_id, narrative: "" });
    const progress = (update: (current: LiveTurn) => LiveTurn) => setLive(previous => previous?.requestId === request.request_id ? update(previous) : previous);
    try {
      const answer = await streamAssistantTurn(request, event => {
        if (epoch.current !== owned) return;
        if (event.event === "phase") progress(current => ({ ...current, phase: event.phase }));
        else if (event.event === "narrative") progress(current => ({ ...current, narrative: current.narrative + event.text }));
        else if (event.event === "accepted" && request.thread_id) void readTurns(request.thread_id, owned).catch(() => undefined);
      });
      if (epoch.current !== owned) return;
      await readTurns(answer.thread_id, owned);
      if (epoch.current !== owned) return;
      // Stop may already have returned a terminal cancellation. History is authoritative.
      setQuestion(previous => previous.trim() === request.message ? "" : previous); setScopeEdited(false); scopeChanged.current = false; await refreshThreads(); notifyHistory(); input.current?.focus();
    } catch (cause) {
      if (epoch.current === owned) {
        setError(messageOf(cause)); setTransportRetry(request);
        if (request.thread_id) { try { await readTurns(request.thread_id, owned); } catch { /* Keep the transport error and retry identity. */ } }
      }
    } finally {
      setLive(previous => previous?.requestId === request.request_id ? null : previous);
      if (epoch.current === owned) { outstanding.current = null; lock.current = false; setBusy(false); }
    }
  }
  async function submit(message = question, retryOf?: string) {
    if (lock.current || pending || turnCursor || !message.trim()) return;
    let tid = currentThread.current;
    if (!tid) {
      lock.current = true; setBusy(true); setError(null);
      const owned = epoch.current;
      try {
        const header = await newAssistantThread();
        if (epoch.current !== owned) return;
        tid = header.thread_id; tailCursor.current = undefined; currentThread.current = tid; setThread(tid); remember(tid);
        setThreads(previous => [...previous, header]); notifyHistory();
      } catch (cause) { setError(messageOf(cause)); return; }
      finally { lock.current = false; setBusy(false); }
    }
    const selections = scopeEdited || turns.length === 0 ? context : undefined;
    const request: HybridTurnRequest = { request_id: crypto.randomUUID(), thread_id: tid, message: message.trim(), ...(selections && Object.values(selections).some(value => value != null) ? { context: selections } : {}), ...(retryOf ? { retry_of: retryOf } : {}) };
    // Accept first; polling identifies the durable turn even while POST is still running.
    void execute(request);
    const owned = epoch.current;
    const pollAccepted = async () => {
      if (epoch.current !== owned || outstanding.current?.request_id !== request.request_id) return;
      try { await readTurns(tid!, owned); notifyHistory(); } catch { /* The POST or subsequent poll supplies an actionable error. */ }
      if (outstanding.current?.request_id === request.request_id && epoch.current === owned) setTimeout(() => void pollAccepted(), 1000);
    };
    setTimeout(() => void pollAccepted(), 200);
  }
  async function stop() {
    if (!pending || !thread) return;
    const owned = epoch.current;
    try {
      const record = await stopAssistantTurn(thread, pending.turn_id);
      if (epoch.current === owned) {
        epoch.current++; outstanding.current = null; lock.current = false; setBusy(false);
        setTurns(previous => previous.map(turn => turn.turn_id === record.turn_id ? record : turn));
        setQuestion(record.request.message); setTransportRetry(null); notifyHistory();
      }
    }
    catch (cause) { if (epoch.current === owned) setError(messageOf(cause)); }
  }
  async function remove() {
    if (lock.current || pending || !confirmDelete) return;
    lock.current = true; setBusy(true); setError(null);
    try {
      if (confirmDelete === "all") await clearAssistantHistory(); else if (thread) await deleteAssistantThread(thread);
      epoch.current++; tailCursor.current = undefined; currentThread.current = null; setThread(null); remember(null); setTurns([]); setTurnCursor(null); setTransportRetry(null); setQuestion(""); setScopeEdited(false); scopeChanged.current = false; setContext(initialContext); setConfirmDelete(null); await refreshThreads(); notifyHistory();
    } catch (cause) { setError(messageOf(cause)); }
    finally { lock.current = false; setBusy(false); }
  }
  function editScope(value: Partial<ConversationContext>) {
    const latest = [...turns].reverse().find(turn => turn.response?.scope)?.response?.scope?.selections;
    const base = scopeChanged.current ? undefined : latest;
    scopeChanged.current = true;
    setContext(previous => ({ ...(base ?? previous), ...value })); setScopeEdited(true);
  }
  const shownContext = scopeEdited ? context : [...turns].reverse().find(turn => turn.response?.scope)?.response?.scope?.selections ?? context;
  const blocked = busy || !!pending || !ready;
  return <section className="conversation threaded-assistant panel" aria-label="CourtLens assistant">
    <p className="text-muted"><Link href="/research/ask?experience=manual">Open manual research</Link></p>
    <div className="conversation-row"><h2>Conversations</h2><div className="conversation-prompts"><Button disabled={blocked} onClick={() => void createThread()}>New chat</Button><Button disabled={blocked || !thread} onClick={() => setConfirmDelete("thread")}>Delete chat</Button><Button disabled={blocked} onClick={() => setConfirmDelete("all")}>Clear history</Button></div></div>
    <p className="text-muted">{assistantPrivacyNotice}</p>
    {confirmDelete && <div role="alert"><p>{confirmDelete === "all" ? "Delete all local conversations?" : "Delete this local conversation?"} Saved findings remain available.</p><Button disabled={blocked} onClick={() => void remove()}>Confirm deletion</Button> <Button onClick={() => setConfirmDelete(null)}>Keep history</Button></div>}
    <details className="thread-history"><summary>History ({threads.length}{threadCursor ? "+" : ""})</summary><nav aria-label="Conversation history">{threads.map(header => <Button key={header.thread_id} disabled={blocked} aria-current={header.thread_id === thread ? "true" : undefined} onClick={() => void openThread(header.thread_id)}>{header.title} <span className="text-muted">{new Date(header.updated_at).toLocaleDateString()}</span></Button>)}</nav>{threads.length === 0 && <p>No saved conversations yet.</p>}{threadCursor && <Button disabled={blocked} onClick={() => void refreshThreads(threadCursor).catch(cause => setError(messageOf(cause)))}>Load more conversations</Button>}</details>
    <details><summary>Edit scope for the next question{scopeEdited ? " · changed" : ""}</summary><p>Earlier answers keep their scope. Relative dates in your question are resolved by the assistant.</p><fieldset disabled={blocked} className="conversation-controls"><legend>Next question scope</legend><CatalogScopeFields release={shownContext.release_id ?? undefined} season={shownContext.season ?? ""} phase={shownContext.phase ?? ""} before={shownContext.before_date ?? ""} onSeason={season => editScope({ season: season || null })} onPhase={phase => editScope({ phase: (phase || undefined) as ConversationContext["phase"] })} onBefore={before_date => editScope({ before_date: before_date || null })} /><label>Window<select value={shownContext.window ?? ""} onChange={event => editScope({ window: (event.target.value || undefined) as ConversationContext["window"] })}><option value="">Inherit or use default</option><option value="season">Season to date</option><option value="last_10">Last 10 appearances</option><option value="last_5">Last 5 appearances</option></select></label></fieldset></details>
    {!ready && <p role="status">Reading local history…</p>}
    {error && <div role="alert"><p>{error}</p>{transportRetry && <Button disabled={blocked} onClick={() => void execute(transportRetry)}>Check or replay request</Button>}<Button disabled={blocked} onClick={() => { if (thread) void openThread(thread); else void refreshThreads().then(() => setError(null)).catch(cause => setError(messageOf(cause))); }}>Reload history</Button></div>}
    <div aria-label="Messages" className="thread-messages">{turns.map(turn => <article key={turn.turn_id} className="conversation-turn"><p className="thread-question"><strong>You</strong><br />{turn.request.message}</p>{turn.response ? <HybridAnswer answer={turn.response} busy={blocked || !!turnCursor} onChoice={choice => void submit(choice)} onRetry={() => { setQuestion(turn.request.message); void submit(turn.request.message, turn.turn_id); }} /> : <div className="thread-live" aria-busy="true"><p role="status">{live?.requestId === turn.request.request_id && live.phase ? phaseLabels[live.phase] : turn.state === "pending" ? "Question saved. Waiting to start…" : "Working on your question…"}</p>{live?.requestId === turn.request.request_id && live.narrative && <p className="hybrid-narrative">{live.narrative}</p>}</div>}</article>)}</div>
    {turnCursor && <><p>Load newer turns before adding a question.</p><Button disabled={blocked} onClick={() => void readTurns(thread!, epoch.current, turnCursor).catch(cause => setError(messageOf(cause)))}>Load newer turns</Button></>}
    {turns.length === 0 && <div className="conversation-prompts">{examples.map(example => <Button key={example} disabled={blocked} onClick={() => { setQuestion(example); input.current?.focus(); }}>{example}</Button>)}</div>}
    <form className="thread-composer" onSubmit={event => { event.preventDefault(); void submit(); }}><label htmlFor={`${id}-question`}>Your question</label><textarea ref={input} id={`${id}-question`} rows={3} maxLength={2000} value={question} onChange={event => setQuestion(event.target.value)} /><div className="conversation-row"><span className="text-muted">{question.length} / 2000</span>{busy || pending ? <Button disabled={!pending} onClick={() => void stop()}>Stop</Button> : <Button type="submit" variant="primary" disabled={!ready || !!turnCursor || !question.trim()}>Send question</Button>}</div></form>
    <p role="status" aria-live="polite">{busy || pending ? live?.phase ? phaseLabels[live.phase] : "Question retained; verifying the answer…" : "Ready"}</p>
  </section>;
}
