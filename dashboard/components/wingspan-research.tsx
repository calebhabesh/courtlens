"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { scaleLinear } from "d3-scale";
import { ChartData } from "./charts/chart-frame";
import { chartVars, toneColor, type ChartTone } from "./charts/semantics";
import { ResearchDisclosure, ResearchSection, MethodBlock } from "./research/research-page";
import { ResearchTable, type ResearchColumn, type ResearchView } from "./research/research-table";
import { FeedFailure, FeedSkeleton, useFeed, useUrlState } from "./stats-feed-ui";
import { DataDetailsButton } from "./ui/data-details";
import { GatedNote } from "./ui/gated-note";
import { PlayerIdentity } from "./ui/identity";
import { Button, IconButton, Segmented, Select } from "./ui/kit";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "./ui/table";
import { fixed, rangeText, signed } from "@/lib/draft-classes";
import { seasonEra } from "@/lib/portrait-source";
import {
  EXCLUSION_LABELS, VAR_LABELS, VERDICT_LABELS, getNearest, getWingspan,
  type Correlation, type Mean, type WingspanPlayer, type WingspanSummary, type WingspanVar
} from "@/lib/research-r10";
import { fmt, getCombine, type CombineRow } from "@/lib/stats-feeds";
import { diffText, lengthText, percentileText, signIdentity, type Units } from "@/lib/wingspan-format";

/*
 * RD01 Combine & Wingspan, after Databallr's Wingspan Database: one filter panel, the players table
 * beside position averages and the height-wingspan overlay, the scatter, then R10's registered
 * correlations (courtlens-wingspan-ddpm-v1) and the collapsed methodology. Design only: every value
 * is the API's. Diff and D-DPM take Databallr's sign colours as identity tones (gold above zero,
 * blue below), never good or bad; nothing here has an interval to earn green or red.
 */

const VARS: WingspanVar[] = ["height", "wingspan", "diff", "d_dpm"];
const POSITIONS = ["PG", "SG", "SF", "PF", "C"] as const;
type Pos = (typeof POSITIONS)[number];
type Status = "all" | "active" | "inactive";
const POSITION_TONE: Record<Pos, ChartTone> = { PG: "category-1", SG: "category-2", SF: "category-3", PF: "category-4", C: "category-5" };
const OVERLAY_TONES: ChartTone[] = ["identity-a", "identity-b", "category-3", "category-4"];
const OVERLAY_MAX = OVERLAY_TONES.length;
const NONE = "none";

const posIndex = (p: WingspanPlayer) => p.position ? POSITIONS.indexOf(p.position) : null;
const mean = (values: (number | null)[]) => { const known = values.filter((v): v is number => v != null); return known.length ? known.reduce((a, b) => a + b, 0) / known.length : null; };
const varText = (v: WingspanVar, value: number | null | undefined, units: Units) => v === "d_dpm" ? signed(value, 2) : v === "diff" ? diffText(value, units) : lengthText(value, units);
const meanText = (v: WingspanVar | "weight", m: Mean) => v === "weight" ? fixed(m.mean, 1) : v === "d_dpm" ? signed(m.mean, 2) : fixed(m.mean, 2);

function Identity({ p, size = "sm" }: { p: WingspanPlayer; size?: "sm" | "md" | "lg" }) {
  return <PlayerIdentity playerId={p.player_id} name={p.name} team={p.photo_team} era={seasonEra(p.photo_season, p.photo_team)} size={size} href={`/players/${p.player_id}`} />;
}

interface Scope { status: Status; position: Pos | null; shoes: boolean; units: Units; year: number | null }

