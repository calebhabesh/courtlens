import React from "react";
import type { GoodDirection } from "@/lib/percentile-display";
import { chartVars, knownNumber, leadingIdentity, numberLabel, toneColor } from "./semantics";

export interface DeltaChipProps {
  a: number | null | undefined;
  b: number | null | undefined;
  direction: GoodDirection;
  names: [string, string];
  unit?: string;
  precision?: number;
}

/** A metric-specific difference in the leading subject's color. Never an overall verdict. */
export function DeltaChip({ a, b, direction, names, unit = "", precision = 1 }: DeltaChipProps) {
  const leader = leadingIdentity(a, b, direction);
  const known = knownNumber(a) && knownNumber(b);
  const difference = known ? a - b : null;
  const magnitude = known ? Math.abs(difference!).toFixed(precision) : "—";
  const detail = !known ? "Difference unknown" : difference === 0 ? "Equal observed values"
    : leader ? `${names[leader === "a" ? 0 : 1]}: ${magnitude}${unit ? ` ${unit}` : ""} ${direction === "low" ? "fewer" : "more"}`
      : `${names[0]} minus ${names[1]}: ${numberLabel(difference)}${unit ? ` ${unit}` : ""}; no favorable direction declared`;
  return <span className="chart-delta" data-identity={leader ?? "neutral"}
    style={chartVars({ "--chart-tone": leader ? toneColor(`identity-${leader}`) : "var(--color-text-secondary)" })} title={detail}>
    <span aria-hidden="true">{!known ? "—" : difference === 0 ? "0" : leader ? `+${magnitude}${direction === "low" ? " fewer" : ""}` : `${difference! > 0 ? "+" : ""}${difference!.toFixed(precision)}`}</span>
    <span className="sr-only">{detail}</span>
  </span>;
}
