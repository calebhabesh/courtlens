"use client";

import { useState, type CSSProperties, type KeyboardEvent, type PointerEvent } from "react";

/*
 * One measure by season as a line on one axis (RD06, Learning's league trends): never two y-scales. Axis labels, grid,
 * points and the tooltip are HTML placed with CSS custom properties, so text never stretches; the SVG draws only the line.
 * Hover or arrow keys move a crosshair and a tooltip; the table beside it is the accessible full view.
 */

/** `season` is the x label (any short label: a season, a pick). `low`/`high` draw an interval band; `label` heads the tooltip. */
export interface SeasonPoint { season: string; value: number | null; low?: number | null; high?: number | null; label?: string }

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

/** Drops the padding ticks a banded chart doesn't need: a tick is kept only if the data reaches past the next one by over 3% of its span (RD08). */
function trimmed(ticks: number[], values: readonly number[]): number[] {
  const low = Math.min(...values), high = Math.max(...values), slack = (high - low) * 0.03;
  let start = 0, end = ticks.length - 1;
  while (start < end - 1 && ticks[start + 1] <= low + slack) start += 1;
  while (end > start + 1 && ticks[end - 1] >= high - slack) end -= 1;
  return ticks.slice(start, end + 1);
}

const vars = (props: Record<string, string>) => props as CSSProperties;

export function SeasonLineChart({ label, points, format, axisFormat = format, band, xTicks }: {
  label: string;
  points: readonly SeasonPoint[];
  format: (value: number) => string;
  axisFormat?: (value: number) => string;
  /** Names the interval drawn from each point's `low`/`high` ("95%"); without it no band is drawn (RD08). */
  band?: string;
  /** Indexes of the points whose x label is shown; every label by default. */
  xTicks?: readonly number[];
}) {
  const [active, setActive] = useState<number | null>(null);
  const known = points.map(p => p.value).filter((v): v is number => v !== null && Number.isFinite(v));
  if (known.length < 2) return <p className="slc-empty">Not enough seasons to draw a line.</p>;
  const bounded = (p: SeasonPoint): p is SeasonPoint & { low: number; high: number } => band !== undefined && typeof p.low === "number" && typeof p.high === "number";
  const span = [...known, ...points.filter(bounded).flatMap(p => [p.low, p.high])];
  const ticks = band === undefined ? niceTicks(span) : trimmed(niceTicks(span), span);
  const bottom = ticks[0], top = ticks[ticks.length - 1];
  const x = (index: number) => points.length === 1 ? 50 : (index / (points.length - 1)) * 100;
  const y = (value: number) => ((top - value) / (top - bottom)) * 100;
  let path = "", pen = false;
  points.forEach((p, i) => {
    if (p.value === null) { pen = false; return; }
    path += `${pen ? "L" : "M"}${x(i).toFixed(3)},${y(p.value).toFixed(3)}`;
    pen = true;
  });
  // The band: upper edges left to right, lower edges back, one closed shape per unbroken run of intervals.
  let area = "";
  let run: number[] = [];
  const close = () => {
    if (run.length > 1) area += run.map((i, k) => `${k ? "L" : "M"}${x(i).toFixed(3)},${y(points[i].high!).toFixed(3)}`).join("")
      + [...run].reverse().map(i => `L${x(i).toFixed(3)},${y(points[i].low!).toFixed(3)}`).join("") + "Z";
    run = [];
  };
  points.forEach((p, i) => { if (bounded(p)) run.push(i); else close(); });
  close();
  const shownLabels = xTicks ? new Set(xTicks) : null;
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
          {area && <path className="slc-band" d={area} />}
          <path className="slc-line" d={path} vectorEffect="non-scaling-stroke" />
        </svg>
        {points.map((p, i) => p.value === null ? null : <span key={p.season} className="slc-dot" aria-hidden="true" data-season={p.season} data-value={p.value}
          data-low={bounded(p) ? p.low : undefined} data-high={bounded(p) ? p.high : undefined}
          data-active={active === i || undefined} style={vars({ "--slc-x": `${x(i)}%`, "--slc-y": `${y(p.value)}%` })} />)}
        {shown && active !== null && <>
          <span className="slc-cross" aria-hidden="true" style={vars({ "--slc-x": `${x(active)}%` })} />
          <span className="slc-tip" data-edge={edge} role="status" style={vars({ "--slc-x": `${x(active)}%` })}>
            <span className="slc-tip-season">{shown.label ?? shown.season}</span>
            <span className="slc-tip-value">{shown.value === null ? "Unknown" : format(shown.value)}</span>
            {bounded(shown) && <span className="slc-tip-season">{band} {format(shown.low)} to {format(shown.high)}</span>}
          </span>
        </>}
      </div>
      <div className="slc-x" aria-hidden="true">
        {points.map((p, i) => shownLabels && !shownLabels.has(i) ? null : <span key={p.season} className="slc-x-label" data-odd={!shownLabels && i % 2 === 1 || undefined} style={vars({ "--slc-x": `${x(i)}%` })}>{p.season}</span>)}
      </div>
    </div>
  </figure>;
}
