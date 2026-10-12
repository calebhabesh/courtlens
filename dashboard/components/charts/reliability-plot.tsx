import React from "react";
import { ChartData, ChartFrame, type ChartMeta } from "./chart-frame";
import { knownNumber } from "./semantics";
import type { ShotMetrics } from "@/lib/advanced-research";

type Series = { name: string; bins: ShotMetrics["calibration_bins"] };
/** Measured bin means only. Empty bins have no points and no connecting interpolation. */
export function ReliabilityPlot({ series, ...meta }: ChartMeta & { series: [Series, Series] }) {
  const points = series.flatMap((s, i) => s.bins.flatMap((bin, index) => bin.rows > 0 && knownNumber(bin.mean_probability) && knownNumber(bin.observed_rate)
    ? [{ ...bin, probability: bin.mean_probability, rate: bin.observed_rate, name: s.name, identity: i, index }] : []));
  return <ChartFrame {...meta} state={meta.state ?? (points.length ? "ready" : "empty")}>
    <ChartData fingerprint={JSON.stringify(series)}>
      <ul className="chart-legend chart-legend-inline">
        {series.map((s, i) => <li key={i}><span className={`chart-key chart-key-${i ? "b" : "a"}`} aria-hidden="true" />{s.name} · {i ? "squares" : "circles"}</li>)}
        <li>Dashed line: observed = predicted</li>
      </ul>
      <svg className="chart-reliability chart-graphic" viewBox="0 0 480 280" role="img" aria-label="Selection reliability: predicted make probability against observed make rate">
        {[0, .5, 1].map(t => <g key={t}>
          <line x1="64" x2="432" y1={224 - t * 184} y2={224 - t * 184} stroke="var(--color-hairline-strong)" />
          <text x="52" y={228 - t * 184} textAnchor="end">{t * 100}%</text>
          <text x={64 + t * 368} y="244" textAnchor="middle">{t * 100}%</text>
        </g>)}
        <line x1="64" y1="224" x2="432" y2="40" stroke="var(--color-text-secondary)" strokeDasharray="4 4" />
        <text x="248" y="272" textAnchor="middle">Predicted make probability</text>
        <text transform="translate(16,132) rotate(-90)" textAnchor="middle">Observed make rate</text>
        {points.map(p => <g key={`${p.identity}-${p.index}`} fill={`var(--color-identity-${p.identity ? "b" : "a"})`}>
          <title>{`${p.name} · bin ${p.lower}–${p.upper} · ${p.rows.toLocaleString("en-US")} shots · predicted ${(p.probability * 100).toFixed(2)}% · observed ${(p.rate * 100).toFixed(2)}%`}</title>
          {p.identity ? <rect x={64 + p.probability * 368 - 4} y={224 - p.rate * 184 - 4} width="8" height="8" /> : <circle cx={64 + p.probability * 368} cy={224 - p.rate * 184} r="4" />}
        </g>)}
      </svg>
    </ChartData>
  </ChartFrame>;
}
