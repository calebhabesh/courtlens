"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { scaleLinear } from "d3-scale";
import { ChartData } from "./charts/chart-frame";
import { chartVars, toneColor, type ChartTone } from "./charts/semantics";
import { ResearchDisclosure, ResearchSection, MethodBlock } from "./research/research-page";
import { sortRows } from "./research/research-table";
import { GridPlayer, GridValue, StatsGrid, type GridColumn } from "./research/stats-grid";
import { FeedFailure, FeedSkeleton, useFeed, useUrlState } from "./stats-feed-ui";
import { DataDetailsButton } from "./ui/data-details";
import { GatedNote } from "./ui/gated-note";
import { Icon, type IconName } from "./ui/icon";
import { SearchField } from "./ui/input";
import { Button, IconButton, RemovableChip, Segmented, Select } from "./ui/kit";
import { fixed, rangeText, signed } from "@/lib/draft-classes";
import { downloadCsv, toCsv } from "@/lib/research-values";
import { seasonEra } from "@/lib/portrait-source";
import {
  EXCLUSION_LABELS, VAR_LABELS, VERDICT_LABELS, getNearest, getWingspan,
  type Correlation, type Mean, type PositionalAverage, type WingspanPlayer, type WingspanSummary, type WingspanVar
} from "@/lib/research-r10";
import { fmt, getCombine, type CombineRow } from "@/lib/stats-feeds";
import { UNIT_LABELS, diffText, lengthText, lengthTicks, percentileText, signIdentity, type Units } from "@/lib/wingspan-format";

/*
 * RD01 Combine & Wingspan, after Databallr's Wingspan Database: one filter panel, the players table
 * beside position averages and the height-wingspan overlay, the scatter, then R10's registered
 * correlations (courtlens-wingspan-ddpm-v1) and the collapsed methodology. Every value is the API's.
 * Round 2: players the combine never measured carry CraftedNBA's reported figures, tagged Reported and
 * kept out of percentiles, averages and the correlations. Diff and D-DPM take Databallr's sign colours
 * as identity tones (gold above zero, blue below), never good or bad.
 */

const VARS: WingspanVar[] = ["height", "wingspan", "diff", "d_dpm"];
const POSITIONS = ["PG", "SG", "SF", "PF", "C"] as const;
type Pos = (typeof POSITIONS)[number];
type Status = "all" | "active" | "inactive";
const UNITS: Units[] = ["ftin", "in", "m", "cm"];
const POSITION_TONE: Record<Pos, ChartTone> = { PG: "category-1", SG: "category-2", SF: "category-3", PF: "category-4", C: "category-5" };
const OVERLAY_TONES: ChartTone[] = ["identity-a", "identity-b", "category-3", "category-4"];
const OVERLAY_MAX = OVERLAY_TONES.length;
const NONE = "none";
const REPORTED = "Reported by CraftedNBA: not measured at a combine since 2000";

const posIndex = (p: WingspanPlayer) => p.position ? POSITIONS.indexOf(p.position) : null;
const mean = (values: (number | null)[]) => { const known = values.filter((v): v is number => v != null); return known.length ? known.reduce((a, b) => a + b, 0) / known.length : null; };
const varText = (v: WingspanVar, value: number | null | undefined, units: Units) => v === "d_dpm" ? signed(value, 2) : v === "diff" ? diffText(value, units) : lengthText(value, units);
const meanText = (v: WingspanVar | "weight", m: Mean) => v === "weight" ? fixed(m.mean, 1) : v === "d_dpm" ? signed(m.mean, 2) : fixed(m.mean, 2);
const reported = (p: WingspanPlayer) => p.measurement_source === "craftednba";
/** The value as displayed, so a figure that prints as 0.0 takes no sign colour. */
const asShown = (value: number | null, digits: number) => value == null ? null : Math.round(value * 10 ** digits) / 10 ** digits;

function ReportedTag() {
  return <span className="ws-reported" title={REPORTED}>Reported</span>;
}

interface Scope { status: Status; position: Pos | null; shoes: boolean; units: Units; year: number | null }

/** A labelled control group, Databallr's icon and label inside the group's frame. */
function Group({ icon, label, children }: { icon: IconName; label: string; children: ReactNode }) {
  return <span className="ws-group"><span className="ws-group-label" aria-hidden="true"><Icon name={icon} size={14} />{label}</span>{children}</span>;
}

const CSV_COLUMNS: { header: string; value: (p: WingspanPlayer) => string | number | null }[] = [
  { header: "nba_id", value: p => p.player_id }, { header: "player", value: p => p.name },
  { header: "source", value: p => p.measurement_source }, { header: "combine_year", value: p => p.combine_year },
  { header: "position", value: p => p.position_label }, { header: "height_no_shoes_in", value: p => p.height },
  { header: "height_shoes_in", value: p => p.height_shoes }, { header: "wingspan_in", value: p => p.wingspan },
  { header: "diff_in", value: p => p.diff }, { header: "standing_reach_in", value: p => p.standing_reach },
  { header: "weight_lb", value: p => p.weight }, { header: "d_dpm_now", value: p => p.d_dpm_now },
  { header: "career_d_dpm", value: p => p.d_dpm }, { header: "career_seasons", value: p => p.career_seasons },
];