function Filters({ data, scope, rows, set }: { data: WingspanSummary; scope: Scope; rows: WingspanPlayer[]; set: (u: Record<string, string | null>) => void }) {
  const years = useMemo(() => [...new Set(data.players.map(p => p.combine_year))].sort((a, b) => b - a), [data]);
  const height = (p: WingspanPlayer) => scope.shoes ? p.height_shoes : p.height;
  const avgH = mean(rows.map(height)), avgW = mean(rows.map(p => p.wingspan)), avgD = mean(rows.map(p => p.diff));
  const statusReady = data.current.state === "ready";
  return <div className="ws-panel ws-filters" role="group" aria-label="Wingspan filters">
    <div className="ws-filter-rows">
      <Segmented size="sm" label="Status" value={scope.status} disabled={!statusReady} onChange={v => set({ status: v === "active" ? null : v })}
        options={[{ value: "all", label: "All Players" }, { value: "active", label: "Active", title: statusReady ? `On DARKO's newest board, ${data.current.data_date}` : undefined }, { value: "inactive", label: "Inactive" }]} />
      <Segmented size="sm" label="Position" value={scope.position ?? "all"} onChange={v => set({ pos: v === "all" ? null : v })}
        options={[{ value: "all", label: "All Positions" }, ...POSITIONS.map(p => ({ value: p, label: p }))]} />
      <div className="ws-filter-line">
        <Segmented size="sm" label="Height" value={scope.shoes ? "shoes" : "barefoot"} onChange={v => set({ shoes: v === "shoes" ? "1" : null })}
          options={[{ value: "barefoot", label: "No Shoes" }, { value: "shoes", label: "With Shoes", title: "Measured with shoes; not measured at the 2000–2003 or 2023–2026 combines" }]} />
        <Segmented size="sm" label="Units" value={scope.units} onChange={v => set({ units: v === "in" ? "in" : null })}
          options={[{ value: "in", label: "Inches" }, { value: "ftin", label: "Ft-In" }]} />
        <Select size="sm" aria-label="Combine class" value={scope.year == null ? "" : String(scope.year)} onChange={e => set({ year: e.target.value || null })}>
          <option value="">All combines</option>{years.map(y => <option key={y} value={y}>{y} combine</option>)}
        </Select>
      </div>
    </div>
    <p className="ws-summary" data-field="summary" data-value={rows.length}>
      Rows: {rows.length.toLocaleString("en-US")} · Avg H: {lengthText(avgH, scope.units)} · Avg W: {lengthText(avgW, scope.units)} · Avg Diff: {diffText(avgD, scope.units)}
    </p>
  </div>;
}

function PlayersTable({ rows, scope, overlay, set }: { rows: WingspanPlayer[]; scope: Scope; overlay: string[]; set: (u: Record<string, string | null>) => void }) {
  const u = scope.units;
  const views = useMemo<ResearchView<WingspanPlayer>[]>(() => [{ value: "all", label: "All", columns: [
    { key: "position", label: "Position", title: "First listed combine position", value: posIndex, format: (_, p) => p.position_label ?? p.position ?? "—", bar: false, width: "text" },
    { key: "height", label: scope.shoes ? "Height (Shoes)" : "Height (No Shoes)", title: scope.shoes ? "Height in shoes, as measured" : "Barefoot height", value: p => scope.shoes ? p.height_shoes : p.height,
      format: v => lengthText(v, u), sub: p => scope.shoes ? null : percentileText(p.percentiles.height), width: "value",
      unknown: () => scope.shoes ? "Not measured with shoes at this combine" : undefined },
    { key: "wingspan", label: "Wingspan", title: "Wingspan", value: p => p.wingspan, format: v => lengthText(v, u), sub: p => percentileText(p.percentiles.wingspan), width: "signed" },
    { key: "diff", label: "Diff (W−H)", title: "Wingspan minus barefoot height", value: p => p.diff, format: v => diffText(v, u), sub: p => percentileText(p.percentiles.diff), identity: p => signIdentity(p.diff), width: "signed" },
    { key: "d_dpm_now", label: "D-DPM", title: "DARKO's defensive plus-minus on its newest board", value: p => p.d_dpm_now, signedValue: true, bar: false, identity: p => signIdentity(p.d_dpm_now), width: "count",
      unknown: () => "Not on DARKO's newest board" },
    { key: "d_dpm", label: "Career", title: "Career D-DPM: minutes-weighted season-end D-DPM over 500-minute seasons", value: p => p.d_dpm, signedValue: true, bar: false, identity: p => signIdentity(p.d_dpm),
      sub: p => percentileText(p.percentiles.d_dpm), width: "count", unknown: p => p.exclusion ? EXCLUSION_LABELS[p.exclusion] : undefined },
  ] }], [scope.shoes, u]);
  const csv = useMemo(() => ({ filename: "courtlens-wingspan.csv", columns: [
    { header: "nba_id", value: (p: WingspanPlayer) => p.player_id }, { header: "player", value: (p: WingspanPlayer) => p.name },
    { header: "combine_year", value: (p: WingspanPlayer) => p.combine_year }, { header: "position", value: (p: WingspanPlayer) => p.position_label },
    { header: "height_no_shoes_in", value: (p: WingspanPlayer) => p.height }, { header: "height_shoes_in", value: (p: WingspanPlayer) => p.height_shoes },
    { header: "wingspan_in", value: (p: WingspanPlayer) => p.wingspan }, { header: "diff_in", value: (p: WingspanPlayer) => p.diff },
    { header: "standing_reach_in", value: (p: WingspanPlayer) => p.standing_reach }, { header: "weight_lb", value: (p: WingspanPlayer) => p.weight },
    { header: "d_dpm_now", value: (p: WingspanPlayer) => p.d_dpm_now }, { header: "career_d_dpm", value: (p: WingspanPlayer) => p.d_dpm },
    { header: "career_seasons", value: (p: WingspanPlayer) => p.career_seasons },
  ] }), []);
  return <ResearchTable<WingspanPlayer> className="ws-table" label="Wingspan players" rows={rows} rowKey={p => p.player_id} name={p => p.name}
    team={p => p.photo_team} teamSeason={p => p.photo_season} teamFilter={false} season="2025-26"
    player={p => <Identity p={p} />} views={views} defaultSort="wingspan" noun="players" csv={csv}
    rowAction={p => <span className="ws-row-actions">
      <IconButton size="sm" icon="target" label={`Find similar profiles for ${p.name}`} onClick={() => set({ build: p.player_id })} />
      <IconButton size="sm" icon="plus" label={overlay.includes(p.player_id) ? `${p.name} is in the overlay` : `Add ${p.name} to the overlay`}
        disabled={overlay.includes(p.player_id) || overlay.length >= OVERLAY_MAX}
        onClick={() => set({ overlay: [...overlay, p.player_id].join(",") })} />
    </span>} />;
}

