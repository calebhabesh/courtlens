"use client";
import { preserveExample } from "@/lib/example-subject";
import { ExampleSubjectCard, useExampleSubject } from "./example-subject";

import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { runSharedFloor, queryLookup } from "@/lib/workbench-api";
import { floorCsv, floorInterval, floorNumber, floorUrl, resolvedFloorRequest, validateFloorRequest, comparableFloorResults, type FloorRequest, type FloorResponse } from "@/lib/shared-floor";
import type { LookupItem } from "@/lib/types";
import { TeamGrid } from "./team-grid";
import { Modal } from "./ui/modal";
import { TeamLogo } from "./team-logo";
import { EntityField } from "./entity-picker";
import { CatalogScopeFields } from "./catalog-scope-fields";
import { ExposureTable } from "./shared-floor-view";
import { PageShell } from "./ui/page-shell";
import { PageHeader } from "./ui/panel";
import { FilterBar } from "./ui/filter-bar";
import { DataDetailsButton } from "./ui/data-details";
import { DatePicker } from "./ui/date-picker";
import { Field } from "./ui/field";
import { Input } from "./ui/input";
import { GatedNote } from "./ui/gated-note";
import { TemplateSkeleton } from "./ui/template-skeleton";
import { PlayerIdentity, TeamIdentity } from "./ui/identity";
import { formatDate, throughLabel } from "@/lib/format-date";
import { Button, ButtonLink } from "./ui/kit";

