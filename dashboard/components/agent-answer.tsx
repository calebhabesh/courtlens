"use client";

import { Fragment, useId, useRef, useState, type ReactNode } from "react";
import { IntentLink } from "@/components/intent-link";
import type { AgentResultBlock, AgentSource, AgentTurnResponse } from "@/lib/assistant-v3.generated";
import { agentCellText, agentResultView, answerEntityNames, entityOfCell, flagAt, proseLinks, resultAnchor, resultScope, type ProseLink, resultColumnLabel, reviewDestination, safeAgentUrl, sourceDestination, sourceDetails, sourceLabel } from "@/lib/agent-answer";
import { parsePositionedMarkdown } from "@/lib/markdown";
import { scopeChipLabel } from "@/lib/assistant-chat";
import { pinnedContext } from "@/lib/conversation";
import { PlayerLink, TeamLink } from "@/components/entity-link";

function AnswerLink({ href, children, className }: { href: string; children: ReactNode; className?: string }) {
  return href.startsWith("/") ? <IntentLink className={className} href={href}>{children}</IntentLink> : <a className={className} href={href} {...(href.startsWith("https:") ? { target: "_blank", rel: "noopener noreferrer" } : {})}>{children}</a>;
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
const noLinks = new Map<number, ProseLink>();
function ProseEntityLink({ link, children }: { link: ProseLink; children: ReactNode }) {
  return link.entity.kind === "player"
    ? <PlayerLink id={link.entity.id} scope={link.scope} variant="prose">{children}</PlayerLink>
    : <TeamLink team={link.entity.id} scope={link.scope} variant="prose">{children}</TeamLink>;
}
function InlineProse({ text, positions, answer, literal = false, links = noLinks }: { text: string; positions: number[]; answer: AgentTurnResponse; literal?: boolean; links?: Map<number, ProseLink> }) {
  const characters = Array.from(text);
  const flagged = (answer.provenance?.unverified_sentences ?? []).filter(sentence => sentence.end > sentence.start);
  // Names linked inside one marking run; `proseLinks` only picks mentions that sit inside one.
  function linked(from: number, to: number) {
    const parts: ReactNode[] = [];
    let cursor = from;
    let i = from;
    while (i < to) {
      const link = links.get(positions[i]);
      if (!link || i + link.length > to) { i++; continue; }
      if (i > cursor) parts.push(characters.slice(cursor, i).join(""));
      parts.push(<ProseEntityLink key={i} link={link}>{characters.slice(i, i + link.length).join("")}</ProseEntityLink>);
      cursor = i += link.length;
    }
    if (cursor < to) parts.push(characters.slice(cursor, to).join(""));
    return parts;
  }
  function plain(start: number, end: number, linkable = true) {
    const parts: ReactNode[] = [];
    let from = start;
    while (from < end) {
      const flag = flagAt(flagged, positions[from]);
      let to = from + 1;
      while (to < end && flagAt(flagged, positions[to]) === flag) to++;
      const value = linkable ? linked(from, to) : [characters.slice(from, to).join("")];
      parts.push(flag ? <span key={from} className="agent-unverified" tabIndex={0} title={unverifiedReason}>{value}<span className="agent-unverified-label"> unverified</span><span className="sr-only">: {unverifiedReason}</span></span> : <Fragment key={from}>{value}</Fragment>);
      from = to;
    }
    return parts;
  }
  if (literal) return plain(0, characters.length, false);
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
    else if (match[3]) nodes.push(<code key={start}>{plain(start + 1, end - 1, false)}</code>);
    else nodes.push(...plain(start, end));
    cursor = end;
  }
  nodes.push(...plain(cursor, characters.length));
  return nodes;
}

/**
 * The answer's prose. It only ever receives a finished turn: while the answer streams,
 * `threaded-assistant.tsx` shows the live text as a plain paragraph and mounts `AgentAnswer` once
 * the response arrives, so names link only after streaming has finished (SL06).
 */
export function AgentProse({ answer }: { answer: AgentTurnResponse }) {
  const blocks = parsePositionedMarkdown(answer.answer.text).map(block => {
    if (block.kind !== "list") return { block, items: [{ text: block.text, positions: block.positions, literal: block.kind === "code" }] };
    let offset = 0;
    return { block, items: block.text.split("\n").map(item => {
      const length = Array.from(item).length;
      const positions = block.positions.slice(offset, offset + length); offset += length + 1;
      return { text: item, positions, literal: false };
    }) };
  });
  const flagged = (answer.provenance?.unverified_sentences ?? []).filter(sentence => sentence.end > sentence.start);
  const links = proseLinks(blocks.flatMap(({ items }) => items), answerEntityNames(answer.results ?? []), flagged);
  return <div className="agent-prose hybrid-narrative">{blocks.map(({ block, items }, i) => {
    const inline = <InlineProse text={block.text} positions={block.positions} answer={answer} literal={block.kind === "code"} links={links} />;
    if (block.kind === "code") return <pre key={i}><code>{inline}</code></pre>;
    if (block.kind === "heading") return <h3 key={i}>{inline}</h3>;
    if (block.kind === "list") return <ul key={i}>{items.map((item, n) => <li key={n}><InlineProse text={item.text} positions={item.positions} answer={answer} links={links} /></li>)}</ul>;
    return <p key={i}>{inline}</p>;
  })}</div>;
}

/** A result cell: the name links when its row carries the id (SL06), in the result's own scope. */
function ResultCell({ row, column, scope }: { row: Record<string, unknown>; column: string; scope: ReturnType<typeof resultScope> }) {
  const text = agentCellText(row[column]);
  const entity = entityOfCell(row, column);
  if (!entity) return text;
  return entity.kind === "player" ? <PlayerLink id={entity.id} scope={scope}>{text}</PlayerLink> : <TeamLink team={entity.id} scope={scope}>{text}</TeamLink>;
}

