"use client";
import { preserveExample } from "@/lib/example-subject";
import { ExampleSubjectCard, useExampleSubject } from "./example-subject";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { queryLookup, runShooting } from "@/lib/workbench-api";
import { CatalogScopeFields } from "./catalog-scope-fields";
import { PlayerLookup } from "./research-investigation";
import { FilterBar } from "./ui/filter-bar";
import { DataDetailsButton } from "./ui/data-details";
import { Field } from "./ui/field";
import { DatePicker } from "./ui/date-picker";
import { GatedNote } from "./ui/gated-note";
import { ResearchLayout } from "./ui/page-shell";
import { StatTile } from "./ui/stat-tile";
import { TemplateSkeleton } from "./ui/template-skeleton";
import { formatDate, throughLabel } from "@/lib/format-date";
import { humanLabel } from "@/lib/route-availability";
import type { LookupItem } from "@/lib/types";
import type { ShotProfile, ShootingInput, ShootingOperation, ShootingResponse } from "@/lib/shooting-types";
import { courtPosition, resolvedShooting, shootingCsv, shootingNumber as n, shootingPercent as pct, shootingUrl, validateShooting } from "@/lib/shooting";
import { Button, ButtonLink, Segmented } from "./ui/kit";

const titles: Record<ShootingOperation, string> = { "shot-profile": "Shooting Profile", "shot-profile-peers": "Shot-Profile Twins", matchups: "Source Assignment Matchups", "shot-aftermath": "Shot aftermath" };
function download(text: string, name: string, type: string) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const link = document.createElement("a"); link.href = url; link.download = name; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function readQuery(params: URLSearchParams): ShootingInput {
  return {
    player_id: params.get("player_id") || params.get("playerId") || "", defender_id: null,
    release_id: params.get("release_id") || params.get("releaseId") || null, season: params.get("season"),
    phase: params.get("phase") as ShootingInput["phase"], before_date: params.get("before_date") || params.get("beforeDate"),
    lower_date: params.get("lower_date"), min_attempts: Number(params.get("min_attempts") ?? 100),
    min_games: Number(params.get("min_games") ?? 5), limit: Number(params.get("limit") ?? 10)
  };
}
function Zones({ profile, name }: { profile: ShotProfile; name: string }) {
  return <div className="floor-scroll" tabIndex={0} role="region" aria-label={`Zone profile ${name}`}><table className="data-table"><caption>{name} · {humanLabel(profile.sample_status)} · {profile.games} games · {profile.located_attempts} located / {profile.unknown_attempts} unknown attempts</caption><thead><tr><th scope="col">Zone</th><th scope="col" className="num">Attempts</th><th scope="col" className="num">Makes</th><th scope="col" className="num">Points</th><th scope="col" className="num">FG%</th><th scope="col" className="num">All-attempt share</th><th scope="col" className="num">Located-attempt share</th></tr></thead><tbody>{profile.zones.map(z => <tr key={z.zone}><th scope="row">{z.zone}</th><td className="num">{z.attempts}</td><td className="num">{z.makes}</td><td className="num">{z.points}</td><td className="num">{pct(z.fg_pct)}</td><td className="num">{pct(z.attempt_share)}</td><td className="num">{pct(z.zone === "Unknown" || !profile.located_attempts ? null : z.attempts / profile.located_attempts)}</td></tr>)}</tbody></table></div>;
}
const SHOOTING_LIMITS = <>
  <p>Blank scope fields resolve through the retained release. Profile/peer gates use located attempts; aftermath gates use mapped anchors per branch. Assignment exposure is descriptive. Dense league scopes can exceed the 50,000-row input bound: narrow the dates.</p>
  <p>Verified source video unavailable. An observed event does not establish an available clip.</p>
  <p>No data is acquired by this workspace.</p>
</>;

/**
 * Shot Profile (Similar Players) and Shot Aftermath (Shooting) tab bodies on the Research
 * template. Valid queries run automatically (D6); superseded or cancelled responses are ignored.
 */
