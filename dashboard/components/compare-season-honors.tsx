"use client";

import { honorMarks, honorRows, type HonorCell, type SeasonHonors } from "@/lib/compare-accolades";
import type { PillStrength } from "@/lib/comparison-metrics";
import { Badge } from "./ui/badge";

/**
 * One player's result in an honour row. Its icon marks what was earned (a medal for an award win,
 * a trophy for a title, a star for All-Star). A win, a title and a selection take their player's
 * colour (solid for a win, All-Star or 1st Team); between vote finishes nobody won, the better one
 * does, filling in with how decisive it is, like the stat pills (honorMarks). Everything else is plain.
 */
export function HonorChip({ cell, category, lead, tied = false }: { cell: HonorCell | null; category: string; lead?: { identity?: "a" | "b"; strength: PillStrength } | null;
  /** Every player holds the same result: shown as held equally, never as nothing (83). */
  tied?: boolean }) {
  if (!cell) return <span className="pvp-honors-empty"><span aria-hidden="true">—</span><span className="sr-only">No {category}</span></span>;
  const icon = cell.star ? "star" : cell.win ? category === "Title" ? "trophy" : "medal" : undefined;
  return <Badge className="pvp-honor-chip" data-identity={lead?.identity} data-strength={lead?.strength} data-tied={tied || undefined} icon={icon}
    title={lead && !cell.win && !cell.star && !cell.text.endsWith("Team") ? `${cell.description} (better finish in this row)` : tied ? `${cell.description} (held equally)` : cell.description}>{cell.text}</Badge>;
}

/** The season label of the honours section ("2025-26", or "2024-25 / 2025-26" across seasons). */
export function honorSeasons(honors: [SeasonHonors, SeasonHonors]) {
  return [...new Set(honors.map(entry => entry.season))].join(" / ");
}

/** Neither player holds a season honour, and the source is known (unknown is not none). */
export function honorsNone(honors: [SeasonHonors, SeasonHonors]) {
  return honors.some(entry => entry.badges != null) && honorRows(honors).length === 0;
}

/**
 * An empty section reads as its own heading with a quiet suffix ("Accolades · None"), one line
 * instead of a heading and a sentence. ``note`` is the suffix; ``spoken`` the screen-reader text.
 */
export function EmptySectionHeading({ label, note = "None", spoken }: { label: string; note?: string; spoken: string }) {
  return <tr className="pvp-group">
    <th colSpan={5} scope="colgroup"><span aria-hidden="true">{label}<span className="pvp-group-note"> · {note}</span></span><span className="sr-only">{spoken}</span></th>
  </tr>;
}

/**
 * The duel's season honours (alignment row 3, 76): one mirrored row per award either player
 * holds, labelled in the centre like every stat above it, so the section reads as a grid.
 */
export function CompareSeasonHonors({ honors, names }: { honors: [SeasonHonors, SeasonHonors]; names: [string, string] }) {
  const seasons = honorSeasons(honors);
  const rows = honorRows(honors);
  const unknown = honors.every(entry => entry.badges == null);
  return <table className="pvp-rows pvp-honors" aria-label="Season honors">
    <caption className="sr-only">{`${seasons} honors`}</caption>
    <colgroup><col className="pvp-col-pill" /><col /><col className="pvp-col-label" /><col /><col className="pvp-col-pill" /></colgroup>
    <thead className="sr-only"><tr><td /><th scope="col">{names[0]}</th><th scope="col">Honor</th><th scope="col">{names[1]}</th><td /></tr></thead>
    <tbody>
      {rows.length > 0 ? <tr className="pvp-group"><th colSpan={5} scope="colgroup">{seasons} Honors</th></tr>
        : unknown ? <EmptySectionHeading label={`${seasons} Honors`} note="Unavailable" spoken={`${seasons} honors unavailable for these players.`} />
        : <EmptySectionHeading label={`${seasons} Honors`} spoken={`No ${seasons} honors for either player.`} />}
      {rows.map(row => {
        const { marks, tied } = honorMarks(row.key, row.cells);
        const of = (index: number) => { const mark = marks[index]; return mark ? { identity: index === 0 ? "a" as const : "b" as const, strength: mark } : null; };
        return <tr key={row.key}>
          <td />
          <td className="pvp-honor-cell"><HonorChip cell={row.cells[0]} category={row.label} lead={of(0)} tied={tied} /></td>
          <th scope="row" className="pvp-label">{row.label}</th>
          <td className="pvp-honor-cell"><HonorChip cell={row.cells[1]} category={row.label} lead={of(1)} tied={tied} /></td>
          <td />
        </tr>;
      })}
    </tbody>
  </table>;
}
