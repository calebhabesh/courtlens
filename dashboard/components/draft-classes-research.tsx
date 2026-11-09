"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from "react";
import { EntityField } from "./entity-picker";
import { LookupInput } from "./lookup-input";
import { PlayerPortrait } from "./player-portrait";
import { SqPanel } from "./shot-quality-figures";
import { FeedFailure, FeedSkeleton, useFeed, useUrlState } from "./stats-feed-ui";
import { TeamLogo } from "./team-logo";
import { GatedNote } from "./ui/gated-note";
import { PlayerAvatar } from "./ui/identity";
import { Button, ButtonSummary, IconButton, Segmented, Select } from "./ui/kit";
import { PageShell } from "./ui/page-shell";
import { PageHeader } from "./ui/panel";
import {
  Glossary, MethodBlock, ResearchCard, ResearchCards, ResearchDisclosure, ResearchIntro, ResearchLinks, ResearchSection,
} from "./research/research-page";
import { SeasonLineChart, niceTicks } from "./research/season-line-chart";
import { GridPlayer, GridSearch, GridValue, StatsGrid, type GridColumn } from "./research/stats-grid";
import { TeamPicker, teamCode } from "./research/team-picker";
import {
  BAND_LABELS, CAREER_ERA_LABELS, COMBINE_LABELS, COMBINE_UNITS, ERA_LABELS, MEASURE_LABELS, ROOKIE_STATS, STAT_LABELS,
  fixed, getDraftClass, getDraftCombine, getDraftSummary, getRookie, getRookieStats, getRookies, percent, pickLabel, rangeText, rookieTone,
  seasonLabel, signed, statText, whole,
  type Band, type ClassIndex, type CombineRow, type DraftClass, type DraftSummary, type Era, type Measure, type PastRookie, type PickRow,
  type Rookie, type RookieStat, type RookieStatLine, type RookieTracker, type SlotSummary,
} from "@/lib/draft-classes";
import { seasonEra } from "@/lib/portrait-source";
import { evidenceUrl } from "@/lib/research-facts";
import { teamAccent } from "@/lib/team-colors";
import type { LookupItem } from "@/lib/types";

/*
 * Research → Draft Classes (R09 analysis; RD08 design, owner 2026-11-08). No Databallr page exists and Draftballr's look is not
 * copied: each section borrows an approved CourtLens Research pattern. The centred hero, a 1352 px column and RD06's sticky
 * numbered index beside one scrolling page (a collapsed "Sections" list on a phone): this year's rookies (RD05-style card chosen
 * through a search field, RD01/RD04 grids), what each slot has returned (RD06's one-axis line with the 95% interval as a band),
 * ranges of picks, classes and redrafts, steals and misses (cards, then grids), combine beside value (RD00's scatter, linking to
 * Wingspan for every measurement), reading notes and a collapsed About this page. Every number is the frozen
 * courtlens-draft-value-v1 results' or the rookie tracker's; exact values sit on `data-*`. Green/red only where a served
 * interval excludes zero, plus R09's registered rookie rule (outside past same-pick rookies' 10th to 90th percentile).
 * Surplus has no interval, so its sign takes the gold/blue identity tones.
 */

const SECTIONS = [
  { id: "rookies", label: "2026-27 rookies" },
  { id: "value", label: "What a slot is worth" },
  { id: "ranges", label: "Ranges of picks" },
  { id: "classes", label: "Classes and redrafts" },
  { id: "steals", label: "Steals and misses" },
  { id: "combine", label: "Combine beside value" },
  { id: "reading", label: "How to read" },
  { id: "about", label: "About this page" },
] as const;
/** The old tab links (`?tab=value`) scroll to their section. */
const TAB_SECTIONS: Record<string, string> = { rookies: "rookies", value: "value", classes: "classes", steals: "steals", combine: "combine" };
type Span = "window" | "career" | "rapm";
const SPANS = [{ value: "window", label: "First 4 seasons" }, { value: "career", label: "Career" }, { value: "rapm", label: "RAPM" }] as const;
const ERAS = [{ value: "all", label: "All" }, { value: "multi_round", label: "1966–88" }, { value: "two_round", label: "1989 on" }] as const;
const MEASURES = [{ value: "ws", label: "Win shares" }, { value: "min", label: "Minutes" }] as const;
const ORDERS = [{ value: "draft", label: "Draft order" }, { value: "redraft", label: "Redraft" }, { value: "career", label: "Career" }] as const;
type Order = (typeof ORDERS)[number]["value"];
const LATEST_CLASS = 2022;
const ROOKIE_SEASON = "2026-27";
const ROOKIE_CLASS = 2026;
const NO_ROOKIE = "none";
const ROOKIE_VIEWS = [{ value: "per_game", label: "Per Game" }, { value: "per_36", label: "Per 36" }, { value: "raw", label: "Totals" }, { value: "past", label: "Vs Past Picks" }] as const;
type RookieView = (typeof ROOKIE_VIEWS)[number]["value"];
const PICK_TICKS = [0, 9, 19, 29, 39, 49, 59];
const STATUS_LABELS: Record<ClassIndex["status"], string> = { complete: "Complete", censored: "Too recent", rookies: "Rookies" };
const STATUS_TINT: Record<ClassIndex["status"], string> = { complete: "1", censored: "2", rookies: "3" };

const vars = (props: Record<string, string>) => props as CSSProperties;
const known = (v: number | null | undefined): v is number => typeof v === "number" && Number.isFinite(v);
const toneOf = (t: "positive" | "negative" | undefined): "good" | "bad" | undefined => t === "positive" ? "good" : t === "negative" ? "bad" : undefined;
const identityOf = (v: number | null | undefined, digits = 1): "a" | "b" | undefined => !known(v) || Number(v.toFixed(digits)) === 0 ? undefined : v > 0 ? "a" : "b";
const pct = (p: number | null | undefined) => known(p) ? `p${Math.round(p)}` : "—";
const codeOf = (team: string | null, season: string) => team ? (/^\d+$/.test(team) ? teamCode(team, season) : team) : null;

/** A team logo beside its code (the settled rule), or a dash. */
function TeamCode({ team, season }: { team: string | null; season: string }) {
  const code = codeOf(team, season);
  if (!team || !code) return <span className="rs-grid-unknown">—</span>;
  return <span className="dc-team"><TeamLogo team={team} season={season} size={16} />{code}</span>;
}

/** Sort rows by a column's sort value, unknowns last in both directions. */
function useSort<T>(rows: readonly T[], columns: readonly GridColumn<T>[], initial: { key: string; direction: "asc" | "desc" }) {
  const [sort, setSort] = useState(initial);
  const sorted = useMemo(() => {
    const column = columns.find(c => c.key === sort.key);
    if (!column?.sort) return rows;
    const by = column.sort;
    return [...rows].sort((a, b) => {
      const x = by(a), y = by(b);
      if (x === null && y === null) return 0;
      if (x === null) return 1;
      if (y === null) return -1;
      return sort.direction === "asc" ? x - y : y - x;
    });
  }, [rows, columns, sort]);
  const onSort = (key: string) => setSort(s => s.key === key ? { key, direction: s.direction === "desc" ? "asc" : "desc" } : { key, direction: key === "pick" || key === "year" ? "asc" : "desc" });
  return { rows: sorted, sort: { ...sort, onSort } };
}

const matches = (name: string, query: string) => !query.trim() || name.normalize("NFKD").replace(/\p{M}/gu, "").toLowerCase().includes(query.trim().normalize("NFKD").replace(/\p{M}/gu, "").toLowerCase());

// ---- Index ---------------------------------------------------------------------------------------

function SectionIndex({ current, onPick }: { current: string | null; onPick?: () => void }) {
  return <ol className="dc-index-list">
    {SECTIONS.map((s, i) => <li key={s.id}>
      <a className="dc-index-link" href={`#${s.id}`} aria-current={current === s.id ? "location" : undefined} onClick={onPick}>
        <span className="dc-index-number">{i < SECTIONS.length - 1 ? i + 1 : ""}</span>{s.label}
      </a>
    </li>)}
  </ol>;
}

