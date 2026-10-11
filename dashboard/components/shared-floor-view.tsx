"use client";
import { preserveExample } from "@/lib/example-subject";
import { ExampleSubjectCard, useExampleSubject } from "./example-subject";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { runSharedFloor, queryLookup } from "@/lib/workbench-api";
import { CatalogScopeFields } from "./catalog-scope-fields";
import { EntityField } from "./entity-picker";
import { comparableFloorResults, floorCsv, floorInterval, floorNumber, floorUrl, resolvedFloorRequest, validateFloorRequest } from "@/lib/shared-floor";
import type { FloorCell, FloorOperation, FloorRequest, FloorResponse } from "@/lib/shared-floor";

import { PageShell, CompareLayout } from "./ui/page-shell";
import { PageHeader } from "./ui/panel";
import { FilterBar } from "./ui/filter-bar";
import { Field } from "./ui/field";
import { DatePicker } from "./ui/date-picker";
import { DataDetailsButton } from "./ui/data-details";
import { PlayerIdentity, TeamIdentity } from "./ui/identity";
import { ComparisonRows } from "./ui/comparison-rows";
import { GatedNote } from "./ui/gated-note";
import { TemplateSkeleton } from "./ui/template-skeleton";

const splitIds = (value: string) => value.split(/[\s,]+/).filter(Boolean);
function download(text: string, name: string, type: string) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const link = document.createElement("a"); link.href = url; link.download = name; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function SharedFloorView({ initialOperation = "wowy", statsPreset = false }: { initialOperation?: FloorOperation; statsPreset?: boolean }) {
  const params = useSearchParams();
  const exampleState = useExampleSubject("together", ["apart", "exact_unit"], "duo", initialOperation === "wowy" && !statsPreset && params.get("operation") !== "on-off");
  const path = usePathname();
  const op = params.get("operation");
  const [operation, setOperation] = useState<FloorOperation>(initialOperation === "stat-shift" ? initialOperation : op === "on-off" ? op : initialOperation);
  const [mode, setMode] = useState<"team" | "leaders" | "unit">(params.has("exact_unit") ? "unit" : params.get("view") === "leaders" ? "leaders" : "team");
  const [team, setTeam] = useState(params.get("team_id") || params.get("teamId") || "TOR");
  const [together, setTogether] = useState(params.get("together") || "");
  const [apart, setApart] = useState(params.get("apart") || "");
  const [unit, setUnit] = useState(params.get("exact_unit") || "");
  const [focal, setFocal] = useState(params.get("player_id") || "");
  const [release, setRelease] = useState(params.get("release_id") || params.get("releaseId") || "");
  const [season, setSeason] = useState(params.get("season") || "");
  const [phase, setPhase] = useState(params.get("phase") || "");
  const [before, setBefore] = useState(params.get("before_date") || params.get("beforeDate") || "");
  const [lower, setLower] = useState(params.get("lower_date") || "");
  const [possessions, setPossessions] = useState(params.get("min_possessions") || "100");
  const [games, setGames] = useState(params.get("min_games") || "5");
  const [names, setNames] = useState<Record<string, string>>({});
  const [results, setResults] = useState<FloorResponse[]>([]);
  const [pinned, setPinned] = useState<FloorResponse | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [ownUrl,setOwnUrl] = useState(params.toString());
  const [retry,setRetry] = useState(0);
  const [previousUrl,setPreviousUrl] = useState(params.toString());
  if(params.toString() !== previousUrl) {
    setPreviousUrl(params.toString());
    if(params.toString() !== ownUrl) {
      setTeam(params.get("team_id") || params.get("teamId") || "TOR");
      setTogether(params.get("together") || "");setApart(params.get("apart") || "");setUnit(params.get("exact_unit") || "");setFocal(params.get("player_id") || "");
      setRelease(params.get("release_id") || params.get("releaseId") || "");setSeason(params.get("season") || "");setPhase(params.get("phase") || "");setBefore(params.get("before_date") || params.get("beforeDate") || "");setLower(params.get("lower_date") || "");
      setPossessions(params.get("min_possessions") || "100");setGames(params.get("min_games") || "5");
      setResults([]);setError("");setBusy(false);setMode(params.has("exact_unit") ? "unit" : params.get("view") === "leaders" ? "leaders" : "team");
      setOperation(initialOperation === "stat-shift" ? initialOperation : params.get("operation") === "on-off" ? "on-off" : initialOperation);
    }
  }
  function retainResolvedScope() {
    exampleState.cancelDefault();
    if(!results[0])return;
    const resolved=resolvedFloorRequest(results[0]);
    setRelease(previous=>previous || resolved.release_id || "");
    setSeason(previous=>previous || resolved.season || "");
    setPhase(previous=>previous || resolved.phase || "");
    setBefore(previous=>previous || resolved.before_date || "");
  }
  const active = useRef<AbortController | null>(null);
  useEffect(() => () => active.current?.abort(), []);
  async function submit() {
    active.current?.abort();
    const controller = new AbortController(); active.current = controller;
    const req: FloorRequest = {
      team_id: team, release_id: release || undefined, season: season || undefined,
      phase: phase || undefined, before_date: before || undefined, lower_date: lower || undefined,
      together: mode === "unit" ? [] : splitIds(together), apart: operation === "on-off" || mode === "unit" || mode === "leaders" ? [] : splitIds(apart),
      exact_unit: mode === "unit" ? splitIds(unit) : [], player_id: operation === "stat-shift" ? focal : undefined,
      min_possessions: Number(possessions), min_games: Number(games)
    };
    const issue = validateFloorRequest(mode === "leaders" ? "wowy" : operation, req);
    setError(issue || ""); if (issue) { setBusy(false); return; }
    setBusy(true); setResults([]);
    const launchUrl = window.location.search;
    try {
      const next: FloorResponse[] = [];
      if (mode === "leaders") {
        // At most five explicit candidates; sequential requests pin the first resolved release.
        let bound = req;
        for (const id of req.together) {
          const result = await runSharedFloor("on-off", { ...bound, together: [id] }, controller.signal);
          if (controller.signal.aborted || window.location.search !== launchUrl) return;
          next.push(result); bound = { ...resolvedFloorRequest(result), together: req.together };
        }
        next.sort((a, b) => {
          const delta = (r: FloorResponse) => r.shifts.find(s => s.metric === "net_rating")?.difference;
          return (delta(b) ?? -Infinity) - (delta(a) ?? -Infinity);
        });
      } else next.push(await runSharedFloor(operation, req, controller.signal));
      if (controller.signal.aborted || window.location.search !== launchUrl) return;
      setResults(next);
      if (next.length === 1) {
        const url=preserveExample(floorUrl(path,next[0].operation,resolvedFloorRequest(next[0]))+(statsPreset ? "&preset=onoff" : ""),window.location.search);
        setOwnUrl(url.split("?")[1] ?? "");window.history.replaceState(null,"",url);
      }
    } catch (err) { if (!controller.signal.aborted) setError(err instanceof Error ? err.message : "Shared-floor request failed"); }
    finally { if (!controller.signal.aborted) setBusy(false); }
  }
  const name = (id: string) => names[id] ?? "Selected player";
  const pickerScope = {releaseId: release || null, season: season || null, phase: phase || null, beforeDate: before || null};
  const remember = (items: import("@/lib/types").LookupItem[]) => setNames(previous => ({...previous,...Object.fromEntries(items.map(item=>[item.canonical_id,item.display_name]))}));
  const request: FloorRequest = {team_id:team,release_id:release || undefined,season:season || undefined,phase:phase || undefined,before_date:before || undefined,lower_date:lower || undefined,
    together:mode === "unit" ? [] : splitIds(together),apart:operation === "on-off" || mode !== "team" ? [] : splitIds(apart),exact_unit:mode === "unit" ? splitIds(unit) : [],player_id:operation === "stat-shift" ? focal : undefined,min_possessions:Number(possessions),min_games:Number(games)};
  const requestKey=JSON.stringify([operation,mode,request]);
  const issue=validateFloorRequest(mode === "leaders" ? "wowy" : operation,request);
  const ready=Boolean(team && (request.together.length || request.apart.length || request.exact_unit.length));
  useEffect(() => {
    if (exampleState.loading) return;
    active.current?.abort();
    const timer=setTimeout(()=>{
      setResults([]);setBusy(false);setError("");
      const url=preserveExample(floorUrl(path,operation,request)+(mode === "leaders" ? "&view=leaders" : "")+(statsPreset ? "&preset=onoff" : ""),window.location.search);
      setOwnUrl(url.split("?")[1] ?? "");window.history.replaceState(null,"",url);
      if(ready && !issue)void submit();
    },200);
    return ()=>{clearTimeout(timer);active.current?.abort();};
    // The serialized key contains every request field and view mode; no identity object dependency.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[requestKey,retry,exampleState.loading]);
  const selectedIds=splitIds([together,apart,unit,focal].join(",")).join(",");
  useEffect(()=>{
    const controller=new AbortController();
    for(const id of splitIds(selectedIds)) queryLookup({query:id,...pickerScope,kinds:["player"],limit:1,signal:controller.signal}).then(data=>{
      const item=data.items.find(item=>item.canonical_id === id);if(item && !controller.signal.aborted)remember([item]);
    }).catch(()=>{});
    return ()=>controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[selectedIds,release,season,phase,before]);
  return <PageShell template="compare" className="shared-floor fo11-wowy">
    <PageHeader title={statsPreset ? "Stats · On/off" : "WOWY"} subtitle="Observed lineup exposure and descriptive differences." actions={<>
      <Link className="button" href="/stat-line-shift">Teammate Shifts</Link>
      {results.length > 0 && <button className="button" onClick={()=>download(floorCsv(results),"shared-floor.csv","text/csv")}>Export cell metrics CSV</button>}
    </>} />
    <FilterBar summary={season || "Published scope"} scope={<CatalogScopeFields release={release || undefined} season={season} phase={phase} before={before} onSeason={value=>{retainResolvedScope();setSeason(value);}} onPhase={value=>{retainResolvedScope();setPhase(value);}} onBefore={value=>{retainResolvedScope();setBefore(value);}} />}
      filters={<>
        <Field label="From"><DatePicker label="From date (inclusive)" value={lower} onChange={value=>{retainResolvedScope();setLower(value);}} /></Field>
        <Field label="Minimum possessions"><input aria-label="Minimum possessions" type="number" min="1" max="10000" value={possessions} onChange={e=>{retainResolvedScope();setPossessions(e.target.value);}} /></Field>
        <Field label="Minimum games"><input aria-label="Minimum games" type="number" min="1" max="82" value={games} onChange={e=>{retainResolvedScope();setGames(e.target.value);}} /></Field>
      </>}
      modes={<>
        {initialOperation === "wowy" && <Field label="Operation"><select aria-label="Operation" value={operation} onChange={e=>{retainResolvedScope();setOperation(e.target.value as FloorOperation);setMode("team");}}><option value="wowy">WOWY</option><option value="on-off">On/off</option></select></Field>}
        {operation === "wowy" && <Field label="View"><select aria-label="View" value={mode} onChange={e=>{retainResolvedScope();setMode(e.target.value as typeof mode);}}><option value="team">Team sets</option><option value="leaders">Selected-player leaders (max 5)</option><option value="unit">2–5-player unit</option></select></Field>}
      </>}
      details={<DataDetailsButton scope={{releaseId:release,season,phase,beforeDate:before}} rows={results.flatMap(result=>[
        {label:"Resolved scope",value:JSON.stringify(result.context),mono:true},{label:"Excluded stints",value:result.excluded_stints},{label:"Input",value:result.input_hash,mono:true},{label:"Evidence",value:result.evidence_hash,mono:true},{label:"Operation version",value:result.operation_version,mono:true}
      ]).concat(pinned ? [{label:"Pinned evidence",value:pinned.evidence_hash,mono:true}] : [])}>
        <Field label="Release"><input aria-label="Release" value={release} onChange={e=>setRelease(e.target.value)} /></Field>
        {results.length > 0 && <button className="button" onClick={()=>download(JSON.stringify({schema:"courtload-shared-floor-evidence-v1",results,pinned_comparison:pinned},null,2),"shared-floor-evidence.json","application/json")}>Save evidence JSON</button>}
      </DataDetailsButton>} />
    <ExampleSubjectCard {...exampleState} />
    <div className="fo11-selectors">
      <EntityField {...pickerScope} label="Team" kind="team" value={team} required onChange={value=>{retainResolvedScope();setTeam(value);}} />
      {operation === "stat-shift" && <EntityField {...pickerScope} label="Focal player" value={focal} required onChange={(value,items)=>{retainResolvedScope();setFocal(value);remember(items);}} />}
      {mode === "unit" ? <EntityField {...pickerScope} label="Exact unit" value={unit} multiple max={5} required onChange={(value,items)=>{retainResolvedScope();setUnit(value);remember(items);}} /> : <>
        <EntityField {...pickerScope} label={mode === "leaders" ? "Candidate players" : "Together players"} value={together} multiple={operation !== "on-off"} max={mode === "leaders" ? 5 : 5-splitIds(apart).length} excludedIds={operation === "on-off" || mode === "leaders" ? [] : splitIds(apart)} required={operation === "on-off" || mode === "leaders"} onChange={(value,items)=>{retainResolvedScope();setTogether(value);remember(items);}} />
        {operation !== "on-off" && mode !== "leaders" && <EntityField {...pickerScope} label="Apart players" value={apart} multiple max={5-splitIds(together).length} excludedIds={splitIds(together)} onChange={(value,items)=>{retainResolvedScope();setApart(value);remember(items);}} />}
      </>}
    </div>
    {error && <div role="alert"><GatedNote why={error} action={<button className="button" onClick={()=>setRetry(value=>value+1)}>Retry</button>}>Shared-floor query unavailable.</GatedNote></div>}
    {issue && ready && <div role="alert"><GatedNote>{issue}</GatedNote></div>}
    {!ready && !exampleState.loading && !exampleState.error && <GatedNote>Choose players to compare observed floor exposure.</GatedNote>}
    {busy && <TemplateSkeleton template="compare" />}
    {results.length > 1 && <GatedNote why="Selected-player leaders only, ordered by eligible NET difference. Missing differences remain unranked. This is not a league-wide or causal player-quality ranking.">Selected-player leaders · eligible NET difference.</GatedNote>}
    {results.map(result => <article className="panel floor-result" key={result.evidence_hash}>
      <CompareLayout sides={[
        <div key="selected" className="fo11-conditions"><TeamIdentity team={result.request.team_id} size="lg" subtitle="Selected conditions" />{result.request.together.concat(result.request.exact_unit).map(id=><PlayerIdentity key={id} playerId={id} name={name(id)} team={result.request.team_id} size="lg" />)}{result.request.apart.map(id=><PlayerIdentity key={id} playerId={id} name={name(id)} team={result.request.team_id} subtitle="Absent" />)}</div>,
        <TeamIdentity key="complement" team={result.request.team_id} size="lg" subtitle="Logical complement" />
      ]}>
      <h2>{result.operation === "on-off" ? "On/Off" : "WOWY"} · {result.request.together.concat(result.request.exact_unit).map(name).join(", ")}</h2>
      <p role="status">Source coverage: <strong>{result.coverage_status}</strong> · {result.observed_games} / {result.expected_games} finalized games reconstructed</p>
      <ComparisonRows names={["Selected raw","Complement raw"]} rows={result.shifts.map(shift=>({key:shift.metric,label:shift.metric.replaceAll("_"," "),a:shift.selected_value,b:shift.complement_value,formattedA:floorNumber(shift.selected_value),formattedB:floorNumber(shift.complement_value)}))} />
      <ExposureTable cells={result.cells} name={name} />
      <div className="floor-scroll" role="region" aria-label="Descriptive metric differences" tabIndex={0}><table className="data-table"><caption>Selected minus logical complement · descriptive differences</caption><thead><tr><th>Metric</th><th className="num">Selected raw</th><th className="num">Complement raw</th><th className="num">Eligible difference</th><th className="num">Approximate 95% interval / reason</th></tr></thead><tbody>{result.shifts.map(s => <tr key={s.metric}><th scope="row">{s.metric}</th><td className="num">{floorNumber(s.selected_value)}</td><td className="num">{floorNumber(s.complement_value)}</td><td className="num">{floorNumber(s.difference)}</td><td className="num">{floorInterval(s.interval)}</td></tr>)}</tbody></table></div>
      <details><summary>All disjoint presence/absence partitions ({result.partitions.length})</summary><ExposureTable cells={result.partitions} name={name} /></details>
      <details><summary>Metric support, event totals and uncertainty</summary>{result.cells.map(cell => <div key={cell.key}><h3>{cell.key}</h3><div className="floor-scroll" role="region" aria-label="Metric support table" tabIndex={0}><table className="data-table"><thead><tr><th>Metric</th><th className="num">Raw rate</th><th className="num">Valid possessions</th><th className="num">Valid stints</th><th className="num">Approximate 95% interval / reason</th></tr></thead><tbody>{Object.entries(cell.raw_metrics).map(([metric, value]) => <tr key={metric}><th scope="row">{metric}</th><td className="num">{floorNumber(value)}</td><td className="num">{floorNumber(cell.metric_denominators[metric])}</td><td className="num">{cell.metric_valid_stints[metric] ?? "—"}</td><td className="num">{floorInterval(cell.intervals[metric])}</td></tr>)}</tbody></table></div><p>Observed focal event totals: {Object.entries(cell.event_totals).map(([metric, value]) => `${metric}: ${floorNumber(value)}`).join(" · ") || "No focal production requested"}</p></div>)}</details>
      <GatedNote why={<>
        {result.coverage_status === "source_blocked" && <p>No admitted shared-floor exposure in this scope. Real analytics are unavailable; missing values are shown as —.</p>}
        <p>All together players must be present; all apart players must be absent. The complement means the predicate fails. A 2–4-player unit allows other teammates; five players specify the full lineup. Conditions apply to this team. Focal players stay on court in both stat-shift splits.</p>
        <p>Shared-floor queries use season/date bounds. Box-score last-X windows do not apply. Default gates: 100 offensive and defensive possessions and 5 games per cell. Raw estimates remain visible below gates. No shrinkage or prior is applied; no leverage filter is applied. Each query is bounded to 20,000 stints.</p>
        <p>Approximate game-cluster uncertainty requires 10 valid games per split. These are descriptive estimates under independent-game assumptions. They are not calibrated prediction intervals or causal effects.</p>
        {result.disclosures.map(disclosure=><p key={disclosure}>{disclosure}</p>)}
      </>}>{result.coverage_status === "source_blocked" ? "No admitted exposure in this scope." : `Raw estimates · ${result.request.min_possessions} possessions and ${result.request.min_games} games per cell.`}</GatedNote>
      <div className="floor-actions"><button className="button" onClick={()=>setPinned(result)}>Pin for comparison</button><Link className="button" href={floorUrl(path,result.operation,resolvedFloorRequest(result))}>Reopen this resolved query</Link></div>
      {pinned && <div><h3>Pinned operation comparison</h3>{comparableFloorResults(pinned, result) ? <p>Pinned eligible differences: {pinned.shifts.map(s => `${s.metric}: ${floorNumber(s.difference)}`).join(" · ")}. Current eligible differences are displayed above. No statistical interval for a difference between separate queries is claimed.<br />Pinned conditions: {JSON.stringify({ together: pinned.request.together, apart: pinned.request.apart, unit: pinned.request.exact_unit })}</p> : <p>Comparison unavailable: operation, team, focal player, release, dates, phase and gates must match.</p>}<button onClick={() => setPinned(null)}>Clear pinned comparison</button></div>}
      </CompareLayout>
    </article>)}
  </PageShell>;
}

export function ExposureTable({ cells, name }: { cells: FloorCell[]; name: (id: string) => string }) {
  return <div className="floor-scroll" role="region" aria-label="Exposure metrics" tabIndex={0}><table className="data-table"><caption>Observed exposure and raw team ratings per 100 directional possessions</caption><thead><tr><th>Cell / conditions</th><th className="num">Games</th><th className="num">Stints</th><th className="num">Minutes</th><th className="num">Off. poss.</th><th className="num">Def. poss.</th><th className="num">Points</th><th className="num">Allowed</th><th className="num">ORTG</th><th className="num">DRTG</th><th className="num">NET</th><th>Sample gate</th></tr></thead><tbody>{cells.map(cell => <tr key={cell.key}><th scope="row">{cell.key}{cell.present.length > 0 && <div>Present: {cell.present.map(name).join(", ")}</div>}{cell.absent.length > 0 && <div>Absent: {cell.absent.map(name).join(", ")}</div>}</th><td className="num">{cell.games}</td><td className="num">{cell.stints}</td><td className="num">{floorNumber(cell.minutes)}</td><td className="num">{floorNumber(cell.offensive_possessions)}</td><td className="num">{floorNumber(cell.defensive_possessions)}</td><td className="num">{cell.points ?? "—"}</td><td className="num">{cell.points_allowed ?? "—"}</td><td className="num">{floorNumber(cell.raw_metrics.offensive_rating)}</td><td className="num">{floorNumber(cell.raw_metrics.defensive_rating)}</td><td className="num">{floorNumber(cell.raw_metrics.net_rating)}</td><td>{cell.sample_status}<div>{cell.reason}</div></td></tr>)}</tbody></table></div>;
}
