import React from "react";
import { scaleLinear } from "d3-scale";
import { ChartData, ChartFrame, type ChartMeta } from "./chart-frame";
import { nonnegative, numberLabel } from "./semantics";

export interface Threshold { label: string; value: number }
export interface ThresholdBarProps extends ChartMeta {
  value: number | null;
  maximum: number;
  thresholds: Threshold[];
  format?: (value: number) => string;
}

export function ThresholdBar({ value, maximum, thresholds, format = numberLabel, ...meta }: ThresholdBarProps) {
  const valid = nonnegative(maximum) && maximum > 0 && thresholds.every(t => nonnegative(t.value) && t.value <= maximum);
  const scale = scaleLinear().domain([0, maximum]).range([8, 592]).clamp(true);
  const observed = nonnegative(value);
  return <ChartFrame {...meta} state={meta.state ?? (valid ? "ready" : "error")}>
    <ChartData fingerprint={JSON.stringify([value, maximum, thresholds])}>
      <div className="chart-value-label"><span>Known total</span><strong>{observed ? format(value) : "—"}</strong></div>
      <svg className="chart-graphic chart-bar" viewBox="0 0 600 48" role="img" aria-label={`${meta.title}: ${observed ? format(value) : "unknown"}; ${thresholds.map(t => `${t.label} ${format(t.value)}`).join("; ")}`}>
        <rect x="8" y="16" width="584" height="16" rx="4" fill="var(--color-surface-2)" />
        {observed && <rect data-value-bar x="8" y="16" width={scale(value) - 8} height="16" rx="4" fill="var(--color-identity-a)" />}
        {thresholds.map(t => <line key={t.label} x1={scale(t.value)} x2={scale(t.value)} y1="8" y2="40" stroke="var(--color-text)" strokeWidth="2"><title>{`${t.label}: ${format(t.value)}`}</title></line>)}
      </svg>
      <ul className="chart-threshold-labels">{thresholds.map(t => <li key={t.label}><span>{t.label}</span><strong>{format(t.value)}</strong></li>)}</ul>
      {observed && value > maximum && <p className="chart-note">Total exceeds the displayed scale ({format(maximum)}).</p>}
      <p className="chart-note">Amber = known total. Lines = labeled thresholds. Unknown amounts are excluded.</p>
    </ChartData>
  </ChartFrame>;
}
