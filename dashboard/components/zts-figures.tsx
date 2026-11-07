"use client";

import { useMemo, useState, type CSSProperties, type ReactNode } from "react";
import { PlayerPortrait } from "./player-portrait";
import { Icon } from "./ui/icon";
import { teamStyle } from "./ui/identity";
import { Button, IconButton, Select } from "./ui/kit";
import { LookupInput } from "./lookup-input";
import { seasonEra } from "@/lib/portrait-source";
import type { LookupItem } from "@/lib/types";
import {
  FAMILIES, density, familyTs, formatNumber, formatPoints, formatShare, formatSigned, formatTs, signTone,
  type LeagueType, type PlayerType, type ValidationBlock, type ZtsRow,
} from "@/lib/zts";

/*
 * RD03 figures for Research → zTS, after Databallr's zTS explainer: the league play-type bars, the pair mix and its
 * Expected TS panel, the side-by-side card, the difficulty histogram, the X/Y explorer, the players-vs-teams spread
 * and the registered test. Signs use the identity tones (gold above zero, blue below) because no per-player interval
 * is served; only the registered test, whose intervals exclude zero, is green or red. Exact values sit on `data-*`.
 */

const vars = (v: Record<string, string | number>) => v as CSSProperties;
const known = (v: number | null | undefined): v is number => typeof v === "number" && Number.isFinite(v);
const int = (n: number) => n.toLocaleString("en-US");

/** A titled panel (Databallr's lighter panel with a soft rim); children are one level deep. */
export function Panel({ title, kicker, aside, children, className = "", label }: { title?: ReactNode; kicker?: ReactNode; aside?: ReactNode; children: ReactNode; className?: string; label?: string }) {
  return <div className={`zt-panel ${className}`} role={label ? "group" : undefined} aria-label={label}>
    {(title || kicker || aside) && <div className="zt-panel-head">
      <div className="zt-panel-titles">{kicker && <p className="zt-kicker">{kicker}</p>}{title && <h3 className="zt-panel-title">{title}</h3>}</div>
      {aside && <div className="zt-panel-aside">{aside}</div>}
    </div>}
    {children}
  </div>;
}

/** Inline metric name in Databallr's code chip. */
export const Code = ({ children }: { children: ReactNode }) => <code className="zt-code">{children}</code>;

// ---- League TS by play type --------------------------------------------------------------------

export function LeagueTypes({ season, ts, types }: { season: string; ts: number; types: readonly LeagueType[] }) {
  const rows = [...types].sort((a, b) => a.ts - b.ts);
  const top = Math.max(...rows.map(t => Math.abs(t.ts - ts)), 1e-9);
  return <Panel kicker={`${season} league play-type TS`} className="zt-league" label={`${season} league play-type TS`}>
    <ul className="zt-league-rows" aria-label={`${season} league TS by play type, relative to the league's ${formatTs(ts)}`}>
      {rows.map(t => {
        const diff = t.ts - ts, w = (Math.abs(diff) / top) * 50;
        return <li key={t.play_type} className="zt-league-row" data-type={t.play_type} data-value={t.ts} data-share={t.share}>
          <span className="zt-league-label">{t.label}</span>
          <span className="zt-league-value">{formatTs(t.ts)} <span className="zt-league-diff" data-identity={signTone(diff)}>({formatPoints(diff)})</span></span>
          <span className="zt-track" aria-hidden="true"><span className="zt-track-mid" />
            <span className="zt-track-fill" data-identity={signTone(diff)} style={vars({ "--from": `${diff < 0 ? 50 - w : 50}%`, "--w": `${w}%` })} /></span>
        </li>;
      })}
    </ul>
    <div className="zt-league-avg" data-value={ts}><span className="zt-avg-pill">{formatTs(ts)}</span><span className="zt-avg-label">League average play-type TS</span></div>
    <ul className="zt-families" aria-label="Play-type families">
      {FAMILIES.map(f => { const v = familyTs(types, f.types); return <li key={f.key} className="zt-family" data-family={f.key} data-identity={signTone(v === null ? null : v - ts)} data-value={v ?? undefined}>{f.label} {formatTs(v)}</li>; })}
    </ul>
  </Panel>;
}