const ids = (value: string | null) => (value ?? "").split(/[\s,]+/).filter(Boolean);
function download(text: string, name: string, type: string) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const link = document.createElement("a"); link.href = url; link.download = name; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function TeamStatShiftView({ scope }: { scope: { release_id?: string; season?: string; phase?: string; before_date?: string } }) {
  const params = useSearchParams();
  const exampleState = useExampleSubject("player_id", [], "shift");
  const read = (): FloorRequest => ({ ...scope, release_id:params.get("release_id") || params.get("releaseId") || scope.release_id, season:params.get("season") || scope.season, phase:params.get("phase") || scope.phase, before_date:params.get("before_date") || params.get("beforeDate") || scope.before_date, team_id: params.get("team_id") || "TOR", player_id: params.get("player_id") || "", together: ids(params.get("together")), apart: ids(params.get("apart")), exact_unit: [], min_games: Number(params.get("min_games") ?? 5), min_possessions: Number(params.get("min_possessions") ?? 100), lower_date: params.get("lower_date") || undefined });
  const [query, setQuery] = useState<FloorRequest>(read);
  const [teamPicker,setTeamPicker] = useState(false);
  const [names, setNames] = useState<Record<string, string>>({});
  const [result, setResult] = useState<FloorResponse | null>(null);
  const [pinned, setPinned] = useState<FloorResponse | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [retry, setRetry] = useState(0);
  const active = useRef<AbortController | null>(null);
  const [ownUrl,setOwnUrl] = useState(params.toString());
  const [previousUrl, setPreviousUrl] = useState(params.toString());
  if (previousUrl !== params.toString()) {
    setPreviousUrl(params.toString());
    if (params.toString() !== ownUrl) { setQuery(read()); setResult(null); setError(""); }
  }
  const currentQuery = useRef(query);
  useEffect(() => {currentQuery.current = query;},[query]);
  function change(next: Partial<FloorRequest>) {
    exampleState.cancelDefault();
    active.current?.abort(); setResult(null); setBusy(false); setError("");
    const value = { ...currentQuery.current, ...next }; currentQuery.current = value; setQuery(value);
    const url = preserveExample(floorUrl("/stat-line-shift", "stat-shift", value),window.location.search);
    setOwnUrl(url.split("?")[1] ?? "");
    window.history.replaceState(null, "", url);
  }
  const issue = validateFloorRequest("stat-shift", query);
  const ready = Boolean(query.team_id && query.player_id && (query.together.length || query.apart.length));
  useEffect(() => {
    if (!ready || issue) return;
    const controller = new AbortController(); active.current = controller;
    const timer = setTimeout(() => {
      setBusy(true); setError(""); setResult(null);
      runSharedFloor("stat-shift", query, controller.signal).then(data => { if (!controller.signal.aborted) setResult(data); })
        .catch(err => { if (!controller.signal.aborted) setError(err instanceof Error ? err.message : "Shared-floor request failed"); })
        .finally(() => { if (!controller.signal.aborted) setBusy(false); });
    }, 200);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [query, ready, issue, retry]);
  const remember = (items: LookupItem[]) => setNames(previous => ({ ...previous, ...Object.fromEntries(items.map(item => [item.canonical_id, item.display_name])) }));
  const subject = query.player_id;
  useEffect(() => {
    if (!subject) return;
    const abort=new AbortController();
    queryLookup({query:subject,releaseId:query.release_id,season:query.season,phase:query.phase,beforeDate:query.before_date,kinds:["player"],limit:1,signal:abort.signal}).then(data => {
      const item=data.items.find(item => item.canonical_id === subject);
      if(item && !abort.signal.aborted)setNames(previous => ({...previous,[subject]:item.display_name}));
    }).catch(() => {});
    return () => abort.abort();
  },[subject,query.release_id,query.season,query.phase,query.before_date]);
  const name = (id: string) => names[id] ?? "Selected player";
  const pickerScope = { releaseId: query.release_id || null, season: query.season || null, phase: query.phase || null, beforeDate: query.before_date || null };
  return <PageShell template="compare" className="shared-floor team-stat-shift">
    <PageHeader title="Teammate Stat Shift" subtitle="Descriptive production with and without selected teammates." actions={<>
      <ButtonLink size="lg" href={floorUrl("/wowy", "wowy", { ...query, player_id: undefined })}>WOWY</ButtonLink>
      {result && <Button size="lg" onClick={() => download(floorCsv([result]), "shared-floor.csv", "text/csv")}>Export CSV</Button>}
    </>} />
    <FilterBar summary={query.season ?? undefined} scope={<CatalogScopeFields release={query.release_id ?? undefined} season={query.season ?? ""} phase={query.phase ?? ""} before={query.before_date ?? ""} onSeason={season => change({ season })} onPhase={phase => change({ phase })} onBefore={before_date => change({ before_date })} />}
      filters={<>
        <Button size="lg" aria-label="Change team" onClick={() => setTeamPicker(true)}><TeamLogo team={query.team_id} size={20} />Change Team</Button>
        <Field label="From" layout="inline"><DatePicker label="From date (inclusive)" value={query.lower_date ?? ""} onChange={lower_date => change({ lower_date })} /></Field>
        <Field label="Possessions" layout="inline"><Input aria-label="Minimum possessions" type="number" min={1} max={10000} value={query.min_possessions} onChange={e => change({ min_possessions: Number(e.target.value) })} /></Field>
        <Field label="Games" layout="inline"><Input aria-label="Minimum games" type="number" min={1} max={82} value={query.min_games} onChange={e => change({ min_games: Number(e.target.value) })} /></Field>
      </>}
      details={<DataDetailsButton scope={{ releaseId: query.release_id, season: query.season, phase: query.phase, beforeDate: query.before_date }} rows={result ? [
        { label: "Excluded stints", value: result.excluded_stints }, { label: "Resolved context", value: JSON.stringify(result.context), mono: true }, { label: "Input", value: result.input_hash, mono: true }, { label: "Evidence", value: result.evidence_hash, mono: true }, { label: "Operation version", value: result.operation_version, mono: true }, ...(pinned ? [{label:"Pinned evidence",value:pinned.evidence_hash,mono:true}] : [])
      ] : []}>
        <Field label="Release"><Input aria-label="Release" value={query.release_id ?? ""} onChange={e => change({ release_id: e.target.value || undefined })} /></Field>
        {result && <Button size="lg" onClick={() => download(JSON.stringify({ schema: "courtload-shared-floor-evidence-v1", results: [result], pinned_comparison: pinned }, null, 2), "shared-floor-evidence.json", "application/json")}>Save evidence JSON</Button>}
      </DataDetailsButton>}
    />
    <Modal isOpen={teamPicker} onClose={() => setTeamPicker(false)} title="Choose a team"><TeamGrid selected={query.team_id} onSelect={team => {change({team_id:team});setTeamPicker(false);}} /></Modal>
    <ExampleSubjectCard {...exampleState} />
    <div className="shift-players">
      <EntityField {...pickerScope} label="Focal player" value={query.player_id ?? ""} required onChange={(player_id, items) => { change({ player_id }); remember(items); }} />
      <EntityField {...pickerScope} label="Together players" value={query.together.join(",")} multiple max={5 - query.apart.length} excludedIds={query.apart} onChange={(value, items) => { change({ together: ids(value) }); remember(items); }} />
      <EntityField {...pickerScope} label="Apart players" value={query.apart.join(",")} multiple max={5 - query.together.length} excludedIds={query.together} onChange={(value, items) => { change({ apart: ids(value) }); remember(items); }} />
    </div>
    {!ready && <GatedNote why="The focal player stays on court in both splits. All together players must be present; all apart players must be absent. The complement means the predicate fails.">Choose a focal player and at least one teammate.</GatedNote>}
    {ready && issue && <div role="alert"><GatedNote>{issue}</GatedNote></div>}
    {error && <div role="alert"><GatedNote why={error} action={<Button size="lg" onClick={() => setRetry(value => value + 1)}>Retry</Button>}>Teammate shifts are unavailable.</GatedNote></div>}
    {busy && <TemplateSkeleton template="compare" />}
    {result && <article className="panel floor-result">
      <div className="shift-subjects"><PlayerIdentity playerId={query.player_id ?? undefined} name={name(query.player_id ?? "")} /><TeamIdentity team={query.team_id} /></div>
      <h2>Observed Stat Shift</h2>
      <p role="status">Source coverage: {result.coverage_status} · {result.observed_games} / {result.expected_games} finalized games reconstructed</p>
      <GatedNote why={<>
        {result.coverage_status === "source_blocked" && <p>No admitted shared-floor exposure in this scope. Real analytics are unavailable; missing values are shown as —.</p>}
        <p>Shared-floor queries use season/date bounds. Box-score last-X windows do not apply. Raw estimates remain visible below gates. No shrinkage or prior is applied; no leverage filter is applied. Each query is bounded to 20,000 stints.</p>
        <p>All together players must be present; all apart players must be absent. The complement means the predicate fails. Focal players stay on court in both stat-shift splits.</p>
        <p>Approximate game-cluster uncertainty requires 10 valid games per split. These are descriptive estimates under independent-game assumptions. They are not calibrated prediction intervals or causal effects.</p>
        {result.disclosures.map(text => <p key={text}>{text}</p>)}
      </>}>{result.coverage_status === "source_blocked" ? "No admitted exposure in this scope." : `Raw rates · ${query.min_possessions} possessions and ${query.min_games} games per split · ${throughLabel(String(result.context.before_date))}`}</GatedNote>
      <div className="floor-scroll" role="region" aria-label="Production differences" tabIndex={0}><table className="data-table"><caption>Selected minus logical complement · descriptive differences</caption><thead><tr><th>Metric</th><th>Selected raw</th><th>Complement raw</th><th>Eligible difference</th><th>Approximate 95% interval / reason</th></tr></thead><tbody>{result.shifts.map(s => <tr key={s.metric}><th scope="row">{s.metric.replaceAll("_", " ")}</th><td>{floorNumber(s.selected_value)}</td><td>{floorNumber(s.complement_value)}</td><td>{floorNumber(s.difference)}</td><td>{floorInterval(s.interval)}</td></tr>)}</tbody></table></div>
      <ExposureTable cells={result.cells} name={name} />
      <details><summary>All disjoint presence/absence partitions ({result.partitions.length})</summary><ExposureTable cells={result.partitions} name={name} /></details>
      <details><summary>Metric support, event totals and uncertainty</summary>{result.cells.map(cell => <div key={cell.key}><h3>{cell.key}</h3><div className="floor-scroll" role="region" aria-label={`${cell.key} metric support`} tabIndex={0}><table className="data-table"><thead><tr><th>Metric</th><th>Raw rate</th><th>Valid possessions</th><th>Valid stints</th><th>Approximate 95% interval / reason</th></tr></thead><tbody>{Object.entries(cell.raw_metrics).map(([metric, value]) => <tr key={metric}><th scope="row">{metric}</th><td>{floorNumber(value)}</td><td>{floorNumber(cell.metric_denominators[metric])}</td><td>{cell.metric_valid_stints[metric] ?? "—"}</td><td>{floorInterval(cell.intervals[metric])}</td></tr>)}</tbody></table></div><p>Observed focal event totals: {Object.entries(cell.event_totals).map(([metric, value]) => `${metric}: ${floorNumber(value)}`).join(" · ") || "No focal production requested"}</p></div>)}</details>
      <div className="table-actions-group"><Button size="lg" onClick={() => setPinned(result)}>Pin for comparison</Button><ButtonLink size="lg" href={floorUrl("/stat-line-shift", "stat-shift", resolvedFloorRequest(result))}>Reopen this resolved query</ButtonLink></div>
      {pinned && <GatedNote action={<Button size="lg" onClick={() => setPinned(null)}>Clear pinned comparison</Button>} why={<>Pinned conditions: {JSON.stringify({ together: pinned.request.together, apart: pinned.request.apart, unit: pinned.request.exact_unit })}. No statistical interval for a difference between separate queries is claimed.</>}>{comparableFloorResults(pinned, result) ? `Pinned eligible differences: ${pinned.shifts.map(s => `${s.metric}: ${floorNumber(s.difference)}`).join(" · ")}` : "Comparison unavailable: operation, team, focal player, release, dates, phase and gates must match."}</GatedNote>}
      <span className="sr-only">{query.lower_date ? `From ${formatDate(query.lower_date)}` : "Season to date"}</span>
    </article>}
  </PageShell>;
}
