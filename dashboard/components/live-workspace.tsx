"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { acceptsDemand, createLiveSession, easternToday, gameStatus, liveRequest, shiftSlate, validSlate, type HistoricalSlate, type LiveCache, type LiveGame, type LivePlayer } from "@/lib/live";

function displayTime(value: string | null) { return value ? value : "Unknown"; }
function Observation({ cache }: { cache: LiveCache }) {
  return <div className="live-observation">
    <strong>{cache.status.replaceAll("_", " ")}{cache.stale ? " · Stale" : ""}{cache.paused ? " · Shared feed idle" : ""}</strong>
    <span>Observation age: {cache.age_seconds == null ? "Unknown" : `${Math.floor(cache.age_seconds)} seconds at last read`}</span>
    <span>Acquired: {displayTime(cache.acquired_at)} · Last successful fetch: {displayTime(cache.last_success_at)}</span>
    <span>Source time: {displayTime(cache.source_time)} · Next allowed fetch: {displayTime(cache.next_poll_at)}</span>
    {cache.error && <span role="alert">{cache.error}</span>}
    <details><summary>Observation provenance</summary><p>Namespace: {cache.namespace} · Observation: {cache.observation_id ?? "Unknown"}</p><p>SHA-256: {cache.content_sha256 ?? "Unknown"}</p><p>HTTP date: {cache.http_date ?? "Unknown"} · Last poll: {cache.last_poll_at ?? "Unknown"}</p></details>
  </div>;
}
function PlayerBoxes({ players, games }: { players: LivePlayer[] | null | undefined; games: LiveGame[] }) {
  if (!players?.length) return <p className="notice-box">Player boxes unknown. Missing rows do not establish nonappearance or injury.</p>;
  const teamIds = [...new Set(players.map(p => p.team_source_id))];
  return <>{teamIds.map(id => {
    const rows = players.filter(p => p.team_source_id === id);
    const columns = [...new Set(rows.flatMap(p => Object.keys(p.statistics)))];
    const team = games.flatMap(g => g.teams).find(t => t.source_id === id);
    return <section key={id}><h3>{team?.name ?? `Source team ${id}`} · Player boxes</h3><div className="live-table-scroll" role="region" aria-label={`${team?.name ?? id} player box table`} tabIndex={0}><table className="data-table"><thead><tr><th scope="col">Player</th><th scope="col">Appearance / identity</th>{columns.map(c => <th scope="col" key={c}>{c}</th>)}</tr></thead><tbody>{rows.map((p,i) => <tr key={`${p.source_id}-${i}`}><th scope="row">{p.name}</th><td>{p.appearance_label ?? (p.reported_nonappearance === true ? "Reported nonappearance" : p.reported_nonappearance === false ? "Reported participation" : "Appearance unknown")} · {p.identity_status}</td>{columns.map(c => <td key={c}>{p.reported_nonappearance === true ? "—" : p.statistics[c] ?? "—"}</td>)}</tr>)}</tbody></table></div></section>;
  })}</>;
}