// ---- The pair: mix, Expected TS and the side-by-side card ---------------------------------------

export interface PairSide { row: ZtsRow; types: readonly PlayerType[] | null }

export function PairMix({ season, order, a, b }: { season: string; order: readonly LeagueType[]; a: PairSide; b: PairSide }) {
  const share = (side: PairSide, key: string) => side.types ? side.types.find(t => t.play_type === key)?.share ?? null : undefined;
  const all = order.flatMap(t => [share(a, t.play_type), share(b, t.play_type)]).filter(known);
  const step = Math.max(5, Math.ceil(Math.max(0.05, ...all) * 100 / 4 / 5) * 5);
  const max = step * 4;
  const label = (v: number | null | undefined) => v === undefined ? "loading" : v === null ? "not listed" : formatShare(v);
  return <Panel title="Playtype mix" className="zt-mix" label={`Playtype mix, ${season}`}
    aside={<ul className="zt-legend" aria-label="Players"><li data-series="a">{a.row.player_name}</li><li data-series="b">{b.row.player_name}</li></ul>}>
    <ul className="zt-mix-rows">
      {order.map(t => {
        const sa = share(a, t.play_type), sb = share(b, t.play_type);
        return <li key={t.play_type} className="zt-mix-row" data-type={t.play_type} role="img"
          aria-label={`${t.label}, league TS ${formatTs(t.ts)}: ${a.row.player_name} ${label(sa)}, ${b.row.player_name} ${label(sb)}`}>
          <span className="zt-mix-label">{t.label}</span><span className="zt-mix-league">{formatTs(t.ts)}</span>
          <span className="zt-mix-bars" aria-hidden="true">
            {([["a", sa], ["b", sb]] as const).map(([series, v]) => <span key={series} className="zt-mix-bar" data-series={series} data-value={known(v) ? v : undefined}>
              <span className="zt-mix-fill" style={vars({ "--w": `${known(v) ? Math.min(100, v * 100 / max * 100) : 0}%` })} />
              <span className="zt-mix-num">{known(v) ? (v * 100).toFixed(1) : "—"}</span>
            </span>)}
          </span>
        </li>;
      })}
    </ul>
    <div className="zt-mix-axis" aria-hidden="true">{[0, 1, 2, 3, 4].map(i => <span key={i}>{step * i}%</span>)}</div>
  </Panel>;
}

export function ExpectedPanel({ leagueTs, a, b }: { leagueTs: number; a: ZtsRow; b: ZtsRow }) {
  const short = (row: ZtsRow) => row.player_name.split(" ").slice(-1)[0];
  return <Panel className="zt-expected" label="Expected TS and Playtype Difficulty">
    <div className="zt-expected-half">
      <h3 className="zt-panel-title">Expected TS</h3>
      <p className="zt-panel-sub">Playtype-weighted league TS</p>
      <div className="zt-wells" data-count="3">
        <div className="zt-well" data-field="league"><span className="zt-well-label">League</span><span className="zt-well-value" data-value={leagueTs}>{formatTs(leagueTs)}</span></div>
        {([["a", a], ["b", b]] as const).map(([s, row]) => <div key={s} className="zt-well" data-series={s} data-row={row.player_id}>
          <span className="zt-well-label">{short(row)}</span><span className="zt-well-value" data-field="expected_ts" data-value={row.expected_ts ?? undefined}>{formatTs(row.expected_ts)}</span></div>)}
      </div>
    </div>
    <div className="zt-expected-half">
      <h3 className="zt-panel-title">Playtype Difficulty</h3>
      <p className="zt-panel-sub">League TS − Expected TS; harder role = positive</p>
      <div className="zt-wells" data-count="2">
        {[a, b].map(row => <div key={row.player_id} className="zt-well" data-row={row.player_id}>
          <span className="zt-well-value zt-well-big" data-field="difficulty" data-value={row.difficulty ?? undefined} data-identity={signTone(row.difficulty)}>{formatPoints(row.difficulty)}</span>
          <span className="zt-well-label">{short(row)}: {known(row.difficulty) && row.difficulty > 0 ? "harder role" : known(row.difficulty) && row.difficulty < 0 ? "easier role" : "average role"}</span></div>)}
      </div>
    </div>
  </Panel>;
}

