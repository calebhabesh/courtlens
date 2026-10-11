import type { ReactNode } from "react";

/** 1 → "1st", 22 → "22nd", 113 → "113th". */
export function ordinal(value: number): string {
  const mod100 = value % 100;
  const suffix = mod100 >= 11 && mod100 <= 13 ? "th" : ({ 1: "st", 2: "nd", 3: "rd" } as Record<number, string>)[value % 10] ?? "th";
  return `${value}${suffix}`;
}

export interface StatTileProps {
  label: string;
  /** Preformatted value; null or undefined is unknown and renders an em dash, never zero. */
  value: string | number | null | undefined;
  unit?: string;
  /** League percentile in the page's eligible cohort, 0–100. */
  percentile?: number | null;
  rank?: number | null;
  /** Cohort size, for "1st of 591" in the accessible name and tooltip. */
  rankOf?: number | null;
  footnote?: ReactNode;
  size?: "md" | "lg";
  className?: string;
}

/**
 * A stat with its league context (D16): value, label, percentile bar and rank ("33.5 PPG · 1st").
 * Percentile and rank come from the caller's existing cohort computation; this only presents them.
 */
export function StatTile({ label, value, unit, percentile, rank, rankOf, footnote, size = "md", className = "" }: StatTileProps) {
  const known = value !== null && value !== undefined && value !== "";
  const pct = percentile === null || percentile === undefined ? null : Math.max(0, Math.min(100, percentile));
  const rankText = rank ? ordinal(rank) : null;
  const rankTitle = rank && rankOf ? `${ordinal(rank)} of ${rankOf}` : rankText ?? undefined;
  return (
    <div className={`ui-stat-tile ui-stat-tile-${size} ${className}`}>
      <span className="ui-stat-tile-label">{label}</span>
      <span className="ui-stat-tile-value-row">
        <span className="ui-stat-tile-value">
          {known ? value : <><span aria-hidden="true">—</span><span className="sr-only">{label} unavailable</span></>}
          {known && unit && <span className="ui-stat-tile-unit">{unit}</span>}
        </span>
        {rankText && <span className="ui-stat-tile-rank" title={rankTitle}>{rankText}</span>}
      </span>
      {pct !== null && (
        <span
          className="ui-stat-tile-bar"
          role="meter"
          aria-label={`${label} percentile`}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(pct)}
          aria-valuetext={`${ordinal(Math.round(pct))} percentile`}
          style={{ "--pct": `${pct}%` } as React.CSSProperties}
        >
          <span className="ui-stat-tile-bar-fill" />
        </span>
      )}
      {footnote && <span className="ui-stat-tile-footnote">{footnote}</span>}
    </div>
  );
}
