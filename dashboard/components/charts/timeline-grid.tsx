import React from "react";
import { ChartData, ChartFrame, type ChartMeta } from "./chart-frame";
import { chartVars, nonnegative, numberLabel, STATUS_LABELS, toneColor, type ContractStatus } from "./semantics";

export interface TimelineCell { period: string; value: number | null; status: ContractStatus }
export interface TimelineRow { id: string; label: string; cells: TimelineCell[] }
export interface TimelineGridProps extends ChartMeta {
  periods: string[]; rows: TimelineRow[]; format?: (value: number) => string;
  /** A period with no cell: hatched Unknown (default), or a neutral "Not listed" when the source lists nothing for it. */
  absent?: "unknown" | "not-listed";
}

export function TimelineGrid({ periods, rows, format = numberLabel, absent = "unknown", ...meta }: TimelineGridProps) {
  const listed = (row: TimelineRow, period: string) => absent === "unknown" || row.cells.some(c => c.period === period);
  const statuses = [...new Set(rows.flatMap(row => periods.filter(period => listed(row, period)).map(period => {
    const cell = row.cells.find(c => c.period === period);
    return cell && nonnegative(cell.value) ? cell.status : "unknown";
  })))];
  const hasAbsent = rows.some(row => periods.some(period => !listed(row, period)));
  return <ChartFrame {...meta} state={meta.state ?? (rows.length === 0 || periods.length === 0 ? "empty" : "ready")}>
    <ChartData fingerprint={JSON.stringify([periods, rows])}>
      <ul className="chart-legend chart-legend-inline">{statuses.map(status => <li key={status}><span className={`chart-key ${status === "unknown" ? "chart-key-unknown" : ""}`} style={chartVars({ "--chart-tone": toneColor(`status-${status}`) })} aria-hidden="true" />{STATUS_LABELS[status]}</li>)}{hasAbsent && <li><span className="chart-key chart-key-absent" aria-hidden="true" />Not listed</li>}</ul>
      <div className="chart-table-scroll" role="region" aria-label={`${meta.title} by period`} tabIndex={0}>
        <table className="chart-table chart-timeline"><caption>Amounts by period · status labels and color</caption><thead><tr><th scope="col">Name</th>{periods.map(period => <th scope="col" className="num" key={period}>{period}</th>)}</tr></thead>
          <tbody>{rows.map(row => <tr key={row.id}><th scope="row">{row.label}</th>{periods.map(period => {
            if (!listed(row, period)) return <td className="num chart-timeline-cell chart-timeline-absent" key={period}><strong>—</strong><small>Not listed</small></td>;
            const cell = row.cells.find(c => c.period === period);
            const observed = cell && nonnegative(cell.value);
            const status = observed ? cell.status : "unknown";
            return <td className={`num chart-timeline-cell ${status === "unknown" ? "chart-hatched" : ""}`} key={period} style={chartVars({ "--chart-tone": toneColor(`status-${status}`) })}><strong>{observed ? format(cell.value!) : "—"}</strong><small>{STATUS_LABELS[status]}</small></td>;
          })}</tr>)}</tbody>
        </table>
      </div>
    </ChartData>
  </ChartFrame>;
}
