"use client";

import { useId, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import type { AgentResultBlock, AgentSource, AgentTurnResponse } from "@/lib/assistant-v3.generated";
import { agentCellText, agentResultView, resultAnchor, resultColumnLabel, reviewDestination, safeAgentUrl, sourceDestination, sourceDetails, sourceLabel } from "@/lib/agent-answer";
import { parsePositionedMarkdown } from "@/lib/markdown";
import { scopeChipLabel } from "@/lib/assistant-chat";
import { pinnedContext } from "@/lib/conversation";
import { Button } from "./ui/controls";

function AnswerLink({ href, children, className }: { href: string; children: ReactNode; className?: string }) {
  return href.startsWith("/") ? <Link className={className} href={href}>{children}</Link> : <a className={className} href={href} {...(href.startsWith("https:") ? { target: "_blank", rel: "noopener noreferrer" } : {})}>{children}</a>;
}

export function SourceChip({ source, answer }: { source: AgentSource; answer: AgentTurnResponse }) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const button = useRef<HTMLButtonElement>(null);
  const href = sourceDestination(source, answer.results ?? [], answer.turn_id);
  const label = sourceLabel(source);
  return <span className="agent-source-wrap" data-open={open} onKeyDown={event => { if (event.key === "Escape" && open) { setOpen(false); button.current?.focus(); event.stopPropagation(); } }}>
    <button ref={button} type="button" className="agent-source-chip" aria-expanded={open} aria-controls={id} title={sourceDetails(source)} onClick={() => setOpen(value => !value)}>{label}</button>
    <span className="agent-source-tooltip" id={id}>{sourceDetails(source)}{open && href && <AnswerLink href={href}>{source.origin === "warehouse" ? "View CourtLens result" : "Open source"}</AnswerLink>}</span>
  </span>;
}

