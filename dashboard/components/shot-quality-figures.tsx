"use client";

import type { CSSProperties, ReactNode } from "react";
import { Icon, type IconName } from "./ui/icon";
import { ButtonLink } from "./ui/kit";
import { intervalTone } from "@/lib/research-values";

/*
 * RD04 Shot Quality building blocks: a light panel with wells one level deep (the RD03 pattern), a value coloured only
 * when its interval excludes zero, result tiles, an interval dot plot and Databallr's framework link card. The page
 * composes these; `shot-quality-research.css` places them.
 */

const known = (v: number | null | undefined): v is number => typeof v === "number" && Number.isFinite(v);

/** A light panel; `title` and `aside` make its head row. */
export function SqPanel({ title, kicker, aside, children, className = "", label }: { title?: ReactNode; kicker?: ReactNode; aside?: ReactNode; children: ReactNode; className?: string; label?: string }) {
  return <div className={`sq-panel ${className}`} role={label ? "group" : undefined} aria-label={label}>
    {(title || kicker || aside) && <div className="sq-panel-head">
      <div className="sq-panel-titles">{kicker && <p className="sq-kicker">{kicker}</p>}{title && <h3 className="sq-panel-title">{title}</h3>}</div>
      {aside && <div className="sq-panel-aside">{aside}</div>}
    </div>}
    {children}
  </div>;
}

/**
 * A signed figure, green or red only when its interval excludes zero (`level` names the interval). Exact values sit on
 * `data-value`, `data-low` and `data-high`.
 */
export function Toned({ text, value, low, high, level, field }: { text: string; value: number | null | undefined; low?: number | null; high?: number | null; level: number; field?: string }) {
  const tone = known(value) ? intervalTone(low, high) : undefined;
  const why = tone === "good" ? `${level}% interval above zero` : tone === "bad" ? `${level}% interval below zero` : `${level}% interval includes zero or is unknown`;
  return <span className="rs-value sq-toned" data-tone={tone} data-field={field} data-value={known(value) ? value : undefined}
    data-low={known(low) ? low : undefined} data-high={known(high) ? high : undefined} title={known(value) ? why : undefined}>{text}</span>;
}

export interface Tile { key: string; label: string; value: ReactNode; foot?: ReactNode }

/** Short result figures on wells, side by side (two columns on a phone). */
export function Tiles({ tiles, label }: { tiles: readonly Tile[]; label: string }) {
  return <div className="sq-tiles" role="list" aria-label={label} data-count={tiles.length}>
    {tiles.map(t => <div key={t.key} className="sq-well sq-tile" role="listitem" data-tile={t.key}>
      <span className="sq-kicker">{t.label}</span>
      <span className="sq-tile-value">{t.value}</span>
      {t.foot && <span className="sq-tile-foot">{t.foot}</span>}
    </div>)}
  </div>;
}

export interface IntervalRow { key: string; label: string; value: number; low: number; high: number; series?: "a" | "b"; note?: string }

/**
 * Point estimates with their intervals on one shared axis (correlations, 0 to 1 by default). Neutral marks: a
 * correlation is not good or bad. Exact values sit on each row.
 */
export function IntervalPlot({ rows, label, min = 0, max = 1, ticks = [0, 0.25, 0.5, 0.75, 1], format }: {
  rows: readonly IntervalRow[]; label: string; min?: number; max?: number; ticks?: readonly number[]; format: (v: number) => string;
}) {
  const at = (v: number) => `${(Math.min(max, Math.max(min, v)) - min) / (max - min) * 100}%`;
  return <div className="sq-ci" role="group" aria-label={label}>
    <ul className="sq-ci-rows">
      {rows.map(r => <li key={r.key} className="sq-ci-row" data-row={r.key} data-value={r.value} data-low={r.low} data-high={r.high} data-series={r.series}
        role="img" aria-label={`${r.label}: ${format(r.value)}, interval ${format(r.low)} to ${format(r.high)}`}>
        <span className="sq-ci-label">{r.label}{r.note && <span className="sq-ci-note">{r.note}</span>}</span>
        <span className="sq-ci-track" aria-hidden="true">
          <span className="sq-ci-band" style={{ "--from": at(r.low), "--to": at(r.high) } as CSSProperties} />
          <span className="sq-ci-dot" style={{ "--at": at(r.value) } as CSSProperties} />
        </span>
        <span className="sq-ci-value">{format(r.value)}<span className="sq-ci-range">{format(r.low)} to {format(r.high)}</span></span>
      </li>)}
    </ul>
    <div className="sq-ci-axis" aria-hidden="true">{ticks.map(t => <span key={t} style={{ "--at": at(t) } as CSSProperties}>{format(t)}</span>)}</div>
  </div>;
}

/** Databallr's framework card: an icon well, a title, one line and a link onwards. */
export function LinkCard({ icon, title, children, href, link }: { icon: IconName; title: string; children: ReactNode; href: string; link: string }) {
  return <div className="sq-panel sq-link-card">
    <span className="sq-link-icon" aria-hidden="true"><Icon name={icon} size={20} /></span>
    <div className="sq-link-copy"><h3 className="sq-panel-title">{title}</h3><p className="sq-text">{children}</p></div>
    <ButtonLink size="md" variant="text" href={href} iconAfter="right">{link}</ButtonLink>
  </div>;
}
