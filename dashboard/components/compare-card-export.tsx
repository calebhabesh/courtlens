"use client";

import { forwardRef } from "react";
import { leadingIdentity, toneColor } from "./charts/semantics";
import { cardLabel, formatCardValue, isPercentUnit, isWholeCount } from "@/lib/comparison-metrics";
import { portraitSource } from "@/lib/portrait-source";
import { teamBrandColor } from "@/lib/team-colors";
import { WORDMARK_HEIGHT, WORDMARK_PATH, WORDMARK_WIDTH } from "@/lib/courtlens-wordmark";
import type { AccoladeRow, SeasonHonors } from "@/lib/compare-accolades";
import type { GoodDirection } from "@/lib/percentile-display";
import type { MetricComparisonItem, MetricDefinition } from "@/lib/types";
import { slotTeams, teamRecord, type CompareSlotPlayer } from "./compare-player-slot";
import { BrandMark } from "./brand";

const WIDTH = 560, PHOTO = 168, TOP = 24, ROW = 34, ROWS_TOP = TOP + PHOTO + 82, MARK = 20, LOGO = 24;

type ExportRow = { key: string; label: string; shown: [string, string]; leader: "a" | "b" | null; pill: string | null };

/**
 * The duel card as one SVG, for Share Image and Export SVG: the same portraits, values,
 * leading-side pills, emphasis and accolades as the page card, closing on the wordmark. Drawn
 * with tokens that export resolves to colours.
 */
