"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { acceptsDemand, createLiveSession, easternToday, gameStatus, liveRequest, shiftSlate, validSlate, type HistoricalSlate, type LiveCache, type LiveGame, type LivePlayer } from "@/lib/live";
import { formatDate } from "@/lib/format-date";
import { getScheduleDates, getWorkbenchCatalog } from "@/lib/workbench-api";
import type { ScheduleDatesResponse } from "@/lib/types";
import { ContextBar } from "./context-bar";
import { LiveBoardHeader } from "./live-board";
import { TeamLogo } from "./team-logo";
import { DataDetailsButton, type DataDetailRow } from "./ui/data-details";
import { DatePicker } from "./ui/date-picker";
import { Field } from "./ui/field";
import { CountChip, FilterBar } from "./ui/filter-bar";
import { GatedNote } from "./ui/gated-note";
import { Icon } from "./ui/icon";
import { PageShell } from "./ui/page-shell";
import { BackButton } from "./ui/back-button";
import { PlayerIdentity } from "./ui/identity";
import { Button, ButtonLink } from "./ui/kit";

/** Days shown either side of the selected slate in the date strip. */
const STRIP_RADIUS = 7;

function displayTime(value: string | null) { return value ? value : "Unknown"; }

/** Tipoff in the slate's Eastern frame, e.g. "7:30 PM ET". The full UTC value stays in the title. */
function tipoff(value: string | null): string {
  if (!value) return "Time unknown";
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) return "Time unknown";
  return `${new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit", timeZone: "America/New_York" }).format(parsed)} ET`;
}

function weekday(day: string) {
  return new Intl.DateTimeFormat("en-US", { weekday: "short", timeZone: "UTC" }).format(new Date(`${day}T12:00:00Z`));
}

/** One line of observation state; provenance rows go to Data details. */
function observationLine(cache: LiveCache) {
  const age = cache.age_seconds == null ? "Age unknown" : `${Math.floor(cache.age_seconds)}s old at last read`;
  return `${cache.status.replaceAll("_", " ")}${cache.stale ? " · Stale" : ""}${cache.paused ? " · Shared feed idle" : ""} · ${age}`;
}

function observationRows(cache: LiveCache, prefix = ""): DataDetailRow[] {
  return [
    { label: `${prefix}Acquired`, value: displayTime(cache.acquired_at) },
    { label: `${prefix}Last successful fetch`, value: displayTime(cache.last_success_at) },
    { label: `${prefix}Source time`, value: displayTime(cache.source_time) },
    { label: `${prefix}Next allowed fetch`, value: displayTime(cache.next_poll_at) },
    { label: `${prefix}Namespace`, value: cache.namespace, mono: true },
    { label: `${prefix}Observation`, value: cache.observation_id ?? "Unknown", mono: true },
    { label: `${prefix}SHA-256`, value: cache.content_sha256 ?? "Unknown", mono: true },
    { label: `${prefix}HTTP date`, value: displayTime(cache.http_date) },
    { label: `${prefix}Last poll`, value: displayTime(cache.last_poll_at) },
  ];
}

function Observation({ cache }: { cache: LiveCache }) {
  return <p className="live-observation-line">
    <span>{observationLine(cache)}</span>
    {cache.error && <span role="alert" className="live-observation-error">{cache.error}</span>}
  </p>;
}

function PlayerBoxes({ players, games }: { players: LivePlayer[] | null | undefined; games: LiveGame[] }) {
  if (!players?.length) return <GatedNote why="Missing rows do not establish nonappearance or injury.">Player boxes unknown.</GatedNote>;
  const teamIds = [...new Set(players.map(p => p.team_source_id))];
  return <>{teamIds.map(id => {
    const rows = players.filter(p => p.team_source_id === id);
    const columns = [...new Set(rows.flatMap(p => Object.keys(p.statistics)))];
    const team = games.flatMap(g => g.teams).find(t => t.source_id === id);
    return <section key={id} className="live-box-section"><h3>{team?.name ?? `Source team ${id}`} · Player boxes</h3><div className="live-table-scroll" role="region" aria-label={`${team?.name ?? id} player box table`} tabIndex={0}><table className="data-table live-box-table"><thead><tr><th scope="col">Player</th><th scope="col">Appearance / identity</th>{columns.map(c => <th scope="col" key={c}>{c}</th>)}</tr></thead><tbody>{rows.map((p,i) => <tr key={`${p.source_id}-${i}`}><th scope="row">{p.name}</th><td>{p.appearance_label ?? (p.reported_nonappearance === true ? "Reported nonappearance" : p.reported_nonappearance === false ? "Reported participation" : "Appearance unknown")} · {p.identity_status}</td>{columns.map(c => <td key={c}>{p.reported_nonappearance === true ? "—" : p.statistics[c] ?? "—"}</td>)}</tr>)}</tbody></table></div></section>;
  })}</>;
}

