"use client";

import { readStoredValue, storageKeys } from "@/lib/storage-keys";

import { useEffect, useId, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { IntentLink } from "@/components/intent-link";
import { pageContextLabel } from "@/lib/assistant-page-context";
import type { AssistantPageContext, ConversationContext, DurableThreadHeader, HybridTurnRequest } from "@/lib/assistant-v2.generated";
import type { StoredTurnRecord as DurableTurnRecord } from "@/lib/assistant-v3.generated";
import { activeThreadKey, announceHistoryChange, assistantThreads, assistantTurns, deleteAssistantThread, historyChangeEvent, historyChangeKey, newAssistantThread, stopAssistantTurn } from "@/lib/assistant-history";
import { phaseLabels, streamAssistantTurn, streamProgress, type StreamProgress } from "@/lib/assistant-stream";
import { composerKeyAction, examplePrompts, groupThreads, scopeChipLabel } from "@/lib/assistant-chat";
import { CatalogScopeFields } from "./catalog-scope-fields";
import { BrandMark } from "./brand";
import { HybridAnswer } from "./hybrid-answer";
import { AgentAnswer } from "./agent-answer";
import { Button, ButtonSummary, IconButton } from "./ui/kit";
import { Icon } from "./ui/icon";
import { Field } from "./ui/field";
import { Select } from "./ui/select";
import { isPublicAsk } from "@/lib/hosted";
import { askLimits, isLimitRefusal, limitLine, refusalMessage, type AskLimits } from "@/lib/public-ask";
import { WorkbenchApiError } from "@/lib/workbench-api";
import { useAccount } from "@/lib/account-context";

function mergeTurns(previous: DurableTurnRecord[], fresh: DurableTurnRecord[]) {
  const replacements = new Map(fresh.map(turn => [turn.turn_id, turn]));
  return [...previous.map(turn => replacements.get(turn.turn_id) ?? turn), ...fresh.filter(turn => !previous.some(old => old.turn_id === turn.turn_id))];
}
const sidebarKey = storageKeys.sidebar;
const narrowQuery = "(max-width: 900px)";
function subscribeNarrow(change: () => void) { const media = window.matchMedia(narrowQuery); media.addEventListener("change", change); return () => media.removeEventListener("change", change); }
const limitRefusal = (cause: unknown) => cause instanceof WorkbenchApiError && cause.status === 429 && isLimitRefusal(cause.detail) ? cause.detail : null;
const messageOf = (cause: unknown) => {
  const refusal = limitRefusal(cause);
  if (refusal) return refusalMessage(refusal);
  return cause instanceof Error ? cause.message : "The assistant service could not be reached. Your question is preserved.";
};
type LiveTurn = StreamProgress & { requestId: string };
function remember(thread: string | null) { try { if (thread) localStorage.setItem(activeThreadKey, thread); else localStorage.removeItem(activeThreadKey); } catch { /* History itself remains on the server. */ } }

function turnSelections(turn: DurableTurnRecord) {
  const response = turn.response;
  if (!response) return undefined;
  return "answer" in response ? response.selections : response.scope?.selections;
}

// AR06: full-height chat on /ask; "panel" is the header drawer, where conversations always overlay.
// `headerActions` (the drawer's expand and close) end the top bar, so the panel has one header row.
export function ThreadedAssistant({ initialContext = {}, variant = "page", pageContext, pageLabel, headerActions }: { initialContext?: ConversationContext; variant?: "page" | "panel"; pageContext?: AssistantPageContext; pageLabel?: string; headerActions?: ReactNode }) {
  const id = useId();
  // Accounts plan: asking needs an account or the demo account.
  const account = useAccount();
  const signedOut = account.status === "signed-out";
  const [removedPage, setRemovedPage] = useState<string | null>(null);
  const pageKey = JSON.stringify(pageContext);
  const attachedPage = pageContext && removedPage !== pageKey ? pageContext : undefined;
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
  // Public Ask (hosted demo): this visitor's questions left today and the shared limit.
  const [limits, setLimits] = useState<AskLimits | null>(null);
  const readLimits = () => { if (isPublicAsk) void askLimits().then(setLimits).catch(() => undefined); };
  useEffect(() => { readLimits(); }, []);
  const [transportRetry, setTransportRetry] = useState<HybridTurnRequest | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [drawer, setDrawer] = useState(false);
  const scroller = useRef<HTMLDivElement>(null);
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

  function notifyHistory() { announceHistoryChange(instance.current, currentThread.current); }
  // Conversations belong to the account (or, on the demo account, to this browser): another
  // account sees its own list, so signing in or out starts over with that list.
  const accountKey = account.status === "loading" ? null : account.user?.id ?? "";
  const lastAccount = useRef<string | null>(null);
  useEffect(() => {
    if (accountKey === null) return;
    const previous = lastAccount.current;
    lastAccount.current = accountKey;
    if (previous === null || previous === accountKey) return;
    epoch.current += 1;
    currentThread.current = null; remember(null);
    queueMicrotask(() => { setThread(null); setTurns([]); setTurnCursor(null); setError(null); });
    tailCursor.current = undefined;
    void refreshThreads().catch(() => undefined);
    readLimits();
  }, [accountKey]);
  const narrow = useSyncExternalStore(subscribeNarrow, () => window.matchMedia(narrowQuery).matches, () => false);
  useEffect(() => {
    let stored = false;
    try { stored = readStoredValue(sidebarKey) === "true"; } catch { /* Optional browser convenience. */ }
    if (stored) queueMicrotask(() => setCollapsed(true));
  }, []);
  const overlay = variant === "panel" || narrow;
  function toggleSidebar() {
    if (variant === "panel" || window.matchMedia(narrowQuery).matches) { setDrawer(open => !open); return; }
    setCollapsed(previous => { try { localStorage.setItem(sidebarKey, String(!previous)); } catch { /* Optional. */ } return !previous; });
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
      if (event.key === historyChangeKey && event.newValue) {
        try { void synchronize(JSON.parse(event.newValue)); } catch { /* Ignore unrelated malformed browser storage. */ }
      }
    };
    const focused = () => { if (document.visibilityState === "visible") void synchronize(); };
    window.addEventListener(historyChangeEvent, changed); window.addEventListener("storage", stored);
    window.addEventListener("focus", focused); document.addEventListener("visibilitychange", focused);
    return () => { active = false; window.removeEventListener(historyChangeEvent, changed); window.removeEventListener("storage", stored); window.removeEventListener("focus", focused); document.removeEventListener("visibilitychange", focused); };
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
    tailCursor.current = undefined; currentThread.current = tid; setThread(tid); remember(tid); setTurns([]); setTurnCursor(null); setError(null); setTransportRetry(null); setScopeEdited(false); scopeChanged.current = false; setQuestion(""); setConfirmDelete(false); setDrawer(false); setBusy(true); lock.current = true;
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
        try { retained = readStoredValue(activeThreadKey); } catch { /* Optional browser convenience. */ }
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
      tailCursor.current = undefined; currentThread.current = header.thread_id; setThread(header.thread_id); remember(header.thread_id); setTurns([]); setTurnCursor(null); setTransportRetry(null); setScopeEdited(false); scopeChanged.current = false; setContext(initialContext); setConfirmDelete(false); setDrawer(false);
      await refreshThreads(); notifyHistory(); input.current?.focus();
    } catch (cause) { if (epoch.current === owned) setError(messageOf(cause)); }
    finally { if (epoch.current === owned) { lock.current = false; setBusy(false); } }
  }
  async function execute(request: HybridTurnRequest) {
    if (lock.current) return;
    const owned = epoch.current;
    lock.current = true; setBusy(true); setError(null); setTransportRetry(null); outstanding.current = request;
    setLive({ requestId: request.request_id, text: "" });
    const progress = (update: (current: LiveTurn) => LiveTurn) => setLive(previous => previous?.requestId === request.request_id ? update(previous) : previous);
    try {
      const answer = await streamAssistantTurn(request, event => {
        if (epoch.current !== owned) return;
        progress(current => ({ ...current, ...streamProgress(current, event) }));
        if (event.event === "accepted" && request.thread_id) void readTurns(request.thread_id, owned).catch(() => undefined);
      });
      if (epoch.current !== owned) return;
      await readTurns(answer.thread_id, owned);
      if (epoch.current !== owned) return;
      // Stop may already have returned a terminal cancellation. History is authoritative.
      setQuestion(previous => previous.trim() === request.message ? "" : previous); setScopeEdited(false); scopeChanged.current = false; await refreshThreads(); notifyHistory(); readLimits(); input.current?.focus();
    } catch (cause) {
      if (epoch.current === owned) {
        const refusal = limitRefusal(cause);
        setError(messageOf(cause));
        if (refusal) { setLimits(refusal); return; }
        setTransportRetry(request);
        if (request.thread_id) { try { await readTurns(request.thread_id, owned); } catch { /* Keep the transport error and retry identity. */ } }
      }
    } finally {
      setLive(previous => previous?.requestId === request.request_id ? null : previous);
      if (epoch.current === owned) { outstanding.current = null; lock.current = false; setBusy(false); }
    }
  }
  async function submit(message = question, retryOf?: string) {
    if (signedOut) { account.openSignIn("Sign in, or use the demo account, to ask questions."); return; }
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
    const selections = scopeEdited || turns.length === 0 || attachedPage ? context : undefined;
    const request: HybridTurnRequest = { request_id: crypto.randomUUID(), thread_id: tid, message: message.trim(), ...(attachedPage ? { page_context: attachedPage } : {}), ...(selections && Object.values(selections).some(value => value != null) ? { context: selections } : {}), ...(retryOf ? { retry_of: retryOf } : {}) };
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
      if (thread) await deleteAssistantThread(thread);
      epoch.current++; tailCursor.current = undefined; currentThread.current = null; setThread(null); remember(null); setTurns([]); setTurnCursor(null); setTransportRetry(null); setQuestion(""); setScopeEdited(false); scopeChanged.current = false; setContext(initialContext); setConfirmDelete(false); await refreshThreads(); notifyHistory();
    } catch (cause) { setError(messageOf(cause)); }
    finally { lock.current = false; setBusy(false); }
  }
  function editScope(value: Partial<ConversationContext>) {
    const latest = [...turns].reverse().map(turnSelections).find(Boolean);
    const base = scopeChanged.current ? undefined : latest;
    scopeChanged.current = true;
    setContext(previous => ({ ...(base ?? previous), ...value })); setScopeEdited(true);
  }
  const shownContext = scopeEdited || attachedPage ? context : [...turns].reverse().map(turnSelections).find(Boolean) ?? context;
  const blocked = busy || !!pending || !ready;
  const lastTurn = turns.at(-1);
  // Follow new turns and streamed prose to the bottom of the transcript.
  useEffect(() => { const node = scroller.current; if (node) node.scrollTop = node.scrollHeight; }, [turns.length, lastTurn?.state, live?.text, live?.phase, live?.step]);
  // The server names an untitled thread "New chat"; the top bar is a label, so it reads in Title Case.
  const storedTitle = threads.find(header => header.thread_id === thread)?.title;
  const title = !storedTitle || storedTitle === "New chat" ? "New Chat" : storedTitle;
  const sidebarId = `${id}-conversations`;
  const isEmpty = ready && turns.length === 0 && !turnCursor;
  const canSend = ready && !turnCursor && !!question.trim();
  const scopeLabel = `${scopeChipLabel(shownContext)}${scopeEdited ? " · Edited" : ""}`;
  const composer = signedOut ? (
    <div className="ask-composer-block">
      <div className="ask-sign-in" data-field="ask-sign-in">
        <p>Sign in, or use the demo account, to ask questions.</p>
        <div className="ask-sign-in-actions">
          <Button size="md" variant="primary" onClick={() => account.openSignIn("Sign in, or use the demo account, to ask questions.")}>Sign in</Button>
          <Button size="md" variant="secondary" icon="user" onClick={() => void account.signInDemo().catch(cause => setError(messageOf(cause)))}>Use the demo account</Button>
        </div>
      </div>
    </div>
  ) : (
    <div className="ask-composer-block">
      <form className="ask-composer" onSubmit={event => { event.preventDefault(); void submit(); }}>
        <label htmlFor={`${id}-question`} className="sr-only">Your question</label>
        <textarea disabled={!ready} ref={input} id={`${id}-question`} rows={1} maxLength={2000} placeholder="Ask a basketball question…" value={question} onChange={event => setQuestion(event.target.value)} onKeyDown={event => { if (composerKeyAction({ key: event.key, shiftKey: event.shiftKey, isComposing: event.nativeEvent.isComposing }) === "send") { event.preventDefault(); void submit(); } }} />
        {busy || pending
          ? <IconButton size="md" variant="secondary" round icon="stop" label="Stop" disabled={!pending} onClick={() => void stop()} />
          : <IconButton size="md" variant={canSend ? "primary" : "secondary"} round type="submit" icon="up" label="Send question" disabled={!canSend} />}
      </form>
      <div className="ask-composer-meta">
        {attachedPage && <div className="ask-page-context" role="group" aria-label="Attached page context"><Icon name="page" size={14} /><span>{pageContextLabel(attachedPage, pageLabel)}</span><IconButton size="xs" round icon="close" label="Remove page context" disabled={blocked} onClick={() => setRemovedPage(pageKey)} /></div>}
        <details className="ask-scope"><ButtonSummary size="xs" variant="ghost" icon="sliders" iconAfter="chevron-down" truncate aria-label={`Scope: ${scopeLabel} · Edit scope for the next question`}>{scopeLabel}</ButtonSummary><div className="ask-scope-pop"><p className="text-muted">Applies to the next question. Earlier answers keep their scope, and relative dates in your question are resolved by the assistant.</p><fieldset disabled={blocked} className="conversation-controls"><legend className="sr-only">Next question scope</legend><CatalogScopeFields release={shownContext.release_id ?? undefined} season={shownContext.season ?? ""} phase={shownContext.phase ?? ""} before={shownContext.before_date ?? ""} onSeason={season => editScope({ season: season || null })} onPhase={phase => editScope({ phase: (phase || undefined) as ConversationContext["phase"] })} onBefore={before_date => editScope({ before_date: before_date || null })} /><Field label="Window"><Select aria-label="Window" value={shownContext.window ?? ""} onChange={event => editScope({ window: (event.target.value || undefined) as ConversationContext["window"] })}><option value="">Inherit or Use Default</option><option value="season">Season to Date</option><option value="last_10">Last 10 Appearances</option><option value="last_5">Last 5 Appearances</option></Select></Field></fieldset></div></details>
      </div>
    </div>
  );
  return <section className="ask-chat" data-variant={variant} data-collapsed={collapsed} data-drawer={drawer ? "open" : "closed"} aria-label="CourtLens assistant">
    {drawer && <div className="ask-backdrop" aria-hidden="true" onClick={() => setDrawer(false)} />}
    <aside className="ask-sidebar" id={sidebarId} aria-label="Conversations">
      <div className="ask-sidebar-head"><h2>Conversations</h2>{overlay && <IconButton size="sm" variant="ghost" icon="close" label="Close Conversations" onClick={() => setDrawer(false)} />}</div>
      <nav aria-label="Conversation history" className="ask-history">
        {groupThreads(threads).map(group => <div key={group.label} className="ask-history-group"><h3>{group.label}</h3>{group.threads.map(header => <button type="button" key={header.thread_id} className="ask-history-item" disabled={blocked} aria-current={header.thread_id === thread ? "true" : undefined} title={new Date(header.updated_at).toLocaleString()} onClick={() => void openThread(header.thread_id)}>{header.title}</button>)}</div>)}
        {threads.length === 0 && <p className="ask-history-empty">No saved conversations yet. Your questions will appear here.</p>}
        {threadCursor && <Button size="sm" variant="ghost" disabled={blocked} onClick={() => void refreshThreads(threadCursor).catch(cause => setError(messageOf(cause)))}>Load More Conversations</Button>}
      </nav>
      <div className="ask-sidebar-foot"><IntentLink href="/research/ask?experience=manual"><Icon name="table" size={14} />Open Manual Research</IntentLink>{!isPublicAsk && <IntentLink href="/settings#history"><Icon name="settings" size={14} />History and Privacy Settings</IntentLink>}</div>
    </aside>
    <div className={`ask-main${isEmpty ? " is-empty" : ""}`}>
      <div className="ask-topbar">
        <IconButton size="sm" variant="ghost" icon="sidebar" label="Conversations" aria-expanded={overlay ? drawer : !collapsed} aria-controls={sidebarId} onClick={toggleSidebar} />
        <p className="ask-title" title={title}>{title}</p>
        <div className="ask-topbar-actions">
          <IconButton size="sm" variant="ghost" icon="compose" label="New Chat" disabled={blocked} onClick={() => void createThread()} />
          {!isPublicAsk && <IconButton size="sm" variant="ghost" icon="trash" label="Delete Chat" disabled={blocked || !thread} onClick={() => setConfirmDelete(true)} />}
          {headerActions && <><span className="ask-topbar-divider" aria-hidden="true" />{headerActions}</>}
        </div>
      </div>
      <div className="ask-scroll" ref={scroller}>
        <div className="ask-column">
          {!ready && <p role="status">Reading local history…</p>}
          {isEmpty && <div className="ask-empty">
            <span className="ask-empty-mark"><BrandMark size={40} /></span>
            <h2>What Do You Want to Know?</h2>
            <p className="text-muted">{isPublicAsk
              ? "Ask about NBA stats, players, history and rules. Answers use CourtLens data first; very recent news may be missing."
              : "Ask about NBA stats, history and news. Answers use CourtLens data first, then cited web sources."}</p>
            {composer}
            <div className="ask-examples">{examplePrompts.map(example => <button type="button" key={example.prompt} className="ask-example" disabled={blocked} onClick={() => void submit(example.prompt)}><span className="ask-example-label">{example.label}</span><span className="ask-example-prompt">{example.prompt}</span></button>)}</div>
          </div>}
          <div role="region" aria-label="Messages" className="ask-messages">{turns.map(turn => <article key={turn.turn_id} className="ask-turn">
            <div className="ask-user"><p className="ask-bubble"><span className="sr-only">You: </span>{turn.request.message}</p></div>
            <div className="ask-assistant"><span className="ask-avatar"><BrandMark size={28} /></span><div className="ask-reply">{turn.response
              ? "answer" in turn.response
                ? <AgentAnswer answer={turn.response} busy={blocked || !!turnCursor} onChoice={choice => void submit(choice)} onRetry={() => { setQuestion(turn.request.message); void submit(turn.request.message, turn.turn_id); }} />
                : <HybridAnswer answer={turn.response} busy={blocked || !!turnCursor} onChoice={choice => void submit(choice)} onRetry={() => { setQuestion(turn.request.message); void submit(turn.request.message, turn.turn_id); }} />
              : <div className="thread-live" aria-busy="true"><p className="ask-phase">{live?.requestId === turn.request.request_id ? live.step?.label ?? (live.phase ? phaseLabels[live.phase] : "Working on your question…") : turn.state === "pending" ? "Question saved. Waiting to start…" : "Working on your question…"}</p>{live?.requestId === turn.request.request_id && live.text && <p className="hybrid-narrative">{live.text}</p>}</div>}</div></div>
          </article>)}</div>
          {turnCursor && <div className="ask-notice"><p>Load newer turns before adding a question.</p><Button size="sm" disabled={blocked} onClick={() => void readTurns(thread!, epoch.current, turnCursor).catch(cause => setError(messageOf(cause)))}>Load Newer Turns</Button></div>}
        </div>
      </div>
      <div className="ask-dock">
        {confirmDelete && <div role="alert" className="ask-notice"><p>Delete this local conversation? Saved findings remain available.</p><div className="ask-notice-actions"><Button size="sm" variant="danger" disabled={blocked} onClick={() => void remove()}>Confirm Deletion</Button><Button size="sm" variant="ghost" onClick={() => setConfirmDelete(false)}>Keep History</Button></div></div>}
        {error && <div role="alert" className="ask-notice"><p>{error}</p><div className="ask-notice-actions">{transportRetry && <Button size="sm" disabled={blocked} onClick={() => void execute(transportRetry)}>Check or Replay Request</Button>}<Button size="sm" disabled={blocked} onClick={() => { if (thread) void openThread(thread); else void refreshThreads().then(() => setError(null)).catch(cause => setError(messageOf(cause))); }}>Reload History</Button></div></div>}
        {!isEmpty && composer}
        {limits && limitLine(limits) && <p className="ask-limit" data-field="ask-limit" data-remaining={limits.remaining} data-site-open={limits.site_open}>{limitLine(limits)}</p>}
        <p role="status" aria-live="polite" aria-atomic="true" className="sr-only">{busy || pending ? live?.step?.label ?? (live?.phase ? phaseLabels[live.phase] : "Question retained; verifying the answer…") : "Ready"}</p>
      </div>
    </div>
  </section>;
}

