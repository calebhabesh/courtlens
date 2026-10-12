import React from "react";
import { chartVars, knownNumber, percentileBand } from "./semantics";

export interface PercentileCellProps {
  value: number | string | null;
  percentile: number | null;
  qualified: boolean;
  label: string;
  /** Describe the server's actual cohort/qualification rule beside the value. */
  cohort: string;
  compact?: boolean;
  showPercentile?: boolean;
}

export function PercentileCell({ value, percentile, qualified, label, cohort, compact = false, showPercentile = true }: PercentileCellProps) {
  const observed = value !== null && (typeof value !== "number" || knownNumber(value));
  const band = observed && qualified ? percentileBand(percentile) : null;
  return <span className={`chart-percentile-cell${compact ? " table-percentile-compact" : ""}`} data-qualified={qualified}
    title={`${label}; ${percentile == null ? "percentile unknown" : `${percentile.toFixed(0)} percentile`}; ${cohort}; ${qualified ? "qualified" : "small sample"}`}
    style={chartVars({ "--chart-cell": band ? `var(--color-percentile-${band})` : "var(--color-surface-2)" })}>
    <strong className="stat-main-value">{observed ? value : "—"}</strong>
    {showPercentile && <small className={compact ? "stat-pct-sublabel" : undefined}>{!observed ? "Unknown" : !qualified ? compact ? `${percentile == null ? "—" : percentile.toFixed(0)} pct · small` : "Small sample" : band ? `${percentile!.toFixed(0)} pct` : "Rank unknown"}</small>}
    <span className="sr-only">{label}; {cohort}; {qualified ? "qualified" : "unqualified"}. Higher oriented percentile has stronger blue shading.</span>
  </span>;
}
