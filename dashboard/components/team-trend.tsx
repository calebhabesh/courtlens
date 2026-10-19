import { useId } from "react";
import { formatDate } from "@/lib/format-date";
import { formatValue } from "@/lib/team-six-factors";

type Point = { date: string; net: number };
const W = 320, H = 72, FULL_W = 960, FULL_H = 200;

/**
 * Rolling ten-game net rating as a line around zero: gold above league average, blue below
 * (the table's tones). `card` is a sparkline; `full` adds the zero line's scale and dates.
 */
export function NetTrend({ points, variant = "card", label }: { points: Point[]; variant?: "card" | "full"; label: string }) {
  const id = useId().replace(/:/g, "");
  if (points.length < 2) return <p className="net-trend-empty">Fewer than ten games in scope, so no ten-game trend yet.</p>;
  const width = variant === "full" ? FULL_W : W, height = variant === "full" ? FULL_H : H;
  const pad = variant === "full" ? 8 : 4;
  // Fits the data, always keeping zero (league average) and at least ±5 in view.
  const top = Math.max(5, ...points.map(point => point.net)), bottom = Math.min(-5, ...points.map(point => point.net));
  const x = (index: number) => (index / (points.length - 1)) * width;
  const y = (net: number) => pad + ((top - net) / (top - bottom)) * (height - 2 * pad);
  const line = points.map((point, index) => `${index ? "L" : "M"}${x(index).toFixed(1)},${y(point.net).toFixed(1)}`).join("");
  const zero = y(0);
  const area = `${line}L${width},${zero.toFixed(1)}L0,${zero.toFixed(1)}Z`;
  const last = points[points.length - 1];
  const best = points.reduce((a, b) => b.net > a.net ? b : a), worst = points.reduce((a, b) => b.net < a.net ? b : a);
  const summary = `${label}: ten-game net rating from ${formatValue(points[0].net, "signed", "per_100")} on ${formatDate(points[0].date)} to ${formatValue(last.net, "signed", "per_100")} on ${formatDate(last.date)}; high ${formatValue(best.net, "signed", "per_100")}, low ${formatValue(worst.net, "signed", "per_100")}.`;
  return <figure className="net-trend" data-variant={variant}>
    <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" role="img" aria-label={summary}>
      <defs>
        <clipPath id={`${id}-up`}><rect x="0" y="0" width={width} height={zero} /></clipPath>
        <clipPath id={`${id}-down`}><rect x="0" y={zero} width={width} height={height - zero} /></clipPath>
      </defs>
      <path className="net-trend-area" data-tone="up" d={area} clipPath={`url(#${id}-up)`} />
      <path className="net-trend-area" data-tone="down" d={area} clipPath={`url(#${id}-down)`} />
      <line className="net-trend-zero" x1="0" x2={width} y1={zero} y2={zero} />
      <path className="net-trend-line" data-tone="up" d={line} clipPath={`url(#${id}-up)`} />
      <path className="net-trend-line" data-tone="down" d={line} clipPath={`url(#${id}-down)`} />
    </svg>
    {variant === "full" && <figcaption className="net-trend-scale" aria-hidden="true">
      <span>{formatValue(top, "signed", "per_100")}</span><span>{formatValue(bottom, "signed", "per_100")}</span>
    </figcaption>}
    {variant === "full" && <div className="net-trend-dates" aria-hidden="true"><span>{formatDate(points[0].date)}</span><span>{formatDate(last.date)}</span></div>}
  </figure>;
}