export const CompareCardExport = forwardRef<SVGSVGElement, {
  players: [CompareSlotPlayer, CompareSlotPlayer];
  rows: MetricComparisonItem[];
  accolades?: AccoladeRow[];
  honors?: [SeasonHonors, SeasonHonors];
  direction: (metric: string) => GoodDirection;
  labels: Map<string, MetricDefinition>;
  title: string;
  season?: string;
  /** Each player's own season when they differ; the photo and caption follow it. */
  seasons?: [string, string];
}>(function CompareCardExport({ players, rows, accolades = [], honors, direction, labels, title, season, seasons }, ref) {
  const lines: ExportRow[] = [
    ...rows.map(row => {
      const a = typeof row.value_a === "number" ? row.value_a : null, b = typeof row.value_b === "number" ? row.value_b : null;
      const gap = a != null && b != null ? Math.abs(a - b) * (isPercentUnit(row.unit) ? 100 : 1) : null;
      const precision = isWholeCount(row.metric) ? 0 : 1;
      const leader = gap != null && Number(gap.toFixed(precision)) > 0 ? leadingIdentity(a, b, direction(row.metric)) : null;
      return { key: row.metric, label: cardLabel(row.metric, labels.get(row.metric)), leader,
        shown: [formatCardValue(row.value_a, row.unit, row.metric), formatCardValue(row.value_b, row.unit, row.metric)] as [string, string],
        pill: leader && gap != null ? `+${gap.toLocaleString("en-US", { minimumFractionDigits: precision, maximumFractionDigits: precision })}` : null };
    }),
    ...accolades.map(row => ({ key: row.key, label: row.label, shown: row.shown, leader: row.leader,
      pill: row.leader && row.a != null && row.b != null ? `+${Math.abs(row.a - row.b)}` : null }))
  ];
  // Match the card: every honor stays visible in rows centered on its player's numeric column.
  const honorColumns = honors?.map(entry => {
    const badges = entry.badges?.length ? entry.badges : [{ code: "EMPTY", label: entry.badges == null ? "—" : entry.pending ? "Pending" : "None recorded", win: false }];
    const rowWidths = new Map<number, number>();
    let x = 0, y = 0;
    const placed = badges.map(badge => {
      const width = Math.min(192, badge.label.length * 7.5 + 16);
      if (x && x + width > 192) { x = 0; y += 28; }
      const item = { ...badge, x, y, width };
      rowWidths.set(y, x + width); x += width + 4;
      return item;
    });
    return placed.map(badge => ({ ...badge, x: badge.x + (192 - (rowWidths.get(badge.y) ?? 192)) / 2 }));
  }) ?? [];
  const honorsTop = ROWS_TOP + lines.length * ROW;
  const honorsHeight = honors ? 34 + Math.max(0, ...honorColumns.flatMap(column => column.map(badge => badge.y))) + 28 : 0;
  const pending = honors?.some(entry => entry.pending) ?? false;
  const height = honorsTop + honorsHeight + (pending ? 20 : 0) + 56;
  const column = (side: 0 | 1) => side === 0 ? WIDTH * 0.25 : WIDTH * 0.75;
  const markWidth = MARK * WORDMARK_WIDTH / WORDMARK_HEIGHT;
  return <svg ref={ref} xmlns="http://www.w3.org/2000/svg" className="pvp-export-svg" role="img" aria-label={title} viewBox={`0 0 ${WIDTH} ${height}`} width={WIDTH} height={height}
    fontFamily="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif">
    <title>{title}</title>
    <rect width={WIDTH} height={height} rx="16" fill="var(--color-surface-1)" />
    {players.map((player, side) => {
      const x = column(side as 0 | 1) - PHOTO / 2;
      const latest = slotTeams(player).at(-1);
      const own = seasons?.[side] ?? season;
      const source = portraitSource(player.portrait_url, player.id, 288, own ? { season: own, team: latest } : null);
      const id = `pvp-export-clip-${side}`;
      return <g key={player.id}>
        <clipPath id={id}><rect x={x} y={TOP} width={PHOTO} height={PHOTO} rx="12" /></clipPath>
        <rect x={x} y={TOP} width={PHOTO} height={PHOTO} rx="12" fill={teamBrandColor(latest) ?? "var(--color-surface-3)"} />
        {teamRecord(latest) && <image href={teamRecord(latest)!.asset} x={x - PHOTO * 0.075} y={TOP - PHOTO * 0.115} width={PHOTO * 1.15} height={PHOTO * 1.15} opacity="0.42" clipPath={`url(#${id})`} />}
        {source && <image href={source.src} x={x} y={TOP} width={PHOTO} height={PHOTO} clipPath={`url(#${id})`} preserveAspectRatio="xMidYMax slice" />}
        <rect x={x + PHOTO - 58} y={TOP + PHOTO - 30} width="52" height="24" rx="6" fill="var(--color-text)" />
        <text x={x + PHOTO - 32} y={TOP + PHOTO - 13} textAnchor="middle" fontSize="12" fontWeight="600" fill="var(--color-surface-0)">{`${player.games_played} GP`}</text>
        <text x={column(side as 0 | 1)} y={TOP + PHOTO + 26} textAnchor="middle" fontSize="15" fontWeight="600" fill="var(--color-text)">{player.name}</text>
        <text x={column(side as 0 | 1)} y={TOP + PHOTO + 44} textAnchor="middle" fontSize="12" fill="var(--color-text-secondary)">{[seasons && seasons[0] !== seasons[1] ? seasons[side] : null, ...slotTeams(player).map(team => teamRecord(team)?.artwork_name ?? team)].filter(Boolean).join(" · ")}</text>
      </g>;
    })}
    {lines.map((line, index) => {
      const y = ROWS_TOP + index * ROW;
      const pillX = line.leader === "a" ? 20 : WIDTH - 72;
      return <g key={line.key}>
        {line.leader && line.pill && <>
          <rect x={pillX} y={y - 15} width="52" height="20" rx="10" fill={toneColor(`identity-${line.leader}`)} />
          <text x={pillX + 26} y={y} textAnchor="middle" fontSize="12" fontWeight="600" fill="var(--color-on-accent)">{line.pill}</text>
        </>}
        <text x={WIDTH * 0.3} y={y} textAnchor="middle" fontSize="16" fontWeight={line.leader === "a" ? 700 : 500} fill="var(--color-text)">{line.shown[0]}</text>
        <text x={WIDTH / 2} y={y - 1} textAnchor="middle" fontSize="11" fontWeight="600" fill="var(--color-text-secondary)">{line.label}</text>
        <text x={WIDTH * 0.7} y={y} textAnchor="middle" fontSize="16" fontWeight={line.leader === "b" ? 700 : 500} fill="var(--color-text)">{line.shown[1]}</text>
      </g>;
    })}
    {honors && <>
      <text x={WIDTH / 2} y={honorsTop + 10} textAnchor="middle" fontSize="10" fontWeight="600" fill="var(--color-text-secondary)">{[...new Set(honors.map(entry => entry.season))].join(" / ")} Honors</text>
      {honorColumns.map((column, side) => <g key={side} transform={`translate(${WIDTH * (side === 0 ? 0.3 : 0.7) - 96} ${honorsTop + 22})`}>
        {column.map(badge => <g key={badge.code}>
          <rect x={badge.x} y={badge.y} width={badge.width} height="22" rx="4" fill={badge.win || badge.code === "AS" ? "var(--color-accent-soft)" : "var(--color-surface-2)"} />
          <text x={badge.x + badge.width / 2} y={badge.y + 15} textAnchor="middle" fontSize="12" fill={badge.win || badge.code === "AS" ? "var(--color-accent)" : "var(--color-text-secondary)"}>{badge.label}</text>
        </g>)}
      </g>)}
      {pending && <text x={WIDTH / 2} y={honorsTop + honorsHeight + 8} textAnchor="middle" fontSize="11" fill="var(--color-text-secondary)">End-of-season awards pending at this cutoff.</text>}
    </>}
    {/* The ball-lens logo beside the wordmark, as on the card (23). */}
    <g transform={`translate(${(WIDTH - markWidth - LOGO - 8) / 2} ${height - 22 - LOGO})`}><BrandMark size={LOGO} framed={false} /></g>
    <path d={WORDMARK_PATH} fill="var(--color-accent)" transform={`translate(${(WIDTH - markWidth - LOGO - 8) / 2 + LOGO + 8} ${height - 20 - MARK}) scale(${MARK / WORDMARK_HEIGHT})`} />
  </svg>;
});
