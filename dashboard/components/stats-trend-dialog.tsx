"use client";

import { useEffect, useMemo, useState } from "react";
import { LookupInput } from "./lookup-input";
import { PlayerPortrait } from "./player-portrait";
import { Icon } from "./ui/icon";
import { Modal } from "./ui/modal";
import { Select } from "./ui/select";
import { ValueDot, valueDotRadius, valueDotsFit } from "./charts/value-dot";
import { executeWorkbenchQuery, getPlayerSeasons } from "@/lib/workbench-api";
import { DARKO_COLUMNS, formatColumnValue, TRACKING_COLUMNS, usesImpactManifest, type ColumnDefinition } from "@/lib/stats-presets";
import { DarkoSourceLink } from "./darko-source-link";
import type { MetricHint } from "@/lib/stats-glossary";
import { phaseLabel } from "@/lib/scope-labels";
import type { PlayerResearchItem, QuerySpec, WorkbenchCatalog } from "@/lib/types";

const MAX_PLAYERS = 4;
const SEASON_CONCURRENCY = 3;

type TrendPlayer = { player_id: string; player_name: string; portrait_url?: string | null };
/** failed: the season query errored, so its values are unavailable (not "no games"). */
type SeasonRows = { season: string; items: PlayerResearchItem[]; failed?: boolean };

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

export type TrendTarget = { player: PlayerResearchItem; columnKey: string };