const COMPARE_ROWS = [
  { key: "scoring_usage", label: "Usage", text: (r: ZtsRow) => formatNumber(r.scoring_usage), tone: () => undefined },
  { key: "rts", label: "rTS", text: (r: ZtsRow) => formatPoints(r.rts), tone: (r: ZtsRow) => signTone(r.rts) },
  { key: "difficulty", label: "Role", text: (r: ZtsRow) => formatPoints(r.difficulty), tone: (r: ZtsRow) => signTone(r.difficulty) },
  { key: "zts", label: "zTS", text: (r: ZtsRow) => formatPoints(r.zts), tone: (r: ZtsRow) => signTone(r.zts) },
] as const;

/** The season's served players as search candidates (only they have the four fields the card shows). */
export function compareCandidates(season: string, players: readonly ZtsRow[]): LookupItem[] {
  return players.map(r => {
    const team = r.teams[0];
    return {
      id: r.player_id, kind: "player", canonical_id: r.player_id, display_name: r.player_name,
      subtitle: r.teams.map(t => t.tricode ?? t.team_id).join(" · ") || null,
      match_basis: "substring", match_score: 0, destination_url: `/players/${r.player_id}?season=${season}`,
      availability: { has_current_season: true, status: "served", seasons: [season], latest_team_id: team?.team_id ?? null, latest_tricode: team?.tricode ?? null },
    } satisfies LookupItem;
  });
}

export function CompareCard({ season, a, b, players, onPick }: { season: string; a: ZtsRow; b: ZtsRow; players: readonly ZtsRow[]; onPick: (side: "a" | "b", id: string) => void }) {
  const [open, setOpen] = useState<"a" | "b" | null>(null);
  const [text, setText] = useState("");
  const candidates = useMemo(() => compareCandidates(season, players), [season, players]);
  const toggle = (s: "a" | "b") => { setText(""); setOpen(o => o === s ? null : s); };
  const side = (row: ZtsRow, s: "a" | "b") => {
    const team = row.teams[0]?.tricode ?? null;
    return <div className="zt-compare-side" data-series={s} data-row={row.player_id}>
      <span className="zt-photo" style={teamStyle(team)}><PlayerPortrait playerId={row.player_id} name={row.player_name} size="md" era={seasonEra(season, team)} /></span>
      <span className="zt-compare-name">{row.player_name}</span>
      <Button size="sm" variant="secondary" icon="search" pressed={open === s} aria-expanded={open === s} aria-label={`Change player ${s.toUpperCase()}`} onClick={() => toggle(s)}>Change</Button>
    </div>;
  };
  return <div className="zt-compare-wrap">
    <div className="zt-compare" data-pair="true">
      {side(a, "a")}
      <dl className="zt-compare-rows">
        {COMPARE_ROWS.map(m => <div key={m.key} className="zt-compare-row" data-field={m.key}>
          <dd className="zt-compare-val" data-row={a.player_id} data-value={a[m.key] ?? undefined} data-identity={m.tone(a)}>{m.text(a)}</dd>
          <dt className="zt-compare-label">{m.label}</dt>
          <dd className="zt-compare-val" data-row={b.player_id} data-value={b[m.key] ?? undefined} data-identity={m.tone(b)}>{m.text(b)}</dd>
        </div>)}
      </dl>
      {side(b, "b")}
    </div>
    {open && <div className="zt-compare-search" data-side={open}>
      <LookupInput label={`Search for player ${open.toUpperCase()}`} placeholder={`Search ${int(candidates.length)} players with a ${season} zTS`}
        value={text} onChange={setText} kinds={["player"]} candidates={candidates} excludedIds={[a.player_id, b.player_id]} limit={8} autoFocus
        onSelect={item => { onPick(open, item.canonical_id); setText(""); setOpen(null); }} />
      <IconButton size="md" variant="ghost" icon="close" label="Close player search" onClick={() => setOpen(null)} />
    </div>}
  </div>;
}

// ---- Distribution -------------------------------------------------------------------------------

export interface Bin { from: number; to: number; count: number }

