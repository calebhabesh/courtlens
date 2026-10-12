import React from "react";
import { scaleLinear } from "d3-scale";
import { ChartData, ChartFrame, type ChartMeta } from "./chart-frame";
import { knownNumber, numberLabel } from "./semantics";
import { DeltaChip } from "./delta-chip";
import type { GoodDirection } from "@/lib/percentile-display";

export type PairedBarRow = {
  key: string; label: string; a: number | null | undefined; b: number | null | undefined;
  formattedA?: string; formattedB?: string; detail?: string; direction?: GoodDirection;
};

/** Each metric has its own zero-based scale; A and B always share that scale. */
export function PairedBars({ rows, names, domain, ...meta }: ChartMeta & {
  rows: PairedBarRow[]; names: [string, string]; domain?: [number, number];
}) {
  return <ChartFrame {...meta} state={meta.state ?? (rows.length ? "ready" : "empty")}>
    <ChartData fingerprint={JSON.stringify(rows)}>
      <ul className="chart-legend chart-legend-inline">
        <li><span className="chart-key chart-key-a" aria-hidden="true" />{names[0]}</li>
        <li><span className="chart-key chart-key-b" aria-hidden="true" />{names[1]}</li>
      </ul>
      <div className="chart-pairs">
        {rows.map(row => {
          const values = [row.a, row.b].filter(knownNumber);
          const bounds: [number, number] = domain ?? [Math.min(0, ...values), Math.max(0, ...values)];
          const scale = scaleLinear().domain(bounds[0] < bounds[1] ? bounds : [0, 1]).range([0, 200]);
          const zero = scale(0);
          return <div key={row.key} className="chart-pair">
            <div className="chart-pair-label"><strong>{row.label}</strong>{row.detail && <small>{row.detail}</small>}
              {row.direction && <DeltaChip a={row.a} b={row.b} direction={row.direction} names={names} />}
            </div>
            <div className="chart-pair-bars">
              {([row.a, row.b] as const).map((value, i) => <div className="chart-pair-side" key={i}>
                <svg className="chart-ranked-bar" viewBox="0 0 200 16" preserveAspectRatio="none" role="img"
                  aria-label={`${row.label}, ${names[i]}: ${knownNumber(value) ? (i ? row.formattedB : row.formattedA) ?? numberLabel(value) : "unknown"}`}>
                  <rect x="0" y="2" width="200" height="12" rx="2" fill="var(--color-surface-2)" />
                  {knownNumber(value) && <rect x={Math.min(zero, scale(value))} y="2" width={Math.abs(scale(value) - zero)} height="12" rx="2" fill={`var(--color-identity-${i ? "b" : "a"})`} />}
                  <line x1={zero} x2={zero} y1="0" y2="16" stroke="var(--color-text-secondary)" vectorEffect="non-scaling-stroke" />
                </svg>
                <span>{knownNumber(value) ? (i ? row.formattedB : row.formattedA) ?? numberLabel(value) : "—"}</span>
              </div>)}
              <div className="chart-axis-labels"><span>{numberLabel(bounds[0])}</span><span>Shared scale · zero baseline</span><span>{numberLabel(bounds[1])}</span></div>
            </div>
          </div>;
        })}
      </div>
    </ChartData>
  </ChartFrame>;
}