/** The section being read: the last whose top has passed the upper third of the window (RD06). */
function useCurrentSection(): string | null {
  const [current, setCurrent] = useState<string | null>(null);
  useEffect(() => {
    let frame = 0;
    const update = () => {
      frame = 0;
      const line = window.innerHeight / 3;
      let found: string | null = SECTIONS[0].id;
      for (const s of SECTIONS) { const el = document.getElementById(s.id); if (el && el.getBoundingClientRect().top <= line) found = s.id; }
      setCurrent(found);
    };
    const schedule = () => { if (!frame) frame = requestAnimationFrame(update); };
    update();
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    return () => { window.removeEventListener("scroll", schedule); window.removeEventListener("resize", schedule); if (frame) cancelAnimationFrame(frame); };
  }, []);
  return current;
}

// ---- 1. Rookies ------------------------------------------------------------------------------------

function rookieItem(r: Rookie): LookupItem {
  return {
    id: r.player_id!, canonical_id: r.player_id!, kind: "player", display_name: r.name, match_basis: "suggestion", match_score: 1,
    availability: { has_current_season: true, status: "available", seasons: [ROOKIE_SEASON] }, destination_url: `/players/${r.player_id}`,
    metadata: { caption: `${pickLabel(r.round, r.pick)} · ${r.team ?? codeOf(r.draft_team, ROOKIE_SEASON) ?? "—"} · ${r.comparison?.line.games ?? 0} games` },
  } as LookupItem;
}

function RookieTile({ stat, rookie }: { stat: RookieStat; rookie: Rookie }) {
  const c = rookie.comparison!.stats[stat];
  return <div className="dc-tile" data-stat={stat}>
    <span className="dc-tile-label">{STAT_LABELS[stat]}</span>
    <GridValue text={statText(stat, c.value)} tone={toneOf(rookieTone(stat, c))}
      title={`Past number ${rookie.pick} picks (${c.n}): median ${statText(stat, c.median)}, 10th to 90th ${statText(stat, c.p10)} to ${statText(stat, c.p90)}`} />
    <span className="dc-tile-sub" data-field={stat} data-value={c.value ?? ""} data-percentile={c.percentile ?? ""}>{pct(c.percentile)} of {c.n}</span>
  </div>;
}

function RookieCard({ rookie, tracker }: { rookie: Rookie; tracker: RookieTracker }) {
  const line = rookie.comparison!.line;
  const tint = teamAccent(rookie.team, ROOKIE_SEASON);
  const drafted = codeOf(rookie.draft_team, ROOKIE_SEASON);
  return <article className="dc-card dc-rookie-card" data-card={rookie.player_id ?? ""} aria-label={`Pick ${rookie.pick}, ${rookie.name}`} style={tint ? vars({ "--dc-team": tint }) : undefined}>
    <header className="dc-card-head">
      <PlayerAvatar playerId={rookie.player_id ?? undefined} name={rookie.name} team={rookie.team} size="lg" era={seasonEra(ROOKIE_SEASON, rookie.team)} className="dc-avatar" />
      <div className="dc-card-titles">
        <Link className="dc-card-name" href={`/players/${rookie.player_id}?season=${ROOKIE_SEASON}`}>{rookie.name}</Link>
        <span className="dc-card-team"><TeamCode team={rookie.team} season={ROOKIE_SEASON} />{drafted && drafted !== rookie.team ? <> · drafted by <TeamCode team={rookie.draft_team} season={ROOKIE_SEASON} /></> : null}</span>
        <span className="dc-card-meta" data-field="games" data-value={line.games}>{line.games} games · {whole(line.minutes)} minutes{rookie.comparison!.small_sample ? " · under 100 minutes" : ""}</span>
      </div>
      <span className="dc-badge" data-field="pick" data-value={rookie.pick}>{pickLabel(rookie.round, rookie.pick)}</span>
    </header>
    <div className="dc-tiles" role="list" aria-label={`${rookie.name} against past picks at ${rookie.pick}`}>
      {ROOKIE_STATS.map(s => <div role="listitem" key={s} className="dc-tile-wrap"><RookieTile stat={s} rookie={rookie} /></div>)}
    </div>
    <div className="dc-ratings">
      <span className="dc-rating" title={rookie.darko ? `O ${signed(rookie.darko.o_dpm)}, D ${signed(rookie.darko.d_dpm)}` : "Not on DARKO's board"}>
        <span className="dc-tile-label">DARKO DPM</span>
        <span data-field="darko" data-value={rookie.darko?.dpm ?? ""}><GridValue text={signed(rookie.darko?.dpm)} identity={identityOf(rookie.darko?.dpm)} /></span>
      </span>
      <span className="dc-rating" title={rookie.rapm ? `${whole((rookie.rapm.decayed_seconds ?? 0) / 60)} decayed minutes` : "No minutes before the snapshot"}>
        <span className="dc-tile-label">RAPM</span>
        <span data-field="rapm" data-value={rookie.rapm?.rapm ?? ""}><GridValue text={signed(rookie.rapm?.rapm)} identity={identityOf(rookie.rapm?.rapm)} /></span>
      </span>
      <span className="dc-rating-note">Shown, not compared: past rookies have no rating at the same point.
        {tracker.darko ? ` DARKO through ${tracker.darko.data_date};` : ""}{tracker.rapm ? ` RAPM through ${tracker.rapm.latest_game_date}.` : ""}</span>
    </div>
  </article>;
}

function PastPicks({ rookie }: { rookie: Rookie }) {
  const { data, error, loading, retry } = useFeed([rookie.player_id], signal => getRookie(rookie.player_id!, signal));
  const games = rookie.comparison?.line.games ?? 0;
  type Row = PastRookie & { current?: boolean };
  const rows = useMemo<Row[]>(() => data && rookie.comparison ? [{ ...rookie.comparison.line, player_id: rookie.player_id!, name: rookie.name, year: ROOKIE_CLASS, first_season: ROOKIE_SEASON,
    first_season_games: games, photo_season: rookie.photo_season, photo_team: rookie.team, current: true }, ...data.comparisons] : [], [data, rookie, games]);
  const columns = useMemo<GridColumn<Row>[]>(() => [
    { key: "year", label: "Year", title: "Draft year", width: "xs", sort: r => r.year, data: r => ({ field: "year", value: r.year }), cell: r => <GridValue text={String(r.year)} /> },
    { key: "games", label: "G", width: "xs", sort: r => r.games, data: r => ({ field: "games", value: r.games }), cell: r => <GridValue text={String(r.games)} /> },
    ...ROOKIE_STATS.map(s => ({ key: s, label: STAT_LABELS[s], width: "xs" as const, sort: (r: Row) => r[s], data: (r: Row) => ({ field: s, value: r[s] ?? "" }), cell: (r: Row) => <GridValue text={statText(s, r[s])} /> })),
  ], []);
  const sorted = useSort(rows, columns, { key: "year", direction: "desc" });
  return <div className="dc-past">
    <h3 className="dc-subhead">Past number {rookie.pick} picks over their first {games} games</h3>
    {error && <FeedFailure error={error} retry={retry} what="The comparison" />}
    {loading && <FeedSkeleton label="Loading the comparison" />}
    {data && (data.comparisons.length === 0 ? <GatedNote>No past rookie at this pick has logged games.</GatedNote> :
      <StatsGrid<Row> label={`Past number ${rookie.pick} picks at ${games} games`} name="rookie-comparisons" density="compact" leadWidth="md" className="dc-past-grid"
        rows={sorted.rows} sort={sorted.sort} rowKey={r => r.player_id} rowData={r => ({ current: r.current ? "true" : undefined })}
        lead={{ label: "Player", cell: r => <GridPlayer playerId={r.player_id} name={r.name} team={r.photo_team} season={r.photo_season} era={seasonEra(r.photo_season, r.photo_team)}
          subtitle={r.current ? "This season" : r.first_season} href={`/players/${r.player_id}?season=${r.photo_season}`} /> }}
        columns={columns} />)}
  </div>;
}

const DRAFT_COLUMNS: GridColumn<Rookie>[] = [
  { key: "pick", label: "Pick", title: "Round and overall pick", width: "xs", sort: r => r.pick, data: r => ({ field: "pick", value: r.pick, round: r.round ?? "" }), cell: r => <GridValue text={pickLabel(r.round, r.pick)} /> },
  { key: "drafted", label: "By", title: "The team that made the pick", width: "sm", align: "left", cell: r => <TeamCode team={r.draft_team} season={ROOKIE_SEASON} /> },
];

