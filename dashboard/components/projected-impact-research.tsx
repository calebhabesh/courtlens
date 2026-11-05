"use client";

import { useMemo, useState } from "react";
import { ChartData, ChartFrame } from "@/components/charts/chart-frame";
import { PlayerIdentity } from "@/components/ui/identity";
import { Button, ButtonLink, Segmented } from "@/components/ui/kit";
import { signed, type ProjectedImpactPage, type ProjectedPlayer } from "@/lib/projected-impact";

const PAGE = 25;
const RANGE = { left: -6, right: 12, width: 160, height: 16 };
const rangeX = (value: number) => ((Math.max(RANGE.left, Math.min(RANGE.right, value)) - RANGE.left) / (RANGE.right - RANGE.left)) * RANGE.width;

function IntervalMark({ low, high, value }: { low: number; high: number; value: number }) {
  return <svg className="pi-range" viewBox={`0 0 ${RANGE.width} ${RANGE.height}`} aria-hidden="true">
    <line className="pi-range-track" x1={0} x2={RANGE.width} y1={8} y2={8} />
    <line className="pi-range-zero" x1={rangeX(0)} x2={rangeX(0)} y1={3} y2={13} />
    <line className="pi-range-span" x1={rangeX(low)} x2={rangeX(high)} y1={8} y2={8} />
    <circle className="pi-range-dot" cx={rangeX(value)} cy={8} r={3} />
  </svg>;
}

const eraOf = (row: ProjectedPlayer) => row.tricode ? { season: "2026-27", team: row.tricode } : row.last_tricode ? { season: "2025-26", team: row.last_tricode } : null;

/** Frozen 2026-27 leaderboard. Ranks are positions in a table of estimates, not verdicts: intervals overlap. */
export function Leaderboard({ players }: { players: ProjectedPlayer[] }) {
  const [view, setView] = useState("roster");
  const [shown, setShown] = useState(PAGE);
  const rows = useMemo(() => players.filter(row => view === "all" ? true : view === "rookie" ? row.group !== "prior" : row.on_roster), [players, view]);
  return <div className="pi-board">
    <div className="pi-controls">
      <Segmented label="Players" size="sm" value={view} onChange={value => { setView(value); setShown(PAGE); }} options={[
        { value: "roster", label: "On a roster" },
        { value: "rookie", label: "Rookies and returners" },
        { value: "all", label: "Everyone" },
      ]} />
      <span>{rows.length} players, 80% intervals</span>
    </div>
    <div className="table-wrapper research-table" role="region" aria-label="Projected impact leaderboard" tabIndex={0}>
      <table className="data-table"><thead><tr>
        <th className="num pi-wide">#</th><th>Player</th><th className="num pi-wide">Age</th><th className="num">Projected</th><th className="num">80% interval</th><th className="pi-wide">Range</th><th className="num pi-wide">Last season</th><th className="num pi-wide">Minutes</th><th>Why</th>
      </tr></thead>
        <tbody>{rows.slice(0, shown).map((row, i) => <tr key={row.player_id}>
          <td className="num pi-wide">{i + 1}</td>
          <th><PlayerIdentity playerId={row.player_id} name={row.name} team={row.tricode ?? row.last_tricode} era={eraOf(row)} size="sm" subtitle={row.group === "prior" ? undefined : row.group === "rookie" ? "Rookie" : "Returner"} href={`/players/${row.player_id}`} /></th>
          <td className="num pi-wide">{row.age == null ? "—" : Math.floor(row.age)}</td>
          <td className="num">{signed(row.projection)}</td>
          <td className="num pi-interval">{signed(row.low, 1)} to {signed(row.high, 1)}</td>
          <td className="pi-wide"><IntervalMark low={row.low} high={row.high} value={row.projection} /></td>
          <td className="num pi-wide">{row.group === "prior" ? signed(row.ratings.carry_forward) : "—"}</td>
          <td className="num pi-wide">{row.minutes_last_season == null ? "—" : Math.round(row.minutes_last_season).toLocaleString("en-US")}</td>
          <td><ButtonLink size="sm" variant="ghost" href={`?player=${row.player_id}#contributions`} aria-label={`Why ${row.name} is projected here`}>Why</ButtonLink></td>
        </tr>)}</tbody></table>
    </div>
    {shown < rows.length && <div><Button size="sm" onClick={() => setShown(rows.length)}>Show all {rows.length}</Button></div>}
  </div>;
}

