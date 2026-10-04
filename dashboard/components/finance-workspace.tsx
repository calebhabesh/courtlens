"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { AMOUNT_KINDS, FINANCE_STATUSES, STATUS_LABELS, dollarsToCents, filterFinanceContracts, financeSizeGroups, financeFetch, financeParams, formatCents, readFinanceParams, type FinanceBook, type FinanceBookDetail, type FinanceContract, type FinanceQuery, type FinanceResult } from "@/lib/finance";
import { FINANCE_TEAMS } from "@/lib/finance-teams";
import { buildPreservedContextUrl } from "@/lib/query-url";
import { FinanceContractDrawer, FinanceObservations } from "./finance-contract-drawer";
import { FinanceImport } from "./finance-import";

const teamLabel = (id: string | null) => FINANCE_TEAMS.find(t => t.id === id)?.tricode ?? id ?? "Unknown association";

export function FinanceWorkspace({ mode, team }: { mode: "contracts" | "free-agency"; team?: string }) {
  const searchParams = useSearchParams(); const [initialParams] = useState(() => new URLSearchParams(searchParams));
  const resolvedTeam = FINANCE_TEAMS.find(t => t.id === team || t.tricode === team?.toUpperCase())?.id ?? team;
  const [query,setQuery] = useState(() => readFinanceParams(initialParams,resolvedTeam));
  const [books,setBooks] = useState<FinanceBook[]>([]); const [book,setBook] = useState<FinanceBookDetail | null>(null);
  const [result,setResult] = useState<FinanceResult | null>(null); const [error,setError] = useState("");
  const [catalogError,setCatalogError] = useState(""); const [loading,setLoading] = useState(false);
  const [threshold,setThreshold] = useState(() => String(query.small_big_threshold_cents / 100));
  const [search,setSearch] = useState(initialParams.get("finance_search") ?? ""); const [type,setType] = useState(initialParams.get("finance_type") ?? "all");
  const [size,setSize] = useState(initialParams.get("finance_size") ?? "all"); const [sort,setSort] = useState(initialParams.get("finance_sort") ?? "name");
  const [selected,setSelected] = useState<FinanceContract | null>(null); const request = useRef<AbortController | null>(null);
  const detailRequest = useRef<AbortController | null>(null);
  function update(next: Partial<FinanceQuery>) { request.current?.abort(); setLoading(false); setQuery(prev => ({...prev,...next})); setResult(null);setSelected(null);setError(""); }
  async function loadBooks() { try {setBooks(await financeFetch<FinanceBook[]>("/books",AbortSignal.timeout(8000)));setCatalogError("");} catch(err){setCatalogError((err as Error).message);} }
  useEffect(() => {const abort=new AbortController();financeFetch<FinanceBook[]>("/books",abort.signal).then(setBooks).catch(err => {if(!abort.signal.aborted)setCatalogError(err.message);});return () => {abort.abort();request.current?.abort();detailRequest.current?.abort();};},[]);
  useEffect(() => {if (!query.book_id) return; const abort=new AbortController();detailRequest.current=abort;
    financeFetch<FinanceBookDetail>(`/books/${encodeURIComponent(query.book_id)}`,abort.signal).then(data => {setBook(data);setCatalogError("");}).catch(err => {if(!abort.signal.aborted)setCatalogError(err.message);});return () => abort.abort();},[query.book_id]);
  async function load(current: FinanceQuery) {
    request.current?.abort();const abort=new AbortController();request.current=abort;setLoading(true);setResult(null);setError("");setSelected(null);
    try { const data=await financeFetch<FinanceResult>("",AbortSignal.any([abort.signal,AbortSignal.timeout(10000)]),current);if(!abort.signal.aborted) {setResult(data); const params=financeParams(data.context,new URLSearchParams(window.location.search));window.history.replaceState(null,"",`${window.location.pathname}?${params}`);} }
    catch(err) {if(!abort.signal.aborted)setError((err as Error).message);}finally{if(!abort.signal.aborted)setLoading(false);}
  }
  useEffect(() => {
    const initial=readFinanceParams(initialParams,resolvedTeam);
    if (!initial.book_id || !initial.known_at || !initial.effective_on) return;
    const abort=new AbortController(); request.current=abort;
    financeFetch<FinanceResult>("",AbortSignal.any([abort.signal,AbortSignal.timeout(10000)]),initial)
      .then(data => {if(!abort.signal.aborted)setResult(data);})
      .catch(err => {if(!abort.signal.aborted)setError(err.message);});
    return () => abort.abort();
  },[initialParams,resolvedTeam]);
  const labels = book?.book_id === result?.context.book_id ? book?.player_labels ?? {} : {};
  const rows=result ? filterFinanceContracts(result.contracts,labels,search,type,size,sort) : [];
  const params=financeParams(result?.context ?? query,new URLSearchParams(searchParams));
  for(const [key,value] of Object.entries({search,type,size,sort})) params.set(`finance_${key}`,value);
  function viewUpdate(key: string, value: string) { const next=new URLSearchParams(window.location.search);next.set(`finance_${key}`,value);window.history.replaceState(null,"",`${window.location.pathname}?${next}`); }
  return <div className="finance-workspace"><div className="finance-heading"><div><h1>{mode === "contracts" ? "Contracts & known payroll" : "Free agency · source-book tracker"}</h1><p>Historical source observations · separate financial context</p></div><nav aria-label="Finance views"><Link href={`/contracts?${params}`}>Contracts</Link><Link href={`/free-agency?${params}`}>Free agency</Link></nav></div>
    <p className="notice">This bounded import is not complete team payroll or present free-agent coverage. Signing status and financial terms have independent evidence. Unknown money stays unknown.</p>
    <form className="panel finance-controls" onSubmit={e => {e.preventDefault();try {const next={...query,small_big_threshold_cents:dollarsToCents(threshold)};setQuery(next);void load(next);}catch(err){setResult(null);setError((err as Error).message);} }}>
      <label>Immutable finance book<select value={books.some(b => b.book_id === query.book_id) ? query.book_id : ""} onChange={e => {setBook(null);update({book_id:e.target.value});}}><option value="">Choose a retained book</option>{books.map(b => <option key={b.book_id} value={b.book_id}>{b.parent_book_id ? "Correction" : "Original"} · {b.created_at.slice(0,19)} · {b.book_id}</option>)}</select></label>
      <label>Explicit book UUID<input required value={query.book_id} onChange={e => {setBook(null);update({book_id:e.target.value});}} /></label>
      <label>Financial season<input required aria-label="Financial season" pattern="20[0-9]{2}-[0-9]{2}" list="finance-seasons" value={query.financial_season} onChange={e => update({financial_season:e.target.value})} /><datalist id="finance-seasons">{book?.financial_seasons.map(s => <option key={s}>{s}</option>)}</datalist></label>
      <label>Known at (UTC / explicit offset)<input required placeholder="2026-10-03T00:00:00Z" value={query.known_at} onChange={e => update({known_at:e.target.value})} /></label>
      <label>Effective on (inclusive)<input required type="date" value={query.effective_on} onChange={e => update({effective_on:e.target.value})} /></label>
      <label>Explicit contract team<select value={query.team_id ?? ""} onChange={e => update({team_id:e.target.value || null})}><option value="">All / unresolved</option>{FINANCE_TEAMS.map(t => <option key={t.id} value={t.id}>{t.tricode} · {t.name}</option>)}</select></label>
      <label>Seasonal amount kind<select value={query.amount_kind} onChange={e => update({amount_kind:e.target.value as FinanceQuery["amount_kind"]})}>{AMOUNT_KINDS.map(k => <option key={k} value={k}>{k.replaceAll("_"," ")}</option>)}</select></label>
      <label>Unknown effective dates<select value={query.unknown_dates} onChange={e => update({unknown_dates:e.target.value as FinanceQuery["unknown_dates"]})}><option value="include_labelled">Include labelled reports; exclude from sums</option><option value="exclude">Exclude from calculations</option></select></label>
      <label>Option scenario<select aria-label="Option scenario" value={query.scenario} onChange={e => update({scenario:e.target.value as FinanceQuery["scenario"]})}><option value="reported-v1">Reported amounts only</option><option value="include-unexercised-options-v1">Hypothetical: exercise conditional options</option></select></label>
      <label>Small vs Big threshold (USD)<input required inputMode="decimal" value={threshold} onChange={e => {setThreshold(e.target.value);setSelected(null);setResult(null);request.current?.abort();setLoading(false);}} /></label>
      <label>Status scope<select value={query.statuses[0] ?? "all"} onChange={e => update({statuses:e.target.value === "all" ? [] : [e.target.value as FinanceQuery["statuses"][number]]})}><option value="all">All book statuses</option>{FINANCE_STATUSES.map(s => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}</select></label>
      <button className="button" disabled={loading}>Run financial query</button><button className="button" type="button" disabled={loading || !result} onClick={() => void load(result!.context)}>Refresh selected book read</button>
    </form>
    {catalogError && <p role="alert">Book discovery unavailable: {catalogError} <button className="button" onClick={loadBooks}>Reload books</button></p>}
    {book && <p className="finance-provenance">Book scope: {book.coverage_note}<br />Latest selected observation: {book.latest_observed_at} · historical reports; daily source freshness unverified.<br />{book.parent_book_id ? `Correction parent: ${book.parent_book_id}` : "Original book"}. SHA-256: {book.book_sha256}<br />{book.label_scope}</p>}
    {loading && <p role="status">Loading financial observations…</p>}{error && <p role="alert">Finance unavailable: {error} <button className="button" onClick={() => {try {void load({...query,small_big_threshold_cents:dollarsToCents(threshold)});}catch(err){setError((err as Error).message);}}}>Retry query</button></p>}
    {result && <section aria-label="Financial query result" className="panel finance-result"><h2>{teamLabel(result.context.team_id)} · financial {result.context.financial_season}</h2><p>{result.coverage_note}</p>
      <p>Known at {result.context.known_at} · effective through {result.context.effective_on}. {result.historical_reconstruction ? "Historical reconstruction: acquired after the effective date." : "Dated source reports."}</p>
      <div className="finance-summary" role="group" aria-label="Reported amount coverage"><div><span>Known {result.context.amount_kind.replaceAll("_"," ")} subtotal</span><strong>{formatCents(result.subtotal.known_subtotal_cents)}</strong></div><div><span>Known / represented contracts</span><strong>{result.subtotal.known_contracts} / {result.subtotal.expected_book_contracts}</strong></div><div><span>Unknown amount contracts</span><strong>{result.subtotal.unknown_contracts}</strong></div><div><span>External roster denominator</span><strong>Unknown</strong></div></div>
      <p>Incomplete book coverage · cap / tax / apron status pending. Official thresholds and legal room are unavailable. Modeled value, surplus and ROI: unavailable (source-blocked).</p>
      {result.context.scenario !== "reported-v1" && <aside className="notice" aria-label="Hypothetical option scenario"><strong>Hypothetical exercise scenario</strong><p>Separate scenario subtotal: {formatCents(result.subtotal.scenario_subtotal_cents)} · {result.subtotal.scenario_contracts} contracts. Reported subtotal above stays unchanged. Unknown salaries remain unknown.</p></aside>}
      <section aria-label="Small vs Big summary"><h3>Small vs Big · reported {result.context.amount_kind.replaceAll("_"," ")}</h3><p>Small below {formatCents(String(result.context.small_big_threshold_cents))}; Big at or above. Conditional or missing amounts stay Unknown. This split is a grouping choice.</p><div className="finance-summary">{financeSizeGroups(result.contracts).map(g => <div key={g.group}><span>{g.group} · {g.contracts} contracts</span><strong>{formatCents(g.known_cents)}</strong><span>{g.known_contracts} known; modeled value / surplus / ROI unavailable</span></div>)}</div></section>
      <div className="finance-statuses" aria-label="Book status counts">{FINANCE_STATUSES.map(s => <span key={s}>{STATUS_LABELS[s]}: {result.status_groups_filtered[s]} / {result.status_groups_unfiltered[s]}</span>)}</div><p>Status counts: filtered / before status filter; per contract, not current free-agent players. {result.filtered_contract_count} filtered / {result.unfiltered_contract_count} before status filter.</p>
      <div className="finance-controls"><label>Search player, team, or source note<input value={search} onChange={e => {setSearch(e.target.value);viewUpdate("search",e.target.value);}} /></label><label>Observed term family<select value={type} onChange={e => {setType(e.target.value);viewUpdate("type",e.target.value);}}>{["all","contract","amount","option","guarantee","status","association"].map(t => <option key={t}>{t}</option>)}</select></label><label>Small vs Big group<select value={size} onChange={e => {setSize(e.target.value);viewUpdate("size",e.target.value);}}>{["all","small","big","unknown"].map(t => <option key={t}>{t}</option>)}</select></label><label>Sort contracts<select value={sort} onChange={e => {setSort(e.target.value);viewUpdate("sort",e.target.value);}}><option value="name">Player name</option><option value="amount">Known amount descending</option><option value="status">Status</option></select></label></div>
      <p>{rows.length} visible of {result.filtered_contract_count} returned contracts. Text/type/size filters change visible rows only; totals above retain the query denominator. UFA/RFA, market movement and dated positions are unknown in this schema.</p>
      <div className="table-wrapper" role="region" aria-label="Contracts and status table" tabIndex={0}><table className="data-table"><thead><tr><th>Player / contract</th><th>Team / status</th><th>Known selected amount</th><th>Small vs Big</th><th>Derived AAV</th><th>Terms / sources</th></tr></thead><tbody>{rows.map(c => <tr key={`${c.player_id}:${c.contract_id}`}><th><button className="finance-detail-button" onClick={() => setSelected(c)}>{labels[c.player_id] ?? `NBA ${c.player_id}`}</button><br />{c.contract_id}<br /><Link href={buildPreservedContextUrl(`/players/${c.player_id}`,params)}>Player Stats</Link></th><td>{c.team_id ? <Link href={`/contracts/${teamLabel(c.team_id)}?${params}`}>{teamLabel(c.team_id)}</Link> : teamLabel(null)}<br />{c.team_status}<br />{STATUS_LABELS[c.status]}</td><td>{formatCents(c.known_amount_cents)}<br />{c.amount_status}{result.context.scenario !== "reported-v1" && <p>Scenario: {formatCents(c.scenario_amount_cents)}</p>}</td><td>{c.size_group}</td><td>{c.derived_aav_usd === null ? "Unknown" : `USD ${c.derived_aav_usd}`}<br />Reported total / years; not salary</td><td>{c.observations.map(o => <div key={o.observation_id}><a href={o.source.url} target="_blank" rel="noreferrer">{o.terms.original_label}</a><br />{o.terms.observed_at}</div>)}</td></tr>)}</tbody></table></div>
      {!rows.length && <p>No represented contracts match this scope. This does not establish unsigned status, zero payroll or absence from a roster.</p>}
      <details><summary>Allocation, multi-year timeline and evidence</summary><h3>Known position allocation</h3><p>Dated positions unavailable; known cents remain unclassified.</p><dl>{Object.entries(result.subtotal.position_allocations_cents).map(([position,cents]) => <div key={position}><dt>{position}</dt><dd>{formatCents(cents)}</dd></div>)}</dl><h3>Multi-year source timeline</h3><FinanceObservations rows={result.timeline} /><p>Result SHA-256: {result.result_sha256}<br />Analytical content SHA-256: {result.analytical_content_sha256}</p><pre>{JSON.stringify(result.excluded_observations,null,2)}</pre>{result.limitations.map((l,i) => <p key={i}>{l}</p>)}</details>
    </section>}
    <FinanceImport onBooksChanged={loadBooks} />
    {selected && result && <FinanceContractDrawer key={`${selected.player_id}:${selected.contract_id}`} contract={selected} result={result} name={labels[selected.player_id] ?? selected.player_id} onClose={() => setSelected(null)} params={params} />}
  </div>;
}
