"use client";
import { useEffect, useRef, useState } from "react";
import { getPlayerProfile } from "@/lib/workbench-api";
import { formatCents, STATUS_LABELS, type FinanceContract, type FinanceResult, type FinanceObservation } from "@/lib/finance";
import { FINANCE_TEAMS } from "@/lib/finance-teams";
import { CatalogScopeFields } from "./catalog-scope-fields";
import { GatedNote } from "./ui/gated-note";
import { PlayerIdentity } from "./ui/identity";
import { TeamLogo } from "./team-logo";
import { Skeleton } from "./ui/skeleton";
import { formatDate, throughLabel } from "@/lib/format-date";
import type { PlayerProfile } from "@/lib/types";
import { Button } from "./ui/kit";
const teamLabel = (id: string | null) => FINANCE_TEAMS.find(t => t.id === id)?.tricode ?? id ?? "Unknown association";
const text = (value: string | null) => value ?? "Unknown";
export function FinanceObservations({ rows }: { rows: FinanceObservation[] }) {
  return <div className="table-wrapper" role="region" aria-label="Source-linked timeline" tabIndex={0}><table className="data-table"><caption>Selected source reports, including future and unresolved terms. Option reports are not realized outcomes.</caption><thead><tr><th>Season / effective date</th><th>Term family / reported value</th><th>Source / observation</th></tr></thead><tbody>{rows.map(o => <tr key={o.observation_id}>
    <td>{o.terms.financial_season ?? "Contract-wide"}<br />{o.terms.effective_date ? formatDate(o.terms.effective_date) : "Unknown"}<br />{o.temporal_label.replaceAll("_"," ")}</td>
    <td>{o.terms.kind} · {o.terms.amount_kind ?? "terms"}<br />{o.terms.kind === "association" && o.terms.team_id && <TeamLogo team={o.terms.team_id} size={20} />}{o.terms.kind === "amount" ? o.terms.value === null ? "Unknown" : `Reported USD ${o.terms.value}` : o.terms.kind === "contract" ? `${o.terms.years ?? "Unknown"} years` : o.terms.kind === "option" ? `${text(o.terms.option)} · ${text(o.terms.option_state)}` : o.terms.kind === "guarantee" ? text(o.terms.guarantee) : o.terms.kind === "association" ? teamLabel(o.terms.team_id) : text(o.terms.status)}<br />{o.terms.original_label}</td>
    <td><a href={o.source.url} target="_blank" rel="noreferrer">{o.source.attribution}</a><br />Observed {formatDate(o.terms.observed_at)}
      {o.supersedes_id && <p>Correction: {o.terms.correction_reason}</p>}
      <details><summary>Data details</summary><p>Source locator: {o.terms.source_locator}<br />Replaces: {o.supersedes_id ?? "None"}<br />Origin book: {o.origin_book_id}<br />Observation: {o.observation_id}<br />Content SHA-256: {o.content_sha256}<br />Source SHA-256: {o.source.sha256}<br />Source observed: {o.source.observed_at}<br />Use basis: {o.source.use_basis}</p></details>
    </td></tr>)}</tbody></table>{!rows.length && <p>No selected observations.</p>}</div>;
}

