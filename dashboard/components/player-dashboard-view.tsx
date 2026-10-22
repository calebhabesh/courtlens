"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { executeWorkbenchQuery, getPlayerDashboardFeeds, getPlayerSeasons } from "@/lib/workbench-api";
import { teamBrandColor } from "@/lib/team-colors";
import {
  BASIC_GROUPS, CAROUSEL_MIN_MINUTES, DEFENSE_GROUPS, IMPACT_FIRST_SEASON, MAX_PANELS, OFFENSE_GROUPS, RATING_GROUPS, SIX_FACTORS,
  cellValue, compareLink, factorDots, formatCell, formatDifference, hasScope, panelQuery, panelsParam, rapmGroup, rapmYears, readDashboardState, stateParams,
  surname, toggleVersus, versusAfterRemove, versusCell,
  type CellDef, type CellGroup, type PanelSpec, type Phase, type Rate,
} from "@/lib/player-dashboard";
import type { PlayerDashboardFeeds, PlayerDashboardPlayFamily, PlayerResearchItem, WorkbenchCatalog } from "@/lib/types";
import { seasonOptionLabel } from "@/lib/season-basis";
import { PlayerPortrait } from "./player-portrait";
import { TeamWatermark } from "./team-watermark";
import { teamRecord } from "./compare-player-slot";
import { LookupInput } from "./lookup-input";
import { StatsTeamSelect } from "./stats-page-controls";
import { PageHeader } from "./ui/panel";
import { ControlScope } from "./ui/control-scope";
import { Icon } from "./ui/icon";
import { Tooltip } from "./ui/tooltip";
import { Chip, IconButton, IconButtonLink, Select } from "./ui/kit";

const BLURB = "Pick players from the season's DARKO leaders or search, then compare them in compact panels.";

export interface DashboardCarousel {
  season: string;
  team: string | null;
  players: PlayerResearchItem[];
}

interface PanelData {
  player: PlayerResearchItem | null;
  feeds: PlayerDashboardFeeds | null;
  seasons: string[];
  error: boolean;
}

// One read per player-season-phase, shared by a panel and the head-to-head that uses it.
const panelCache = new Map<string, Promise<PanelData>>();

function loadPanel(catalog: WorkbenchCatalog, panel: PanelSpec): Promise<PanelData> {
  const key = `${catalog.release_id}:${panel.playerId}:${panel.season}:${panel.phase}`;
  let hit = panelCache.get(key);
  if (!hit) {
    const { query, presentation } = panelQuery(catalog, panel);
    hit = Promise.allSettled([
      hasScope(catalog, panel.season, panel.phase) ? executeWorkbenchQuery(query, presentation) : Promise.reject(new Error("no scope")),
      getPlayerDashboardFeeds(panel.playerId, panel.season, panel.phase),
      getPlayerSeasons([panel.playerId], panel.phase, catalog.release_id),
    ]).then(([row, feeds, seasons]) => ({
      player: row.status === "fulfilled" ? row.value.items.find(item => item.player_id === panel.playerId) ?? null : null,
      feeds: feeds.status === "fulfilled" ? feeds.value : null,
      seasons: seasons.status === "fulfilled" ? seasons.value.seasons[panel.playerId] ?? [] : [],
      error: row.status === "rejected",
    }));
    hit.catch(() => panelCache.delete(key));
    panelCache.set(key, hit);
  }
  return hit;
}

