import React, { useId } from "react";
import { hierarchy, pack } from "d3-hierarchy";
import { ChartData, ChartFrame, UnknownPattern, type ChartMeta } from "./chart-frame";
import { chartVars, nonnegative, numberLabel, toneColor, type Category } from "./semantics";

export interface ShapeItem { id: string; label: string; value: number | null; category: Category | null; fit: "observed" | "projected" | "unknown" }
export interface ShapePackProps extends ChartMeta { items: ShapeItem[]; sizeLabel: string; categoryLabels: Record<Category, string>; capacity?: number }
interface PackDatum { item?: ShapeItem; children?: PackDatum[] }

/** Area encodes a caller-declared nonnegative quantity. Signed impact needs an explicit upstream transform. */
export function ShapePack({ items, sizeLabel, categoryLabels, capacity, ...meta }: ShapePackProps) {
  const patternId = `shape-unknown-${useId().replace(/:/g, "")}`;
  const invalid = items.some(item => typeof item.value === "number" && Number.isFinite(item.value) && item.value < 0) || (capacity !== undefined && (!nonnegative(capacity) || capacity === 0));
  const observed = items.filter(item => nonnegative(item.value) && item.value > 0);
  const total = observed.reduce((sum, item) => sum + item.value!, 0);
  const root = hierarchy<PackDatum>({ children: observed.map(item => ({ item })) }).sum(d => d.item?.value ?? 0).sort((a, b) => b.value! - a.value! || (a.data.item?.id ?? "").localeCompare(b.data.item?.id ?? ""));
  const circles = pack<PackDatum>().size([320, 320]).padding(4)(root).leaves().filter(node => node.data.item);
  const occupancy = capacity && total < capacity ? Math.sqrt(total / capacity) : 1;
  const categoryColor = (item: ShapeItem) => item.category === null ? `url(#${patternId})` : toneColor(`category-${item.category}`);
  const categories = [...new Set(items.flatMap(item => item.category === null ? [] : [item.category]))];
  return <ChartFrame {...meta} state={meta.state ?? (invalid ? "error" : items.length === 0 ? "empty" : "ready")}>
    <ChartData fingerprint={JSON.stringify([items, capacity])}>
      <div className="chart-pack-layout">
        {total > 0 && <svg className="chart-graphic chart-pack" viewBox="0 0 320 320" role="img" aria-label={`${meta.title}; area = ${sizeLabel}; ${items.length - observed.length} rows without positive area`}>
          <UnknownPattern id={patternId} />
          <circle cx="160" cy="160" r="158" fill="var(--color-surface-2)" />
          <g transform={`translate(${160 * (1 - occupancy)} ${160 * (1 - occupancy)}) scale(${occupancy})`}>
            {circles.map(node => { const item = node.data.item!; return <g key={item.id}>
              <circle data-shape-id={item.id} cx={node.x} cy={node.y} r={node.r} fill={categoryColor(item)} stroke={item.category === null ? "var(--color-text)" : "var(--color-on-accent)"} strokeWidth="2" strokeDasharray={item.fit === "observed" ? undefined : item.fit === "projected" ? "6 3" : "2 3"} />
              {node.r * occupancy > 28 && <text className={`chart-pack-label ${item.category === null ? "chart-pack-label-unknown" : ""}`} x={node.x} y={node.y} textAnchor="middle" dominantBaseline="central">{item.label.split(" ").slice(-1)[0].slice(0, 10)}</text>}
              <title>{`${item.label}: ${numberLabel(item.value)} ${sizeLabel}; ${item.category ? categoryLabels[item.category] : "category unknown"}; ${item.fit} fit`}</title>
            </g>; })}
          </g>
        </svg>}
        <ul className="chart-legend chart-pack-labels">{items.map(item => <li key={item.id}><span className={`chart-key ${item.category === null ? "chart-key-unknown" : ""}`} style={chartVars({ "--chart-tone": item.category === null ? "var(--color-status-unknown)" : toneColor(`category-${item.category}`) })} aria-hidden="true" /><span>{item.label}<small>{item.category ? categoryLabels[item.category] : "Category unknown"} · {item.fit} fit</small></span><strong>{nonnegative(item.value) ? numberLabel(item.value) : "—"}</strong></li>)}</ul>
      </div>
      <p className="chart-note">Area = {sizeLabel}. Color = labeled category. Outline: solid observed fit, dashed projected, dotted unknown.</p>
      <ul className="chart-legend chart-legend-inline">{categories.map(category => <li key={category}><span className="chart-key" style={chartVars({ "--chart-tone": toneColor(`category-${category}`) })} aria-hidden="true" />{categoryLabels[category]}</li>)}</ul>
      {total === 0 && <p className="chart-note">No positive observed values to size.</p>}
      {capacity && <p className="chart-note">Known total {numberLabel(total)} of {numberLabel(capacity)} capacity.{items.some(item => !nonnegative(item.value)) && " Capacity use is incomplete: some values are unknown."}</p>}
    </ChartData>
  </ChartFrame>;
}