export function Histogram({ bins, median, selected, onSelect }: { bins: readonly Bin[]; median: number | null; selected: number | null; onSelect: (from: number | null) => void }) {
  const max = Math.max(1, ...bins.map(b => b.count));
  const w = 640 / Math.max(1, bins.length);
  return <div className="zt-hist">
    <div className="zt-hist-head">
      <ul className="zt-legend" aria-label="Colour key"><li data-identity="b">Easier role</li><li data-identity="a">Harder role</li></ul>
      <span className="zt-hist-median" data-value={median ?? undefined}>Median {formatSigned(median)}</span>
    </div>
    <svg className="zt-hist-svg" viewBox="0 0 680 270" role="img"
      aria-label={`Playtype Difficulty histogram: ${bins.map(b => `${b.from} to ${b.to}: ${b.count}`).join(", ")}`}>
      {bins.map((bin, i) => {
        const h = (bin.count / max) * 200, x = 20 + i * w;
        const tone = bin.from >= 0 ? "a" : "b";
        return <g key={bin.from} className="zt-hist-bin" data-bin={bin.from} data-count={bin.count} data-selected={selected === bin.from || undefined}
          onClick={() => onSelect(selected === bin.from ? null : bin.from)}>
          <title>{`${bin.from} to ${bin.to}: ${bin.count} players`}</title>
          <rect className="zt-hist-hit" x={x} y={10} width={w} height={226} />
          <rect className="zt-hist-bar" data-identity={tone} x={x + 3} y={226 - Math.max(h, 3)} width={Math.max(1, w - 6)} height={Math.max(h, 3)} rx={4} />
          <text className="zt-svg-num" x={x + w / 2} y={220 - Math.max(h, 3)} textAnchor="middle">{bin.count}</text>
          <text className="zt-svg-tick" x={x} y={252} textAnchor="middle">{bin.from}</text>
        </g>;
      })}
      {bins.length > 0 && <text className="zt-svg-tick" x={20 + bins.length * w} y={252} textAnchor="middle">{bins.at(-1)!.to}</text>}
      <line className="zt-svg-axis" x1="20" x2={20 + bins.length * w} y1="236" y2="236" />
    </svg>
  </div>;
}

// ---- X/Y explorer -------------------------------------------------------------------------------

export const AXES = [
  { value: "rts", label: "rTS", get: (r: ZtsRow) => known(r.rts) ? r.rts * 100 : null, unit: "pts" },
  { value: "difficulty", label: "Role", get: (r: ZtsRow) => known(r.difficulty) ? r.difficulty * 100 : null, unit: "pts" },
  { value: "zts", label: "zTS", get: (r: ZtsRow) => known(r.zts) ? r.zts * 100 : null, unit: "pts" },
  { value: "scoring_usage", label: "Usage", get: (r: ZtsRow) => r.scoring_usage, unit: "usage" },
  { value: "zts_add", label: "zTS add/100", get: (r: ZtsRow) => r.zts_add, unit: "add" },
] as const;
export type Axis = (typeof AXES)[number]["value"];

const nice = (lo: number, hi: number) => {
  const span = Math.max(hi - lo, 1e-9), raw = span / 6, mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map(m => m * mag).find(s => s >= raw) ?? raw;
  const from = Math.floor(lo / step) * step, to = Math.ceil(hi / step) * step;
  return { from, to, ticks: Array.from({ length: Math.round((to - from) / step) + 1 }, (_, i) => from + i * step) };
};