const ratingColumns = (group?: string): GridColumn<Rookie>[] => [
  { key: "darko", label: group ? "DPM" : "DARKO", group, title: "DARKO Daily Plus-Minus", width: "sm", sort: r => r.darko?.dpm ?? null, data: r => ({ field: "darko", value: r.darko?.dpm ?? "" }),
    cell: r => <GridValue text={signed(r.darko?.dpm)} identity={identityOf(r.darko?.dpm)} /> },
  ...(group ? [
    { key: "o_dpm", label: "ODPM", group, title: "DARKO offence", width: "sm" as const, sort: (r: Rookie) => r.darko?.o_dpm ?? null, data: (r: Rookie) => ({ field: "o_dpm", value: r.darko?.o_dpm ?? "" }),
      cell: (r: Rookie) => <GridValue text={signed(r.darko?.o_dpm)} identity={identityOf(r.darko?.o_dpm)} /> },
    { key: "d_dpm", label: "DDPM", group, title: "DARKO defence", width: "sm" as const, sort: (r: Rookie) => r.darko?.d_dpm ?? null, data: (r: Rookie) => ({ field: "d_dpm", value: r.darko?.d_dpm ?? "" }),
      cell: (r: Rookie) => <GridValue text={signed(r.darko?.d_dpm)} identity={identityOf(r.darko?.d_dpm)} /> },
  ] : []),
  { key: "rapm", label: "RAPM", group, title: "Time-decay RAPM", width: "sm", sort: r => r.rapm?.rapm ?? null, data: r => ({ field: "rapm", value: r.rapm?.rapm ?? "" }),
    cell: r => <GridValue text={signed(r.rapm?.rapm)} identity={identityOf(r.rapm?.rapm)} /> },
];

/** The table's past-picks view: R09's per-36 comparison with each rookie's percentile among past picks at his slot. */
function pastColumns(): GridColumn<Rookie>[] {
  return [
    ...DRAFT_COLUMNS.map(c => ({ ...c, group: "Draft" })),
    { key: "games", label: "G", group: "Against past picks", width: "xs", sort: r => r.comparison?.line.games ?? null, data: r => ({ field: "games", value: r.comparison?.line.games ?? "" }),
      cell: r => <GridValue text={r.comparison ? `${r.comparison.line.games}${r.comparison.small_sample ? "*" : ""}` : null} title={r.comparison?.small_sample ? `Under 100 minutes (${fixed(r.comparison.line.minutes, 0)})` : undefined} /> },
    ...ROOKIE_STATS.map(s => ({ key: s, label: STAT_LABELS[s], group: "Against past picks", width: "sm" as const, sort: (r: Rookie) => r.comparison?.stats[s].value ?? null,
      data: (r: Rookie) => ({ field: s, value: r.comparison?.stats[s].value ?? "", percentile: r.comparison?.stats[s].percentile ?? "" }),
      cell: (r: Rookie) => { const c = r.comparison?.stats[s]; return c ? <GridValue text={statText(s, c.value)} sub={pct(c.percentile)} tone={toneOf(rookieTone(s, c))} /> : <GridValue text={null} />; } })),
    { key: "pool", label: "Past", group: "Against past picks", title: "Past rookies at the same pick, classes 1983 to 2025", width: "sm", sort: r => r.pool, data: r => ({ field: "pool", value: r.pool }), cell: r => <GridValue text={String(r.pool)} /> },
    ...ratingColumns().map(c => ({ ...c, group: "Ratings" })),
  ];
}

/** The Stats page's Overview columns and groups for the rookies; DPM and RAPM come from the tracker. A pick with no games shows dashes. */
function statColumns(view: Exclude<RookieView, "past">, lines: Map<string, RookieStatLine> | null | undefined): GridColumn<Rookie>[] {
  const value = (r: Rookie, metric: string) => r.state === "compared" && r.player_id ? lines?.get(r.player_id)?.[metric] ?? null : null;
  const figure = (group: string, key: string, label: string, metric: string, text: (v: number | null) => string, title?: string): GridColumn<Rookie> => ({
    key, label, group, title, width: "sm", sort: r => value(r, metric), data: r => ({ field: key, value: value(r, metric) ?? "" }),
    cell: r => <GridValue text={value(r, metric) === null ? null : text(value(r, metric))} />,
  });
  const scaled = (metric: string) => view === "raw" ? metric : `${metric}_${view}`;
  const count = (group: string, key: string, label: string) => figure(group, key, label, scaled(key), v => view === "raw" ? whole(v) : fixed(v, 1));
  const share = (group: string, key: string, label: string) => figure(group, key, label, key, v => percent(v, 1));
  const guide = (group: string): GridColumn<Rookie> => ({ key: `guide-${group}`, label: "", group, guide: true,
    cell: r => <PlayerPortrait playerId={r.player_id ?? undefined} name={r.name} size="sm" era={seasonEra(r.photo_season, r.team)} /> });
  return [
    ...DRAFT_COLUMNS.map(c => ({ ...c, group: "Draft" })),
    figure("Profile", "gp", "GP", "gp", whole, "Games played"), figure("Profile", "min", "MIN", "min", whole, "Total minutes"), figure("Profile", "min_per_game", "MPG", "min_per_game", v => fixed(v, 1), "Minutes per game"),
    guide("Impact"), ...ratingColumns("Impact"),
    guide("Counting"), count("Counting", "pts", "PTS"), count("Counting", "reb", "REB"), count("Counting", "ast", "AST"), count("Counting", "tov", "TOV"),
    guide("Eff"), share("Eff", "ts_pct", "TS%"), share("Eff", "efg_pct", "eFG%"),
    guide("Shooting"), share("Shooting", "fg2_pct", "2P%"), share("Shooting", "fg3_pct", "3P%"), count("Shooting", "fg3a", "3PA"), share("Shooting", "ft_pct", "FT%"), count("Shooting", "fta", "FTA"),
    guide("Other"), count("Other", "oreb", "OREB"), count("Other", "dreb", "DREB"), count("Other", "stl", "STL"), count("Other", "blk", "BLK"),
  ];
}