function PositionAverages({ data, units }: { data: WingspanSummary; units: Units }) {
  return <section className="ws-panel ws-side-block" aria-labelledby="ws-avg">
    <h2 id="ws-avg" className="ws-panel-title">Positional Averages</h2>
    <ul className="ws-averages">{data.positional_averages.filter(a => a.position !== "ALL").map(a => <li key={a.position} className="ws-average" data-row={a.position}>
      <span><small>Pos</small><strong>{a.position}</strong></span>
      <span data-field="height" data-value={a.height.mean ?? ""}><small>Height</small>{lengthText(a.height.mean, units)}</span>
      <span data-field="wingspan" data-value={a.wingspan.mean ?? ""}><small>Wingspan</small>{lengthText(a.wingspan.mean, units)}</span>
      <span data-field="diff" data-value={a.diff.mean ?? ""}><small>Diff</small><em data-identity={signIdentity(a.diff.mean)}>{diffText(a.diff.mean, units)}</em></span>
    </li>)}</ul>
  </section>;
}

/** Height (vertical) and wingspan (horizontal) as a cross per player on one true-length scale, centred together. */
function Overlay({ players, units, onRemove, onClear }: { players: WingspanPlayer[]; units: Units; onRemove: (id: string) => void; onClear: () => void }) {
  const size = 280, centre = size / 2;
  const longest = Math.max(1, ...players.flatMap(p => [p.height ?? 0, p.wingspan ?? 0]));
  const k = (size - 24) / longest;
  return <section className="ws-panel ws-side-block" aria-labelledby="ws-overlay">
    <div className="ws-panel-head"><h2 id="ws-overlay" className="ws-panel-title">Selected Player Overlay</h2>
      {players.length > 0 && <Button size="sm" variant="ghost" onClick={onClear}>Clear</Button>}</div>
    {players.length === 0 ? <p className="ws-well ws-empty" data-field="overlay-empty">Add players from the table to visualize proportional overlap between their height and wingspan.</p> : <>
      <ChartData fingerprint={players.map(p => p.player_id).join(",")}>
        <svg className="ws-overlay-graphic" viewBox={`0 0 ${size} ${size}`} role="img" aria-label={`Height and wingspan to scale: ${players.map(p => p.name).join(", ")}`}>
          {/* Longest first and widest, so every shorter length stays visible inside the longer ones. */}
          {(["wingspan", "height"] as const).map(kind => [...players.entries()].filter(([, p]) => p[kind] != null).sort(([, a], [, b]) => b[kind]! - a[kind]!)
            .map(([i, p], order) => { const len = p[kind]! * k;
              return <line key={`${kind}-${p.player_id}`} data-player={p.player_id} data-kind={kind} data-value={p[kind]!} stroke={toneColor(OVERLAY_TONES[i])} strokeWidth={12 - order * 3} strokeLinecap="butt"
                x1={kind === "wingspan" ? centre - len / 2 : centre} x2={kind === "wingspan" ? centre + len / 2 : centre}
                y1={kind === "height" ? centre - len / 2 : centre} y2={kind === "height" ? centre + len / 2 : centre} />; }))}
        </svg>
      </ChartData>
      <ul className="ws-overlay-list">{players.map((p, i) => <li key={p.player_id} data-row={p.player_id}>
        <span className="ws-key" style={chartVars({ "--chart-tone": toneColor(OVERLAY_TONES[i]) })} aria-hidden="true" />
        <span className="ws-overlay-name">{p.name}</span>
        <span className="ws-overlay-figures">{lengthText(p.height, units)} · {lengthText(p.wingspan, units)} · <em data-identity={signIdentity(p.diff)}>{diffText(p.diff, units)}</em></span>
        <IconButton size="sm" icon="close" label={`Remove ${p.name} from the overlay`} onClick={() => onRemove(p.player_id)} />
      </li>)}</ul>
    </>}
  </section>;
}