function usePanelData(catalog: WorkbenchCatalog, panel: PanelSpec): PanelData | null {
  const key = `${panel.playerId}:${panel.season}:${panel.phase}`;
  const [state, setState] = useState<{ key: string; data: PanelData } | null>(null);
  useEffect(() => {
    let live = true;
    loadPanel(catalog, panel).then(data => { if (live) setState({ key, data }); });
    return () => { live = false; };
    // The key covers every field the read depends on.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [catalog, key]);
  return state?.key === key ? state.data : null;
}

export function PlayerDashboardView({ catalog, carousel }: { catalog: WorkbenchCatalog; carousel: DashboardCarousel }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const state = useMemo(() => readDashboardState(params, catalog), [params, catalog]);
  const [pending, setPending] = useState<number | null>(null);
  const [query, setQuery] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);
  const set = useCallback((updates: Partial<Record<string, string | null>>) => {
    router.replace(`${pathname}?${stateParams(new URLSearchParams(params.toString()), updates)}`, { scroll: false });
  }, [router, pathname, params]);
  const setPanels = (panels: PanelSpec[], versus: [number, number] | null = state.versus) =>
    set({ p: panelsParam(panels), vs: versus ? versus.join(".") : null });

  const add = (playerId: string) => {
    if (state.panels.length >= MAX_PANELS) return;
    setPanels([...state.panels, { playerId, season: state.season, phase: "regular_season", advanced: true, rate: "per_36" }]);
  };
  const remove = (index: number) => {
    setPending(null);
    setPanels(state.panels.filter((_, at) => at !== index), versusAfterRemove(state.versus, index));
  };
  const update = (index: number, change: Partial<PanelSpec>) => setPanels(state.panels.map((panel, at) => at === index ? { ...panel, ...change } : panel));
  const swap = (index: number) => {
    const next = toggleVersus(state.versus, pending, index);
    setPending(next.pending);
    set({ vs: next.versus ? next.versus.join(".") : null });
  };

  // Databallr's "Press 1": focus the search from anywhere outside a field.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (event.key !== "1" || event.metaKey || event.ctrlKey || event.altKey) return;
      if (target && (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName))) return;
      event.preventDefault();
      searchRef.current?.focus();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const seasons = catalog.seasons ?? [];
  const index = seasons.indexOf(state.season);
  const full = state.panels.length >= MAX_PANELS;
  return <div className="pd-page" role="region" aria-label="Player Dashboard">
    <PageHeader className="pvp-header" icon="dashboard" title="Player Dashboard" subtitle={BLURB} />
    <ControlScope tone="console">
      <div className="pd-scope" role="group" aria-label="Carousel season and team">
        <div className="pd-season-step" role="group" aria-label="Season">
          <IconButton size="sm" icon="left" label="Previous season" disabled={index <= 0} onClick={() => set({ season: seasons[index - 1] ?? null })} />
          <Select size="sm" aria-label="Season" value={state.season} onChange={event => set({ season: event.target.value })}>
            {[...seasons].reverse().map(season => <option key={season} value={season}>{seasonOptionLabel(season)}</option>)}
          </Select>
          <IconButton size="sm" icon="right" label="Next season" disabled={index < 0 || index >= seasons.length - 1} onClick={() => set({ season: seasons[index + 1] ?? null })} />
        </div>
        <StatsTeamSelect />
      </div>
    </ControlScope>
    <Carousel carousel={carousel} chosen={new Set(state.panels.filter(panel => panel.season === carousel.season).map(panel => panel.playerId))} full={full} onPick={add} />
    <ControlScope tone="console">
      <div className="pd-search">
        <LookupInput label="Add a player" placeholder={full ? `Up to ${MAX_PANELS} players; close one to add another` : `Search ${state.season} Players…`} value={query} onChange={setQuery}
          kinds={["player"]} season={state.season} limit={10} inputRef={searchRef} disabled={full} portalDropdown dropdownMinWidth={360}
          onSelect={item => { setQuery(""); add(item.canonical_id); }} />
      </div>
    </ControlScope>
    <div className="pd-panels">
      {state.panels.map((panel, at) => <Panel key={`${at}:${panel.playerId}`} catalog={catalog} panel={panel} index={at}
        swapped={state.versus?.includes(at) || pending === at} onChange={change => update(at, change)} onClose={() => remove(at)} onSwap={() => swap(at)} />)}
      {state.versus && state.panels[state.versus[0]] && state.panels[state.versus[1]] &&
        <VersusPanel catalog={catalog} a={state.panels[state.versus[0]]} b={state.panels[state.versus[1]]} onClose={() => { setPending(null); set({ vs: null }); }} />}
      {!full && <button type="button" className="pd-add" onClick={() => searchRef.current?.focus()}>
        <span className="pd-add-icon"><Icon name="plus" size={20} /></span>
        <span>Add Player</span>
        <kbd>Press 1</kbd>
      </button>}
    </div>
    {pending !== null && !state.versus && <p className="pd-note" role="status">Choose a second panel&apos;s swap button to compare head to head.</p>}
  </div>;
}

