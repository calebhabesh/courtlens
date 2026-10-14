"use client";

import { useState, type ReactNode } from "react";
import { SlidingIndicator } from "./ui/sliding-indicator";

export interface StatsChoice<T extends string> {
  id: T;
  label: ReactNode;
  title?: string;
  disabled?: boolean;
}

interface StatsChoicePillsProps<T extends string> {
  label: string;
  className: string;
  indicatorId: string;
  options: readonly StatsChoice<T>[];
  value: T;
  onSelect: (value: T) => void;
}

/**
 * Single-choice pill row above the Stats table. The selection lives here, so a click repaints only
 * these pills and starts the slide; the explorer's table re-render begins a frame later.
 */
export function StatsChoicePills<T extends string>({ label, className, indicatorId, options, value, onSelect }: StatsChoicePillsProps<T>) {
  const [shown, setShown] = useState(value);
  const [synced, setSynced] = useState(value);
  if (value !== synced) {
    setSynced(value);
    setShown(value);
  }
  const select = (next: T) => {
    if (next === shown) return;
    setShown(next);
    requestAnimationFrame(() => setTimeout(() => onSelect(next), 0));
  };
  return (
    <div className={`control-button-group ${className}`} role="group" aria-label={label}>
      {options.map(option => (
        <button key={option.id} type="button" className={`control-pill ${shown === option.id ? "active" : ""}`}
          title={option.title} disabled={option.disabled} aria-pressed={shown === option.id} onClick={() => select(option.id)}>
          {shown === option.id && <SlidingIndicator layoutId={indicatorId} className="stats-preset-indicator" />}
          <span>{option.label}</span>
        </button>
      ))}
    </div>
  );
}
