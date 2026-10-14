import type { CSSProperties, ReactNode } from "react";

/** Databallr-style data point: the value printed inside the marker. Width follows the label. */
export function ValueDot({ x, y, label, color, title, large = false, round = false, radius: fitted }: {
  x: number;
  y: number;
  label: string;
  /** Series fill; defaults to the inherited --series custom property. */
  color?: string;
  title?: ReactNode;
  large?: boolean;
  /** A circle sized to the label, with a halo ring behind it, instead of a pill. */
  round?: boolean;
  /** Round only: a smaller radius so dense series still print every value (compact text). */
  radius?: number;
}) {
  const height = large ? 24 : 20;
  const width = Math.max(height, Math.ceil(label.length * (large ? 7 : 6.2)) + (large ? 12 : 10));
  const natural = valueDotRadius(label, large);
  const compact = fitted !== undefined && fitted < natural;
  const radius = compact ? fitted : natural;
  return (
    <g className={`chart-value-dot ${large ? "is-large" : ""} ${round ? "is-round" : ""} ${compact ? "is-compact" : ""}`} style={color ? dotColor(color) : undefined}>
      {round ? <>
        <circle className="chart-value-dot-halo" cx={x} cy={y} r={radius + (compact ? 2 : 4)} />
        <circle cx={x} cy={y} r={radius} />
      </> : <rect x={x - width / 2} y={y - height / 2} width={width} height={height} rx={height / 2} />}
      <text x={x} y={y} dy="0.35em" textAnchor="middle">{label}</text>
      {title && <title>{title}</title>}
    </g>
  );
}

function dotColor(color: string): CSSProperties {
  return { "--series": color } as CSSProperties;
}

/** Radius of a round value dot: the label fits inside with a little padding. */
export function valueDotRadius(label: string, large = false): number {
  return Math.max(large ? 14 : 12, Math.ceil(label.length * (large ? 6.4 : 5.8)) / 2 + 4);
}

/** Labels fit inside markers only while points are at least this far apart (viewBox units). */
export function valueDotsFit(count: number, plotWidth: number, minGap = 30): boolean {
  return count <= 1 || plotWidth / (count - 1) >= minGap;
}
