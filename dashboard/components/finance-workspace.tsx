"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { AMOUNT_KINDS, FINANCE_STATUSES, STATUS_LABELS, dollarsToCents, filterFinanceContracts, financeSizeGroups, financeFetch, financeParams, formatCents, readFinanceParams, type FinanceBook, type FinanceBookDetail, type FinanceContract, type FinanceQuery, type FinanceResult } from "@/lib/finance";
import { FINANCE_TEAMS } from "@/lib/finance-teams";
import { buildPreservedContextUrl } from "@/lib/query-url";
import { formatDate, parseIsoDate } from "@/lib/format-date";
import { FinanceContractDrawer, FinanceObservations } from "./finance-contract-drawer";
import { FinanceImport } from "./finance-import";
import { PageShell, ProfileLayout } from "./ui/page-shell";
import { PageHeader } from "./ui/panel";
import { FilterBar, CountChip } from "./ui/filter-bar";
import { Field } from "./ui/field";
import { Input } from "./ui/input";
import { Select } from "./ui/select";
import { DatePicker } from "./ui/date-picker";
import { DataDetailsButton } from "./ui/data-details";
import { GatedNote } from "./ui/gated-note";
import { TeamIdentity } from "./ui/identity";
import { TeamLogo } from "./team-logo";
import { Skeleton } from "./ui/skeleton";

const teamLabel = (id: string | null) => FINANCE_TEAMS.find(t => t.id === id)?.tricode ?? "Unknown association";
const knownDate = (value: string) => Number.isFinite(Date.parse(value)) ? new Date(value).toISOString().slice(0,10) : "";
const knownTime = (value: string) => Number.isFinite(Date.parse(value)) ? new Date(value).toISOString().slice(11,19) : "00:00:00";