export function ShootingView({ initialOperation = "shot-profile-peers" }: { initialOperation?: ShootingOperation; embedded?: boolean }) {
  const params = useSearchParams(), path = usePathname();
  const exampleState = useExampleSubject("player_id", ["playerId"]);
  const toggles = initialOperation === "shot-profile-peers";
  const readOperation = (): ShootingOperation => toggles && params.get("operation") === "shot-profile" ? "shot-profile" : initialOperation;
  const [operation, setOperation] = useState<ShootingOperation>(readOperation);
  const [query, setQuery] = useState<ShootingInput>(() => readQuery(params));
  const [result, setResult] = useState<ShootingResponse | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [cancelled, setCancelled] = useState(false);
  const [retry, setRetry] = useState(0);
  const [identities, setIdentities] = useState<Record<string, LookupItem>>({});
  const [zone, setZone] = useState("");
  const [team, setTeam] = useState("");
  const [selectedPeer, setSelectedPeer] = useState("");
  const [shotPage, setShotPage] = useState(0);
  const [anchorPage, setAnchorPage] = useState(0);
  const [selectedShot, setSelectedShot] = useState<number | null>(null);
  const [previous, setPrevious] = useState(params.toString());
  const [ownUrl, setOwnUrl] = useState(params.toString());
  // Reconcile navigation during render so back/forward and peer links use their URL scope;
  // our own URL replacements keep the current result.
  if (previous !== params.toString()) {
    setPrevious(params.toString());
    if (params.toString() !== ownUrl) { setQuery(readQuery(params)); setOperation(readOperation()); setResult(null); setError(""); setCancelled(false); }
  }
  const active = useRef<AbortController | null>(null);
  const court = useRef<SVGSVGElement | null>(null);
  function change(next: Partial<ShootingInput>, nextOperation = operation) {
    exampleState.cancelDefault();
    active.current?.abort(); setResult(null); setBusy(false); setError(""); setCancelled(false); setOperation(nextOperation);
    // Keep the scope an initially default query resolved to, so a later filter change cannot
    // silently move it to another release or cutoff.
    const resolved = result ? resolvedShooting(result) : null;
    setQuery(prev => ({ ...prev, release_id: prev.release_id || resolved?.release_id || null, season: prev.season || resolved?.season || null, phase: prev.phase || resolved?.phase || null, before_date: prev.before_date || resolved?.before_date || null, ...next }));
  }
  const issue = validateShooting(query);
  useEffect(() => {
    const controller = new AbortController(); active.current = controller;
    const timer = setTimeout(() => {
      const url = preserveExample(shootingUrl(path, operation, query),window.location.search); setOwnUrl(url.split("?")[1] ?? ""); window.history.replaceState(null, "", url);
      if (!query.player_id || issue || cancelled) return;
      setBusy(true); setError(""); setResult(null);
      runShooting(operation, query, controller.signal).then(data => {
        if (controller.signal.aborted) return;
        setResult(data); setZone(""); setTeam(""); setSelectedPeer(""); setSelectedShot(null); setShotPage(0); setAnchorPage(0);
        const resolved = preserveExample(shootingUrl(path, data.operation, resolvedShooting(data)),window.location.search); setOwnUrl(resolved.split("?")[1] ?? ""); window.history.replaceState(null, "", resolved);
      }).catch(err => { if (!controller.signal.aborted) setError(err instanceof Error ? err.message : "Shooting request failed"); })
        .finally(() => { if (!controller.signal.aborted) setBusy(false); });
    }, 200);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [query, operation, issue, cancelled, retry, path]);
  const ids = [query.player_id, ...(result?.peers.map(p => p.profile.player_id) ?? [])].filter(Boolean).join(",");
  useEffect(() => {
    const controller = new AbortController();
    for (const id of new Set(ids.split(",").filter(Boolean))) queryLookup({ query: id, releaseId: query.release_id, season: query.season, phase: query.phase, beforeDate: query.before_date, kinds: ["player"], limit: 1, signal: controller.signal }).then(data => { const item = data.items.find(item => item.canonical_id === id); if (item && !controller.signal.aborted) setIdentities(prev => ({ ...prev, [id]: item })); }).catch(() => {});
    return () => controller.abort();
  }, [ids, query.release_id, query.season, query.phase, query.before_date]);
  const name = (id: string) => identities[id]?.display_name ?? id;

  const shots = result?.shots.map((shot, index) => ({ shot, index })).filter(({ shot }) => (!zone || shot.zone === zone) && (!team || shot.team_id === team)) || [];
  const pageShots = shots.slice(shotPage * 100, (shotPage + 1) * 100);
  const pageAnchors = result?.anchors.slice(anchorPage * 100, (anchorPage + 1) * 100) || [];
  const peer = result?.peers.find(p => p.profile.player_id === selectedPeer);
  const fact = selectedShot == null ? null : result?.shots[selectedShot];
  const resolved = result ? resolvedShooting(result) : null;
  async function exportCourt() {
    if (!court.current || !result) return;
    const svg = court.current.cloneNode(true) as SVGSVGElement;
    const context = JSON.stringify({ ...resolvedShooting(result), display_zone: zone || "all", display_team: team || "all", display_page: shotPage + 1, evidence_hash: result.evidence_hash, coverage: result.coverage_status });
    const title = document.createElementNS("http://www.w3.org/2000/svg", "title"); title.textContent = `CourtLens shooting · normalized feet · ${context}`; svg.prepend(title);
    // Resolve semantic theme colors so the standalone SVG renders outside the app.
    const theme = getComputedStyle(court.current);
    for (const element of [svg, ...svg.querySelectorAll("*")]) for (const attr of ["stroke", "fill"]) {
      const value = element.getAttribute(attr);
      if (value?.startsWith("var(")) element.setAttribute(attr, theme.getPropertyValue(value.slice(4, -1)).trim());
      else if (value === "currentColor") element.setAttribute(attr, theme.color);
    }
    svg.removeAttribute("style");
    svg.setAttribute("viewBox", "-2 -2 54 115");
    const banner = ["CourtLens · shooting · normalized feet", `${result.context.season} · ${result.context.phase} · before ${result.context.before_date}`, `Player ${result.request.player_id} · zone ${zone || "all"} · team ${team || "all"} · page ${shotPage + 1}`, `Source ${result.coverage_status} · ${result.observed_games}/${result.expected_games} games`, `Release ${result.context.release_id}`, `Evidence ${result.evidence_hash}`];
    banner.forEach((line, index) => {
      const text = document.createElementNS("http://www.w3.org/2000/svg", "text");
      text.setAttribute("x", "0"); text.setAttribute("y", String(97 + index * 2.5)); text.setAttribute("font-size", ".85"); text.setAttribute("fill", theme.color); text.textContent = line; svg.append(text);
    });
    const background = document.createElementNS("http://www.w3.org/2000/svg", "rect");
    background.setAttribute("x", "-2"); background.setAttribute("y", "-2"); background.setAttribute("width", "54"); background.setAttribute("height", "115"); background.setAttribute("fill", theme.getPropertyValue("--surface").trim()); svg.prepend(background);
    const metadata = document.createElementNS("http://www.w3.org/2000/svg", "metadata"); metadata.textContent = context; svg.append(metadata);
    download(new XMLSerializer().serializeToString(svg), "shooting-court.svg", "image/svg+xml");
  }
  const profileOps = operation === "shot-profile" || operation === "shot-profile-peers";
  const anchors = result?.aftermath_summary.reduce((sum, b) => sum + b.anchors, 0) ?? 0;
  const findings = result && <>
    <StatTile label="Source Coverage" value={humanLabel(result.coverage_status)} footnote={`${result.observed_games.toLocaleString("en-US")} / ${result.expected_games.toLocaleString("en-US")} league games`} />
    {result.profile && <>
      <StatTile label="Attempts" value={result.profile.attempts.toLocaleString("en-US")} footnote={`${result.profile.located_attempts} located · ${result.profile.unknown_attempts} unknown`} />
      <StatTile label="FG%" value={result.profile.attempts ? pct(result.profile.makes / result.profile.attempts) : null} footnote={`${result.profile.makes} makes · ${result.profile.points} points`} />
    </>}
    {result.operation === "shot-profile-peers" && <StatTile label="Closest Peer" value={result.peers[0] ? name(result.peers[0].profile.player_id) : null} footnote={result.peers[0] ? `Distance ${result.peers[0].distance}` : "No eligible peers"} />}
    {result.operation === "shot-aftermath" && <>
      <StatTile label="Mapped Anchors" value={anchors.toLocaleString("en-US")} footnote={`${result.aftermath_summary.length} branches`} />
      <StatTile label="Censored Opponent" value={result.aftermath_summary.reduce((sum, b) => sum + b.censored_opponent, 0)} footnote="End-of-period possessions" />
    </>}
  </>;
  return <div className="research-view shared-floor shooting-workspace">
    <FilterBar summary={query.season || "Published scope"}
      scope={<CatalogScopeFields release={query.release_id ?? undefined} season={query.season ?? ""} phase={query.phase ?? ""} before={query.before_date ?? ""} onSeason={season => change({ season })} onPhase={phase => change({ phase: phase as ShootingInput["phase"] })} onBefore={before_date => change({ before_date })} />}
      filters={<>
        <PlayerLookup name={query.player_id ? name(query.player_id) : null} releaseId={query.release_id} season={query.season} phase={query.phase} beforeDate={query.before_date} onSelect={player_id => change({ player_id })} />
        <Field label="From"><DatePicker label="Lower date (inclusive)" value={query.lower_date ?? ""} onChange={lower_date => change({ lower_date: lower_date || null })} /></Field>
        <Field label="Min attempts"><input aria-label="Minimum attempts" type="number" min={1} max={10000} step={1} value={query.min_attempts} onChange={e => change({ min_attempts: Number(e.target.value) })} /></Field>
        <Field label="Min games"><input aria-label="Minimum games" type="number" min={1} max={100} step={1} value={query.min_games} onChange={e => change({ min_games: Number(e.target.value) })} /></Field>
        {operation === "shot-profile-peers" && <Field label="Peers"><input aria-label="Peer limit" type="number" min={1} max={25} value={query.limit} onChange={e => change({ limit: Number(e.target.value) })} /></Field>}
      </>}
      modes={toggles ? <Segmented<ShootingOperation> size="lg" label="Shot profile view" value={operation} onChange={op => change({}, op)} options={[{ value: "shot-profile", label: "Shooting Profile" }, { value: "shot-profile-peers", label: "Shot-Profile Twins" }]} /> : undefined}
      details={<DataDetailsButton scope={{ releaseId: query.release_id, season: query.season, phase: query.phase, beforeDate: query.before_date }} rows={result ? [
        { label: "Operation version", value: result.operation_version, mono: true }, { label: "Excluded rows", value: result.excluded_rows },
        { label: "Input", value: result.input_hash, mono: true }, { label: "Evidence", value: result.evidence_hash, mono: true },
        { label: "Sources", value: JSON.stringify(result.provenance), mono: true },
        { label: "Counts", value: JSON.stringify({ input_counts: result.input_counts, branch_counts: result.branch_counts }), mono: true },
        { label: "Resolved context", value: JSON.stringify(result.context), mono: true }
      ] : []}>
        <Field label="Release"><input aria-label="Release" value={query.release_id ?? ""} onChange={e => change({ release_id: e.target.value || null })} /></Field>
      </DataDetailsButton>} />
    {!query.player_id && !exampleState.loading && <GatedNote why={SHOOTING_LIMITS}>Choose a player to see their {operation === "shot-aftermath" ? "shot aftermath" : "shooting profile"}.</GatedNote>}
    {query.player_id && issue && <div role="alert"><GatedNote>{issue}</GatedNote></div>}
    <ExampleSubjectCard {...exampleState} />
    {error && <div role="alert"><GatedNote tone="warning" action={<Button size="lg" onClick={() => setRetry(v => v + 1)}>Retry</Button>}>Shooting analysis unavailable: {error}</GatedNote></div>}
    {cancelled && !busy && !result && <GatedNote action={<Button size="lg" onClick={() => setCancelled(false)}>Run again</Button>}>Analysis cancelled.</GatedNote>}
    {busy && <><GatedNote action={<Button size="lg" onClick={() => { active.current?.abort(); setBusy(false); setCancelled(true); }}>Cancel</Button>}>Running the shooting analysis…</GatedNote><TemplateSkeleton template="research" /></>}
    {result && resolved && <ResearchLayout findings={findings}><section className="floor-result" aria-label="Shooting result">
      <div className="research-result-head">
        <h2>{titles[result.operation]} · {name(result.request.player_id)}</h2>
        <div className="research-result-actions">
          <Button size="lg" onClick={() => download(JSON.stringify({ schema: "courtload-shooting-evidence-v1", result, display_filters: { zone, team, shot_page: shotPage + 1, anchor_page: anchorPage + 1 } }, null, 2), "shooting-evidence.json", "application/json")}>Save Evidence JSON</Button>
          <Button size="lg" onClick={() => download(shootingCsv(result), "shooting-evidence.csv", "text/csv")}>Export Evidence CSV</Button>
          {profileOps && <ButtonLink size="lg" href={shootingUrl("/matchups", "matchups", { ...resolved, defender_id: null })}>Source Assignment Matchups</ButtonLink>}
        </div>
      </div>
      <p role="status" className="research-caption">Source coverage: <strong>{humanLabel(result.coverage_status)}</strong> · {result.observed_games} / {result.expected_games} finalized league games across required inputs · {result.request.lower_date ? `From ${formatDate(result.request.lower_date)} · ` : ""}{throughLabel(String(result.context.before_date))}.</p>
      <GatedNote why={<>{result.coverage_status === "source_blocked" && <p>Real analytics are unavailable for this retained scope. Admit and reconcile the required sources before interpreting results.</p>}<p>JSON and CSV retain the complete bounded response, including nulls, context, source provenance and evidence hashes. Display filters only affect the court and shot table.</p>{SHOOTING_LIMITS}<ul>{result.disclosures.map((d, i) => <li key={i}>{d}</li>)}</ul></>}>
        {result.coverage_status === "source_blocked" ? "Real analytics are unavailable for this retained scope." : "Observed shooting facts; unknown locations are kept, never zero."}
      </GatedNote>
      {result.profile && <><h3>Focal Zone Profile</h3><Zones profile={result.profile} name={name(result.request.player_id)} /></>}
      {profileOps && <>
        <h3>Shot Court and Fact Table</h3>
        <div className="research-inline-controls">
          <Field label="Display zone"><select aria-label="Display zone" value={zone} onChange={e => { setZone(e.target.value); setShotPage(0); setSelectedShot(null); }}><option value="">All Zones</option>{result.profile?.zones.map(z => <option key={z.zone}>{z.zone}</option>)}</select></Field>
          <Field label="Display team"><select aria-label="Display team" value={team} onChange={e => { setTeam(e.target.value); setShotPage(0); setSelectedShot(null); }}><option value="">All Observed Teams</option>{Array.from(new Set(result.shots.map(s => s.team_id))).map(t => <option key={t}>{t}</option>)}</select></Field>
          <Button size="lg" onClick={exportCourt}>Export Court SVG</Button>
        </div>
        {/* eslint-disable-next-line no-restricted-syntax -- legend prose naming the chart's made-shot marker, not an icon (D26) */}
        <p className="research-caption">Normalized feet: x lateral; y from the attacking basket toward midcourt. ○ made; × missed. {shots.length} filtered attempts; page {shotPage + 1} · {pageShots.length} displayed attempts; {pageShots.filter(({ shot }) => !courtPosition(shot)).length} unplotted (unknown or outside court bounds). Unknown locations are retained in the table.</p>
        <svg ref={court} className="shooting-court" xmlns="http://www.w3.org/2000/svg" viewBox="-2 -2 54 98" role="img" aria-label="Shot locations in normalized feet; equivalent facts in table">
          <rect x={0} y={0} width={50} height={94} fill="none" stroke="currentColor" strokeWidth={.2} /><path d="M0 47 H50 M17 94 V75 H33 V94 M3 94 V80 M47 94 V80" fill="none" stroke="currentColor" strokeWidth={.2} /><circle cx={25} cy={88.75} r={.75} fill="none" stroke="currentColor" strokeWidth={.2} /><circle cx={25} cy={47} r={6} fill="none" stroke="currentColor" strokeWidth={.2} />
          {pageShots.map(({ shot, index }) => { const pos = courtPosition(shot); return pos && <g key={index}><title>{shot.game_id} · {shot.zone} · {shot.made ? "made" : "missed"} · ({shot.x_feet}, {shot.y_feet}) feet</title>{shot.made ? <circle cx={pos.x} cy={pos.y} r={.55} fill="none" stroke="var(--color-positive)" strokeWidth={.22} /> : <path d={`M${pos.x - .45} ${pos.y - .45} l.9 .9 m0 -.9 l-.9 .9`} stroke="var(--color-negative)" strokeWidth={.22} />}</g>; })}
        </svg>
        <div className="floor-scroll" tabIndex={0} role="region" aria-label="Shot facts"><table className="data-table"><caption>Displayed shot facts · {pageShots.length} of {shots.length} filtered attempts</caption><thead><tr>{["Game / Date", "Team", "Period / Clock Seconds", "Zone", "x Feet", "y Feet", "Made", "Points", "Evidence"].map(h => <th scope="col" key={h}>{h}</th>)}</tr></thead><tbody>{pageShots.map(({ shot: s, index }) => <tr key={index}><th scope="row">{s.game_id} / {formatDate(s.game_date)}</th><td>{s.team_id}</td><td>{s.period} / {n(s.seconds_remaining)}</td><td>{s.zone}</td><td className="num">{n(s.x_feet)}</td><td className="num">{n(s.y_feet)}</td><td>{s.made ? "Yes" : "No"}</td><td className="num">{s.points}</td><td><Button size="lg" onClick={() => setSelectedShot(index)}>Inspect shot {index + 1}</Button></td></tr>)}</tbody></table></div>
        <div className="research-pager"><Button size="lg" disabled={shotPage === 0} onClick={() => { setShotPage(shotPage - 1); setSelectedShot(null); }}>Previous Shots</Button><span>Page {shotPage + 1} / {Math.max(1, Math.ceil(shots.length / 100))} · 100 facts per page</span><Button size="lg" disabled={(shotPage + 1) * 100 >= shots.length} onClick={() => { setShotPage(shotPage + 1); setSelectedShot(null); }}>Next Shots</Button></div>
        {fact && <div aria-live="polite" className="panel"><h4>Selected shot evidence</h4><pre className="research-document">{JSON.stringify(fact, null, 2)}</pre><p>Source video unavailable: no admitted exact event/clip mapping. Clock proximity does not verify a clip.</p></div>}
      </>}
      {result.operation === "shot-profile-peers" && <><h3>Located-Zone Peers</h3>
        <GatedNote why={<p>Euclidean distance over seven known-zone attempt-share dimensions; Unknown excluded from the vector. Lower distance means similar location distribution. Efficiency is shown separately. No fitted model or player-quality ranking.</p>}>{result.peers.length ? "Lower distance means a more similar shot-location mix." : "No eligible peers for the focal sample and gates."}</GatedNote>
        {result.peers.length > 0 && <div className="floor-scroll" tabIndex={0} role="region" aria-label="Shot peers"><table className="data-table"><caption>Eligible peers · distance then canonical ID</caption><thead><tr>{["Player", "Distance", "Located", "Unknown", "Games", "Compare Zones"].map(h => <th scope="col" key={h} className={h === "Player" || h === "Compare Zones" ? undefined : "num"}>{h}</th>)}</tr></thead><tbody>{result.peers.map(p => <tr key={p.profile.player_id}><th scope="row"><Link href={shootingUrl(path, result.operation, { ...resolved, player_id: p.profile.player_id })}>{name(p.profile.player_id)}</Link></th><td className="num">{p.distance}</td><td className="num">{p.profile.located_attempts}</td><td className="num">{p.profile.unknown_attempts}</td><td className="num">{p.profile.games}</td><td><Button size="lg" onClick={() => setSelectedPeer(p.profile.player_id)}>Compare {name(p.profile.player_id)}</Button></td></tr>)}</tbody></table></div>}
        {peer && <><h4>Peer Zone Comparison · Same Resolved Scope</h4><Zones profile={peer.profile} name={name(peer.profile.player_id)} /></>}</>}
      {result.operation === "shot-aftermath" && <><h3>Possession-Sequence Branches</h3>
        <GatedNote why={<><p>One uniquely mapped first field goal per valid counted possession. Recovery only within that possession. Continued points include all containing-possession free throws; anchor-foul attribution is unavailable. Next opponent is exactly possession +1, reversed sides, same period. End-of-period outcomes are censored. These totals have separate samples and cannot form a net rating.</p><p>Zone/team branch filters are unavailable: anchor responses do not expose a unique link back to shot coordinates or team. Player and date scope apply on the server.</p><p>Video replay unavailable without admitted event/clip identity mapping.</p></>}>Each branch has its own sample; totals cannot form a net rating.</GatedNote>
        <div className="floor-scroll" tabIndex={0} role="region" aria-label="Aftermath branches"><table className="data-table"><caption>Branch-specific samples and observed point totals</caption><thead><tr>{["Branch", "Anchors", "Games", "Sample", "First-Chance Points", "Continued Samples", "Continued Points", "Opponent Samples", "Opponent Points", "Missing", "Censored"].map(h => <th scope="col" key={h} className={h === "Branch" || h === "Sample" ? undefined : "num"}>{h}</th>)}</tr></thead><tbody>{result.aftermath_summary.map(b => <tr key={b.branch}><th scope="row">{b.branch}</th><td className="num">{b.anchors}</td><td className="num">{b.games}</td><td>{b.sample_status}</td><td className="num">{n(b.first_chance_points)}</td><td className="num">{b.continued_samples}</td><td className="num">{n(b.continued_points)}</td><td className="num">{b.opponent_samples}</td><td className="num">{n(b.next_opponent_points)}</td><td className="num">{b.missing_opponent}</td><td className="num">{b.censored_opponent}</td></tr>)}</tbody></table></div>
        <details><summary>Sequence Evidence · {result.anchors.length} Anchors / Unknown Candidates</summary><div className="floor-scroll" tabIndex={0} role="region" aria-label="Sequence evidence"><table className="data-table"><caption>Returned anchor evidence; unknown first-chance membership remains null</caption><thead><tr>{["Game / Possession", "Branch", "Shot Points", "First Chance", "Continued", "Next Opponent", "Next Status", "Reason"].map(h => <th key={h} scope="col">{h}</th>)}</tr></thead><tbody>{pageAnchors.map((a, i) => <tr key={i}><th scope="row">{a.game_id} / {n(a.possession_number)}</th><td>{a.branch}</td><td className="num">{a.shot_points}</td><td className="num">{n(a.first_chance_points)}</td><td className="num">{n(a.continued_points)}</td><td className="num">{n(a.next_opponent_points)}</td><td>{a.next_status}</td><td>{a.reason || "—"}</td></tr>)}</tbody></table></div><div className="research-pager"><Button size="lg" disabled={anchorPage === 0} onClick={() => setAnchorPage(anchorPage - 1)}>Previous anchors</Button><span>Page {anchorPage + 1} / {Math.max(1, Math.ceil(result.anchors.length / 100))} · 100 anchors per page</span><Button size="lg" disabled={(anchorPage + 1) * 100 >= result.anchors.length} onClick={() => setAnchorPage(anchorPage + 1)}>Next anchors</Button></div></details>
      </>}
    </section></ResearchLayout>}
  </div>;
}