function Scatter({ data, units, highlighted, set, get }: { data: WingspanSummary; units: Units; highlighted: string[]; set: (u: Record<string, string | null>) => void; get: (n: string) => string | null }) {
  const x = (VARS.includes(get("x") as WingspanVar) ? get("x") : "height") as WingspanVar;
  const y = (VARS.includes(get("y") as WingspanVar) ? get("y") : "wingspan") as WingspanVar;
  const usesRating = x === "d_dpm" || y === "d_dpm";
  const points = data.players.filter(p => (usesRating ? p.in_population : p.measured) && p[x] != null && p[y] != null);
  const c = x === y ? null : data.correlations.find(r => (r.x === x && r.y === y) || (r.x === y && r.y === x)) ?? null;
  const extent = (k: WingspanVar) => { const v = points.map(p => p[k]!); return v.length ? [Math.min(...v), Math.max(...v)] : [0, 1]; };
  // The drawing takes the panel's own width, so labels stay at text size on a phone.
  const frame = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(1032);
  useEffect(() => {
    const node = frame.current;
    if (!node || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(([entry]) => setWidth(Math.max(320, Math.min(1032, Math.round(entry.contentRect.width)))));
    observer.observe(node);
    return () => observer.disconnect();
  }, []);
  const height = width < 600 ? 300 : 376;
  const left = 64, right = width - 16, top = 16, bottom = height - 40;
  const sx = scaleLinear().domain(extent(x)).nice().range([left, right]), sy = scaleLinear().domain(extent(y)).nice().range([bottom, top]);
  const axis = (v: WingspanVar) => (value: number) => v === "d_dpm" ? signed(value, 1) : v === "diff" ? diffText(value, units) : lengthText(value, units);
  const picked = new Set(highlighted);
  return <section className="ws-panel ws-scatter" aria-label="Measurement scatter">
    <div className="ws-scatter-head">
      <div className="ws-axes">
        <Select size="sm" aria-label="Horizontal axis" value={x} onChange={e => set({ x: e.target.value === "height" ? null : e.target.value })}>{VARS.map(v => <option key={v} value={v}>{VAR_LABELS[v]}</option>)}</Select>
        <span className="ws-vs">vs</span>
        <Select size="sm" aria-label="Vertical axis" value={y} onChange={e => set({ y: e.target.value === "wingspan" ? null : e.target.value })}>{VARS.map(v => <option key={v} value={v}>{VAR_LABELS[v]}</option>)}</Select>
      </div>
      {c && <p className="ws-r" data-field="scatter-r" data-value={c.r ?? ""} title={`95% interval ${rangeText(c.low, c.high, 2)}; ${c.n.toLocaleString("en-US")} players`}>r = {signed(c.r, 2)}</p>}
    </div>
    <div ref={frame} className="ws-scatter-frame"><ChartData fingerprint={`${x}-${y}-${units}-${highlighted.join(",")}`}>
      <svg className="ws-scatter-graphic" viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`${VAR_LABELS[y]} against ${VAR_LABELS[x]}, ${points.length.toLocaleString("en-US")} players`}>
        {sx.ticks(width < 600 ? 4 : 6).map(t => <g key={`x${t}`}><line x1={sx(t)} x2={sx(t)} y1={top} y2={bottom} className="ws-grid" /><text x={sx(t)} y={bottom + 20} textAnchor="middle" className="chart-svg-label">{axis(x)(t)}</text></g>)}
        {sy.ticks(5).map(t => <g key={`y${t}`}><line x1={left} x2={right} y1={sy(t)} y2={sy(t)} className="ws-grid" /><text x={left - 8} y={sy(t)} dy="0.35em" textAnchor="end" className="chart-svg-label">{axis(y)(t)}</text></g>)}
        <line x1={left} x2={right} y1={bottom} y2={bottom} className="ws-axis" /><line x1={left} x2={left} y1={top} y2={bottom} className="ws-axis" />
        <text x={(left + right) / 2} y={bottom + 38} textAnchor="middle" className="chart-svg-label">{VAR_LABELS[x]}</text>
        {points.map(p => <circle key={p.player_id} cx={sx(p[x]!)} cy={sy(p[y]!)} r="4" fill={p.position ? toneColor(POSITION_TONE[p.position]) : "var(--color-text-tertiary)"} fillOpacity="0.8"
          data-player={p.player_id} data-x={p[x]!} data-value={p[y]!}><title>{`${p.name}: ${varText(x, p[x], units)}, ${varText(y, p[y], units)}`}</title></circle>)}
        {points.filter(p => picked.has(p.player_id)).map(p => <circle key={`sel-${p.player_id}`} cx={sx(p[x]!)} cy={sy(p[y]!)} r="8" className="ws-picked" data-selected={p.player_id} />)}
      </svg>
      <ul className="ws-legend">{POSITIONS.map(p => <li key={p}><span className="ws-key" style={chartVars({ "--chart-tone": toneColor(POSITION_TONE[p]) })} aria-hidden="true" />{p}</li>)}</ul>
    </ChartData></div>
  </section>;
}

