import React from "react";
import { chartVars, knownNumber, percentileBand } from "./semantics";

export interface PercentileCellProps {
  value: number | string | null;
  percentile: number | null;
  qualified: boolean;
  label: string;
  /** Describe the server's actual cohort/qualification rule beside the value. */
  cohort: string;
}

export function PercentileCell({ value, percentile, qualified, label, cohort }: PercentileCellProps) {
  const observed = value !== null && (typeof value !== "number" || knownNumber(value));
  const band = observed && qualified ? percentileBand(percentile) : null;
  return <span className="chart-percentile-cell" data-qualified={qualified}
    style={chartVars({ "--chart-cell": band ? `var(--color-percentile-${band})` : "var(--color-surface-2)" })}>
    <strong>{observed ? value : "—"}</strong>
    <small>{!observed ? "Unknown" : !qualified ? "Small sample" : band ? `${percentile!.toFixed(0)} pct` : "Rank unknown"}</small>
    <span className="sr-only">{label}; {cohort}; {qualified ? "qualified" : "unqualified"}. Higher oriented percentile has stronger blue shading.</span>
  </span>;
}