function Filters({ data, scope, rows, set }: { data: WingspanSummary; scope: Scope; rows: WingspanPlayer[]; set: (u: Record<string, string | null>) => void }) {
  const years = useMemo(() => [...new Set(data.players.map(p => p.combine_year).filter((y): y is number => y != null))].sort((a, b) => b - a), [data]);
  // Averages, like the positional cards, cover combine measurements only.
  const combine = rows.filter(p => p.measurement_source === "combine");
  const height = (p: WingspanPlayer) => scope.shoes ? p.height_shoes : p.height;
  const avgH = mean(combine.map(height)), avgW = mean(combine.map(p => p.wingspan)), avgD = mean(combine.map(p => p.diff));
  const statusReady = data.current.state === "ready";
  const exportCsv = () => downloadCsv("courtlens-wingspan.csv", toCsv(CSV_COLUMNS.map(c => c.header), rows.map(p => CSV_COLUMNS.map(c => c.value(p)))));
  return <div className="ws-panel ws-filters" role="group" aria-label="Wingspan filters">
    <div className="ws-filter-rows">
      <Segmented size="sm" label="Status" value={scope.status} disabled={!statusReady} onChange={v => set({ status: v === "active" ? null : v })}
        options={[{ value: "all", label: "All Players", icon: "users" }, { value: "active", label: "Active", icon: "activity", title: statusReady ? `On DARKO's newest board, ${data.current.data_date}` : undefined }, { value: "inactive", label: "Inactive", icon: "history" }]} />
      <Segmented size="sm" label="Position" value={scope.position ?? "all"} onChange={v => set({ pos: v === "all" ? null : v })}
        options={[{ value: "all", label: "All Positions" }, ...POSITIONS.map(p => ({ value: p, label: p }))]} />
      <div className="ws-filter-line">
        <Group icon="footprints" label="Height">
          <Segmented size="sm" label="Height" value={scope.shoes ? "shoes" : "barefoot"} onChange={v => set({ shoes: v === "shoes" ? "1" : null })}
            options={[{ value: "barefoot", label: "No Shoes" }, { value: "shoes", label: "With Shoes", title: "Measured in shoes; not measured at the 2000–2003 or 2023–2026 combines" }]} />
        </Group>
        <Group icon="units" label="Units">
          <Segmented size="sm" label="Units" value={scope.units} onChange={v => set({ units: v === "ftin" ? null : v })}
            options={UNITS.map(u => ({ value: u, label: UNIT_LABELS[u] }))} />
        </Group>
        <Group icon="calendar" label="Combine">
          <Select size="sm" aria-label="Combine class" value={scope.year == null ? "" : String(scope.year)} onChange={e => set({ year: e.target.value || null })}>
            <option value="">All combines</option>{years.map(y => <option key={y} value={y}>{y} combine</option>)}
          </Select>
        </Group>
      </div>
      <p className="ws-summary" data-field="summary" data-value={rows.length}>
        Rows: {rows.length.toLocaleString("en-US")} · Avg H: {lengthText(avgH, scope.units)} · Avg W: {lengthText(avgW, scope.units)} · Avg Diff: {diffText(avgD, scope.units)}
        <span className="ws-summary-note"> (combine-measured)</span>
      </p>
    </div>
    <div className="ws-filter-actions">
      <Button size="md" icon="download" onClick={exportCsv}>Download CSV</Button>
      <span className="ws-csv-note"><code>nba_id</code> included</span>
    </div>
  </div>;
}

type SortKey = "position" | "height" | "wingspan" | "diff" | "d_dpm_now" | "d_dpm";

/** The players table in the Stats look: pinned player card (logo, season photo, name, source), grouped figures. */
function PlayersTable({ rows, scope, overlay, set }: { rows: WingspanPlayer[]; scope: Scope; overlay: string[]; set: (u: Record<string, string | null>) => void }) {
  const u = scope.units;
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<{ key: SortKey; direction: "asc" | "desc" }>({ key: "wingspan", direction: "desc" });
  const pct = (v: number | undefined) => v == null ? null : `${Math.round(v)}`;
  const height = (p: WingspanPlayer) => scope.shoes ? p.height_shoes : p.height;
  const columns: (GridColumn<WingspanPlayer> & { key: SortKey })[] = [
    { key: "position", label: "Pos", title: "First listed combine position; CraftedNBA's for reported players", group: "Measurements", width: "xs", sort: posIndex,
      cell: p => <GridValue text={p.position_label ?? p.position ?? "—"} /> },
    { key: "height", label: scope.shoes ? "Height (Shoes)" : "Height (No Shoes)", title: scope.shoes ? "Height in shoes, as measured" : "Barefoot height; percentile among combine players", group: "Measurements", width: "md", sort: height,
      data: p => ({ value: height(p) ?? undefined }), cell: p => <GridValue text={lengthText(height(p), u)} sub={scope.shoes ? null : pct(p.percentiles.height)} /> },
    { key: "wingspan", label: "Wingspan", title: "Wingspan; percentile among combine players", group: "Measurements", width: "md", sort: p => p.wingspan,
      data: p => ({ value: p.wingspan ?? undefined }), cell: p => <GridValue text={lengthText(p.wingspan, u)} sub={pct(p.percentiles.wingspan)} /> },
    { key: "diff", label: "Diff (W−H)", title: "Wingspan minus barefoot height; percentile among combine players", group: "Measurements", width: "md", sort: p => p.diff,
      data: p => ({ value: p.diff ?? undefined }), cell: p => <GridValue text={diffText(p.diff, u)} sub={pct(p.percentiles.diff)} identity={signIdentity(p.diff)} /> },
    { key: "d_dpm_now", label: "D-DPM", title: "DARKO's defensive plus-minus on its newest board", group: "Defense (DARKO)", width: "sm", sort: p => p.d_dpm_now,
      data: p => ({ value: p.d_dpm_now ?? undefined }), cell: p => <GridValue text={signed(p.d_dpm_now, 1)} identity={signIdentity(asShown(p.d_dpm_now, 1))} /> },
    { key: "d_dpm", label: "Career", title: "Career D-DPM: minutes-weighted season-end D-DPM over 500-minute seasons; percentile within the correlation population", group: "Defense (DARKO)", width: "sm", sort: p => p.d_dpm,
      data: p => ({ value: p.d_dpm ?? undefined }), cell: p => <GridValue text={signed(p.d_dpm, 2)} sub={pct(p.percentiles.d_dpm)} identity={signIdentity(asShown(p.d_dpm, 2))} /> },
  ];
  const column = columns.find(c => c.key === sort.key) ?? columns[2];
  const needle = query.trim().toLocaleLowerCase("en-US");
  const shown = sortRows(rows.filter(p => !needle || p.name.toLocaleLowerCase("en-US").includes(needle)), column.sort!, sort.direction, p => p.player_id);
  const onSort = (key: string) => setSort(s => s.key === key ? { key: s.key, direction: s.direction === "desc" ? "asc" : "desc" } : { key: key as SortKey, direction: "desc" });
  return <StatsGrid<WingspanPlayer> label="Wingspan players" name="players" rows={shown} rowKey={p => p.player_id} columns={columns} leadWidth="lg" minWidth="wide"
    sort={{ key: sort.key, direction: sort.direction, onSort }} empty="No players match these filters." rowData={p => ({ source: p.measurement_source ?? undefined })}
    lead={{
      group: "Player",
      label: <span className="stats-header-search"><SearchField aria-label="Search players" placeholder="Search players…" value={query} onChange={e => setQuery(e.target.value)} onClear={() => setQuery("")} inputSize="sm" wrapperClassName="ws-search" /></span>,
      cell: p => { const inOverlay = overlay.includes(p.player_id);
        return <GridPlayer playerId={p.player_id} name={p.name} team={p.photo_team} season={p.photo_season} era={seasonEra(p.photo_season, p.photo_team)} href={`/players/${p.player_id}`}
          subtitle={reported(p) ? <>{p.photo_team ?? "—"} · <ReportedTag /></> : <>{p.photo_team ?? "—"}{p.combine_year != null ? ` · ${p.combine_year} combine` : ""}</>}
          tools={<>
            <IconButton size="xs" icon="target" label={`Find similar profiles for ${p.name}`} onClick={() => set({ build: p.player_id })} />
            <IconButton size="xs" icon={inOverlay ? "check" : "plus"} label={inOverlay ? `${p.name} is in the overlay` : `Add ${p.name} to the overlay`}
              disabled={inOverlay || overlay.length >= OVERLAY_MAX} onClick={() => set({ overlay: [...overlay, p.player_id].join(",") })} />
          </>} />; },
    }} />;
}

