"use client";

import { honorRows, type HonorCell, type SeasonHonors } from "@/lib/compare-accolades";
import { Badge } from "./ui/badge";

/**
 * One player's result in an honour row: gold with its icon for a win, a title or an All-Star
 * selection; neutral for vote finishes and team selections. Gold marks an earned honour, never
 * a winning side of the comparison.
 */
export function HonorChip({ cell, category }: { cell: HonorCell | null; category: string }) {
  if (!cell) return <span className="pvp-honors-empty"><span aria-hidden="true">—</span><span className="sr-only">No {category}</span></span>;
  const icon = cell.star ? "star" : cell.win ? category === "Title" ? "trophy" : "medal" : undefined;
  return <Badge variant={cell.win || cell.star ? "accent" : "default"} icon={icon} title={cell.description}>{cell.text}</Badge>;
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
      {rows.map(row => <tr key={row.key}>
        <td />
        <td className="pvp-honor-cell"><HonorChip cell={row.cells[0]} category={row.label} /></td>
        <th scope="row" className="pvp-label">{row.label}</th>
        <td className="pvp-honor-cell"><HonorChip cell={row.cells[1]} category={row.label} /></td>
        <td />
      </tr>)}
      {!rows.length && <tr className="pvp-pending"><td colSpan={5}>{unknown ? "Honors unavailable for these players." : `No ${seasons} honors for either player.`}</td></tr>}
    </tbody>
  </table>;
}