function SimilarProfiles({ data, playerId, fallback, units, onPick, onClear }: { data: WingspanSummary; playerId: string | null; fallback: WingspanPlayer | undefined; units: Units; onPick: (id: string) => void; onClear: () => void }) {
  const { data: near, error, loading, retry } = useFeed([playerId], signal => playerId ? getNearest(playerId, signal) : Promise.resolve(null));
  const target = data.players.find(p => p.player_id === playerId);
  const row = (p: WingspanPlayer, distance: number | null, current = false) => <TableRow key={p.player_id} data-row={p.player_id} data-current={current || undefined}>
    <TableCell data-field="player"><Identity p={p} /></TableCell>
    <TableCell numeric data-field="height" data-value={p.height ?? ""}>{lengthText(p.height, units)}</TableCell>
    <TableCell numeric data-field="wingspan" data-value={p.wingspan ?? ""}>{lengthText(p.wingspan, units)}</TableCell>
    <TableCell numeric data-field="diff" data-value={p.diff ?? ""}><span className="ws-signed" data-identity={signIdentity(p.diff)}>{diffText(p.diff, units)}</span></TableCell>
    <TableCell numeric data-field="d_dpm" data-value={p.d_dpm ?? ""}><span className="ws-signed" data-identity={signIdentity(p.d_dpm)}>{signed(p.d_dpm, 2)}</span></TableCell>
    <TableCell numeric data-field="distance" data-value={distance ?? 0}>{distance == null ? "—" : fixed(distance, 3)}</TableCell>
  </TableRow>;
  return <ResearchSection id="similar" icon="target" title="Similar Profiles"
    aside={target && <IconButton size="sm" icon="close" label="Clear the selected player" onClick={onClear} />}>
    {!playerId && <GatedNote action={fallback && <Button size="lg" onClick={() => onPick(fallback.player_id)}>Show {fallback.name}</Button>}>No player selected. Pick the target beside a player to see the {data.nearest.k} closest builds.</GatedNote>}
    {playerId && error && <FeedFailure error={error} retry={retry} what="Similar profiles" />}
    {playerId && loading && <FeedSkeleton label="Loading similar profiles" />}
    {near && near.state === "not_measured" && <GatedNote>No barefoot height and wingspan for this player: similar builds are unknown.</GatedNote>}
    {near && near.state === "ready" && <div className="ws-similar">
      <Table aria-label="Nearest builds" density="compact" data-table="nearest">
        <TableHeader><TableRow hoverable={false}>
          <TableHead>Player</TableHead><TableHead align="right">Height</TableHead><TableHead align="right">Wingspan</TableHead>
          <TableHead align="right">Diff</TableHead><TableHead align="right">Career D-DPM</TableHead><TableHead align="right">Distance</TableHead>
        </TableRow></TableHeader>
        <TableBody>
          {target && row(target, null, true)}
          {near.neighbours.map(n => row(n, n.distance))}
        </TableBody>
      </Table>
    </div>}
  </ResearchSection>;
}

