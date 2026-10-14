"use client";
import { EntityField } from "./entity-picker";
import { useSearchParams } from "next/navigation";
import { ThreadedAssistant } from "./threaded-assistant";
import type { ConversationContext } from "@/lib/assistant-v2.generated";

import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";
import { getAssistantStatus } from "@/lib/workbench-api";
import type { AssistantStatusResponse } from "@/lib/types";
import { clearConversation, conversationRequest, pinnedContext, sendTurn, statusLabels, type Context, type Turn, type TurnRequest } from "@/lib/conversation";
import { ConversationResult } from "./conversation-result";
import { SaveOperation } from "./save-operation";
import { DatePicker } from "./ui/date-picker";
import { Button } from "./ui/kit";

interface AskCourtLensProps { variant?: "page" | "panel"; initialReleaseId?: string; initialSeason?: string; initialPhase?: string; initialBeforeDate?: string; initialWindow?: string }
const prompts = ["Whose minutes increased recently without scoring increasing?", "Which players have produced similarly to Scottie Barnes over their last ten appearances?", "How variable has Scottie Barnes’s scoring been, and did his minutes vary too?"];
const examples: Record<string, Record<string, unknown>> = {
  workload_shifts: {period_n:10,min_minutes:0,limit:20}, similarity:{target_player_id:"1630567",window:"last_10",top_k:5}, distribution:{player_id:"1630567",metric:"pts",window_n:20}, compare_periods:{player_id:"1630567",mode:"appearances",period_a_n:10,period_b_n:10}, splits:{player_id:"1630567"}, definition:{metric:"ts_pct"}, query:{metric_selectors:[{key:"pts_per_game"}],page:{limit:10}}, profile:{player_id:"1630567"}, compare:{player_a:"1630567",player_b:"1629628"}, team:{team_id:"1610612761"}, forecast:{player_id:"1630567"}, finance:{}
};
export function AskCourtLens(props: AskCourtLensProps) {
  const params = useSearchParams();
  if (params.get("experience") !== "manual") return <ThreadedAssistant initialContext={{release_id:params.get("releaseId") ?? params.get("release_id") ?? undefined,season:params.get("season") ?? undefined,phase:(params.get("phase") ?? undefined) as ConversationContext["phase"],before_date:params.get("beforeDate") ?? params.get("before_date") ?? undefined,window:(params.get("window") ?? undefined) as ConversationContext["window"]}} variant={props.variant} />;
  return <LegacyAskCourtLens {...props} />;
}

