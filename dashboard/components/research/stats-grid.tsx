"use client";

import Link from "next/link";
import { Fragment, type ReactNode } from "react";
import "../stats-explorer.css";
import { PlayerPortrait } from "../player-portrait";
import { SortHeader } from "../table-ui";
import { TeamLogo } from "../team-logo";
import { Icon } from "../ui/icon";
import type { PortraitEra } from "@/lib/portrait-source";

/*
 * The site's one table look (owner, RD01 round 3): the Stats page's NBA Player Statistics table. Renders the
 * Stats classes (frame, 26 px group tier over the column tier, lifted header, darker data cells, a pinned
 * player card with logo, photo, name and subtitle) so every Research table is a scaled equivalent of it.
 * `density="compact"` is the scaled-down version for small static tables.
 */

export interface GridColumn<T> {
  key: string;
  label: string;
  title?: string;
  /** Tier-1 group label; consecutive columns with the same group share it. */
  group?: string;
  /** Sort value; a column without one isn't sortable. */
  sort?: (row: T) => number | null;
  cell: (row: T) => ReactNode;
  /** `data-*` attributes for the cell (exact served values for checks). */
  data?: (row: T) => Record<string, string | number | undefined>;
  align?: "center" | "left" | "right";
  width?: "xs" | "sm" | "md" | "lg" | "xl" | "fill";
  /** Keep the label's own case (oTS, dContest, xPPS) instead of the header's capitals: a lowercase prefix carries meaning (RD04 round 5). */
  keepCase?: boolean;
  /** The Stats table's repeated photo strip at the start of a group: `cell` draws the photo, and the column has no label. */
  guide?: boolean;
}

export interface StatsGridProps<T> {
  label: string;
  rows: readonly T[];
  rowKey: (row: T) => string;
  /** `span`: the lead header fills both header rows, so a search field sits centred with equal space above and below. */
  lead: { label: ReactNode; cell: (row: T) => ReactNode; group?: string; span?: boolean };
  columns: readonly GridColumn<T>[];
  sort?: { key: string; direction: "asc" | "desc"; onSort: (key: string) => void };
  density?: "default" | "compact";
  /** `auto`: the frame grows with its rows (small static tables); otherwise it scrolls. */
  height?: "scroll" | "auto";
  leadWidth?: "sm" | "md" | "lg" | "xl";
  minWidth?: "narrow" | "default" | "wide";
  empty?: ReactNode;
  rowData?: (row: T) => Record<string, string | number | boolean | undefined>;
  className?: string;
  name?: string;
}

/** The Stats player card: logo, season photo, name over a subtitle, then any row tools. */
export function GridPlayer({ playerId, name, team, season, era, subtitle, href, tools }: {
  playerId?: string | null; name: string; team?: string | null; season?: string | null; era?: PortraitEra | null;
  subtitle?: ReactNode; href?: string; tools?: ReactNode;
}) {
  const body = <><span className="player-cell-name font-semibold">{name}</span>{subtitle && <span className="player-cell-teams">{subtitle}</span>}</>;
  return <span className="player-cell">
    {team ? <TeamLogo team={team} season={season ?? undefined} size={20} /> : <span className="rs-grid-unknown" aria-hidden="true">—</span>}
    <PlayerPortrait playerId={playerId ?? undefined} name={name} size="sm" era={era} className="stats-primary-portrait" />
    <span className="stats-identity-copy">{href ? <Link className="stats-player-link" href={href} title={name}>{body}</Link> : <span className="stats-player-link">{body}</span>}</span>
    {tools && <span className="rs-grid-tools">{tools}</span>}
  </span>;
}

/**
 * The Stats table's header search (owner, RD04 round 5: one search design in every table): the NBA Player Statistics markup,
 * `stats-header-search` › `lookup-input-wrapper` › icon and `lookup-input`, styled by the Stats CSS the grid already carries.
 * Put it in the lead header (`lead.label`). Escape clears it.
 */
export function GridSearch({ value, onChange, label = "Search players", placeholder = "Search players…" }: { value: string; onChange: (value: string) => void; label?: string; placeholder?: string }) {
  return <div className="stats-header-search rs-grid-search" role="search">
    <div className="lookup-input-wrapper">
      <Icon name="search" className="lookup-search-icon" />
      <input type="search" className="lookup-input" aria-label={label} placeholder={placeholder} autoComplete="off" spellCheck={false} value={value}
        onChange={event => onChange(event.target.value)} onKeyDown={event => { if (event.key === "Escape" && value) { event.preventDefault(); onChange(""); } }} />
    </div>
  </div>;
}

/**
 * A figure with an optional small second line; unknown is "—". `identity` (gold/blue) shows a sign; `tone` (green/red) is only for
 * a value whose served interval excludes zero (RD04), and `title` says why.
 */
