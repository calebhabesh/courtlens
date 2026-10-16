"use client";

import type { CompareCountingMode } from "@/lib/comparison-metrics";
import { Menu, MenuItem } from "./ui/menu";
import { MenuTrigger } from "./ui/kit";

/** One subtitle for every player count, so the page header never changes as players come and go. */
export const COMPARE_SUBTITLE = "Compare stats between up to five NBA players";

export const COUNTING_MODES: { value: CompareCountingMode; label: string; rate?: boolean }[] = [
  { value: "per_game", label: "Per Game" }, { value: "per_75", label: "Per 75", rate: true },
  { value: "per_100", label: "Per 100", rate: true }, { value: "raw", label: "Totals" }
];

export type CountingChoice = CompareCountingMode | "career:per_game" | "career:raw";

/**
 * Season or career and the counting mode in one menu (alignment row 3, 21-22). A stable
 * trigger slot and the shared menu keep native option outlines out of the card.
 */
export function CountingMenu({ value, season, rates, onChange }: { value: CountingChoice; season: string; rates: string[]; onChange: (value: CountingChoice) => void }) {
  const careerModes: { value: CountingChoice; label: string }[] = [{ value: "career:per_game", label: "Career · Per Game" }, { value: "career:raw", label: "Career · Totals" }];
  const label = [...COUNTING_MODES, ...careerModes].find(entry => entry.value === value)?.label ?? "Per Game";
  return <Menu className="pvp-counting-menu" align="right" renderTrigger={props => <MenuTrigger {...props} size="sm" aria-label={`Counting mode, ${label}`}>{label}</MenuTrigger>}>
    <div role="group" aria-label={season}>
      <p className="pvp-counting-group" aria-hidden="true">{season}</p>
      {COUNTING_MODES.map(entry => <MenuItem key={entry.value} label={entry.rate && !rates.includes(entry.value) ? `${entry.label} (needs possession data)` : entry.label}
        disabled={entry.rate && !rates.includes(entry.value)} icon={value === entry.value ? "check" : undefined}
        className={value === entry.value ? "pvp-counting-current" : undefined} onClick={() => onChange(entry.value)} />)}
    </div>
    <div role="group" aria-label={`Career through ${season}`}>
      <p className="pvp-counting-group" aria-hidden="true">Career through {season}</p>
      {careerModes.map(entry => <MenuItem key={entry.value} label={entry.label} icon={value === entry.value ? "check" : undefined}
        className={value === entry.value ? "pvp-counting-current" : undefined} onClick={() => onChange(entry.value)} />)}
    </div>
  </Menu>;
}

/** The counting choice as URL values: career spans keep per game or totals only. */
export function countingParams(value: CountingChoice): Record<string, string> {
  const [first, second] = value.split(":");
  return second ? { span: "career", countingMode: second } : { span: "season", countingMode: first };
}
