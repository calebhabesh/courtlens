import { formatDate, throughDateFromBefore } from "./format-date";

// Display labels for the shared scope (filter bar, card context lines). Title Case per D16.
export const PHASES = [
  { value: "regular_season", label: "Regular Season" },
  { value: "playoffs", label: "Playoffs" },
  { value: "preseason", label: "Preseason" },
  { value: "play_in", label: "Play-In" },
  { value: "cup_final", label: "NBA Cup Final" }
];

export function phaseLabel(value: string): string {
  return PHASES.find((phase) => phase.value === value)?.label ?? value.replaceAll("_", " ");
}

/**
 * One context line for cards and exports (D16): "2025-26 Regular Season · Through Apr 12, 2026".
 * `beforeDate` is the exclusive cutoff; the line names the last included day (D20).
 */
export function scopeContextLine(season: string, phase: string, beforeDate?: string | null): string {
  const through = beforeDate ? throughDateFromBefore(beforeDate) : "";
  return `${season} ${phaseLabel(phase)}${through ? ` · Through ${formatDate(through)}` : ""}`;
}
