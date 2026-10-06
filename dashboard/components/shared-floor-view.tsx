"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { runSharedFloor } from "@/lib/workbench-api";
import { CatalogScopeFields } from "./catalog-scope-fields";
import { EntityField } from "./entity-picker";
import { comparableFloorResults, floorCsv, floorInterval, floorNumber, floorUrl, resolvedFloorRequest, validateFloorRequest } from "@/lib/shared-floor";
import type { FloorCell, FloorOperation, FloorRequest, FloorResponse } from "@/lib/shared-floor";

const splitIds = (value: string) => value.split(/[\s,]+/).filter(Boolean);
function download(text: string, name: string, type: string) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const link = document.createElement("a"); link.href = url; link.download = name; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function SharedFloorView({ initialOperation = "wowy", statsPreset = false }: { initialOperation?: FloorOperation; statsPreset?: boolean }) {
  const params = useSearchParams();
  const path = usePathname();
  const op = params.get("operation");
  const [operation, setOperation] = useState<FloorOperation>(initialOperation === "stat-shift" ? initialOperation : op === "on-off" ? op : initialOperation);
  const [mode, setMode] = useState<"team" | "leaders" | "unit">(params.has("exact_unit") ? "unit" : "team");
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
  const [previousUrl,setPreviousUrl] = useState(params.toString());
  if(params.toString() !== previousUrl) {
    setPreviousUrl(params.toString());
    const ownUrl = results.length === 1 ? floorUrl(path,results[0].operation,resolvedFloorRequest(results[0])).split("?")[1] + (statsPreset ? "&preset=onoff" : "") : null;
    setTeam(params.get("team_id") || params.get("teamId") || "TOR");
    setTogether(params.get("together") || "");setApart(params.get("apart") || "");setUnit(params.get("exact_unit") || "");setFocal(params.get("player_id") || "");
    setRelease(params.get("release_id") || params.get("releaseId") || "");setSeason(params.get("season") || "");setPhase(params.get("phase") || "");setBefore(params.get("before_date") || params.get("beforeDate") || "");setLower(params.get("lower_date") || "");
    if(params.toString() !== ownUrl) {setResults([]);setError("");setBusy(false);setMode(params.has("exact_unit") ? "unit" : "team");}
  }
  const active = useRef<AbortController | null>(null);
  useEffect(() => () => active.current?.abort(), []);
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
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
    try {
      const next: FloorResponse[] = [];
      if (mode === "leaders") {
        // At most five explicit candidates; sequential requests pin the first resolved release.
        let bound = req;
        for (const id of req.together) {
          const result = await runSharedFloor("on-off", { ...bound, together: [id] }, controller.signal);
          if (controller.signal.aborted) return;
          next.push(result); bound = { ...resolvedFloorRequest(result), together: req.together };
        }
        next.sort((a, b) => {
          const delta = (r: FloorResponse) => r.shifts.find(s => s.metric === "net_rating")?.difference;
          return (delta(b) ?? -Infinity) - (delta(a) ?? -Infinity);
        });
      } else next.push(await runSharedFloor(operation, req, controller.signal));
      if (controller.signal.aborted) return;
      setResults(next);
      if (next.length === 1) window.history.replaceState(null, "", floorUrl(path, next[0].operation, resolvedFloorRequest(next[0])) + (statsPreset ? "&preset=onoff" : ""));
    } catch (err) { if (!controller.signal.aborted) setError(err instanceof Error ? err.message : "Shared-floor request failed"); }
    finally { if (!controller.signal.aborted) setBusy(false); }
  }
  const name = (id: string) => names[id] ?? "Selected player";
  const pickerScope = {releaseId: release || null, season: season || null, phase: phase || null, beforeDate: before || null};
  const remember = (items: import("@/lib/types").LookupItem[]) => setNames(previous => ({...previous,...Object.fromEntries(items.map(item=>[item.canonical_id,item.display_name]))}));
  return <div className="workbench-content shared-floor">
    <div className="page-header"><div><h1 className="page-title">{operation === "stat-shift" ? "Teammate stat-line shift" : statsPreset ? "Stats · On/off" : "WOWY · Shared floor"}</h1>
      <p className="page-subtitle">Observed lineup exposure, raw rates and descriptive differences.</p></div>
      <Link href={operation === "stat-shift" ? "/wowy" : "/stat-line-shift"}>{operation === "stat-shift" ? "WOWY" : "Teammate shifts"}</Link>
      {statsPreset && <Link href="/stats">Box-score presets</Link>}
    </div>
    <form onSubmit={submit} className="table-card floor-form">
      <div className="floor-controls">
        {initialOperation === "wowy" && <label>Operation<select value={operation} onChange={e => { setOperation(e.target.value as FloorOperation); setMode("team"); }}><option value="wowy">WOWY</option><option value="on-off">On/off</option></select></label>}
        {operation === "wowy" && <label>View<select value={mode} onChange={e => setMode(e.target.value as typeof mode)}><option value="team">Team sets</option><option value="leaders">Selected-player leaders (max 5)</option><option value="unit">2–5-player unit</option></select></label>}
        <EntityField {...pickerScope} label="Team" kind="team" value={team} required onChange={setTeam} />
        <CatalogScopeFields release={release || undefined} season={season} phase={phase} before={before} onSeason={setSeason} onPhase={setPhase} onBefore={setBefore} />
        <label>From date (inclusive)<input type="date" value={lower} onChange={e => setLower(e.target.value)} /></label>
        <label>Release ID<input placeholder="Published default" value={release} onChange={e => setRelease(e.target.value)} /></label>
        <label>Minimum possessions<input type="number" min="1" max="10000" step="any" value={possessions} onChange={e => setPossessions(e.target.value)} /></label>
        <label>Minimum games<input type="number" min="1" max="82" value={games} onChange={e => setGames(e.target.value)} /></label>
      </div>
      <div className="floor-controls">
        {operation === "stat-shift" && <EntityField {...pickerScope} label="Focal player" value={focal} required onChange={(value,items)=>{setFocal(value);remember(items);}} />}
        {mode === "unit" ? <EntityField {...pickerScope} label="Exact unit" value={unit} multiple max={5} required onChange={(value,items)=>{setUnit(value);remember(items);}} /> : <>
          <EntityField {...pickerScope} label={mode === "leaders" ? "Candidate players" : "Together players"} value={together} multiple={operation !== "on-off"} max={mode === "leaders" ? 5 : 5-splitIds(apart).length} excludedIds={operation === "on-off" || mode === "leaders" ? [] : splitIds(apart)} required={operation === "on-off" || mode === "leaders"} onChange={(value,items)=>{setTogether(value);remember(items);}} />
          {operation !== "on-off" && mode !== "leaders" && <EntityField {...pickerScope} label="Apart players" value={apart} multiple max={5-splitIds(together).length} excludedIds={splitIds(together)} onChange={(value,items)=>{setApart(value);remember(items);}} />}
        </>}
      </div>
      <p className="text-muted">All together players must be present; all apart players must be absent. The complement means the predicate fails. A 2–4-player unit allows other teammates; five players specify the full lineup. Conditions apply to this team. Focal players stay on court in both stat-shift splits.</p>
      <p className="text-muted">Shared-floor queries use season/date bounds. Box-score last-X windows do not apply. Default gates: 100 offensive and defensive possessions and 5 games per cell. Raw estimates remain visible below gates. No shrinkage or prior is applied; no leverage filter is applied. Each query is bounded to 20,000 stints.</p>
      <button className="control-pill active" disabled={busy}>{busy ? "Calculating…" : "Run shared-floor analysis"}</button>
    </form>
    {error && <p className="notice-box" role="alert">{error}</p>}
    <div aria-live="polite">{busy && <p>Loading observed exposure…</p>}</div>
    {results.length > 0 && <div className="floor-actions">
      <button onClick={() => download(JSON.stringify({ schema: "courtload-shared-floor-evidence-v1", results, pinned_comparison: pinned }, null, 2), "shared-floor-evidence.json", "application/json")}>Save evidence JSON</button>
      <button onClick={() => download(floorCsv(results), "shared-floor.csv", "text/csv")}>Export cell metrics CSV</button>
      {results.length === 1 && <button onClick={() => setPinned(results[0])}>Pin for comparison</button>}
      <p className="text-muted">Downloads contain the displayed operation results. JSON includes requests, resolved context, partitions, shifts, hashes and any pinned comparison. Saved evidence is a local file.</p>
    </div>}
    {results.length > 1 && <p>Selected-player leaders only, ordered by eligible NET difference. Missing differences remain unranked. This is not a league-wide or causal player-quality ranking.</p>}
    {results.map(result => <article className="table-card floor-result" key={result.evidence_hash}>
      <h2>{result.operation} · {result.request.team_id} · {result.request.together.concat(result.request.exact_unit).map(name).join(", ")}{result.request.apart.length > 0 && ` · absent: ${result.request.apart.map(name).join(", ")}`}</h2>
      <p role="status">Source coverage: <strong>{result.coverage_status}</strong> · {result.observed_games} / {result.expected_games} finalized games reconstructed · {result.excluded_stints} excluded stints</p>
      {result.coverage_status === "source_blocked" && <p className="notice-box">No admitted shared-floor exposure in this scope. Real analytics are unavailable; missing values are shown as —.</p>}
      <p>Resolved scope: {String(result.context.season)} · {String(result.context.phase)} · before {String(result.context.before_date)}{result.request.lower_date && ` · from ${result.request.lower_date}`} · release {String(result.context.release_id)}</p>
      <p>Applied gates: {result.request.min_possessions} possessions in each direction and {result.request.min_games} games. Raw estimates; no prior or shrinkage.</p>
      <ExposureTable cells={result.cells} name={name} />
      <div className="floor-scroll"><table className="data-table"><caption>Selected minus logical complement · descriptive differences</caption><thead><tr><th>Metric</th><th>Selected raw</th><th>Complement raw</th><th>Eligible difference</th><th>Approximate 95% interval / reason</th></tr></thead><tbody>{result.shifts.map(s => <tr key={s.metric}><th scope="row">{s.metric}</th><td>{floorNumber(s.selected_value)}</td><td>{floorNumber(s.complement_value)}</td><td>{floorNumber(s.difference)}</td><td>{floorInterval(s.interval)}</td></tr>)}</tbody></table></div>
      <details><summary>All disjoint presence/absence partitions ({result.partitions.length})</summary><ExposureTable cells={result.partitions} name={name} /></details>
      <details><summary>Metric support, event totals and uncertainty</summary>{result.cells.map(cell => <div key={cell.key}><h3>{cell.key}</h3><div className="floor-scroll"><table className="data-table"><thead><tr><th>Metric</th><th>Raw rate</th><th>Valid possessions</th><th>Valid stints</th><th>Approximate 95% interval / reason</th></tr></thead><tbody>{Object.entries(cell.raw_metrics).map(([metric, value]) => <tr key={metric}><th scope="row">{metric}</th><td>{floorNumber(value)}</td><td>{floorNumber(cell.metric_denominators[metric])}</td><td>{cell.metric_valid_stints[metric] ?? "—"}</td><td>{floorInterval(cell.intervals[metric])}</td></tr>)}</tbody></table></div><p>Observed focal event totals: {Object.entries(cell.event_totals).map(([metric, value]) => `${metric}: ${floorNumber(value)}`).join(" · ") || "No focal production requested"}</p></div>)}</details>
      <p>Approximate game-cluster uncertainty requires 10 valid games per split. These are descriptive estimates under independent-game assumptions. They are not calibrated prediction intervals or causal effects.</p>
      {result.disclosures.map(disclosure => <p className="text-muted" key={disclosure}>{disclosure}</p>)}
      <details><summary>Operation identity and evidence</summary><p>{result.operation_version}</p><p className="floor-hash">Input: {result.input_hash}<br />Evidence: {result.evidence_hash}</p><pre>{JSON.stringify(result.context, null, 2)}</pre><Link href={floorUrl(path, result.operation, resolvedFloorRequest(result)) + (statsPreset ? "&preset=onoff" : "")}>Reopen this resolved query</Link></details>
      {pinned && <div><h3>Pinned operation comparison</h3>{comparableFloorResults(pinned, result) ? <p>Pinned eligible differences: {pinned.shifts.map(s => `${s.metric}: ${floorNumber(s.difference)}`).join(" · ")}. Current eligible differences are displayed above. No statistical interval for a difference between separate queries is claimed.<br />Pinned conditions: {JSON.stringify({ together: pinned.request.together, apart: pinned.request.apart, unit: pinned.request.exact_unit })}<br />Pinned evidence: <span className="floor-hash">{pinned.evidence_hash}</span></p> : <p>Comparison unavailable: operation, team, focal player, release, dates, phase and gates must match.</p>}<button onClick={() => setPinned(null)}>Clear pinned comparison</button></div>}
    </article>)}
  </div>;
}