export function Explorer({ season, rows, x, y, onAxes }: { season: string; rows: readonly ZtsRow[]; x: Axis; y: Axis; onAxes: (x: Axis, y: Axis) => void }) {
  const ax = AXES.find(a => a.value === x)!, ay = AXES.find(a => a.value === y)!;
  const points = useMemo(() => rows.map(r => ({ r, x: ax.get(r), y: ay.get(r) })).filter((p): p is { r: ZtsRow; x: number; y: number } => known(p.x) && known(p.y)), [rows, ax, ay]);
  const sx = nice(Math.min(0, ...points.map(p => p.x)), Math.max(0, ...points.map(p => p.x)));
  const sy = nice(Math.min(0, ...points.map(p => p.y)), Math.max(0, ...points.map(p => p.y)));
  const W = 680, H = 460, L = 52, R = 16, T = 16, B = 44;
  const px = (v: number) => L + (v - sx.from) / (sx.to - sx.from) * (W - L - R);
  const py = (v: number) => H - B - (v - sy.from) / (sy.to - sy.from) * (H - T - B);
  const sameUnits = ax.unit === "pts" && ay.unit === "pts";
  const lo = Math.max(sx.from, sy.from), hi = Math.min(sx.to, sy.to);
  return <Panel className="zt-explorer" label={`X/Y explorer, ${season}`}
    title={<span className="zt-axes">
      <span className="zt-axis-pick"><span className="zt-axis-name" aria-hidden="true">X</span><Select size="sm" aria-label="X axis" value={x} onChange={e => onAxes(e.target.value as Axis, y)}>{AXES.map(a => <option key={a.value} value={a.value}>{a.label}</option>)}</Select></span>
      <span className="zt-axis-vs" aria-hidden="true">vs</span>
      <span className="zt-axis-pick"><span className="zt-axis-name" aria-hidden="true">Y</span><Select size="sm" aria-label="Y axis" value={y} onChange={e => onAxes(x, e.target.value as Axis)}>{AXES.map(a => <option key={a.value} value={a.value}>{a.label}</option>)}</Select></span>
    </span>}
    aside={<span className="zt-panel-note">{season}</span>}>
    <svg className="zt-scatter" viewBox={`0 0 ${W} ${H}`} role="img" data-points={points.length}
      aria-label={`${ay.label} against ${ax.label} for ${points.length} players with a served zTS in ${season}; gold Role +1 or more, blue −1 or less`}>
      {sx.ticks.map(t => <g key={`x${t}`}><line className="zt-svg-grid" x1={px(t)} x2={px(t)} y1={T} y2={H - B} /><text className="zt-svg-tick" x={px(t)} y={H - B + 18} textAnchor="middle">{t > 0 ? `+${t}` : t}</text></g>)}
      {sy.ticks.map(t => <g key={`y${t}`}><line className="zt-svg-grid" x1={L} x2={W - R} y1={py(t)} y2={py(t)} /><text className="zt-svg-tick" x={L - 8} y={py(t) + 4} textAnchor="end">{t > 0 ? `+${t}` : t}</text></g>)}
      <line className="zt-svg-zero" x1={px(0)} x2={px(0)} y1={T} y2={H - B} />
      <line className="zt-svg-zero" x1={L} x2={W - R} y1={py(0)} y2={py(0)} />
      {sameUnits && x !== y && hi > lo && <line className="zt-svg-diagonal" x1={px(lo)} y1={py(lo)} x2={px(hi)} y2={py(hi)} />}
      {points.map(p => {
        const role = known(p.r.difficulty) ? p.r.difficulty * 100 : 0;
        return <circle key={p.r.player_id} className="zt-dot" data-row={p.r.player_id} data-identity={role >= 1 ? "a" : role <= -1 ? "b" : undefined} cx={px(p.x)} cy={py(p.y)} r={6}>
          <title>{`${p.r.player_name}: ${ax.label} ${formatSigned(p.x)}, ${ay.label} ${formatSigned(p.y)}`}</title>
        </circle>;
      })}
      <text className="zt-svg-label" x={(L + W - R) / 2} y={H - 6} textAnchor="middle">{ax.label}</text>
      <text className="zt-svg-label" x={14} y={(T + H - B) / 2} textAnchor="middle" transform={`rotate(-90 14 ${(T + H - B) / 2})`}>{ay.label}</text>
    </svg>
  </Panel>;
}

// ---- Players vs teams ---------------------------------------------------------------------------

