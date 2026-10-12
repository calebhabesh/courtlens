import type { CSSProperties, ReactNode } from "react";

/** Databallr-style data point: the value printed inside the marker. Width follows the label. */
export function ValueDot({ x, y, label, color, title, large = false }: {
  x: number;
  y: number;
  label: string;
  /** Series fill; defaults to the inherited --series custom property. */
  color?: string;
  title?: ReactNode;
  large?: boolean;
}) {
  const height = large ? 24 : 20;
  const width = Math.max(height, Math.ceil(label.length * (large ? 7 : 6.2)) + (large ? 12 : 10));
  return (
    <g className={`chart-value-dot ${large ? "is-large" : ""}`} style={color ? dotColor(color) : undefined}>
      <rect x={x - width / 2} y={y - height / 2} width={width} height={height} rx={height / 2} />
      <text x={x} y={y} dy="0.35em" textAnchor="middle">{label}</text>
      {title && <title>{title}</title>}
    </g>
  );
}

function dotColor(color: string): CSSProperties {
  return { "--series": color } as CSSProperties;
}

/** Labels fit inside markers only while points are at least this far apart (viewBox units). */
export function valueDotsFit(count: number, plotWidth: number, minGap = 30): boolean {
  return count <= 1 || plotWidth / (count - 1) >= minGap;
}
