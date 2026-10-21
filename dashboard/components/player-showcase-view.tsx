"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, useTransition, type CSSProperties } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { executeWorkbenchQuery } from "@/lib/workbench-api";
import { useReducedMotion, DURATIONS } from "@/lib/motion";
import { formatDate } from "@/lib/format-date";
import { buildPreservedContextUrl } from "@/lib/query-url";
import { formatColumnValue } from "@/lib/stats-presets";
import { teamBrandColor } from "@/lib/team-colors";
import {
  CARD_EXTRAS, COMPARE_DEPTH, DEFAULT_EXTRAS, DEFAULT_MIN_MINUTES, GAME_FLOORS, MAX_SHOWN, MINUTE_FLOORS, MODES, PAGE_SIZE,
  CARD_STATS, baseStat, statId, cardStats, changeText, nextSeason, phasesFor, previousSeason, rankChanges, showcaseQuery, stateParams, statGroups,
  type RankChange, type ShowcaseMode, type ShowcaseState, type ShowcaseView,
} from "@/lib/showcase";
import type { PlayerResearchItem, WorkbenchCatalog } from "@/lib/types";
import { ShowcaseCard } from "./showcase-card";
import { PercentileCell } from "./charts/percentile-cell";
import { PlayerCareerTable } from "./player-career-table";
import { PlayerPortrait } from "./player-portrait";
import { TeamWatermark } from "./team-watermark";
import { teamRecord } from "./compare-player-slot";
import { TeamLogo } from "./team-logo";
import { LookupInput } from "./lookup-input";
import { CourtLensWordmark } from "./courtlens-wordmark";
import { StatsPositionChips, StatsTeamSelect } from "./stats-page-controls";
import { PageHeader } from "./ui/panel";
import { Modal } from "./ui/modal";
import { Checkbox } from "./ui/checkbox";
import { ControlScope } from "./ui/control-scope";
import { Icon } from "./ui/icon";
import { Tooltip } from "./ui/tooltip";
import { Button, ButtonLink, IconButton, Segmented, Select } from "./ui/kit";
import { CompareTray, compareHref } from "./compare-tray";

export interface ShowcaseBoard {
  season: string;
  phase: string;
  beforeDate: string | null;
  players: PlayerResearchItem[];
  eligible: number;
  hasMore: boolean;
}

export interface PlayerShowcaseViewProps {
  catalog: WorkbenchCatalog;
  state: ShowcaseState;
  board: ShowcaseBoard;
  /** The previous season's board under the same filters (rank changes); null for the first season. */
  previous: PlayerResearchItem[] | null;
  draftClasses: { year: number; players: number }[];
}

const BLURB = "Each season's leaders as player cards, ranked by the stat you choose";
/** How long the slideshow holds a season once its cards have landed. */
const DWELL_MS = 3200;
/** The compare tray's capacity; Compare itself shows the first five. */
const MAX_COMPARED = 8;
const PHASE_LABELS: Record<string, string> = { regular_season: "Regular", playoffs: "Playoffs" };

type Slide = { season: string; players: PlayerResearchItem[]; previous: PlayerResearchItem[] | null };

