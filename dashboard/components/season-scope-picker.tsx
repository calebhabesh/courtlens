"use client";

import { useState } from "react";

import { Field } from "@/components/ui/field";
import { Icon } from "@/components/ui/icon";
import { Button, Chip, MenuTrigger, Segmented } from "@/components/ui/kit";
import { Popover } from "@/components/ui/menu";
import { Select } from "@/components/ui/select";
import { QUICK_RANGES, quickRangeFrom, seasonScopeLabel, seasonsBetween } from "@/lib/season-range";
import { useControlScope } from "@/components/ui/control-scope";

type Mode = "single" | "multi";

interface SeasonScopePickerProps {
  /** Every admitted season. */
  seasons: string[];
  /** The selected season, or the Through season of a range. */
  season: string;
  /** The range's first season; null for a single season. */
  seasonFrom: string | null;
  /** Applies a choice: a null `from` means a single season. */
  onApply: (from: string | null, through: string) => void;
}

/** Databallr-style season control: one season, or a From–Through range with quick ranges. */
export function SeasonScopePicker({ seasons, season, seasonFrom, onApply }: SeasonScopePickerProps) {
  const placement = useControlScope();
  const newestFirst = [...seasons].sort().reverse();
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<Mode>(seasonFrom ? "multi" : "single");
  const [from, setFrom] = useState(seasonFrom ?? quickRangeFrom(seasons, season, QUICK_RANGES[0]));
  const [through, setThrough] = useState(season);
  const range = seasonFrom ? seasonsBetween(seasons, seasonFrom, season) : null;
  const pending = seasonsBetween(seasons, from, through);
  const label = seasonScopeLabel(range, season);

  const openChange = (next: boolean) => {
    if (next) {
      // Reopening shows the applied scope, not an abandoned edit.
      setMode(seasonFrom ? "multi" : "single");
      setFrom(seasonFrom ?? quickRangeFrom(seasons, season, QUICK_RANGES[0]));
      setThrough(season);
    }
    setOpen(next);
  };
  const apply = (nextFrom: string | null, nextThrough: string) => {
    setOpen(false);
    onApply(nextFrom && nextFrom !== nextThrough ? nextFrom : null, nextThrough);
  };

  return (
    <Popover
      open={open}
      onOpenChange={openChange}
      className="season-scope-popover"
      triggerLabel={`Season: ${label}`}
      renderTrigger={props => (
        <MenuTrigger {...props} size={placement.size ?? "lg"}>
          <Icon name="calendar" size={16} className="season-scope-icon" />
          <span className="season-scope-value">{label}</span>
        </MenuTrigger>
      )}
    >
      <div className="season-scope-panel">
        <Segmented<Mode>
          label="Season mode"
          size="sm"
          stretch
          value={mode}
          onChange={setMode}
          options={[
            { value: "single", label: "Single season" },
            { value: "multi", label: "Multi-season", disabled: seasons.length < 2 }
          ]}
        />
        {mode === "single" ? (
          <Field label="Season">
            <Select value={range ? "" : season} onChange={(e) => apply(null, e.target.value)} aria-label="Season">
              {range && <option value="" disabled>Choose a season</option>}
              {!range && !seasons.includes(season) && <option value={season}>{season} · unavailable</option>}
              {newestFirst.map((s) => <option key={s} value={s}>{s}</option>)}
            </Select>
          </Field>
        ) : (
          <>
            <div className="season-scope-range">
              <Field label="From">
                <Select value={from} aria-label="From season"
                  onChange={(e) => { setFrom(e.target.value); if (e.target.value > through) setThrough(e.target.value); }}>
                  {newestFirst.map((s) => <option key={s} value={s}>{s}</option>)}
                </Select>
              </Field>
              <Field label="Through">
                <Select value={through} aria-label="Through season"
                  onChange={(e) => { setThrough(e.target.value); if (e.target.value < from) setFrom(e.target.value); }}>
                  {newestFirst.map((s) => <option key={s} value={s}>{s}</option>)}
                </Select>
              </Field>
            </div>
            <Field label="Quick range">
              <div className="season-scope-quick" role="group" aria-label="Quick range">
                {QUICK_RANGES.map((years) => {
                  const start = quickRangeFrom(seasons, through, years);
                  return (
                    <Chip key={years} size="sm"
                      pressed={from === start && seasonsBetween(seasons, start, through).length === years}
                      onClick={() => setFrom(start)}>
                      {years}Y
                    </Chip>
                  );
                })}
              </div>
            </Field>
            <Button size="lg" variant="primary" disabled={pending.length < 2}
              onClick={() => apply(from, through)}>
              Show {pending.length} seasons
            </Button>
          </>
        )}
      </div>
    </Popover>
  );
}