function PositionAverages({ data, units }: { data: WingspanSummary; units: Units }) {
  return <section className="ws-panel ws-side-block" aria-labelledby="ws-avg">
    <h2 id="ws-avg" className="ws-panel-title"><Icon name="users" size={16} />Positional Averages</h2>
    <ul className="ws-averages">{data.positional_averages.filter(a => a.position !== "ALL").map(a => <li key={a.position} className="ws-average" data-row={a.position}>
      <span><small>Pos</small><strong>{a.position}</strong></span>
      <span data-field="height" data-value={a.height.mean ?? ""}><small>Height</small>{lengthText(a.height.mean, units)}</span>
      <span data-field="wingspan" data-value={a.wingspan.mean ?? ""}><small>Wingspan</small>{lengthText(a.wingspan.mean, units)}</span>
      <span data-field="diff" data-value={a.diff.mean ?? ""}><small>Diff</small><em data-identity={signIdentity(a.diff.mean)}>{diffText(a.diff.mean, units)}</em></span>
    </li>)}</ul>
  </section>;
}

/**
 * Height and wingspan to scale on one axis from zero: per player a light wingspan bar with the solid
 * height bar laid over it, so the overhang is the difference. Ticks follow the units toggle.
 */
function Overlay({ players, units, onRemove, onClear }: { players: WingspanPlayer[]; units: Units; onRemove: (id: string) => void; onClear: () => void }) {
  const width = 404, left = 8, right = width - 12, rowHeight = 56, top = 8;
  const longest = Math.max(1, ...players.flatMap(p => [p.height ?? 0, p.wingspan ?? 0]));
  const ticks = lengthTicks(longest + 2, units);
  const domainTop = Math.max(longest + 2, ticks.at(-1)!.value);
  const x = scaleLinear().domain([0, domainTop]).range([left, right]);
  const axisY = top + players.length * rowHeight + 4, height = axisY + 40;
  const axisTitle = units === "ftin" ? "Length from zero (feet)" : units === "in" ? "Length from zero (inches)" : units === "m" ? "Length from zero (metres)" : "Length from zero (centimetres)";
  return <section className="ws-panel ws-side-block" aria-labelledby="ws-overlay">
    <div className="ws-panel-head"><h2 id="ws-overlay" className="ws-panel-title"><Icon name="ruler" size={16} />Selected Player Overlay</h2>
      {players.length > 0 && <Button size="sm" variant="ghost" icon="close" onClick={onClear}>Clear</Button>}</div>
    {players.length === 0 ? <p className="ws-well ws-empty-note" data-field="overlay-empty">Add players from the table with + to compare their height and wingspan to scale.</p> : <>
      <ul className="ws-overlay-key" aria-label="Bar key">
        <li><span className="ws-key-bar" data-kind="height" aria-hidden="true" />Height (barefoot)</li>
        <li><span className="ws-key-bar" data-kind="wingspan" aria-hidden="true" />Wingspan</li>
      </ul>
      <ChartData fingerprint={`${players.map(p => p.player_id).join(",")}-${units}`}>
        <svg className="ws-overlay-graphic" viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`Height and wingspan to scale: ${players.map(p => `${p.name} ${lengthText(p.height, units)} tall, ${lengthText(p.wingspan, units)} wingspan`).join("; ")}`}>
          {ticks.map(t => <g key={t.value}>
            <line x1={x(t.value)} x2={x(t.value)} y1={top} y2={axisY} className="ws-grid-line" />
            <text x={x(t.value)} y={axisY + 16} textAnchor={t.value === 0 ? "start" : "middle"} className="chart-svg-label">{t.label}</text>
          </g>)}
          <line x1={left} x2={right} y1={axisY} y2={axisY} className="ws-axis" />
          <text x={(left + right) / 2} y={axisY + 34} textAnchor="middle" className="chart-svg-label ws-axis-title">{axisTitle}</text>
          {players.map((p, i) => { const tone = toneColor(OVERLAY_TONES[i]), y = top + i * rowHeight;
            const end = Math.max(p.height ?? 0, p.wingspan ?? 0);
            return <g key={p.player_id}>
              <text x={left} y={y + 12} className="ws-overlay-name-svg">{p.name}</text>
              {p.wingspan != null && <rect data-player={p.player_id} data-kind="wingspan" data-value={p.wingspan} x={x(0)} y={y + 20} width={x(p.wingspan) - x(0)} height={22} rx={3} fill={tone} fillOpacity={0.3} />}
              {p.height != null && <rect data-player={p.player_id} data-kind="height" data-value={p.height} x={x(0)} y={y + 25} width={x(p.height) - x(0)} height={12} rx={2} fill={tone} />}
              {p.diff != null && <text x={x(end) - 4} y={y + 12} textAnchor="end" className="ws-overlay-diff" data-identity={signIdentity(p.diff)}>{diffText(p.diff, units)}</text>}
            </g>; })}
        </svg>
      </ChartData>
      <ul className="ws-overlay-list">{players.map((p, i) => <li key={p.player_id} data-row={p.player_id}>
        <span className="ws-key" style={chartVars({ "--chart-tone": toneColor(OVERLAY_TONES[i]) })} aria-hidden="true" />
        <span className="ws-overlay-name">{p.name}{reported(p) && <ReportedTag />}</span>
        <span className="ws-overlay-figures">H {lengthText(p.height, units)} · W {lengthText(p.wingspan, units)}</span>
        <IconButton size="sm" icon="close" label={`Remove ${p.name} from the overlay`} onClick={() => onRemove(p.player_id)} />
      </li>)}</ul>
    </>}
  </section>;
}

interface Picked { player: WingspanPlayer; tone: ChartTone; role: "overlay" | "similar" | "mark" }
const MARK_MAX = 8;
const MARK_TONES: ChartTone[] = ["category-6", "category-1", "category-2", "category-3", "category-4", "category-5", "identity-a", "identity-b"];

