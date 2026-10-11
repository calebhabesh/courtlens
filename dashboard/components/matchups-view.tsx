"use client";

import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { runShooting, queryLookup } from "@/lib/workbench-api";
import { resolvedShooting, shootingCsv, shootingUrl, validateShooting, shootingPercent } from "@/lib/shooting";
import type { ShootingInput, ShootingResponse } from "@/lib/shooting-types";
import type { LookupItem } from "@/lib/types";
import { CatalogScopeFields } from "./catalog-scope-fields";
import { EntityField } from "./entity-picker";
import { PageShell, CompareLayout } from "./ui/page-shell";
import { PageHeader } from "./ui/panel";
import { FilterBar } from "./ui/filter-bar";
import { DataDetailsButton } from "./ui/data-details";
import { Field } from "./ui/field";
import { DatePicker } from "./ui/date-picker";
import { PlayerIdentity } from "./ui/identity";
import { GatedNote } from "./ui/gated-note";
import { TemplateSkeleton } from "./ui/template-skeleton";

function download(text: string, filename: string, type: string) {
  const url=URL.createObjectURL(new Blob([text],{type}));const a=document.createElement("a");a.href=url;a.download=filename;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}

export function MatchupsView() {
  const params=useSearchParams();
  const read=():ShootingInput=>({player_id:params.get("player_id") || params.get("playerId") || "",defender_id:params.get("defender_id") || null,release_id:params.get("release_id") || params.get("releaseId") || null,season:params.get("season"),phase:params.get("phase") as ShootingInput["phase"],before_date:params.get("before_date") || params.get("beforeDate"),lower_date:params.get("lower_date"),min_attempts:Number(params.get("min_attempts") ?? 100),min_games:Number(params.get("min_games") ?? 5),limit:Number(params.get("limit") ?? 10)});
  const [query,setQuery]=useState(read),[result,setResult]=useState<ShootingResponse|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState(""),[retry,setRetry]=useState(0);
  const [identities,setIdentities]=useState<Record<string,LookupItem>>({});
  const [previous,setPrevious]=useState(params.toString());const [ownUrl,setOwnUrl]=useState(params.toString());const active=useRef<AbortController|null>(null);
  if(previous !== params.toString()) {setPrevious(params.toString());if(params.toString() !== ownUrl) {setQuery(read());setResult(null);setError("");}}
  function change(next:Partial<ShootingInput>) {active.current?.abort();setResult(null);setBusy(false);setError("");setQuery(prev=>({ ...prev,
    release_id:prev.release_id || (result ? resolvedShooting(result).release_id : null),
    season:prev.season || (result ? resolvedShooting(result).season : null),
    phase:prev.phase || (result ? resolvedShooting(result).phase : null),
    before_date:prev.before_date || (result ? resolvedShooting(result).before_date : null),
    ...next }));}
  const issue=validateShooting(query);
  useEffect(()=>{

    const controller=new AbortController();active.current=controller;
    const timer=setTimeout(()=>{
      const url=shootingUrl("/matchups","matchups",query);setOwnUrl(url.split("?")[1] ?? "");window.history.replaceState(null,"",url);
      if(!query.player_id || issue)return;
      setBusy(true);setError("");setResult(null);
      runShooting("matchups",query,controller.signal).then(data=>{
        if(controller.signal.aborted)return;
        setResult(data);const resolved=shootingUrl("/matchups","matchups",resolvedShooting(data));setOwnUrl(resolved.split("?")[1] ?? "");window.history.replaceState(null,"",resolved);
      }).catch(err=>{if(!controller.signal.aborted)setError(err instanceof Error ? err.message : "Matchup query failed");}).finally(()=>{if(!controller.signal.aborted)setBusy(false);});
    },200);
    return()=>{clearTimeout(timer);controller.abort();};
  },[query,issue,retry]);
  const ids=[query.player_id,query.defender_id,...(result?.assignments.flatMap(a=>[a.offensive_player_id,a.defensive_player_id]) ?? [])].filter(Boolean).join(",");
  useEffect(()=>{
    const controller=new AbortController();
    for(const id of new Set(ids.split(",").filter(Boolean))) queryLookup({query:id,releaseId:query.release_id,season:query.season,phase:query.phase,beforeDate:query.before_date,kinds:["player"],limit:1,signal:controller.signal}).then(data=>{const item=data.items.find(item=>item.canonical_id === id);if(item&&!controller.signal.aborted)setIdentities(prev=>({...prev,[id]:item}));}).catch(()=>{});
    return()=>controller.abort();
  },[ids,query.release_id,query.season,query.phase,query.before_date]);
  const name=(id:string)=>identities[id]?.display_name ?? "Selected player";
  const identity=(id:string,subtitle:string)=><PlayerIdentity playerId={id} name={name(id)} subtitle={subtitle} team={identities[id]?.team_association?.teams?.[0]} size="xl" />;
  const picker={releaseId:query.release_id,season:query.season,phase:query.phase,beforeDate:query.before_date};
  return <PageShell template="compare" className="shared-floor fo11-matchups">
    <PageHeader title="Player Matchups" subtitle="Explicit source assignments between offense and defense." actions={result && <button className="button" onClick={()=>download(shootingCsv(result),"shooting-evidence.csv","text/csv")}>Export evidence CSV</button>} />
    <FilterBar summary={query.season || "Published scope"} scope={<CatalogScopeFields release={query.release_id ?? undefined} season={query.season ?? ""} phase={query.phase ?? ""} before={query.before_date ?? ""} onSeason={season=>change({season})} onPhase={phase=>change({phase:phase as ShootingInput["phase"]})} onBefore={before_date=>change({before_date})} />}
      filters={<><Field label="From"><DatePicker label="Lower date (inclusive)" value={query.lower_date ?? ""} onChange={lower_date=>change({lower_date})} /></Field><Field label="Minimum attempts"><input aria-label="Minimum attempts" type="number" min={1} max={10000} value={query.min_attempts} onChange={e=>change({min_attempts:Number(e.target.value)})} /></Field><Field label="Minimum games"><input aria-label="Minimum games" type="number" min={1} max={100} value={query.min_games} onChange={e=>change({min_games:Number(e.target.value)})} /></Field></>}
      details={<DataDetailsButton scope={{releaseId:query.release_id,season:query.season,phase:query.phase,beforeDate:query.before_date}} rows={result ? [{label:"Operation version",value:result.operation_version,mono:true},{label:"Excluded rows",value:result.excluded_rows},{label:"Input",value:result.input_hash,mono:true},{label:"Evidence",value:result.evidence_hash,mono:true},{label:"Sources",value:JSON.stringify(result.provenance),mono:true},{label:"Counts",value:JSON.stringify({input_counts:result.input_counts,branch_counts:result.branch_counts}),mono:true},{label:"Resolved context",value:JSON.stringify(result.context),mono:true}] : []}>
        <Field label="Release"><input aria-label="Release" value={query.release_id ?? ""} onChange={e=>change({release_id:e.target.value || null})} /></Field>
        {result && <button className="button" onClick={()=>download(JSON.stringify({schema:"courtload-shooting-evidence-v1",result,display_filters:{zone:"",team:"",shot_page:1,anchor_page:1}},null,2),"shooting-evidence.json","application/json")}>Save evidence JSON</button>}
      </DataDetailsButton>} />
    <div className="fo11-selectors"><EntityField {...picker} label="Offensive player" value={query.player_id} required onChange={(player_id,items)=>{change({player_id});setIdentities(prev=>({...prev,...Object.fromEntries(items.map(item=>[item.canonical_id,item]))}));}} /><EntityField {...picker} label="Defender (optional)" value={query.defender_id ?? ""} onChange={(defender_id,items)=>{change({defender_id:defender_id || null});setIdentities(prev=>({...prev,...Object.fromEntries(items.map(item=>[item.canonical_id,item]))}));}} /></div>
    {!query.player_id && <GatedNote>Choose an offensive player to inspect source assignments.</GatedNote>}
    {query.player_id && issue && <div role="alert"><GatedNote>{issue}</GatedNote></div>}
    {error && <div role="alert"><GatedNote why={error} action={<button className="button" onClick={()=>setRetry(v=>v+1)}>Retry</button>}>Player matchups unavailable.</GatedNote></div>}
    {busy && <TemplateSkeleton template="compare" />}
    {result && <section className="panel floor-result" aria-label="Shooting result"><CompareLayout sides={[identity(query.player_id,"Offense"),query.defender_id ? identity(query.defender_id,"Defense") : <div className="fo11-entity-placeholder">All Source-Assigned Defenders</div>]}>
      <h2>Offense × Defense Assignment Matrix</h2><p role="status">Source coverage: <strong>{result.coverage_status}</strong> · {result.observed_games} / {result.expected_games} finalized league games across required inputs.</p>
      {result.assignments.length ? <div className="floor-scroll" role="region" aria-label="Assignment matrix" tabIndex={0}><table className="data-table"><caption>Source pair matrix · pooled FG% = assignment makes / attempts</caption><thead><tr>{["Offense / Defense","Games","Seconds","Fractional Possessions","Attempts","Makes","Player Points","Team Points","FG%"].map(h=><th key={h} scope="col">{h}</th>)}</tr></thead><tbody>{result.assignments.map(a=><tr key={`${a.offensive_player_id}-${a.defensive_player_id}`}><th scope="row">{name(a.offensive_player_id)} / {name(a.defensive_player_id)}</th><td>{a.games}</td><td>{a.seconds}</td><td>{a.fractional_possessions}</td><td>{a.attempts}</td><td>{a.makes}</td><td>{a.player_points}</td><td>{a.team_points}</td><td>{shootingPercent(a.fg_pct)}</td></tr>)}</tbody></table></div> : <GatedNote>No source assignments in this scope.</GatedNote>}
      <GatedNote why={<><p>Explicit source pair assignments only. Fractional possessions/help responsibility do not sum to ordinary player totals. No nearest-defender, tracking, causal impact or forced-turnover inference.</p><p>Blank scope fields resolve through the retained release. Assignment exposure is descriptive. Dense league scopes can exceed the 50,000-row input bound: narrow the dates.</p><p>Per-game assignment rows and verified clips are unavailable in this API. Narrow the date scope for game-specific queries; this does not supply a clip mapping.</p><p>Verified source video unavailable. An observed event does not establish an available clip.</p>{result.coverage_status === "source_blocked" && <p>Real analytics are unavailable for this retained scope. Admit and reconcile the required sources before interpreting results.</p>}{result.disclosures.map(d=><p key={d}>{d}</p>)}</>}>Assignment exposure is descriptive.</GatedNote>
      <Link className="button" href={shootingUrl("/matchups","matchups",resolvedShooting(result))}>Reopen this resolved query</Link>
    </CompareLayout></section>}
  </PageShell>;
}
