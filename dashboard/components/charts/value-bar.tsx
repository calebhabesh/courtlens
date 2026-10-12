import React from "react";
import { scaleLinear } from "d3-scale";
import { ChartData, ChartFrame, type ChartMeta } from "./chart-frame";
import { knownNumber, numberLabel, toneColor, type ChartTone } from "./semantics";

export interface ValueBarProps extends ChartMeta {
  value: number | null;
  domain: [number, number];
  tone?: ChartTone;
  formatted?: string;
}

/** A signed scale with an explicit zero baseline. Missing values get no geometry. */
export function ValueBar({ value, domain, tone = "identity-a", formatted, ...meta }: ValueBarProps) {
  const valid = knownNumber(domain[0]) && knownNumber(domain[1]) && domain[0] < domain[1];
  const bounds: [number, number] = [Math.min(0, domain[0]), Math.max(0, domain[1])];
  const scale = scaleLinear().domain(bounds).range([8, 392]).clamp(true);
  const zero = scale(0);
  const label = formatted ?? numberLabel(value);
  const observed = valid && knownNumber(value);
  return <ChartFrame {...meta} state={meta.state ?? (valid ? "ready" : "error")}>
    <ChartData fingerprint={JSON.stringify([value, domain, tone])}>
      <div className="chart-value-label"><span>{meta.title}</span><strong>{label}</strong></div>
      <svg className="chart-graphic chart-bar" viewBox="0 0 400 32" role="img" aria-label={`${meta.title}: ${knownNumber(value) ? label : "unknown"}; scale ${numberLabel(bounds[0])} to ${numberLabel(bounds[1])}`}>
        <rect x="8" y="8" width="384" height="16" rx="4" fill="var(--color-surface-2)" />
        {observed && <rect data-value-bar x={Math.min(zero, scale(value))} y="8" width={Math.abs(scale(value) - zero)} height="16" rx="4" fill={toneColor(tone)} />}
        <line x1={zero} x2={zero} y1="4" y2="28" stroke="var(--color-text-secondary)" strokeWidth="1" />
      </svg>
      <div className="chart-axis-labels"><span>{numberLabel(bounds[0])}</span><span>Zero baseline</span><span>{numberLabel(bounds[1])}</span></div>
      {observed && (value < bounds[0] || value > bounds[1]) && <p className="chart-note">Value exceeds the displayed scale; the label shows the full value.</p>}
    </ChartData>
  </ChartFrame>;
}