/** Top 50 by DARKO DPM: Databallr's card marquee. It drifts right to left and stops while the pointer
 * or focus is on it; a card adds that player as a panel. A strip that fits the width stands still. */
function Carousel({ carousel, chosen, full, onPick }: { carousel: DashboardCarousel; chosen: Set<string>; full: boolean; onPick: (id: string) => void }) {
  const frame = useRef<HTMLDivElement>(null);
  const group = useRef<HTMLDivElement>(null);
  const [loop, setLoop] = useState(false);
  useEffect(() => {
    const outer = frame.current;
    const inner = group.current;
    if (!outer || !inner) return;
    const measure = () => setLoop(inner.scrollWidth > outer.clientWidth);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(outer);
    observer.observe(inner);
    return () => observer.disconnect();
  }, [carousel.players]);
  const cards = (copy: boolean) => carousel.players.map((player, rank) => <DashboardCard key={player.player_id} player={player} rank={rank + 1} season={carousel.season}
    chosen={chosen.has(player.player_id)} disabled={full} onPick={onPick} copy={copy} />);
  return <section className="pd-carousel" aria-label={`Top ${carousel.players.length} by DARKO DPM, ${carousel.season}`}>
    <p className="pd-carousel-title">Top {carousel.players.length} by DARKO DPM · {carousel.season}{carousel.team ? ` · ${carousel.team}` : ` · ${CAROUSEL_MIN_MINUTES}+ minutes`}</p>
    <div className="pd-marquee" ref={frame} data-loop={loop || undefined}
      style={{ "--pd-marquee-seconds": Math.max(20, carousel.players.length * 3) } as CSSProperties}>
      <div className="pd-marquee-track">
        <div className="pd-marquee-group" ref={group} role="list" aria-label="Players">{cards(false)}</div>
        {/* The second copy closes the loop; it is hidden from assistive tech and the tab order. */}
        {loop && <div className="pd-marquee-group" aria-hidden="true" inert>{cards(true)}</div>}
      </div>
      {!carousel.players.length && <p className="pd-empty">No DARKO DPM leaders for this season and team.</p>}
    </div>
  </section>;
}

function DashboardCard({ player, rank, season, chosen, disabled, onPick, copy }: {
  player: PlayerResearchItem; rank: number; season: string; chosen: boolean; disabled: boolean; onPick: (id: string) => void; copy: boolean;
}) {
  const team = player.teams.at(-1) ?? null;
  const tint = teamBrandColor(team, season);
  const record = teamRecord(team ?? undefined, season);
  const dpm = typeof player.metrics.dpm === "number" ? player.metrics.dpm : null;
  return <div role={copy ? undefined : "listitem"} className="pd-card-item">
    <button type="button" className="pd-card" data-chosen={chosen || undefined} disabled={disabled && !chosen} tabIndex={copy ? -1 : undefined}
      style={tint ? ({ "--team-tint": tint } as CSSProperties) : undefined}
      aria-label={`${rank}. ${player.player_name}, DPM ${formatCell(dpm, "signed1")}${chosen ? ", shown below" : ". Add to the dashboard"}`}
      onClick={() => onPick(player.player_id)}>
      <span className="pd-card-photo">
        {record && <TeamWatermark asset={record.asset} />}
        <PlayerPortrait playerId={player.player_id} name={player.player_name} portraitUrl={player.portrait_url} size="xl" className="pd-card-portrait" era={{ season, team }} />
        <span className="pd-card-badge pd-card-rank">#{rank}</span>
        <span className="pd-card-badge pd-card-dpm">{formatCell(dpm, "signed1")}</span>
        <span className="pd-card-name">{player.player_name}</span>
        <span className="pd-card-info" aria-hidden="true">
          <strong>{player.player_name}</strong>
          <span>DPM Rank #{rank}</span>
          <span>DPM: {formatCell(dpm, "signed1")}</span>
          {team && <span>{team}</span>}
          <small>{chosen ? "Shown below" : disabled ? "Panels full" : "Click to add"}</small>
        </span>
      </span>
    </button>
  </div>;
}

