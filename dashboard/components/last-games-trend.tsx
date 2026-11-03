"use client";

import { useEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent } from "react";
import type { PlayerGameLogItem } from "@/lib/types";
import { LAST_GAMES_STATS, formatStat, rolling, type Exposure, type LastGamesStat } from "@/lib/last-games";
import { formatDate } from "@/lib/format-date";
import { niceStep, smoothPath } from "./stats-trend-dialog";
import { CourtLensWordmark } from "./courtlens-wordmark";
import { Button, IconButton, Select } from "./ui/kit";

const LEFT = 44, RIGHT = 44, TOP = 24, BOTTOM = 32;
/** Follow-up 20: up to four lines stay readable on two axes. */
export const MAX_TREND_STATS = 4;
const DEFAULT_TREND = ["pts", "ast"];
/** The order "Add Stat" offers the next unchosen stat in. */
const ADD_ORDER = ["reb", "ts", "pm", "mpg", "fta", "3p", "tov", "stl", "blk"];

const short = (date: string) => new Date(`${date}T00:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });

/** The chart's stats from the URL (`trend=pts,ast,ts`), unique, at most four; Databallr's PTS and AST by default. */
export function trendStats(param: string | null): LastGamesStat[] {
  const keys = [...new Set((param ?? "").split(",").filter(key => LAST_GAMES_STATS.some(s => s.key === key)))].slice(0, MAX_TREND_STATS);
  return (keys.length ? keys : DEFAULT_TREND).map(key => LAST_GAMES_STATS.find(s => s.key === key)!);
}

/** Round axis ticks with headroom, so no line sits on the frame. */
function axis(values: number[]) {
  const low = Math.min(...values), high = Math.max(...values);
  const pad = (high - low || Math.abs(high) || 1) * 0.1;
  const step = niceStep((high - low + 2 * pad) / 3);
  const min = Math.floor((low - pad) / step) * step, max = Math.ceil((high + pad) / step) * step;
  return { min, max, ticks: Array.from({ length: Math.round((max - min) / step) + 1 }, (_, i) => min + i * step) };
}

function segments(values: (number | null)[], x: (i: number) => number, y: (v: number) => number) {
  // A game with no value breaks the line; a gap is unknown, not zero.
  const out: { x: number; y: number }[][] = [[]];
  values.forEach((value, index) => {
    if (value === null) { if (out.at(-1)!.length) out.push([]); return; }
    out.at(-1)!.push({ x: x(index), y: y(value) });
  });
  return out.filter(segment => segment.length > 1);
}

const unit = (stat: LastGamesStat) => stat.kind === "pct" ? "pct" : "count";

/**
 * Databallr's rolling trend: smoothed moving averages of up to four stats. Two stats get an axis
 * each, as on Databallr; three or four share an axis per unit (counts left, rates right). The
 * average follows the games window (follow-up 22), so each line ends on the comparison's Last N
 * value and the shaded band is those N games.
 */
export function LastGamesTrend({ name, games, windowStart, mode, stats: param, size, onChange, marked = null, onHover }: {
  name: string; games: PlayerGameLogItem[]; windowStart: string | null; mode: Exposure;
  stats: string | null; size: number; onChange: (updates: Record<string, string | null>) => void;
  /** Follow-up 26: the game hovered in the log, marked here; this chart's hover is reported back. */
  marked?: string | null; onHover?: (gameId: string | null) => void;
}) {
  const [own, setOwn] = useState<number | null>(null);
  const setHover = (index: number | null) => { if (index === own) return; setOwn(index); onHover?.(index === null ? null : games[index]?.game_id ?? null); };
  const markedIndex = marked ? games.findIndex(g => g.game_id === marked) : -1;
  const hover = own ?? (markedIndex >= 0 ? markedIndex : null);
  const svgRef = useRef<SVGSVGElement>(null);
  const plotRef = useRef<HTMLDivElement>(null);
  // Drawn at the plot's own pixel width, so tick text keeps its type size on a phone.
  const [W, setW] = useState(1200);
  useEffect(() => {
    const node = plotRef.current;
    if (!node) return;
    const observer = new ResizeObserver(([entry]) => { const width = Math.round(entry.contentRect.width); if (width > 0) setW(width); });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);
  const H = W < 600 ? 240 : 320;
  const roll = Math.max(1, Math.round(size) || 1);
  const stats = useMemo(() => trendStats(param), [param]);
  const series = useMemo(() => stats.map(stat => rolling(games, stat, roll, mode)), [stats, games, roll, mode]);
  const n = games.length;
  const x = (i: number) => LEFT + (n > 1 ? i / (n - 1) : 0.5) * (W - LEFT - RIGHT);

  // Axis groups: one per stat with two or fewer, else one per unit, the first stat's on the left.
  const groups: number[][] = stats.length <= 2 ? stats.map((_, i) => [i])
    : [unit(stats[0]), ...new Set(stats.map(unit))].filter((u, i, all) => all.indexOf(u) === i)
      .map(u => stats.flatMap((s, i) => unit(s) === u ? [i] : []));
  const axes = groups.map(members => {
    const values = members.flatMap(i => series[i]).filter((v): v is number => v !== null && Number.isFinite(v));
    if (!values.length) return null;
    const ax = axis(values);
    return { ...ax, members, y: (v: number) => TOP + (ax.max - v) / (ax.max - ax.min) * (H - TOP - BOTTOM) };
  });
  const axisOf = (i: number) => axes[groups.findIndex(g => g.includes(i))];
  const left = axes[0], right = axes[1];
  const tickText = (members: number[], v: number) => stats[members[0]].kind === "pct" ? `${Math.round(v * 100)}%` : String(Number(v.toFixed(1)));
  // Ticks take their line's colour when an axis has one line; shared axes stay neutral.
  const tone = (members: number[]) => members.length === 1 ? String(members[0] + 1) : undefined;

  const every = Math.max(1, Math.ceil(n / Math.max(3, Math.floor((W - LEFT - RIGHT) / 64))));
  const windowIndex = windowStart ? games.findIndex(g => g.game_date >= windowStart) : -1;
  const breaks = games.flatMap((g, i) => i > 0 && g.season !== games[i - 1].season ? [i] : []);
  // A team change inside a season is marked too, so a trade lines up with any shift in the lines.
  const moves = games.flatMap((g, i) => i > 0 && g.season === games[i - 1].season && g.team_id !== games[i - 1].team_id ? [i] : []);
  const onMove = (event: PointerEvent<SVGRectElement>) => {
    const box = svgRef.current?.getBoundingClientRect();
    if (!box || n === 0) return;
    const px = (event.clientX - box.left) / box.width * W;
    setHover(Math.max(0, Math.min(n - 1, Math.round((px - LEFT) / Math.max(1, W - LEFT - RIGHT) * (n - 1)))));
  };
  const hovered = hover !== null ? games[hover] : null;
  const title = `Rolling Trend Chart (${roll}-game moving average)`;
  const write = (keys: string[]) => onChange({ trend: keys.join(",") === DEFAULT_TREND.join(",") ? null : keys.join(","), s1: null, s2: null });
  const keys = stats.map(s => s.key);
  const next = [...ADD_ORDER, ...LAST_GAMES_STATS.map(s => s.key)].find(key => !keys.includes(key));

  return <section className="lg-trend player-glass" aria-label={title}>
    <header className="lg-trend-head">
      <div><h2>{title}</h2>
        <p>Uses your games window: each line ends on the table&apos;s Last {roll} value.</p></div>
      <div className="lg-trend-controls" role="group" aria-label="Chart stats">
        {stats.map((stat, i) => <div key={`${i}-${stat.key}`} className="lg-trend-stat" data-series={i + 1}>
          <span className="lg-trend-swatch" aria-hidden="true" />
          <Select size="sm" aria-label={`Stat ${i + 1}`} value={stat.key} onChange={event => write(keys.map((k, j) => j === i ? event.target.value : k).filter((k, j, all) => all.indexOf(k) === j))}>
            {LAST_GAMES_STATS.map(s => <option key={s.key} value={s.key} disabled={s.key !== stat.key && keys.includes(s.key)}>{s.label}</option>)}
          </Select>
          {stats.length > 1 && <IconButton size="sm" variant="ghost" icon="close" label={`Remove ${stat.label}`} onClick={() => write(keys.filter((_, j) => j !== i))} />}
        </div>)}
        {stats.length < MAX_TREND_STATS && next && <Button size="sm" variant="text" icon="plus" onClick={() => write([...keys, next])}>Add Stat</Button>}
      </div>
    </header>
    <figure className="lg-trend-figure">
      <figcaption className="lg-trend-caption">
        <span className="lg-trend-brand"><CourtLensWordmark height={16} /><span>{name} · {roll} Game Rolling Average Chart</span></span>
        <span className="lg-trend-legend">{stats.map((stat, i) => <span key={stat.key} data-series={i + 1}>{stat.label}</span>)}</span>
      </figcaption>
      <div className="lg-trend-plot" ref={plotRef}>
        <svg ref={svgRef} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${name}: ${roll}-game rolling ${stats.map(s => s.label).join(", ")} over ${n} games`}>
          {windowIndex >= 0 && <g className="lg-trend-window">
            <rect x={x(windowIndex) - (n > 1 ? (W - LEFT - RIGHT) / (n - 1) / 2 : 0)} y={TOP} width={W - RIGHT - x(windowIndex) + (n > 1 ? (W - LEFT - RIGHT) / (n - 1) / 2 : 0)} height={H - TOP - BOTTOM} />
            <text x={W - RIGHT - 4} y={TOP + 14} textAnchor="end">Last {n - windowIndex}</text>
          </g>}
          {left && <g className="lg-trend-grid" data-series={tone(left.members)}>
            {left.ticks.map(t => <g key={`l${t}`}><line x1={LEFT} x2={W - RIGHT} y1={left.y(t)} y2={left.y(t)} />
              <text x={LEFT - 10} y={left.y(t)} dy="0.32em" textAnchor="end">{tickText(left.members, t)}</text></g>)}
          </g>}
          {right && <g className="lg-trend-grid" data-series={tone(right.members)}>
            {right.ticks.map(t => <text key={`r${t}`} x={W - RIGHT + 10} y={right.y(t)} dy="0.32em">{tickText(right.members, t)}</text>)}
          </g>}
          {/* Shared axes name their stats, so no line is read against the wrong scale. */}
          {stats.length > 2 && left && <text className="lg-trend-axis-name" x={4} y={TOP - 10}>{left.members.map(i => stats[i].label).join(" · ")}</text>}
          {stats.length > 2 && right && <text className="lg-trend-axis-name" x={W - 4} y={TOP - 10} textAnchor="end">{right.members.map(i => stats[i].label).join(" · ")}</text>}
          {breaks.length > 0 && <g className="lg-trend-break"><text x={LEFT + 6} y={TOP + 14}>{games[0].season}</text></g>}
          {moves.map(i => <g key={`m${i}`} className="lg-trend-break"><line x1={(x(i) + x(i - 1)) / 2} x2={(x(i) + x(i - 1)) / 2} y1={TOP} y2={H - BOTTOM} />
            <text x={(x(i) + x(i - 1)) / 2 + 6} y={H - BOTTOM - 8}>Joined {games[i].team_tricode}</text></g>)}
          {breaks.map(i => <g key={`b${i}`} className="lg-trend-break"><line x1={(x(i) + x(i - 1)) / 2} x2={(x(i) + x(i - 1)) / 2} y1={TOP} y2={H - BOTTOM} />
            <text x={(x(i) + x(i - 1)) / 2 + 6} y={TOP + 14}>{games[i].season}</text></g>)}
          {games.map((g, i) => (i === n - 1 || (i % every === 0 && n - 1 - i >= every)) &&
            <text key={g.game_id} className="lg-trend-axis" x={x(i)} y={H - 14} textAnchor="middle">{short(g.game_date)}</text>)}
          {series.map((values, i) => { const ax = axisOf(i); return ax ? <g key={stats[i].key} className="lg-trend-series" data-series={i + 1}>
            {segments(values, x, ax.y).map((s, j) => <path key={j} d={smoothPath(s)} />)}</g> : null; })}
          {hover !== null && <g className="lg-trend-hover">
            <line x1={x(hover)} x2={x(hover)} y1={TOP} y2={H - BOTTOM} />
            {series.map((values, i) => { const ax = axisOf(i), v = values[hover]; return ax && v !== null ? <circle key={stats[i].key} data-series={i + 1} cx={x(hover)} cy={ax.y(v)} r={5} /> : null; })}
          </g>}
          <rect className="lg-trend-capture" x={LEFT} y={TOP} width={W - LEFT - RIGHT} height={H - TOP - BOTTOM}
            onPointerMove={onMove} onPointerDown={onMove} onPointerLeave={() => setHover(null)} />
        </svg>
        {hovered && hover !== null && <div className="lg-trend-tip" role="status" data-side={hover > n / 2 ? "left" : "right"} style={{ "--x": `${x(hover) / W * 100}%` } as CSSProperties}>
          <strong>{formatDate(hovered.game_date)} {hovered.side === "away" ? "@" : "vs"} {hovered.opponent_tricode}</strong>
          {stats.map((stat, i) => <span key={stat.key} data-series={i + 1}>{stat.label} {formatStat(stat, series[i][hover])}</span>)}
        </div>}
      </div>
    </figure>
  </section>;
}