function ExposureTable({ cells, name }: { cells: FloorCell[]; name: (id: string) => string }) {
  return <div className="floor-scroll"><table className="data-table"><caption>Observed exposure and raw team ratings per 100 directional possessions</caption><thead><tr><th>Cell / conditions</th><th>Games</th><th>Stints</th><th>Minutes</th><th>Off. poss.</th><th>Def. poss.</th><th>Points</th><th>Allowed</th><th>ORTG</th><th>DRTG</th><th>NET</th><th>Sample gate</th></tr></thead><tbody>{cells.map(cell => <tr key={cell.key}><th scope="row">{cell.key}{cell.present.length > 0 && <div>Present: {cell.present.map(name).join(", ")}</div>}{cell.absent.length > 0 && <div>Absent: {cell.absent.map(name).join(", ")}</div>}</th><td>{cell.games}</td><td>{cell.stints}</td><td>{floorNumber(cell.minutes)}</td><td>{floorNumber(cell.offensive_possessions)}</td><td>{floorNumber(cell.defensive_possessions)}</td><td>{cell.points ?? "—"}</td><td>{cell.points_allowed ?? "—"}</td><td>{floorNumber(cell.raw_metrics.offensive_rating)}</td><td>{floorNumber(cell.raw_metrics.defensive_rating)}</td><td>{floorNumber(cell.raw_metrics.net_rating)}</td><td>{cell.sample_status}<div>{cell.reason}</div></td></tr>)}</tbody></table></div>;
}