function CombineDrills({ year }: { year: number }) {
  const { data, error, loading, retry } = useFeed([String(year)], signal => getCombine({ draftYear: year }, signal));
  // Drafted players take their drafting team's colour and logo in their rookie season.
  const rookie = `${year}-${String((year + 1) % 100).padStart(2, "0")}`;
  const pctSub = (key: string) => (r: CombineRow) => percentileText(r.percentiles[key]);
  const columns: ResearchColumn<CombineRow>[] = [
    { key: "pick", label: "Pick", title: "Overall pick and team", value: r => r.pick_overall, format: (v, r) => `#${v}${r.drafted_by ? ` ${r.drafted_by}` : ""}`, bar: false, width: "signed", unknown: () => "Undrafted or unknown" },
    { key: "reach", label: "Reach", title: "Standing reach", value: r => r.standing_reach_inches, format: v => lengthText(v, "ftin"), sub: pctSub("standing_reach_inches"), width: "signed" },
    { key: "weight", label: "Weight", title: "Weight", value: r => r.weight_lbs, format: v => `${fmt(v, 0)} lb`, bar: false, width: "signed" },
    { key: "vert", label: "Max Vert", title: "Max vertical leap", value: r => r.max_vertical_inches, format: v => `${fmt(v)}″`, sub: pctSub("max_vertical_inches"), width: "signed" },
    { key: "lane", label: "Lane Agility", title: "Lane agility time (lower is faster)", value: r => r.lane_agility_seconds, format: v => `${fmt(v, 2)} s`, sub: pctSub("lane_agility_seconds"), width: "signed" },
    { key: "sprint", label: "¾ Sprint", title: "Three-quarter-court sprint (lower is faster)", value: r => r.three_quarter_sprint_seconds, format: v => `${fmt(v, 2)} s`, sub: pctSub("three_quarter_sprint_seconds"), width: "signed" },
  ];
  return <ResearchSection id="drills" icon="gauge" title={`${year} Combine Drills`}>
    {error && <FeedFailure error={error} retry={retry} what="Combine drills" />}
    {loading && <FeedSkeleton label="Loading combine drills" />}
    {data && <ResearchTable<CombineRow> className="ws-table ws-drills" label="Combine drills" rows={data.rows} rowKey={r => r.row_key} name={r => r.player_name} season={rookie}
      team={r => r.drafted_by} teamFilter={false}
      player={r => r.player_id ? <PlayerIdentity playerId={r.player_id} name={r.player_name} team={r.drafted_by} era={seasonEra(rookie, r.drafted_by)} size="sm" href={`/players/${r.player_id}`} />
        : <span className="ws-unknown-id">{r.player_name}<small>Identity unknown</small></span>}
      views={[{ value: "drills", label: "Drills", columns }]} defaultSort="reach" noun="players"
      csv={{ filename: `courtlens-combine-${year}.csv`, columns: [
        { header: "nba_id", value: r => r.player_id }, { header: "player", value: r => r.player_name }, { header: "pick", value: r => r.pick_overall },
        { header: "standing_reach_in", value: r => r.standing_reach_inches }, { header: "weight_lb", value: r => r.weight_lbs },
        { header: "max_vertical_in", value: r => r.max_vertical_inches }, { header: "lane_agility_s", value: r => r.lane_agility_seconds },
        { header: "three_quarter_sprint_s", value: r => r.three_quarter_sprint_seconds },
      ] }} />}
  </ResearchSection>;
}

function CorrelationRows({ rows, position }: { rows: Correlation[]; position?: string }) {
  return <>{rows.map(c => { const partial = "controlling_for" in c; return <TableRow key={`${position ?? "all"}-${c.x}-${c.y}${partial ? "-partial" : ""}`} data-row={`${position ?? "all"}:${c.x}:${c.y}`}>
    {position && <TableCell data-field="position">{position}</TableCell>}
    <TableCell data-field="pair">{VAR_LABELS[c.x]} · {VAR_LABELS[c.y]}{partial ? " (height held fixed)" : ""}</TableCell>
    <TableCell numeric data-field="n" data-value={c.n}>{c.n.toLocaleString("en-US")}</TableCell>
    <TableCell numeric data-field="r" data-value={c.r ?? ""}>{signed(c.r, 2)}</TableCell>
    <TableCell numeric data-field="interval" data-low={c.low ?? ""} data-high={c.high ?? ""}>{rangeText(c.low, c.high, 2)}</TableCell>
    <TableCell data-field="verdict" data-value={c.verdict}>{VERDICT_LABELS[c.verdict]}</TableCell>
  </TableRow>; })}</>;
}

