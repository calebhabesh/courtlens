"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect } from "react";
import { easternToday, nearestGameDate, seasonOf, validSlate, type LiveGameData, type LiveRead, type LiveSlateData } from "@/lib/live";
import { useLiveRead } from "@/lib/use-live-read";
import { formatDate } from "@/lib/format-date";
import { AllGamesRail, DateStrip, GameCard } from "./live-board";
import { GAME_TABS, GameBanner, GameTabs, teamColors, type GameTab } from "./live-game";
import { DataDetailsButton, type DataDetailRow } from "./ui/data-details";
import { DatePicker } from "./ui/date-picker";
import { GatedNote } from "./ui/gated-note";
import { Icon } from "./ui/icon";
import { PageShell } from "./ui/page-shell";
import { PageHeader } from "./ui/panel";

function ago(seconds: number | null) {
  if (seconds == null) return "not read yet";
  if (seconds < 60) return `read ${Math.max(0, Math.round(seconds))}s ago`;
  if (seconds < 3600) return `read ${Math.round(seconds / 60)} min ago`;
  return `read ${formatDate(new Date(Date.now() - seconds * 1000).toISOString().slice(0, 10), "compact")}`;
}

function detailRows(read: LiveRead<unknown> | null, prefix = ""): DataDetailRow[] {
  if (!read) return [];
  return [
    { label: `${prefix}Source`, value: "ESPN (site API), read by the CourtLens API on demand" },
    { label: `${prefix}Resource`, value: read.resource, mono: true },
    { label: `${prefix}Read at`, value: read.acquired_at ?? "Not read yet" },
    { label: `${prefix}Source time`, value: read.source_time ?? "Not reported" },
    { label: `${prefix}State`, value: read.final ? "Final: kept as hashed evidence, not read again" : read.refresh_seconds ? `Refreshes every ${read.refresh_seconds}s while open` : "Awaiting a read" },
    ...(read.observation_id ? [{ label: `${prefix}Observation`, value: read.observation_id, mono: true }] : []),
    ...(read.content_sha256 ? [{ label: `${prefix}SHA-256`, value: read.content_sha256, mono: true }] : []),
    ...(read.error ? [{ label: `${prefix}Last error`, value: read.error }] : []),
  ];
}

/** Ignore hotkeys while typing or with a modifier held. */
function typing(event: KeyboardEvent) {
  const target = event.target as HTMLElement | null;
  return event.metaKey || event.ctrlKey || event.altKey || !!target?.closest("input, textarea, select, [contenteditable=true], [role=dialog]");
}

function SourceLine({ read, rows }: { read: LiveRead<unknown> | null; rows: DataDetailRow[] }) {
  return <p className="live-source" role="status">
    <span>Source: ESPN · {read ? ago(read.age_seconds) : "loading"}{read?.stale ? " · stale" : ""}</span>
    {read?.error && <span className="live-source-error">ESPN unavailable ({read.error}); showing the last read.</span>}
    <DataDetailsButton rows={rows} />
  </p>;
}

function Board({ slate, explicit }: { slate: string; explicit: boolean }) {
  const router = useRouter();
  const { read, error } = useLiveRead<LiveSlateData>(`?slate_date=${slate}`);
  const games = read?.data?.games ?? [];
  const href = (day: string) => `/live/${day}`;
  const gameHref = (id: string) => `/live/games/${id}?date=${slate}`;

  // Only the parameter-free landing moves: an empty today opens the nearest date with games.
  useEffect(() => {
    if (explicit || !read?.data || games.length) return;
    const target = nearestGameDate(read.data.calendar, slate);
    if (target) router.replace(href(target), { scroll: false });
  }, [explicit, read, games.length, slate, router]);

  useEffect(() => {
    function key(event: KeyboardEvent) {
      if (typing(event) || !/^[1-9]$/.test(event.key)) return;
      const game = games[Number(event.key) - 1];
      if (game) { event.preventDefault(); router.push(gameHref(game.source_id)); }
    }
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  });

  return <>
    <div className="sr-only"><PageHeader title={`Live · ${formatDate(slate)}`} /></div>
    <div className="live-strip-row">
      <DateStrip slate={slate} calendar={read?.data?.calendar} href={href} />
      <span className="live-strip-picker"><DatePicker label="Go to date" value={slate} onChange={day => { if (validSlate(day)) router.push(href(day)); }} /></span>
    </div>
    <div className="live-tip-row"><p className="live-tip"><Icon name="keyboard" size={14} />Tip: Press 1-9 to open a game. In detail view, 1-9 jumps between games.</p></div>
    {error && !read && <p role="alert" className="live-alert">{error}</p>}
    {games.length > 0 && <section aria-label="Game slate">
      <ol className="live-grid">{games.map((game, i) => <li key={game.source_id}><GameCard game={game} index={i} href={gameHref(game.source_id)} /></li>)}</ol>
    </section>}
    {read?.data && !games.length && <GatedNote>No games on {formatDate(slate, "compact")}.</GatedNote>}
    {!read && !error && <p className="live-loading" aria-live="polite">Loading games…</p>}
    {read && read.status !== "observed" && !read.data && <GatedNote why={read.error ?? undefined}>ESPN hasn&apos;t answered for this date yet.</GatedNote>}
    <SourceLine read={read} rows={detailRows(read)} />
  </>;
}

