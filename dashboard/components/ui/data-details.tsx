"use client";

import { useState, type ReactNode } from "react";
import { formatDate, throughDateFromBefore } from "../../lib/format-date";
import { Button } from "./button";
import { Drawer } from "./drawer";

export interface DataScope {
  releaseId?: string | null;
  season?: string | null;
  phase?: string | null;
  /** Exclusive cutoff from the URL: only games dated strictly before it are included. */
  beforeDate?: string | null;
  window?: string | null;
  lastIncludedDate?: string | null;
}

export interface DataDetailRow {
  label: string;
  value: ReactNode;
  /** Render as code (IDs, hashes, routes). */
  mono?: boolean;
}

export interface DataDetailsProps {
  open: boolean;
  onClose: () => void;
  scope?: DataScope;
  rows?: DataDetailRow[];
  /** Small heading above the title, e.g. "Source lineage". */
  kicker?: string;
  children?: ReactNode;
}

function DetailList({ rows }: { rows: DataDetailRow[] }) {
  return (
    <dl className="ui-data-details-list">
      {rows.map((row, index) => (
        <div className="ui-data-details-row" key={`${index}-${row.label}`}>
          <dt>{row.label}</dt>
          <dd className={row.mono ? "font-mono" : undefined}>{row.value ?? "—"}</dd>
        </div>
      ))}
    </dl>
  );
}

const SCOPE_LABELS: Record<string, string> = {
  regular_season: "Regular Season", playoffs: "Playoffs", play_in: "Play-In", preseason: "Preseason",
  cup_final: "NBA Cup Final", summer_league: "Summer League", season: "Season to date",
  last_10: "Last 10 appearances", last_5: "Last 5 appearances"
};
const scopeLabel = (value: string) => SCOPE_LABELS[value] ?? value.replaceAll("_", " ");

export function scopeRows(scope: DataScope): DataDetailRow[] {
  const rows: DataDetailRow[] = [];
  if (scope.releaseId) rows.push({ label: "Release", value: scope.releaseId, mono: true });
  if (scope.season) rows.push({ label: "Season", value: scope.season });
  if (scope.phase) rows.push({ label: "Phase", value: scopeLabel(scope.phase) });
  if (scope.beforeDate) {
    rows.push({ label: "Through", value: formatDate(throughDateFromBefore(scope.beforeDate)) });
    rows.push({
      label: "Cutoff rule",
      value: `Exclusive: includes only games dated before ${scope.beforeDate} in America/New_York (game_date < ${scope.beforeDate}).`
    });
  }
  if (scope.window) rows.push({ label: "Window", value: scopeLabel(scope.window) });
  if (scope.lastIncludedDate) rows.push({ label: "Last included game", value: formatDate(scope.lastIncludedDate) });
  return rows;
}

/**
 * Data details (D5): the one place for release IDs, dataset IDs, hashes, exclusive-cutoff rules
 * and source routes. Pages keep these out of the main flow and link here instead.
 */
export function DataDetails({ open, onClose, scope, rows = [], kicker, children }: DataDetailsProps) {
  const scoped = scope ? scopeRows(scope) : [];
  return (
    <Drawer
      isOpen={open}
      onClose={onClose}
      className="ui-data-details"
      title={<>{kicker && <span className="ui-data-details-kicker">{kicker}</span>}Data details</>}
    >
      {scoped.length > 0 && (
        <section className="ui-data-details-section" aria-label="Scope">
          <h3 className="ui-data-details-heading">Scope</h3>
          <DetailList rows={scoped} />
        </section>
      )}
      {rows.length > 0 && (
        <section className="ui-data-details-section" aria-label="Sources">
          <h3 className="ui-data-details-heading">Sources</h3>
          <DetailList rows={rows} />
        </section>
      )}
      {children}
    </Drawer>
  );
}

/** Trigger for page-level Data details, placed at the right of the filter bar or page header. */
export function DataDetailsButton({ scope, rows, children, label = "Data details" }: { scope?: DataScope; rows?: DataDetailRow[]; children?: ReactNode; label?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="ghost" size="sm" icon="database" onClick={() => setOpen(true)} aria-haspopup="dialog"><span className="ui-hide-narrow">{label}</span></Button>
      <DataDetails open={open} onClose={() => setOpen(false)} scope={scope} rows={rows}>{children}</DataDetails>
    </>
  );
}
