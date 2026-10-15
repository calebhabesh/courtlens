"use client";

import { Drawer } from "./ui/drawer";
import { Checkbox } from "./ui/checkbox";
import { Button, Select } from "./ui/kit";
import { CUSTOM_DEFAULT, pickerMetrics } from "@/lib/comparison-metrics";
import type { CustomViewDefinition, MetricDefinition } from "@/lib/types";

const LIMIT = 25;

/** Edit Metrics (alignment row 3): the Custom preset's picks, grouped by catalog category. */
export function CompareMetricsDrawer({ open, onClose, selected, catalog, views, onChange }: {
  open: boolean;
  onClose: () => void;
  selected: string[];
  catalog: MetricDefinition[];
  views: CustomViewDefinition[];
  onChange: (keys: string[]) => void;
}) {
  const groups = pickerMetrics(catalog);
  return <Drawer isOpen={open} onClose={onClose} title="Edit Metrics" className="pvp-drawer">
    <div className="pvp-drawer-body">
      <div className="pvp-drawer-tools">
        <span className="pvp-drawer-count" role="status">{selected.length} / {LIMIT} selected</span>
        <Button size="sm" icon="reset" onClick={() => onChange(CUSTOM_DEFAULT)}>Reset metrics</Button>
      </div>
      {views.length > 0 && <Select size="md" aria-label="Personal custom view" value="" onChange={event => {
        const view = views.find(entry => entry.id === event.target.value);
        if (view) onChange(view.columns.slice(0, LIMIT));
      }}><option value="">Apply a saved view</option>{views.map(view => <option key={view.id} value={view.id}>{view.name}</option>)}</Select>}
      {groups.map(group => <fieldset key={group.label} className="pvp-drawer-group">
        <legend>{group.label}</legend>
        {group.metrics.map(metric => {
          const checked = selected.includes(metric.key);
          return <Checkbox key={metric.key} id={`pvp-metric-${metric.key}`} label={metric.display_name.replace(/^Total /, "")} checked={checked} disabled={!checked && selected.length >= LIMIT}
            onChange={next => onChange(next ? [...selected, metric.key] : selected.filter(key => key !== metric.key))} />;
        })}
      </fieldset>)}
    </div>
  </Drawer>;
}