/** A game that hasn't started opens on Pre-Game (follow-up 7); others on Summary. */
export function defaultTab(status: string | undefined): GameTab {
  return status === "scheduled" || status === "postponed" || status === "cancelled" ? "pregame" : "summary";
}

function Game({ gameId, slate, requested }: { gameId: string; slate: string; requested: GameTab | null }) {
  const router = useRouter();
  const { read, error } = useLiveRead<LiveGameData>(`/games/${gameId}?slate_date=${slate}`);
  const { read: slateRead } = useLiveRead<LiveSlateData>(`?slate_date=${slate}`);
  const games = slateRead?.data?.games ?? [];
  const index = games.findIndex(g => g.source_id === gameId);
  const data = read?.data ?? null;
  const backHref = `/live/${slate}`;
  const fallback = defaultTab(data?.game.status);
  const tab = requested ?? fallback;
  // Jumping games keeps a tab the viewer chose; otherwise each game opens on its own default.
  const gameHref = (id: string) => `/live/games/${id}?date=${slate}${requested ? `&tab=${requested}` : ""}`;

  function setTab(next: GameTab) {
    const search = new URLSearchParams(window.location.search);
    if (next === fallback) search.delete("tab"); else search.set("tab", next);
    router.replace(`/live/games/${gameId}?${search}`, { scroll: false });
  }

  useEffect(() => {
    function key(event: KeyboardEvent) {
      if (typing(event)) return;
      if (/^[1-9]$/.test(event.key)) {
        const game = games[Number(event.key) - 1];
        if (game) { event.preventDefault(); router.push(gameHref(game.source_id)); }
      } else if (event.key === "Escape") {
        event.preventDefault(); router.push(backHref);
      } else if (event.key === "Tab" && (document.activeElement === document.body || document.activeElement == null)) {
        // Tab cycles the views only while nothing is focused; otherwise it moves focus as usual.
        event.preventDefault();
        // The URL is the tab's source of truth: a quick second press can beat the re-render.
        const current = new URLSearchParams(window.location.search).get("tab") ?? fallback;
        const at = Math.max(0, GAME_TABS.findIndex(t => t.value === current));
        setTab(GAME_TABS[(at + (event.shiftKey ? GAME_TABS.length - 1 : 1)) % GAME_TABS.length].value);
      } else if (event.key === "q" || event.key === "w") {
        event.preventDefault();
        const side = event.key === "q" ? "away" : "home";
        if (tab !== "box") setTab("box");
        requestAnimationFrame(() => requestAnimationFrame(() => {
          const box = document.getElementById(`live-box-${side}`);
          box?.focus({ preventScroll: true });
          box?.scrollIntoView({ block: "nearest", behavior: "smooth" });
        }));
      }
    }
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  });

  return <>
    {data ? <div className="live-game" style={teamColors(data.game.teams, seasonOf(data.game.slate_date))}>
      <GameBanner game={data.game} index={index < 0 ? 99 : index} backHref={backHref} />
      <GameTabs tab={tab} onTab={setTab} data={data} />
    </div> : <>
      <div className="sr-only"><PageHeader title="Live game" /></div>
      {!read && !error && <p className="live-loading" aria-live="polite">Loading game…</p>}
      {(error || read) && <GatedNote why={read?.error ?? error ?? undefined}>This game isn&apos;t available from ESPN right now.</GatedNote>}
    </>}
    <SourceLine read={read} rows={[...detailRows(read), { label: "Slate date", value: `${slate} (Eastern)`, mono: true }]} />
    <AllGamesRail games={games} current={gameId} href={id => gameHref(id)} />
  </>;
}

function LiveWorkspaceContent({ date, gameId }: { date?: string; gameId?: string }) {
  const params = useSearchParams();
  const requested = date ?? params.get("date");
  const slate = requested ?? easternToday();
  const requestedTab = GAME_TABS.find(t => t.value === params.get("tab"))?.value ?? null;
  const valid = validSlate(slate) && (!gameId || /^[0-9]{1,20}$/.test(gameId));
  return <PageShell template="board" className="live-page" data-view={gameId ? "game" : "board"}>
    {!valid ? <>
      <div className="sr-only"><PageHeader title="Live" /></div>
      <p role="status" className="live-alert">Invalid date or game ID.</p>
    </> : gameId ? <Game gameId={gameId} slate={slate} requested={requestedTab} /> : <Board slate={slate} explicit={requested != null} />}
  </PageShell>;
}

export function LiveWorkspace(props: { date?: string; gameId?: string }) {
  return <LiveWorkspaceContent {...props} />;
}
