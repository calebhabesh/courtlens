"use client";

import Link from "next/link";
import type { HybridTurnResponse } from "@/lib/assistant-v2.generated";
import { researchDestination } from "@/lib/conversation";
import { ConversationResult } from "./conversation-result";
import { Button } from "./ui/controls";

export function safeAnswerUrl(value?: string | null): string | null {
  if (!value || /[\\\u0000-\u0020]/.test(value)) return null;
  if (value.startsWith("/") && !value.startsWith("//")) return value;
  try { const url = new URL(value); return url.protocol === "https:" && !url.username && !url.password ? value : null; } catch { return null; }
}

export function HybridAnswer({ answer, onChoice, onRetry, busy }: {
  answer: HybridTurnResponse; onChoice: (choice: string) => void; onRetry: () => void; busy: boolean;
}) {
  const evidenceSteps = answer.saveable && answer.scope ? answer.blocks.flatMap(block => block.kind === "result" && ["query", "profile", "compare", "team", "forecast", "finance", "definition", "compare_periods", "distribution", "splits", "similarity", "workload_shifts"].includes(block.result.operation) ? [block.result] : []) : [];
  return <div className="hybrid-answer">
    {answer.blocks.map((block, index) => {
      switch (block.kind) {
        case "result": return <details key={index} className="hybrid-result"><summary>View supporting results</summary><ConversationResult result={{ ...block.result, limitations: block.result.limitations ?? [], open_url: block.result.open_url ?? null, eligible_count: block.result.eligible_count ?? null, evidence: block.result.evidence.map(cell => ({ ...cell, sample: cell.sample ?? {}, null_reason: cell.null_reason ?? null })) }} /></details>;
        case "clarification": return <div key={index}><p>{block.text}</p><div className="conversation-prompts">{block.choices?.map(choice => <Button key={choice} disabled={busy} onClick={() => onChoice(choice)}>{choice}</Button>)}</div></div>;
        case "inability": return <div key={index}><p>{block.text}</p><p className="text-muted">{block.next_action}</p></div>;
        case "external_claim": return <div key={index}><span className="hybrid-origin">External source</span><p>{block.text}</p><p className="text-muted">{block.period} · {block.qualifier}</p></div>;
        case "text": return <div key={index}>{block.origin === "discussion" && <span className="hybrid-origin">Basketball discussion · judgment</span>}<p>{block.text}</p>{block.criteria && block.criteria.length > 0 && <p className="text-muted">Criteria: {block.criteria.join(" · ")}</p>}</div>;
        default: return "text" in block ? <p key={index}>{block.text}</p> : null;
      }
    })}
    {answer.scope && <details className="hybrid-scope"><summary>{answer.scope.label}</summary>{answer.scope.assumptions?.map(text => <p key={text}>{text}</p>)}<p className="text-muted">Resolved on {answer.scope.as_of}. This turn keeps its original inputs.</p></details>}
    {(answer.sources?.length ?? 0) > 0 && <details><summary>Sources ({answer.sources!.length})</summary><ul className="hybrid-sources">{answer.sources!.map(source => {
      const href = safeAnswerUrl(source.url);
      return <li key={source.source_id}>{href ? <a href={href} target="_blank" rel="noopener noreferrer">{source.title}</a> : <strong>{source.title}</strong>}<p className="text-muted">{source.publisher} · {source.verification}{source.updated_on ? ` · updated ${source.updated_on}` : ""}{source.retrieved_at ? ` · retrieved ${source.retrieved_at}` : ""}{source.period ? ` · ${source.period}` : ""}</p><blockquote>{source.excerpt}</blockquote></li>;
    })}</ul></details>}
    <div className="conversation-prompts">{answer.actions?.filter(action => action.kind !== "retry").map((action, index) => {
      const href = safeAnswerUrl(action.url);
      return href ? href.startsWith("/") ? <Link className="button button-small" key={index} href={href}>{action.label}</Link> : <a className="button button-small" key={index} href={href} target="_blank" rel="noopener noreferrer">{action.label}</a> : null;
    })}{["failed", "unable", "cancelled"].includes(answer.status) && <Button disabled={busy} onClick={onRetry}>Retry question</Button>}</div>
    <details><summary>Evidence details</summary><pre>{JSON.stringify({ request_id: answer.request_id, turn_id: answer.turn_id, status: answer.status, scope: answer.scope, accounting: answer.accounting, sources: answer.sources }, null, 2)}</pre></details>
    {answer.saveable && <p className="text-muted">Chat history is retained separately. Rerun the pinned operation without AI to save analytical evidence.</p>}
    {evidenceSteps.map(result => <Link className="button button-small" key={result.step_id} href={researchDestination({step_id: result.step_id, operation: result.operation, arguments: result.arguments}, answer.scope!.selections)}>Review and save {result.operation.replaceAll("_", " ")}</Link>)}
  </div>;
}