export function Spread({ players, teams, seasons }: { players: { values: number[]; sd: number }; teams: { values: number[]; sd: number }; seasons: [string, string] }) {
  const xs = useMemo(() => Array.from({ length: 121 }, (_, i) => -6 + i * 0.1), []);
  const dp = useMemo(() => density(players.values.map(v => v * 100), xs), [players, xs]);
  const dt = useMemo(() => density(teams.values.map(v => v * 100), xs), [teams, xs]);
  const top = Math.max(...dp, ...dt, 1e-9);
  const W = 680, H = 220, L = 16, R = 16, T = 12, B = 34;
  const px = (v: number) => L + (v + 6) / 12 * (W - L - R);
  const py = (d: number) => H - B - d / top * (H - T - B);
  const path = (d: number[]) => `M${px(xs[0])},${py(0)} ` + d.map((v, i) => `L${px(xs[i])},${py(v)}`).join(" ") + ` L${px(xs.at(-1)!)},${py(0)} Z`;
  return <Panel className="zt-spread" label="Playtype difficulty spread, players and teams"
    title={<ul className="zt-legend" aria-label="Series">
      <li data-series="players" data-sd={players.sd}>Players <span className="zt-sd">σ {(players.sd * 100).toFixed(2)}</span></li>
      <li data-series="teams" data-sd={teams.sd}>Teams <span className="zt-sd">σ {(teams.sd * 100).toFixed(2)}</span></li>
    </ul>} aside={<span className="zt-panel-note">{seasons[0]} to {seasons[1]}</span>}>
    <svg className="zt-spread-svg" viewBox={`0 0 ${W} ${H}`} role="img"
      aria-label={`Playtype difficulty density, ${seasons[0]} to ${seasons[1]}: ${players.values.length} served player-seasons, standard deviation ${(players.sd * 100).toFixed(2)} points; ${teams.values.length} team-seasons, ${(teams.sd * 100).toFixed(2)} points`}>
      <line className="zt-svg-zero" x1={px(0)} x2={px(0)} y1={T} y2={H - B} />
      <path className="zt-area" data-series="players" d={path(dp)} />
      <path className="zt-area" data-series="teams" d={path(dt)} />
      {[-6, -4, -2, 0, 2, 4, 6].map(t => <text key={t} className="zt-svg-tick" x={px(t)} y={H - B + 18} textAnchor="middle">{t > 0 ? `+${t}` : t}</text>)}
    </svg>
    <div className="zt-spread-ends" aria-hidden="true"><span>Easier role</span><span>Harder role</span></div>
  </Panel>;
}

// ---- The registered test ------------------------------------------------------------------------

export function TestBars({ title, block, betterIfPositive = true }: { title: string; block: ValidationBlock; betterIfPositive?: boolean }) {
  const m = block.metrics;
  const tone = m.delta_r.low > 0 ? "good" : m.delta_r.high < 0 ? "bad" : undefined;
  const bar = (label: string, i: { value: number; low: number; high: number }, series: string) => <li className="zt-test-row" data-series={series}>
    <span className="zt-test-label">{label}</span>
    <span className="zt-test-track" aria-hidden="true">
      <span className="zt-test-fill" data-series={series} style={vars({ "--w": `${Math.max(0, i.value) * 100}%` })} />
      <span className="zt-test-whisker" style={vars({ "--lo": `${Math.max(0, i.low) * 100}%`, "--hi": `${Math.max(0, i.high) * 100}%` })} />
    </span>
    <span className="zt-test-value" data-value={i.value} data-low={i.low} data-high={i.high}>{i.value.toFixed(3)}</span>
  </li>;
  return <Panel kicker={title} className="zt-test" label={title}>
    <ul className="zt-test-rows">{bar("r, rTS", m.r_rts, "rts")}{bar("r, zTS", m.r_zts, "zts")}</ul>
    <p className="zt-test-delta">
      <span className="zt-test-delta-label">zTS − rTS</span>
      <span className="rs-value" data-tone={betterIfPositive ? tone : undefined} data-value={m.delta_r.value} data-low={m.delta_r.low} data-high={m.delta_r.high}>{formatSigned(m.delta_r.value, 3)}</span>
      <span className="zt-test-ci">95% {formatSigned(m.delta_r.low, 3)} to {formatSigned(m.delta_r.high, 3)} · {block.rows.toLocaleString("en-US")} player-seasons</span>
    </p>
  </Panel>;
}

/** Small "i" glossary toggle text with an icon (Databallr's Glossary link). */
export const GlossaryLabel = () => <><Icon name="help" size={14} />Glossary</>;
