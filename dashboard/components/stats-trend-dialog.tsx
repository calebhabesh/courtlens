"use client";

import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { LookupInput } from "./lookup-input";
import { PlayerPortrait } from "./player-portrait";
import { Icon } from "./ui/icon";
import { Modal } from "./ui/modal";
import { Select } from "./ui/select";
import { Segmented, type SegmentedOption } from "./ui/kit";
import { GridValue, StatsGrid } from "./research/stats-grid";
import { ValueDot, valueDotRadius, valueDotsFit } from "./charts/value-dot";
import { executeWorkbenchQuery, getPlayerCareer, getPlayerSeasons } from "@/lib/workbench-api";
import { DARKO_COLUMNS, formatColumnValue, TRACKING_COLUMNS, usesImpactManifest, type ColumnDefinition } from "@/lib/stats-presets";
import { DarkoSourceLink } from "./darko-source-link";
import type { MetricHint } from "@/lib/stats-glossary";
import { phaseLabel } from "@/lib/scope-labels";
import type { PlayerCareerResponse, PlayerResearchItem, QuerySpec, WorkbenchCatalog } from "@/lib/types";
import { PlayerLink } from "./entity-link";

const MAX_PLAYERS = 4;
const SEASON_CONCURRENCY = 3;
/** Phases the career read serves; play-in and Cup trends keep one query per season. */
const CAREER_PHASES = new Set(["regular_season", "playoffs"]);

type TrendPlayer = { player_id: string; player_name: string; portrait_url?: string | null };
/** failed: players whose read errored, so their values are unavailable (not "no games"). */
type SeasonRows = { season: string; items: PlayerResearchItem[]; failed?: string[] };
/** One player's career read; seasons is absent when the read failed. */
export type CareerRead = { player_id: string; seasons?: PlayerCareerResponse["seasons"] };

/** The loaded seasons from the first to the last one any player appeared in; gaps inside stay. */
export function careerSeasons(loaded: string[], played: string[]): string[] {
  const seen = new Set(played);
  const first = loaded.findIndex(season => seen.has(season));
  if (first < 0) return [];
  const last = loaded.findLastIndex(season => seen.has(season));
  return loaded.slice(first, last + 1);
}

