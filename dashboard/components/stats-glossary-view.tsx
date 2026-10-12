"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Icon, type IconName } from "./ui/icon";
import { PageHeader } from "./ui/panel";
import "./stats-glossary.css";
import { GLOSSARY_GROUPS, type GlossaryEntry, type GlossaryGroup } from "@/lib/stats-glossary";

const GROUP_ICONS: Record<GlossaryGroup, IconName> = {
  "Counting Stats": "chart-column", Shooting: "zap", Rates: "trend", "Impact Metrics": "sparkles", "On-Off": "swap",
  Defense: "lock", Rebounding: "refresh", Playmaking: "users", "Play Types": "cards", Team: "scale", Other: "info",
};

export function StatsGlossaryView({ entries, available }: { entries: GlossaryEntry[]; available: boolean }) {
  const [query, setQuery] = useState("");
  const [group, setGroup] = useState<GlossaryGroup | "all">("all");
  const [open, setOpen] = useState<string | null>(null);

  const counts = useMemo(() => Object.fromEntries(GLOSSARY_GROUPS.map(name => [name, entries.filter(entry => entry.group === name).length])), [entries]);
  const needle = query.trim().toLowerCase();
  const visible = entries.filter(entry => (group === "all" || entry.group === group) &&
    (!needle || [entry.short, entry.name, entry.plain].some(text => text.toLowerCase().includes(needle))));

  return (
    <div className="glossary-page">
      <Link href="/stats" className="glossary-back"><Icon name="left" size={16} />Back to Stats</Link>
      <PageHeader className="glossary-header" icon="page" title="Stats Glossary" subtitle={`Definitions for ${entries.length} NBA statistics`}
        actions={<label className="glossary-search">
          <Icon name="search" size={16} />
          <span className="sr-only">Search definitions</span>
          <input type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="Search definitions..." />
        </label>} />

      <div className="glossary-filters" role="group" aria-label="Categories">
        <button type="button" className="glossary-chip" aria-pressed={group === "all"} onClick={() => setGroup("all")}>
          All Stats <span>({entries.length})</span>
        </button>
        {GLOSSARY_GROUPS.filter(name => counts[name] > 0).map(name => (
          <button key={name} type="button" className="glossary-chip" aria-pressed={group === name} onClick={() => setGroup(name)}>
            {name} <span>({counts[name]})</span>
          </button>
        ))}
      </div>

      {!available && <p className="glossary-empty" role="status">The metric catalog is unavailable. Start the local API to load definitions.</p>}
      {available && visible.length === 0 && <p className="glossary-empty" role="status">No statistics match “{query}”.</p>}

      <div className="glossary-grid">
        {visible.map(entry => {
          const expanded = open === entry.key;
          const metric = entry.metric;
          return (
            <article key={entry.key} className="glossary-card" aria-labelledby={`glossary-${entry.key}`}>
              <div className="glossary-card-head">
                <span className="glossary-card-icon" aria-hidden="true"><Icon name={GROUP_ICONS[entry.group]} size={16} /></span>
                <h2 id={`glossary-${entry.key}`}>{entry.short}</h2>
                <span className="glossary-card-group">{entry.group}</span>
              </div>
              <button type="button" className="glossary-card-description" aria-expanded={expanded} aria-controls={`glossary-detail-${entry.key}`}
                onClick={() => setOpen(expanded ? null : entry.key)}>
                <span>{entry.name !== entry.short ? `${entry.name}: ` : ""}{entry.plain}</span>
                <span className="glossary-card-more">{expanded ? "Hide calculation" : "How it's calculated"}<Icon name={expanded ? "chevron-up" : "chevron-down"} size={14} /></span>
              </button>
              {expanded && (
                <dl className="glossary-card-detail" id={`glossary-detail-${entry.key}`}>
                  <dt>Formula</dt><dd><code>{metric.formula}</code></dd>
                  <dt>Unit</dt><dd>{metric.unit}</dd>
                  {metric.denominator && <><dt>Denominator</dt><dd><code>{metric.denominator}</code></dd></>}
                  {metric.validity_definition && <><dt>Valid when</dt><dd><code>{metric.validity_definition}</code></dd></>}
                  {metric.good_direction && <><dt>Better when</dt><dd>{metric.good_direction === "high" ? "Higher" : "Lower"}</dd></>}
                  {metric.limitations.length > 0 && <><dt>Limitations</dt><dd>{metric.limitations.join(" ")}</dd></>}
                </dl>
              )}
            </article>
          );
        })}
      </div>
    </div>
  );
}
