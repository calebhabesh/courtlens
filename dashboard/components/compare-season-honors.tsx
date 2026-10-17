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

/**
 * The duel's season honours (alignment row 3, 76): one mirrored row per award either player
 * holds, labelled in the centre like every stat above it, so the section reads as a grid.
 */
export function CompareSeasonHonors({ honors, names }: { honors: [SeasonHonors, SeasonHonors]; names: [string, string] }) {
  const seasons = [...new Set(honors.map(entry => entry.season))].join(" / ");
  const rows = honorRows(honors);
  const unknown = honors.every(entry => entry.badges == null);
  return <table className="pvp-rows pvp-honors" aria-label="Season honors">
    <caption className="sr-only">{`${seasons} honors`}</caption>
    <colgroup><col className="pvp-col-pill" /><col /><col className="pvp-col-label" /><col /><col className="pvp-col-pill" /></colgroup>
    <thead className="sr-only"><tr><td /><th scope="col">{names[0]}</th><th scope="col">Honor</th><th scope="col">{names[1]}</th><td /></tr></thead>
    <tbody>
      <tr className="pvp-group"><th colSpan={5} scope="colgroup">{seasons} Honors</th></tr>
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
      {!rows.length && <tr className="pvp-pending"><td colSpan={5}>{unknown ? "Honors unavailable for these players." : `No ${seasons} honors for either player.`}</td></tr>}
    </tbody>
  </table>;
}