const PHASE_LABEL: Record<Phase, string> = { regular_season: "RS", playoffs: "PO" };

function Panel({ catalog, panel, index, swapped, onChange, onClose, onSwap }: {
  catalog: WorkbenchCatalog; panel: PanelSpec; index: number; swapped: boolean;
  onChange: (change: Partial<PanelSpec>) => void; onClose: () => void; onSwap: () => void;
}) {
  const data = usePanelData(catalog, panel);
  const player = data?.player ?? null;
  const name = player?.player_name ?? "Loading player";
  const team = player?.teams.at(-1) ?? null;
  const tint = teamBrandColor(team, panel.season);
  const [copied, setCopied] = useState(false);
  const share = () => {
    const url = new URL(window.location.href);
    url.search = new URLSearchParams({ season: panel.season, p: panelsParam([panel]) ?? "" }).toString();
    navigator.clipboard?.writeText(url.toString()).then(() => { setCopied(true); window.setTimeout(() => setCopied(false), 1500); }, () => undefined);
  };
  const seasons = data?.seasons.length ? [...data.seasons].reverse() : [panel.season];
  const feedNote = feedsNote(data?.feeds ?? null, panel.season);
  return <article className="pd-panel" aria-label={`${panel.season} ${name}`} data-swapped={swapped || undefined}>
    <header className="pd-panel-head">
      <span className="pd-panel-avatar" style={tint ? ({ "--team-tint": tint } as CSSProperties) : undefined}>
        <PlayerPortrait playerId={panel.playerId} name={name} portraitUrl={player?.portrait_url} size="md" className="pd-panel-portrait" era={{ season: panel.season, team }} />
        {player?.position && <span className="pd-panel-position" title={`${player.position}: estimated position`}>{player.position}</span>}
      </span>
      <div className="pd-panel-who">
        <h3><Link href={`/players/${panel.playerId}?season=${panel.season}`}>{name}</Link></h3>
        <span className="pd-panel-team">{player?.teams.join(" / ") || "—"}</span>
      </div>
      <div className="pd-panel-actions" role="group" aria-label={`${name} actions`}>
        <IconButton size="sm" variant="ghost" icon={copied ? "check" : "copy"} label={copied ? "Link copied" : `Copy a link to ${name}'s panel`} onClick={share} />
        <IconButtonLink size="sm" icon="fingerprint" href={`/similar-players?playerId=${panel.playerId}&season=${panel.season}`} label={`${panel.season} ${name}'s Player Twins`} />
        <IconButtonLink size="sm" icon="scale" href={compareLink([panel])} label={`Open ${name} in Player Comparison`} />
        <IconButton size="sm" variant="ghost" icon="swap" label={swapped ? `Remove ${name} from the head-to-head` : `Compare ${name} head to head`} pressed={swapped} onClick={onSwap} />
        <IconButton size="sm" variant="ghost" icon="close" label={`Close ${name}`} onClick={onClose} />
      </div>
    </header>
    <div className="pd-panel-controls" role="group" aria-label={`${name} panel options`}>
      <Select size="sm" aria-label={`${name} season`} value={panel.season} onChange={event => onChange({ season: event.target.value })}>
        {seasons.map(season => <option key={season} value={season}>{seasonOptionLabel(season)}</option>)}
      </Select>
      <Chip size="sm" pressed={panel.phase === "playoffs"} title={panel.phase === "playoffs" ? "Playoffs. Show the regular season" : "Regular season. Show the playoffs"}
        onClick={() => onChange({ phase: panel.phase === "playoffs" ? "regular_season" : "playoffs" })}>{PHASE_LABEL[panel.phase]}</Chip>
      <Chip size="sm" pressed={panel.advanced} title={panel.advanced ? "Advanced view. Show the box score" : "Box score. Show the advanced view"} onClick={() => onChange({ advanced: !panel.advanced })}>Advanced</Chip>
      <Chip size="sm" pressed={panel.rate === "per_36"} title={panel.rate === "per_36" ? "Counting stats per 36 minutes. Show per game" : "Counting stats per game. Show per 36 minutes"}
        onClick={() => onChange({ rate: panel.rate === "per_36" ? "per_game" : "per_36" })}>{panel.rate === "per_36" ? "Per 36" : "Per Game"}</Chip>
      <Tooltip content="Each value shows its percentile among the season's qualified players (500+ minutes; tracking 500+ tracked minutes) as a bar and a small number: gold is high, blue is low. Hover a value for its definition.">
        <span className="pd-help" tabIndex={0}><Icon name="help" size={14} /><span className="sr-only">How to read the panel</span></span>
      </Tooltip>
    </div>
    {!data ? <div className="pd-panel-loading" aria-busy="true">Loading {panel.season}…</div>
      : data.error && !player ? <p className="pd-panel-empty">No {panel.season} {panel.phase === "playoffs" ? "playoff" : "regular-season"} games on file for this player.</p>
      : panel.advanced ? <>
        <Block groups={[...RATING_GROUPS, rapmGroup(rapmYears(player))]} data={data} rate={panel.rate} />
        <SixFactors player={player} />
        <Block groups={OFFENSE_GROUPS} data={data} rate={panel.rate} />
        <PlayTypes families={data.feeds?.play_types ?? null} />
        <Block groups={DEFENSE_GROUPS} data={data} rate={panel.rate} />
        {panel.season < IMPACT_FIRST_SEASON && <p className="pd-panel-note">RAPM, six-factor impact and the play-by-play rates (LOAD, rTS%, ORB, DRB%, FOUL% and others) start in {IMPACT_FIRST_SEASON}.</p>}
        {feedNote && <p className="pd-panel-note">{feedNote}</p>}
      </> : <Block groups={BASIC_GROUPS} data={data} rate={panel.rate} />}
    <span className="sr-only">Panel {index + 1}</span>
  </article>;
}

