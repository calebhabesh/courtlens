"use client";

import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { addDays, formatDate, parseIsoDate, toIsoDate } from "../../lib/format-date";
import { Icon } from "./icon";

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const WEEKDAYS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];

export interface DatePickerProps {
  /** ISO calendar date (YYYY-MM-DD) or "" for none. */
  value: string;
  onChange: (value: string) => void;
  /** Accessible name, also used as the popover title. */
  label: string;
  min?: string;
  max?: string;
  /** Dates that cannot be chosen, e.g. dates with no games. They stay visible but dimmed. */
  isDateDisabled?: (value: string) => boolean;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
}

function monthStart(value: string): string {
  return `${value.slice(0, 7)}-01`;
}

function shiftMonth(value: string, months: number): string {
  const date = parseIsoDate(value)!;
  const day = date.getUTCDate();
  date.setUTCDate(1);
  date.setUTCMonth(date.getUTCMonth() + months);
  const lastDay = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate();
  date.setUTCDate(Math.min(day, lastDay));
  return toIsoDate(date);
}

function monthGrid(month: string): string[] {
  const first = parseIsoDate(monthStart(month))!;
  const start = addDays(toIsoDate(first), -first.getUTCDay());
  return Array.from({ length: 42 }, (_, index) => addDays(start, index));
}

/**
 * Styled, keyboard-accessible date picker (D11). Arrow keys move by day/week, PageUp/PageDown by
 * month, Home/End to the week's start/end, Enter or Space selects, Escape closes and returns focus.
 */
export function DatePicker({ value, onChange, label, min, max, isDateDisabled, placeholder = "Select a date", disabled = false, className = "" }: DatePickerProps) {
  const [open, setOpen] = useState(false);
  const fallback = value || max || toIsoDate(new Date());
  const [focused, setFocused] = useState(fallback);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  const titleId = useId();

  const unavailable = (day: string) => Boolean((min && day < min) || (max && day > max) || isDateDisabled?.(day));
  const days = useMemo(() => monthGrid(focused), [focused]);
  const displayMonth = parseIsoDate(focused)!;

  const close = (returnFocus: boolean) => {
    setOpen(false);
    if (returnFocus) triggerRef.current?.focus();
  };

  useEffect(() => {
    if (!open) return;
    gridRef.current?.querySelector<HTMLElement>(`[data-date="${focused}"]`)?.focus();
  }, [open, focused]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  const choose = (day: string) => {
    if (unavailable(day)) return;
    onChange(day);
    close(true);
  };

  const onGridKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const weekday = parseIsoDate(focused)!.getUTCDay();
    const moves: Record<string, () => string> = {
      ArrowLeft: () => addDays(focused, -1),
      ArrowRight: () => addDays(focused, 1),
      ArrowUp: () => addDays(focused, -7),
      ArrowDown: () => addDays(focused, 7),
      PageUp: () => shiftMonth(focused, event.shiftKey ? -12 : -1),
      PageDown: () => shiftMonth(focused, event.shiftKey ? 12 : 1),
      Home: () => addDays(focused, -weekday),
      End: () => addDays(focused, 6 - weekday)
    };
    if (moves[event.key]) {
      event.preventDefault();
      setFocused(moves[event.key]());
    } else if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      choose(focused);
    }
  };

  return (
    <div
      ref={rootRef}
      className={`ui-date-picker ${className}`}
      onKeyDown={(event) => {
        if (event.key === "Escape" && open) {
          event.preventDefault();
          event.stopPropagation();
          close(true);
        }
      }}
    >
      <button
        ref={triggerRef}
        type="button"
        className="ui-date-trigger"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={`${label}: ${value ? formatDate(value) : placeholder}`}
        data-value={value}
        disabled={disabled}
        onClick={() => {
          setFocused(value || fallback);
          setOpen((current) => !current);
        }}
      >
        <Icon name="calendar" size={16} />
        <span className={value ? "ui-date-value" : "ui-date-placeholder"}>{value ? formatDate(value) : placeholder}</span>
      </button>
      {open && (
        <div className="ui-date-popover" role="dialog" aria-modal="false" aria-labelledby={titleId}>
          <div className="ui-date-header">
            <button type="button" className="ui-date-nav" aria-label="Previous month" onClick={() => setFocused(shiftMonth(focused, -1))}
              disabled={Boolean(min && monthStart(focused) <= monthStart(min))}>
              <Icon name="left" size={16} />
            </button>
            <span id={titleId} className="ui-date-title" aria-live="polite">
              {MONTHS[displayMonth.getUTCMonth()]} {displayMonth.getUTCFullYear()}
            </span>
            <button type="button" className="ui-date-nav" aria-label="Next month" onClick={() => setFocused(shiftMonth(focused, 1))}
              disabled={Boolean(max && monthStart(focused) >= monthStart(max))}>
              <Icon name="right" size={16} />
            </button>
          </div>
          <div ref={gridRef} role="grid" aria-label={label} className="ui-date-grid" onKeyDown={onGridKeyDown}>
            <div role="row" className="ui-date-row">
              {WEEKDAYS.map((day) => <span key={day} role="columnheader" className="ui-date-weekday">{day}</span>)}
            </div>
            {Array.from({ length: 6 }, (_, week) => (
              <div role="row" className="ui-date-row" key={week}>
                {days.slice(week * 7, week * 7 + 7).map((day) => {
                  const outside = day.slice(0, 7) !== focused.slice(0, 7);
                  const off = unavailable(day);
                  return (
                    <span role="gridcell" key={day} aria-selected={day === value}>
                      <button
                        type="button"
                        data-date={day}
                        tabIndex={day === focused ? 0 : -1}
                        aria-label={`${formatDate(day)}${off ? ", unavailable" : ""}`}
                        aria-disabled={off || undefined}
                        className={`ui-date-day ${outside ? "is-outside" : ""} ${off ? "is-disabled" : ""} ${day === value ? "is-selected" : ""}`}
                        onClick={() => { setFocused(day); choose(day); }}
                      >
                        {Number(day.slice(8))}
                      </button>
                    </span>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
