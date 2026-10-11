import React from "react";
import type { CSSProperties, ReactNode } from "react";

export interface ComparisonRow {
  key: string;
  label: string;
  a: number | string | null | undefined;
  b: number | string | null | undefined;
  formattedA?: string;
  formattedB?: string;
  percentileA?: number | null;
  percentileB?: number | null;
  support?: ReactNode;
}

/** Descriptive magnitudes only. A missing value has no bar; negative values keep their sign. */
export function ComparisonRows({ rows, names }: { rows: ComparisonRow[]; names: [string, string] }) {
  return <div className="ui-comparison-rows" role="table" aria-label="Descriptive comparison">
    <div className="ui-comparison-row ui-comparison-row-heading" role="row">
      <span role="columnheader">Metric</span><span role="columnheader">{names[0]}</span><span role="columnheader">{names[1]}</span>
    </div>
    {rows.map(row => {
      const knownA = typeof row.a === "number" && Number.isFinite(row.a);
      const knownB = typeof row.b === "number" && Number.isFinite(row.b);
      const scale = Math.max(knownA ? Math.abs(row.a as number) : 0, knownB ? Math.abs(row.b as number) : 0) || 1;
      return <div className="ui-comparison-row" role="row" key={row.key}>
        <span className="ui-comparison-label" role="rowheader">{row.label}{row.support && <small>{row.support}</small>}</span>
        {(["a", "b"] as const).map((side, index) => {
          const value = row[side];
          const known = side === "a" ? knownA : knownB;
          const larger = knownA && knownB && (side === "a" ? row.a! > row.b! : row.b! > row.a!);
          const percentile = side === "a" ? row.percentileA : row.percentileB;
          return <span role="cell" className={`ui-comparison-value ui-comparison-value-${side}`} key={side}>
            <span className={larger ? "font-bold" : undefined}>{side === "a" ? row.formattedA ?? value ?? "—" : row.formattedB ?? value ?? "—"}</span>
            <span className="ui-comparison-track" aria-hidden="true"><span style={{ "--comparison-width": `${known ? Math.abs(value as number) / scale * 100 : 0}%` } as CSSProperties} /></span>
            {percentile != null && <span className="ui-comparison-percentile" title={`${names[index]} · Cohort percentile`}>{percentile.toFixed(0)}%ile</span>}
          </span>;
        })}
      </div>;
    })}
  </div>;
}
