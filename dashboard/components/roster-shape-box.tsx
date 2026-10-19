"use client";

import { useLayoutEffect, useMemo, useRef, useState, type FocusEvent, type PointerEvent } from "react";
import { toneColor } from "./charts";
import { PlayerPortrait } from "./player-portrait";
import {
  BOX, CONTINUITY_LABELS, FIT_LABELS, category, one, packShapes, shapeGeometry, shapeKind, shapePath, signed, surname,
  type ShapeKind, type ShapeMode, type ShapePlayer
} from "@/lib/roster-shapes";

export const tone = (cluster: number | null | undefined) => { const key = category(cluster); return key ? toneColor(`category-${key}`) : "var(--color-status-unknown)"; };

/** One shape at legend or table size. */
export function ShapeIcon({ kind, color = "currentColor", size = 14 }: { kind: ShapeKind; color?: string; size?: number }) {
  return <svg className="shapes-icon" width={size} height={size} viewBox="-1.1 -1.1 2.2 2.2" aria-hidden="true">
    <path d={`${shapeGeometry(kind).points.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(3)} ${y.toFixed(3)}`).join("")}Z`} fill={color} />
  </svg>;
}

/** A drawn player: his size in box units of `capacity`, and an optional mark (sandbox add, arrival, departure). */
export interface BoxEntry { player: ShapePlayer; size: number | null; minutes?: number | null; mark?: "added" | "left" }

function describe({ player, size, minutes }: BoxEntry, mode: ShapeMode, capacity: number): string {
  return [
    player.player_name,
    `${player.archetype?.primary_name ?? "Style unknown"} · ${player.fit_band === null ? "fit unknown" : FIT_LABELS[player.fit_band].toLowerCase()}`,
    `DPM ${signed(mode === "playoff" && player.dpm !== null ? player.dpm + (player.playoff_shift ?? 0) : player.dpm)}${mode === "playoff" && player.playoff_shift !== null && player.playoff_games ? ` (playoff shift ${signed(player.playoff_shift)} over ${player.playoff_games} games)` : ""} · ${one(minutes ?? player.minutes_per_game)} min per game`,
    `${size === null ? "—" : `${(size / capacity * 100).toFixed(1)}%`} of the box · ${CONTINUITY_LABELS[player.continuity].toLowerCase()}`,
  ].join("\n");
}

/** The packed shapes in box units (0–100), for the page and for the share card. */
export function BoxShapes({ entries, mode, capacity, large = false, focusable = false, active = null, onHover }: {
  entries: BoxEntry[]; mode: ShapeMode; capacity: number; large?: boolean;
  /** The highlighted player (team view): his shape outlined, the rest faded. */
  active?: string | null;
  /** Tab to each shape (team view); the grid keeps one tab stop per box. */
  focusable?: boolean;
  onHover?: (id: string | null, event?: PointerEvent<SVGGElement> | FocusEvent<SVGGElement>) => void;
}) {
  const byId = useMemo(() => new Map(entries.map(e => [e.player.player_id, e])), [entries]);
  const packed = useMemo(() => packShapes(entries.flatMap(e => e.size && e.size > 0
    ? [{ id: e.player.player_id, area: e.size / capacity * BOX * BOX, kind: shapeKind(e.player.fit_band) }] : [])), [entries, capacity]);
  return <>{packed.shapes.map(shape => {
    const entry = byId.get(shape.id)!;
    const name = surname(entry.player.player_name);
    const font = Math.min(large ? 3.4 : 5, (shape.side * 0.82) / (name.length * 0.56));
    const marks = [shape.kind === "unknown" ? "shapes-unknown-fit" : "", entry.mark ? `shapes-mark-${entry.mark}` : ""].filter(Boolean).join(" ");
    return <g key={shape.id} data-shape-id={shape.id} data-fit-band={entry.player.fit_band ?? "unknown"} data-mark={entry.mark} className={`shapes-shape${shape.id === active ? " is-active" : ""}`}
      tabIndex={focusable ? 0 : undefined} aria-label={focusable ? describe(entry, mode, capacity).replaceAll("\n", ". ") : undefined}
      onPointerEnter={onHover && (event => onHover(shape.id, event))} onPointerMove={onHover && (event => onHover(shape.id, event))} onPointerLeave={onHover && (() => onHover(null))}
      onFocus={onHover && (event => onHover(shape.id, event))} onBlur={onHover && (() => onHover(null))}>
      <path d={shapePath(shape)} fill={tone(entry.player.archetype?.primary)} className={marks || undefined} />
      {font >= (large ? 1.6 : 2.6) && <text className="shapes-label" x={shape.x + shape.side / 2} y={shape.y + shape.side / 2} fontSize={font} textAnchor="middle" dominantBaseline="central">{name}</text>}
      {!onHover && <title>{describe(entry, mode, capacity)}</title>}
    </g>;
  })}</>;
}

/** The hover card: photo, name, DPM, minutes and share of the box, then style and fit. */
function HoverCard({ entry, mode, capacity }: { entry: BoxEntry; mode: ShapeMode; capacity: number }) {
  const { player, size, minutes } = entry;
  const dpm = player.dpm === null ? null : player.dpm + (mode === "playoff" ? player.playoff_shift ?? 0 : 0);
  return <>
    <PlayerPortrait playerId={player.player_id} name={player.player_name} size="sm" className="shapes-hover-photo" />
    <span className="shapes-hover-text">
      <strong>{player.player_name}</strong>
      <span>DPM {signed(dpm)} · {one(minutes ?? player.minutes_per_game)} mpg · {size === null ? "—" : `${(size / capacity * 100).toFixed(1)}%`} of box</span>
      <span className="shapes-hover-style">
        <i className="shapes-hover-dot" data-cluster={category(player.archetype?.primary) ?? "unknown"} aria-hidden="true" />
        {player.archetype?.primary_name ?? "Style unknown"} · {player.fit_band === null ? "fit unknown" : FIT_LABELS[player.fit_band].toLowerCase()}
        {entry.mark === "added" ? " · added" : entry.mark === "left" ? " · departed" : ""}
      </span>
    </span>
  </>;
}

/** The square box: shapes packed by area share, white is what a perfect team would add. In team view
 * (`onActive`), hovering or focusing a shape highlights that player here and in the panel's table,
 * and shows his card; the grid and comparison boxes keep the plain tooltip. */
export function ShapeBox({ entries, mode, capacity, label, large = false, active = null, card: showCard = true, onActive }: {
  entries: BoxEntry[]; mode: ShapeMode; capacity: number; label: string; large?: boolean;
  active?: string | null;
  /** Show the card for `active` (false when the highlight comes from the table). */
  card?: boolean;
  onActive?: (id: string | null) => void;
}) {
  const frame = useRef<HTMLSpanElement>(null);
  const card = useRef<HTMLSpanElement>(null);
  const [hover, setHover] = useState<{ id: string; x: number; y: number; flip: boolean } | null>(null);
  // Beside the pointer, away from the nearer edge; where that leaves the box (a phone-width box),
  // centred above or below the pointer instead, always inside the box.
  useLayoutEffect(() => {
    const el = card.current, box = frame.current?.getBoundingClientRect();
    if (!hover || !el || !box) return;
    const w = el.offsetWidth, h = el.offsetHeight, gap = 16;
    const clamp = (value: number, max: number) => Math.max(0, Math.min(value, max));
    let left = hover.flip ? hover.x - gap - w : hover.x + gap;
    let top = clamp(hover.y - h / 2, box.height - h);
    if (left < 0 || left + w > box.width) {
      left = clamp(hover.x - w / 2, box.width - w);
      top = hover.y - gap - h >= 0 ? hover.y - gap - h : clamp(hover.y + gap, box.height - h);
    }
    el.style.setProperty("--chart-position", `${left}px`);
    el.style.setProperty("--chart-cell", `${top}px`);
  }, [hover]);
  const entry = hover ? entries.find(e => e.player.player_id === hover.id) : undefined;
  const onHover = (id: string | null, event?: PointerEvent<SVGGElement> | FocusEvent<SVGGElement>) => {
    const box = frame.current?.getBoundingClientRect();
    onActive?.(id);
    // Leaving keeps the last point: the card goes with the highlight, after its short pause.
    if (!id || !box || !event) return;
    const point = "clientX" in event ? { x: event.clientX, y: event.clientY } : (() => { const r = event.currentTarget.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })();
    setHover({ id, x: point.x - box.left, y: point.y - box.top, flip: point.x - box.left > box.width / 2 });
  };
  return <span ref={frame} className="shapes-box-frame">
    <svg className={`shapes-box-graphic ${large ? "is-large" : ""}`} viewBox={`0 0 ${BOX} ${BOX}`} role="img" aria-label={label} data-active={active ? "" : undefined}>
      <BoxShapes entries={entries} mode={mode} capacity={capacity} large={large} focusable={!!onActive} active={active} onHover={onActive && onHover} />
    </svg>
    {showCard && hover && entry && hover.id === active && <span ref={card} className="shapes-hover" role="tooltip">
      <HoverCard entry={entry} mode={mode} capacity={capacity} />
    </span>}
  </span>;
}
