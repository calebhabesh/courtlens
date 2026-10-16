"use client";

import { forwardRef } from "react";
import { leadingIdentity, toneColor } from "./charts/semantics";
import { cardLabel, formatCardValue, isPercentUnit, isWholeCount, pillStrength, type PillStrength } from "@/lib/comparison-metrics";
import { portraitSource } from "@/lib/portrait-source";
import { teamBrandColor } from "@/lib/team-colors";
import { WORDMARK_HEIGHT, WORDMARK_PATH, WORDMARK_WIDTH } from "@/lib/courtlens-wordmark";
import { honorRows, type AccoladeRow, type SeasonHonors } from "@/lib/compare-accolades";
import type { GoodDirection } from "@/lib/percentile-display";
import type { MetricComparisonItem, MetricDefinition } from "@/lib/types";
import { slotTeams, teamRecord, type CompareSlotPlayer } from "./compare-player-slot";
import { BrandMark } from "./brand";

const WIDTH = 560, PHOTO = 168, TOP = 24, ROW = 34, ROWS_TOP = TOP + PHOTO + 82, MARK = 20, LOGO = 24;

type ExportRow = { key: string; label: string; shown: [string, string]; leader: "a" | "b" | null; pill: string | null; strength: PillStrength };
type ExportPlainLine = { a: number | null; b: number | null; quiet?: boolean; digits?: number };

/** The card's three pill tiers: a faint tint, a stronger tint and the solid colour. */
const PILL_FILL: Record<PillStrength, number> = { 1: 0.12, 2: 0.3, 3: 1 };

function plainLine(key: string, label: string, line: ExportPlainLine): ExportRow {
  const digits = line.digits ?? 0;
  const gap = line.a != null && line.b != null ? Number(Math.abs(line.a - line.b).toFixed(digits)) : 0;
  const leader = !line.quiet && line.a != null && line.b != null && gap > 0 ? line.a > line.b ? "a" : "b" : null;
  const shown = (value: number | null) => value == null ? "—" : value.toFixed(digits);
  return { key, label, shown: [shown(line.a), shown(line.b)], leader, pill: leader ? `+${gap.toFixed(digits)}` : null,
    strength: line.a != null && line.b != null ? pillStrength(line.a, line.b) : 1 };
}

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
  /** The card's Avail % row (Overall only). */
  availability?: ExportPlainLine | null;
  /** Both players' ranked league percentiles for a metric, for the pill tiers; absent in Career. */
  percentiles?: (metric: string) => [number | null, number | null];
}>(function CompareCardExport({ players, rows, accolades = [], honors, direction, labels, title, season, seasons, availability, percentiles }, ref) {
  const lines: ExportRow[] = [
    ...rows.map(row => {
      const a = typeof row.value_a === "number" ? row.value_a : null, b = typeof row.value_b === "number" ? row.value_b : null;
      const gap = a != null && b != null ? Math.abs(a - b) * (isPercentUnit(row.unit) ? 100 : 1) : null;
      const precision = isWholeCount(row.metric) ? 0 : 1;
      const leader = gap != null && Number(gap.toFixed(precision)) > 0 ? leadingIdentity(a, b, direction(row.metric)) : null;
      return { key: row.metric, label: cardLabel(row.metric, labels.get(row.metric)), leader,
        shown: [formatCardValue(row.value_a, row.unit, row.metric), formatCardValue(row.value_b, row.unit, row.metric)] as [string, string],
        pill: leader && gap != null ? `+${gap.toLocaleString("en-US", { minimumFractionDigits: precision, maximumFractionDigits: precision })}` : null,
        strength: a != null && b != null ? pillStrength(a, b, percentiles?.(row.metric), row.unit) : 1 } satisfies ExportRow;
    }),
    ...(availability ? [plainLine("availability", "Avail %", availability)] : []),
    ...accolades.map(row => ({ key: row.key, label: row.label, shown: row.shown, leader: row.leader,
      pill: row.leader && row.a != null && row.b != null ? `+${Math.abs(row.a - row.b)}` : null,
      strength: row.a != null && row.b != null ? pillStrength(row.a, row.b) : 1 } satisfies ExportRow))
  ];
  // Match the card (76): one row per award either player holds, under a section heading.
  const honorLines = honors ? honorRows(honors) : [];
  const honorsTop = ROWS_TOP + lines.length * ROW;
  const honorsHeight = honors ? 30 + Math.max(1, honorLines.length) * ROW : 0;
  const height = honorsTop + honorsHeight + 56;
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
          <rect x={pillX} y={y - 15} width="52" height="20" rx="10" fill={toneColor(`identity-${line.leader}`)} fillOpacity={PILL_FILL[line.strength]} />
          <text x={pillX + 26} y={y} textAnchor="middle" fontSize="12" fontWeight="600" fill={line.strength === 3 ? "var(--color-on-accent)" : toneColor(`identity-${line.leader}`)}>{line.pill}</text>
        </>}
        <text x={WIDTH * 0.3} y={y} textAnchor="middle" fontSize="16" fontWeight={line.leader === "a" ? 700 : 500} fill="var(--color-text)">{line.shown[0]}</text>
        <text x={WIDTH / 2} y={y - 1} textAnchor="middle" fontSize="11" fontWeight="600" fill="var(--color-text-secondary)">{line.label}</text>
        <text x={WIDTH * 0.7} y={y} textAnchor="middle" fontSize="16" fontWeight={line.leader === "b" ? 700 : 500} fill="var(--color-text)">{line.shown[1]}</text>
      </g>;
    })}
    {honors && <>
      <text x={WIDTH / 2} y={honorsTop + 10} textAnchor="middle" fontSize="10" fontWeight="600" fill="var(--color-text-secondary)">{[...new Set(honors.map(entry => entry.season))].join(" / ")} Honors</text>
      {honorLines.map((row, index) => { const y = honorsTop + 30 + index * ROW + 14; return <g key={row.key}>
        {row.cells.map((cell, side) => <text key={side} x={WIDTH * (side === 0 ? 0.3 : 0.7)} y={y} textAnchor="middle" fontSize="14" fontWeight={cell?.win || cell?.star ? 600 : 400}
          fill={cell?.win || cell?.star ? "var(--color-accent)" : cell ? "var(--color-text)" : "var(--color-text-secondary)"}>{cell?.text ?? "—"}</text>)}
        <text x={WIDTH / 2} y={y - 1} textAnchor="middle" fontSize="11" fontWeight="600" fill="var(--color-text-secondary)">{row.label}</text>
      </g>; })}
      {!honorLines.length && <text x={WIDTH / 2} y={honorsTop + 44} textAnchor="middle" fontSize="12" fill="var(--color-text-secondary)">—</text>}
    </>}
    {/* The ball-lens logo beside the wordmark, as on the card (23). */}
    <g transform={`translate(${(WIDTH - markWidth - LOGO - 8) / 2} ${height - 22 - LOGO})`}><BrandMark size={LOGO} framed={false} /></g>
    <path d={WORDMARK_PATH} fill="var(--color-accent)" transform={`translate(${(WIDTH - markWidth - LOGO - 8) / 2 + LOGO + 8} ${height - 20 - MARK}) scale(${MARK / WORDMARK_HEIGHT})`} />
  </svg>;
});