function Defense({ data }: { data: WingspanSummary }) {
  const primary = data.correlations[0];
  return <ResearchSection icon="shield" title="Wingspan and Defense">
    <p className="ws-headline" data-field="headline" data-value={primary.r ?? ""}>
      Longer arms for one&apos;s height go with better DARKO defense, modestly: wingspan minus height against career D-DPM is <strong>r {signed(primary.r, 2)}</strong> (95% {rangeText(primary.low, primary.high, 2)}, {primary.n.toLocaleString("en-US")} players).
      With height held fixed, wingspan&apos;s partial r is {signed(data.partial.r, 2)} (95% {rangeText(data.partial.low, data.partial.high, 2)}). A description, not a prediction or a cause.
    </p>
    <div className="ws-well ws-table-well">
      <Table aria-label="Correlations" density="compact" data-table="correlations">
        <TableHeader><TableRow hoverable={false}><TableHead>Pair</TableHead><TableHead align="right">Players</TableHead><TableHead align="right">r</TableHead><TableHead align="right">95% interval</TableHead><TableHead>Verdict</TableHead></TableRow></TableHeader>
        <TableBody><CorrelationRows rows={[...data.correlations, data.partial]} /></TableBody>
      </Table>
    </div>
    <h3 className="ws-subhead">Within Position</h3>
    <div className="ws-well ws-table-well">
      <Table aria-label="Correlations within position" density="compact" data-table="within-position">
        <TableHeader><TableRow hoverable={false}><TableHead>Position</TableHead><TableHead>Pair</TableHead><TableHead align="right">Players</TableHead><TableHead align="right">r</TableHead><TableHead align="right">95% interval</TableHead><TableHead>Verdict</TableHead></TableRow></TableHeader>
        <TableBody>{POSITIONS.map(pos => <CorrelationRows key={pos} position={pos} rows={data.within_position.filter(w => w.position === pos)} />)}</TableBody>
      </Table>
    </div>
  </ResearchSection>;
}