/** Labels for highlighted points, nudged apart vertically on each side so they don't overlap. */
function placeLabels(points: { id: string; x: number; y: number; name: string }[], left: number, right: number, top: number, bottom: number) {
  const gap = 18;
  // About 7.5 px a character at the label size: the side with room for the whole name wins.
  const placed = points.map(p => {
    const text = p.name.length * 7.5, w = text + 14;
    // The side with room wins; with room on neither, the roomier side, and the label slides inside the chart.
    const side = p.x + w <= right ? "right" as const : p.x - w >= left ? "left" as const : right - p.x >= p.x - left ? "right" as const : "left" as const;
    const lx = side === "right" ? Math.min(p.x + 14, right - text - 2) : Math.max(p.x - 14, left + text + 2);
    return { ...p, side, lx, ly: p.y };
  });
  // One pass over every label, top to bottom, so labels on either side never share a line.
  const order = [...placed].sort((a, b) => a.y - b.y);
  for (let i = 1; i < order.length; i++) if (order[i].ly - order[i - 1].ly < gap) order[i].ly = order[i - 1].ly + gap;
  // Pushed past the bottom: shift the whole run back up.
  const overflow = order.length ? order[order.length - 1].ly - (bottom - 4) : 0;
  if (overflow > 0) for (const p of order) p.ly = Math.max(top + 8, p.ly - overflow);
  return new Map(placed.map(p => [p.id, p]));
}

