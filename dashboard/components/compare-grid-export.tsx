"use client";

import { forwardRef } from "react";
import { portraitSource } from "@/lib/portrait-source";
import { teamBrandColor } from "@/lib/team-colors";
import { bestColumns } from "@/lib/compare-grid";
import { honorRows } from "@/lib/compare-accolades";
import { WORDMARK_HEIGHT, WORDMARK_PATH, WORDMARK_WIDTH } from "@/lib/courtlens-wordmark";
import { teamRecord } from "./compare-player-slot";
import { BrandMark } from "./brand";
import type { GridColumn, gridLines } from "./compare-grid";

const LABEL = 120, COLUMN = 128, PHOTO = 96, TOP = 24, ROW = 30, MARK = 20, LOGO = 24, PAD = 20;

/**
 * The grid card as one SVG for Share Image and Export SVG (alignment row 3, 64): the same
 * photos, values and best-value emphasis as the page, closing on the wordmark.
 */
export const CompareGridExport = forwardRef<SVGSVGElement, { columns: GridColumn[]; lines: ReturnType<typeof gridLines>; title: string }>(function CompareGridExport({ columns, lines, title }, ref) {
  const width = PAD * 2 + LABEL + columns.length * COLUMN;
  const rows = [...lines.metrics, ...lines.accolades];
  const honors = honorRows(lines.honors.map(entry => entry.honors));
  const rowsTop = TOP + PHOTO + 70;
  const honorsTop = rowsTop + rows.length * ROW;
  const height = honorsTop + (honors.length ? 24 + honors.length * ROW : 0) + 64;
  const x = (index: number) => PAD + LABEL + index * COLUMN + COLUMN / 2;
  const markWidth = MARK * WORDMARK_WIDTH / WORDMARK_HEIGHT;
  return <svg ref={ref} xmlns="http://www.w3.org/2000/svg" className="pvp-export-svg" role="img" aria-label={title} viewBox={`0 0 ${width} ${height}`} width={width} height={height}
    fontFamily="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif">
    <title>{title}</title>
    <rect width={width} height={height} rx="16" fill="var(--color-surface-1)" />
    {columns.map((column, index) => {
      const latest = column.player.teams_chronological.at(-1);
      const source = portraitSource(undefined, column.player.player_id, 288, { season: column.season, team: latest });
      const left = x(index) - PHOTO / 2, id = `pvp-grid-export-clip-${index}`;
      return <g key={column.player.player_id}>
        <clipPath id={id}><rect x={left} y={TOP} width={PHOTO} height={PHOTO} rx="10" /></clipPath>
        <rect x={left} y={TOP} width={PHOTO} height={PHOTO} rx="10" fill={teamBrandColor(latest) ?? "var(--color-surface-3)"} />
        {teamRecord(latest) && <image href={teamRecord(latest)!.asset} x={left - PHOTO * 0.075} y={TOP - PHOTO * 0.115} width={PHOTO * 1.15} height={PHOTO * 1.15} opacity="0.42" clipPath={`url(#${id})`} />}
        {source && <image href={source.src} x={left} y={TOP} width={PHOTO} height={PHOTO} clipPath={`url(#${id})`} preserveAspectRatio="xMidYMax slice" />}
        <text x={x(index)} y={TOP + PHOTO + 22} textAnchor="middle" fontSize="13" fontWeight="600" fill="var(--color-text)">{column.player.name.length > 18 ? `${column.player.name.slice(0, 17)}…` : column.player.name}</text>
        <text x={x(index)} y={TOP + PHOTO + 40} textAnchor="middle" fontSize="11" fill="var(--color-text-secondary)">{/* Columns are narrow: the team's code keeps each caption inside its column. */}{[column.season, teamRecord(latest)?.tricode ?? latest].filter(Boolean).join(" · ")}</text>
      </g>;
    })}
    {rows.map((line, row) => {
      const y = rowsTop + row * ROW;
      const best = bestColumns(line.values, line.direction, line.digits);
      return <g key={line.key}>
        <text x={PAD} y={y} fontSize="11" fontWeight="600" fill="var(--color-text-secondary)">{line.label}</text>
        {line.shown.map((shown, index) => <g key={index}>
          {best.includes(index) && <rect x={x(index) - 34} y={y - 16} width="68" height="22" rx="6" fill="var(--color-accent)" fillOpacity="0.16" />}
          <text x={x(index)} y={y} textAnchor="middle" fontSize="15" fontWeight={best.includes(index) ? 700 : 500} fill="var(--color-text)">{shown}</text>
        </g>)}
      </g>;
    })}
    {/* Season honours, one row per award, as on the card (76). */}
    {honors.length > 0 && <text x={PAD} y={honorsTop + 8} fontSize="10" fontWeight="600" fill="var(--color-text-secondary)">SEASON HONORS</text>}
    {honors.map((row, index) => { const y = honorsTop + 24 + index * ROW + 6; return <g key={row.key}>
      <text x={PAD} y={y} fontSize="11" fontWeight="600" fill="var(--color-text-secondary)">{row.label}</text>
      {row.cells.map((cell, column) => <text key={column} x={x(column)} y={y} textAnchor="middle" fontSize="13" fontWeight={cell?.win || cell?.star ? 600 : 400}
        fill={cell?.win || cell?.star ? "var(--color-accent)" : cell ? "var(--color-text)" : "var(--color-text-secondary)"}>{cell?.text ?? "—"}</text>)}
    </g>; })}
    <g transform={`translate(${(width - markWidth - LOGO - 8) / 2} ${height - 22 - LOGO})`}><BrandMark size={LOGO} framed={false} /></g>
    <path d={WORDMARK_PATH} fill="var(--color-accent)" transform={`translate(${(width - markWidth - LOGO - 8) / 2 + LOGO + 8} ${height - 20 - MARK}) scale(${MARK / WORDMARK_HEIGHT})`} />
  </svg>;
});
