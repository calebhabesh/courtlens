import React, { type ReactNode } from "react";
import { scaleLinear } from "d3-scale";
import { ChartData, ChartFrame, type ChartMeta } from "./chart-frame";
import { knownNumber, numberLabel, toneColor, type ChartTone } from "./semantics";

const axisLabel = (value: number) => value.toLocaleString("en-US", { maximumFractionDigits: 1 });

export interface RankedBarItem {
  key: string;
  label: ReactNode;
  /** Plain-text name for the accessible label when `label` is a link or element. */
  name: string;
  value: number | null;
  formatted?: string;
  detail?: ReactNode;
  /** Small samples stay listed but read as secondary, never as a ranked result. */
  muted?: boolean;
}

export interface RankedBarsProps extends ChartMeta {
  items: RankedBarItem[];
  /** What the bar measures, e.g. "makes below expected". */
  measure: string;
  tone?: ChartTone;
}

/**
 * PC11: labeled rows on one shared signed scale with an explicit zero baseline. Order is the
 * caller's (a rank or a fixed category order); missing values keep their row with no geometry.
 */
export function RankedBars({ items, measure, tone = "identity-a", ...meta }: RankedBarsProps) {
  const known = items.flatMap(item => knownNumber(item.value) ? [item.value] : []);
  const bounds: [number, number] = [Math.min(0, ...known), Math.max(0, ...known)];
  const valid = known.length > 0 && bounds[0] < bounds[1];
  const scale = scaleLinear().domain(valid ? bounds : [0, 1]).range([2, 198]);
  const zero = scale(0);
  const state = meta.state ?? (items.length ? "ready" : "empty");
  return <ChartFrame {...meta} state={state}>
    <ChartData fingerprint={JSON.stringify(items.map(item => [item.key, item.value]))}>
      <ol className="chart-ranked" aria-label={`${meta.title}: ${measure}`}>
        {items.map(item => {
          const observed = valid && knownNumber(item.value);
          const label = item.formatted ?? numberLabel(item.value);
          return <li key={item.key} data-muted={item.muted ? "true" : undefined}>
            <span className="chart-ranked-label">{item.label}{item.detail && <small>{item.detail}</small>}</span>
            <svg className="chart-ranked-bar" viewBox="0 0 200 16" preserveAspectRatio="none" role="img"
              aria-label={`${item.name}: ${knownNumber(item.value) ? label : "unknown"} ${measure}${item.muted ? ", small sample" : ""}`}>
              <rect x="0" y="2" width="200" height="12" rx="3" fill="var(--color-surface-2)" />
              {observed && <rect x={Math.min(zero, scale(item.value!))} y="2" width={Math.max(1, Math.abs(scale(item.value!) - zero))} height="12" rx="3"
                fill={item.muted ? "var(--color-status-unknown)" : toneColor(tone)} />}
              {valid && bounds[0] < 0 && <line x1={zero} x2={zero} y1="0" y2="16" stroke="var(--color-text-secondary)" strokeWidth="1" vectorEffect="non-scaling-stroke" />}
            </svg>
            <strong className="chart-ranked-value">{knownNumber(item.value) ? label : "—"}</strong>
          </li>;
        })}
      </ol>
      <div className="chart-axis-labels"><span>{axisLabel(bounds[0])}</span><span>{bounds[0] < 0 ? "Zero baseline" : measure}</span><span>{axisLabel(bounds[1])}</span></div>
    </ChartData>
  </ChartFrame>;
}
