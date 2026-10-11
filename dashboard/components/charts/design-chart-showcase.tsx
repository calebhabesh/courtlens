"use client";

import React, { useState } from "react";
import { Button, Panel, SegmentedControl } from "@/components/ui";
import { ChartFrame, DeltaChip, Donut, PercentileCell, Sankey, ShapePack, ThresholdBar, TimelineGrid, ValueBar, comparisonFlags, type Category, type ChartMeta } from "./index";

const categoryLabels: Record<Category, string> = { 1: "Category one", 2: "Category two", 3: "Category three", 4: "Category four", 5: "Category five", 6: "Category six" };
const periods = ["2026-27", "2027-28", "2028-29", "2029-30"];
const source = "Illustrative style-guide inputs";
const sample = "Geometry examples; no NBA estimates";

/** Deliberately labeled component examples. No synthetic data enters an analytical route. */
export function DesignChartShowcase() {
  const [state, setState] = useState<NonNullable<ChartMeta["state"]>>("ready");
  const [revision, setRevision] = useState(false);
  const [unqualified, setUnqualified] = useState(false);
  const meta = { source, sample, state, action: <Button size="sm" onClick={() => setState("ready")}>Show example</Button> };
  const amount = revision ? 72 : 60;
  const lowFlags = comparisonFlags({ good_direction: "low" });
  return <div className="chart-showcase" id="chart-kit">
    <div className="chart-showcase-row">
      <SegmentedControl name="Chart state" value={state} onChange={v => setState(v as NonNullable<ChartMeta["state"]>)} options={[{ value: "ready", label: "Ready" }, { value: "loading", label: "Loading" }, { value: "empty", label: "Empty" }, { value: "error", label: "Error" }]} />
      <Button variant="secondary" onClick={() => setRevision(v => !v)}>Change values</Button>
    </div>
    <div className="chart-showcase-grid">
      <Panel compact title="Identity A/B and metric differences">
        <ChartFrame {...meta} title="DeltaChip · catalog direction">
          <div className="chart-showcase-row"><span>A: 26 · B: 20 · higher is better</span><DeltaChip a={26} b={20} names={["Subject A", "Subject B"]} direction="high" /></div>
          <div className="chart-showcase-row"><span>A: 3.2 · B: 2.4 · fouls (lower)</span><DeltaChip a={3.2} b={2.4} names={["Subject A", "Subject B"]} direction={lowFlags.direction} /></div>
          <div className="chart-showcase-row"><span>Unknown · equal · no direction</span><DeltaChip a={null} b={2} names={["A", "B"]} direction="high" /><DeltaChip a={2} b={2} names={["A", "B"]} direction="high" /><DeltaChip a={5} b={3} names={["A", "B"]} direction={null} /></div>
          <p className="chart-note">Amber = Subject A. Blue = Subject B. Each chip describes one metric.</p>
        </ChartFrame>
      </Panel>
      <Panel compact title="Signed values and percentile shading">
        <ValueBar {...meta} title="ValueBar · signed observed value" value={revision ? 3 : -2} domain={[-5, 5]} tone="identity-b" note="Blue = Subject B" />
        <ChartFrame {...meta} title="PercentileCell · qualified cohort">
          <div className="chart-showcase-row">{[0, 25, 50, 75, 100].map(p => <PercentileCell key={p} label="Illustrative rank" value={p / 10} percentile={p} qualified={!unqualified} cohort="Same season and phase; 500 minutes minimum" />)}<PercentileCell label="Missing value" value={null} percentile={null} qualified cohort="Same season and phase" /></div>
          <Button size="sm" variant="secondary" onClick={() => setUnqualified(v => !v)}>{unqualified ? "Show qualified ranks" : "Show small sample"}</Button>
          <p className="chart-note">Blue intensifies with oriented rank. Unqualified values retain their value and say Small sample.</p>
        </ChartFrame>
      </Panel>
      <Panel compact title="ThresholdBar"><ThresholdBar {...meta} title="Labeled thresholds" value={amount} maximum={100} thresholds={[{ label: "Threshold one", value: 65 }, { label: "Threshold two", value: 82 }, { label: "Threshold three", value: 95 }]} /></Panel>
      <Panel compact title="Donut"><Donut {...meta} title="Known shares with an unknown row" items={[{ id: "1", label: "Category one", value: amount }, { id: "2", label: "Category two", value: 25 }, { id: "3", label: "Category three", value: 15 }, { id: "4", label: "Not observed", value: null }]} /></Panel>
    </div>
    <Panel compact title="Sankey · stacked stage bars on phones"><Sankey {...meta} title="Known flow" nodes={[{ id: "total", label: "Known total", tone: "identity-a" }, { id: "one", label: "Category one", tone: "category-1" }, { id: "two", label: "Category two", tone: "category-2" }, { id: "a", label: "Subject A", tone: "category-1" }, { id: "b", label: "Subject B", tone: "category-2" }]} links={[{ source: "total", target: "one", value: amount }, { source: "total", target: "two", value: 40 }, { source: "one", target: "a", value: amount }, { source: "two", target: "b", value: 40 }, { source: "total", target: "a", value: null }]} /></Panel>
    <Panel compact title="TimelineGrid · sticky names and labeled statuses"><TimelineGrid {...meta} title="Contract status palette" periods={periods} rows={[
      { id: "a", label: "Subject A", cells: [{ period: "2026-27", value: amount, status: "guaranteed" }, { period: "2027-28", value: 62, status: "player-option" }, { period: "2028-29", value: null, status: "unknown" }] },
      { id: "b", label: "Subject B", cells: [{ period: "2026-27", value: 25, status: "team-option" }, { period: "2027-28", value: 28, status: "projected" }, { period: "2028-29", value: null, status: "unknown" }] },
      { id: "c", label: "Subject C", cells: [{ period: "2026-27", value: 15, status: "two-way" }, { period: "2027-28", value: 0, status: "guaranteed" }] }
    ]} /></Panel>
    <Panel compact title="ShapePack · area, category and fit"><ShapePack {...meta} title="Nonnegative area packing" sizeLabel="illustrative units" capacity={150} categoryLabels={categoryLabels} items={[
      { id: "a", label: "Subject A", value: amount, category: 1, fit: "observed" }, { id: "b", label: "Subject B", value: 25, category: 2, fit: "projected" }, { id: "c", label: "Subject C", value: 15, category: 3, fit: "unknown" }, { id: "d", label: "Subject D", value: null, category: null, fit: "unknown" }, { id: "e", label: "Subject E", value: 6, category: null, fit: "unknown" }
    ]} note="Packing primitive for PC10; Wyman diagram presentation will credit @taylormetrics." /></Panel>
  </div>;
}