function feedsNote(feeds: PlayerDashboardFeeds | null, season: string): string | null {
  if (!feeds) return "NBA tracking cells could not load.";
  const missing = [
    !feeds.observed.tracking && `passing (from ${feeds.first_seasons.tracking})`,
    !feeds.observed.defense && `defended shots (from ${feeds.first_seasons.defense})`,
    !feeds.observed.hustle && `hustle (from ${feeds.first_seasons.hustle})`,
    !feeds.observed.play_types && `play types (from ${feeds.first_seasons.play_types})`,
  ].filter(Boolean);
  return missing.length ? `No ${season} NBA tracking for ${missing.join(", ")}.` : null;
}

/** Group labels over two rows of cells; the groups' widths follow their cell counts (3 · 1 · 3). */
function Block({ groups, data, rate }: { groups: CellGroup[]; data: PanelData; rate: Rate }) {
  const rows = Math.max(...groups.map(group => group.cells.length));
  return <section className="pd-block" aria-label={groups.map(group => group.label).join(", ")}>
    <div className="pd-block-groups">
      {groups.map(group => <span key={group.label} className="pd-block-group" data-span={group.cells[0].length}>{group.label}</span>)}
    </div>
    {Array.from({ length: rows }, (_, row) => <div key={row} className="pd-block-row">
      {groups.flatMap((group, at) => (group.cells[row] ?? []).map((cell, column, cells) => <Cell key={cell.id} cell={cell} {...cellValue(cell, rate, data.player, data.feeds)} rate={rate}
        edge={at < groups.length - 1 && column === cells.length - 1} />))}
    </div>)}
  </section>;
}

type PctVars = CSSProperties & { "--pct": number };

