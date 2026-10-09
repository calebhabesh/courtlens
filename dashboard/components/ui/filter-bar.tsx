"use client";

import { useEffect, useState, type ReactNode } from "react";
import { Button } from "./button";
import { Drawer } from "./drawer";

export interface FilterBarProps {
  /** Global scope controls: Season · Phase · Through date, plus Window where the page uses it. */
  scope: ReactNode;
  /** Page-specific filters (chips or segmented controls), placed after the scope controls. */
  filters?: ReactNode;
  /**
   * Controls that switch what the page shows rather than which data is in scope (Showcase Focus,
   * Roster Shapes Observed/Projected). Inline on desktop; below 768px they stay visible as their
   * own row instead of moving into the Filters sheet (gate 2 decision).
   */
  modes?: ReactNode;
  /** Count/coverage chip on the right, e.g. "591 players". */
  count?: ReactNode;
  /** Right-aligned trailing action, normally the Data details button. */
  details?: ReactNode;
  /** Short summary of the active scope for the collapsed "Filters" button on narrow screens. */
  summary?: string;
  label?: string;
  className?: string;
}

const NARROW = "(max-width: 767px)";

/**
 * The one sticky filter bar (D6). Controls apply immediately; there is no Load button. Below
 * 768px the controls collapse into a "Filters" button that opens a bottom sheet (D25).
 */
export function FilterBar({ scope, filters, modes, count, details, summary, label = "Research context controls", className = "" }: FilterBarProps) {
  const [sheetOpen, setSheetOpen] = useState(false);

  useEffect(() => {
    if (!sheetOpen) return;
    const query = window.matchMedia(NARROW);
    const onChange = () => { if (!query.matches) setSheetOpen(false); };
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, [sheetOpen]);

  return (
    <div className={`ui-filter-bar ${modes ? "has-modes" : ""} ${className}`} role="region" aria-label={label}>
      <div className="ui-filter-bar-controls">
        <div className="ui-filter-bar-scope">{scope}</div>
        {filters && <div className="ui-filter-bar-page">{filters}</div>}
      </div>
      {modes && <div className="ui-filter-bar-modes">{modes}</div>}
      <Button className="ui-filter-bar-toggle" icon="sliders" onClick={() => setSheetOpen(true)} aria-haspopup="dialog">
        Filters{summary ? <span className="ui-filter-bar-summary">{summary}</span> : null}
      </Button>
      {(count || details) && (
        <div className="ui-filter-bar-meta">
          {count}
          {details}
        </div>
      )}
      <Drawer isOpen={sheetOpen} onClose={() => setSheetOpen(false)} side="bottom" title="Filters" className="ui-filter-sheet">
        <div className="ui-filter-sheet-body">
          {scope}
          {filters}
        </div>
      </Drawer>
    </div>
  );
}

export function CountChip({ children }: { children: ReactNode }) {
  return <span className="ui-count-chip">{children}</span>;
}
