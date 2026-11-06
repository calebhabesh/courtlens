"use client";

import { useMemo, useState, type ReactNode } from "react";
import { chartVars } from "../charts/semantics";
import { SortHeader } from "../table-ui";
import { TeamLogo } from "../team-logo";
import { CountChip } from "../ui/filter-bar";
import { type IconName } from "../ui/icon";
import { Input, SearchField } from "../ui/input";
import { Button, Segmented, Select } from "../ui/kit";
import { ToneLegend } from "./research-page";
import { downloadCsv, intervalLabel, intervalTone, signed, toCsv } from "@/lib/research-values";

/*
 * Research ratings table after Databallr's ShotQuality table (alignment row 18): a toolbar (search,
 * team, minimum, CSV, count), views (Offense / Defense / Combined), a logo column, a player column,
 * a bar beside each signed value, a sticky header in a scrolling frame and the colour key. Every
 * interval stays on a second line. Unknowns are "—", never zero, and sort last both ways.
 */

export interface ResearchColumn<T> {
  key: string;
  label: string;
  /** Header tooltip and glossary text. */
  title: string;
  value: (row: T) => number | null;
  /** 80% interval, or undefined when the column has none by design (counts, sums without replicates). */
  interval?: (row: T) => { low: number | null; high: number | null };
  /** Signed estimate: drawn with a bar and the interval colour rule. Counts are plain. */
  signedValue?: boolean;
  digits?: number;
  /** Why a cell is unknown, for its title. */
  unknown?: (row: T) => string | undefined;
}

export interface ResearchView<T> { value: string; label: string; icon?: IconName; columns: readonly ResearchColumn<T>[] }

export interface ResearchTableProps<T> {
  label: string;
  rows: readonly T[];
  rowKey: (row: T) => string;
  name: (row: T) => string;
  team: (row: T) => string | null;
  season: string;
  player: (row: T) => ReactNode;
  views: readonly ResearchView<T>[];
  /** Columns shown in every view, after the view's own (sample size). */
  trailingColumns?: readonly ResearchColumn<T>[];
  defaultSort: string;
  minimum?: { label: string; value: (row: T) => number | null; initial: number; step: number };
  csv: { filename: string; columns: readonly { header: string; value: (row: T) => string | number | null }[] };
  noun: string;
  actions?: ReactNode;
  rowAction?: (row: T) => ReactNode;
  footnote?: ReactNode;
}

type Direction = "asc" | "desc";

/** Unknowns last whichever way the column runs; ties keep a stable key order. */
export function sortRows<T>(rows: readonly T[], value: (row: T) => number | null, direction: Direction, key: (row: T) => string): T[] {
  const sign = direction === "asc" ? 1 : -1;
  return [...rows].sort((a, b) => {
    const x = value(a), y = value(b);
    if (x == null || y == null) return (x == null ? 1 : 0) - (y == null ? 1 : 0) || key(a).localeCompare(key(b));
    return sign * (x - y) || key(a).localeCompare(key(b));
  });
}

function ValueCell<T>({ column, row, scale, start }: { column: ResearchColumn<T>; row: T; scale: number; start: boolean }) {
  const value = column.value(row);
  const interval = column.interval?.(row);
  const className = start ? "group-start" : undefined;
  if (!column.signedValue) return <td className={className} data-column={column.key} data-value={value ?? undefined}>{value == null ? "—" : Math.round(value).toLocaleString("en-US")}</td>;
  if (value == null) return <td className={className} data-column={column.key} title={column.unknown?.(row)}><span className="rt-unknown">—</span></td>;
  const tone = interval ? intervalTone(interval.low, interval.high) : undefined;
  const share = scale > 0 ? Math.min(1, Math.abs(value) / scale) : 0;
  return <td className={className} data-column={column.key} data-value={value} data-low={interval?.low ?? undefined} data-high={interval?.high ?? undefined}>
    <span className="rt-cell">
      <span className="rt-bar" data-tone={tone} aria-hidden="true"><span style={chartVars({ "--chart-position": `${(share * 100).toFixed(1)}%` })} /></span>
      <span className="rt-figures">
        <span className="rt-value" data-tone={tone}>{signed(value, column.digits ?? 2)}</span>
        {interval && <span className="rt-interval" data-unknown={interval.low == null || undefined}>{interval.low == null ? "interval unknown" : intervalLabel(interval.low, interval.high, 1)}</span>}
      </span>
    </span>
  </td>;
}