function RookiesSection({ feed }: { feed: ReturnType<typeof useFeed<RookieTracker>> }) {
  const { get, set } = useUrlState();
  const [query, setQuery] = useState("");
  const [team, setTeam] = useState<string | null>(null);
  const data = feed.data;
  const compared = useMemo(() => data?.rookies.filter(r => r.state === "compared" && r.player_id) ?? [], [data]);
  const stats = useFeed([], signal => getRookieStats(ROOKIE_SEASON, ROOKIE_CLASS, signal));
  const view = (ROOKIE_VIEWS.find(v => v.value === get("stat"))?.value ?? "per_game") as RookieView;
  const columns = useMemo(() => view === "past" ? pastColumns() : statColumns(view, stats.data), [view, stats.data]);
  const filtered = useMemo(() => (data?.rookies ?? []).filter(r => matches(r.name, query) && (!team || r.team === team)), [data, query, team]);
  const sorted = useSort(filtered, columns, { key: "pick", direction: "asc" });
  if (feed.error) return <FeedFailure error={feed.error} retry={feed.retry} what="The rookie tracker" />;
  if (feed.loading || !data) return <FeedSkeleton label="Loading the rookie tracker" />;
  if (data.state !== "ok") return <GatedNote>{data.state === "no_games" ? `No ${data.season} regular-season game is in the published data yet.` : "The past-rookie comparison table is not on this server, so the rookies can't be compared here."}</GatedNote>;
  const requested = get("rookie");
  const cleared = requested === NO_ROOKIE;
  const chosen = cleared ? null : compared.find(r => r.player_id === requested) ?? compared[0] ?? null;
  const choose = (id: string | null) => {
    set({ rookie: id === null ? NO_ROOKIE : id === compared[0]?.player_id ? null : id });
    if (id) document.getElementById("rookie-card")?.scrollIntoView({ block: "start" });
  };
  return <>
    <p className="dc-lead">Each rookie against every player taken at the same pick from 1983 to 2025, over the same number of first-season games.
      Games through <time dateTime={data.comparison_date ?? undefined}>{data.comparison_date}</time>;
      <span data-field="compared" data-value={compared.length}> {compared.length} of {data.rookies.length}</span> picks have played.</p>
    <div className="dc-rookie-pick" id="rookie-card">
      <EntityField label="Rookie" value={chosen?.player_id ?? ""} candidates={compared.map(rookieItem)} initialName={chosen?.name}
        onChange={next => choose(next || null)} />
    </div>
    {!chosen && <GatedNote action={<Button size="lg" variant="secondary" onClick={() => set({ rookie: null })}>Open the first pick</Button>}>
      No rookie chosen. Search for one above, or open the first pick who has played.</GatedNote>}
    {chosen && <div className="dc-rookie-pair">
      <RookieCard rookie={chosen} tracker={data} />
      <PastPicks key={chosen.player_id} rookie={chosen} />
    </div>}
    <h3 className="dc-subhead" id="rookie-stats">{data.season} rookie stats</h3>
    <div className="dc-grid-tools dc-rookie-tools">
      <Segmented label="Rookie stats" size="md" value={view} onChange={next => set({ stat: next === "per_game" ? null : next })} options={ROOKIE_VIEWS} />
      <TeamPicker value={team} onChange={setTeam} season={ROOKIE_SEASON} />
    </div>
    {view === "past"
      ? <p className="dc-note" data-field="rookie-note">Per 36 minutes, so rookies on different minutes can be compared with past picks at their slot. Under each figure, the rookie&apos;s percentile among those picks.
        Green or red: outside their middle 80% (turnovers count the other way). * Under 100 minutes. DARKO and RAPM are gold above zero and blue below.</p>
      : <p className="dc-note" data-field="rookie-note">Every {ROOKIE_CLASS} draft pick this regular season, with games through <time dateTime={data.comparison_date ?? undefined}>{data.comparison_date}</time>.
        DARKO and RAPM are gold above zero and blue below. <Link href={`/stats?season=${ROOKIE_SEASON}&draftYear=${ROOKIE_CLASS}`}>Open this class in Stats</Link></p>}
    {view !== "past" && stats.error ? <FeedFailure error={stats.error} retry={stats.retry} what="The rookie stats" />
      : view !== "past" && (stats.loading || !stats.data) ? <FeedSkeleton label="Loading the rookie stats" />
      :     <StatsGrid<Rookie> label={`${data.season} rookies`} name="rookies" leadWidth="lg" rows={sorted.rows} rowKey={r => String(r.pick)}
      rowData={r => ({ pick: r.pick, selected: chosen?.pick === r.pick ? "true" : undefined })} sort={sorted.sort}
      empty={query || team ? "No rookie matches these filters." : "No rookies."}
      lead={{ span: true, label: <GridSearch value={query} onChange={setQuery} label="Search rookies" placeholder="Search rookies…" />,
        cell: r => <GridPlayer playerId={r.player_id} name={r.name} team={r.team} season={ROOKIE_SEASON} era={seasonEra(r.photo_season, r.team)}
          subtitle={r.state === "compared" ? `${r.team ?? ""} · ${ROOKIE_SEASON}` : <span data-field="state" data-value="no_games">No games yet</span>}
          href={r.player_id ? `/players/${r.player_id}?season=${ROOKIE_SEASON}` : undefined}
          tools={r.state === "compared" && r.player_id ? <IconButton size="sm" icon="arrow-right" label={`Show ${r.name} in the card`} pressed={chosen?.pick === r.pick} onClick={() => choose(r.player_id)} /> : undefined} /> }}
      columns={columns} />}
  </>;
}

// ---- 2 and 3. Value by pick and ranges --------------------------------------------------------------

function digitsFor(span: Span, measure: Measure) { return span === "rapm" ? 2 : measure === "min" ? 0 : 1; }
function numText(v: number | null | undefined, digits: number) { return digits === 0 ? whole(v) : fixed(v, digits); }
function rangeOf(lo: number | null | undefined, hi: number | null | undefined, digits: number) { return digits === 0 ? `${whole(lo)} to ${whole(hi)}` : rangeText(lo, hi, digits); }

function ValueSection({ summary }: { summary: DraftSummary }) {
  const { get, set } = useUrlState();
  const span = (SPANS.find(s => s.value === get("span"))?.value ?? "window") as Span;
  const era = (ERAS.find(e => e.value === get("era"))?.value ?? "all") as Era;
  const measure = (MEASURES.find(m => m.value === get("measure"))?.value ?? "ws") as Measure;
  const rows = span === "rapm" ? summary.value_by_pick.rapm : summary.value_by_pick[span][era][measure];
  const digits = digitsFor(span, measure);
  const unit = span === "rapm" ? "RAPM, points per 100 possessions, weighted by minutes" : `${MEASURE_LABELS[measure]}, ${span === "window" ? "first four seasons" : "career to date"}`;
  const classes = span === "rapm" ? "2014–22" : span === "career" ? CAREER_ERA_LABELS[era].replace("All", "1966–2005") : ERA_LABELS[era].replace("All", "1966–2022");
  const one = summary.value_by_pick.window.all.ws[0], thirty = summary.value_by_pick.window.all.ws[29];
  const columns: GridColumn<SlotSummary>[] = [
    { key: "n", label: "Picks", width: "xs", data: r => ({ field: "n", value: r.n }), cell: r => <GridValue text={String(r.n)} /> },
    { key: "mean", label: "Mean", title: "Mean, with its 95% interval", width: "md", data: r => ({ field: "mean", value: r.mean ?? "", low: r.lo ?? "", high: r.hi ?? "" }),
      cell: r => <GridValue text={numText(r.mean, digits)} sub={known(r.mean) ? rangeOf(r.lo, r.hi, digits) : null} /> },
    { key: "median", label: "Median", width: "sm", data: r => ({ field: "median", value: r.median ?? "" }), cell: r => <GridValue text={numText(r.median, digits)} /> },
    ...(span !== "rapm" ? [
      { key: "p90", label: "90th pct", width: "sm" as const, data: (r: SlotSummary) => ({ field: "p90", value: r.p90 ?? "" }), cell: (r: SlotSummary) => <GridValue text={numText(r.p90, digits)} /> },
      { key: "played", label: "Played", title: "Share who played an NBA regular-season game", width: "sm" as const, data: (r: SlotSummary) => ({ field: "played", value: r.played_share ?? "" }), cell: (r: SlotSummary) => <GridValue text={percent(r.played_share)} /> },
    ] : []),
    ...(span === "career" ? [{ key: "active", label: "Still active", width: "sm" as const, data: (r: SlotSummary) => ({ field: "active", value: r.active ?? 0 }), cell: (r: SlotSummary) => <GridValue text={String(r.active ?? 0)} /> }] : []),
    ...(span === "rapm" ? [{ key: "no_rapm", label: "No RAPM", title: "Picks with no RAPM minutes in their window", width: "sm" as const, data: (r: SlotSummary) => ({ field: "no_rapm", value: r.no_rapm ?? 0 }), cell: (r: SlotSummary) => <GridValue text={String(r.no_rapm ?? 0)} /> }] : []),
  ];
  return <>
    <p className="dc-lead" data-field="headline">Over the first four seasons, the first pick has returned <strong data-value={one.mean ?? ""}>{fixed(one.mean)}</strong> win shares
      (95% {rangeText(one.lo, one.hi)}) and the thirtieth <strong data-value={thirty.mean ?? ""}>{fixed(thirty.mean)}</strong> ({rangeText(thirty.lo, thirty.hi)}), across classes 1966 to 2022.</p>
    <SqPanel className="dc-controls" label="Value controls">
      <Segmented label="Value" size="md" value={span} onChange={next => set({ span: next === "window" ? null : next })} options={SPANS} />
      {span !== "rapm" && <Segmented label="Classes" size="md" value={era} onChange={next => set({ era: next === "all" ? null : next })} options={ERAS} />}
      {span !== "rapm" && <Segmented label="Measure" size="md" value={measure} onChange={next => set({ measure: next === "ws" ? null : next })} options={MEASURES} />}
    </SqPanel>
    <figure className="dc-figure" data-chart="value-by-pick" data-span={span} data-era={era} data-measure={measure}>
      <figcaption className="dc-figure-title">{unit} by pick · classes {classes} · 95% interval shaded</figcaption>
      <SeasonLineChart key={`${span}-${era}-${measure}`} label={`${unit} by pick`} band="95%" xTicks={PICK_TICKS}
        points={rows.map(r => ({ season: String(r.slot), value: r.mean, low: r.lo, high: r.hi, label: `Pick ${r.slot} · ${r.n} picks` }))}
        format={v => numText(v, digits)} axisFormat={v => digits === 0 ? whole(v) : fixed(v, span === "rapm" ? 1 : 0)} />
      <p className="dc-axis-note">Pick</p>
    </figure>
    <StatsGrid<SlotSummary> label={`${unit} by pick`} name="value-by-pick" density="compact" leadWidth="sm" className="dc-slot-grid" rows={rows} rowKey={r => String(r.slot)}
      lead={{ label: "Pick", cell: r => <span className="dc-cell-strong">{r.slot}</span> }} columns={columns} />
  </>;
}

