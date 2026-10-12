"use client";

import { useEffect, useRef, useState } from "react";
import type { Result } from "@/lib/conversation";
import { formatDate, parseIsoDate } from "@/lib/format-date";
import { ChartFrame } from "./chart-frame";

/** Preserve returned order and missing slots; a dot is one observed value, never a forecast. */
export function ObservedSamples({ result }: { result: Result }) {
  const svg = useRef<SVGSVGElement>(null);
  const [width, setWidth] = useState(500);
  const samples = Array.isArray(result.data.samples) ? result.data.samples as Record<string, unknown>[] : [];
  const valid = samples.flatMap((row, index) => typeof row.value === "number" && Number.isFinite(row.value) ? [{ value: row.value, index, date: row.game_date }] : []);
  const ready = valid.length > 0;
  useEffect(() => {
    if (!svg.current || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(([entry]) => setWidth(Math.max(32, entry.contentRect.width)));
    observer.observe(svg.current);
    return () => observer.disconnect();
  }, [ready]);
  if (!samples.length) return null;
  const min = Math.min(0, ...valid.map(point => point.value));
  const max = Math.max(1, ...valid.map(point => point.value));
  const metric = String(result.data.metric_display_name ?? result.arguments.metric ?? "Metric");
  const unit = String(result.data.metric_unit ?? result.evidence.find(cell => cell.metric === result.arguments.metric && cell.unit !== "observations")?.unit ?? "units");
  const dated = samples.every(row => typeof row.game_date === "string" && parseIsoDate(row.game_date));
  const newestFirst = dated && samples.length > 1 && samples.slice(1).every((row, index) => String(row.game_date) <= String(samples[index].game_date));
  const label = (value: number) => value.toLocaleString("en-US", { maximumFractionDigits: 2 });
  const tick = (index: number) => `#${index + 1}${dated ? ` · ${formatDate(String(samples[index].game_date), "compact")}` : ""}`;
  return <ChartFrame title={`${metric} · Observed Games`} source="Retained CourtLens distribution operation" sample={`${valid.length} observed · ${samples.length - valid.length} unknown`} note="Dots show observations; no interpolation or prospective interval." state={valid.length ? "ready" : "empty"}>
    <p className="pc12-samples-axis-title">{metric} ({unit})</p>
    <div className="pc12-samples-layout">
      <div className="pc12-samples-y" role="group" aria-label="Value axis"><span>{label(max)}</span><span>{label((max + min) / 2)}</span><span>{label(min)}</span></div>
      <svg ref={svg} viewBox={`0 0 ${width} 160`} className="pc12-samples-svg" role="img" aria-label={`${metric} in ${unit}; ${valid.length} observed games in returned order; exact values in the table`}>
        <title>{`${metric} in ${unit}; observed values with a zero baseline`}</title>
        {[min, (max + min) / 2, max].map(value => <line key={value} x1="8" x2={width - 8} y1={152 - (value - min) / (max - min) * 144} y2={152 - (value - min) / (max - min) * 144} stroke="var(--color-border-subtle)" />)}
        <line x1="8" x2="8" y1="8" y2="152" stroke="var(--color-text-secondary)" />
        <line x1="8" x2={width - 8} y1={152 - (0 - min) / (max - min) * 144} y2={152 - (0 - min) / (max - min) * 144} stroke="var(--color-text-secondary)" />
        {valid.map(point => <circle key={point.index} data-sample-index={point.index} cx={samples.length === 1 ? width / 2 : 8 + point.index / (samples.length - 1) * (width - 16)} cy={152 - (point.value - min) / (max - min) * 144} r="5" fill="var(--color-identity-a)"><title>{`Appearance ${point.index + 1}${typeof point.date === "string" && parseIsoDate(point.date) ? ` · ${formatDate(point.date)}` : ""}: ${label(point.value)} ${unit}`}</title></circle>)}
      </svg>
      <div className="pc12-samples-x"><span>{tick(0)}</span>{samples.length > 1 && <span>{tick(samples.length - 1)}</span>}</div>
    </div>
    <p className="pc12-samples-axis-title">Returned Appearance{newestFirst ? " · newest first" : ""}</p>
  </ChartFrame>;
}
