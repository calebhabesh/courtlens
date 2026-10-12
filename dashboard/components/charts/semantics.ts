import type { CSSProperties } from "react";
import type { GoodDirection } from "@/lib/percentile-display";
import type { MetricDefinition } from "@/lib/types";

export type Identity = "a" | "b";
export type Category = 1 | 2 | 3 | 4 | 5 | 6;
export type ContractStatus = "guaranteed" | "reported" | "player-option" | "team-option" | "two-way" | "projected" | "unknown";
export type ChartTone = `identity-${Identity}` | `category-${Category}` | `status-${ContractStatus}`;
export const CATEGORIES: Category[] = [1, 2, 3, 4, 5, 6];
export const STATUS_LABELS: Record<ContractStatus, string> = {
  guaranteed: "Guaranteed", reported: "Reported salary", "player-option": "Player option", "team-option": "Team option",
  "two-way": "Two-way", projected: "Projected", unknown: "Unknown"
};
export const toneColor = (tone: ChartTone): string => `var(--color-${tone})`;
export const knownNumber = (value: number | null | undefined): value is number => typeof value === "number" && Number.isFinite(value);
export const nonnegative = (value: number | null | undefined): value is number => knownNumber(value) && value >= 0;
export const numberLabel = (value: number | null | undefined): string => knownNumber(value) ? value.toLocaleString("en-US", { maximumFractionDigits: 2 }) : "—";

/** Only the catalog declares direction. A default sort order is not a value judgment. */
export function comparisonFlags(metric: Pick<MetricDefinition, "good_direction">): { direction: GoodDirection; lowerIsBetter: boolean | null } {
  const direction = metric.good_direction ?? null;
  return { direction, lowerIsBetter: direction === null ? null : direction === "low" };
}

export function leadingIdentity(a: number | null | undefined, b: number | null | undefined, direction: GoodDirection): Identity | null {
  if (!knownNumber(a) || !knownNumber(b) || a === b || !direction) return null;
  return (direction === "low" ? a < b : a > b) ? "a" : "b";
}

/** All dynamic styling crosses this typed custom-property boundary. Geometry stays in SVG. */
export function chartVars(values: Partial<Record<"--chart-tone" | "--chart-cell" | "--chart-columns" | "--chart-position", string | number>>): CSSProperties {
  return values as CSSProperties;
}

/** Input is already oriented by the server/catalog helper. This kit never recomputes rank. */
export function percentileBand(percentile: number | null | undefined): number | null {
  if (!knownNumber(percentile) || percentile < 0 || percentile > 100) return null;
  return Math.min(5, Math.floor(percentile / 20) + 1);
}
