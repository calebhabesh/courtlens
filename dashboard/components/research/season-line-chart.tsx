"use client";

import { useState, type CSSProperties, type KeyboardEvent, type PointerEvent } from "react";

/*
 * One measure by season as a line on one axis (RD06, Learning's league trends): never two y-scales. Axis labels, grid,
 * points and the tooltip are HTML placed with CSS custom properties, so text never stretches; the SVG draws only the line.
 * Hover or arrow keys move a crosshair and a tooltip; the table beside it is the accessible full view.
 */

export interface SeasonPoint { season: string; value: number | null }

const STEPS = [1, 2, 2.5, 5, 10];

/** About four or five round ticks covering the values, with a little room above and below. */
export function niceTicks(values: readonly number[], target = 4): number[] {
  const low = Math.min(...values), high = Math.max(...values);
  const span = high - low || Math.abs(high) || 1;
  const raw = span / target;
  const power = 10 ** Math.floor(Math.log10(raw));
  const step = (STEPS.find(s => s * power >= raw) ?? 10) * power;
  const start = Math.floor((low - span * 0.08) / step) * step, end = Math.ceil((high + span * 0.08) / step) * step;
  const ticks: number[] = [];
  for (let t = start; t <= end + step / 2; t += step) ticks.push(Number(t.toFixed(10)));
  return ticks;
}

const vars = (props: Record<string, string>) => props as CSSProperties;

export function SeasonLineChart({ label, points, format, axisFormat = format }: {
  label: string;
  points: readonly SeasonPoint[];
  format: (value: number) => string;
  axisFormat?: (value: number) => string;
}) {
  const [active, setActive] = useState<number | null>(null);
  const known = points.map(p => p.value).filter((v): v is number => v !== null && Number.isFinite(v));
  if (known.length < 2) return <p className="slc-empty">Not enough seasons to draw a line.</p>;
  const ticks = niceTicks(known);
  const bottom = ticks[0], top = ticks[ticks.length - 1];
  const x = (index: number) => points.length === 1 ? 50 : (index / (points.length - 1)) * 100;
  const y = (value: number) => ((top - value) / (top - bottom)) * 100;
  let path = "", pen = false;
  points.forEach((p, i) => {
    if (p.value === null) { pen = false; return; }
    path += `${pen ? "L" : "M"}${x(i).toFixed(3)},${y(p.value).toFixed(3)}`;
    pen = true;
  });
  const first = points.find(p => p.value !== null), last = [...points].reverse().find(p => p.value !== null);
  const summary = `${label}: ${first?.season} ${format(first?.value ?? 0)} to ${last?.season} ${format(last?.value ?? 0)}; low ${format(Math.min(...known))}, high ${format(Math.max(...known))}.`;
  const pick = (event: PointerEvent<HTMLDivElement>) => {
    const box = event.currentTarget.getBoundingClientRect();
    const share = (event.clientX - box.left) / Math.max(box.width, 1);
    setActive(Math.max(0, Math.min(points.length - 1, Math.round(share * (points.length - 1)))));
  };
  const keys = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight" && event.key !== "Escape") return;
    event.preventDefault();
    if (event.key === "Escape") { setActive(null); return; }
    const from = active ?? (event.key === "ArrowLeft" ? points.length : -1);
    setActive(Math.max(0, Math.min(points.length - 1, from + (event.key === "ArrowLeft" ? -1 : 1))));
  };
  const shown = active === null ? null : points[active];
  const edge = active === null ? undefined : x(active) < 15 ? "start" : x(active) > 85 ? "end" : undefined;
  return <figure className="slc" aria-label={label}>
    <div className="slc-frame">
      <div className="slc-y" aria-hidden="true">
        {ticks.map(t => <span key={t} className="slc-y-label" style={vars({ "--slc-y": `${y(t)}%` })}>{axisFormat(t)}</span>)}
      </div>
      <div className="slc-plot" role="img" aria-label={summary} tabIndex={0}
        onPointerMove={pick} onPointerDown={pick} onPointerLeave={() => setActive(null)} onKeyDown={keys} onBlur={() => setActive(null)}>
        {ticks.map(t => <span key={t} className="slc-grid" aria-hidden="true" style={vars({ "--slc-y": `${y(t)}%` })} />)}
        <svg className="slc-svg" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true" focusable="false">
          <path className="slc-line" d={path} vectorEffect="non-scaling-stroke" />
        </svg>
        {points.map((p, i) => p.value === null ? null : <span key={p.season} className="slc-dot" aria-hidden="true" data-season={p.season} data-value={p.value}
          data-active={active === i || undefined} style={vars({ "--slc-x": `${x(i)}%`, "--slc-y": `${y(p.value)}%` })} />)}
        {shown && active !== null && <>
          <span className="slc-cross" aria-hidden="true" style={vars({ "--slc-x": `${x(active)}%` })} />
          <span className="slc-tip" data-edge={edge} role="status" style={vars({ "--slc-x": `${x(active)}%` })}>
            <span className="slc-tip-season">{shown.season}</span>
            <span className="slc-tip-value">{shown.value === null ? "Unknown" : format(shown.value)}</span>
          </span>
        </>}
      </div>
      <div className="slc-x" aria-hidden="true">
        {points.map((p, i) => <span key={p.season} className="slc-x-label" data-odd={i % 2 === 1 || undefined} style={vars({ "--slc-x": `${x(i)}%` })}>{p.season}</span>)}
      </div>
    </div>
  </figure>;
}