export function FinanceContractDrawer({ contract, result, name, onClose, params }: { contract: FinanceContract; result: FinanceResult; name: string; onClose: () => void; params: URLSearchParams }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const statsRequest = useRef(0);
  const [stats, setStats] = useState<PlayerProfile | null>(null);
  const [statsError, setStatsError] = useState(""); const [loading, setLoading] = useState(false);
  const [scope,setScope] = useState({season:params.get("season") ?? "",before:params.get("beforeDate") ?? params.get("before_date") ?? "",release:params.get("releaseId") ?? params.get("release_id") ?? "",phase:params.get("phase") ?? ""});
  const [showStats,setShowStats] = useState(false);
  function changeScope(next: Partial<typeof scope>) { statsRequest.current++;setStats(null);setLoading(false);setStatsError("");setScope(previous => ({...previous,...next})); }
  useEffect(() => {
    if (!showStats) return;
    let active=true; const id=++statsRequest.current;
    const timer=setTimeout(() => {
      setLoading(true);setStats(null);setStatsError("");
      getPlayerProfile(contract.player_id,{season:scope.season || undefined,phase:scope.phase || undefined,beforeDate:scope.before || undefined,releaseId:scope.release || undefined,window:"season_to_date"})
        .then(data => {if(active && statsRequest.current === id)setStats(data);})
        .catch(err => {if(active && statsRequest.current === id)setStatsError((err as Error).message);})
        .finally(() => {if(active && statsRequest.current === id)setLoading(false);});
    },200);
    return () => {active=false;clearTimeout(timer);};
  },[showStats,scope,contract.player_id]);
  useEffect(() => { const node = dialog.current; const active = document.activeElement as HTMLElement | null; node?.showModal(); return () => { node?.close(); active?.focus(); }; }, []);
  return <dialog ref={dialog} className="finance-dialog" onCancel={onClose} aria-labelledby="contract-title"><div className="finance-dialog-head"><h2 id="contract-title">{name} · contract details</h2><Button size="lg" onClick={onClose}>Close details</Button></div>
    <PlayerIdentity playerId={contract.player_id} name={name} size="lg" subtitle={<>{contract.team_id && <TeamLogo team={contract.team_id} size={20} />}{teamLabel(contract.team_id)} · {STATUS_LABELS[contract.status]}</>} />
    <p>Financial season {result.context.financial_season}. {result.context.amount_kind.replaceAll("_"," ")}: {formatCents(contract.known_amount_cents)} ({contract.amount_status}).</p>
    <p>Derived AAV: {contract.derived_aav_usd === null ? "Unknown" : `USD ${contract.derived_aav_usd}`} · {contract.aav_definition}</p>
    <p>Options, guarantees and cash/cap terms below remain separate source reports. Unreported fields are unknown.</p>
    <FinanceObservations rows={result.timeline.filter(o => o.terms.nba_player_id === contract.player_id && o.terms.contract_id === contract.contract_id)} />
    <Button size="sm" onClick={() => setShowStats(value => !value)} aria-expanded={showStats}>Player Stats</Button>
    {showStats && <section><h3>Embedded player Stats · separate basketball context</h3>
      <div className="finance-controls"><CatalogScopeFields release={scope.release || undefined} season={scope.season} phase={scope.phase} before={scope.before} onSeason={season => changeScope({season})} onPhase={phase => changeScope({phase})} onBefore={before => changeScope({before})} /></div>
      {loading && <div role="status"><Skeleton height={96} /><span className="sr-only">Loading player Stats…</span></div>}
      {statsError && <div role="alert"><GatedNote why={statsError} action={<Button size="sm" onClick={() => setScope(previous => ({...previous}))}>Retry Stats</Button>}>Stats unavailable.</GatedNote></div>}
      {stats && <section aria-label="Embedded player Stats"><p>Basketball season {stats.context.season} · {stats.context.phase} · {throughLabel(stats.context.before_date)} · {stats.summaries.season.gp ?? stats.context.sample_size ?? "Unknown"} appearances</p><dl>{Object.entries(stats.summaries.season).map(([key,value]) => <div key={key}><dt>{key}</dt><dd>{value ?? "Unknown"}</dd></div>)}</dl><GatedNote why={[...(stats.warnings ?? []),...(stats.context.warnings ?? [])].join(" · ") || "Basketball participation does not establish a financial association."}>Basketball context is separate from financial terms.</GatedNote></section>}
    </section>}
    <details><summary>Data details</summary><p>Contract: {contract.contract_id}</p><label>Basketball release (blank resolves public)<input value={scope.release} onChange={e => changeScope({release:e.target.value})} /></label>{stats && <p>Basketball release: {stats.context.release_id} · exclusive cutoff: {stats.context.before_date}</p>}</details>
  </dialog>;
}