function LiveWorkspaceContent({ date, gameId }: { date?: string; gameId?: string }) {
  const params = useSearchParams();
  const router = useRouter();
  const query = params.toString();
  const slate = date ?? params.get("date") ?? easternToday();
  const valid = validSlate(slate) && (!gameId || /^[0-9]{1,20}$/.test(gameId));
  const historical = params.get("live_mode") === "history" || (valid && !acceptsDemand(slate));
  const [paused, setPaused] = useState(false);
  const [cache, setCache] = useState<LiveCache | null>(null);
  const [box, setBox] = useState<LiveCache | null>(null);
  const [history, setHistory] = useState<HistoricalSlate | null>(null);
  const [connection, setConnection] = useState("Loading cached observations");
  const [readError, setReadError] = useState<string | null>(null);
  const [leaseError, setLeaseError] = useState<string | null>(null);

  function href(day: string, id?: string, mode = historical) {
    const search = new URLSearchParams(query);
    search.set("date", day);
    if (mode && history?.context.release_id) search.set("releaseId", history.context.release_id);
    if (mode) search.set("live_mode", "history"); else search.delete("live_mode");
    return `/live/${id ? `games/${id}` : day}?${search}`;
  }

  useEffect(() => {
    let disposed = false;
    let stop: (() => void) | undefined;
    let generation = 0;
    const active = (value: number) => !disposed && generation === value;
    async function read(value: number) {
      try {
        if (historical) {
          const sp = new URLSearchParams(query);
          sp.set("slate_date", slate);
          if (gameId) sp.set("game_id", gameId); else sp.delete("game_id");
          const result = await liveRequest<HistoricalSlate>(`/historical?${sp}`);
          if (active(value)) {
            setHistory(result); setReadError(null);
            if (!sp.get("releaseId") && result.context.release_id) {
              const pinned = new URLSearchParams(query); pinned.set("releaseId", result.context.release_id); pinned.set("date", slate); pinned.set("live_mode", "history");
              router.replace(`/live/${gameId ? `games/${gameId}` : slate}?${pinned}`, { scroll: false });
            }
          }
        } else {
          const [next, selected] = await Promise.all([liveRequest<LiveCache>(`?slate_date=${slate}`), gameId ? liveRequest<LiveCache>(`/games/${gameId}?slate_date=${slate}`) : Promise.resolve(null)]);
          if (active(value)) { setCache(next); setBox(selected); setReadError(null); }
        }
      } catch { if (active(value)) setReadError("Offline or service unavailable. Last observation retained; its acquisition time is shown below."); }
    }
    function update() {
      stop?.(); stop = undefined;
      const value = ++generation;
      if (!valid) { setConnection("Invalid date or game ID"); return; }
      if (document.visibilityState === "hidden") { setConnection("Hidden · Updates suspended"); return; }
      if (!navigator.onLine) { setConnection("Offline · Updates suspended"); return; }
      if (historical || paused) {
        setConnection(historical ? "Finalized research · No Live demand" : "Paused · No Live demand");
        void read(value);
      } else {
        setConnection("Visible · Cached reads and lease heartbeats every 60 seconds");
        stop = createLiveSession({ slate_date: slate, game_id: gameId ?? null }, () => read(value), message => { if (active(value)) setLeaseError(message); });
      }
    }
    update();
    document.addEventListener("visibilitychange", update);
    window.addEventListener("online", update); window.addEventListener("offline", update); window.addEventListener("pagehide", updateOnPageHide); window.addEventListener("pageshow", update);
    function updateOnPageHide() { ++generation; stop?.(); stop = undefined; }
    return () => { disposed = true; ++generation; stop?.(); document.removeEventListener("visibilitychange", update); window.removeEventListener("online", update); window.removeEventListener("offline", update); window.removeEventListener("pagehide", updateOnPageHide); window.removeEventListener("pageshow", update); };
  }, [slate, gameId, paused, historical, query, valid, router]);

  const games = historical ? history?.games ?? [] : cache?.data?.games ?? [];
  const selected = historical ? games.find(g => g.source_id === gameId) : box?.data?.game;
  return <div className="workbench-content live-workspace">
    <div className="page-header"><div><h1 className="page-title">Live games</h1><p className="page-subtitle">{historical ? "Retained finalized research facts" : "Provisional ESPN observations"} · Eastern slate dates · UTC event times</p></div><button type="button" className="button button-secondary" onClick={() => setPaused(!paused)} disabled={historical} aria-pressed={paused}>{paused ? "Resume updates" : "Pause updates"}</button></div>
    <nav className="live-date-strip" aria-label="Live dates"><Link href={href(easternToday(), undefined, false)}>Today</Link>{valid && [-2,-1,0,1,2].map(offset => { const day = shiftSlate(slate, offset); return <Link key={day} href={href(day)} aria-current={day === slate ? "date" : undefined}>{day}</Link>; })}<label>Slate date<input type="date" value={valid ? slate : ""} onChange={e => { if (validSlate(e.target.value)) router.push(href(e.target.value)); }} /></label></nav>
    <nav className="live-mode" aria-label="Game data source"><Link href={href(valid ? slate : easternToday(), undefined, false)}>Provisional Live cache</Link><Link href={href(valid ? slate : easternToday(), undefined, true)}>Admitted historical finals</Link><Link href={`/playoffs?${query}`}>Playoff series explorer</Link></nav>
    {historical && <form className="live-history-context" onSubmit={e => {
      e.preventDefault(); const form = new FormData(e.currentTarget); const sp = new URLSearchParams(query);
      for (const key of ["releaseId", "season", "phase", "beforeDate"]) { const value = String(form.get(key) ?? ""); if (value) sp.set(key, value); else sp.delete(key); }
      sp.set("date", slate); sp.set("live_mode", "history"); router.push(`/live/${gameId ? `games/${gameId}` : slate}?${sp}`);
    }}><label>Research release<input name="releaseId" defaultValue={params.get("releaseId") ?? history?.context.release_id ?? ""} placeholder="Public pointer on first read" /></label><label>Research season<input name="season" defaultValue={params.get("season") ?? ""} placeholder="Season containing slate date" /></label><label>Research phase<select name="phase" defaultValue={params.get("phase") ?? "regular_season"}><option value="regular_season">Regular season</option><option value="playoffs">Playoffs</option><option value="preseason">Preseason</option></select></label><label>Research exclusive cutoff<input name="beforeDate" type="date" defaultValue={params.get("beforeDate") ?? ""} /></label><button type="submit" className="button button-secondary">Load finalized research</button></form>}
    <p role="status">{connection}</p>
    {!historical && <p className="notice-box">Genuine changing in-game freshness and final reconciliation: not yet observed. Cached source finals remain provisional until independently admitted. Several tabs share one bounded worker feed.</p>}
    {(readError || leaseError) && <p role="alert" className="notice-box">{readError ?? leaseError}</p>}
    {valid && <>
      {historical ? history && <div className="live-observation"><strong>{history.status.replaceAll("_", " ")}</strong><span>Research release: {history.context.release_id} · Dataset: {history.context.dataset_id} · {history.context.season} / {history.context.phase} · Exclusive cutoff: {history.context.before_date}</span>{history.warnings.map(w => <span key={w}>{w}</span>)}</div> : cache && <Observation cache={cache} />}
      <section aria-label="Game slate" className="live-game-grid">{games.map(g => <Link key={g.source_id} className="live-game-card" href={href(slate, g.source_id)} aria-current={gameId === g.source_id ? "page" : undefined}><span className="live-game-status">{gameStatus(g)}</span>{[...g.teams].sort((a,b) => a.side === b.side ? 0 : a.side === "away" ? -1 : 1).map(t => <span className="live-score-row" key={t.source_id}><span>{t.name}<small>{t.side} · {t.identity_status}</small></span><strong>{t.score ?? "—"}</strong></span>)}<small>Event UTC: {g.event_time ?? "Unknown"} · Actual slate: {g.slate_date}</small></Link>)}</section>
      {!games.length && <p className="notice-box">{historical ? "No admitted finals in this release, phase and date. Coverage is unknown outside retained facts." : cache?.data ? "No games in the observed source slate." : "Awaiting a cached slate. Acquisition may be disabled or the worker may be idle."}</p>}
      {gameId && <section aria-label="Selected game details" className="live-selected"><h2>Selected game {gameId}</h2>{!historical && box && <Observation cache={box} />}{selected ? <><h3>{selected.teams.map(t => t.name).join(" vs ")} · {gameStatus(selected)}</h3><p>Actual slate: {selected.slate_date} · Event UTC: {selected.event_time ?? "Unknown"} · {selected.provisional ? "Provisional" : "Finalized research"} · Game identity: {selected.identity_status}</p><div className="live-team-boxes">{selected.teams.map(t => <div key={t.source_id}><strong>{t.name}: {t.score ?? "Unknown"}</strong><p>{historical ? "Admitted team score" : "Provisional observed team score"}</p>{historical && t.statistics && <details><summary>Finalized team box statistics</summary><dl>{Object.entries(t.statistics).map(([key,value]) => <div key={key}><dt>{key}</dt><dd>{value ?? "—"}</dd></div>)}</dl></details>}</div>)}</div>{!historical && (box?.data?.team_sections?.length ? box.data.team_sections.map((section,i) => <div key={i} className="live-table-scroll" role="region" aria-label={`${section.team.displayName ?? section.team.id} team statistics`} tabIndex={0}><table className="data-table"><caption>{section.team.displayName ?? section.team.id} · Source-labelled team box</caption><tbody>{section.statistics?.map((stat,j) => <tr key={j}><th scope="row">{stat.label ?? stat.name ?? "Unknown statistic"}</th><td>{stat.displayValue ?? "—"}</td></tr>)}</tbody></table></div>) : <p>Additional team box statistics unknown.</p>)}<PlayerBoxes players={historical ? history?.players : box?.data?.players} games={[selected]} /></> : <p>Selected game detail unknown in this cache or finalized research context.</p>}</section>}
    </>}
  </div>;
}

export function LiveWorkspace(props: { date?: string; gameId?: string }) {
  const params = useSearchParams();
  return <LiveWorkspaceContent key={`${props.date ?? ""}:${props.gameId ?? ""}:${params.toString()}`} {...props} />;
}