/** Diverging bars for one player's model contributions, green up and red down. */
export function ContributionBars({ title, rows, sample }: { title: string; rows: { label: string; value: number }[]; sample: string }) {
  if (!rows.length) return null;
  const max = Math.max(.5, ...rows.map(r => Math.abs(r.value)));
  const row = 28, labels = 244, width = 520, half = (width - labels - 64) / 2, centre = labels + half;
  return <ChartFrame title={title} source="The frozen model's own attribution" sample={sample} note="Describes the model's arithmetic, not a cause.">
    <ChartData fingerprint={rows.map(r => r.label).join()}>
      <svg className="pi-bars chart-graphic" viewBox={`0 0 ${width} ${rows.length * row + 8}`} role="img" aria-label={`${title}: ${rows.map(r => `${r.label} ${signed(r.value)}`).join(", ")}`}>
        <line className="pi-axis" x1={centre} x2={centre} y1={0} y2={rows.length * row} />
        {rows.map((r, i) => {
          const size = Math.abs(r.value) / max * half;
          return <g key={r.label}>
            <text x={labels - 8} y={i * row + 18} textAnchor="end">{r.label}</text>
            <rect className="pi-bar" data-sign={r.value >= 0 ? "up" : "down"} x={r.value >= 0 ? centre : centre - size} y={i * row + 6} width={Math.max(size, 1)} height={16} />
            <text x={r.value >= 0 ? centre + size + 6 : centre - size - 6} y={i * row + 18} textAnchor={r.value >= 0 ? "start" : "end"}>{signed(r.value)}</text>
          </g>;
        })}
      </svg>
    </ChartData>
  </ChartFrame>;
}

/** Delta-method curve and the selected model's partial dependence, on training seasons only. */
export function AgingCurve({ aging, selectedLabel }: { aging: ProjectedImpactPage["card"]["aging"]; selectedLabel: string }) {
  const keep = aging.ages.map((age, i) => ({ age, delta: aging.delta_method_relative_to_27[i], forest: aging.partial_dependence.lightgbm[i] })).filter(p => p.age >= 20 && p.age <= 38);
  const anchor = keep.find(p => p.age === 27)?.forest ?? 0;
  const series = keep.map(p => ({ ...p, forest: p.forest - anchor }));
  const left = 56, right = 452, top = 12, bottom = 212;
  const low = Math.min(...series.map(p => Math.min(p.delta, p.forest)), -1), high = Math.max(...series.map(p => Math.max(p.delta, p.forest)), 1);
  const x = (age: number) => left + (age - 20) / 18 * (right - left);
  const y = (value: number) => bottom - (value - low) / (high - low) * (bottom - top);
  const path = (pick: (p: typeof series[number]) => number) => series.map((p, i) => `${i ? "L" : "M"} ${x(p.age).toFixed(1)} ${y(pick(p)).toFixed(1)}`).join(" ");
  const ticks = [Math.ceil(low), 0, Math.floor(high)].filter((v, i, list) => list.indexOf(v) === i);
  return <ChartFrame title="Impact by age" source="Training target seasons, 2016-17 to 2022-23" sample="Ages 20 to 38, relative to age 27" note="The ends rest on few players, so read them loosely.">
    <ChartData fingerprint="aging">
      <ul className="chart-legend chart-legend-inline">
        <li><span className="chart-key chart-key-a" aria-hidden="true" />Age-curve candidate: year-on-year change, summed</li>
        <li><span className="chart-key chart-key-b" aria-hidden="true" />{selectedLabel}: partial dependence on age</li>
      </ul>
      <svg className="wp-plot chart-graphic" viewBox="0 0 480 256" role="img" aria-label="Impact relative to age 27 by age, for the age-curve candidate and the selected model">
        {ticks.map(t => <g key={t}><line className="wp-plot-grid" x1={left} x2={right} y1={y(t)} y2={y(t)} /><text x={left - 8} y={y(t) + 4} textAnchor="end">{signed(t, 0)}</text></g>)}
        {[20, 24, 27, 30, 34, 38].map(age => <text key={age} x={x(age)} y={bottom + 18} textAnchor="middle">{age}</text>)}
        <text x={(left + right) / 2} y={bottom + 38} textAnchor="middle">Age at the season opener</text>
        <path className="wp-plot-line" data-series="0" d={path(p => p.delta)} />
        <path className="wp-plot-line" data-series="1" d={path(p => p.forest)} />
      </svg>
    </ChartData>
  </ChartFrame>;
}