export function ResearchTable<T>(props: ResearchTableProps<T>) {
  const { label, rows, rowKey, name, team, season, player, views, trailingColumns = [], defaultSort, minimum, csv, noun, actions, rowAction, footnote } = props;
  const [view, setView] = useState(views[0].value);
  const [query, setQuery] = useState("");
  const [teamFilter, setTeamFilter] = useState("");
  const [floor, setFloor] = useState(minimum ? String(minimum.initial) : "");
  const [sort, setSort] = useState<{ key: string; direction: Direction }>({ key: defaultSort, direction: "desc" });
  const columns = useMemo(() => [...(views.find(item => item.value === view) ?? views[0]).columns, ...trailingColumns], [views, view, trailingColumns]);
  const teams = useMemo(() => [...new Set(rows.map(team).filter((code): code is string => code != null))].sort(), [rows, team]);
  const filtered = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase("en-US");
    const least = Number(floor);
    return rows.filter(row => (!needle || name(row).toLocaleLowerCase("en-US").includes(needle))
      && (!teamFilter || team(row) === teamFilter)
      && (!minimum || !Number.isFinite(least) || least <= 0 || (minimum.value(row) ?? -Infinity) >= least));
  }, [rows, query, teamFilter, floor, minimum, name, team]);
  /* A view without the sorted column sorts by its own first column. */
  const sortColumn = columns.find(column => column.key === sort.key) ?? columns[0];
  const activeSort = sortColumn.key;
  const sorted = useMemo(() => sortRows(filtered, sortColumn.value, sort.direction, rowKey), [filtered, sortColumn, sort.direction, rowKey]);
  /* One bar scale per column over the rows in view, so bars compare within a column. */
  const scales = useMemo(() => new Map(columns.map(column => [column.key, Math.max(0, ...filtered.map(row => Math.abs(column.value(row) ?? 0)))])), [columns, filtered]);
  const onSort = (key: string) => setSort(current => activeSort === key ? { key, direction: current.direction === "desc" ? "asc" : "desc" } : { key, direction: "desc" });
  const exportCsv = () => downloadCsv(csv.filename, toCsv(csv.columns.map(column => column.header), sorted.map(row => csv.columns.map(column => column.value(row)))));
  const viewSwitch = views.length > 1 && <Segmented size="sm" label="View" value={view} onChange={setView} options={views.map(item => ({ value: item.value, label: item.label, icon: item.icon }))} />;
  return <div className="rt">
    <div className="rt-toolbar">
      <div className="rt-toolbar-row">
        <SearchField aria-label={`Search ${noun}`} placeholder={`Search ${noun.replace(/s$/, "")}…`} value={query} onChange={event => setQuery(event.target.value)} onClear={() => setQuery("")} inputSize="md" wrapperClassName="rt-search" />
        {minimum && <label className="rt-minimum"><span>{minimum.label}</span><Input type="number" inputMode="numeric" min={0} step={minimum.step} value={floor} onChange={event => setFloor(event.target.value)} aria-label={minimum.label} inputSize="md" wrapperClassName="rt-minimum-input" /></label>}
        <Select size="md" aria-label="Team" value={teamFilter} onChange={event => setTeamFilter(event.target.value)}>
          <option value="">All teams</option>
          {teams.map(code => <option key={code} value={code}>{code}</option>)}
        </Select>
        {actions}
        <Button size="md" icon="download" onClick={exportCsv}>Download CSV</Button>
        <CountChip>{sorted.length.toLocaleString("en-US")} {noun}</CountChip>
      </div>
      {viewSwitch && <div className="rt-toolbar-row">{viewSwitch}</div>}
    </div>
    <div className="player-ref-grid-frame rt-frame">
      <div className="player-ref-grid-scroll rt-scroll" role="region" aria-label={label} tabIndex={0}>
        <table className="player-ref-grid rt-grid" data-columns={columns.length}>
          <colgroup><col className="rt-col-logo" /><col className="player-ref-grid-lead-column" />{columns.map(column => <col key={column.key} className={column.signedValue ? (column.interval ? "rt-col-value" : "rt-col-signed") : "rt-col-count"} />)}{rowAction && <col className="rt-col-action" />}</colgroup>
          <thead><tr className="rt-head">
            <th scope="col" className="rt-logo"><span className="sr-only">Team</span></th>
            <th scope="col" className="player-ref-grid-lead">Player</th>
            {columns.map((column, index) => <SortHeader key={column.key} label={column.label} metric={column.key} description={column.title} active={activeSort === column.key} direction={sort.direction} onSort={onSort} className={index === 0 ? "group-start" : undefined} />)}
            {rowAction && <th scope="col"><span className="sr-only">Actions</span></th>}
          </tr></thead>
          <tbody>
            {sorted.length === 0 && <tr><td className="rt-empty" colSpan={columns.length + 2 + (rowAction ? 1 : 0)}>No {noun} match these filters.</td></tr>}
            {sorted.map(row => { const code = team(row); return <tr key={rowKey(row)} data-row={rowKey(row)}>
              <td className="rt-logo">{code ? <TeamLogo team={code} season={season} size={20} /> : <span className="rt-unknown" title="Team unknown">—</span>}</td>
              <th scope="row" className="player-ref-grid-lead">{player(row)}</th>
              {columns.map((column, index) => <ValueCell key={column.key} column={column} row={row} scale={scales.get(column.key) ?? 0} start={index === 0} />)}
              {rowAction && <td className="rt-action">{rowAction(row)}</td>}
            </tr>; })}
          </tbody>
        </table>
      </div>
    </div>
    <div className="rt-foot"><ToneLegend />{footnote && <p className="rs-note">{footnote}</p>}</div>
  </div>;
}