export function GridValue({ text, sub, identity, tone, muted, title }: { text: string | null; sub?: string | null; identity?: "a" | "b"; tone?: "good" | "bad"; muted?: boolean; title?: string }) {
  if (text === null || text === "—") return <span className="rs-grid-value rs-grid-unknown">—</span>;
  return <><span className="rs-grid-value stat-main-value" data-identity={identity} data-tone={tone} data-muted={muted || undefined} title={title}>{text}</span>{sub != null && <span className="rs-grid-sub">{sub}</span>}</>;
}

export function StatsGrid<T>({ label, rows, rowKey, lead, columns, sort, density = "default", height = "scroll", leadWidth = "lg", minWidth = "default", empty, rowData, className = "", name }: StatsGridProps<T>) {
  const groups: { label: string; span: number; start: number }[] = [];
  columns.forEach((column, index) => {
    const last = groups.at(-1);
    if (column.group && last && last.label === column.group) last.span += 1;
    else groups.push({ label: column.group ?? "", span: 1, start: index });
  });
  const starts = new Set(groups.filter(g => g.start > 0).map(g => g.start));
  const hasGroups = columns.some(c => c.group) || Boolean(lead.group);
  const spanLead = Boolean(lead.span) && hasGroups;
  const leadHeader = typeof lead.label === "string" ? <span className="table-sort-button">{lead.label}</span> : lead.label;
  return <div className={`stats-workspace rs-grid ${density === "compact" ? "density-compact" : ""} ${className}`} data-height={height} data-lead={leadWidth} data-min={minWidth === "default" ? undefined : minWidth}>
    <div className="stats-table-frame is-table">
      <div className="table-wrapper stats-scroll-region" role="region" aria-label={`${label} scroll area`} tabIndex={0}>
        <table className="data-table dense-stats-table" data-table={name} aria-label={label}>
          <colgroup><col className="rs-col-lead" />{columns.map(c => <col key={c.key} className={c.guide ? "rs-col-guide" : `rs-col-${c.width ?? "sm"}`} />)}</colgroup>
          <thead>
            {hasGroups && <tr className="stats-header-tier-1">
              {spanLead ? <th scope="col" rowSpan={2} className="pinned-col rs-grid-lead">{leadHeader}</th> : <th scope="col" className="pinned-col pinned-col-group rs-grid-lead">{lead.group ?? ""}</th>}
              {groups.map(g => <th key={`${g.label}-${g.start}`} scope="colgroup" colSpan={g.span} className={`stats-group-th ${g.start > 0 && !columns[g.start].guide ? "group-start" : ""}`} data-guided={columns[g.start].guide || undefined}>{g.label}</th>)}
            </tr>}
            <tr className="stats-header-tier-2">
              {!spanLead && <th scope="col" className="pinned-col rs-grid-lead">{leadHeader}</th>}
              {columns.map((c, i) => c.guide ? <th key={c.key} className="stats-guide-cell" aria-hidden="true" /> : c.sort && sort
                ? <SortHeader key={c.key} label={c.label} metric={c.key} description={c.title} active={sort.key === c.key} direction={sort.direction} onSort={sort.onSort} className={`num ${starts.has(i) ? "group-start" : ""} ${c.keepCase ? "rs-grid-keep-case" : ""}`} />
                : <th key={c.key} scope="col" className={`num ${starts.has(i) ? "group-start" : ""} ${c.keepCase ? "rs-grid-keep-case" : ""}`} title={c.title}><span className="table-sort-button">{c.label}</span></th>)}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && <tr><td className="rs-grid-empty" colSpan={columns.length + 1}>{empty ?? "No rows."}</td></tr>}
            {rows.map(row => <tr key={rowKey(row)} className="stats-table-row" data-row={rowKey(row)} {...prefixed(rowData?.(row))}>
              <th scope="row" className="pinned-col rs-grid-lead">{lead.cell(row)}</th>
              {columns.map((c, i) => <Fragment key={c.key}>
                {c.guide ? <td className="stats-guide-cell" aria-hidden="true"><span className="stats-guide-marker">{c.cell(row)}</span></td> : <td className={`stats-metric-cell num ${starts.has(i) ? "group-start" : ""}`} data-column={c.key} data-align={c.align && c.align !== "center" ? c.align : undefined} {...prefixed(c.data?.(row))}>{c.cell(row)}</td>}
              </Fragment>)}
            </tr>)}
          </tbody>
        </table>
      </div>
    </div>
  </div>;
}

/** `{ value: 3 }` → `{ "data-value": 3 }`; undefined attributes are left off. */
function prefixed(attrs?: Record<string, string | number | boolean | undefined>): Record<string, string | number | boolean> {
  const out: Record<string, string | number | boolean> = {};
  for (const [k, v] of Object.entries(attrs ?? {})) if (v !== undefined) out[`data-${k}`] = v;
  return out;
}