const ordinal = (value: number) => {
  const mod100 = value % 100;
  return `${value}${mod100 >= 11 && mod100 <= 13 ? "th" : ({ 1: "st", 2: "nd", 3: "rd" } as Record<number, string>)[value % 10] ?? "th"}`;
};

function Cell({ cell, value, percentile, cohort, rate, edge }: { cell: CellDef; value: number | null; percentile: number | null; cohort: string; rate: Rate; edge: boolean }) {
  const shown = formatCell(value, cell.format);
  const counting = typeof cell.key !== "string";
  const rank = percentile === null ? "not ranked" : `${Math.round(percentile)} percentile`;
  return <Tooltip content={`${cell.tip}${counting ? rate === "per_36" ? " Per 36 minutes." : " Per game." : ""} ${percentile === null ? "Not ranked (small sample or no data)." : `${ordinal(Math.round(percentile))} percentile among ${cohort} this season.`}`}>
    <span className="pd-cell" tabIndex={0} data-ranked={percentile !== null || undefined} data-edge={edge || undefined}
      style={percentile !== null ? ({ "--pct": Math.round(percentile) } as PctVars) : undefined}>
      <span className="sr-only">{`${cell.label} ${shown}, ${rank}`}</span>
      <span className="pd-cell-label" aria-hidden="true">{cell.label}</span>
      <strong className="pd-cell-value" aria-hidden="true">{shown}</strong>
      <span className="pd-cell-bar" aria-hidden="true"><span /></span>
      <span className="pd-cell-pct" aria-hidden="true">{percentile === null ? "" : Math.round(percentile)}</span>
    </span>
  </Tooltip>;
}

/** Offense · six-factor impact · defense: each factor's value with one dot per point. */
function SixFactors({ player }: { player: PlayerResearchItem | null }) {
  const side = (cells: typeof SIX_FACTORS.offense) => <div className="pd-factors-side">
    {cells.map(cell => {
      const raw = player?.metrics[cell.key];
      const value = typeof raw === "number" ? raw : null;
      const tone = value === null ? undefined : value >= 0 ? "high" : "low";
      return <Tooltip key={cell.id} content={`${cell.tip} Points per 100 possessions.`}>
        <span className="pd-factor" tabIndex={0}>
          <span className="sr-only">{`${cell.label} ${formatCell(value, "signed1")}`}</span>
          <span className="pd-factor-label" aria-hidden="true">{cell.label}</span>
          <strong className="pd-factor-value" data-tone={tone} aria-hidden="true">{formatCell(value, "signed1")}</strong>
          <span className="pd-dots" data-tone={tone} aria-hidden="true">{Array.from({ length: factorDots(value) }, (_, at) => <span key={at} />)}</span>
        </span>
      </Tooltip>;
    })}
  </div>;
  return <section className="pd-factors" aria-label="Six-factor impact">
    <p className="pd-strip-label"><span>Offense</span><span>6-Factor Impact</span><span>Defense</span></p>
    <div className="pd-factors-body">{side(SIX_FACTORS.offense)}{side(SIX_FACTORS.defense)}</div>
  </section>;
}