function Methodology({ data, details }: { data: WingspanSummary; details: ReactNode }) {
  const r = data.registration, pop = data.population;
  const now = data.current.state === "ready" ? `${data.current.season}, games through ${data.current.data_date}` : "unavailable";
  return <ResearchDisclosure id="methodology" icon="book" title="Caveats & Methodology">
    <MethodBlock title="Caveats">
      <ul className="ws-list">
        {data.caveats.map(c => <li key={c}>{c}</li>)}
        <li>Players who skipped the combine (Victor Wembanyama, Chet Holmgren, Dereck Lively II and others) have no measurements here and stay unknown; Databallr fills them from other sources.</li>
        <li>With Shoes is the height measured in shoes, never a fixed allowance; the 2000–2003 and 2023–2026 combines didn&apos;t measure it, so those players show “—”. Percentiles and correlations use barefoot height.</li>
        <li>D-DPM is DARKO&apos;s newest board ({now}); Active means on that board. Career D-DPM and its percentile cover the {pop.analysis.toLocaleString("en-US")} players in the correlations.</li>
        <li>Diff and D-DPM are gold above zero and blue below, as on Databallr: a sign, not a good or bad verdict.</li>
        <li>Positional averages and the scatter cover every measured player (the D-DPM scatter, the correlation population), whatever the filters.</li>
      </ul>
    </MethodBlock>
    <MethodBlock title="Who Is Counted">
      <p className="rs-card-text">{pop.players_with_person_id.toLocaleString("en-US")} combine participants since 2000 with an NBA person ID; {pop.measured.toLocaleString("en-US")} measured; {pop.analysis.toLocaleString("en-US")} with a career D-DPM.</p>
      <Table aria-label="Exclusions" density="compact" data-table="exclusions">
        <TableHeader><TableRow hoverable={false}><TableHead>Left out of the D-DPM correlations</TableHead><TableHead align="right">Players</TableHead></TableRow></TableHeader>
        <TableBody>{Object.entries(pop.exclusions).map(([k, n]) => <TableRow key={k} data-row={k}>
          <TableCell>{EXCLUSION_LABELS[k] ?? k}</TableCell><TableCell numeric data-field="count" data-value={n}>{n.toLocaleString("en-US")}</TableCell>
        </TableRow>)}</TableBody>
      </Table>
    </MethodBlock>
    <MethodBlock title="Positional Averages with Intervals">
      <p className="rs-card-text">First listed combine position; inches and pounds; 95% bootstrap intervals over players. Career D-DPM averages the rated players.</p>
      <Table aria-label="Positional averages" density="compact" data-table="positional-averages">
        <TableHeader><TableRow hoverable={false}>
          <TableHead>Position</TableHead><TableHead align="right">Players</TableHead><TableHead align="right">Height</TableHead><TableHead align="right">Wingspan</TableHead>
          <TableHead align="right">Diff</TableHead><TableHead align="right">Weight</TableHead><TableHead align="right">Rated</TableHead><TableHead align="right">Career D-DPM</TableHead>
        </TableRow></TableHeader>
        <TableBody>{data.positional_averages.map(a => <TableRow key={a.position} data-row={a.position}>
          <TableCell data-field="position">{a.position === "ALL" ? "All" : a.position}</TableCell>
          <TableCell numeric data-field="measured" data-value={a.height.n}>{a.height.n.toLocaleString("en-US")}</TableCell>
          {(["height", "wingspan", "diff", "weight", "d_dpm"] as const).flatMap(v => {
            const cell = <TableCell key={v} numeric data-field={v} data-value={a[v].mean ?? ""} data-low={a[v].low ?? ""} data-high={a[v].high ?? ""} data-n={a[v].n}>
              {meanText(v, a[v])}<br /><small>{rangeText(a[v].low, a[v].high, v === "weight" ? 1 : 2)}</small></TableCell>;
            return v === "d_dpm" ? [<TableCell key="rated" numeric data-field="rated" data-value={a.d_dpm.n}>{a.d_dpm.n.toLocaleString("en-US")}</TableCell>, cell] : [cell];
          })}
        </TableRow>)}</TableBody>
      </Table>
    </MethodBlock>
    <MethodBlock title="Method & Reproducibility">
      <dl className="ws-dl">
        <dt>Career D-DPM</dt><dd>Minutes-weighted mean of DARKO&rsquo;s season-end regular-season D-DPM over seasons with at least {r.parameters.min_season_minutes} minutes, {data.darko_seasons?.[0]} to {data.darko_seasons?.[1]}.</dd>
        <dt>Similar profiles</dt><dd>The {data.nearest.k} measured players closest in barefoot height and wingspan, each standardized over all {pop.measured.toLocaleString("en-US")} measured players (height {fixed(data.nearest.scaling.height?.mean, 2)} ± {fixed(data.nearest.scaling.height?.sd, 2)} in, wingspan {fixed(data.nearest.scaling.wingspan?.mean, 2)} ± {fixed(data.nearest.scaling.wingspan?.sd, 2)} in); Euclidean distance.</dd>
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
  const scope: Scope = { status, position, shoes: get("shoes") === "1", units: get("units") === "in" ? "in" : "ftin", year: Number.isInteger(yearParam) && yearParam > 0 ? yearParam : null };
  const rows = useMemo(() => !data ? [] : data.players.filter(p => p.measured
    && (status === "all" || (status === "active" ? p.active === true : p.active === false))
    && (!position || p.position === position)
    && (scope.year == null || p.combine_year === scope.year)), [data, status, position, scope.year]);
  const byId = useMemo(() => new Map((data?.players ?? []).map(p => [p.player_id, p])), [data]);
  const overlay = (get("overlay") ?? "").split(",").filter(id => byId.get(id)?.measured).slice(0, OVERLAY_MAX);
  const build = get("build");
  const buildId = build && build !== NONE && byId.has(build) ? build : null;
  const longest = useMemo(() => [...rows].sort((a, b) => (b.wingspan ?? 0) - (a.wingspan ?? 0) || a.player_id.localeCompare(b.player_id))[0], [rows]);
  if (error) return <div className="rs-column ws-page"><FeedFailure error={error} retry={retry} what="Wingspan measurements" /></div>;
  if (loading || !data) return <div className="rs-column ws-page"><FeedSkeleton label="Loading wingspan measurements" /></div>;
  const details = <DataDetailsButton rows={[
    { label: "Registration", value: `${data.registration.identity} · ${data.registration.content_sha256}`, mono: true },
    { label: "Results SHA-256", value: data.registration.results_sha256, mono: true },
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
    <Scatter data={data} units={scope.units} highlighted={[...overlay, ...(buildId ? [buildId] : [])]} set={set} get={get} />
    <SimilarProfiles data={data} playerId={buildId} fallback={longest} units={scope.units} onPick={id => set({ build: id })} onClear={() => set({ build: NONE })} />
    {scope.year != null && <CombineDrills year={scope.year} />}
    <Defense data={data} />
    <Methodology data={data} details={details} />
    <p className="ws-sources">Data: NBA Draft Combine via hoopR; DARKO by Kostya Medvedovsky. Design after Databallr&apos;s Wingspan Database.</p>
  </div>;
}