function RangesSection({ summary }: { summary: DraftSummary }) {
  const { get } = useUrlState();
  const era = (ERAS.find(e => e.value === get("era"))?.value ?? "all") as Era;
  const measure = (MEASURES.find(m => m.value === get("measure"))?.value ?? "ws") as Measure;
  const digits = measure === "min" ? 0 : 1;
  const bands = summary.bands.filter(b => b.era === era && b.measure === measure);
  return <>
    <p className="dc-lead">Mean first-four-season {MEASURE_LABELS[measure].toLowerCase()} of the first range minus the second, classes {ERA_LABELS[era].replace("All", "1966–2022")}{" "}
      (the era and measure chosen above). A range is called higher only when its whole 95% interval is above zero.</p>
    <ul className="rs-legend" aria-label="Colour key">
      <li><span className="rs-swatch" data-tone="good" aria-hidden="true" />First range higher: 95% interval above zero</li>
      <li><span className="rs-swatch" data-tone="bad" aria-hidden="true" />First range lower: 95% interval below zero</li>
      <li><span className="rs-swatch" aria-hidden="true" />Interval includes zero: no measurable difference</li>
    </ul>
    <StatsGrid<Band> label="Slot range differences" name="bands" density="compact" height="auto" leadWidth="lg" rows={bands} rowKey={b => b.band}
      lead={{ label: "Ranges", cell: b => <span className="dc-cell-strong">{BAND_LABELS[b.band] ?? b.band}</span> }}
      columns={[
        { key: "mean_a", label: "First", title: "Mean of the first range", width: "sm", data: b => ({ field: "mean_a", value: b.mean_a }), cell: b => <GridValue text={numText(b.mean_a, digits)} sub={`${b.n_a} picks`} /> },
        { key: "mean_b", label: "Second", title: "Mean of the second range", width: "sm", data: b => ({ field: "mean_b", value: b.mean_b }), cell: b => <GridValue text={numText(b.mean_b, digits)} sub={`${b.n_b} picks`} /> },
        { key: "diff", label: "Difference", title: "First minus second, with its 95% interval", width: "md", data: b => ({ field: "diff", value: b.diff, low: b.lo, high: b.hi }),
          cell: b => <GridValue text={signed(b.diff, digits)} sub={rangeOf(b.lo, b.hi, digits)} tone={b.lo > 0 ? "good" : b.hi < 0 ? "bad" : undefined} /> },
        { key: "verdict", label: "Verdict", width: "lg", align: "left", data: b => ({ field: "verdict", value: b.verdict }),
          cell: b => <span className="dc-cell-text">{b.verdict === "higher" ? "First range higher" : b.verdict === "lower" ? "First range lower" : "No measurable difference"}</span> },
      ]} />
  </>;
}

// ---- 4. Classes ------------------------------------------------------------------------------------

function TagLabel({ tag }: { tag: "Steal" | "Miss" | null }) {
  return tag ? <span className="dc-label" data-tint={tag === "Steal" ? "1" : "2"} data-field="tag">{tag}</span> : null;
}

function ClassPicker({ summary, year, onYear }: { summary: DraftSummary; year: number; onYear: (y: number) => void }) {
  const [text, setText] = useState("");
  const years = summary.classes.map(c => c.year);
  const index = years.indexOf(year);
  const items = useMemo<LookupItem[]>(() => [...summary.classes].reverse().map(c => ({
    id: String(c.year), canonical_id: String(c.year), kind: "page", display_name: `${c.year} NBA draft`, subtitle: `${STATUS_LABELS[c.status]} · ${c.picks} picks`,
    match_basis: "suggestion", match_score: 1, availability: { has_current_season: false, status: "available", seasons: [] }, destination_url: "",
  } as LookupItem)), [summary]);
  return <div className="dc-class-picker">
    <IconButton size="md" variant="secondary" icon="left" label="Earlier class" disabled={index <= 0} onClick={() => onYear(years[index - 1])} />
    <div className="dc-class-search">
      <LookupInput label="Draft class" placeholder="Search classes, e.g. 1984" value={text} onChange={setText} candidates={items} limit={items.length}
        groupLabel="Draft classes" onSelect={item => { setText(""); onYear(Number(item.canonical_id)); }} />
    </div>
    <IconButton size="md" variant="secondary" icon="right" label="Later class" disabled={index >= years.length - 1} onClick={() => onYear(years[index + 1])} />
  </div>;
}

function ClassesSection({ summary }: { summary: DraftSummary }) {
  const { get, set } = useUrlState();
  const years = summary.classes.map(c => c.year);
  const requested = Number(get("year"));
  const year = years.includes(requested) ? requested : LATEST_CLASS;
  const order = (ORDERS.find(o => o.value === get("order"))?.value ?? "draft") as Order;
  const [query, setQuery] = useState("");
  const [team, setTeam] = useState<string | null>(null);
  const { data, error, loading, retry } = useFeed([String(year)], signal => getDraftClass(year, signal));
  const season = seasonLabel(year);
  return <>
    <SqPanel className="dc-controls" label="Class controls">
      <ClassPicker summary={summary} year={year} onYear={y => { setTeam(null); set({ year: y === LATEST_CLASS ? null : String(y) }); }} />
      {data?.status === "complete" && <Segmented label="Order" size="md" value={order} onChange={next => set({ order: next === "draft" ? null : next })} options={ORDERS} />}
      <TeamPicker value={team} onChange={setTeam} season={season} />
    </SqPanel>
    {error && <FeedFailure error={error} retry={retry} what="The draft class" />}
    {loading && <FeedSkeleton label="Loading the draft class" />}
    {data && data.year === year && <ClassBody data={data} order={data.status === "complete" ? order : "draft"} query={query} setQuery={setQuery} team={team} />}
  </>;
}

