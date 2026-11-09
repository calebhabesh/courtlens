import type { CSSProperties, ReactNode } from "react";
import { ChartData, ChartFrame, type ChartMeta } from "../charts/chart-frame";
import { knownNumber, numberLabel } from "../charts/semantics";

export interface LeaderBar {
  key: string;
  label: ReactNode;
  /** Plain-text name for the accessible label when `label` is a link or element. */
  name: string;
  value: number | null;
  formatted?: string;
  detail?: ReactNode;
}

/**
 * A short ranked list in the Research look (owner, RD12 round 4): a thin bar on the Research well, one scale for every row with a zero baseline, gold above zero and blue
 * below (these ratings have no interval). The scale says what its two ends are. Order is the caller's; a missing value keeps its row with no bar.
 */
export function LeaderBars({ items, measure, zeroMeans, ...meta }: ChartMeta & { items: readonly LeaderBar[]; measure: string; zeroMeans: string }) {
  const known = items.flatMap(item => knownNumber(item.value) ? [item.value] : []);
  const low = Math.min(0, ...known), high = Math.max(0, ...known);
  const at = (value: number) => high === low ? 0 : ((value - low) / (high - low)) * 100;
  const pct = (value: number) => `${at(value)}%`;
  const vars = (props: Record<string, string>) => props as CSSProperties;
  const below = low < 0;
  return <ChartFrame {...meta} state={meta.state ?? (items.length ? "ready" : "empty")}>
    <ChartData fingerprint={JSON.stringify(items.map(item => [item.key, item.value]))}>
      <div className="rs-leaders-scale-row" aria-hidden="true">
        <span className="rs-leaders-scale-gap" />
        <span className="rs-leaders-scale" data-field="scale" data-low={low} data-high={high} style={vars({ "--rs-leaders-zero": pct(0) })}>
          {below ? <><span data-end="left">{numberLabel(low)}</span><span data-end="zero">0 is {zeroMeans}</span></> : <span data-end="left">0 is {zeroMeans}</span>}
          <span data-end="right">{numberLabel(high)} is the top of this list</span>
        </span>
        <span className="rs-leaders-scale-gap" />
      </div>
      <ol className="rs-leaders-list" aria-label={`${meta.title}: ${measure}`}>
        {items.map(item => {
          const value = knownNumber(item.value) ? item.value : null;
          const label = item.formatted ?? numberLabel(item.value);
          const identity = value === null || value === 0 ? undefined : value > 0 ? "a" : "b";
          return <li key={item.key} data-row={item.key} data-value={value ?? ""}>
            <span className="rs-leaders-label">{item.label}{item.detail && <small>{item.detail}</small>}</span>
            <span className="rs-leaders-track" role="img" aria-label={`${item.name}: ${value === null ? "unknown" : label} ${measure}`}>
              {below && <span className="rs-leaders-zero" style={vars({ "--rs-leaders-zero": pct(0) })} />}
              {value !== null && <span className="rs-leaders-fill" data-identity={identity} data-left={at(Math.min(0, value))} data-width={at(Math.max(0, value)) - at(Math.min(0, value))}
                style={vars({ "--rs-leaders-left": pct(Math.min(0, value)), "--rs-leaders-width": `${at(Math.max(0, value)) - at(Math.min(0, value))}%` })} />}
            </span>
            <strong className="rs-leaders-value" data-identity={identity}>{value === null ? "—" : label}</strong>
          </li>;
        })}
      </ol>
    </ChartData>
  </ChartFrame>;
}
