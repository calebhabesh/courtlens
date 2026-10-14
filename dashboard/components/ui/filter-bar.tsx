"use client";

import { useEffect, useState, type ReactNode } from "react";
import { ControlScope, useControlScope } from "./control-scope";
import { Drawer } from "./drawer";
import { Button } from "./kit";

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
  /**
   * False for a fixed scope with nothing to choose (a sealed report, a calculator): the scope line
   * stays inline on phones instead of hiding behind a "Filters" sheet that would hold no control.
   */
  collapsible?: boolean;
  className?: string;
}

const NARROW = "(max-width: 767px)";

/**
 * The one sticky filter bar (D6). Controls apply immediately; there is no Load button. Below
 * 768px the controls collapse into a "Filters" button that opens a bottom sheet (D25).
 */
export function FilterBar({ scope, filters, modes, count, details, summary, label = "Research context controls", collapsible = true, className = "" }: FilterBarProps) {
  const [sheetOpen, setSheetOpen] = useState(false);
  const { tone } = useControlScope();

  useEffect(() => {
    if (!sheetOpen) return;
    const query = window.matchMedia(NARROW);
    const onChange = () => { if (!query.matches) setSheetOpen(false); };
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, [sheetOpen]);

  // Slim 32 px controls on desktop; the kit keeps its 40 px hit area on phones (owner, 2026-10-14).
  return (
    <ControlScope size="sm">
    <div className={`ui-filter-bar ${modes ? "has-modes" : ""} ${collapsible ? "" : "is-fixed-scope"} ${className}`} role="region" aria-label={label}>
      <div className="ui-filter-bar-controls">
        <div className="ui-filter-bar-scope">{scope}</div>
        {filters && <div className="ui-filter-bar-page">{filters}</div>}
      </div>
      {modes && <div className="ui-filter-bar-modes">{modes}</div>}
      {collapsible && <span className="filter-bar-toggle-slot"><Button size="lg" tone={tone} stretch icon="sliders" onClick={() => setSheetOpen(true)} aria-haspopup="dialog">
        Filters{summary ? <>{" "}<span className="ui-filter-bar-summary">{summary}</span></> : null}
      </Button></span>}
      {(count || details) && (
        <div className="ui-filter-bar-meta">
          {count}
          {details}
        </div>
      )}
      {collapsible && <Drawer isOpen={sheetOpen} onClose={() => setSheetOpen(false)} side="bottom" title="Filters" className="ui-filter-sheet">
        <div className="ui-filter-sheet-body"><ControlScope fill>
          {scope}
          {filters}
        </ControlScope></div>
      </Drawer>}
    </div>
    </ControlScope>
  );
}

export function CountChip({ children }: { children: ReactNode }) {
  return <span className="ui-count-chip">{children}</span>;
}
