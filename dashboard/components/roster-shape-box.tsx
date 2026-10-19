import { useMemo } from "react";
import { toneColor } from "./charts";
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
export function BoxShapes({ entries, mode, capacity, large = false }: { entries: BoxEntry[]; mode: ShapeMode; capacity: number; large?: boolean }) {
  const byId = useMemo(() => new Map(entries.map(e => [e.player.player_id, e])), [entries]);
  const packed = useMemo(() => packShapes(entries.flatMap(e => e.size && e.size > 0
    ? [{ id: e.player.player_id, area: e.size / capacity * BOX * BOX, kind: shapeKind(e.player.fit_band) }] : [])), [entries, capacity]);
  return <>{packed.shapes.map(shape => {
    const entry = byId.get(shape.id)!;
    const name = surname(entry.player.player_name);
    const font = Math.min(large ? 3.4 : 5, (shape.side * 0.82) / (name.length * 0.56));
    const marks = [shape.kind === "unknown" ? "shapes-unknown-fit" : "", entry.mark ? `shapes-mark-${entry.mark}` : ""].filter(Boolean).join(" ");
    return <g key={shape.id} data-shape-id={shape.id} data-fit-band={entry.player.fit_band ?? "unknown"} data-mark={entry.mark}>
      <path d={shapePath(shape)} fill={tone(entry.player.archetype?.primary)} className={marks || undefined} />
      {font >= (large ? 1.6 : 2.6) && <text className="shapes-label" x={shape.x + shape.side / 2} y={shape.y + shape.side / 2} fontSize={font} textAnchor="middle" dominantBaseline="central">{name}</text>}
      <title>{describe(entry, mode, capacity)}</title>
    </g>;
  })}</>;
}

/** The square box: shapes packed by area share, white is what a perfect team would add. */
export function ShapeBox({ entries, mode, capacity, label, large = false }: { entries: BoxEntry[]; mode: ShapeMode; capacity: number; label: string; large?: boolean }) {
  return <svg className={`shapes-box-graphic ${large ? "is-large" : ""}`} viewBox={`0 0 ${BOX} ${BOX}`} role="img" aria-label={label}>
    <BoxShapes entries={entries} mode={mode} capacity={capacity} large={large} />
  </svg>;
}