/** Play-type families: possession share (bar) and points per 100 above the league family rate. */
function PlayTypes({ families }: { families: PlayerDashboardPlayFamily[] | null }) {
  return <section className="pd-plays" aria-label="Play types">
    <p className="pd-strip-label"><span>Freq</span><span>Play Types</span><span>rPPP</span></p>
    {families ? <div className="pd-plays-body">{families.map(family => {
      const relative = family.relative_per_100;
      const share = family.frequency;
      return <Tooltip key={family.family} content={`${family.label}: ${share === null ? "—" : `${(100 * share).toFixed(0)}%`} of the player's play-type possessions (${Math.round(family.possessions)}). rPPP: ${relative === null ? "under the possession floor" : `${relative > 0 ? "+" : ""}${relative.toFixed(1)} points per 100 possessions against the league's ${family.label.toLowerCase()} rate`}.`}>
        <div className="pd-play" tabIndex={0}>
          <span className="pd-play-bar" aria-hidden="true" style={{ "--share": Math.min(100, Math.round(100 * (share ?? 0) * 2)) } as CSSProperties}><span /></span>
          <span className="pd-play-share">{share === null ? "—" : `${(100 * share).toFixed(0)}%`}</span>
          <span className="pd-play-label">{family.label}</span>
          <span className="pd-play-rel" data-tone={relative === null ? undefined : relative >= 0 ? "high" : "low"}>{relative === null ? "—" : `${relative > 0 ? "+" : relative < 0 ? "−" : ""}${Math.abs(relative).toFixed(1)}`}</span>
          <span className="pd-cell-bar pd-play-rank" aria-hidden="true" data-ranked={family.percentiles.relative_per_100 !== null || undefined}
            style={family.percentiles.relative_per_100 !== null ? ({ "--pct": Math.round(family.percentiles.relative_per_100) } as PctVars) : undefined}><span /></span>
        </div>
      </Tooltip>;
    })}</div> : <p className="pd-panel-empty">No Synergy play types for this season (they start in 2015-16).</p>}
  </section>;
}

/** Databallr's comparison panel: every value as A − B, coloured by whoever leads, their name beneath. */
function VersusPanel({ catalog, a, b, onClose }: { catalog: WorkbenchCatalog; a: PanelSpec; b: PanelSpec; onClose: () => void }) {
  const left = usePanelData(catalog, a);
  const right = usePanelData(catalog, b);
  const nameA = left?.player?.player_name ?? "Player A";
  const nameB = right?.player?.player_name ?? "Player B";
  const leaders = { a: surname(nameA), b: surname(nameB) };
  const rate = a.rate;
  const block = (groups: CellGroup[]) => <section className="pd-block" aria-label={groups.map(group => group.label).join(", ")}>
    <div className="pd-block-groups">{groups.map(group => <span key={group.label} className="pd-block-group" data-span={group.cells[0].length}>{group.label}</span>)}</div>
    {Array.from({ length: Math.max(...groups.map(group => group.cells.length)) }, (_, row) => <div key={row} className="pd-block-row">
      {groups.flatMap((group, at) => (group.cells[row] ?? []).map((cell, column, cells) => {
        const one = left ? cellValue(cell, rate, left.player, left.feeds).value : null;
        const two = right ? cellValue(cell, rate, right.player, right.feeds).value : null;
        const { difference, leader } = versusCell(one, two, cell.lower);
        const text = formatDifference(difference, cell.format);
        return <span key={cell.id} className="pd-cell pd-vs-cell" data-leader={leader ?? undefined} data-edge={(at < groups.length - 1 && column === cells.length - 1) || undefined}>
          <span className="sr-only">{`${cell.label}: ${leader ? `${leaders[leader]} by ${text.slice(1)}` : difference === 0 ? "level" : "unknown"}`}</span>
          <span className="pd-cell-label" aria-hidden="true">{cell.label}</span>
          <strong className="pd-cell-value" aria-hidden="true">{leader ? text : difference === 0 ? "Even" : "—"}</strong>
          <span className="pd-vs-bar" aria-hidden="true" />
          <span className="pd-vs-name" aria-hidden="true">{leader ? leaders[leader] : ""}</span>
        </span>;
      }))}
    </div>)}
  </section>;
  const families = (side: PanelData | null) => new Map((side?.feeds?.play_types ?? []).map(family => [family.family, family]));
  const playsA = families(left);
  const playsB = families(right);
  return <article className="pd-panel pd-vs" aria-label={`${a.season} ${nameA} versus ${b.season} ${nameB}`}>
    <header className="pd-vs-head">
      <span className="pd-vs-side" data-side="a"><span><strong>{nameA}</strong><small>{a.season} · {PHASE_LABEL[a.phase]}</small></span>
        <PlayerPortrait playerId={a.playerId} name={nameA} portraitUrl={left?.player?.portrait_url} size="sm" className="pd-vs-portrait" era={{ season: a.season, team: left?.player?.teams.at(-1) ?? null }} /></span>
      <span className="pd-vs-word">vs</span>
      <span className="pd-vs-side" data-side="b"><PlayerPortrait playerId={b.playerId} name={nameB} portraitUrl={right?.player?.portrait_url} size="sm" className="pd-vs-portrait" era={{ season: b.season, team: right?.player?.teams.at(-1) ?? null }} />
        <span><strong>{nameB}</strong><small>{b.season} · {PHASE_LABEL[b.phase]}</small></span></span>
      <span className="pd-vs-actions">
        <IconButtonLink size="sm" icon="scale" href={compareLink([a, b])} label={`Open ${nameA} and ${nameB} in Player Comparison (${a.season})`} />
        <IconButton size="sm" variant="ghost" icon="close" label="Close the head-to-head" onClick={onClose} />
      </span>
    </header>
    <p className="pd-vs-key">Each value is the leader&apos;s margin: <span data-side="a">{leaders.a}</span> or <span data-side="b">{leaders.b}</span>. {rate === "per_36" ? "Counting stats per 36 minutes." : "Counting stats per game."}</p>
    {!left || !right ? <div className="pd-panel-loading" aria-busy="true">Loading…</div> : <>
      {block([...RATING_GROUPS, rapmGroup(rapmYears(left.player, right.player))])}
      <section className="pd-factors" aria-label="Six-factor impact difference">
        <p className="pd-strip-label"><span>Offense</span><span>6-Factor Impact</span><span>Defense</span></p>
        <div className="pd-factors-body">{[SIX_FACTORS.offense, SIX_FACTORS.defense].map((cells, side) => <div key={side} className="pd-factors-side">
          {cells.map(cell => {
            const one = left.player?.metrics[cell.key];
            const two = right.player?.metrics[cell.key];
            const { difference, leader } = versusCell(typeof one === "number" ? one : null, typeof two === "number" ? two : null);
            return <span key={cell.id} className="pd-factor" data-leader={leader ?? undefined}>
              <span className="pd-factor-label">{cell.label}</span>
              <strong className="pd-factor-value pd-vs-value">{leader ? formatDifference(difference, "signed1") : "—"}</strong>
              <small className="pd-vs-name">{leader ? leaders[leader] : ""}</small>
            </span>;
          })}
        </div>)}</div>
      </section>
      {block(OFFENSE_GROUPS)}
      <section className="pd-plays pd-vs-plays" aria-label="Play types difference">
        <p className="pd-strip-label pd-strip-center"><span>Play Types</span></p>
        <div className="pd-vs-play-grid">
          {(["creation", "spacing", "transition", "finishing"] as const).map(key => {
            const one = playsA.get(key);
            const two = playsB.get(key);
            const freq = versusCell(one?.frequency ?? null, two?.frequency ?? null);
            const eff = versusCell(one?.relative_per_100 ?? null, two?.relative_per_100 ?? null);
            return <div key={key} className="pd-vs-play">
              <span className="pd-vs-play-label">{one?.label ?? two?.label ?? key}</span>
              <span className="pd-cell pd-vs-cell" data-leader={freq.leader ?? undefined}><span className="pd-cell-label">Freq</span>
                <strong className="pd-cell-value">{freq.leader ? formatDifference(freq.difference, "pct1") : "—"}</strong><span className="pd-vs-bar" aria-hidden="true" /><span className="pd-vs-name">{freq.leader ? leaders[freq.leader] : ""}</span></span>
              <span className="pd-cell pd-vs-cell" data-leader={eff.leader ?? undefined}><span className="pd-cell-label">rPPP</span>
                <strong className="pd-cell-value">{eff.leader ? formatDifference(eff.difference, "num1") : "—"}</strong><span className="pd-vs-bar" aria-hidden="true" /><span className="pd-vs-name">{eff.leader ? leaders[eff.leader] : ""}</span></span>
            </div>;
          })}
        </div>
      </section>
      {block(DEFENSE_GROUPS)}
    </>}
  </article>;
}
