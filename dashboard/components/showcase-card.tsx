import { forwardRef } from "react";
import catalog from "@/lib/team-branding.json";
import { teamAccent } from "@/lib/team-colors";
import { portraitSource } from "@/lib/portrait-source";
import { WORDMARK_HEIGHT, WORDMARK_WIDTH } from "@/lib/courtlens-wordmark";
import { CourtLensWordmark } from "./courtlens-wordmark";
import { ordinal } from "./ui/stat-tile";
import type { PlayerResearchItem } from "@/lib/types";

// The card is SVG so the export is exactly the card on screen (FO04, D15/D16). Colors are literal
// because an exported SVG cannot resolve CSS custom properties; they mirror the dark tokens.
const C = {
  bg: "#14161b", panel: "#1c1f26", track: "#2a2f39", hairline: "#2a2d34",
  text: "#f1f3f6", secondary: "#b4bdca", tertiary: "#8a93a3", accent: "#ffd166"
};
const FONT = "Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
const MONO = "'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, monospace";

export const CARD_WIDTH = 560;
export const CARD_HEIGHT = 700;

export interface ShowcaseCardStat {
  key: string;
  label: string;
  value: string;
  /** Oriented percentile (higher is better), 0–100; null when the cohort has none. */
  percentile: number | null;
  rank: number | null;
}

export interface ShowcaseCardProps {
  player: PlayerResearchItem;
  focusLabel: string;
  stats: ShowcaseCardStat[];
  /** "2025-26 Regular Season · Through Apr 12, 2026" (D16); identical on screen and in exports. */
  contextLine: string;
}

function teamRecord(team?: string) {
  return team ? catalog.teams.find((entry) => entry.team_id === team || entry.tricode === team) : undefined;
}

// The 140px circle is also exported as a PNG at up to 2x, so it takes the largest derivative.
function portraitHref(player: PlayerResearchItem): string {
  return portraitSource(player.portrait_url, player.player_id, 288)?.src ?? "";
}

function initials(name: string): string {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase() ?? "").join("");
}

/** Shrinks long names to fit the hero width instead of clipping them. */
function nameSize(name: string): number {
  return Math.max(20, Math.min(30, Math.floor(320 / Math.max(1, name.length * 0.56))));
}

export const ShowcaseCard = forwardRef<SVGSVGElement, ShowcaseCardProps>(function ShowcaseCard(
  { player, focusLabel, stats, contextLine }, ref
) {
  const currentTeam = player.teams[player.teams.length - 1];
  const record = teamRecord(currentTeam);
  const color = teamAccent(currentTeam) ?? C.accent;
  const clipId = `showcase-portrait-${player.player_id}`;
  const teamLine = player.teams.length > 1
    ? player.teams.join(" / ")
    : record ? `${record.tricode} · ${record.artwork_name}` : currentTeam ?? "Team unknown";
  const summary = `${player.games_played} games · ${Math.round(player.total_minutes).toLocaleString("en-US")} min`;

  return (
    <svg
      ref={ref}
      xmlns="http://www.w3.org/2000/svg"
      viewBox={`0 0 ${CARD_WIDTH} ${CARD_HEIGHT}`}
      width={CARD_WIDTH}
      height={CARD_HEIGHT}
      className="showcase-card-svg"
      role="img"
      aria-label={`Showcase card for ${player.player_name}, ${focusLabel}, ${contextLine}`}
    >
      <defs>
        <clipPath id={clipId}><circle cx="110" cy="112" r="70" /></clipPath>
        <linearGradient id={`${clipId}-band`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor={color} stopOpacity="0.32" />
          <stop offset="1" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>

      <rect width={CARD_WIDTH} height={CARD_HEIGHT} rx="16" fill={C.bg} />
      <rect width={CARD_WIDTH} height="224" rx="16" fill={`url(#${clipId}-band)`} />
      <rect x="0.5" y="0.5" width={CARD_WIDTH - 1} height={CARD_HEIGHT - 1} rx="15.5" fill="none" stroke={C.hairline} />
      <rect x="0" y="32" width="5" height="160" rx="2.5" fill={color} />

      {/* Headshot with team-color ring; initials when the image cannot load */}
      <circle cx="110" cy="112" r="74" fill={color} fillOpacity="0.28" />
      <text x="110" y="124" textAnchor="middle" fill={C.text} fontSize="36" fontWeight="700" fontFamily={FONT}>{initials(player.player_name)}</text>
      <image href={portraitHref(player)} x="40" y="42" width="140" height="140" preserveAspectRatio="xMidYMin slice" clipPath={`url(#${clipId})`} />
      <circle cx="110" cy="112" r="72" fill="none" stroke={color} strokeWidth="3" />

      {record && <image href={record.asset} x="206" y="44" width="44" height="44" />}
      <text x="206" y="128" fill={C.text} fontSize={nameSize(player.player_name)} fontWeight="700" fontFamily={FONT}>{player.player_name}</text>
      <text x="206" y="156" fill={C.secondary} fontSize="15" fontFamily={FONT}>{teamLine}</text>
      <text x="206" y="182" fill={C.tertiary} fontSize="13" fontFamily={FONT}>{summary}</text>

      <text x="32" y="254" fill={color} fontSize="12" fontWeight="700" letterSpacing="1.2" fontFamily={FONT}>{focusLabel.toUpperCase()}</text>

      {stats.slice(0, 6).map((stat, index) => {
        const x = 32 + (index % 2) * 256;
        const y = 268 + Math.floor(index / 2) * 124;
        const pct = stat.percentile === null ? null : Math.max(0, Math.min(100, stat.percentile));
        return (
          <g key={stat.key}>
            <rect x={x} y={y} width="240" height="112" rx="10" fill={C.panel} />
            <text x={x + 18} y={y + 28} fill={C.tertiary} fontSize="13" fontWeight="600" fontFamily={FONT}>{stat.label}</text>
            {stat.rank !== null && (
              <g>
                <rect x={x + 170} y={y + 12} width="52" height="24" rx="12" fill={C.track} />
                <text x={x + 196} y={y + 29} textAnchor="middle" fill={C.text} fontSize="13" fontWeight="700" fontFamily={FONT}>{ordinal(stat.rank)}</text>
              </g>
            )}
            <text x={x + 18} y={y + 70} fill={C.text} fontSize="34" fontWeight="700" fontFamily={MONO}>{stat.value}</text>
            {pct !== null && (
              <text x={x + 222} y={y + 70} textAnchor="end" fill={C.tertiary} fontSize="12" fontFamily={FONT}>{`${ordinal(Math.round(pct))} pct`}</text>
            )}
            <rect x={x + 18} y={y + 86} width="204" height="6" rx="3" fill={C.track} />
            {pct !== null && <rect x={x + 18} y={y + 86} width={Math.max(3, (204 * pct) / 100)} height="6" rx="3" fill={color} />}
          </g>
        );
      })}

      <line x1="32" y1="648" x2={CARD_WIDTH - 32} y2="648" stroke={C.hairline} />
      <text x="32" y="676" fill={C.secondary} fontSize="14" fontFamily={FONT}>{contextLine}</text>
      <CourtLensWordmark x={CARD_WIDTH - 32 - (14 * WORDMARK_WIDTH) / WORDMARK_HEIGHT} y={664} height={14} color={C.tertiary} />
    </svg>
  );
});
