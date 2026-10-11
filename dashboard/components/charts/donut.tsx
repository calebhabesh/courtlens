import React from "react";
import { arc, pie } from "d3-shape";
import { ChartData, ChartFrame, type ChartMeta } from "./chart-frame";
import { CATEGORIES, chartVars, nonnegative, numberLabel, toneColor, type ChartTone } from "./semantics";

export interface DonutItem { id: string; label: string; value: number | null; tone?: ChartTone }
export interface DonutProps extends ChartMeta { items: DonutItem[]; format?: (value: number) => string }

/** Shares always describe known values. Unknown rows remain visible and never become slices. */
export function Donut({ items, format = numberLabel, ...meta }: DonutProps) {
  const invalid = items.some(item => typeof item.value === "number" && Number.isFinite(item.value) && item.value < 0);
  const known = items.filter(item => nonnegative(item.value));
  const total = known.reduce((sum, item) => sum + item.value!, 0);
  const positive = known.filter(item => item.value! > 0);
  const unknownCount = items.length - known.length;
  const slices = pie<DonutItem>().value(item => item.value!).sort(null)(positive);
  const path = arc<(typeof slices)[number]>().innerRadius(64).outerRadius(100).padAngle(0.02);
  const color = (item: DonutItem) => toneColor(item.tone ?? `category-${CATEGORIES[items.indexOf(item) % CATEGORIES.length]}`);
  return <ChartFrame {...meta} state={meta.state ?? (invalid ? "error" : items.length === 0 ? "empty" : "ready")}>
    <ChartData fingerprint={JSON.stringify(items)}>
      <div className="chart-donut-layout">
        {positive.length <= 6 && total > 0 && <svg className="chart-graphic chart-donut" viewBox="-112 -112 224 224" role="img" aria-label={`${meta.title}; known total ${format(total)}; ${unknownCount} unknown rows`}>
          {slices.map(slice => <path key={slice.data.id} d={path(slice) ?? ""} fill={color(slice.data)} stroke="var(--color-surface-1)" strokeWidth="2"><title>{`${slice.data.label}: ${format(slice.value)} (${(slice.value / total * 100).toFixed(1)}% of known total)`}</title></path>)}
          <text className="chart-svg-label" textAnchor="middle" y="-8">Known total</text><text className="chart-svg-value" textAnchor="middle" y="16">{format(total)}</text>
        </svg>}
        <ul className="chart-legend chart-donut-labels">{items.map(item => <li key={item.id}>
          <span className={`chart-key ${nonnegative(item.value) ? "" : "chart-key-unknown"}`} style={chartVars({ "--chart-tone": color(item) })} aria-hidden="true" />
          <span>{item.label}</span><strong>{nonnegative(item.value) ? format(item.value) : "—"}</strong>
          <small>{nonnegative(item.value) ? total > 0 ? `${(item.value / total * 100).toFixed(1)}% of known` : "Observed zero" : "Unknown"}</small>
          {positive.length > 6 && nonnegative(item.value) && <svg className="chart-share-bar" viewBox="0 0 100 8" aria-hidden="true"><rect width={total > 0 ? item.value / total * 100 : 0} height="8" fill={color(item)} /></svg>}
        </li>)}</ul>
      </div>
      {total === 0 && <p className="chart-note">{known.length ? "Known values sum to zero; there is no proportional area." : "Total unknown; no observed values."}</p>}
      {unknownCount > 0 && <p className="chart-note">{unknownCount} unknown {unknownCount === 1 ? "row is" : "rows are"} excluded from shares; the full total is unknown.</p>}
      {positive.length > 6 && <p className="chart-note">More than six nonzero categories: labeled share bars replace the donut.</p>}
    </ChartData>
  </ChartFrame>;
}
