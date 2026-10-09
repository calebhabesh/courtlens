import type { ReactNode } from "react";
import { Icon } from "./icon";

export interface GatedNoteProps {
  /** One plain line, e.g. "No games on Oct 8." */
  children: ReactNode;
  /**
   * Detail behind the "Why?" disclosure: limitations, required caveat wording (D14) and source
   * rules. It stays in the DOM while collapsed so required wording is still rendered.
   */
  why?: ReactNode;
  /** One useful next step, e.g. a jump to the nearest date with games. */
  action?: ReactNode;
  tone?: "neutral" | "warning";
  className?: string;
}

/** Missing or gated data in the main flow (D4): one line, an optional action, and "Why?". */
export function GatedNote({ children, why, action, tone = "neutral", className = "" }: GatedNoteProps) {
  return (
    <div className={`ui-gated-note ui-gated-note-${tone} ${className}`} role="note">
      <div className="ui-gated-note-line">
        <Icon name={tone === "warning" ? "alert" : "info"} size={16} className="ui-gated-note-icon" />
        <span className="ui-gated-note-text">{children}</span>
        {action && <span className="ui-gated-note-action">{action}</span>}
      </div>
      {why && (
        <details className="ui-why">
          <summary className="ui-why-summary">Why?</summary>
          <div className="ui-why-body">{why}</div>
        </details>
      )}
    </div>
  );
}