const unverifiedReason = "Unverified: these numbers have no supporting result or cited source in this turn.";
function InlineProse({ text, positions, answer, literal = false }: { text: string; positions: number[]; answer: AgentTurnResponse; literal?: boolean }) {
  const characters = Array.from(text);
  const flagged = (answer.provenance?.unverified_sentences ?? []).filter(sentence => sentence.end > sentence.start);
  function plain(start: number, end: number) {
    const parts: ReactNode[] = [];
    let from = start;
    while (from < end) {
      const flag = flagged.find(sentence => sentence.start <= positions[from] && positions[from] < sentence.end);
      let to = from + 1;
      while (to < end && flagged.find(sentence => sentence.start <= positions[to] && positions[to] < sentence.end) === flag) to++;
      const value = characters.slice(from, to).join("");
      parts.push(flag ? <span key={from} className="agent-unverified" tabIndex={0} title={unverifiedReason}>{value}<span className="agent-unverified-label"> unverified</span><span className="sr-only">: {unverifiedReason}</span></span> : value);
      from = to;
    }
    return parts;
  }
  if (literal) return plain(0, characters.length);
  // No raw HTML, images, arbitrary links or executable markup. Citation IDs bind to sources.
  const pattern = /\[\^([A-Za-z0-9_-]+)\]|\*\*([^*]+)\*\*|`([^`]+)`/gu;
  const nodes: ReactNode[] = [];
  let cursor = 0;
  for (const match of text.matchAll(pattern)) {
    const start = Array.from(text.slice(0, match.index)).length;
    const end = start + Array.from(match[0]).length;
    nodes.push(...plain(cursor, start));
    const source = match[1] ? answer.sources?.find(source => source.source_id === match[1]) : null;
    if (source) nodes.push(<SourceChip key={start} source={source} answer={answer} />);
    else if (match[2]) nodes.push(<strong key={start}>{plain(start + 2, end - 2)}</strong>);
    else if (match[3]) nodes.push(<code key={start}>{plain(start + 1, end - 1)}</code>);
    else nodes.push(...plain(start, end));
    cursor = end;
  }
  nodes.push(...plain(cursor, characters.length));
  return nodes;
}

export function AgentProse({ answer }: { answer: AgentTurnResponse }) {
  return <div className="agent-prose hybrid-narrative">{parsePositionedMarkdown(answer.answer.text).map((block, i) => {
    const inline = <InlineProse text={block.text} positions={block.positions} answer={answer} literal={block.kind === "code"} />;
    if (block.kind === "code") return <pre key={i}><code>{inline}</code></pre>;
    if (block.kind === "heading") return <h3 key={i}>{inline}</h3>;
    if (block.kind === "list") {
      let offset = 0;
      return <ul key={i}>{block.text.split("\n").map((item, n) => {
        const length = Array.from(item).length;
        const positions = block.positions.slice(offset, offset + length); offset += length + 1;
        return <li key={n}><InlineProse text={item} positions={positions} answer={answer} /></li>;
      })}</ul>;
    }
    return <p key={i}>{inline}</p>;
  })}</div>;
}

export function AgentResult({ block, answer }: { block: AgentResultBlock; answer: AgentTurnResponse }) {
  const [expanded, setExpanded] = useState(false);
  const result = block.result;
  const view = agentResultView(result);
  const href = safeAgentUrl(result.open_url);
  const review = answer.saveable ? reviewDestination(block) : null;
  const context = pinnedContext(block.context ?? {});
  const name = `${result.operation.replaceAll("_", " ")} results`;
  return <section id={resultAnchor(answer.turn_id, result.operation_hash)} className="agent-result" aria-label={name} tabIndex={-1}>
    <div className="agent-result-heading"><h3>{name}</h3>{context.season && <span className="ask-scope-tag">{scopeChipLabel(context)}</span>}</div>
    {!view ? <p className="text-muted">No rows were returned.</p> : view.kind === "facts"
      ? <dl className="ask-facts">{view.entries.map(([key, value]) => <div key={key}><dt>{resultColumnLabel(key, result)}</dt><dd>{agentCellText(value)}</dd></div>)}</dl>
      : <><div className="ask-table" role="region" aria-label={`${name} table`} tabIndex={0}><table className="data-table"><caption>{expanded ? `All ${view.total} returned rows` : `${Math.min(10, view.total)} of ${view.total} returned rows`}</caption><thead><tr>{view.columns.map(key => <th scope="col" key={key}>{resultColumnLabel(key, result)}</th>)}</tr></thead><tbody>{(expanded ? view.rows : view.rows.slice(0, 10)).map((row, i) => <tr key={i}>{view.columns.map(key => <td key={key} title={agentCellText(row[key])}>{agentCellText(row[key])}</td>)}</tr>)}</tbody></table></div>{view.total > 10 && <Button className="ask-chip" aria-expanded={expanded} onClick={() => setExpanded(value => !value)}>{expanded ? "Show fewer" : `Show all ${view.total} rows`}</Button>}</>}
    {result.limitations?.map((text, i) => <p key={i} className="text-muted ask-limitation">{text}</p>)}
    <div className="ask-chips">{href && <AnswerLink className="ask-chip" href={href}>Open equivalent analysis</AnswerLink>}{review && <Link className="ask-chip" href={review}>Review and save {result.operation.replaceAll("_", " ")}</Link>}</div>
    <details className="ask-disclosure"><summary>Returned fields and exact evidence</summary><pre>{JSON.stringify({ data: result.data, rows: result.rows, evidence: result.evidence, context: block.context }, null, 2)}</pre></details>
  </section>;
}

export function AgentAnswer({ answer, busy, onChoice, onRetry }: { answer: AgentTurnResponse; busy: boolean; onChoice: (choice: string) => void; onRetry: () => void }) {
  const accounting = answer.accounting;
  const retryable = answer.status === "failed" || answer.status === "cancelled" || !!answer.failure;
  const results = answer.results ?? [];
  const sources = answer.sources ?? [];
  return <div className="hybrid-answer agent-answer">
    <AgentProse answer={answer} />
    {answer.assumption && <p className={`agent-assumption text-muted ${answer.provenance?.assumption_unverified ? "agent-unverified" : ""}`} title={answer.provenance?.assumption_unverified ? unverifiedReason : undefined}><strong>Assumption:</strong> <InlineProse text={answer.assumption} positions={[]} answer={{ ...answer, provenance: {} }} />{answer.provenance?.assumption_unverified && <span className="agent-unverified-label"> unverified</span>}</p>}
    {answer.mode === "limited" && <p className="agent-limited">Limited mode: add a provider key in <code>.env</code> for full answers.</p>}
    {answer.failure && <p className="agent-failure">Provider status: {answer.failure.replaceAll("_", " ")}.</p>}
    {answer.retry_after != null && <p className="text-muted">Retry after {answer.retry_after} seconds.</p>}
    {!!answer.provenance?.unsupported_numbers?.length && !answer.provenance?.unverified_sentences?.length && <p className="agent-unverified">This answer contains unverified numbers.</p>}
    {!!answer.provenance?.warehouse_override_missed && <p className="agent-unverified">A web claim overlaps CourtLens coverage. Check the warehouse result before relying on it.</p>}
    {results.map((block, i) => <AgentResult key={`${block.result.operation_hash}-${i}`} block={block} answer={answer} />)}
    {!!answer.follow_ups?.length && <div className="ask-chips" role="group" aria-label="Follow-up questions">{answer.follow_ups.map(choice => <Button className="ask-chip" key={choice} disabled={busy} onClick={() => onChoice(choice)}>{choice}</Button>)}</div>}
    <div className="ask-chips">{answer.actions?.filter(action => action.kind !== "retry" && action.kind !== "source" && !results.some(block => block.result.open_url === action.url)).map((action, i) => {
      const href = safeAgentUrl(action.url);
      return href ? <AnswerLink key={i} className="ask-chip" href={href}>{action.label}</AnswerLink> : null;
    })}{retryable && <Button className="ask-chip" disabled={busy} onClick={onRetry}>Retry question</Button>}</div>
    {!!sources.length && <details className="ask-disclosure agent-sources"><summary>Sources ({sources.length})</summary><ul className="hybrid-sources">{sources.map(source => <li key={source.source_id}><SourceChip source={source} answer={answer} /><p>{sourceDetails(source)}</p>{source.excerpt && <blockquote>{source.excerpt}</blockquote>}</li>)}</ul></details>}
    <details className="ask-disclosure ask-how"><summary>How I got this</summary>
      <ol className="agent-trace">{answer.trace?.map((step, i) => <li key={i}><strong>{step.tool}</strong> · {step.status} · {step.elapsed_ms} ms{step.rows != null ? ` · ${step.rows} rows` : ""}{step.hits != null ? ` · ${step.hits} hits` : ""}<code>{JSON.stringify(step.arguments ?? {})}</code></li>)}</ol>
      <dl className="ask-facts">
        {[["Provider / model", `${accounting.provider} · ${accounting.model}`], ["Prompt version", accounting.prompt_version], ["Tokens (input / output)", `${accounting.input_tokens ?? 0} / ${accounting.output_tokens ?? 0}`], ["Estimated cost (USD)", accounting.est_cost_usd == null ? "Cost unknown" : `$${accounting.est_cost_usd.toFixed(6)} (estimate)`], ["Elapsed", `${accounting.elapsed_ms ?? 0} ms`], ["Steps / provider calls / searches", `${accounting.steps ?? 0} / ${accounting.provider_calls ?? 0} / ${accounting.web_searches ?? 0}`]].map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}
      </dl>
      {accounting.stopped_by_limit && <p>Stopped at the {accounting.stopped_by_limit} limit.</p>}
      {!!accounting.web_search_overshoot && <p>Reported searches exceeded the limit by {accounting.web_search_overshoot}.</p>}
      {!!accounting.token_overshoot && <p>Reported tokens exceeded the limit by {accounting.token_overshoot}.</p>}
      {answer.saveable && <p className="text-muted">Review and rerun a pinned operation to save analytical evidence. Web prose stays in chat history.</p>}
      <details><summary>Evidence details</summary><pre>{JSON.stringify({ turn_id: answer.turn_id, accounting, provenance: answer.provenance, transcript: answer.transcript }, null, 2)}</pre></details>
    </details>
  </div>;
}