export function AgentResult({ block, answer }: { block: AgentResultBlock; answer: AgentTurnResponse }) {
  const [expanded, setExpanded] = useState(false);
  const result = block.result;
  const view = agentResultView(result);
  const href = safeAgentUrl(result.open_url);
  const review = answer.saveable ? reviewDestination(block) : null;
  const context = pinnedContext(block.context ?? {});
  const scope = resultScope(block);
  const name = `${result.operation.replaceAll("_", " ")} results`;
  return <section id={resultAnchor(answer.turn_id, result.operation_hash)} className="agent-result" aria-label={name} tabIndex={-1}>
    <div className="agent-result-heading"><h3>{name}</h3>{context.season && <span className="ask-scope-tag">{scopeChipLabel(context)}</span>}</div>
    {!view ? <p className="text-muted">No rows were returned.</p> : view.kind === "facts"
      ? <dl className="ask-facts">{view.entries.map(([key]) => <div key={key}><dt>{resultColumnLabel(key, result)}</dt><dd><ResultCell row={view.row} column={key} scope={scope} /></dd></div>)}</dl>
      : <><div className="ask-table" role="region" aria-label={`${name} table`} tabIndex={0}><table className="data-table"><caption>{expanded ? `All ${view.total} returned rows` : `${Math.min(10, view.total)} of ${view.total} returned rows`}</caption><thead><tr>{view.columns.map(key => <th scope="col" key={key}>{resultColumnLabel(key, result)}</th>)}</tr></thead><tbody>{(expanded ? view.rows : view.rows.slice(0, 10)).map((row, i) => <tr key={i}>{view.columns.map(key => <td key={key} title={agentCellText(row[key])}><ResultCell row={row} column={key} scope={scope} /></td>)}</tr>)}</tbody></table></div>{view.total > 10 && <button type="button" className="ask-chip" aria-expanded={expanded} onClick={() => setExpanded(value => !value)}>{expanded ? "Show fewer" : `Show all ${view.total} rows`}</button>}</>}
    {result.limitations?.map((text, i) => <p key={i} className="text-muted ask-limitation">{text}</p>)}
    <div className="ask-chips">{href && <AnswerLink className="ask-chip" href={href}>Open equivalent analysis</AnswerLink>}{review && <IntentLink className="ask-chip" href={review}>Review and save {result.operation.replaceAll("_", " ")}</IntentLink>}</div>
    <details className="ask-disclosure"><summary>Returned Fields and Exact Evidence</summary><pre>{JSON.stringify({ data: result.data, rows: result.rows, evidence: result.evidence, context: block.context }, null, 2)}</pre></details>
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
    {!!answer.follow_ups?.length && <div className="ask-chips" role="group" aria-label="Follow-up questions">{answer.follow_ups.map(choice => <button type="button" className="ask-chip" key={choice} disabled={busy} onClick={() => onChoice(choice)}>{choice}</button>)}</div>}
    <div className="ask-chips">{answer.actions?.filter(action => action.kind !== "retry" && action.kind !== "source" && !results.some(block => block.result.open_url === action.url)).map((action, i) => {
      const href = safeAgentUrl(action.url);
      return href ? <AnswerLink key={i} className="ask-chip" href={href}>{action.label}</AnswerLink> : null;
    })}{retryable && <button type="button" className="ask-chip" disabled={busy} onClick={onRetry}>Retry question</button>}</div>
    {!!sources.length && <details className="ask-disclosure agent-sources"><summary>Sources ({sources.length})</summary><ul className="hybrid-sources">{sources.map(source => <li key={source.source_id}><SourceChip source={source} answer={answer} /><p>{sourceDetails(source)}</p>{source.excerpt && <blockquote>{source.excerpt}</blockquote>}</li>)}</ul></details>}
    <details className="ask-disclosure ask-how"><summary>How I Got This</summary>
      <ol className="agent-trace">{answer.trace?.map((step, i) => <li key={i}><strong>{step.tool}</strong> · {step.status} · {step.elapsed_ms} ms{step.rows != null ? ` · ${step.rows} rows` : ""}{step.hits != null ? ` · ${step.hits} hits` : ""}<code>{JSON.stringify(step.arguments ?? {})}</code></li>)}</ol>
      <dl className="ask-facts">
        {[["Provider / model", `${accounting.provider} · ${accounting.model}`], ["Prompt version", accounting.prompt_version], ["Tokens (input / output)", `${accounting.input_tokens ?? 0} / ${accounting.output_tokens ?? 0}`], ["Estimated cost (USD)", accounting.est_cost_usd == null ? "Cost unknown" : `$${accounting.est_cost_usd.toFixed(6)} (estimate)`], ["Elapsed", `${accounting.elapsed_ms ?? 0} ms`], ["Steps / provider calls / searches", `${accounting.steps ?? 0} / ${accounting.provider_calls ?? 0} / ${accounting.web_searches ?? 0}`]].map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}
      </dl>
      {accounting.stopped_by_limit && <p>Stopped at the {accounting.stopped_by_limit} limit.</p>}
      {!!accounting.web_search_overshoot && <p>Reported searches exceeded the limit by {accounting.web_search_overshoot}.</p>}
      {!!accounting.token_overshoot && <p>Reported tokens exceeded the limit by {accounting.token_overshoot}.</p>}
      {answer.saveable && <p className="text-muted">Review and rerun a pinned operation to save analytical evidence. Web prose stays in chat history.</p>}
      <details><summary>Evidence Details</summary><pre>{JSON.stringify({ turn_id: answer.turn_id, accounting, provenance: answer.provenance, transcript: answer.transcript }, null, 2)}</pre></details>
    </details>
  </div>;
}