function LegacyAskCourtLens(props: AskCourtLensProps) {
  const id = useId();
  const [context, setContext] = useState<Context>({release_id:props.initialReleaseId,season:props.initialSeason,phase:props.initialPhase,before_date:props.initialBeforeDate,window:props.initialWindow});
  const [question, setQuestion] = useState("");
  const [history, setHistory] = useState<{message: string; turn: Turn}[]>([]);
  const [status, setStatus] = useState<AssistantStatusResponse | null>(null);
  const [operations, setOperations] = useState<{name: string; description: string; parameters: unknown}[]>([]);
  const [manual, setManual] = useState(true);
  const [operation, setOperation] = useState("workload_shifts");
  const [includeMinutes, setIncludeMinutes] = useState(false);
  const [argumentsText, setArgumentsText] = useState(JSON.stringify(examples.workload_shifts, null, 2));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [retry, setRetry] = useState<TurnRequest | null>(null);
  const latest = history.at(-1)?.turn;
  const proposed = latest?.plan?.context_changes;
  const confirmedContext = proposed ? {...context,...proposed,release_id: proposed.release_id ?? (proposed.season && proposed.season !== context.season ? undefined : context.release_id)} : null;
  const current = useRef<Turn | null>(null);
  const generation = useRef(0);
  const busy = useRef(false);
  const input = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    let active = true;
    const epoch = generation;
    getAssistantStatus().then(value => {if (active) {setStatus(value);setManual(!value.configured);}}).catch(() => {if(active) setError("Could not read AI configuration. Manual research remains available.");});
    conversationRequest<typeof operations>("operations", {}).then(value => {if(active) setOperations(value);}).catch(() => {if(active) setError("Could not read operation definitions. Retry by reopening this page.");});
    return () => { active=false; epoch.current++; if(current.current && !busy.current) void clearConversation(current.current.conversation_id).catch(() => {}); };
  }, []);
  async function execute(request: TurnRequest) {
    if(busy.current) return;
    const owned = generation.current;
    busy.current=true;setLoading(true);setError(null);setRetry(null);
    try {
      const turn = await sendTurn(request);
      if(generation.current !== owned) {await clearConversation(turn.conversation_id);return;}
      current.current=turn;setContext(pinnedContext(turn.context));
      setHistory(previous => [...previous, {message:request.message,turn}].slice(-8));
      input.current?.focus();
    } catch(cause) {
      if(generation.current === owned) {setError(cause instanceof Error ? cause.message : "Investigation failed");setRetry(request);}
    } finally { if(generation.current===owned) {busy.current=false;setLoading(false);} }
  }
  function submit(choice?: string, prompt?: string) {
    const message = (prompt ?? question).trim() || (choice ? "Use the selected canonical identity" : "Run the selected manual research operation");
    let plan: TurnRequest["plan"];
    if(manual && !choice) {
      try {
        const args: unknown = JSON.parse(argumentsText);
        if(!args || typeof args!=="object" || Array.isArray(args)) throw new Error("Arguments must be a JSON object.");
        const argumentsObject = args as Record<string, unknown>;
        plan={steps:[{step_id:"manual",operation,arguments:argumentsObject}, ...(operation === "distribution" && includeMinutes ? [{step_id:"minutes",operation:"distribution",arguments:{...argumentsObject,metric:"min_per_game"}}] : [])]};
      } catch(cause) {setError(cause instanceof Error ? cause.message : "Invalid arguments");return;}
    }
    const retained = current.current;
    void execute({request_id:crypto.randomUUID(),message,context,...(retained ? {conversation_id:retained.conversation_id,context_fingerprint:retained.context_fingerprint}:{}),...(choice ? {clarification_choice:choice}:{}),...(plan ? {plan}:{})});
  }
  async function reset(nextContext?: Context) {
    if(busy.current) return;
    try {
      if(current.current) await clearConversation(current.current.conversation_id);
      generation.current++;current.current=null;setHistory([]);setRetry(null);setError(null);setQuestion("");
      if(nextContext) setContext(nextContext);
      input.current?.focus();
    } catch(cause) {setError(cause instanceof Error ? cause.message : "Could not clear local conversation");}
  }
  let entityArguments: Record<string, unknown> = {};
  try { const value: unknown = JSON.parse(argumentsText); if(value && typeof value === "object" && !Array.isArray(value)) entityArguments = value as Record<string,unknown>; } catch { /* JSON editor retains its own validation. */ }
  const entityKeys = Object.keys(examples[operation] ?? {}).filter(key=>["player_id","target_player_id","player_a","player_b","team_id"].includes(key));
  function selectEntity(key: string, value: string) {
    setArgumentsText(JSON.stringify({...entityArguments,[key]:value},null,2));
  }
  return <div className="conversation panel">
    <div className="conversation-row"><h2>Ask CourtLens</h2><Button size="lg" disabled={loading} onClick={() => void reset()}>Clear conversation</Button></div>
    <p role="status">{status ? status.configured ? `AI configured · ${status.model}` : "AI disabled · manual research available" : "Checking AI configuration…"}</p>
    <p className="text-muted">With AI enabled, your question, pinned context and bounded analytical definitions are sent to Google. Working conversation state stays local and expires after 30 minutes. Clearing it does not erase provider records. No web search or paid fallback is enabled.</p>
    {status && !status.configured && <details><summary>Configure optional AI</summary><p>{status.setup_instructions}</p><p>{status.privacy_notice}</p><Link href="/settings">Open settings</Link></details>}
    <fieldset disabled={!!latest || loading} className="conversation-controls"><legend>{latest ? "Pinned analytical context · clear to change" : "Analytical context"}</legend>
      <label>Release<input value={context.release_id ?? ""} placeholder="Resolve current release once" onChange={e=>setContext({...context,release_id:e.target.value || undefined})} /></label>
      <label>Season<input value={context.season ?? ""} onChange={e=>setContext({...context,season:e.target.value || undefined})} /></label>
      <label>Phase<select value={context.phase ?? "regular_season"} onChange={e=>setContext({...context,phase:e.target.value})}>{["regular_season","playoffs","preseason","play_in","cup_final","summer_league"].map(p=><option key={p}>{p}</option>)}</select></label>
      <div className="conversation-date"><span aria-hidden="true">Before date (exclusive)</span><DatePicker label="Before date (exclusive)" value={context.before_date ?? ""} placeholder="Release cutoff" onChange={value=>setContext({...context,before_date:value || undefined})} /></div>
      <label>Window<select value={context.window ?? "season"} onChange={e=>setContext({...context,window:e.target.value})}>{["season","last_10","last_5"].map(w=><option key={w}>{w}</option>)}</select></label>
    </fieldset>
    <div className="conversation-row"><label><input type="checkbox" checked={manual} disabled={loading} onChange={e=>{setManual(e.target.checked);setRetry(null);}} /> Run manually without AI</label><Link href="/investigations">Saved investigations</Link></div>
    {manual ? <div className="conversation-manual"><label htmlFor={`${id}-operation`}>Research operation</label><select id={`${id}-operation`} value={operation} disabled={loading} onChange={e=>{setOperation(e.target.value);setArgumentsText(JSON.stringify(examples[e.target.value] ?? {},null,2));}}>{Object.keys(examples).map(name=><option key={name} value={name}>{name.replaceAll("_"," ")}</option>)}</select><p>{operations.find(o=>o.name===operation)?.description}</p>{entityKeys.map(key=><EntityField key={`${operation}:${key}`} label={key === "team_id" ? "Research team" : key === "player_a" ? "Research player A" : key === "player_b" ? "Research player B" : "Research player"} kind={key === "team_id" ? "team" : "player"} value={typeof entityArguments[key] === "string" ? entityArguments[key] as string : ""} releaseId={context.release_id ?? null} season={context.season ?? null} phase={context.phase ?? null} beforeDate={context.before_date ?? null} disabled={loading} onChange={value=>selectEntity(key,value)} />)}<label htmlFor={`${id}-arguments`}>Operation arguments (JSON)</label><textarea id={`${id}-arguments`} rows={6} maxLength={32768} disabled={loading} value={argumentsText} onChange={e=>setArgumentsText(e.target.value)} />{operation === "distribution" && <label><input type="checkbox" checked={includeMinutes} disabled={loading} onChange={e=>setIncludeMinutes(e.target.checked)} /> Include a minutes distribution with the same window</label>}<details><summary>Accepted arguments and definitions</summary><pre>{JSON.stringify(operations.find(o=>o.name===operation)?.parameters ?? {},null,2)}</pre></details></div> : <div className="conversation-prompts">{prompts.map(prompt=><Button size="lg" disabled={loading} key={prompt} onClick={()=>{setQuestion(prompt);submit(undefined,prompt);}}>{prompt}</Button>)}</div>}
    <form onSubmit={e=>{e.preventDefault();submit();}}><label htmlFor={`${id}-question`}>{latest ? "Follow-up question" : "Research question"}{manual ? " (optional label)" : ""}</label><textarea ref={input} id={`${id}-question`} rows={2} maxLength={2000} value={question} onChange={e=>setQuestion(e.target.value)} disabled={loading} /><div className="conversation-row"><span>{question.length} / 2000</span><Button size="lg" variant="primary" type="submit" disabled={loading || (!manual && !question.trim())}>{loading ? "Investigating…" : manual ? "Run manual operation" : "Ask CourtLens"}</Button></div></form>
    {error && <div role="alert"><p>{error}</p>{retry && <Button size="lg" disabled={loading} onClick={()=>void execute(retry)}>Retry this request</Button>}</div>}
    <p role="status" aria-live="polite">{loading ? "Reading the pinned analytical inputs…" : latest ? statusLabels[latest.status] : "Ready for research"}</p>
    <div role="region" aria-label="Conversation history">{history.map(({message,turn})=><article key={turn.turn_id} className="conversation-turn"><p><strong>You:</strong> {message}</p><p><strong>{statusLabels[turn.status]}:</strong> {turn.interpretation}</p><p className="conversation-context">Release {String(turn.context.release_id)} · {String(turn.context.season)} · {String(turn.context.phase)} · before {String(turn.context.before_date)} · {String(turn.context.window)}</p>{turn.results.map(result=><ConversationResult key={result.step_id} result={result} />)}{turn === latest && <SaveOperation turn={turn} disabled={loading} />}{turn.limitations.length>0 && <ul>{turn.limitations.map((text,i)=><li key={i}>{text}</li>)}</ul>}{turn === latest && turn.status==="clarification_required" && <div className="conversation-prompts">{turn.choices.map(choice=><Button size="lg" key={choice.value} disabled={loading} onClick={()=>submit(choice.value)}>{choice.label ?? choice.name ?? choice.value}</Button>)}{confirmedContext && <><p>Proposed: season {confirmedContext.season ?? "resolve from release"}, phase {confirmedContext.phase}, before {confirmedContext.before_date ?? "the release cutoff"}, window {confirmedContext.window}, release {confirmedContext.release_id ?? "resolve for the requested season"}.</p><Button size="lg" disabled={loading} onClick={()=>void reset(confirmedContext)}>Use proposed context in a new conversation</Button></>}{turn.choices.length===0 && !turn.plan?.context_changes && <p>Specify your intended metric or meaning in the follow-up, or choose a manual operation.</p>}</div>}<details><summary>Verified analytical manifest</summary><pre>{JSON.stringify(turn.manifest,null,2)}</pre></details></article>)}</div>
    <p className="text-muted">Active conversations are temporary. Retaining conversational plans and evidence is scheduled for the saved-investigation block; opening a view does not save this conversation.</p>
  </div>;
}
