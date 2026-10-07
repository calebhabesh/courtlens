"use client";

import Link from "next/link";
import type { HybridTurnResponse } from "@/lib/assistant-v2.generated";
import { cellText, compactResult, generalKnowledgeParts } from "@/lib/assistant-chat";
import { researchDestination, type Result } from "@/lib/conversation";
import { ConversationResult } from "./conversation-result";
import { Button } from "./ui/controls";

export function safeAnswerUrl(value?: string | null): string | null {
  if (!value || /[\\\u0000- ]/.test(value)) return null;
  if (value.startsWith("/") && !value.startsWith("//")) return value;
  try { const url = new URL(value); return url.protocol === "https:" && !url.username && !url.password ? value : null; } catch { return null; }
}

type ResultBlock = Extract<HybridTurnResponse["blocks"][number], { kind?: "result" }>;
const asResult = (block: ResultBlock): Result => ({ ...block.result, limitations: block.result.limitations ?? [], open_url: block.result.open_url ?? null, eligible_count: block.result.eligible_count ?? null, evidence: block.result.evidence.map(cell => ({ ...cell, sample: cell.sample ?? {}, null_reason: cell.null_reason ?? null })) });

function CompactResult({ result }: { result: Result }) {
  const view = compactResult(result.operation, result.rows);
  const name = `${result.operation.replaceAll("_", " ")} results`;
  if (!view) return <p className="text-muted">No rows were returned for this {result.operation.replaceAll("_", " ")}.</p>;
  if (view.kind === "facts") return <div role="region" aria-label={name}><dl className="ask-facts">{view.entries.map(([key, value]) => <div key={key}><dt>{key}</dt><dd title={cellText(value)}>{cellText(value)}</dd></div>)}</dl></div>;
  return <div className="ask-table" role="region" aria-label={name} tabIndex={0}><table className="data-table"><caption>{view.total > view.rows.length ? `Top ${view.rows.length} of ${view.total} rows. All rows are in "How I got this".` : `${view.total} rows`}</caption><thead><tr>{view.columns.map(key => <th scope="col" key={key}>{key}</th>)}</tr></thead><tbody>{view.rows.map((row, index) => <tr key={index}>{view.columns.map(key => <td key={key} title={cellText(row[key])}>{row[key] === undefined ? "—" : cellText(row[key])}</td>)}</tr>)}</tbody></table></div>;
}

export function HybridAnswer({ answer, onChoice, onRetry, busy }: {
  answer: HybridTurnResponse; onChoice: (choice: string) => void; onRetry: () => void; busy: boolean;
}) {
  const results = answer.blocks.flatMap(block => block.kind === "result" ? [asResult(block as ResultBlock)] : []);
  const evidenceSteps = answer.saveable && answer.scope ? results.filter(result => ["query", "profile", "compare", "team", "forecast", "finance", "definition", "compare_periods", "distribution", "splits", "similarity", "workload_shifts"].includes(result.operation)) : [];
  const actions = answer.actions?.filter(action => action.kind !== "retry").flatMap(action => { const href = safeAnswerUrl(action.url); return href ? [{ ...action, href }] : []; }) ?? [];
  const retryable = ["failed", "unable", "cancelled"].includes(answer.status);
  return <div className="hybrid-answer">
    {answer.blocks.map((block, index) => {
      switch (block.kind) {
        case "result": {
          const result = asResult(block as ResultBlock);
          // Approximations and filters are part of the answer, so they sit beside it.
          return <div key={index}><CompactResult result={result} />{result.limitations.map(text => <p key={text} className="text-muted ask-limitation">{text}</p>)}</div>;
        }
        case "clarification": return <div key={index}><p>{block.text}</p><div className="ask-chips">{block.choices?.map(choice => <Button key={choice} className="ask-chip" disabled={busy} onClick={() => onChoice(choice)}>{choice}</Button>)}</div></div>;
        case "inability": return <div key={index}><p>{block.text}</p><p className="text-muted">{block.next_action}</p></div>;
        case "external_claim": return <div key={index}><span className="hybrid-origin">External source</span><p>{block.text}</p><p className="text-muted">{block.period} · {block.qualifier}</p></div>;
        case "narrative": return <p key={index} className="hybrid-narrative">{block.text}</p>;
        case "text": {
          const general = block.origin === "general_knowledge" ? generalKnowledgeParts(block.text) : null;
          return <div key={index}>{block.origin === "discussion" && <span className="hybrid-origin">Basketball discussion · judgment</span>}{general ? <p><span className="ask-origin-label">{general.label}</span>{"\n"}{general.body}</p> : <p>{block.text}</p>}{block.criteria && block.criteria.length > 0 && <p className="text-muted">Criteria: {block.criteria.join(" · ")}</p>}</div>;
        }
        default: return "text" in block ? <p key={index}>{block.text}</p> : null;
      }
    })}
    {(actions.length > 0 || evidenceSteps.length > 0 || retryable || answer.scope) && <div className="ask-chips">
      {answer.scope && <span className="ask-scope-tag" title={`Resolved on ${answer.scope.as_of}`}>{answer.scope.label}</span>}
      {actions.map((action, index) => action.href.startsWith("/") ? <Link className="ask-chip" key={index} href={action.href}>{action.label}</Link> : <a className="ask-chip" key={index} href={action.href} target="_blank" rel="noopener noreferrer">{action.label}</a>)}
      {evidenceSteps.map(result => <Link className="ask-chip" key={result.step_id} href={researchDestination({step_id: result.step_id, operation: result.operation, arguments: result.arguments}, answer.scope!.selections)}>Review and save {result.operation.replaceAll("_", " ")}</Link>)}
      {retryable && <Button className="ask-chip" disabled={busy} onClick={onRetry}>Retry question</Button>}
    </div>}
    {(answer.sources?.length ?? 0) > 0 && <details className="ask-disclosure"><summary>Sources ({answer.sources!.length})</summary><ul className="hybrid-sources">{answer.sources!.map(source => {
      const href = safeAnswerUrl(source.url);
      return <li key={source.source_id}>{href ? <a href={href} target="_blank" rel="noopener noreferrer">{source.title}</a> : <strong>{source.title}</strong>}<p className="text-muted">{source.publisher} · {source.verification}{source.updated_on ? ` · updated ${source.updated_on}` : ""}{source.retrieved_at ? ` · retrieved ${source.retrieved_at}` : ""}{source.period ? ` · ${source.period}` : ""}</p><blockquote>{source.excerpt}</blockquote></li>;
    })}</ul></details>}
    <details className="ask-disclosure ask-how"><summary>How I got this</summary>
      {answer.scope && <><p>Scope: {answer.scope.label}. Resolved on {answer.scope.as_of}. This turn keeps its original inputs.</p>{answer.scope.assumptions?.map(text => <p key={text}>{text}</p>)}</>}
      {results.map(result => <ConversationResult key={result.step_id} result={result} />)}
      {answer.saveable && <p className="text-muted">Chat history is retained separately. Rerun the pinned operation without AI to save analytical evidence.</p>}
      <details><summary>Evidence details</summary><pre>{JSON.stringify({ request_id: answer.request_id, turn_id: answer.turn_id, status: answer.status, scope: answer.scope, accounting: answer.accounting, sources: answer.sources }, null, 2)}</pre></details>
    </details>
  </div>;
}
