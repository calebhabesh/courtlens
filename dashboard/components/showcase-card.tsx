import type { CSSProperties } from "react";
import { PercentileCell } from "./charts/percentile-cell";
import { PlayerPortrait } from "./player-portrait";
import { TeamWatermark } from "./team-watermark";
import { teamRecord } from "./compare-player-slot";
import { Icon } from "./ui/icon";
import { teamBrandColor } from "@/lib/team-colors";
import { formatColumnValue, type ColumnDefinition } from "@/lib/stats-presets";
import { cardTeam, changeText, seasonBadge, type RankChange } from "@/lib/showcase";
import type { PlayerResearchItem } from "@/lib/types";

export interface ShowcaseCardProps {
  player: PlayerResearchItem;
  rank: number;
  season: string;
  stats: ColumnDefinition[];
  change: RankChange;
  highlighted?: boolean;
  /** In the compare selection. */
  compared?: boolean;
  onOpen: (player: PlayerResearchItem) => void;
}

/** Databallr's showcase card: rank and season badges on the season photo, a name strip, 2×2 stats. */
export function ShowcaseCard({ player, rank, season, stats, change, highlighted = false, compared = false, onOpen }: ShowcaseCardProps) {
  const team = cardTeam(player);
  const record = teamRecord(team ?? undefined, season);
  const tint = teamBrandColor(team, season);
  const values = stats.map(stat => ({ stat, value: player.metrics[stat.key] == null ? null : formatColumnValue(stat, player) }));
  const moved = changeText(change);
  const label = `${rank}. ${player.player_name}, ${values.map(({ stat, value }) => `${stat.label} ${value ?? "unknown"}`).join(", ")}.${moved ? ` ${moved}.` : ""}${compared ? " Selected to compare." : ""} Open career`;
  return (
    <button type="button" className="sc-card" data-player={player.player_id} data-highlighted={highlighted || undefined} data-compared={compared || undefined}
      style={tint ? ({ "--team-tint": tint } as CSSProperties) : undefined} aria-label={label} onClick={() => onOpen(player)}>
      <span className="sc-photo">
        {record && <TeamWatermark asset={record.asset} />}
        <PlayerPortrait playerId={player.player_id} name={player.player_name} portraitUrl={player.portrait_url} size="xl"
          className="sc-portrait" era={{ season, team }} />
        <span className="sc-badge sc-rank">{rank}</span>
        <span className="sc-badge sc-season">{seasonBadge(season)}</span>
        <ChangeBadge change={change} />
      </span>
      <span className="sc-name">{player.player_name}</span>
      <span className="sc-stats">
        {values.map(({ stat, value }, index) => (
          <span key={stat.key} className="sc-stat" data-lead={index === 0 || undefined}>
            <span className="sc-stat-label">{stat.label}</span>
            <PercentileCell variant="text" value={value} percentile={player.table_percentiles?.[stat.key] ?? null}
              qualified={player.table_qualified === true && player.impact_support?.[stat.key]?.qualified !== false}
              label={stat.label} cohort={`${player.table_cohort_sample_sizes?.[stat.key] ?? "Unknown"} league players that season`} />
          </span>
        ))}
      </span>
    </button>
  );
}

function ChangeBadge({ change }: { change: RankChange }) {
  if (!change) return null;
  const title = changeText(change) ?? undefined;
  if (change.kind === "new") return <span className="sc-badge sc-change" data-tone="new" title={title}>New</span>;
  if (change.kind === "same") return <span className="sc-badge sc-change" data-tone="same" title={title}><Icon name="minus" size={14} /></span>;
  return <span className="sc-badge sc-change" data-tone={change.kind} title={title}>
    <Icon name={change.kind === "up" ? "up" : "down"} size={14} />{change.by}
  </span>;
}
