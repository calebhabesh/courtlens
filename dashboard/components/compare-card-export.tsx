"use client";

import { forwardRef } from "react";
import { leadingIdentity, toneColor } from "./charts/semantics";
import { cardLabel, formatCardValue, isPercentUnit } from "@/lib/comparison-metrics";
import { portraitSource } from "@/lib/portrait-source";
import { teamBrandColor } from "@/lib/team-colors";
import type { GoodDirection } from "@/lib/percentile-display";
import type { MetricComparisonItem, MetricDefinition } from "@/lib/types";
import type { CompareSlotPlayer } from "./compare-player-slot";

const WIDTH = 560, PHOTO = 168, TOP = 24, ROW = 34, ROWS_TOP = TOP + PHOTO + 64;

/**
 * The duel card as one SVG, for Share Image and Export SVG: the same portraits, values and
 * leading-side pills as the page card, drawn with tokens that export resolves to colours.
 */
export const CompareCardExport = forwardRef<SVGSVGElement, {
  players: [CompareSlotPlayer, CompareSlotPlayer];
  rows: MetricComparisonItem[];
  direction: (metric: string) => GoodDirection;
  labels: Map<string, MetricDefinition>;
  title: string;
  footnote: string;
}>(function CompareCardExport({ players, rows, direction, labels, title, footnote }, ref) {
  const height = ROWS_TOP + rows.length * ROW + 48;
  const column = (side: 0 | 1) => side === 0 ? WIDTH * 0.25 : WIDTH * 0.75;
  return <svg ref={ref} xmlns="http://www.w3.org/2000/svg" className="pvp-export-svg" role="img" aria-label={title} viewBox={`0 0 ${WIDTH} ${height}`} width={WIDTH} height={height}
    fontFamily="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif">
    <title>{title}</title>
    <rect width={WIDTH} height={height} rx="16" fill="var(--color-surface-1)" />
    {players.map((player, side) => {
      const x = column(side as 0 | 1) - PHOTO / 2;
      const source = portraitSource(player.portrait_url, player.id, 288);
      const id = `pvp-export-clip-${side}`;
      return <g key={player.id}>
        <clipPath id={id}><rect x={x} y={TOP} width={PHOTO} height={PHOTO} rx="12" /></clipPath>
        <rect x={x} y={TOP} width={PHOTO} height={PHOTO} rx="12" fill={teamBrandColor(player.teams[0]) ?? "var(--color-surface-3)"} />
        {source && <image href={source.src} x={x} y={TOP} width={PHOTO} height={PHOTO} clipPath={`url(#${id})`} preserveAspectRatio="xMidYMax slice" />}
        <rect x={x + PHOTO - 58} y={TOP + PHOTO - 30} width="52" height="24" rx="6" fill="var(--color-text)" />
        <text x={x + PHOTO - 32} y={TOP + PHOTO - 13} textAnchor="middle" fontSize="12" fontWeight="600" fill="var(--color-surface-0)">{`${player.games_played} GP`}</text>
        <text x={column(side as 0 | 1)} y={TOP + PHOTO + 26} textAnchor="middle" fontSize="15" fontWeight="600" fill="var(--color-text)">{player.name}</text>
      </g>;
    })}
    {rows.map((row, index) => {
      const a = typeof row.value_a === "number" ? row.value_a : null, b = typeof row.value_b === "number" ? row.value_b : null;
      const leader = leadingIdentity(a, b, direction(row.metric));
      const y = ROWS_TOP + index * ROW;
      const gap = a != null && b != null ? Math.abs(a - b) * (isPercentUnit(row.unit) ? 100 : 1) : null;
      const pillX = leader === "a" ? 20 : WIDTH - 72;
      return <g key={row.metric}>
        {leader && gap != null && <>
          <rect x={pillX} y={y - 15} width="52" height="20" rx="10" fill={toneColor(`identity-${leader}`)} />
          <text x={pillX + 26} y={y} textAnchor="middle" fontSize="12" fontWeight="600" fill="var(--color-on-accent)">{`+${gap.toFixed(row.metric === "gp" ? 0 : 1)}`}</text>
        </>}
        <text x={WIDTH * 0.3} y={y} textAnchor="middle" fontSize="16" fontWeight="500" fill="var(--color-text)">{formatCardValue(row.value_a, row.unit, row.metric)}</text>
        <text x={WIDTH / 2} y={y - 1} textAnchor="middle" fontSize="11" fontWeight="600" fill="var(--color-text-secondary)">{cardLabel(row.metric, labels.get(row.metric))}</text>
        <text x={WIDTH * 0.7} y={y} textAnchor="middle" fontSize="16" fontWeight="500" fill="var(--color-text)">{formatCardValue(row.value_b, row.unit, row.metric)}</text>
      </g>;
    })}
    <text x="20" y={height - 20} fontSize="11" fill="var(--color-text-secondary)">{footnote}</text>
    <text x={WIDTH - 20} y={height - 20} textAnchor="end" fontSize="13" fontWeight="700" fill="var(--color-accent)">CourtLens</text>
  </svg>;
});
