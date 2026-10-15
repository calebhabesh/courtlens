"use client";

import { useState } from "react";
import { Drawer } from "./ui/drawer";
import { Checkbox } from "./ui/checkbox";
import { SearchField } from "./ui/input";
import { Button, Select } from "./ui/kit";
import { CUSTOM_DEFAULT, pickerMetrics } from "@/lib/comparison-metrics";
import { glossaryName, glossaryShortName } from "@/lib/stats-glossary";
import type { CustomViewDefinition, MetricDefinition } from "@/lib/types";

const LIMIT = 25;

/** Glossary-style label: the abbreviation leads, the spelled-out term follows. */
function terms(metric: MetricDefinition) {
  return { short: glossaryShortName(metric), name: glossaryName(metric).replace(/^Total /, "") };
}

/**
 * Edit Metrics (alignment row 3, 3 and 14): the Custom preset's picks, searchable by abbreviation,
 * term or key, grouped by catalog category, each row reading abbreviation then term.
 */
export function CompareMetricsDrawer({ open, onClose, selected, catalog, views, onChange }: {
  open: boolean;
  onClose: () => void;
  selected: string[];
  catalog: MetricDefinition[];
  views: CustomViewDefinition[];
  onChange: (keys: string[]) => void;
}) {
  const [query, setQuery] = useState("");
  const needle = query.trim().toLowerCase();
  const groups = pickerMetrics(catalog)
    .map(group => ({ ...group, metrics: group.metrics.filter(metric => {
      if (!needle) return true;
      const { short, name } = terms(metric);
      return [short, name, metric.key, ...(metric.aliases ?? [])].some(text => text.toLowerCase().includes(needle));
    }) }))
    .filter(group => group.metrics.length > 0);
  return <Drawer isOpen={open} onClose={onClose} title="Edit Metrics" className="pvp-drawer">
    <div className="pvp-drawer-body">
      <SearchField aria-label="Search metrics" placeholder="Search metrics (PTS, true shooting…)" value={query}
        onChange={event => setQuery(event.target.value)} onClear={() => setQuery("")} />
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
          const { short, name } = terms(metric);
          return <Checkbox key={metric.key} id={`pvp-metric-${metric.key}`} checked={checked} disabled={!checked && selected.length >= LIMIT}
            className="pvp-drawer-metric" aria-label={metric.display_name}
            label={<span className="pvp-drawer-term"><abbr title={name}>{short}</abbr><span>{name}</span></span>}
            onChange={next => onChange(next ? [...selected, metric.key] : selected.filter(key => key !== metric.key))} />;
        })}
      </fieldset>)}
      {groups.length === 0 && <p className="pvp-drawer-empty">No metric matches “{query.trim()}”.</p>}
    </div>
  </Drawer>;
}