function ClassBody({ data, order, query, setQuery, team }: { data: DraftClass; order: Order; query: string; setQuery: (v: string) => void; team: string | null }) {
  const complete = data.status === "complete";
  const season = seasonLabel(data.year);
  const rapm = data.year >= 2014 && data.year <= LATEST_CLASS;
  const steals = new Set(data.steals), misses = new Set(data.misses);
  const tagOf = (r: PickRow) => steals.has(r.pick) ? "Steal" as const : misses.has(r.pick) ? "Miss" as const : null;
  const rank = (r: PickRow) => order === "career" ? r.redraft_career : r.redraft_window;
  const rows = useMemo(() => [...data.rows]
    .sort((a, b) => order === "draft" ? a.pick - b.pick : order === "redraft" ? (a.redraft_window ?? 1e9) - (b.redraft_window ?? 1e9) : (a.redraft_career ?? 1e9) - (b.redraft_career ?? 1e9))
    .filter(r => matches(r.name, query) && (!team || r.team === team)), [data, order, query, team]);
  const columns: GridColumn<PickRow>[] = [
    ...(complete && order !== "draft" ? [{ key: "rank", label: order === "redraft" ? "Redraft" : "Career rank", width: "sm" as const, data: (r: PickRow) => ({ field: "rank", value: rank(r) ?? "" }), cell: (r: PickRow) => <GridValue text={rank(r) === null ? null : String(rank(r))} /> }] : []),
    { key: "pick", label: "Pick", title: "Round and overall pick", width: "sm", data: r => ({ field: "pick", value: r.pick, round: r.round ?? "" }), cell: r => <GridValue text={pickLabel(r.round, r.pick)} /> },
    { key: "team", label: "Drafted by", width: "md", align: "left", data: r => ({ field: "team", value: r.team ?? "" }), cell: r => <TeamCode team={r.team} season={season} /> },
    { key: "from", label: "From", width: "lg", align: "left", data: r => ({ field: "organization", value: r.organization ?? "" }),
      cell: r => <span className="dc-cell-text dc-from">{r.organization ?? "—"}<TagLabel tag={tagOf(r)} /></span> },
    { key: "window_ws", label: "WS", group: complete ? "First 4 seasons" : "To date", title: complete ? "Win shares, first four seasons" : "Win shares to date", width: "sm", data: r => ({ field: "window_ws", value: (complete ? r.window_ws : r.career_ws) ?? "" }), cell: r => <GridValue text={fixed(complete ? r.window_ws : r.career_ws)} /> },
    { key: "window_min", label: "Min", group: complete ? "First 4 seasons" : "To date", title: complete ? "Minutes, first four seasons" : "Minutes to date", width: "sm", data: r => ({ field: "window_min", value: (complete ? r.window_min : r.career_min) ?? "" }), cell: r => <GridValue text={whole(complete ? r.window_min : r.career_min)} /> },
    ...(complete ? [{ key: "career_ws", label: "Career WS", width: "sm" as const, data: (r: PickRow) => ({ field: "career_ws", value: r.career_ws ?? "" }),
      cell: (r: PickRow) => <GridValue text={fixed(r.career_ws)} title={r.active ? "Still active in 2025-26: to date" : `${r.career_seasons} seasons`} /> }] : []),
    ...(rapm ? [{ key: "rapm", label: "RAPM", title: "RAPM over the window, weighted by minutes", width: "sm" as const, data: (r: PickRow) => ({ field: "rapm", value: r.window_rapm ?? "" }),
      cell: (r: PickRow) => <GridValue text={signed(r.window_rapm, 2)} identity={identityOf(r.window_rapm, 2)} title={r.window_rapm === null ? "No RAPM in the window" : `${whole((r.window_rapm_seconds ?? 0) / 60)} minutes`} /> }] : []),
    ...(complete ? [
      { key: "expected", label: "Expected WS", title: "Mean at the same slot in the same era, from every other class", width: "sm" as const, data: (r: PickRow) => ({ field: "expected", value: r.expected_window_ws ?? "" }), cell: (r: PickRow) => <GridValue text={fixed(r.expected_window_ws)} /> },
      { key: "surplus", label: "Surplus", title: "Four-season win shares minus expected; no interval, so gold above zero and blue below", width: "sm" as const, data: (r: PickRow) => ({ field: "surplus", value: r.surplus_window_ws ?? "" }),
        cell: (r: PickRow) => <GridValue text={signed(r.surplus_window_ws)} identity={identityOf(r.surplus_window_ws)} /> },
    ] : []),
    ...(complete && order === "draft" ? [{ key: "redraft", label: "Redraft", width: "sm" as const, data: (r: PickRow) => ({ field: "redraft", value: r.redraft_window ?? "" }), cell: (r: PickRow) => <GridValue text={r.redraft_window === null ? null : String(r.redraft_window)} /> }] : []),
  ];
  return <>
    <h3 className="dc-subhead">{data.year} NBA draft</h3>
    <p className="dc-lead" data-field="class-summary">
      <span data-field="picks" data-value={data.picks}>{data.picks} picks</span>; <span data-field="played" data-value={data.played}>{data.played}</span> played an NBA regular-season game
      {complete && data.active ? <>; <span data-field="active" data-value={data.active}>{data.active}</span> still active in 2025-26</> : null}.{" "}
      {data.status === "complete" ? "Redraft ranks every pick by win shares over the first four seasons; Career by career win shares to date. Surplus is win shares over the same slot and era's mean."
        : data.status === "censored" ? `Only ${data.seasons_elapsed} of four seasons have been played, so this class shows value to date and is not redrafted or scored.`
          : <>This class plays its first season now: see <a href="#rookies">2026-27 rookies</a>.</>}
    </p>
    <StatsGrid<PickRow> label={`${data.year} draft class`} name="class" leadWidth="lg" className="dc-class-grid" rows={rows} rowKey={r => String(r.pick)}
      rowData={r => ({ year: data.year, order, tag: tagOf(r) ?? undefined })}
      empty={query || team ? "No pick matches these filters." : "No picks."}
      lead={{ span: true, label: <GridSearch value={query} onChange={setQuery} label="Search the class" placeholder="Search players…" />,
        cell: r => <GridPlayer playerId={r.player_id} name={r.name} team={r.photo_team} season={r.photo_season} era={seasonEra(r.photo_season, r.photo_team)}
          subtitle={r.played ? `First NBA team ${r.photo_team ?? "—"}` : "Never played in the NBA"}
          href={r.player_id ? `/players/${r.player_id}?season=${r.photo_season}` : undefined} /> }}
      columns={columns} />
  </>;
}

// ---- 5. Steals and misses ------------------------------------------------------------------------------

function PickCard({ row }: { row: PickRow }) {
  const season = seasonLabel(row.year);
  const tint = teamAccent(row.team, season);
  return <article className="dc-card dc-pick-card" data-card={`${row.year}-${row.pick}`} aria-label={`${row.year} pick ${row.pick}, ${row.name}`} style={tint ? vars({ "--dc-team": tint }) : undefined}>
    <header className="dc-card-head">
      <PlayerAvatar playerId={row.player_id ?? undefined} name={row.name} team={row.photo_team} size="lg" era={seasonEra(row.photo_season, row.photo_team)} className="dc-avatar" />
      <div className="dc-card-titles">
        {row.player_id ? <Link className="dc-card-name" href={`/players/${row.player_id}?season=${row.photo_season}`}>{row.name}</Link> : <span className="dc-card-name">{row.name}</span>}
        <span className="dc-card-team"><TeamCode team={row.team} season={season} /> · {row.year} draft</span>
      </div>
      <span className="dc-badge" data-field="pick" data-value={row.pick}>{pickLabel(row.round, row.pick)}</span>
    </header>
    <div className="dc-tiles" data-count="3">
      <div className="dc-tile"><span className="dc-tile-label">WS, 4 seasons</span><span data-field="window_ws" data-value={row.window_ws ?? ""}><GridValue text={fixed(row.window_ws)} /></span></div>
      <div className="dc-tile"><span className="dc-tile-label">Expected</span><span data-field="expected" data-value={row.expected_window_ws ?? ""}><GridValue text={fixed(row.expected_window_ws)} /></span></div>
      <div className="dc-tile"><span className="dc-tile-label">Surplus</span><span data-field="surplus" data-value={row.surplus_window_ws ?? ""}><GridValue text={signed(row.surplus_window_ws)} identity={identityOf(row.surplus_window_ws)} /></span></div>
    </div>
  </article>;
}

function PickList({ rows, label, name }: { rows: PickRow[]; label: string; name: string }) {
  return <StatsGrid<PickRow> label={label} name={name} density="compact" leadWidth="md" className="dc-list-grid" rows={rows} rowKey={r => `${r.year}-${r.pick}`}
    lead={{ label: "Player", cell: r => <GridPlayer playerId={r.player_id} name={r.name} team={r.team} season={seasonLabel(r.year)} era={seasonEra(r.photo_season, r.photo_team)}
      subtitle={`${r.year} · ${codeOf(r.team, seasonLabel(r.year)) ?? "—"}`} href={r.player_id ? `/players/${r.player_id}?season=${r.photo_season}` : undefined} /> }}
    columns={[
      { key: "pick", label: "Pick", title: "Round and overall pick", width: "sm", data: r => ({ field: "pick", value: r.pick, round: r.round ?? "" }), cell: r => <GridValue text={pickLabel(r.round, r.pick)} /> },
      { key: "window_ws", label: "WS", title: "Win shares, first four seasons", width: "xs", data: r => ({ field: "window_ws", value: r.window_ws ?? "" }), cell: r => <GridValue text={fixed(r.window_ws)} /> },
      { key: "expected", label: "Exp.", title: "Expected: the slot's mean in the same era from every other class", width: "xs", data: r => ({ field: "expected", value: r.expected_window_ws ?? "" }), cell: r => <GridValue text={fixed(r.expected_window_ws)} /> },
      { key: "surplus", label: "Surplus", width: "sm", data: r => ({ field: "surplus", value: r.surplus_window_ws ?? "" }), cell: r => <GridValue text={signed(r.surplus_window_ws)} identity={identityOf(r.surplus_window_ws)} /> },
    ]} />;
}

function StealsSection({ summary }: { summary: DraftSummary }) {
  return <div className="dc-pair">
    <div className="dc-column" data-list="steals">
      <h3 className="dc-subhead">Biggest steals</h3>
      <p className="dc-lead">The largest surpluses in any round: four-season win shares over the mean at the same slot and era from every other class.</p>
      <div className="dc-cards">{summary.steals.slice(0, 3).map(r => <PickCard key={`${r.year}-${r.pick}`} row={r} />)}</div>
      <PickList rows={summary.steals} label="Steals" name="steals" />
    </div>
    <div className="dc-column" data-list="misses">
      <h3 className="dc-subhead">Biggest misses</h3>
      <p className="dc-lead">The most negative first-round surpluses. Surplus measures what a pick returned, not whether the choice was sound: a pick can fall short
        for reasons nobody controlled. Len Bias (1986, pick 2) died two days after the draft.</p>
      <div className="dc-cards">{summary.misses.slice(0, 3).map(r => <PickCard key={`${r.year}-${r.pick}`} row={r} />)}</div>
      <PickList rows={summary.misses} label="Misses" name="misses" />
    </div>
  </div>;
}