/** Logo only through a verified canonical ID; unmapped source teams never get a guessed logo. */
function TeamMark({ team }: { team: LiveGame["teams"][number] }) {
  return team.canonical_id
    ? <TeamLogo team={team.canonical_id} size={24} />
    : <span className="live-team-initials" aria-hidden="true">{team.name.split(/\s+/).map(word => word[0]).join("").slice(0, 2)}</span>;
}

function awayFirst(game: LiveGame) {
  return [...game.teams].sort((a,b) => a.side === b.side ? 0 : a.side === "away" ? -1 : 1);
}

function GameCard({ game, href, selected }: { game: LiveGame; href: string; selected: boolean }) {
  const teams = awayFirst(game);
  const label = `${teams.map(t => `${t.name} ${t.score ?? "score unknown"}`).join(" at ")} · ${gameStatus(game)} · ${tipoff(game.event_time)}`;
  return <Link className="live-game-card" href={href} aria-current={selected ? "page" : undefined} aria-label={label}>
    <span className="live-game-meta">
      <span className="live-game-status">{game.status === "in_progress" && <span className="live-status-dot" aria-hidden="true" />}{gameStatus(game)}</span>
      {/* Finalized research rows often carry no tipoff; the unknown time stays in the card's label. */}
      {game.event_time && <span className="live-game-time" title={game.event_time}>{tipoff(game.event_time)}</span>}
    </span>
    {teams.map(t => <span className="live-score-row" key={t.source_id}>
      <TeamMark team={t} />
      <span className="live-team-name">{t.name}</span>
      <strong className="live-team-score">{t.score ?? "—"}</strong>
    </span>)}
  </Link>;
}