export function FinanceWorkspace({ mode, team }: { mode: "contracts" | "free-agency"; team?: string }) {
  const searchParams = useSearchParams();
  const resolvedTeam = FINANCE_TEAMS.find(t => t.id === team || t.tricode === team?.toUpperCase())?.id ?? team;
  const [query,setQuery] = useState(() => readFinanceParams(new URLSearchParams(searchParams),resolvedTeam));
  const [books,setBooks] = useState<FinanceBook[]>([]); const [book,setBook] = useState<FinanceBookDetail | null>(null);
  const [result,setResult] = useState<FinanceResult | null>(null); const [error,setError] = useState("");
  const [catalogError,setCatalogError] = useState(""); const [loading,setLoading] = useState(false);
  const [threshold,setThreshold] = useState(() => String(query.small_big_threshold_cents / 100));
  const [search,setSearch] = useState(searchParams.get("finance_search") ?? ""); const [type,setType] = useState(searchParams.get("finance_type") ?? "all");
  const [size,setSize] = useState(searchParams.get("finance_size") ?? "all"); const [sort,setSort] = useState(searchParams.get("finance_sort") ?? "name");
  const [selected,setSelected] = useState<FinanceContract | null>(null); const request = useRef<AbortController | null>(null);
  const [retry,setRetry] = useState(0);
  const [ownUrl,setOwnUrl] = useState(searchParams.toString());
  const [previousUrl,setPreviousUrl] = useState(searchParams.toString());
  if (previousUrl !== searchParams.toString()) {
    setPreviousUrl(searchParams.toString());
    if (ownUrl !== searchParams.toString()) {
      const next = readFinanceParams(new URLSearchParams(searchParams),resolvedTeam);
      setQuery(next); setThreshold(String(next.small_big_threshold_cents / 100)); setResult(null);setSelected(null);setError("");
      setSearch(searchParams.get("finance_search") ?? "");setType(searchParams.get("finance_type") ?? "all");setSize(searchParams.get("finance_size") ?? "all");setSort(searchParams.get("finance_sort") ?? "name");
    }
  }
  function update(next: Partial<FinanceQuery>) { request.current?.abort(); setLoading(false); setQuery(prev => ({...prev,...next})); setResult(null);setSelected(null);setError(""); }
  async function loadBooks() { try {setBooks(await financeFetch<FinanceBook[]>("/books",AbortSignal.timeout(8000)));setCatalogError("");} catch(err){setCatalogError((err as Error).message);} }
  useEffect(() => {const abort=new AbortController();financeFetch<FinanceBook[]>("/books",abort.signal).then(setBooks).catch(err => {if(!abort.signal.aborted)setCatalogError(err.message);});return () => {abort.abort();request.current?.abort();};},[]);
  useEffect(() => {if (!query.book_id) return; const abort=new AbortController();
    financeFetch<FinanceBookDetail>(`/books/${encodeURIComponent(query.book_id)}`,abort.signal).then(data => {if(!abort.signal.aborted){setBook(data);setCatalogError("");}}).catch(err => {if(!abort.signal.aborted)setCatalogError(err.message);});return () => abort.abort();},[query.book_id]);
  const load = useCallback(async (current: FinanceQuery, abort: AbortController) => {
    setLoading(true);setResult(null);setError("");setSelected(null);
    try { const data=await financeFetch<FinanceResult>("",AbortSignal.any([abort.signal,AbortSignal.timeout(10000)]),current);if(!abort.signal.aborted) setResult(data); }
    catch(err) {if(!abort.signal.aborted)setError((err as Error).message);}finally{if(!abort.signal.aborted)setLoading(false);}
  }, []);
  let thresholdIssue = ""; let thresholdCents = query.small_big_threshold_cents;
  try { thresholdCents = dollarsToCents(threshold); } catch(err) { thresholdIssue = (err as Error).message; }
  const valid = Boolean(query.book_id && /^20\d{2}-\d{2}$/.test(query.financial_season) && /(?:Z|[+-]\d{2}:\d{2})$/.test(query.known_at) && Number.isFinite(Date.parse(query.known_at)) && parseIsoDate(query.effective_on) && !thresholdIssue);
  useEffect(() => {
    const abort=new AbortController(); request.current=abort;
    const timer=setTimeout(() => {
      const current = {...query,small_big_threshold_cents:thresholdCents};
      const params = financeParams(current,new URLSearchParams(window.location.search));
      setOwnUrl(params.toString()); window.history.replaceState(null,"",`${window.location.pathname}?${params}`);
      if (valid) void load(current,abort);
    },200);
    return () => {clearTimeout(timer);abort.abort();};
  }, [query,thresholdCents,valid,retry,load]);
  const labels = book?.book_id === result?.context.book_id ? book?.player_labels ?? {} : {};
  const rows=result ? filterFinanceContracts(result.contracts,labels,search,type,size,sort) : [];
  const params=financeParams(result?.context ?? query,new URLSearchParams(searchParams));
  for(const [key,value] of Object.entries({search,type,size,sort})) params.set(`finance_${key}`,value);
  function viewUpdate(key: string, value: string) { const next=new URLSearchParams(window.location.search);next.set(`finance_${key}`,value);setOwnUrl(next.toString());window.history.replaceState(null,"",`${window.location.pathname}?${next}`); }
  const controls = <>
    <Field label="Team" layout="inline"><Select aria-label="Explicit contract team" disabled={Boolean(resolvedTeam)} value={query.team_id ?? ""} onChange={e => update({team_id:e.target.value || null})}><option value="">All / unresolved</option>{FINANCE_TEAMS.map(t => <option key={t.id} value={t.id}>{t.tricode} · {t.name}</option>)}</Select></Field>
    <Field label="Amount" layout="inline"><Select aria-label="Seasonal amount kind" value={query.amount_kind} onChange={e => update({amount_kind:e.target.value as FinanceQuery["amount_kind"]})}>{AMOUNT_KINDS.map(k => <option key={k} value={k}>{k.replaceAll("_"," ")}</option>)}</Select></Field>
    <Field label="Status" layout="inline"><Select aria-label="Status scope" value={query.statuses[0] ?? "all"} onChange={e => update({statuses:e.target.value === "all" ? [] : [e.target.value as FinanceQuery["statuses"][number]]})}><option value="all">All book statuses</option>{FINANCE_STATUSES.map(s => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}</Select></Field>
  </>;
  const summary = result && <div className="finance-summary" role="group" aria-label="Reported amount coverage"><div><span>Known {result.context.amount_kind.replaceAll("_"," ")} subtotal</span><strong>{formatCents(result.subtotal.known_subtotal_cents)}</strong></div><div><span>Known / represented contracts</span><strong>{result.subtotal.known_contracts} / {result.subtotal.expected_book_contracts}</strong></div><div><span>Unknown amount contracts</span><strong>{result.subtotal.unknown_contracts}</strong></div><div><span>External roster denominator</span><strong>Unknown</strong></div></div>;
  return <PageShell template={resolvedTeam ? "profile" : "explorer"} className="finance-workspace">
    <PageHeader title={mode === "contracts" ? "Contracts & Payroll" : "Free Agency Tracker"} subtitle={resolvedTeam ? `${FINANCE_TEAMS.find(t => t.id === resolvedTeam)?.name ?? "Selected team"} · historical source book` : "Historical source observations · separate financial context"} actions={<>
      <nav aria-label="Finance views"><Link className="button" href={`/contracts?${params}`}>Contracts</Link><Link className="button" href={`/free-agency?${params}`}>Free Agency</Link></nav>
      <button className="button" disabled={loading || !valid} onClick={() => setRetry(value => value + 1)}>Refresh</button>
    </>} />
    <FilterBar className="finance-filter-bar" label="Financial context controls" scope={<>
      <Field label="Book" layout="inline"><Select aria-label="Immutable finance book" value={books.some(b => b.book_id === query.book_id) ? query.book_id : ""} onChange={e => {setBook(null);update({book_id:e.target.value});}}><option value="">Choose a retained book</option>{books.map((b,i) => <option key={b.book_id} value={b.book_id}>{b.parent_book_id ? "Correction" : "Original"} {i+1} · {formatDate(b.created_at)}</option>)}</Select></Field>
      <Field label="Season" layout="inline"><Input aria-label="Financial season" pattern="20[0-9]{2}-[0-9]{2}" list="finance-seasons" value={query.financial_season} onChange={e => update({financial_season:e.target.value})} /><datalist id="finance-seasons">{book?.financial_seasons.map(s => <option key={s}>{s}</option>)}</datalist></Field>
      <Field label={query.known_at ? `Known (UTC ${knownTime(query.known_at)})` : "Known (UTC)"} layout="inline"><DatePicker label="Known date (UTC)" value={knownDate(query.known_at)} onChange={date => update({known_at:`${date}T${knownTime(query.known_at)}Z`})} /></Field>
      <Field label="Effective" layout="inline"><DatePicker label="Effective on (inclusive)" value={query.effective_on} onChange={effective_on => update({effective_on})} /></Field>
    </>} filters={controls} summary={query.financial_season} count={result ? <CountChip>{result.filtered_contract_count} contracts</CountChip> : undefined}
      details={<DataDetailsButton rows={[
        {label:"Book scope",value:book?.coverage_note ?? "Choose a retained book"},
        {label:"Latest selected observation",value:book ? formatDate(book.latest_observed_at) : "Unknown"},
        {label:"Book UUID",value:query.book_id,mono:true},{label:"Book SHA-256",value:book?.book_sha256,mono:true},{label:"Correction parent",value:book?.parent_book_id ?? "Original book",mono:true},
        {label:"Result SHA-256",value:result?.result_sha256,mono:true},{label:"Analytical content SHA-256",value:result?.analytical_content_sha256,mono:true},
        {label:"Label scope",value:book?.label_scope},{label:"Excluded observations",value:JSON.stringify(result?.excluded_observations ?? {}),mono:true}
      ]}>
        <div className="finance-controls">
          <Field label="Explicit book UUID"><Input aria-label="Explicit book UUID" value={query.book_id} onChange={e => {setBook(null);update({book_id:e.target.value});}} /></Field>
          <Field label="Known at (UTC / explicit offset)"><Input aria-label="Known at (UTC / explicit offset)" placeholder="2026-10-03T00:00:00Z" value={query.known_at} onChange={e => update({known_at:e.target.value})} /></Field>
          <Field label="Unknown effective dates"><Select aria-label="Unknown effective dates" value={query.unknown_dates} onChange={e => update({unknown_dates:e.target.value as FinanceQuery["unknown_dates"]})}><option value="include_labelled">Include labelled reports; exclude from sums</option><option value="exclude">Exclude from calculations</option></Select></Field>
          <Field label="Option scenario"><Select aria-label="Option scenario" value={query.scenario} onChange={e => update({scenario:e.target.value as FinanceQuery["scenario"]})}><option value="reported-v1">Reported amounts only</option><option value="include-unexercised-options-v1">Hypothetical: exercise conditional options</option></Select></Field>
          <Field label="Small vs Big threshold (USD)"><Input aria-label="Small vs Big threshold (USD)" inputMode="decimal" value={threshold} onChange={e => {setThreshold(e.target.value);setSelected(null);setResult(null);request.current?.abort();setLoading(false);}} /></Field>
        </div>
        {result?.limitations.map((l,i) => <p key={i}>{l}</p>)}
        <FinanceImport onBooksChanged={loadBooks} />
      </DataDetailsButton>}
    />
    {catalogError && <div role="alert"><GatedNote why={catalogError} action={<button className="button" onClick={loadBooks}>Reload books</button>}>Book discovery is unavailable.</GatedNote></div>}
    {!valid && <GatedNote why={thresholdIssue || "Queries require an explicitly selected book, financial season, timezone-aware known-at and inclusive effective date. No newest branch is selected automatically. Manual UUID entry is in Data details."}>Choose a book and both financial dates.</GatedNote>}
    {loading && <div role="status" aria-label="Loading financial observations" aria-busy="true"><Skeleton height={96} /><Skeleton height={320} /></div>}
    {error && <div role="alert"><GatedNote why={error} action={<button className="button" onClick={() => setRetry(value => value + 1)}>Retry query</button>}>Finance unavailable.</GatedNote></div>}
    {result && <section aria-label="Financial query result" className="finance-result">
      {resolvedTeam ? <ProfileLayout hero={<div className="finance-team-hero"><TeamIdentity team={resolvedTeam} size="xl" />{summary}</div>}>{null}</ProfileLayout> : summary}
      <h2 className="finance-context-title">{result.context.team_id && <TeamLogo team={result.context.team_id} size={20} />}{result.context.team_id ? teamLabel(result.context.team_id) : "All represented teams"} · financial {result.context.financial_season}</h2>
      <GatedNote why={<>
        <p>{result.coverage_note}</p><p>This bounded import is not complete team payroll or present free-agent coverage. Signing status and financial terms have independent evidence. Unknown money stays unknown.</p>
        <p>Incomplete book coverage · cap / tax / apron status pending. Official thresholds and legal room are unavailable. Modeled value, surplus and ROI: unavailable (source-blocked).</p>
        <p>Known at {formatDate(result.context.known_at)} · effective through {formatDate(result.context.effective_on)}.</p>
      </>}>{result.historical_reconstruction ? "Historical reconstruction · incomplete book coverage." : "Dated source reports · incomplete book coverage."}</GatedNote>
      {result.context.scenario !== "reported-v1" && <aside className="ui-gated-note" aria-label="Hypothetical option scenario"><strong>Hypothetical exercise scenario</strong><span>Separate scenario subtotal: {formatCents(result.subtotal.scenario_subtotal_cents)} · {result.subtotal.scenario_contracts} contracts. Reported subtotal above stays unchanged. Unknown salaries remain unknown.</span></aside>}
      <div className="finance-row-filters">
        <Field label="Search"><Input aria-label="Search player, team, or source note" value={search} onChange={e => {setSearch(e.target.value);viewUpdate("search",e.target.value);}} /></Field>
        <Field label="Term family"><Select aria-label="Observed term family" value={type} onChange={e => {setType(e.target.value);viewUpdate("type",e.target.value);}}>{["all","contract","amount","option","guarantee","status","association"].map(t => <option key={t}>{t}</option>)}</Select></Field>
        <Field label="Size"><Select aria-label="Small vs Big group" value={size} onChange={e => {setSize(e.target.value);viewUpdate("size",e.target.value);}}>{["all","small","big","unknown"].map(t => <option key={t}>{t}</option>)}</Select></Field>
        <Field label="Sort"><Select aria-label="Sort contracts" value={sort} onChange={e => {setSort(e.target.value);viewUpdate("sort",e.target.value);}}><option value="name">Player name</option><option value="amount">Known amount descending</option><option value="status">Status</option></Select></Field>
      </div>
      <GatedNote why="Text/type/size filters change visible rows only; totals above retain the query denominator. UFA/RFA, market movement and dated positions are unknown in this schema.">{rows.length} visible · {result.filtered_contract_count} filtered / {result.unfiltered_contract_count} before status filter.</GatedNote>
      <div className="table-wrapper" role="region" aria-label="Contracts and status table" tabIndex={0}><table className="data-table"><thead><tr><th>Player / contract</th><th>Team / status</th><th className="num">Known selected amount</th><th>Small vs Big</th><th className="num">Derived AAV</th><th>Terms / sources</th></tr></thead><tbody>{rows.map(c => <tr key={`${c.player_id}:${c.contract_id}`}><th><button className="finance-detail-button" onClick={() => setSelected(c)}>{labels[c.player_id] ?? "Unknown player label"}</button><br /><Link href={buildPreservedContextUrl(`/players/${c.player_id}`,params)}>Player Stats</Link></th><td>{c.team_id ? <Link className="finance-team-link" href={`/contracts/${teamLabel(c.team_id)}?${params}`}><TeamLogo team={c.team_id} size={20} />{teamLabel(c.team_id)}</Link> : teamLabel(null)}<br />{c.team_status.replaceAll("_"," ")}<br />{STATUS_LABELS[c.status]}</td><td className="num">{formatCents(c.known_amount_cents)}<br />{c.amount_status.replaceAll("_"," ")}{result.context.scenario !== "reported-v1" && <p>Scenario: {formatCents(c.scenario_amount_cents)}</p>}</td><td>{c.size_group}</td><td className="num">{c.derived_aav_usd === null ? "Unknown" : `USD ${c.derived_aav_usd}`}<br />Reported total / years; not salary</td><td>{c.observations.map(o => <div key={o.observation_id}><a href={o.source.url} target="_blank" rel="noreferrer">{o.terms.original_label}</a><br />{formatDate(o.terms.observed_at)}</div>)}</td></tr>)}</tbody></table></div>
      {!rows.length && <GatedNote why="This does not establish unsigned status, zero payroll or absence from a roster." action={<button className="button" onClick={() => {setSearch("");setType("all");setSize("all");viewUpdate("search","");viewUpdate("type","all");viewUpdate("size","all");}}>Clear view filters</button>}>No represented contracts match this scope.</GatedNote>}
      <details><summary>Small vs Big summary and status counts</summary><section aria-label="Small vs Big summary"><h3>Small vs Big · reported {result.context.amount_kind.replaceAll("_"," ")}</h3><p>Small below {formatCents(String(result.context.small_big_threshold_cents))}; Big at or above. Conditional or missing amounts stay Unknown. This split is a grouping choice.</p><div className="finance-summary">{financeSizeGroups(result.contracts).map(g => <div key={g.group}><span>{g.group} · {g.contracts} contracts</span><strong>{formatCents(g.known_cents)}</strong><span>{g.known_contracts} known; modeled value / surplus / ROI unavailable</span></div>)}</div></section><div className="finance-statuses" role="group" aria-label="Book status counts">{FINANCE_STATUSES.map(s => <span key={s}>{STATUS_LABELS[s]}: {result.status_groups_filtered[s]} / {result.status_groups_unfiltered[s]}</span>)}</div><p>Status counts: filtered / before status filter; per contract, not current free-agent players.</p></details>
      <details><summary>Allocation and multi-year source timeline</summary><h3>Known position allocation</h3><p>Dated positions unavailable; known cents remain unclassified.</p><dl>{Object.entries(result.subtotal.position_allocations_cents).map(([position,cents]) => <div key={position}><dt>{position}</dt><dd>{formatCents(cents)}</dd></div>)}</dl><h3>Multi-year source timeline</h3><FinanceObservations rows={result.timeline} /></details>
    </section>}
    {selected && result && <FinanceContractDrawer key={`${selected.player_id}:${selected.contract_id}`} contract={selected} result={result} name={labels[selected.player_id] ?? "Selected player"} onClose={() => setSelected(null)} params={params} />}
  </PageShell>;
}