/** Promise.allSettled over items, running at most `limit` calls at a time. */
export async function settleLimited<T, R>(items: T[], limit: number, run: (item: T) => Promise<R>): Promise<PromiseSettledResult<R>[]> {
  const results: PromiseSettledResult<R>[] = new Array(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const index = next++;
      try { results[index] = { status: "fulfilled", value: await run(items[index]) }; }
      catch (reason) { results[index] = { status: "rejected", reason }; }
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

/** Season rows from each player's career read, over the career span any player covers. */
export function careerRows(loaded: string[], reads: CareerRead[]): SeasonRows[] {
  const bySeason = new Map<string, PlayerResearchItem[]>();
  for (const read of reads) for (const entry of read.seasons ?? []) {
    if (entry.item) bySeason.set(entry.season, [...bySeason.get(entry.season) ?? [], entry.item]);
  }
  const failed = reads.filter(read => !read.seasons).map(read => read.player_id);
  return careerSeasons(loaded, [...bySeason.keys()])
    .map(season => ({ season, items: bySeason.get(season) ?? [], ...(failed.length ? { failed } : {}) }));
}

export type TrendTarget = { player: PlayerResearchItem; columnKey: string };

/** The value a column shows, as a number for plotting; GP and MIN use the row-level fields. */
function plotValue(column: ColumnDefinition, item: PlayerResearchItem): number | null {
  const value = column.key === "gp" ? item.games_played ?? item.metrics.gp
    : column.key === "min" ? item.total_minutes ?? item.metrics.min
    : item.metrics[column.key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/**
 * the reference site's stat trend dialog: one stat across the loaded seasons for up to four players.
 * Whole-season trends read each player's career once (every season row with every column, from
 * the stored season cohorts), so switching the statistic needs no request. Other windows and
 * phases query each season in the same phase, window and release. A season without a row for a
 * player is a gap (unknown), never zero.
 */
export function StatsTrendDialog({ target, columns, querySpec, catalog, hints, onClose }: {
  target: TrendTarget | null;
  columns: ColumnDefinition[];
  querySpec: QuerySpec;
  catalog?: WorkbenchCatalog;
  hints: Record<string, MetricHint>;
  onClose: () => void;
}) {
  const [opened, setOpened] = useState<TrendTarget | null>(null);
  const [columnKey, setColumnKey] = useState("");
  const [players, setPlayers] = useState<TrendPlayer[]>([]);
  const [lookup, setLookup] = useState("");
  // The player whose line is hovered or whose card has the pointer or focus: the others dim.
  const [focused, setFocused] = useState<string | null>(null);
  // Lines is the default (Table on a phone, where the chart's labels get too small to read); a
  // chosen view stays while players and the statistic change. The dialog renders nothing on the
  // server, so reading the screen width here never mismatches hydration.
  const [view, setView] = useState<TrendView>(() =>
    typeof window !== "undefined" && window.matchMedia?.("(max-width: 767px)").matches ? "table" : "lines");
  const focusedId = view === "lines" && players.length > 1 && players.some(player => player.player_id === focused) ? focused : null;
  const [result, setResult] = useState<{ key: string; rows?: SeasonRows[]; error?: string } | null>(null);
  // Career reads by player, phase and release: reopening or adding a player reuses them.
  const careers = useRef(new Map<string, Promise<PlayerCareerResponse>>());

  // Each opening starts from the clicked cell.
  if (target !== opened) {
    setOpened(target);
    if (target) {
      setColumnKey(target.columnKey);
      setPlayers([{ player_id: target.player.player_id, player_name: target.player.player_name, portrait_url: target.player.portrait_url }]);
      setLookup("");
    }
  }

  const column = columns.find(entry => entry.key === columnKey) ?? columns[0];
  const seasons = useMemo(() => [...new Set((catalog?.stats_scopes ?? [])
    .filter(scope => scope.phase === querySpec.phase).map(scope => scope.season))].sort(), [catalog, querySpec.phase]);
  const ids = players.map(player => player.player_id);
  // Box-score stats skip the impact join, which is several times slower per season.
  const impact = Boolean(column && usesImpactManifest(column.key));
  // Box stats arrive with every row; impact and tracking values join only for a named column.
  const joined = column && (impact || column.key in TRACKING_COLUMNS) ? column.key : null;
  // A career row is the whole-season row, so only season-window trends can read careers.
  const career = CAREER_PHASES.has(querySpec.phase) && (querySpec.window?.kind ?? "season") === "season";
  const requestKey = JSON.stringify({ ids, seasons, phase: querySpec.phase, release: querySpec.release_id, open: Boolean(target),
    career, joined: career ? null : joined });

  useEffect(() => {
    if (!target || ids.length === 0) return;
    let active = true;
    const failure = { key: requestKey, error: "Trend unavailable: the season queries failed. Try again." };
    if (career) {
      const readCareer = (id: string) => {
        const key = `${id}|${querySpec.phase}|${querySpec.release_id ?? ""}`;
        let read = careers.current.get(key);
        if (!read) {
          read = getPlayerCareer(id, { phase: querySpec.phase, releaseId: querySpec.release_id ?? undefined });
          careers.current.set(key, read);
          read.catch(() => careers.current.delete(key));
        }
        return read;
      };
      Promise.allSettled(ids.map(readCareer)).then(settled => {
        if (!active) return;
        const reads = settled.map((entry, index): CareerRead => ({ player_id: ids[index],
          ...(entry.status === "fulfilled" ? { seasons: entry.value.seasons } : {}) }));
        setResult(reads.every(read => !read.seasons) ? failure : { key: requestKey, rows: careerRows(seasons, reads) });
      });
      return () => { active = false; };
    }
    const querySeason = async (season: string): Promise<SeasonRows> => {
      const scope = catalog?.stats_scopes?.find(entry => entry.season === season && entry.phase === querySpec.phase);
      const spec: QuerySpec = {
        release_id: querySpec.release_id, season, phase: querySpec.phase,
        before_date: scope?.default_before_date ?? null, window: querySpec.window,
        ...(joined ? { view_state: { columns: [joined] } } : {}),
        ...(impact ? { impact_manifest_sha256: querySpec.impact_manifest_sha256 } : {}),
        sort: [{ field: "pts_per_game", direction: "desc" }], page: { limit: MAX_PLAYERS }
      };
      const response = await executeWorkbenchQuery(spec, { player_ids: ids });
      return { season, items: response.items };
    };
    // Only the seasons the players appeared in, a few at a time: each season query computes that
    // season's whole cohort server-side, so all 26 at once saturated the API and timed out.
    getPlayerSeasons(ids, querySpec.phase, querySpec.release_id ?? undefined)
      .then(response => careerSeasons(seasons, Object.values(response.seasons).flat()))
      .catch(() => seasons)
      .then(range => settleLimited(range, SEASON_CONCURRENCY, querySeason).then(settled => {
        if (!active) return;
        const rows = settled.map((entry, index): SeasonRows => entry.status === "fulfilled" ? entry.value
          : { season: range[index], items: [], failed: ids });
        setResult(range.length > 0 && rows.every(row => row.failed) ? failure : { key: requestKey, rows });
      }));
    return () => { active = false; };
    // requestKey covers every input of the request.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requestKey]);

  if (!target || !column) return null;
  const current = result?.key === requestKey ? result : null;
  const hint = hints[column.key];

  return (
    <Modal isOpen onClose={onClose} title={`${column.label} Trend`}
      description={`${players[0]?.player_name ?? ""} · ${phaseLabel(querySpec.phase)}`} className="stats-trend-dialog">
      <div className="stats-trend-toolbar">
        <button type="button" className="stats-trend-back" onClick={onClose}><Icon name="left" size={14} />Back to table <kbd>esc</kbd></button>
        <Select aria-label="Trend statistic" value={column.key} onChange={event => setColumnKey(event.target.value)} wrapperClassName="stats-trend-metric">
          {columns.map(entry => <option key={entry.key} value={entry.key}>{entry.label}{hints[entry.key] ? ` · ${hints[entry.key].name}` : ""}</option>)}
        </Select>
      </div>
      <div className="stats-trend-body" aria-busy={!current}>
        <div className="stats-trend-head">
          <h3 className="stats-trend-title">{column.label} Progression</h3>
          <Segmented size="sm" label="Trend view" value={view} onChange={setView} options={VIEWS} />
        </div>
        {current?.error ? <p role="alert" className="stats-trend-note">{current.error}</p>
          : current?.rows ? <TrendChart view={view} column={column} players={players} rows={current.rows} focused={focusedId} onFocusSeries={setFocused} />
          : <p className="stats-trend-note" role="status">Loading seasons…</p>}
        <div className={`stats-trend-players${focusedId ? " has-focus" : ""}`} role="group" aria-label="Players in the trend">
          {players.map((player, index) => (
            <div key={player.player_id} className={`stats-trend-player${player.player_id === focusedId ? " is-focused" : ""}`} data-series={index + 1}
              onPointerEnter={() => setFocused(player.player_id)} onPointerLeave={() => setFocused(null)}
              onFocus={() => setFocused(player.player_id)} onBlur={() => setFocused(null)}>
              <PlayerPortrait playerId={player.player_id} name={player.player_name} portraitUrl={player.portrait_url} size="md" />
              <span><span className="stats-trend-swatch" aria-hidden="true" /><PlayerLink id={player.player_id}>{player.player_name}</PlayerLink></span>
              {players.length > 1 && <button type="button" className="stats-trend-remove" aria-label={`Remove ${player.player_name}`}
                onClick={() => setPlayers(list => list.filter(entry => entry.player_id !== player.player_id))}><Icon name="close" size={14} /></button>}
            </div>
          ))}
          {players.length < MAX_PLAYERS && <div className="stats-trend-add">
            <LookupInput label="Add player to trend" placeholder="Add player" value={lookup} onChange={setLookup} kinds={["player"]}
              compactResults portalDropdown limit={6}
              onSelect={item => {
                setLookup("");
                setPlayers(list => list.some(entry => entry.player_id === item.canonical_id) ? list
                  : [...list, { player_id: item.canonical_id, player_name: item.display_name }]);
              }} />
          </div>}
        </div>
        {hint && <p className="stats-trend-definition"><strong>{column.label}:</strong> {hint.name}: {hint.description}</p>}
        {column.key in DARKO_COLUMNS && <DarkoSourceLink>DARKO · Kostya Medvedovsky</DarkoSourceLink>}
      </div>
    </Modal>
  );
}

/** 1, 2, 2.5 or 5 times a power of ten: the round step nearest the raw step. */
export function niceStep(raw: number): number {
  if (!(raw > 0)) return 1;
  const power = 10 ** Math.floor(Math.log10(raw));
  const fraction = raw / power;
  return power * (fraction <= 1 ? 1 : fraction <= 2 ? 2 : fraction <= 2.5 ? 2.5 : fraction <= 5 ? 5 : 10);
}

/** the reference site labels a season by the year it ends: 2015-16 is 2016. */
function seasonTick(season: string): string {
  const match = /^(\d{2})(\d{2})-(\d{2})$/.exec(season);
  if (!match) return season;
  const end = Number(match[3]), start = Number(match[2]);
  return `${end < start ? Number(match[1]) + 1 : match[1]}${match[3]}`;
}

/**
 * A smooth line through the points that never overshoots them (monotone cubic, Fritsch-Carlson),
 * so a curve between two seasons never suggests a value neither season had.
 */
export function smoothPath(points: { x: number; y: number }[]): string {
  if (points.length < 2) return "";
  const n = points.length;
  const slopes = points.slice(1).map((point, index) => (point.y - points[index].y) / (point.x - points[index].x));
  const tangents = points.map((_, index) => {
    if (index === 0) return slopes[0];
    if (index === n - 1) return slopes[n - 2];
    const [a, b] = [slopes[index - 1], slopes[index]];
    // A turning point stays flat; elsewhere the mean neighbouring slope gives a visible curve.
    return a * b <= 0 ? 0 : (a + b) / 2;
  });
  // Fritsch-Carlson limit: tangents too steep for a segment would bulge past its endpoints.
  slopes.forEach((slope, index) => {
    if (slope === 0) { tangents[index] = 0; tangents[index + 1] = 0; return; }
    const alpha = tangents[index] / slope, beta = tangents[index + 1] / slope;
    const size = Math.hypot(alpha, beta);
    if (size > 3) { tangents[index] = 3 * alpha / size * slope; tangents[index + 1] = 3 * beta / size * slope; }
  });
  let path = `M${points[0].x},${points[0].y}`;
  for (let index = 0; index < n - 1; index++) {
    const [p0, p1] = [points[index], points[index + 1]];
    const dx = (p1.x - p0.x) / 3;
    path += `C${p0.x + dx},${p0.y + tangents[index] * dx} ${p1.x - dx},${p1.y - tangents[index + 1] * dx} ${p1.x},${p1.y}`;
  }
  return path;
}

/** The season column nearest a viewBox x, or null outside the plot's horizontal span. */
export function nearestColumn(x: number, count: number, plotLeft: number, plotRight: number, from: number, to: number): number | null {
  if (count === 0 || x < from || x > to) return null;
  if (count === 1) return 0;
  const index = Math.round((x - plotLeft) / ((plotRight - plotLeft) / (count - 1)));
  return Math.min(count - 1, Math.max(0, index));
}

/** Small multiples and the table share the Lines view's names: the trend's three views. */
export type TrendView = "lines" | "split" | "table";
const VIEWS: readonly SegmentedOption<TrendView>[] = [
  { value: "lines", label: "Lines", icon: "chart-trend", title: "Every player on one chart" },
  { value: "split", label: "Side by side", icon: "cards", title: "One chart per player on the same scale, every value printed" },
  { value: "table", label: "Table", icon: "table", title: "Every value by season" }
];

type SeriesPoint = { season: string; value: number | null; label: string };
type Scale = { min: number; max: number; step: number; ticks: number[] };

/** One shared value axis: round tick steps with headroom, so no marker sits on an axis line. */
export function valueScale(values: number[]): Scale {
  const low = Math.min(...values), high = Math.max(...values);
  const pad = (high - low || Math.abs(high) || 1) * 0.15;
  const step = niceStep((high - low + 2 * pad) / 6);
  // A statistic that is never negative here never gets a negative axis.
  const min = Math.max(low >= 0 ? 0 : -Infinity, Math.floor((low - pad) / step) * step), max = Math.ceil((high + pad) / step) * step;
  return { min, max, step, ticks: Array.from({ length: Math.round((max - min) / step) + 1 }, (_, index) => min + step * index) };
}

/**
 * Line-end label heights: each label starts at its line's last value; labels closer than `gap`
 * push apart (in value order) and the stack stays inside [top, bottom].
 */
export function spreadLabels(ys: number[], gap: number, top: number, bottom: number): number[] {
  const order = ys.map((y, index) => ({ y, index })).sort((a, b) => a.y - b.y || a.index - b.index);
  const placed = order.map(entry => entry.y);
  for (let i = 1; i < placed.length; i++) placed[i] = Math.max(placed[i], placed[i - 1] + gap);
  const overflow = placed.length ? placed.at(-1)! - bottom : 0;
  if (overflow > 0) for (let i = placed.length - 1; i >= 0; i--) placed[i] = Math.min(placed[i] - overflow, i < placed.length - 1 ? placed[i + 1] - gap : Infinity);
  for (let i = 0; i < placed.length; i++) placed[i] = Math.max(placed[i], i > 0 ? placed[i - 1] + gap : top);
  const out = new Array<number>(ys.length);
  order.forEach((entry, slot) => { out[entry.index] = placed[slot]; });
  return out;
}

/** A player's family name for a line-end label: suffixes like Jr. and III stay with it. */
export function shortName(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length < 2) return name;
  const suffix = /^(jr\.?|sr\.?|ii|iii|iv|v)$/i.test(parts.at(-1)!);
  return suffix && parts.length > 2 ? parts.slice(-2).join(" ") : parts.at(-1)!;
}

/** The highest value in one season across players (bolded in the table); null below two values. */
export function seasonHigh(values: (number | null)[]): number | null {
  const present = values.filter((value): value is number => value !== null);
  return present.length > 1 ? Math.max(...present) : null;
}

function TrendChart({ view, column, players, rows, focused, onFocusSeries }: {
  view: TrendView; column: ColumnDefinition; players: TrendPlayer[]; rows: SeasonRows[]; focused: string | null; onFocusSeries: (id: string | null) => void;
}) {
  // The hovered season: shared by every panel, so a guide runs through all of them at once.
  const [active, setActive] = useState<number | null>(null);
  const series: SeriesPoint[][] = players.map(player => rows.map(row => {
    const item = row.items.find(entry => entry.player_id === player.player_id);
    const value = item ? plotValue(column, item) : null;
    return { season: row.season, value, label: item && value !== null ? formatColumnValue(column, item)
      : row.failed?.includes(player.player_id) ? "Unavailable" : "No games" };
  }));
  const values = series.flat().map(point => point.value).filter((value): value is number => value !== null);
  if (values.length === 0) return <p className="stats-trend-note">No games for these players in the loaded seasons.</p>;
  const scale = valueScale(values);
  if (view === "table") return <TrendTable column={column} players={players} rows={rows} series={series} />;
  const plot = { column, rows, scale, active, onActive: setActive };
  return (
    <figure className="stats-trend-figure" data-view={view}>
      {view === "split"
        ? <div className="stats-trend-split">{players.map((player, index) => (
          <section key={player.player_id} className="stats-trend-panel" data-series={index + 1} aria-label={player.player_name}>
            <h4 className="stats-trend-panel-name"><span className="stats-trend-swatch" aria-hidden="true" />{player.player_name}</h4>
            <TrendPlot {...plot} players={[player]} series={[series[index]]} numbers={[index + 1]} height={230} focused={null} onFocusSeries={() => {}} />
          </section>))}</div>
        : <TrendPlot {...plot} players={players} series={series} numbers={players.map((_, index) => index + 1)} height={380}
          focused={focused} onFocusSeries={onFocusSeries} />}
      <table className="sr-only">
        <caption>{column.label} by season</caption>
        <thead><tr><th scope="col">Player</th>{rows.map(row => <th key={row.season} scope="col">{row.season}</th>)}</tr></thead>
        <tbody>{series.map((points, index) => <tr key={players[index].player_id}>
          <th scope="row">{players[index].player_name}</th>{points.map(point => <td key={point.season}>{point.label}</td>)}
        </tr>)}</tbody>
      </table>
    </figure>
  );
}

/**
 * One trend plot. A single player prints every value inside its point (the reference site); several
 * players get small markers, a name and latest value at each line's end, and the hovered season's
 * values in a card, so no number ever hides another.
 */
function TrendPlot({ column, rows, players, series, numbers, scale, height, active, onActive, focused, onFocusSeries }: {
  column: ColumnDefinition; rows: SeasonRows[]; players: TrendPlayer[]; series: SeriesPoint[][]; numbers: number[]; scale: Scale;
  height: number; active: number | null; onActive: (index: number | null) => void; focused: string | null; onFocusSeries: (id: string | null) => void;
}) {
  const single = players.length === 1;
  const width = 720, left = 56, top = height > 300 ? 24 : 16, bottom = height > 300 ? 40 : 36, inset = 32;
  const last = rows.length - 1;
  // Line-end labels for the players still playing in the last season; others read from the legend.
  const ends = single ? [] : series.flatMap((points, seriesIndex) => points[last]?.value != null
    ? [{ seriesIndex, text: `${shortName(players[seriesIndex].player_name)} ${points[last].label}`, value: points[last].value! }] : []);
  const labelWidth = Math.max(0, ...ends.map(end => Math.ceil(end.text.length * 6.6)));
  const right = ends.length ? Math.max(24, 10 + labelWidth + 8 - inset) : 24;
  const plotLeft = left + inset, plotRight = width - right - inset;
  const spacing = rows.length > 1 ? (plotRight - plotLeft) / (rows.length - 1) : plotRight - plotLeft;
  const x = (index: number) => plotLeft + (rows.length === 1 ? (plotRight - plotLeft) / 2 : index * spacing);
  const y = (value: number) => top + (scale.max - value) / (scale.max - scale.min) * (height - top - bottom);
  const tickLabel = (value: number) => column.format ? column.format(value) : value.toFixed(1);
  // Short panels: every other value tick, so tick labels never crowd.
  const tickEvery = (height - top - bottom) / (scale.ticks.length - 1) < 22 ? 2 : 1;
  // Long careers: every other (or third) season label, so year labels never collide.
  const labelEvery = Math.max(1, Math.ceil(40 / spacing));
  const showTick = (index: number) => index === last || (index % labelEvery === 0 && last - index >= labelEvery);
  // The hovered season's year always shows (bold); labels close enough to collide with it hide.
  const tickShown = (index: number) => index === active || (showTick(index) && (active === null || Math.abs(index - active) >= labelEvery));
  // One player: every point prints its value; long careers shrink the markers and their text to the
  // season spacing instead of dropping values. Plotted labels only: "No games" never draws a dot.
  const widest = "0".repeat(Math.max(...series.flat().filter(point => point.value !== null).map(point => point.label.length)));
  const roomy = valueDotsFit(rows.length, plotRight - plotLeft, 2 * valueDotRadius(widest, true) + 4);
  const radius = roomy ? undefined : Math.max(9, Math.floor(spacing / 2) - 1);
  const endYs = spreadLabels(ends.map(end => y(end.value)), 14, top, height - bottom);
  const plotted = series.map(points => points.flatMap((point, index) => point.value === null ? []
    : [{ ...point, index, value: point.value, x: x(index), y: y(point.value) }]));
  // Break each line at seasons without a row; a gap is unknown, not zero.
  const segments = plotted.map(points => {
    const parts: (typeof points)[] = [];
    points.forEach((point, slot) => {
      if (slot === 0 || points[slot - 1].index !== point.index - 1) parts.push([]);
      parts.at(-1)!.push(point);
    });
    return parts.filter(part => part.length > 1);
  });
  const seriesProps = (seriesIndex: number) => {
    const id = players[seriesIndex].player_id;
    return single ? { className: "stats-trend-series", "data-series": numbers[seriesIndex] } : {
      className: `stats-trend-series${id === focused ? " is-focused" : ""}`, "data-series": numbers[seriesIndex],
      onPointerEnter: () => onFocusSeries(id), onPointerLeave: () => onFocusSeries(null)
    };
  };
  const shown = active !== null && active < rows.length ? active : null;
  // The hovered season's values for every player, highest first; seasons without a value last.
  const readout = shown !== null && !single
    ? series.map((points, seriesIndex) => ({ seriesIndex, point: points[shown] }))
      .sort((a, b) => (b.point.value ?? -Infinity) - (a.point.value ?? -Infinity))
    : null;

  return (
    <div className={`stats-trend-plot${focused && !single ? " has-focus" : ""}`}>
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`${column.label} by season for ${players.map(p => p.player_name).join(", ")}`}
        onPointerMove={event => {
          const matrix = event.currentTarget.getScreenCTM()?.inverse();
          if (!matrix) return;
          const point = new DOMPoint(event.clientX, event.clientY).matrixTransform(matrix);
          onActive(nearestColumn(point.x, rows.length, plotLeft, plotRight, left, plotRight + inset));
        }}
        onPointerLeave={() => onActive(null)}>
        {scale.ticks.map((tick, index) => <g key={tick} className="stats-trend-grid">
          <line x1={left} x2={width - right} y1={y(tick)} y2={y(tick)} />
          {index % tickEvery === 0 && <text x={left - 8} y={y(tick)} dy="0.32em" textAnchor="end">{tickLabel(tick)}</text>}
        </g>)}
        {shown !== null && <line className="stats-trend-guide" x1={x(shown)} x2={x(shown)} y1={top} y2={height - bottom} />}
        {rows.map((row, index) => tickShown(index) && <text key={row.season} className={`stats-trend-axis${index === shown ? " is-active" : ""}`}
          x={x(index)} y={height - (bottom - 26)} textAnchor="middle">{seasonTick(row.season)}<title>{row.season}</title></text>)}
        {/* Every line first, then every point, so no line ever crosses a value. */}
        {segments.map((parts, seriesIndex) => <g key={players[seriesIndex].player_id} {...seriesProps(seriesIndex)}>
          {parts.map((part, index) => <g key={index}>
            <path className="stats-trend-glow" d={smoothPath(part)} />
            <path className="stats-trend-line" d={smoothPath(part)} />
          </g>)}
        </g>)}
        {plotted.map((points, seriesIndex) => <g key={players[seriesIndex].player_id} {...seriesProps(seriesIndex)}>
          {points.map(point => {
            const title = `${players[seriesIndex].player_name}, ${point.season}: ${point.label}`;
            return single
              ? <ValueDot key={point.season} x={point.x} y={point.y} label={point.label} large={roomy && height > 300} round radius={radius} title={title} />
              : <circle key={point.season} className={`stats-trend-marker${point.index === shown ? " is-active" : ""}`} cx={point.x} cy={point.y}
                r={point.index === shown ? 6 : 4}><title>{title}</title></circle>;
          })}
        </g>)}
        {ends.map((end, index) => <text key={end.seriesIndex} className="stats-trend-end" data-series={numbers[end.seriesIndex]}
          data-dim={(focused && players[end.seriesIndex].player_id !== focused) || undefined}
          x={x(last) + 10} y={endYs[index]} dy="0.32em">{end.text}</text>)}
      </svg>
      {readout && shown !== null && <div className="stats-trend-readout" aria-hidden="true" data-side={shown > last / 2 ? "left" : "right"}
        style={{ "--readout-x": `${x(shown) / width * 100}%`, "--readout-y": `${top / height * 100}%` } as CSSProperties}>
        <span className="stats-trend-readout-season">{rows[shown].season}</span>
        {readout.map(({ seriesIndex, point }) => <span key={players[seriesIndex].player_id} className="stats-trend-readout-row"
          data-series={numbers[seriesIndex]} data-missing={point.value === null || undefined}>
          <span className="stats-trend-swatch" /><span className="stats-trend-readout-name">{players[seriesIndex].player_name}</span>
          <span className="stats-trend-readout-value">{point.label}</span>
        </span>)}
      </div>}
    </div>
  );
}

/** Every value by season, newest first; with several players each season's highest is bold. */
type TableRow = { season: string; points: SeriesPoint[] };

function TrendTable({ column, players, rows, series }: { column: ColumnDefinition; players: TrendPlayer[]; rows: SeasonRows[]; series: SeriesPoint[][] }) {
  const data: TableRow[] = rows.map((row, index) => ({ season: row.season, points: series.map(points => points[index]) })).reverse();
  return (
    <div className="stats-trend-table" data-compare={players.length > 1 || undefined}>
    <StatsGrid<TableRow> label={`${column.label} by season`} name="stats-trend" density="compact" height="auto"
      leadWidth="sm" minWidth="narrow" rows={data} rowKey={row => row.season}
      lead={{ label: "Season", cell: row => <span className="stats-trend-table-season">{row.season}</span> }}
      columns={players.map((player, index) => ({
        key: player.player_id, label: player.player_name, keepCase: true, width: "md" as const,
        headerAfter: <span className="stats-trend-swatch" data-series={index + 1} aria-hidden="true" />,
        data: row => ({ value: row.points[index].value ?? undefined }),
        cell: row => {
          const point = row.points[index];
          if (point.value === null) return <span className="rs-grid-value rs-grid-unknown" title={point.label}>—</span>;
          const high = seasonHigh(row.points.map(entry => entry.value));
          return point.value === high
            ? <span className="rs-grid-value stat-main-value stats-trend-high" title={`Highest in ${row.season}`}>{point.label}</span>
            : <GridValue text={point.label} />;
        }
      }))} />
    </div>
  );
}