function Scatter({ data, units, picked, onAdd, onRemove, onClear, set, get }: {
  data: WingspanSummary; units: Units; picked: Picked[]; onAdd: (id: string) => void; onRemove: (p: Picked) => void; onClear: () => void;
  set: (u: Record<string, string | null>) => void; get: (n: string) => string | null;
}) {
  const x = (VARS.includes(get("x") as WingspanVar) ? get("x") : "height") as WingspanVar;
  const y = (VARS.includes(get("y") as WingspanVar) ? get("y") : "wingspan") as WingspanVar;
  const usesRating = x === "d_dpm" || y === "d_dpm";
  // Combine points are the registered population; reported points are drawn hollow and are not in r.
  const points = data.players.filter(p => (usesRating ? p.in_population : p.measurement_source != null) && p[x] != null && p[y] != null);
  const c = x === y ? null : data.correlations.find(r => (r.x === x && r.y === y) || (r.x === y && r.y === x)) ?? null;
  const extent = (k: WingspanVar) => { const v = points.map(p => p[k]!); return v.length ? [Math.min(...v), Math.max(...v)] : [0, 1]; };
  const frame = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(1032);
  const [query, setQuery] = useState("");
  useEffect(() => {
    const node = frame.current;
    if (!node || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(([entry]) => setWidth(Math.max(320, Math.min(1320, Math.round(entry.contentRect.width)))));
    observer.observe(node);
    return () => observer.disconnect();
  }, []);
  const height = width < 600 ? 340 : 420;
  const left = 64, right = width - 16, top = 16, bottom = height - 40;
  const sx = scaleLinear().domain(extent(x)).nice().range([left, right]), sy = scaleLinear().domain(extent(y)).nice().range([bottom, top]);
  const axis = (v: WingspanVar) => (value: number) => v === "d_dpm" ? signed(value, 1) : v === "diff" ? diffText(value, units) : lengthText(value, units);
  const pickedIds = new Set(picked.map(p => p.player.player_id));
  const visible = picked.filter(p => points.includes(p.player));
  const labels = placeLabels(visible.map(p => ({ id: p.player.player_id, x: sx(p.player[x]!), y: sy(p.player[y]!), name: p.player.name })), 0, width, top, bottom);
  const needle = query.trim().toLocaleLowerCase("en-US");
  const matches = needle.length < 2 ? [] : points.filter(p => !pickedIds.has(p.player_id) && p.name.toLocaleLowerCase("en-US").includes(needle)).slice(0, 8);
  const full = picked.filter(p => p.role === "mark").length >= MARK_MAX;
  return <section className="ws-panel ws-scatter" aria-label="Measurement scatter">
    <div className="ws-scatter-head">
      <div className="ws-axes">
        <Icon name="scatter" size={16} />
        <Select size="sm" aria-label="Horizontal axis" value={x} onChange={e => set({ x: e.target.value === "height" ? null : e.target.value })}>{VARS.map(v => <option key={v} value={v}>{VAR_LABELS[v]}</option>)}</Select>
        <span className="ws-vs">vs</span>
        <Select size="sm" aria-label="Vertical axis" value={y} onChange={e => set({ y: e.target.value === "wingspan" ? null : e.target.value })}>{VARS.map(v => <option key={v} value={v}>{VAR_LABELS[v]}</option>)}</Select>
      </div>
      <div className="ws-add">
        <SearchField aria-label="Add a player to the graph" placeholder={full ? `Up to ${MARK_MAX} added players` : "Add a player to the graph…"} value={query} disabled={full}
          onChange={e => setQuery(e.target.value)} onClear={() => setQuery("")} inputSize="sm" wrapperClassName="ws-add-field" />
        {matches.length > 0 && <ul className="ws-add-results" aria-label="Matching players">{matches.map(p => <li key={p.player_id}>
          <Button size="sm" variant="ghost" icon="plus" onClick={() => { onAdd(p.player_id); setQuery(""); }} aria-label={`Add ${p.name} to the graph`}>
            {p.name}<span className="ws-add-meta">{p.photo_team ?? ""}{reported(p) ? " · Reported" : p.combine_year ? ` · ${p.combine_year}` : ""}</span>
          </Button>
        </li>)}</ul>}
      </div>
      {c && <p className="ws-r" data-field="scatter-r" data-value={c.r ?? ""} title={`95% interval ${rangeText(c.low, c.high, 2)}; ${c.n.toLocaleString("en-US")} combine players`}>r = {signed(c.r, 2)}</p>}
    </div>
    {picked.length > 0 && <div className="ws-picked-bar" role="group" aria-label="Highlighted players">
      {picked.map(p => <RemovableChip key={`${p.role}-${p.player.player_id}`} size="sm" onRemove={() => onRemove(p)} removeLabel={`Stop highlighting ${p.player.name}`}>
        <span className="ws-key" style={chartVars({ "--chart-tone": toneColor(p.tone) })} aria-hidden="true" /> {p.player.name}{p.role === "similar" ? " (similar profiles)" : p.role === "overlay" ? " (overlay)" : ""}
      </RemovableChip>)}
      <Button size="sm" variant="ghost" icon="close" onClick={onClear}>Clear all</Button>
    </div>}
    <div ref={frame} className="ws-scatter-frame"><ChartData fingerprint={`${x}-${y}-${units}-${picked.map(p => p.player.player_id).join(",")}`}>
      <svg className="ws-scatter-graphic" viewBox={`0 0 ${width} ${height}`} data-picked={picked.length > 0 || undefined} role="img" aria-label={`${VAR_LABELS[y]} against ${VAR_LABELS[x]}, ${points.length.toLocaleString("en-US")} players`}>
        {sx.ticks(width < 600 ? 4 : 6).map(t => <g key={`x${t}`}><line x1={sx(t)} x2={sx(t)} y1={top} y2={bottom} className="ws-grid-line" /><text x={sx(t)} y={bottom + 20} textAnchor="middle" className="chart-svg-label">{axis(x)(t)}</text></g>)}
        {sy.ticks(5).map(t => <g key={`y${t}`}><line x1={left} x2={right} y1={sy(t)} y2={sy(t)} className="ws-grid-line" /><text x={left - 8} y={sy(t)} dy="0.35em" textAnchor="end" className="chart-svg-label">{axis(y)(t)}</text></g>)}
        <line x1={left} x2={right} y1={bottom} y2={bottom} className="ws-axis" /><line x1={left} x2={left} y1={top} y2={bottom} className="ws-axis" />
        <text x={(left + right) / 2} y={bottom + 36} textAnchor="middle" className="chart-svg-label ws-axis-title">{VAR_LABELS[x]}</text>
        <g className="ws-points">{points.filter(p => !pickedIds.has(p.player_id)).map(p => { const tone = p.position ? toneColor(POSITION_TONE[p.position]) : "var(--color-text-tertiary)";
          return <circle key={p.player_id} cx={sx(p[x]!)} cy={sy(p[y]!)} r="4" fill={reported(p) ? "none" : tone} stroke={reported(p) ? tone : "none"} strokeWidth={1.5}
            data-player={p.player_id} data-x={p[x]!} data-value={p[y]!} data-source={p.measurement_source ?? undefined}><title>{`${p.name}${reported(p) ? " (reported)" : ""}: ${varText(x, p[x], units)}, ${varText(y, p[y], units)}`}</title></circle>; })}</g>
        {visible.map(({ player: p, tone }) => { const cx = sx(p[x]!), cy = sy(p[y]!), label = labels.get(p.player_id)!, flip = label.side === "left", lx = label.lx;
          return <g key={`pick-${p.player_id}`} className="ws-picked" data-selected={p.player_id}>
            {(Math.abs(label.ly - cy) > 2 || Math.abs(Math.abs(lx - cx) - 14) > 1) && <line x1={cx} y1={cy} x2={lx} y2={label.ly} className="ws-leader" />}
            <circle data-player={p.player_id} data-x={p[x]!} data-value={p[y]!} data-source={p.measurement_source ?? undefined} cx={cx} cy={cy} r="8" fill={toneColor(tone)} />
            <text x={lx} y={label.ly} dy="0.35em" textAnchor={flip ? "end" : "start"} className="ws-picked-label">{p.name}</text>
          </g>; })}
      </svg>
      <ul className="ws-legend">
        {POSITIONS.map(p => <li key={p}><span className="ws-key" style={chartVars({ "--chart-tone": toneColor(POSITION_TONE[p]) })} aria-hidden="true" />{p}</li>)}
        {!usesRating && <li><span className="ws-key ws-key-hollow" aria-hidden="true" />Reported (not in r)</li>}
      </ul>
    </ChartData></div>
  </section>;
}

function SimilarProfiles({ data, playerId, fallback, units, onPick, onClear }: { data: WingspanSummary; playerId: string | null; fallback: WingspanPlayer | undefined; units: Units; onPick: (id: string) => void; onClear: () => void }) {
  const { data: near, error, loading, retry } = useFeed([playerId], signal => playerId ? getNearest(playerId, signal) : Promise.resolve(null));
  const target = data.players.find(p => p.player_id === playerId);
  type Row = WingspanPlayer & { distance: number | null };
  const rows: Row[] = near && near.state === "ready" ? [...(target ? [{ ...target, distance: null }] : []), ...near.neighbours] : [];
  const columns: GridColumn<Row>[] = [
    { key: "height", label: "Height", width: "md", data: p => ({ field: "height", value: p.height ?? undefined }), cell: p => <GridValue text={lengthText(p.height, units)} /> },
    { key: "wingspan", label: "Wingspan", width: "md", data: p => ({ field: "wingspan", value: p.wingspan ?? undefined }), cell: p => <GridValue text={lengthText(p.wingspan, units)} /> },
    { key: "diff", label: "Diff", width: "md", data: p => ({ field: "diff", value: p.diff ?? undefined }), cell: p => <GridValue text={diffText(p.diff, units)} identity={signIdentity(p.diff)} /> },
    { key: "d_dpm", label: "Career D-DPM", width: "md", data: p => ({ field: "d_dpm", value: p.d_dpm ?? undefined }), cell: p => <GridValue text={signed(p.d_dpm, 2)} identity={signIdentity(asShown(p.d_dpm, 2))} /> },
    { key: "distance", label: "Distance", width: "md", data: p => ({ field: "distance", value: p.distance ?? 0 }), cell: p => <GridValue text={p.distance == null ? "Selected" : fixed(p.distance, 3)} muted={p.distance == null} /> },
  ];
  return <ResearchSection id="similar" icon="target" title="Similar Profiles"
    aside={target && <Button size="sm" variant="ghost" icon="close" onClick={onClear} aria-label="Clear the selected player">Clear</Button>}>
    {!playerId && <GatedNote action={fallback && <Button size="lg" onClick={() => onPick(fallback.player_id)}>Show {fallback.name}</Button>}>No player selected. Pick the target beside a player to see the {data.nearest.k} closest builds.</GatedNote>}
    {playerId && error && <FeedFailure error={error} retry={retry} what="Similar profiles" />}
    {playerId && loading && <FeedSkeleton label="Loading similar profiles" />}
    {near && near.state === "not_measured" && <GatedNote>No height and wingspan for this player: similar builds are unknown.</GatedNote>}
    {near && near.state === "ready" && <StatsGrid<Row> label="Nearest builds" name="nearest" rows={rows} rowKey={p => p.player_id} columns={columns} density="compact" height="auto" leadWidth="lg"
      rowData={p => ({ current: p.distance == null || undefined })}
      lead={{ label: "Player", cell: p => <GridPlayer playerId={p.player_id} name={p.name} team={p.photo_team} season={p.photo_season} era={seasonEra(p.photo_season, p.photo_team)} href={`/players/${p.player_id}`}
        subtitle={reported(p) ? <>{p.photo_team ?? "—"} · <ReportedTag /></> : <>{p.photo_team ?? "—"}{p.combine_year != null ? ` · ${p.combine_year} combine` : ""}</>} /> }} />}
  </ResearchSection>;
}

function CombineDrills({ year }: { year: number }) {
  const { data, error, loading, retry } = useFeed([String(year)], signal => getCombine({ draftYear: year }, signal));
  const [sort, setSort] = useState<{ key: string; direction: "asc" | "desc" }>({ key: "reach", direction: "desc" });
  // Drafted players take their drafting team's colour and logo in their rookie season.
  const rookie = `${year}-${String((year + 1) % 100).padStart(2, "0")}`;
  const pct = (r: CombineRow, key: string) => percentileText(r.percentiles[key])?.slice(1) ?? null;
  const columns: GridColumn<CombineRow>[] = [
    { key: "pick", label: "Pick", title: "Overall pick and team", group: "Draft", width: "sm", sort: r => r.pick_overall, data: r => ({ value: r.pick_overall ?? undefined }),
      cell: r => <GridValue text={r.pick_overall ? `#${r.pick_overall}${r.drafted_by ? ` ${r.drafted_by}` : ""}` : "—"} /> },
    { key: "reach", label: "Reach", title: "Standing reach", group: "Body", width: "sm", sort: r => r.standing_reach_inches, data: r => ({ value: r.standing_reach_inches ?? undefined }),
      cell: r => <GridValue text={lengthText(r.standing_reach_inches, "ftin")} sub={pct(r, "standing_reach_inches")} /> },
    { key: "weight", label: "Weight", title: "Weight", group: "Body", width: "sm", sort: r => r.weight_lbs, data: r => ({ value: r.weight_lbs ?? undefined }),
      cell: r => <GridValue text={r.weight_lbs == null ? null : `${fmt(r.weight_lbs, 0)} lb`} /> },
    { key: "vert", label: "Max Vert", title: "Max vertical leap", group: "Athletic testing", width: "sm", sort: r => r.max_vertical_inches, data: r => ({ value: r.max_vertical_inches ?? undefined }),
      cell: r => <GridValue text={r.max_vertical_inches == null ? null : `${fmt(r.max_vertical_inches)}″`} sub={pct(r, "max_vertical_inches")} /> },
    { key: "lane", label: "Lane Agility", title: "Lane agility time (lower is faster)", group: "Athletic testing", width: "sm", sort: r => r.lane_agility_seconds, data: r => ({ value: r.lane_agility_seconds ?? undefined }),
      cell: r => <GridValue text={r.lane_agility_seconds == null ? null : `${fmt(r.lane_agility_seconds, 2)} s`} sub={pct(r, "lane_agility_seconds")} /> },
    { key: "sprint", label: "¾ Sprint", title: "Three-quarter-court sprint (lower is faster)", group: "Athletic testing", width: "sm", sort: r => r.three_quarter_sprint_seconds, data: r => ({ value: r.three_quarter_sprint_seconds ?? undefined }),
      cell: r => <GridValue text={r.three_quarter_sprint_seconds == null ? null : `${fmt(r.three_quarter_sprint_seconds, 2)} s`} sub={pct(r, "three_quarter_sprint_seconds")} /> },
  ];
  const column = columns.find(c => c.key === sort.key) ?? columns[1];
  const exportCsv = () => data && downloadCsv(`courtlens-combine-${year}.csv`, toCsv(["nba_id", "player", "pick", "standing_reach_in", "weight_lb", "max_vertical_in", "lane_agility_s", "three_quarter_sprint_s"],
    data.rows.map(r => [r.player_id, r.player_name, r.pick_overall, r.standing_reach_inches, r.weight_lbs, r.max_vertical_inches, r.lane_agility_seconds, r.three_quarter_sprint_seconds])));
  return <ResearchSection id="drills" icon="gauge" title={`${year} Combine Drills`} aside={data && <Button size="sm" icon="download" onClick={exportCsv}>Download CSV</Button>}>
    {error && <FeedFailure error={error} retry={retry} what="Combine drills" />}
    {loading && <FeedSkeleton label="Loading combine drills" />}
    {data && <StatsGrid<CombineRow> label="Combine drills" name="drills" rows={sortRows(data.rows, column.sort!, sort.direction, r => r.row_key)} rowKey={r => r.row_key} columns={columns} leadWidth="lg"
      sort={{ ...sort, onSort: key => setSort(s => s.key === key ? { key, direction: s.direction === "desc" ? "asc" : "desc" } : { key, direction: "desc" }) }}
      lead={{ group: "Player", label: "Player", cell: r => <GridPlayer playerId={r.player_id} name={r.player_name} team={r.drafted_by} season={rookie} era={seasonEra(rookie, r.drafted_by)}
        href={r.player_id ? `/players/${r.player_id}` : undefined} subtitle={r.player_id ? `${r.position ?? "—"} · ${year} combine` : "Identity unknown"} /> }} />}
  </ResearchSection>;
}

function rValue(c: Correlation | undefined) {
  if (!c) return <GridValue text={null} />;
  const unclear = c.verdict === "not_distinguishable_from_zero";
  return <GridValue text={signed(c.r, 2)} sub={`${rangeText(c.low, c.high, 2)}${unclear ? " · not distinguishable from zero" : ""}`} muted={unclear} />;
}
const rData = (c: Correlation | undefined) => c ? { pair: `${c.x}:${c.y}`, value: c.r ?? undefined, low: c.low ?? undefined, high: c.high ?? undefined, verdict: c.verdict } : {};

function Defense({ data }: { data: WingspanSummary }) {
  const primary = data.correlations[0];
  const pairs: [WingspanVar, WingspanVar, string][] = [["diff", "d_dpm", "Wingspan − height"], ["wingspan", "d_dpm", "Wingspan"], ["height", "d_dpm", "Height (no shoes)"]];
  const find = (pos: string, x: WingspanVar, y: WingspanVar) => data.within_position.find(w => w.position === pos && w.x === x && w.y === y);
  type CRow = Correlation & { partial: boolean };
  const all: CRow[] = [...data.correlations.map(c => ({ ...c, partial: false })), { ...data.partial, partial: true }];
  const key = (c: CRow) => `all:${c.x}:${c.y}${c.partial ? ":partial" : ""}`;
  return <ResearchSection icon="shield" title="Wingspan and Defense">
    <p className="ws-headline" data-field="headline" data-value={primary.r ?? ""}>
      Longer arms for one&apos;s height go with better DARKO defense, modestly: wingspan minus height against career D-DPM is <strong>r {signed(primary.r, 2)}</strong> (95% {rangeText(primary.low, primary.high, 2)}, {primary.n.toLocaleString("en-US")} combine players).
      With height held fixed, wingspan&apos;s partial r is {signed(data.partial.r, 2)} (95% {rangeText(data.partial.low, data.partial.high, 2)}). A description, not a prediction or a cause.
    </p>
    <StatsGrid<CRow> label="Correlations" name="correlations" rows={all} rowKey={key} density="compact" height="auto" leadWidth="xl"
      lead={{ group: "Pair", label: "Measurement · rating", cell: c => <span className="ws-pair">{VAR_LABELS[c.x]} · {VAR_LABELS[c.y]}{c.partial ? " (height held fixed)" : ""}</span> }}
      columns={[
        { key: "n", label: "Players", group: "Sample", width: "sm", data: c => ({ field: "n", value: c.n }), cell: c => <GridValue text={c.n.toLocaleString("en-US")} /> },
        { key: "r", label: "r (95%)", group: "Pearson correlation", width: "xl", data: c => ({ field: "r", ...rData(c) }), cell: c => rValue(c) },
        { key: "verdict", label: "Verdict", group: "Pearson correlation", width: "lg", data: c => ({ field: "verdict", value: c.verdict }), cell: c => <GridValue text={VERDICT_LABELS[c.verdict]} muted={c.verdict === "not_distinguishable_from_zero"} /> },
      ]} />
    <h3 className="ws-subhead">Within Position, against Career D-DPM</h3>
    <StatsGrid<Pos> label="Correlations within position" name="within-position" rows={[...POSITIONS]} rowKey={p => p} density="compact" height="auto" leadWidth="sm"
      lead={{ group: "Position", label: "Pos", cell: pos => <strong>{pos}</strong> }}
      columns={[
        { key: "n", label: "Players", group: "Sample", width: "sm", data: pos => ({ field: "n", value: find(pos, "diff", "d_dpm")?.n }), cell: pos => <GridValue text={find(pos, "diff", "d_dpm")?.n.toLocaleString("en-US") ?? null} /> },
        ...pairs.map(([x, y, label]): GridColumn<Pos> => ({ key: `r-${x}`, label, group: "r against career D-DPM (95%)", width: "fill", data: pos => ({ field: `r-${x}`, ...rData(find(pos, x, y)) }), cell: pos => rValue(find(pos, x, y)) })),
      ]} />
  </ResearchSection>;
}

function Methodology({ data, details }: { data: WingspanSummary; details: ReactNode }) {
  const r = data.registration, pop = data.population, cov = data.coverage;
  const now = data.current.state === "ready" ? `${data.current.season}, games through ${data.current.data_date}` : "unavailable";
  const exclusions = Object.entries(pop.exclusions);
  const meanCell = (v: "height" | "wingspan" | "diff" | "weight" | "d_dpm"): GridColumn<PositionalAverage> => ({
    key: v, label: v === "d_dpm" ? "Career D-DPM" : v[0].toUpperCase() + v.slice(1), group: v === "d_dpm" ? "Rated players" : "Measured players", width: "md",
    data: a => ({ field: v, value: a[v].mean ?? undefined, low: a[v].low ?? undefined, high: a[v].high ?? undefined, n: a[v].n }),
    cell: a => <GridValue text={meanText(v, a[v])} sub={rangeText(a[v].low, a[v].high, v === "weight" ? 1 : 2)} />,
  });
  return <ResearchDisclosure id="methodology" icon="book" title="Caveats & Methodology">
    <MethodBlock title="Caveats">
      <ul className="ws-list">
        {data.caveats.map(c => <li key={c}>{c}</li>)}
        <li>With Shoes is the height measured in shoes, never a fixed allowance; the 2000–2003 and 2023–2026 combines didn&apos;t measure it, so those players (and every reported player) show “—”. Percentiles and correlations use barefoot height.</li>
        <li>D-DPM is DARKO&apos;s newest board ({now}); Active means on that board. Career D-DPM and its percentile cover the {pop.analysis.toLocaleString("en-US")} players in the correlations.</li>
        <li>Diff and D-DPM are gold above zero and blue below, as on Databallr: a sign, not a good or bad verdict.</li>
        <li>Positional averages, the summary averages and r cover combine measurements only, whatever the filters.</li>
      </ul>
    </MethodBlock>
    {cov.state === "ready" && <MethodBlock title="Coverage beyond the Combine">
      <p className="rs-card-text">
        CraftedNBA&apos;s page lists {cov.counts.rows} current players, read once on {cov.observed_at.slice(0, 10)} and sealed (<code>{cov.version}</code> · <code data-field="coverage-seal" data-value={cov.seal_sha256}>{cov.seal_sha256.slice(0, 16)}</code>; raw page <code>{cov.raw_sha256.slice(0, 16)}</code>).
        {" "}{cov.counts.matched} matched an NBA person ID by name ({Object.keys(cov.aliases).length} nicknames by a reviewed alias), {cov.counts.unmatched} unmatched, {cov.counts.ambiguous} ambiguous.
        {" "}{cov.counts.combine_measured} already have a combine measurement, which is shown; {cov.counts.fills_combine_row} fill a combine participant who wasn&apos;t measured; {cov.counts.adds_player} add players the combine never saw.
      </p>
      {cov.agreement_with_combine.height_vs_barefoot && cov.agreement_with_combine.wingspan && <p className="rs-card-text">
        Where both exist ({cov.agreement_with_combine.players} players), CraftedNBA&apos;s height equals the combine&apos;s barefoot height for {cov.agreement_with_combine.height_vs_barefoot.equal} and its wingspan equals the combine&apos;s for {cov.agreement_with_combine.wingspan.equal}; it names no measurement source.
      </p>}
      <ul className="ws-list">{cov.source.limitations.map(l => <li key={l}>{l}</li>)}</ul>
    </MethodBlock>}
    <MethodBlock title="Who Is Counted">
      <p className="rs-card-text">{pop.players_with_person_id.toLocaleString("en-US")} combine participants since 2000 with an NBA person ID; {pop.measured.toLocaleString("en-US")} measured; {pop.analysis.toLocaleString("en-US")} with a career D-DPM.</p>
      <StatsGrid<[string, number]> label="Exclusions" name="exclusions" rows={exclusions} rowKey={([k]) => k} density="compact" height="auto" leadWidth="xl" minWidth="narrow"
        lead={{ label: "Left out of the D-DPM correlations", cell: ([k]) => <span className="ws-pair">{EXCLUSION_LABELS[k] ?? k}</span> }}
        columns={[{ key: "count", label: "Players", width: "sm", data: ([, n]) => ({ field: "count", value: n }), cell: ([, n]) => <GridValue text={n.toLocaleString("en-US")} /> }]} />
    </MethodBlock>
    <MethodBlock title="Positional Averages with Intervals">
      <p className="rs-card-text">First listed combine position; inches and pounds; 95% bootstrap intervals over players. Career D-DPM averages the rated players.</p>
      <StatsGrid<PositionalAverage> label="Positional averages" name="positional-averages" rows={data.positional_averages} rowKey={a => a.position} density="compact" height="auto" leadWidth="sm" minWidth="wide"
        lead={{ group: "Position", label: "Pos", cell: a => <strong>{a.position === "ALL" ? "All" : a.position}</strong> }}
        columns={[
          { key: "measured", label: "Players", group: "Measured players", width: "sm", data: a => ({ field: "measured", value: a.height.n }), cell: a => <GridValue text={a.height.n.toLocaleString("en-US")} /> },
          meanCell("height"), meanCell("wingspan"), meanCell("diff"), meanCell("weight"),
          { key: "rated", label: "Rated", group: "Rated players", width: "sm", data: a => ({ field: "rated", value: a.d_dpm.n }), cell: a => <GridValue text={a.d_dpm.n.toLocaleString("en-US")} /> },
          meanCell("d_dpm"),
        ]} />
    </MethodBlock>
    <MethodBlock title="Method & Reproducibility">
      <dl className="ws-dl">
        <dt>Career D-DPM</dt><dd>Minutes-weighted mean of DARKO&rsquo;s season-end regular-season D-DPM over seasons with at least {r.parameters.min_season_minutes} minutes, {data.darko_seasons?.[0]} to {data.darko_seasons?.[1]}.</dd>
        <dt>Similar profiles</dt><dd>The {data.nearest.k} combine-measured players closest in barefoot height and wingspan, each standardized over all {pop.measured.toLocaleString("en-US")} measured players (height {fixed(data.nearest.scaling.height?.mean, 2)} ± {fixed(data.nearest.scaling.height?.sd, 2)} in, wingspan {fixed(data.nearest.scaling.wingspan?.mean, 2)} ± {fixed(data.nearest.scaling.wingspan?.sd, 2)} in); Euclidean distance. A reported player is compared on the same scale.</dd>
        <dt>Intervals</dt><dd>Seeded bootstrap over players, {r.parameters.replicates.toLocaleString("en-US")} replicates, 95%. Seed {r.parameters.seed}. An r is called positive or negative only when its interval excludes zero.</dd>
        <dt>Registration</dt><dd><code>{r.identity}</code> · <code data-field="registration-sha" data-value={r.content_sha256}>{r.content_sha256.slice(0, 16)}</code>, committed {r.registered_on} before any correlation was computed.</dd>
        <dt>Results</dt><dd><code data-field="results-sha" data-value={r.results_sha256}>{r.results_sha256.slice(0, 16)}</code>. Two runs give the same hash.</dd>
      </dl>
    </MethodBlock>
    <MethodBlock title="Data & Credits">
      <ul className="ws-list">
        {data.credits.map(c => <li key={c}>{c}</li>)}
        {data.sources.map(s => <li key={s.name}>{s.name}: {s.detail}</li>)}
      </ul>
      {details}
    </MethodBlock>
  </ResearchDisclosure>;
}

/** Research → Combine & Wingspan (R10 data, RD01 design after Databallr's Wingspan Database). */
export function WingspanResearch() {
  const { get, set } = useUrlState();
  const { data, error, loading, retry } = useFeed([], signal => getWingspan(signal));
  const ready = data?.current.state === "ready";
  const rawStatus = get("status");
  const status: Status = rawStatus === "all" || rawStatus === "inactive" ? rawStatus : ready ? "active" : "all";
  const position = POSITIONS.find(p => p === get("pos")) ?? null;
  const yearParam = Number(get("year"));
  const units = (UNITS.find(u => u === get("units")) ?? "ftin") as Units;
  const scope: Scope = { status, position, shoes: get("shoes") === "1", units, year: Number.isInteger(yearParam) && yearParam > 0 ? yearParam : null };
  const rows = useMemo(() => !data ? [] : data.players.filter(p => p.measurement_source != null
    && (status === "all" || (status === "active" ? p.active === true : p.active === false))
    && (!position || p.position === position)
    && (scope.year == null || p.combine_year === scope.year)), [data, status, position, scope.year]);
  const byId = useMemo(() => new Map((data?.players ?? []).map(p => [p.player_id, p])), [data]);
  const overlay = (get("overlay") ?? "").split(",").filter(id => byId.get(id)?.measurement_source != null).slice(0, OVERLAY_MAX);
  const build = get("build");
  const buildId = build && build !== NONE && byId.has(build) ? build : null;
  const longest = useMemo(() => [...rows].sort((a, b) => (b.wingspan ?? 0) - (a.wingspan ?? 0) || a.player_id.localeCompare(b.player_id))[0], [rows]);
  if (error) return <div className="rs-column ws-page"><FeedFailure error={error} retry={retry} what="Wingspan measurements" /></div>;
  if (loading || !data) return <div className="rs-column ws-page"><FeedSkeleton label="Loading wingspan measurements" /></div>;
  // Highlighted on the scatter: the overlay players, the similar-profiles pick and players added to the graph.
  const marks = (get("mark") ?? "").split(",").filter(id => byId.get(id)?.measurement_source != null && !overlay.includes(id) && id !== buildId).slice(0, MARK_MAX);
  const picked: Picked[] = [
    ...overlay.map((id, i) => ({ player: byId.get(id)!, tone: OVERLAY_TONES[i], role: "overlay" as const })),
    ...(buildId && !overlay.includes(buildId) ? [{ player: byId.get(buildId)!, tone: "category-6" as ChartTone, role: "similar" as const }] : []),
    ...marks.map((id, i) => ({ player: byId.get(id)!, tone: MARK_TONES[(i + 1) % MARK_TONES.length], role: "mark" as const })),
  ];
  const details = <DataDetailsButton rows={[
    { label: "Registration", value: `${data.registration.identity} · ${data.registration.content_sha256}`, mono: true },
    { label: "Results SHA-256", value: data.registration.results_sha256, mono: true },
    ...(data.coverage.state === "ready" ? [{ label: "Coverage seal", value: `${data.coverage.version} · ${data.coverage.seal_sha256}`, mono: true }] : []),
    ...data.sources.map(s => ({ label: s.name, value: s.detail })),
  ]} />;
  return <div className="rs-column ws-page">
    <Filters data={data} scope={scope} rows={rows} set={set} />
    <div className="ws-main">
      <div className="ws-main-table"><PlayersTable rows={rows} scope={scope} overlay={overlay} set={set} /></div>
      <aside className="ws-side" aria-label="Averages and overlay">
        <PositionAverages data={data} units={scope.units} />
        <Overlay players={overlay.map(id => byId.get(id)!)} units={scope.units}
          onRemove={id => set({ overlay: overlay.filter(o => o !== id).join(",") || null })} onClear={() => set({ overlay: null })} />
      </aside>
    </div>
    <Scatter data={data} units={scope.units} picked={picked} set={set} get={get}
      onAdd={id => set({ mark: [...marks, id].join(",") })}
      onRemove={p => p.role === "similar" ? set({ build: NONE }) : p.role === "mark" ? set({ mark: marks.filter(m => m !== p.player.player_id).join(",") || null }) : set({ overlay: overlay.filter(o => o !== p.player.player_id).join(",") || null })}
      onClear={() => set({ overlay: null, mark: null, build: buildId ? NONE : null })} />
    <SimilarProfiles data={data} playerId={buildId} fallback={longest} units={scope.units} onPick={id => set({ build: id })} onClear={() => set({ build: NONE })} />
    {scope.year != null && <CombineDrills year={scope.year} />}
    <Defense data={data} />
    <Methodology data={data} details={details} />
    <p className="ws-sources">Data: NBA Draft Combine via hoopR; CraftedNBA (reported, for players the combine never measured); DARKO by Kostya Medvedovsky. Design after Databallr&apos;s Wingspan Database.</p>
  </div>;
}