export function PlayerShowcaseView({ catalog, state, board, previous, draftClasses }: PlayerShowcaseViewProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [pending, startTransition] = useTransition();
  const seasons = useMemo(() => catalog.seasons ?? [], [catalog.seasons]);
  const stats = useMemo(() => cardStats(state), [state]);
  const sortStat = stats[0];

  const set = useCallback((updates: Record<string, string | number | null>, replace = false) => {
    const params = stateParams(new URLSearchParams(searchParams.toString()), updates);
    startTransition(() => (replace ? router.replace : router.push)(`${pathname}?${params}`, { scroll: false }));
  }, [pathname, router, searchParams]);

  // Dialogs and the player the search found.
  const [open, setOpen] = useState<{ id: string; name: string; team: string | null } | null>(null);
  const [choosing, setChoosing] = useState(false);
  const [glossary, setGlossary] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [lookup, setLookup] = useState("");
  const [found, setFound] = useState<string | null>(state.player);

  // ---- Slideshow: the season shown, then wrap to the first season on file (owner, 2026-10-20).
  const [playing, setPlaying] = useState(false);
  const [slide, setSlide] = useState<Slide | null>(null);
  const [slideError, setSlideError] = useState<string | null>(null);
  const cache = useRef(new Map<string, Promise<PlayerResearchItem[]>>());
  const filterKey = JSON.stringify({ ...state, season: null, shown: null, player: null, view: null });
  const loadSeason = useCallback((season: string) => {
    const key = `${filterKey}|${season}`;
    let hit = cache.current.get(key);
    if (!hit) {
      // Deep enough to be the next season's comparison as well as its first page of cards.
      const { query, presentation } = showcaseQuery(catalog, state, season, COMPARE_DEPTH);
      hit = executeWorkbenchQuery(query, presentation).then(result => result.items);
      hit.catch(() => cache.current.delete(key));
      cache.current.set(key, hit);
    }
    return hit;
  }, [catalog, filterKey, state]);

  // The server board for this scope seeds the cache, so the slideshow never refetches it.
  useEffect(() => {
    if (!board.hasMore || board.players.length >= COMPARE_DEPTH) cache.current.set(`${filterKey}|${board.season}`, Promise.resolve(board.players));
    const prior = previousSeason(seasons, board.season);
    if (prior && previous) cache.current.set(`${filterKey}|${prior}`, Promise.resolve(previous));
  }, [board, filterKey, previous, seasons]);

  // A paused slideshow hands its season to the URL; once the server board catches up, drop the slide.
  if (!playing && slide && slide.season === board.season) setSlide(null);

  useEffect(() => {
    if (!playing) return;
    let cancelled = false;
    const current = slide ?? { season: board.season, players: board.players, previous };
    const upcoming = nextSeason(seasons, current.season);
    const load = loadSeason(upcoming);
    // The wrap to the first season has no earlier board to compare with.
    const compare = previousSeason(seasons, upcoming) ? loadSeason(current.season) : Promise.resolve(null);
    // Prefetch one further so the next step never waits on the network.
    load.then(() => { if (!cancelled) void loadSeason(nextSeason(seasons, upcoming)).catch(() => undefined); }).catch(() => undefined);
    const timer = setTimeout(() => {
      Promise.all([load, compare]).then(([players, before]) => {
        if (cancelled) return;
        setSlide({ season: upcoming, players, previous: before });
        setSlideError(null);
      }).catch(() => { if (!cancelled) { setPlaying(false); setSlideError(`${upcoming} could not load; the slideshow stopped.`); } });
    }, DWELL_MS);
    return () => { cancelled = true; clearTimeout(timer); };
    // The slide itself drives the next step.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing, slide]);

  const togglePlay = () => {
    if (playing) {
      setPlaying(false);
      if (slide && slide.season !== board.season) set({ season: slide.season, show: null }, true);
    } else {
      setSlideError(null);
      setPlaying(true);
    }
  };
  const goSeason = (season: string) => {
    setPlaying(false);
    setSlide(null);
    set({ season, show: null, phase: phasesFor(catalog, season).includes(state.phase) ? searchParams.get("phase") : null });
  };

  const shown = slide ?? { season: board.season, players: board.players, previous };
  const dialogOpen = Boolean(open) || choosing || glossary || filtersOpen || helpOpen;

  // ---- Compare: cards picked from one season's board open in Compare for that season. A card from
  // another season starts a new selection, so the comparison never mixes scopes.
  const [comparing, setComparing] = useState<{ season: string; players: PlayerResearchItem[] } | null>(null);
  const compareContext = useMemo(() => {
    if (!comparing) return null;
    const { query } = showcaseQuery(catalog, state, comparing.season);
    return { season: query.season, phase: query.phase, before_date: query.before_date ?? "", window: "season", release_id: catalog.release_id ?? undefined };
  }, [catalog, comparing, state]);
  const compared = comparing?.season === shown.season ? new Set(comparing.players.map(player => player.player_id)) : new Set<string>();
  const openItem = open ? shown.players.find(player => player.player_id === open.id) ?? null : null;
  const toggleCompare = (player: PlayerResearchItem) => setComparing(current => {
    if (!current || current.season !== shown.season) return { season: shown.season, players: [player] };
    const players = current.players.some(entry => entry.player_id === player.player_id)
      ? current.players.filter(entry => entry.player_id !== player.player_id)
      : [...current.players, player].slice(-MAX_COMPARED);
    return players.length ? { ...current, players } : null;
  });

  // Keys: ← and → step a season, Space plays or pauses, Z opens Compare. Typing, native controls (a focused button's
  // own Space, a select's arrows, the list's horizontal scroll) and open dialogs keep their keys.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (dialogOpen || event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
      const target = event.target instanceof HTMLElement ? event.target : null;
      if (target?.closest("input, textarea, select, [contenteditable='true'], [role='dialog'], .sc-list")) return;
      if (event.key === "z" && comparing && compareContext && comparing.players.length >= 2) {
        event.preventDefault();
        router.push(compareHref(comparing.players, compareContext));
      } else if (event.key === " ") {
        if (target?.closest("button, a, summary")) return;
        event.preventDefault();
        togglePlay();
      } else if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
        const index = seasons.indexOf(shown.season) + (event.key === "ArrowLeft" ? -1 : 1);
        if (index < 0 || index >= seasons.length) return;
        event.preventDefault();
        goSeason(seasons[index]);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });
  const players = playing || slide ? shown.players.slice(0, PAGE_SIZE) : shown.players;
  const priorSeason = previousSeason(seasons, shown.season);
  const changes = useMemo(() => rankChanges(shown.players, shown.previous, priorSeason), [shown.players, shown.previous, priorSeason]);
  const seasonIndex = seasons.indexOf(shown.season);
  const phases = phasesFor(catalog, board.season);
  const leaders = `${sortStat.key in { dpm: 1, o_dpm: 1, d_dpm: 1 } ? "DARKO " : ""}${sortStat.label} ${state.ascending ? "Lowest" : "Leaders"}`;
  const openPlayer = (player: PlayerResearchItem) => setOpen({ id: player.player_id, name: player.player_name, team: player.teams.at(-1) ?? null });

  const filtersCount = (state.minGames ? 1 : 0) + (state.draftYear ? 1 : 0);
  const sortOptions = CARD_STATS.map(column => ({ value: statId(column), label: column.label }));

  return (
    <div className="sc-page" role="region" aria-label="Player Showcase" aria-busy={pending || undefined} data-comparing={comparing ? "true" : undefined}>
      <PageHeader className="pvp-header" icon="cards" title="Player Showcase" subtitle={BLURB} />

      <ControlScope tone="console">
      <div className="sc-consoles">
        <section className="sc-console sc-console-scope" aria-label="Season and stats">
          <Select size="sm" aria-label="Counting mode" value={state.mode} onChange={event => set({ mode: event.target.value === "per_game" ? null : event.target.value as ShowcaseMode })}>
            {MODES.filter(mode => catalog.stats_normalizations?.includes(mode.value) ?? true).map(mode => <option key={mode.value} value={mode.value}>{mode.label}</option>)}
          </Select>
          <Select size="sm" aria-label="Minimum minutes" value={String(state.minMinutes)}
            onChange={event => set({ minMinutes: Number(event.target.value) === (DEFAULT_MIN_MINUTES[state.phase] ?? 0) ? null : event.target.value })}>
            {[...new Set([...MINUTE_FLOORS, state.minMinutes])].sort((a, b) => a - b).map(floor => <option key={floor} value={floor}>{floor ? `Minutes > ${floor}` : "Any minutes"}</option>)}
          </Select>
          <div className="sc-view">
            <Segmented<ShowcaseView> size="sm" stretch label="Layout" value={state.view} onChange={value => set({ view: value === "list" ? value : null })}
              options={[{ value: "cards", label: "Cards", icon: "cards" }, { value: "list", label: "List", icon: "list-ordered" }]} />
          </div>
          <div className="sc-search">
            <LookupInput label="Find player" placeholder="Search" value={lookup} onChange={setLookup} kinds={["player"]} season={board.season}
              releaseId={catalog.release_id ?? undefined} compactResults portalDropdown
              onSelect={item => {
                setLookup("");
                if (item.kind !== "player") return;
                if (players.some(player => player.player_id === item.canonical_id)) setFound(item.canonical_id);
                else setOpen({ id: item.canonical_id, name: item.display_name, team: null });
              }} />
          </div>
          <Button size="sm" variant="primary" icon="sliders" aria-haspopup="dialog" onClick={() => setChoosing(true)}>Choose Stats</Button>
          <Select size="sm" aria-label="Season phase" value={board.phase} onChange={event => set({ phase: event.target.value === "regular_season" ? null : event.target.value, minMinutes: null, show: null })}>
            {phases.map(phase => <option key={phase} value={phase}>{PHASE_LABELS[phase] ?? phase}</option>)}
          </Select>
          <StatsTeamSelect />
          <div className="sc-season-step" role="group" aria-label="Season">
            <IconButton size="sm" icon="left" label="Previous season" disabled={seasonIndex <= 0} onClick={() => goSeason(seasons[seasonIndex - 1])} />
            <Select size="sm" aria-label="Season" value={shown.season} onChange={event => goSeason(event.target.value)}>
              {[...seasons].reverse().map(season => <option key={season} value={season}>{season}</option>)}
            </Select>
            <IconButton size="sm" icon="right" label="Next season" disabled={seasonIndex >= seasons.length - 1} onClick={() => goSeason(seasons[seasonIndex + 1])} />
          </div>
          <Button size="sm" icon="book" aria-haspopup="dialog" onClick={() => setGlossary(true)}>Glossary</Button>
        </section>

        <section className="sc-console sc-console-order" aria-label="Order and slideshow">
          <span className="sc-console-label">Position</span>
          <StatsPositionChips />
          <span className="sc-console-label">Sort by</span>
          <div className="sc-sort">
            <Select size="sm" aria-label="Sort by" value={state.sort} onChange={event => set({ sort: event.target.value === "dpm" ? null : event.target.value, show: null })}>
              {sortOptions.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
            </Select>
            <IconButton size="sm" icon={state.ascending ? "up" : "down"} label={state.ascending ? "Lowest first. Show highest first" : "Highest first. Show lowest first"}
              onClick={() => set({ dir: state.ascending ? null : "asc", show: null })} />
          </div>
          <span className="sc-console-label" aria-hidden="true" />
          <Button size="sm" icon="filter" aria-haspopup="dialog" data-selected={filtersCount ? "true" : undefined} onClick={() => setFiltersOpen(true)}>
            {filtersCount ? `Filters · ${filtersCount}` : "Filters"}
          </Button>
          <span className="sc-console-label" aria-hidden="true" />
          <div className="sc-play">
            <Button size="sm" variant="primary" className="sc-play-button" icon={playing ? "pause" : "play"} pressed={playing} onClick={togglePlay}>
              {playing ? "Pause Slideshow" : "Play Slideshow"}
            </Button>
            <IconButton size="sm" icon="help" label="How the slideshow works" aria-haspopup="dialog" onClick={() => setHelpOpen(true)} />
          </div>
        </section>
      </div>
      </ControlScope>

      <div className="sc-banner">
        <span className="sc-banner-season" aria-live="polite">{shown.season}</span>
        <h2 className="sc-banner-title">{leaders}</h2>
        <span className="sc-banner-mark"><CourtLensWordmark height={20} /></span>
      </div>
      <SeasonScrubber seasons={seasons} season={shown.season} onPick={goSeason} />
      <p className="sc-key">
        <span>{board.phase === "playoffs" ? "Playoffs" : "Regular season"}{board.beforeDate && shown.season === board.season ? ` through ${formatDate(board.beforeDate)}` : ""} · {state.minMinutes ? `over ${state.minMinutes} minutes` : "any minutes"}</span>
        <span>Small number: league percentile</span>
        <span className="sc-key-tone" data-tone="up"><Icon name="up" size={14} />Gold: up from last season</span>
        <span className="sc-key-tone" data-tone="down"><Icon name="down" size={14} />Blue: down from last season</span>
        <span className="sc-key-tone" data-tone="new">New: outside last season&apos;s top {COMPARE_DEPTH}</span>
      </p>
      {slideError && <p className="sc-note" role="status">{slideError}</p>}

      {players.length === 0 ? <p className="sc-empty">No players match these filters in {shown.season}.</p>
        : state.view === "list" && !playing && !slide
          ? <ShowcaseList players={players} stats={stats} changes={changes} onOpen={openPlayer} found={found} compared={compared} />
          : <ShowcaseGrid players={players} season={shown.season} stats={stats} changes={changes} onOpen={openPlayer} found={found} compared={compared} />}

      {!playing && !slide && board.hasMore && state.shown < MAX_SHOWN && (
        <div className="sc-more">
          <Button size="md" onClick={() => set({ show: state.shown + PAGE_SIZE })} disabled={pending}>{pending ? "Loading…" : `Load ${PAGE_SIZE} More`}</Button>
        </div>
      )}

      {choosing && <ChooseStats onClose={() => setChoosing(false)} sort={state.sort} extras={state.extras}
        onSave={extras => { setChoosing(false); set({ stats: extras.join(",") === DEFAULT_EXTRAS.join(",") ? null : extras.join(",") }); }} />}
      <Modal isOpen={glossary} onClose={() => setGlossary(false)} title="Glossary" description="The stats on the cards, then every stat you can sort or choose." className="sc-dialog">
        <dl className="sc-glossary">
          {[...stats, ...CARD_STATS.filter(column => !stats.some(stat => stat.label === column.label))].map(column => (
            <div key={column.key}><dt>{column.label}</dt><dd>{column.tooltip ?? column.label}</dd></div>
          ))}
        </dl>
        <p className="sc-dialog-foot"><ButtonLink size="sm" variant="text" href="/stats/glossary" iconAfter="right">Full Stats Glossary</ButtonLink></p>
      </Modal>
      <Modal isOpen={filtersOpen} onClose={() => setFiltersOpen(false)} title="Filters" description="Narrow the board. Percentiles stay against the whole league." className="sc-dialog">
        <div className="sc-filters">
          <label><span>Minimum games</span>
            <Select size="md" value={String(state.minGames)} onChange={event => set({ minGames: Number(event.target.value) || null, show: null })}>
              {GAME_FLOORS.map(floor => <option key={floor} value={floor}>{floor ? `${floor}+ games` : "Any"}</option>)}
            </Select>
          </label>
          <label><span>Draft class</span>
            <Select size="md" value={String(state.draftYear ?? "")} onChange={event => set({ draftYear: event.target.value || null, show: null })}>
              <option value="">Any</option>
              {[...draftClasses].sort((a, b) => b.year - a.year).map(entry => <option key={entry.year} value={entry.year}>{entry.year} Draft</option>)}
            </Select>
          </label>
        </div>
        {filtersCount > 0 && <p className="sc-dialog-foot"><Button size="sm" variant="text" icon="reset" onClick={() => set({ minGames: null, draftYear: null, show: null })}>Clear Filters</Button></p>}
      </Modal>
      <Modal isOpen={helpOpen} onClose={() => setHelpOpen(false)} title="Slideshow" className="sc-dialog">
        <ul className="sc-help">
          <li>Starts on the season shown, steps forward a season every few seconds, then wraps to {seasons[0]}.</li>
          <li>Cards slide to their new rank; the arrow on each photo is the change from the season before.</li>
          <li>Pause keeps the season on screen. Click a year on the timeline to jump to it.</li>
          <li>Keys: Space plays or pauses; the left and right arrow keys step back or forward a season.</li>
          <li>Each season uses the same filters and its own regular season or playoffs through that phase&apos;s last game.</li>
        </ul>
      </Modal>
      <PlayerDialog key={open?.id ?? "closed"} player={open} catalog={catalog} season={shown.season} phase={board.phase} onClose={() => setOpen(null)}
        onSeason={season => { setOpen(null); goSeason(season); }} searchParams={searchParams}
        inCompare={open ? compared.has(open.id) : false}
        onCompare={openItem ? () => toggleCompare(openItem) : undefined} />
      {comparing && compareContext && (
        <CompareTray selectedPlayers={comparing.players} context={compareContext}
          onRemovePlayer={id => setComparing(current => {
            const players = current?.players.filter(player => player.player_id !== id) ?? [];
            return current && players.length ? { ...current, players } : null;
          })}
          onClearAll={() => setComparing(null)} />
      )}
    </div>
  );
}

/** Every season on file as a timeline; the season shown is lit (improvement 9). */
function SeasonScrubber({ seasons, season, onPick }: { seasons: string[]; season: string; onPick: (season: string) => void }) {
  return (
    <div className="sc-timeline" role="group" aria-label="Jump to a season">
      {seasons.map(entry => (
        <button key={entry} type="button" className="sc-tick" aria-pressed={entry === season} aria-label={entry} title={entry} onClick={() => onPick(entry)}>
          <span>{`'${entry.slice(-2)}`}</span>
        </button>
      ))}
    </div>
  );
}

/**
 * The card grid. When the board changes (a slideshow step), cards that stay slide from their old
 * place to their new rank and newcomers fade in (FLIP); reduced motion swaps in place.
 */
function ShowcaseGrid({ players, season, stats, changes, onOpen, found, compared }: {
  players: PlayerResearchItem[]; season: string; stats: ReturnType<typeof cardStats>; changes: Map<string, RankChange>;
  onOpen: (player: PlayerResearchItem) => void; found: string | null; compared: Set<string>;
}) {
  const ref = useRef<HTMLOListElement>(null);
  const rects = useRef(new Map<string, DOMRect>());
  const reduced = useReducedMotion();
  const signature = `${season}|${players.map(player => player.player_id).join()}`;

  useLayoutEffect(() => {
    const root = ref.current;
    if (!root) return;
    const cards = [...root.querySelectorAll<HTMLElement>("[data-player]")];
    const before = rects.current;
    const after = new Map(cards.map(card => [card.dataset.player!, card.getBoundingClientRect()]));
    if (!reduced && before.size) {
      const duration = DURATIONS.chart * 1000 * 1.6;
      for (const card of cards) {
        const was = before.get(card.dataset.player!);
        const now = after.get(card.dataset.player!)!;
        if (was) {
          const dx = was.left - now.left, dy = was.top - now.top;
          if (dx || dy) card.animate([{ transform: `translate(${dx}px, ${dy}px)` }, { transform: "none" }], { duration, easing: "cubic-bezier(0.65, 0, 0.35, 1)" });
        } else {
          card.animate([{ opacity: 0, transform: "scale(0.92)" }, { opacity: 1, transform: "none" }], { duration, easing: "cubic-bezier(0.22, 1, 0.36, 1)" });
        }
      }
    }
    rects.current = after;
  }, [signature, reduced]);

  useEffect(() => {
    if (!found) return;
    ref.current?.querySelector<HTMLElement>(`[data-player="${CSS.escape(found)}"]`)?.scrollIntoView({ block: "center", behavior: reduced ? "auto" : "smooth" });
  }, [found, reduced]);

  return (
    <ol className="sc-grid" ref={ref} aria-label={`${season} cards`}>
      {players.map((player, index) => (
        <li key={player.player_id} className="sc-cell">
          <ShowcaseCard player={player} rank={index + 1} season={season} stats={stats} change={changes.get(player.player_id) ?? null}
            highlighted={player.player_id === found} compared={compared.has(player.player_id)} onOpen={onOpen} />
        </li>
      ))}
    </ol>
  );
}

/** Databallr's list toggle: the same board in the Stats table look. */
function ShowcaseList({ players, stats, changes, onOpen, found, compared }: {
  players: PlayerResearchItem[]; stats: ReturnType<typeof cardStats>; changes: Map<string, RankChange>;
  onOpen: (player: PlayerResearchItem) => void; found: string | null; compared: Set<string>;
}) {
  return (
    <div className="table-wrapper stats-scroll-region sc-list" role="region" aria-label="Showcase list" tabIndex={0}>
      <table className="stats-table sc-list-table">
        <colgroup><col className="sc-col-rank" /><col className="sc-col-player" />{stats.map(stat => <col key={stat.key} />)}</colgroup>
        <thead><tr>
          <th scope="col">#</th><th scope="col" className="sc-list-player">Player</th>
          {stats.map(stat => <th key={stat.key} scope="col" title={stat.tooltip}>{stat.label}</th>)}
        </tr></thead>
        <tbody>
          {players.map((player, index) => {
            const change = changes.get(player.player_id) ?? null;
            const team = player.teams.at(-1);
            return (
              <tr key={player.player_id} data-highlighted={player.player_id === found || undefined} data-compared={compared.has(player.player_id) || undefined}>
                <td className="num sc-list-rank">{index + 1}<ChangeMark change={change} /></td>
                <td className="sc-list-player">
                  <button type="button" className="sc-list-name" onClick={() => onOpen(player)}>
                    <PlayerPortrait playerId={player.player_id} name={player.player_name} portraitUrl={player.portrait_url} size="sm" />
                    <span>{player.player_name}</span>
                    {team && <TeamLogo team={team} size={16} />}
                  </button>
                </td>
                {stats.map(stat => (
                  <td key={stat.key} className="num stats-metric-cell">
                    <PercentileCell variant="text" value={player.metrics[stat.key] == null ? null : formatColumnValue(stat, player)}
                      percentile={player.table_percentiles?.[stat.key] ?? null}
                      qualified={player.table_qualified === true && player.impact_support?.[stat.key]?.qualified !== false}
                      label={stat.label} cohort={`${player.table_cohort_sample_sizes?.[stat.key] ?? "Unknown"} league players that season`} />
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function ChangeMark({ change }: { change: RankChange }) {
  if (!change || change.kind === "same") return null;
  const mark = change.kind === "new" ? <span className="sc-list-change" data-tone="new">New</span>
    : <span className="sc-list-change" data-tone={change.kind}><Icon name={change.kind === "up" ? "up" : "down"} size={14} />{change.by}</span>;
  return <Tooltip content={changeText(change)}>{mark}</Tooltip>;
}

/** The sort stat leads every card; pick the three stats that follow it. */
function ChooseStats({ onClose, sort, extras, onSave }: {
  onClose: () => void; sort: string; extras: string[]; onSave: (extras: string[]) => void;
}) {
  const [picked, setPicked] = useState(() => extras.filter(key => key !== sort));
  const toggle = (key: string) => setPicked(current => current.includes(key) ? current.filter(entry => entry !== key)
    : current.length < CARD_EXTRAS ? [...current, key] : [...current.slice(1), key]);
  const sortLabel = baseStat(sort)?.label ?? sort;
  return (
    <Modal isOpen onClose={onClose} title="Choose Stats" description={`${sortLabel} (the sort) leads each card. Pick ${CARD_EXTRAS} more; a fourth pick replaces the oldest.`} className="sc-dialog sc-choose">
      <div className="sc-choose-groups">
        {statGroups().map(group => (
          <fieldset key={group.label} className="sc-choose-group">
            <legend>{group.label}</legend>
            {group.stats.map(stat => {
              const id = statId(stat);
              return <Checkbox key={id} label={stat.label} checked={id === sort || picked.includes(id)} disabled={id === sort} onChange={() => toggle(id)} />;
            })}
          </fieldset>
        ))}
      </div>
      <div className="sc-choose-actions">
        <Button size="sm" variant="text" onClick={() => setPicked(DEFAULT_EXTRAS.filter(key => key !== sort))}>Defaults</Button>
        <span className="sc-spacer" />
        <Button size="sm" onClick={onClose}>Cancel</Button>
        <Button size="sm" variant="primary" disabled={picked.length === 0} onClick={() => onSave(picked)}>Save Changes</Button>
      </div>
    </Modal>
  );
}

/** Databallr's player dialog: photo, name and the player page's career table, phase kept local. */
/** The card's photo treatment, larger than an avatar: the season photo on its team colour and logo. */
function DialogPhoto({ player, season }: { player: { id: string; name: string; team: string | null }; season: string }) {
  const record = teamRecord(player.team ?? undefined, season);
  const tint = teamBrandColor(player.team, season);
  return (
    <span className="sc-photo sc-dialog-photo" style={tint ? ({ "--team-tint": tint } as CSSProperties) : undefined}>
      {record && <TeamWatermark asset={record.asset} />}
      <PlayerPortrait playerId={player.id} name={player.name} size="xl" className="sc-portrait" era={{ season, team: player.team }} />
    </span>
  );
}

function PlayerDialog({ player, catalog, season, phase, onClose, onSeason, searchParams, inCompare, onCompare }: {
  player: { id: string; name: string; team: string | null } | null; catalog: WorkbenchCatalog; season: string; phase: string;
  onClose: () => void; onSeason: (season: string) => void; searchParams: URLSearchParams;
  /** Add or remove the player from the compare selection; absent when the card is not on the board. */
  inCompare: boolean; onCompare?: () => void;
}) {
  const [careerPhase, setCareerPhase] = useState(phase);
  return (
    <Modal isOpen={Boolean(player)} onClose={onClose} className="sc-player-dialog"
      title={player ? <span className="sc-player-title">
        <DialogPhoto player={player} season={season} />
        <span>{player.name}</span>
      </span> : undefined}>
      {player && <>
        <PlayerCareerTable playerId={player.id} catalog={catalog} season={season} phase={careerPhase} firstCoveredSeason={catalog.seasons?.[0] ?? null}
          draftYear={null} onPhaseChange={setCareerPhase} onSeasonOpen={onSeason} />
        <p className="sc-dialog-foot">
          {onCompare && <Button size="sm" icon="swap" pressed={inCompare} onClick={onCompare}>{inCompare ? `Remove from Compare` : `Add to Compare (${season})`}</Button>}
          <ButtonLink size="sm" variant="text" iconAfter="right"
            href={buildPreservedContextUrl(`/players/${player.id}?season=${season}&phase=${careerPhase}`, searchParams)}>Open Player Dashboard</ButtonLink>
        </p>
      </>}
    </Modal>
  );
}
