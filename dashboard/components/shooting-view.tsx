"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { queryLookup, runShooting } from "@/lib/workbench-api";
import type { LookupItem } from "@/lib/types";
import type { ShotProfile, ShootingInput, ShootingOperation, ShootingResponse } from "@/lib/shooting-types";
import { courtPosition, resolvedShooting, shootingCsv, shootingNumber as n, shootingPercent as pct, shootingUrl, validateShooting } from "@/lib/shooting";

const titles: Record<ShootingOperation, string> = { "shot-profile": "Shooting profile", "shot-profile-peers": "Shot-profile twins", matchups: "Source assignment matchups", "shot-aftermath": "Shot aftermath" };
const routes: Record<ShootingOperation, string> = { "shot-profile": "/shot-profile-twin", "shot-profile-peers": "/shot-profile-twin", matchups: "/matchups", "shot-aftermath": "/shot-aftermath" };
function download(text: string, name: string, type: string) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const link = document.createElement("a"); link.href = url; link.download = name; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function Zones({ profile }: { profile: ShotProfile }) {
  return <div className="floor-scroll" tabIndex={0} role="region" aria-label={`Zone profile ${profile.player_id}`}><table className="data-table"><caption>{profile.player_id} · {profile.sample_status} · {profile.games} games · {profile.located_attempts} located / {profile.unknown_attempts} unknown attempts</caption><thead><tr><th scope="col">Zone</th><th scope="col">Attempts</th><th scope="col">Makes</th><th scope="col">Points</th><th scope="col">FG%</th><th scope="col">All-attempt share</th><th scope="col">Located-attempt share</th></tr></thead><tbody>{profile.zones.map(z => <tr key={z.zone}><th scope="row">{z.zone}</th><td>{z.attempts}</td><td>{z.makes}</td><td>{z.points}</td><td>{pct(z.fg_pct)}</td><td>{pct(z.attempt_share)}</td><td>{pct(z.zone === "Unknown" || !profile.located_attempts ? null : z.attempts / profile.located_attempts)}</td></tr>)}</tbody></table></div>;
}
export function ShootingView({ initialOperation = "shot-profile-peers" }: { initialOperation?: ShootingOperation }) {
  const params = useSearchParams(), path = usePathname();
  const fromUrl = params.get("operation") as ShootingOperation;
  const [operation, setOperation] = useState<ShootingOperation>(initialOperation === "shot-profile-peers" && (fromUrl === "shot-profile" || fromUrl === "shot-profile-peers") ? fromUrl : initialOperation);
  const [player, setPlayer] = useState(params.get("player_id") || params.get("playerId") || "");
  const [defender, setDefender] = useState(params.get("defender_id") || "");
  const [release, setRelease] = useState(params.get("release_id") || params.get("releaseId") || "");
  const [season, setSeason] = useState(params.get("season") || "");
  const [phase, setPhase] = useState(params.get("phase") || "");
  const [before, setBefore] = useState(params.get("before_date") || params.get("beforeDate") || "");
  const [lower, setLower] = useState(params.get("lower_date") || "");
  const [attempts, setAttempts] = useState(params.get("min_attempts") || "100");
  const [games, setGames] = useState(params.get("min_games") || "5");
  const [limit, setLimit] = useState(params.get("limit") || "10");
  const [query, setQuery] = useState("");
  const [matches, setMatches] = useState<LookupItem[]>([]);
  const [target, setTarget] = useState("player");
  const [lookupError, setLookupError] = useState("");
  const [result, setResult] = useState<ShootingResponse | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [zone, setZone] = useState("");
  const [team, setTeam] = useState("");
  const [selectedPeer, setSelectedPeer] = useState("");
  const [shotPage, setShotPage] = useState(0);
  const [anchorPage, setAnchorPage] = useState(0);
  const [selectedShot, setSelectedShot] = useState<number | null>(null);
  const [previousUrl, setPreviousUrl] = useState(params.toString());
  // Reconcile navigation during render so back/forward and peer links use their URL scope.
  // Our own resolved-URL replacement retains the returned evidence.
  if (params.toString() !== previousUrl) {
    setPreviousUrl(params.toString());
    const ownResolvedUrl = result && shootingUrl(path, result.operation, resolvedShooting(result)).split("?")[1];
    if (params.toString() !== ownResolvedUrl) {
      setPlayer(params.get("player_id") || params.get("playerId") || "");
      setDefender(params.get("defender_id") || "");
      setRelease(params.get("release_id") || params.get("releaseId") || "");
      setSeason(params.get("season") || ""); setPhase(params.get("phase") || "");
      setBefore(params.get("before_date") || params.get("beforeDate") || ""); setLower(params.get("lower_date") || "");
      setAttempts(params.get("min_attempts") || "100"); setGames(params.get("min_games") || "5"); setLimit(params.get("limit") || "10");
      if (initialOperation === "shot-profile-peers") setOperation(fromUrl === "shot-profile" ? fromUrl : initialOperation);
      setResult(null); setError(""); setBusy(false);
    }
  }
  const active = useRef<AbortController | null>(null);
  const court = useRef<SVGSVGElement | null>(null);
  useEffect(() => () => active.current?.abort(), []);
  useEffect(() => {
    const controller = new AbortController();
    const timer = setTimeout(() => {
      if (query.trim().length < 2) { setMatches([]); return; }
      queryLookup({ query, kinds: ["player"], season: season || undefined, releaseId: release || undefined, limit: 8, signal: controller.signal })
        .then(data => { if (!controller.signal.aborted) { setMatches(data.items); setLookupError(""); } })
        .catch(() => { if (!controller.signal.aborted) { setMatches([]); setLookupError("Player search unavailable. Enter a canonical ID below."); } });
    }, 250);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [query, release, season]);
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); active.current?.abort();
    const controller = new AbortController(); active.current = controller;
    const req: ShootingInput = { player_id: player, defender_id: operation === "matchups" ? defender || undefined : undefined, release_id: release || undefined, season: season || undefined, phase: (phase || undefined) as ShootingInput["phase"], lower_date: lower || undefined, before_date: before || undefined, min_attempts: Number(attempts), min_games: Number(games), limit: Number(limit) };
    const issue = validateShooting(req); setError(issue || ""); setResult(null); setBusy(false);
    if (issue) return;
    setBusy(true);
    const launchUrl = window.location.search;
    try {
      const data = await runShooting(operation, req, controller.signal);
      if (controller.signal.aborted || window.location.search !== launchUrl) return;
      setResult(data); setZone(""); setTeam(""); setSelectedPeer(""); setSelectedShot(null); setShotPage(0); setAnchorPage(0);
      const resolved = resolvedShooting(data);
      setRelease(resolved.release_id || ""); setSeason(resolved.season || ""); setPhase(resolved.phase || ""); setBefore(resolved.before_date || "");
      window.history.replaceState(null, "", shootingUrl(path, data.operation, resolved));
    } catch (err) { if (!controller.signal.aborted) setError(err instanceof Error ? err.message : "Shooting request failed"); }
    finally { if (!controller.signal.aborted) setBusy(false); }
  }
  const shots = result?.shots.map((shot, index) => ({ shot, index })).filter(({ shot }) => (!zone || shot.zone === zone) && (!team || shot.team_id === team)) || [];
  const pageShots = shots.slice(shotPage * 100, (shotPage + 1) * 100);
  const pageAnchors = result?.anchors.slice(anchorPage * 100, (anchorPage + 1) * 100) || [];
  const peer = result?.peers.find(p => p.profile.player_id === selectedPeer);
  const fact = selectedShot == null ? null : result?.shots[selectedShot];
  async function exportCourt() {
    if (!court.current || !result) return;
    const svg = court.current.cloneNode(true) as SVGSVGElement;
    const context = JSON.stringify({ ...resolvedShooting(result), display_zone: zone || "all", display_team: team || "all", display_page: shotPage + 1, evidence_hash: result.evidence_hash, coverage: result.coverage_status });
    const title = document.createElementNS("http://www.w3.org/2000/svg", "title"); title.textContent = `CourtLoad shooting · normalized feet · ${context}`; svg.prepend(title);
    // Resolve semantic theme colors so the standalone SVG renders outside the app.
    const theme = getComputedStyle(court.current);
    for (const element of [svg, ...svg.querySelectorAll("*")]) for (const attr of ["stroke", "fill"]) {
      const value = element.getAttribute(attr);
      if (value?.startsWith("var(")) element.setAttribute(attr, theme.getPropertyValue(value.slice(4, -1)).trim());
      else if (value === "currentColor") element.setAttribute(attr, theme.color);
    }
    svg.removeAttribute("style");
    svg.setAttribute("viewBox", "-2 -2 54 115");
    const banner = ["CourtLoad · shooting · normalized feet", `${result.context.season} · ${result.context.phase} · before ${result.context.before_date}`, `Player ${result.request.player_id} · zone ${zone || "all"} · team ${team || "all"} · page ${shotPage+1}`, `Source ${result.coverage_status} · ${result.observed_games}/${result.expected_games} games`, `Release ${result.context.release_id}`, `Evidence ${result.evidence_hash}`];
    banner.forEach((line, index) => {
      const text = document.createElementNS("http://www.w3.org/2000/svg", "text");
      text.setAttribute("x", "0"); text.setAttribute("y", String(97 + index * 2.5)); text.setAttribute("font-size", ".85"); text.setAttribute("fill", theme.color); text.textContent = line; svg.append(text);
    });
    const background = document.createElementNS("http://www.w3.org/2000/svg", "rect");
    background.setAttribute("x", "-2"); background.setAttribute("y", "-2"); background.setAttribute("width", "54"); background.setAttribute("height", "115"); background.setAttribute("fill", theme.getPropertyValue("--surface").trim()); svg.prepend(background);
    const metadata = document.createElementNS("http://www.w3.org/2000/svg", "metadata"); metadata.textContent = context; svg.append(metadata);
    download(new XMLSerializer().serializeToString(svg), "shooting-court.svg", "image/svg+xml");
  }
  return <div className="workbench-content shared-floor shooting-workspace">
    <div className="page-header"><div><h1 className="page-title">{titles[operation]}</h1><p className="page-subtitle">Observed shooting, explicit assignments and bounded possession sequences.</p></div></div>
    <nav className="floor-actions" aria-label="Shooting tools">{(["shot-profile-peers", "matchups", "shot-aftermath"] as const).map(op => <Link key={op} href={result ? shootingUrl(routes[op], op, { ...resolvedShooting(result), defender_id: op === "matchups" ? result.request.defender_id : null }) : routes[op]}>{titles[op]}</Link>)}</nav>
    <form className="table-card floor-form" onSubmit={submit}>
      {initialOperation === "shot-profile-peers" && <div className="floor-actions" role="group" aria-label="Shooting tabs">{(["shot-profile", "shot-profile-peers"] as const).map(op => <button type="button" aria-pressed={operation === op} key={op} onClick={() => { active.current?.abort(); setBusy(false); setOperation(op); setResult(null); setError(""); }}>{titles[op]}</button>)}</div>}
      <div className="floor-controls">
        <label>Player name search<input value={query} onChange={e => setQuery(e.target.value)} autoComplete="off" /></label>
        {operation === "matchups" && <label>Use search result for<select value={target} onChange={e => setTarget(e.target.value)}><option value="player">Offensive player</option><option value="defender">Defender</option></select></label>}
        <label>{operation === "matchups" ? "Offensive player ID" : "Player ID"}<input value={player} onChange={e => setPlayer(e.target.value)} required /></label>
        {operation === "matchups" && <label>Defender ID (optional)<input value={defender} onChange={e => setDefender(e.target.value)} /></label>}
        <label>Release ID<input value={release} onChange={e => setRelease(e.target.value)} placeholder="Resolve published release" /></label>
        <label>Season<input value={season} onChange={e => setSeason(e.target.value)} placeholder="Resolve default season" /></label>
        <label>Phase<select value={phase} onChange={e => setPhase(e.target.value)}><option value="">Resolve default phase</option>{["preseason", "regular_season", "play_in", "playoffs", "cup_final", "summer_league"].map(p => <option key={p} value={p}>{p}</option>)}</select></label>
        <label>Lower date (inclusive)<input type="date" value={lower} onChange={e => setLower(e.target.value)} /></label>
        <label>Before date (exclusive)<input type="date" value={before} onChange={e => setBefore(e.target.value)} /></label>
        <label>Minimum attempts<input type="number" min={1} max={10000} step={1} value={attempts} onChange={e => setAttempts(e.target.value)} /></label>
        <label>Minimum games<input type="number" min={1} max={100} step={1} value={games} onChange={e => setGames(e.target.value)} /></label>
        {operation === "shot-profile-peers" && <label>Peer limit<input type="number" min={1} max={25} value={limit} onChange={e => setLimit(e.target.value)} /></label>}
      </div>
      {matches.length > 0 && <ul aria-label="Player search results">{matches.map(item => <li key={item.canonical_id}><button type="button" onClick={() => { if (target === "defender" && operation === "matchups") setDefender(item.canonical_id); else setPlayer(item.canonical_id); setQuery(""); setMatches([]); }}>{item.display_name} ({item.canonical_id})</button></li>)}</ul>}
      {lookupError && <p role="status">{lookupError}</p>}
      <p className="text-muted">Blank scope fields resolve through the retained release. Profile/peer gates use located attempts; aftermath gates use mapped anchors per branch. Assignment exposure is descriptive. Dense league scopes can exceed the 50,000-row input bound: narrow the dates.</p>
      <div className="floor-actions"><button type="submit" disabled={busy}>{busy ? "Loading…" : "Run shooting analysis"}</button>{busy && <button type="button" onClick={() => { active.current?.abort(); setBusy(false); }}>Cancel</button>}</div>
      {error && <p role="alert">{error}</p>}
    </form>
    {!result && !busy && !error && <p>Choose a player and run an analysis. No data is acquired by this workspace.</p>}
    {result && <section className="table-card floor-result" aria-label="Shooting result">
      <h2>{titles[result.operation]} · {result.request.player_id}</h2>
      <p role="status">Source coverage: <strong>{result.coverage_status}</strong> · {result.observed_games} / {result.expected_games} finalized league games across required inputs · {result.excluded_rows} excluded rows.</p>
      {result.coverage_status === "source_blocked" && <p>Real analytics are unavailable for this retained scope. Admit and reconcile the required sources before interpreting results.</p>}
      <p>Season {String(result.context.season)} · {String(result.context.phase)} · dates {result.request.lower_date || "season start"} ≤ game date &lt; {String(result.context.before_date)} · release <span className="floor-hash">{String(result.context.release_id)}</span></p>
      <div className="floor-actions"><button onClick={() => download(JSON.stringify({ schema: "courtload-shooting-evidence-v1", result, display_filters: { zone, team, shot_page: shotPage + 1, anchor_page: anchorPage + 1 } }, null, 2), "shooting-evidence.json", "application/json")}>Save evidence JSON</button><button onClick={() => download(shootingCsv(result), "shooting-evidence.csv", "text/csv")}>Export evidence CSV</button><a href={shootingUrl(path, result.operation, resolvedShooting(result))}>Reopen this resolved query</a></div>
      <p className="text-muted">JSON and CSV retain the complete bounded response, including nulls, context, source provenance and evidence hashes. Display filters only affect the court and shot table.</p>
      {result.profile && <><h3>Focal zone profile</h3><p>{result.profile.attempts} attempts · {result.profile.makes} makes · {result.profile.points} points · sample: {result.profile.sample_status}</p><Zones profile={result.profile} /></>}
      {(result.operation === "shot-profile" || result.operation === "shot-profile-peers") && <>
        <h3>Shot court and fact table</h3><div className="floor-controls"><label>Display zone<select value={zone} onChange={e => { setZone(e.target.value); setShotPage(0); setSelectedShot(null); }}><option value="">All zones</option>{result.profile?.zones.map(z => <option key={z.zone}>{z.zone}</option>)}</select></label><label>Display team<select value={team} onChange={e => { setTeam(e.target.value); setShotPage(0); setSelectedShot(null); }}><option value="">All observed teams</option>{Array.from(new Set(result.shots.map(s => s.team_id))).map(t => <option key={t}>{t}</option>)}</select></label></div>
        <p>Normalized feet: x lateral; y from the attacking basket toward midcourt. ○ made; × missed. {shots.length} filtered attempts; page {shotPage+1} · {pageShots.length} displayed attempts; {pageShots.filter(({ shot }) => !courtPosition(shot)).length} unplotted (unknown or outside court bounds). Unknown locations are retained in the table.</p>
        <svg ref={court} className="shooting-court" xmlns="http://www.w3.org/2000/svg" viewBox="-2 -2 54 98" role="img" aria-label="Shot locations in normalized feet; equivalent facts in table" style={{ color: "var(--text)" }}>
          <rect x={0} y={0} width={50} height={94} fill="none" stroke="currentColor" strokeWidth={.2}/><path d="M0 47 H50 M17 94 V75 H33 V94 M3 94 V80 M47 94 V80" fill="none" stroke="currentColor" strokeWidth={.2}/><circle cx={25} cy={88.75} r={.75} fill="none" stroke="currentColor" strokeWidth={.2}/><circle cx={25} cy={47} r={6} fill="none" stroke="currentColor" strokeWidth={.2}/>
          {pageShots.map(({ shot, index }) => { const pos = courtPosition(shot); return pos && <g key={index}><title>{shot.game_id} · {shot.zone} · {shot.made ? "made" : "missed"} · ({shot.x_feet}, {shot.y_feet}) feet</title>{shot.made ? <circle cx={pos.x} cy={pos.y} r={.55} fill="none" stroke="var(--positive)" strokeWidth={.22}/> : <path d={`M${pos.x-.45} ${pos.y-.45} l.9 .9 m0 -.9 l-.9 .9`} stroke="var(--negative)" strokeWidth={.22}/>}</g>; })}
        </svg><button onClick={exportCourt}>Export court SVG</button>
        <div className="floor-scroll" tabIndex={0} role="region" aria-label="Shot facts"><table className="data-table"><caption>Displayed shot facts · {pageShots.length} of {shots.length} filtered attempts</caption><thead><tr>{["Game / date", "Team", "Period / clock seconds", "Zone", "x feet", "y feet", "Made", "Points", "Evidence"].map(h => <th scope="col" key={h}>{h}</th>)}</tr></thead><tbody>{pageShots.map(({ shot: s, index }) => <tr key={index}><th scope="row">{s.game_id} / {s.game_date}</th><td>{s.team_id}</td><td>{s.period} / {n(s.seconds_remaining)}</td><td>{s.zone}</td><td>{n(s.x_feet)}</td><td>{n(s.y_feet)}</td><td>{s.made ? "Yes" : "No"}</td><td>{s.points}</td><td><button onClick={() => setSelectedShot(index)}>Inspect shot {index+1}</button></td></tr>)}</tbody></table></div>
        <div className="floor-actions"><button disabled={shotPage === 0} onClick={() => { setShotPage(shotPage-1); setSelectedShot(null); }}>Previous shots</button><span>Page {shotPage+1} / {Math.max(1, Math.ceil(shots.length/100))} · 100 facts per page</span><button disabled={(shotPage+1)*100 >= shots.length} onClick={() => { setShotPage(shotPage+1); setSelectedShot(null); }}>Next shots</button></div>
        {fact && <div aria-live="polite"><h4>Selected shot evidence</h4><pre>{JSON.stringify(fact, null, 2)}</pre><p>Source video unavailable: no admitted exact event/clip mapping. Clock proximity does not verify a clip.</p></div>}
      </>}
      {result.operation === "shot-profile-peers" && <><h3>Located-zone peers</h3><p>Euclidean distance over seven known-zone attempt-share dimensions; Unknown excluded from the vector. Lower distance means similar location distribution. Efficiency is shown separately. No fitted model or player-quality ranking.</p>{!result.peers.length && <p>No eligible peers for the focal sample and gates.</p>}<div className="floor-scroll" tabIndex={0} role="region" aria-label="Shot peers"><table className="data-table"><caption>Eligible peers · distance then canonical ID</caption><thead><tr>{["Player", "Distance", "Located", "Unknown", "Games", "Compare zones"].map(h => <th scope="col" key={h}>{h}</th>)}</tr></thead><tbody>{result.peers.map(p => <tr key={p.profile.player_id}><th scope="row"><a href={shootingUrl(path, result.operation, { ...resolvedShooting(result), player_id: p.profile.player_id })}>{p.profile.player_id}</a></th><td>{p.distance}</td><td>{p.profile.located_attempts}</td><td>{p.profile.unknown_attempts}</td><td>{p.profile.games}</td><td><button onClick={() => setSelectedPeer(p.profile.player_id)}>Compare {p.profile.player_id}</button></td></tr>)}</tbody></table></div>{peer && <><h4>Peer zone comparison · same resolved scope</h4><Zones profile={peer.profile} /></>}</>}
      {result.operation === "matchups" && <><h3>Offense × defense assignment matrix</h3><p>Explicit source pair assignments only. Fractional possessions/help responsibility do not sum to ordinary player totals. No nearest-defender, tracking, causal impact or forced-turnover inference.</p>{!result.assignments.length && <p>No source assignments for this player/pair and scope.</p>}<div className="floor-scroll" tabIndex={0} role="region" aria-label="Assignment matrix"><table className="data-table"><caption>Source pair matrix · pooled FG% = assignment makes / attempts</caption><thead><tr>{["Offense / defense", "Games", "Seconds", "Fractional possessions", "Attempts", "Makes", "Player points", "Team points", "FG%"].map(h => <th scope="col" key={h}>{h}</th>)}</tr></thead><tbody>{result.assignments.map(a => <tr key={`${a.offensive_player_id}-${a.defensive_player_id}`}><th scope="row">{a.offensive_player_id} / {a.defensive_player_id}</th><td>{a.games}</td><td>{a.seconds}</td><td>{a.fractional_possessions}</td><td>{a.attempts}</td><td>{a.makes}</td><td>{a.player_points}</td><td>{a.team_points}</td><td>{pct(a.fg_pct)}</td></tr>)}</tbody></table></div><p>Per-game assignment rows and verified clips are unavailable in this API. Narrow the date scope for game-specific queries; this does not supply a clip mapping.</p></>}
      {result.operation === "shot-aftermath" && <><h3>Possession-sequence branches</h3><p>One uniquely mapped first field goal per valid counted possession. Recovery only within that possession. Continued points include all containing-possession free throws; anchor-foul attribution is unavailable. Next opponent is exactly possession +1, reversed sides, same period. End-of-period outcomes are censored. These totals have separate samples and cannot form a net rating.</p><p>Zone/team branch filters are unavailable: anchor responses do not expose a unique link back to shot coordinates or team. Player and date scope apply on the server.</p><div className="floor-scroll" tabIndex={0} role="region" aria-label="Aftermath branches"><table className="data-table"><caption>Branch-specific samples and observed point totals</caption><thead><tr>{["Branch", "Anchors", "Games", "Sample", "First-chance points", "Continued samples", "Continued points", "Opponent samples", "Opponent points", "Missing", "Censored"].map(h => <th scope="col" key={h}>{h}</th>)}</tr></thead><tbody>{result.aftermath_summary.map(b => <tr key={b.branch}><th scope="row">{b.branch}</th><td>{b.anchors}</td><td>{b.games}</td><td>{b.sample_status}</td><td>{n(b.first_chance_points)}</td><td>{b.continued_samples}</td><td>{n(b.continued_points)}</td><td>{b.opponent_samples}</td><td>{n(b.next_opponent_points)}</td><td>{b.missing_opponent}</td><td>{b.censored_opponent}</td></tr>)}</tbody></table></div>
        <details><summary>Sequence evidence · {result.anchors.length} anchors / unknown candidates</summary><div className="floor-scroll" tabIndex={0} role="region" aria-label="Sequence evidence"><table className="data-table"><caption>Returned anchor evidence; unknown first-chance membership remains null</caption><thead><tr>{["Game / possession", "Branch", "Shot points", "First chance", "Continued", "Next opponent", "Next status", "Reason"].map(h => <th key={h} scope="col">{h}</th>)}</tr></thead><tbody>{pageAnchors.map((a,i) => <tr key={i}><th scope="row">{a.game_id} / {n(a.possession_number)}</th><td>{a.branch}</td><td>{a.shot_points}</td><td>{n(a.first_chance_points)}</td><td>{n(a.continued_points)}</td><td>{n(a.next_opponent_points)}</td><td>{a.next_status}</td><td>{a.reason || "—"}</td></tr>)}</tbody></table></div><div className="floor-actions"><button disabled={anchorPage === 0} onClick={() => setAnchorPage(anchorPage-1)}>Previous anchors</button><span>Page {anchorPage+1} / {Math.max(1, Math.ceil(result.anchors.length/100))} · 100 anchors per page</span><button disabled={(anchorPage+1)*100 >= result.anchors.length} onClick={() => setAnchorPage(anchorPage+1)}>Next anchors</button></div><p>Video replay unavailable without admitted event/clip identity mapping.</p></details>
      </>}
      <details><summary>Definitions, source provenance and evidence identity</summary><p>{result.operation_version}</p><ul>{result.disclosures.map((d,i) => <li key={i}>{d}</li>)}</ul><p className="floor-hash">Input: {result.input_hash}<br/>Evidence: {result.evidence_hash}</p><pre>{JSON.stringify({ context: result.context, input_counts: result.input_counts, branch_counts: result.branch_counts, provenance: result.provenance }, null, 2)}</pre></details>
      <p>Verified source video unavailable. An observed event does not establish an available clip.</p>
    </section>}
  </div>;
}