/** The value a column shows, as a number for plotting; GP and MIN use the row-level fields. */
function plotValue(column: ColumnDefinition, item: PlayerResearchItem): number | null {
  const value = column.key === "gp" ? item.games_played ?? item.metrics.gp
    : column.key === "min" ? item.total_minutes ?? item.metrics.min
    : item.metrics[column.key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/**
 * Databallr's stat trend dialog: one stat across the loaded seasons for up to four players.
 * Each season is its own server query in the same phase, window and release; a season without a
 * row for a player is a gap (unknown), never zero.
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
  const [result, setResult] = useState<{ key: string; rows?: SeasonRows[]; error?: string } | null>(null);

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
  const requestKey = JSON.stringify({ ids, seasons, phase: querySpec.phase, open: Boolean(target), joined });

  useEffect(() => {
    if (!target || ids.length === 0) return;
    let active = true;
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
          : { season: range[index], items: [], failed: true });
        setResult(range.length > 0 && rows.every(row => row.failed)
          ? { key: requestKey, error: "Trend unavailable: the season queries failed. Try again." }
          : { key: requestKey, rows });
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
        <h3 className="stats-trend-title">{column.label} Progression</h3>
        {current?.error ? <p role="alert" className="stats-trend-note">{current.error}</p>
          : current?.rows ? <TrendChart column={column} players={players} rows={current.rows} />
          : <p className="stats-trend-note" role="status">Loading seasons…</p>}
        <div className="stats-trend-players" role="group" aria-label="Players in the trend">
          {players.map((player, index) => (
            <div key={player.player_id} className="stats-trend-player" data-series={index + 1}>
              <PlayerPortrait playerId={player.player_id} name={player.player_name} portraitUrl={player.portrait_url} size="md" />
              <span><span className="stats-trend-swatch" aria-hidden="true" />{player.player_name}</span>
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

type Point = { season: string; x: number; y: number; value: number; label: string };

/** 1, 2, 2.5 or 5 times a power of ten: the round step nearest the raw step. */
export function niceStep(raw: number): number {
  if (!(raw > 0)) return 1;
  const power = 10 ** Math.floor(Math.log10(raw));
  const fraction = raw / power;
  return power * (fraction <= 1 ? 1 : fraction <= 2 ? 2 : fraction <= 2.5 ? 2.5 : fraction <= 5 ? 5 : 10);
}

/** Databallr labels a season by the year it ends: 2015-16 is 2016. */
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

function TrendChart({ column, players, rows }: { column: ColumnDefinition; players: TrendPlayer[]; rows: SeasonRows[] }) {
  const width = 720, height = 380, left = 56, right = 24, top = 24, bottom = 40;
  const series = players.map(player => rows.map(row => {
    const item = row.items.find(entry => entry.player_id === player.player_id);
    const value = item ? plotValue(column, item) : null;
    return { season: row.season, value, label: item && value !== null ? formatColumnValue(column, item) : row.failed ? "Unavailable" : "No games" };
  }));
  const values = series.flat().map(point => point.value).filter((value): value is number => value !== null);
  if (values.length === 0) return <p className="stats-trend-note">No games for these players in the loaded seasons.</p>;
  const low = Math.min(...values), high = Math.max(...values);
  // Databallr: round tick steps with headroom, and points inset from both axes, so no value
  // marker sits on an axis line or over the tick labels.
  const pad = (high - low || Math.abs(high) || 1) * 0.15;
  const step = niceStep((high - low + 2 * pad) / 6);
  const min = Math.floor((low - pad) / step) * step, max = Math.ceil((high + pad) / step) * step;
  const inset = 32;
  const plotLeft = left + inset, plotRight = width - right - inset;
  const spacing = rows.length > 1 ? (plotRight - plotLeft) / (rows.length - 1) : plotRight - plotLeft;
  const x = (index: number) => plotLeft + (rows.length === 1 ? (plotRight - plotLeft) / 2 : index * spacing);
  const y = (value: number) => top + (max - value) / (max - min) * (height - top - bottom);
  const ticks = Array.from({ length: Math.round((max - min) / step) + 1 }, (_, index) => min + step * index);
  const tickLabel = (value: number) => column.format ? column.format(value) : value.toFixed(1);
  // Long careers: every other (or third) season label, so year labels never collide.
  const labelEvery = Math.max(1, Math.ceil(40 / spacing));
  const showTick = (index: number) => index === rows.length - 1 || (index % labelEvery === 0 && rows.length - 1 - index >= labelEvery);
  // Every point prints its value (Databallr). Long careers shrink the markers and their text to
  // the season spacing instead of dropping the values.
  const widest = "0".repeat(Math.max(...series.flat().map(point => point.label.length)));
  const roomy = valueDotsFit(rows.length, plotRight - plotLeft, 2 * valueDotRadius(widest, true) + 4);
  const large = players.length === 1 && roomy;
  const radius = roomy ? undefined : Math.max(9, Math.floor(spacing / 2) - 1);

  return (
    <figure className="stats-trend-figure">
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`${column.label} by season for ${players.map(p => p.player_name).join(", ")}`}>
        {ticks.map(tick => <g key={tick} className="stats-trend-grid">
          <line x1={left} x2={width - right} y1={y(tick)} y2={y(tick)} />
          <text x={left - 8} y={y(tick)} dy="0.32em" textAnchor="end">{tickLabel(tick)}</text>
        </g>)}
        {rows.map((row, index) => showTick(index) && <text key={row.season} className="stats-trend-axis" x={x(index)} y={height - 14} textAnchor="middle">{seasonTick(row.season)}<title>{row.season}</title></text>)}
        {series.map((points, seriesIndex) => {
          const plotted: Point[] = points.flatMap((point, index) => point.value === null ? [] : [{ ...point, value: point.value, x: x(index), y: y(point.value) }]);
          // Break the line at seasons without a row; a gap is unknown, not zero.
          const segments: Point[][] = [[]];
          points.forEach((point, index) => {
            if (point.value === null) { if (segments.at(-1)!.length) segments.push([]); return; }
            segments.at(-1)!.push({ ...point, value: point.value, x: x(index), y: y(point.value) });
          });
          const name = players[seriesIndex].player_name;
          return <g key={players[seriesIndex].player_id} className="stats-trend-series" data-series={seriesIndex + 1}>
            {segments.filter(segment => segment.length > 1).map((segment, index) => <g key={index}>
              <path className="stats-trend-glow" d={smoothPath(segment)} />
              <path className="stats-trend-line" d={smoothPath(segment)} />
            </g>)}
            {plotted.map(point => <ValueDot key={point.season} x={point.x} y={point.y} label={point.label} large={large} round radius={radius}
              title={`${name}, ${point.season}: ${point.label}`} />)}
          </g>;
        })}
      </svg>
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