// ---- 6. Combine --------------------------------------------------------------------------------------

function CombineScatter({ rows, measure, r }: { rows: CombineRow[]; measure: string; r: string }) {
  const points = rows.filter(p => known(p[measure as keyof CombineRow] as number | null) && known(p.window_ws)).map(p => ({ p, x: p[measure as keyof CombineRow] as number, y: p.window_ws! }));
  if (points.length < 2) return <GatedNote>Too few measured players to draw this scatter.</GatedNote>;
  const xt = niceTicks(points.map(p => p.x), 5), yt = niceTicks([0, ...points.map(p => p.y)], 5);
  const [x0, x1, y0, y1] = [xt[0], xt.at(-1)!, yt[0], yt.at(-1)!];
  const left = 52, right = 628, top = 12, bottom = 380;
  const px = (v: number) => left + (v - x0) / (x1 - x0 || 1) * (right - left);
  const py = (v: number) => bottom - (v - y0) / (y1 - y0 || 1) * (bottom - top);
  const xDigits = x1 - x0 < 5 ? 1 : 0;
  const label = COMBINE_LABELS[measure];
  return <svg className="dc-scatter chart-graphic" viewBox="0 0 640 430" role="img" aria-label={`${label} against first-four-season win shares: ${points.length} drafted players, ${r}.`} data-chart="combine" data-measure={measure}>
    {yt.map(v => <g key={`y${v}`}><line className={v === 0 ? "dc-scatter-axis" : "dc-scatter-grid"} x1={left} x2={right} y1={py(v)} y2={py(v)} /><text x={left - 8} y={py(v) + 4} textAnchor="end">{fixed(v, 0)}</text></g>)}
    {xt.map(v => <g key={`x${v}`}><line className="dc-scatter-grid" x1={px(v)} x2={px(v)} y1={top} y2={bottom} /><text x={px(v)} y={bottom + 18} textAnchor="middle">{fixed(v, xDigits)}</text></g>)}
    <text x={(left + right) / 2} y={bottom + 44} textAnchor="middle">{label} ({COMBINE_UNITS[measure]})</text>
    <text transform={`translate(12 ${(top + bottom) / 2}) rotate(-90)`} textAnchor="middle">Win shares, first four seasons</text>
    {points.map(({ p, x, y }) => <circle key={`${p.year}-${p.player_id}`} className="dc-scatter-dot" cx={px(x)} cy={py(y)} r="3" data-player={p.player_id} data-x={x} data-value={y}>
      <title>{`${p.name} (${p.year}, pick ${p.pick}): ${fixed(x, 2)} ${COMBINE_UNITS[measure]}, ${fixed(y)} win shares`}</title>
    </circle>)}
  </svg>;
}