function DateStrip({ slate, counts, countKey, href }: {
  slate: string;
  counts: ScheduleDatesResponse | null;
  countKey: "scheduled" | "finals";
  href: (day: string) => string;
}) {
  const days = Array.from({ length: STRIP_RADIUS * 2 + 1 }, (_, i) => shiftSlate(slate, i - STRIP_RADIUS));
  const today = easternToday();
  const listRef = useRef<HTMLOListElement>(null);
  // On narrow screens the strip scrolls; centre the selected day inside it without moving the page.
  useEffect(() => {
    const list = listRef.current;
    const current = list?.querySelector<HTMLElement>('[aria-current="date"]');
    if (!list || !current) return;
    const box = list.getBoundingClientRect(), item = current.getBoundingClientRect();
    list.scrollLeft += item.left - box.left - (box.width - item.width) / 2;
  }, [slate]);
  return <nav className="live-date-strip" aria-label="Live dates">
    <Link className="live-date-step" href={href(shiftSlate(slate, -STRIP_RADIUS))} aria-label="Earlier dates"><Icon name="left" size={16} /></Link>
    <ol className="live-date-list" ref={listRef}>
      {days.map(day => {
        const count = counts?.days.find(d => d.date === day)?.[countKey];
        const empty = count === 0;
        return <li key={day}>
          <Link
            href={href(day)}
            className="live-date"
            aria-current={day === slate ? "date" : undefined}
            data-empty={empty || undefined}
            aria-label={`${formatDate(day)}${count == null ? "" : ` · ${count} ${count === 1 ? "game" : "games"}`}`}
          >
            <span className="live-date-weekday">{day === today ? "Today" : weekday(day)}</span>
            <span className="live-date-day">{formatDate(day, "compact")}</span>
            <span className="live-date-count" aria-hidden="true">{count == null ? "" : count}</span>
          </Link>
        </li>;
      })}
    </ol>
    <Link className="live-date-step" href={href(shiftSlate(slate, STRIP_RADIUS))} aria-label="Later dates"><Icon name="right" size={16} /></Link>
  </nav>;
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
  const [counts, setCounts] = useState<ScheduleDatesResponse | null>(null);
  const [connection, setConnection] = useState("Loading cached observations");
  const [readError, setReadError] = useState<string | null>(null);
  const [leaseError, setLeaseError] = useState<string | null>(null);
  const [performers, setPerformers] = useState<LivePlayer[]>([]);

  function href(day: string, id?: string, mode = historical) {
    const search = new URLSearchParams(query);
    for (const key of ["fallbackFrom", "fallbackReason", "nextGamesDate"]) search.delete(key);
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
      } catch { if (active(value)) setReadError("Offline or service unavailable. Last observation retained; its acquisition time is in Data details."); }
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

  // Date-strip counts come from the release's retained schedule and finals; they never create Live
  // demand. In Finals the research scope (release, phase, explicit cutoff) narrows them too.
  useEffect(() => {
    if (!validSlate(slate)) return;
    let live = true;
    getScheduleDates({
      start: shiftSlate(slate, -STRIP_RADIUS),
      end: shiftSlate(slate, STRIP_RADIUS),
      focus: slate,
      releaseId: params.get("releaseId") ?? undefined,
      phase: historical ? params.get("phase") ?? "regular_season" : undefined,
      beforeDate: historical ? params.get("beforeDate") ?? undefined : undefined,
    }).then(value => { if (live) setCounts(value); }).catch(() => { if (live) setCounts(null); });
    return () => { live = false; };
  }, [slate, historical, params]);

  // Only the parameter-free landing can move automatically. Explicit dates and game links stay exact.
  useEffect(() => {
    if (date || gameId || params.get("date") || historical || !counts?.nearest_finals.before) return;
    const todayCount = counts.days.find(day => day.date === slate)?.scheduled;
    if (cache?.data?.games?.length || (!cache && todayCount !== 0)) return;
    let active = true;
    getWorkbenchCatalog(counts.release_id).then(catalog => {
      if (!active) return;
      const recent = counts.nearest_finals.before!;
      const scope = catalog.stats_scopes?.find(scope => scope.coverage_start <= recent && scope.coverage_end >= recent);
      if (!scope) return;
      const next = new URLSearchParams(query);
      next.set("date", recent); next.set("live_mode", "history"); next.set("releaseId", counts.release_id);
      next.set("season", scope.season); next.set("phase", scope.phase); next.set("beforeDate", shiftSlate(recent,1)); next.set("fallbackFrom", slate);
      if (counts.nearest_scheduled.after) next.set("nextGamesDate",counts.nearest_scheduled.after);
      next.set("fallbackReason", cache?.data ? "empty" : "unavailable");
      router.replace(`/live?${next}`, { scroll: false });
    }).catch(() => {});
    return () => { active = false; };
  }, [cache, counts, date, gameId, historical, params, query, router, slate]);

  useEffect(() => {
    if (!params.get("fallbackFrom") || !history?.games.length || gameId) return;
    let active = true;
    const games = history.games.slice(0, 30);
    // Bounded retained reads; no Live demand or new acquisition.
    Promise.all(games.map(game => {
      const next = new URLSearchParams(query); next.set("slate_date",slate); next.set("game_id",game.source_id);
      return liveRequest<HistoricalSlate>(`/historical?${next}`).catch(() => null);
    })).then(results => {
      if (!active) return;
      const players = results.flatMap(result => result?.players ?? []).filter(player => player.reported_nonappearance !== true && player.statistics.points != null && Number.isFinite(Number(player.statistics.points)));
      players.sort((a,b) => Number(b.statistics.points)-Number(a.statistics.points) || a.source_id.localeCompare(b.source_id));
      setPerformers(players.slice(0,3));
    });
    return () => { active = false; };
  }, [history, query, slate, gameId, params]);

  const games = historical ? history?.games ?? [] : cache?.data?.games ?? [];
  const selected = historical ? games.find(g => g.source_id === gameId) : box?.data?.game;
  const countKey = historical ? "finals" : "scheduled";
  const nearest = counts ? (historical ? counts.nearest_finals : counts.nearest_scheduled) : null;
  // A slate is known only once observed: a cache without data is unknown, never "0 games".
  const loaded = historical ? history != null : cache?.data != null;
  const section = historical ? "finals" : "live";

  const detailRows: DataDetailRow[] = [
    { label: "Mode", value: historical ? "Finalized research (admitted finals, no Live demand)" : "Provisional ESPN observations" },
    { label: "Slate", value: `${slate} (Eastern)`, mono: true },
    ...(gameId ? [{ label: "Selected source game", value: gameId, mono: true }] : []),
    ...(historical && history ? [
      { label: "Research release", value: history.context.release_id, mono: true },
      { label: "Dataset", value: history.context.dataset_id, mono: true },
      { label: "Season / phase", value: `${history.context.season} / ${history.context.phase}` },
      { label: "Exclusive cutoff", value: history.context.before_date, mono: true },
      { label: "Status", value: history.status.replaceAll("_", " ") },
      ...history.warnings.map((warning, i) => ({ label: i ? "" : "Warnings", value: warning })),
    ] : []),
    ...(!historical && cache ? observationRows(cache) : []),
    ...(!historical && box ? observationRows(box, "Selected game · ") : []),
    ...(counts ? [{ label: "Date counts", value: `${historical ? "Admitted finals" : "Retained schedule"} · dataset ${counts.dataset_id}`, mono: true }] : []),
  ];

  const statusLine = <p role="status" className="live-connection">{connection}{!historical && cache ? ` · ${observationLine(cache)}` : ""}</p>;
  const datePicker = <Field label="Date" layout="inline">
    <DatePicker label="Slate date" value={valid ? slate : ""} onChange={day => { if (validSlate(day)) router.push(href(day)); }} />
  </Field>;
  // A selected-game read returns only that game, so the slate size is not known there.
  const countChip = loaded && !gameId ? <CountChip>{games.length} {games.length === 1 ? "game" : "games"}</CountChip> : undefined;

  return <PageShell template="board" className="live-workspace">
    {gameId && valid && <BackButton parent={{ href: href(slate), label: historical ? "Finals" : "Live" }} />}
    <LiveBoardHeader
      section={section}
      slate={valid ? slate : undefined}
      subtitle={params.get("fallbackFrom") ? `Most recent finals · ${formatDate(slate)} · ${params.get("fallbackReason") === "empty" ? "No games today" : "Live unavailable"}.` : historical ? `Admitted finals for ${valid ? formatDate(slate) : "the selected date"}.` : `Provisional scores for ${valid ? formatDate(slate) : "the selected date"}, Eastern slate.`}
      // Pausing only applies to Live demand; finalized research never polls.
      actions={historical ? undefined : <Button size="sm" variant="secondary" onClick={() => setPaused(!paused)} pressed={paused} icon={paused ? "play" : "pause"}>{paused ? "Resume Updates" : "Pause Updates"}</Button>}
    />
    {historical
      ? <ContextBar
          showWindow={false}
          showThrough={false}
          initialSeason={history?.context.season}
          initialPhase="regular_season"
          initialBeforeDate={valid ? shiftSlate(slate, 1) : undefined}
          sampleSize={loaded && !gameId ? games.length : undefined}
          filters={datePicker}
          detailRows={detailRows}
        />
      : <FilterBar label="Live controls" scope={datePicker} summary={valid ? formatDate(slate, "compact") : undefined} count={countChip} details={<DataDetailsButton rows={detailRows} />} />}
    {/* An invalid date has no slate; its status still says why. */}
    {!valid && statusLine}
    {valid && <DateStrip slate={slate} counts={counts} countKey={countKey} href={day => href(day)} />}
    {!historical && cache?.error && <p role="alert" className="live-alert">{cache.error}</p>}
    {(readError || leaseError) && <p role="alert" className="live-alert">{readError ?? leaseError}</p>}
    {valid && <>
      <section aria-label="Game slate" className="live-game-grid">{games.map(g => <GameCard key={g.source_id} game={g} href={href(slate, g.source_id)} selected={gameId === g.source_id} />)}</section>
      {params.get("fallbackFrom") && <>
        <section className="pc04-performers" aria-label="Top performers"><h2>Top Performers · Points</h2>{performers.map(player => <PlayerIdentity key={player.source_id} playerId={player.canonical_id ?? undefined} name={player.name} team={games.flatMap(game=>game.teams).find(team=>team.source_id===player.team_source_id)?.canonical_id} size="lg" subtitle={`${player.statistics.points} PTS · ${formatDate(slate,"compact")}`} />)}<p className="chart-provenance">Source: admitted final player boxes · {games.length} games. Missing player points are excluded.</p></section>
        <nav className="pc04-next-games" aria-label="Next games"><strong>Next Games</strong>{(params.get("nextGamesDate") || counts?.nearest_scheduled.after) ? <ButtonLink size="lg" href={href((params.get("nextGamesDate") || counts?.nearest_scheduled.after)!,undefined,false)}>{formatDate((params.get("nextGamesDate") || counts?.nearest_scheduled.after)!)}</ButtonLink> : <span>Next retained schedule date unknown.</span>}</nav>
      </>}
      {!games.length && (loaded || !historical) && <GatedNote
        action={loaded && nearest && (nearest.before || nearest.after) ? <span className="live-jumps">
          {nearest.before && <ButtonLink size="lg" href={href(nearest.before)} icon="left">{formatDate(nearest.before, "compact")}</ButtonLink>}
          {nearest.after && <ButtonLink size="lg" href={href(nearest.after)} iconAfter="right">{formatDate(nearest.after, "compact")}</ButtonLink>}
        </span> : undefined}
        why={historical
          ? "No admitted finals in this release, phase and date. Coverage is unknown outside retained facts."
          : cache?.data ? "No games in the observed source slate." : "Awaiting a cached slate. Acquisition may be disabled or the worker may be idle."}
      >{historical ? `No admitted finals on ${formatDate(slate, "compact")}.` : cache?.data ? `No games on ${formatDate(slate, "compact")}.` : "Awaiting a cached slate."}</GatedNote>}
      {/* Glance item 3: the slate starts directly under the strip; connection state follows it. */}
      {statusLine}
      {!historical && <GatedNote why="Live scores and player boxes are provisional source observations. Cached finals require independent admission and reconciliation. Several tabs share one bounded worker feed.">Scores are provisional until finals are admitted.</GatedNote>}
      {gameId && <section aria-label="Selected game details" className="live-selected">
        <h2>{selected ? awayFirst(selected).map(t => t.name).join(" at ") : "Selected game"}</h2>
        {!historical && box && <Observation cache={box} />}
        {selected ? <>
          <p className="live-selected-meta"><span className="live-game-status inline-status">{selected.status === "in_progress" && <span className="live-status-dot" aria-hidden="true" />}{gameStatus(selected)}</span> · Actual slate: {formatDate(selected.slate_date)} · {tipoff(selected.event_time)} · {selected.provisional ? "Provisional" : "Finalized research"} · Game identity: {selected.identity_status}</p>
          <div className="live-team-boxes">{awayFirst(selected).map(t => <div key={t.source_id} className="live-team-box">
            <span className="live-team-box-head"><TeamMark team={t} /><strong>{t.name}</strong><strong className="live-team-score">{t.score ?? "Unknown"}</strong></span>
            <p>{historical ? "Admitted team score" : "Provisional observed team score"}</p>
            {historical && t.statistics && <details><summary>Finalized Team Box Statistics</summary><dl>{Object.entries(t.statistics).map(([key,value]) => <div key={key}><dt>{key}</dt><dd>{value ?? "—"}</dd></div>)}</dl></details>}
          </div>)}</div>
          {!historical && (box?.data?.team_sections?.length ? box.data.team_sections.map((section,i) => <div key={i} className="live-table-scroll" role="region" aria-label={`${section.team.displayName ?? section.team.id} team statistics`} tabIndex={0}><table className="data-table"><caption>{section.team.displayName ?? section.team.id} · Source-labelled team box</caption><tbody>{section.statistics?.map((stat,j) => <tr key={j}><th scope="row">{stat.label ?? stat.name ?? "Unknown statistic"}</th><td>{stat.displayValue ?? "—"}</td></tr>)}</tbody></table></div>) : <p className="live-muted">Additional team box statistics unknown.</p>)}
          <PlayerBoxes players={historical ? history?.players : box?.data?.players} games={[selected]} />
        </> : <GatedNote>Selected game detail unknown in this cache or finalized research context.</GatedNote>}
      </section>}
    </>}
  </PageShell>;
}

export function LiveWorkspace(props: { date?: string; gameId?: string }) {
  const params = useSearchParams();
  return <LiveWorkspaceContent key={`${props.date ?? ""}:${props.gameId ?? ""}:${params.toString()}`} {...props} />;
}
