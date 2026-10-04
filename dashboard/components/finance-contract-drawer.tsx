"use client";
import { useEffect, useRef, useState } from "react";
import { getPlayerProfile } from "@/lib/workbench-api";
import { formatCents, STATUS_LABELS, type FinanceContract, type FinanceResult, type FinanceObservation } from "@/lib/finance";
import { FINANCE_TEAMS } from "@/lib/finance-teams";
import type { PlayerProfile } from "@/lib/types";
const teamLabel = (id: string | null) => FINANCE_TEAMS.find(t => t.id === id)?.tricode ?? id ?? "Unknown association";
const text = (value: string | null) => value ?? "Unknown";
export function FinanceObservations({ rows }: { rows: FinanceObservation[] }) {
  return <div className="table-wrapper" role="region" aria-label="Source-linked timeline" tabIndex={0}><table className="data-table"><caption>Selected source reports, including future and unresolved terms. Option reports are not realized outcomes.</caption><thead><tr><th>Season / effective date</th><th>Term family / reported value</th><th>Source / observation</th></tr></thead><tbody>{rows.map(o => <tr key={o.observation_id}>
    <td>{o.terms.financial_season ?? "Contract-wide"}<br />{text(o.terms.effective_date)}<br />{o.temporal_label.replaceAll("_"," ")}</td>
    <td>{o.terms.kind} · {o.terms.amount_kind ?? "terms"}<br />{o.terms.kind === "amount" ? o.terms.value === null ? "Unknown" : `Reported USD ${o.terms.value}` : o.terms.kind === "contract" ? `${o.terms.years ?? "Unknown"} years` : o.terms.kind === "option" ? `${text(o.terms.option)} · ${text(o.terms.option_state)}` : o.terms.kind === "guarantee" ? text(o.terms.guarantee) : o.terms.kind === "association" ? teamLabel(o.terms.team_id) : text(o.terms.status)}<br />{o.terms.original_label}</td>
    <td><a href={o.source.url} target="_blank" rel="noreferrer">{o.source.attribution}</a><br />{o.terms.source_locator}<br />Observed {o.terms.observed_at}
      {o.supersedes_id && <p>Correction: {o.terms.correction_reason}<br />Replaces {o.supersedes_id}</p>}
      <details><summary>Evidence identities</summary><p>Origin book: {o.origin_book_id}<br />Observation: {o.observation_id}<br />Content SHA-256: {o.content_sha256}<br />Source SHA-256: {o.source.sha256}<br />Source observed: {o.source.observed_at}<br />Use basis: {o.source.use_basis}</p></details>
    </td></tr>)}</tbody></table>{!rows.length && <p>No selected observations.</p>}</div>;
}

export function FinanceContractDrawer({ contract, result, name, onClose, params }: { contract: FinanceContract; result: FinanceResult; name: string; onClose: () => void; params: URLSearchParams }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const statsRequest = useRef(0);
  const [stats, setStats] = useState<PlayerProfile | null>(null);
  const [statsError, setStatsError] = useState(""); const [loading, setLoading] = useState(false);
  const [basketballSeason, setBasketballSeason] = useState(params.get("season") ?? "2025-26");
  const [cutoff, setCutoff] = useState(params.get("beforeDate") ?? "2026-07-01");
  const [release, setRelease] = useState(params.get("releaseId") ?? "");
  const [phase, setPhase] = useState(params.get("phase") ?? "regular_season");
  useEffect(() => { const node = dialog.current; const active = document.activeElement as HTMLElement | null; node?.showModal(); return () => { node?.close(); active?.focus(); }; }, []);
  return <dialog ref={dialog} className="finance-dialog" onCancel={onClose} aria-labelledby="contract-title"><div className="finance-dialog-head"><h2 id="contract-title">{name} · contract details</h2><button className="button" onClick={onClose}>Close details</button></div>
    <p>{contract.contract_id} · {teamLabel(contract.team_id)} ({contract.team_status}) · {STATUS_LABELS[contract.status]}</p>
    <p>Financial season {result.context.financial_season}. {result.context.amount_kind.replaceAll("_"," ")}: {formatCents(contract.known_amount_cents)} ({contract.amount_status}).</p>
    <p>Derived AAV: {contract.derived_aav_usd === null ? "Unknown" : `USD ${contract.derived_aav_usd}`} · {contract.aav_definition}</p>
    <p>Options, guarantees and cash/cap terms below remain separate source reports. Unreported fields are unknown.</p>
    <FinanceObservations rows={result.timeline.filter(o => o.terms.nba_player_id === contract.player_id && o.terms.contract_id === contract.contract_id)} />
    <h3>Embedded player Stats · separate basketball context</h3>
    <form className="finance-controls" onSubmit={async e => { e.preventDefault(); setLoading(true); setStats(null); setStatsError(""); const requestId=++statsRequest.current; try { const data=await getPlayerProfile(contract.player_id,{season:basketballSeason,phase,beforeDate:cutoff,releaseId:release || undefined,window:"season_to_date"}); if(statsRequest.current === requestId)setStats(data); } catch(err) {if(statsRequest.current === requestId)setStatsError((err as Error).message); } finally {if(statsRequest.current === requestId)setLoading(false);} }}>
      <label>Basketball season<input required pattern="20[0-9]{2}-[0-9]{2}" value={basketballSeason} onChange={e => {setBasketballSeason(e.target.value);setStats(null);statsRequest.current++;setLoading(false);}} /></label>
      <label>Basketball phase<select value={phase} onChange={e => {setPhase(e.target.value);setStats(null);statsRequest.current++;setLoading(false);}}><option value="regular_season">Regular season</option><option value="playoffs">Playoffs</option><option value="preseason">Preseason</option></select></label>
      <label>Basketball exclusive cutoff<input required type="date" value={cutoff} onChange={e => {setCutoff(e.target.value);setStats(null);statsRequest.current++;setLoading(false);}} /></label>
      <label>Basketball release (blank resolves public)<input value={release} onChange={e => {setRelease(e.target.value);setStats(null);statsRequest.current++;setLoading(false);}} /></label>
      <button className="button" disabled={loading}>Load player Stats</button>
    </form>{loading && <p role="status">Loading player Stats…</p>}{statsError && <p role="alert">Stats unavailable: {statsError}</p>}
    {stats && <section aria-label="Embedded player Stats"><p>Basketball season {stats.context.season} · {stats.context.phase} · before {stats.context.before_date} · {stats.summaries.season.gp ?? stats.context.sample_size ?? "Unknown"} appearances · release {stats.context.release_id}</p><dl>{Object.entries(stats.summaries.season).map(([key,value]) => <div key={key}><dt>{key}</dt><dd>{value ?? "Unknown"}</dd></div>)}</dl>{[...(stats.warnings ?? []),...(stats.context.warnings ?? [])].map((w,i) => <p key={i}>{w}</p>)}</section>}
  </dialog>;
}