function CombineSection({ summary }: { summary: DraftSummary }) {
  const { get, set } = useUrlState();
  const measure = get("combine") && COMBINE_LABELS[get("combine")!] ? get("combine")! : "wingspan";
  const { data, error, loading, retry } = useFeed([], signal => getDraftCombine(signal));
  type Row = { measure: string; ws?: DraftSummary["combine"]["correlations"][number]; min?: DraftSummary["combine"]["correlations"][number] };
  const correlations: Row[] = Object.keys(COMBINE_LABELS).map(m => ({ measure: m,
    ws: summary.combine.correlations.find(c => c.measure === m && c.outcome === "window_ws"), min: summary.combine.correlations.find(c => c.measure === m && c.outcome === "window_min") }));
  const chosen = correlations.find(c => c.measure === measure)?.ws;
  const rText = chosen ? `r ${signed(chosen.r, 2)} (95% ${rangeText(chosen.lo, chosen.hi, 2)})` : "r unknown";
  return <>
    <p className="dc-lead">Pearson correlation between each NBA Draft Combine measurement and value over the first four seasons, for drafted players in classes 2000 to 2022.
      Descriptive only: no model and no prediction, and no adjustment for draft position, which already reflects these measurements. All are weak.</p>
    <StatsGrid<Row> label="Combine correlations" name="combine-correlations" density="compact" height="auto" leadWidth="lg" rows={correlations} rowKey={c => c.measure}
      lead={{ label: "Measurement", cell: c => <span className="dc-cell-strong">{COMBINE_LABELS[c.measure]}</span> }}
      columns={[
        { key: "n", label: "Players", width: "sm", data: c => ({ field: "n", value: c.ws?.n ?? "" }), cell: c => <GridValue text={c.ws ? String(c.ws.n) : null} /> },
        { key: "r_ws", label: "r with WS", title: "Correlation with four-season win shares, 95% interval", width: "md", keepCase: true, data: c => ({ field: "r_ws", value: c.ws?.r ?? "", low: c.ws?.lo ?? "", high: c.ws?.hi ?? "" }),
          cell: c => <GridValue text={signed(c.ws?.r, 2)} sub={rangeText(c.ws?.lo, c.ws?.hi, 2)} /> },
        { key: "r_min", label: "r with minutes", title: "Correlation with four-season minutes, 95% interval", width: "md", keepCase: true, data: c => ({ field: "r_min", value: c.min?.r ?? "", low: c.min?.lo ?? "", high: c.min?.hi ?? "" }),
          cell: c => <GridValue text={signed(c.min?.r, 2)} sub={rangeText(c.min?.lo, c.min?.hi, 2)} /> },
      ]} />
    <div className="dc-scatter-head">
      <h3 className="dc-subhead">{COMBINE_LABELS[measure]} against first-four-season win shares</h3>
      <Select size="md" aria-label="Combine measurement" value={measure} onChange={event => set({ combine: event.target.value === "wingspan" ? null : event.target.value })}>
        {Object.entries(COMBINE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
      </Select>
    </div>
    {error && <FeedFailure error={error} retry={retry} what="Combine rows" />}
    {loading && <FeedSkeleton label="Loading combine rows" />}
    {data && <figure className="dc-figure">
      <CombineScatter rows={data.rows} measure={measure} r={rText} />
      <figcaption className="dc-note" data-field="combine-r">{rText}. Each dot is one drafted player; hover for the name.</figcaption>
    </figure>}
    <p className="dc-note">Every player&apos;s measurements, with position averages and a searchable table, are on Wingspan. It uses the same NBA Draft Combine data and adds
      reported wingspans for players the combine never measured; this section keeps drafted players from classes 2000 to 2022, whose value is known.</p>
    <ResearchLinks label="Combine pages" links={[{ label: "Wingspan", href: "/wingspan", icon: "arrow-right" }]} />
  </>;
}

// ---- 7 and 8. Reading and About ----------------------------------------------------------------------

function Reading() {
  return <>
    <ResearchCards columns={3}>
      <ResearchCard kicker="Value"><p className="dc-card-text">Win shares and minutes over a pick&apos;s first four NBA seasons, the window every complete class (1966 to 2022) has
        played. A pick who never played counts as zero: complete season totals record his absence.</p></ResearchCard>
      <ResearchCard kicker="Surplus"><p className="dc-card-text">A pick&apos;s four-season win shares minus the mean at the same slot and era from every other class. It has no
        interval, so it is gold above zero and blue below, never green or red.</p></ResearchCard>
      <ResearchCard kicker="Colour"><p className="dc-card-text">Green or red only where a 95% interval excludes zero (ranges of picks), and for rookies outside the middle
        80% of past picks at their slot. Overlapping intervals rank nothing.</p></ResearchCard>
    </ResearchCards>
    <Glossary groups={[
      { label: "Picks and classes", icon: "graduation", items: [
        { term: "Complete class", text: "A class with four seasons played: 1966 to 2022. Classes 2023 to 2025 are shown to date, never redrafted or scored." },
        { term: "Redraft", text: "Every pick in a complete class ranked by four-season win shares (ties by minutes, then the original pick); Career ranks by career win shares to date." },
        { term: "Expected", text: "The mean at the same slot in the same era (1966–88 or 1989 on) from every other class." },
        { term: "Steal and miss", text: "The ten largest surpluses in a class are its steals; the ten most negative first-round surpluses are its misses. The page lists the 25 largest of each since 1966." },
      ] },
      { label: "Rookies and ratings", icon: "users", items: [
        { term: "Past picks", text: "Every player taken at the same pick from 1983 to 2025, over his first appearances of his first season, as many as the rookie has played. Their later games are never read." },
        { term: "Percentile", text: "Where the rookie's figure sits among those past picks; p50 is the middle." },
        { term: "DARKO and RAPM", text: "Current ratings shown beside the rookie, not compared: past rookies have none from the same point of their first season." },
        { term: "RAPM by pick", text: "Classes 2014 to 2022, weighted by minutes over the first four seasons; nine classes a slot." },
      ] },
    ]} />
  </>;
}

function About({ summary }: { summary: DraftSummary }) {
  const r = summary.registration;
  return <ResearchDisclosure id="about" icon="info" title="About this page">
    <MethodBlock title="Coverage by class">
      <p className="dc-card-text">Every class from 1966 to 2026 has a complete pick list with no gap in pick numbers. Value is read from NBA regular seasons through 2025-26.</p>
      <StatsGrid<ClassIndex> label="Coverage by class" name="coverage" density="compact" leadWidth="sm" className="dc-coverage-grid" rows={[...summary.classes].reverse()} rowKey={c => String(c.year)}
        lead={{ label: "Class", cell: c => <span className="dc-cell-strong">{c.year}</span> }}
        columns={[
          { key: "status", label: "Status", width: "md", align: "left", data: c => ({ field: "status", value: c.status }), cell: c => <span className="dc-label" data-tint={STATUS_TINT[c.status]}>{STATUS_LABELS[c.status]}</span> },
          { key: "seasons", label: "Seasons", width: "sm", data: c => ({ field: "seasons", value: c.seasons_elapsed }), cell: c => <GridValue text={String(c.seasons_elapsed)} /> },
          { key: "picks", label: "Picks", width: "sm", data: c => ({ field: "picks", value: c.picks }), cell: c => <GridValue text={String(c.picks)} /> },
          { key: "played", label: "Played", width: "sm", data: c => ({ field: "played", value: c.played }), cell: c => <GridValue text={String(c.played)} /> },
          { key: "active", label: "Active", title: "Still active in 2025-26", width: "sm", data: c => ({ field: "active", value: c.active }), cell: c => <GridValue text={String(c.active)} /> },
          { key: "source", label: "Pick list", width: "xl", align: "left", cell: c => <span className="dc-cell-text">{c.source}</span> },
        ]} />
    </MethodBlock>
    <MethodBlock title="Caveats">
      <ul className="dc-list">{summary.caveats.map(c => <li key={c}>{c}</li>)}</ul>
    </MethodBlock>
    <MethodBlock title="One known error">
      <p className="dc-card-text" data-field="known-error">One pick is credited to the wrong person. NBA.com&apos;s player records give Walker Russell (1982-83 to 1987-88) and his son
        Walker Russell Jr. (2011-12, undrafted) the same slot, 1982 pick 78. The data kept the son, so that pick shows 0 win shares and 0 minutes instead of about −0.5 win
        shares and 1,255 minutes. It is beyond pick 60, so value by pick is unchanged; it moves that pick in the 1982 redraft. The frozen results keep it as recorded.</p>
    </MethodBlock>
    <MethodBlock title="Sources and credits">
      <ul className="dc-list">{summary.credits.filter(c => !c.startsWith("Page reference")).map(c => <li key={c}>{c}</li>)}</ul>
      <ul className="dc-list">{summary.sources.map(s => <li key={s.classes.join("-")}>Classes {s.classes[0]}–{s.classes[1]}: {s.name}{s.license ? ` (${s.license})` : ""}. {s.note}</li>)}</ul>
    </MethodBlock>
    <MethodBlock title="Method">
      <p className="dc-card-text">Intervals come from a seeded bootstrap over the players at each slot or range: {r.parameters.replicates.toLocaleString("en-US")} replicates, 95%.
        The method was registered on {r.registered_on} before any result was summarized, and the results were read once. There is no prospect model.</p>
      <p className="dc-note">Registration <code data-field="registration-sha" data-value={r.content_sha256}>{r.content_sha256.slice(0, 16)}</code> · results{" "}
        <code data-field="results-sha" data-value={r.results_sha256}>{r.results_sha256.slice(0, 16)}</code>. Two runs give the same hash.</p>
      <ResearchLinks label="Evidence" links={[{ label: "How Draft Classes was built", href: evidenceUrl("docs/evidence/research/r09/README.md"), icon: "external" }]} />
    </MethodBlock>
  </ResearchDisclosure>;
}

// ---- Page ----------------------------------------------------------------------------------------------

function Section({ id, icon, title, children }: { id: string; icon: Parameters<typeof ResearchSection>[0]["icon"]; title: string; children: ReactNode }) {
  const n = SECTIONS.findIndex(s => s.id === id) + 1;
  return <ResearchSection id={id} icon={icon} title={`${n}. ${title}`} className="dc-section">{children}</ResearchSection>;
}

export function DraftClassesResearch() {
  const { get } = useUrlState();
  const summary = useFeed([], signal => getDraftSummary(signal));
  const rookies = useFeed([], signal => getRookies(signal));
  const current = useCurrentSection();
  const [indexOpen, setIndexOpen] = useState(false);
  const data = summary.data;
  const tab = get("tab");
  useEffect(() => {
    const target = tab ? TAB_SECTIONS[tab] : undefined;
    if (!target || !data) return;
    // The sections above it finish loading after the first scroll, so keep it aligned briefly, until the visitor scrolls.
    const go = () => document.getElementById(target)?.scrollIntoView({ block: "start" });
    const events = ["wheel", "touchmove", "keydown", "pointerdown"] as const;
    const stop = () => { clearInterval(timer); clearTimeout(end); events.forEach(name => window.removeEventListener(name, stop)); };
    go();
    const timer = setInterval(go, 250);
    const end = setTimeout(stop, 3000);
    events.forEach(name => window.addEventListener(name, stop, { passive: true }));
    return stop;
  }, [tab, data]);
  const picks = data?.classes.reduce((sum, c) => sum + c.picks, 0);
  const date = rookies.data?.state === "ok" ? rookies.data.comparison_date : null;
  return <PageShell template="research" className="dc-shell">
    <div className="rs-column dc-page">
      <PageHeader className="sq-hero dc-hero research-hero" icon="graduation" title="Draft Classes"
        subtitle="What every NBA draft slot has returned since 1966, and how this year's rookies compare." />
      <ResearchIntro
        tagline={<span data-field="hero-meta">{date ? <>Games through <time dateTime={date}>{date}</time> · </> : null}{picks ? `${picks.toLocaleString("en-US")} picks · ` : ""}classes 1966–2026</span>}
        links={[{ label: "Wingspan", href: "/wingspan", icon: "ruler" }, { label: "Players", href: "/players", icon: "users" }, { label: "Learning", href: "/methodology/learning", icon: "book" }]} />
      <div className="dc-layout">
        <aside className="dc-aside"><nav className="dc-aside-sticky" aria-label="Sections"><SectionIndex current={current} /></nav></aside>
        <details className="dc-index-phone" open={indexOpen} onToggle={event => setIndexOpen(event.currentTarget.open)}>
          <ButtonSummary size="md" variant="secondary" icon="list-ordered" iconAfter="chevron-down">Sections</ButtonSummary>
          <nav className="dc-index-phone-list" aria-label="Sections (phone)"><SectionIndex current={current} onPick={() => setIndexOpen(false)} /></nav>
        </details>
        <div className="dc-sections">
          <Section id="rookies" icon="users" title={`${ROOKIE_SEASON} rookies`}><RookiesSection feed={rookies} /></Section>
          {summary.error && <FeedFailure error={summary.error} retry={summary.retry} what="Draft Classes" />}
          {summary.loading && <FeedSkeleton label="Loading Draft Classes" />}
          {data && <>
            <Section id="value" icon="chart-line" title="What a slot is worth"><ValueSection summary={data} /></Section>
            <Section id="ranges" icon="scale" title="Ranges of picks"><RangesSection summary={data} /></Section>
            <Section id="classes" icon="list-ordered" title="Classes and redrafts"><ClassesSection summary={data} /></Section>
            <Section id="steals" icon="trophy" title="Steals and misses"><StealsSection summary={data} /></Section>
            <Section id="combine" icon="ruler" title="Combine beside value"><CombineSection summary={data} /></Section>
            <Section id="reading" icon="book" title="How to read"><Reading /></Section>
            <About summary={data} />
          </>}
        </div>
      </div>
    </div>
  </PageShell>;
}
