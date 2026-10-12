"use client";

import { Icon } from "./ui/icon";

import { PlayerPortrait } from "./player-portrait";
import { TeamLogoStack } from "./team-logo";
import { formatColumnValue, type ColumnDefinition } from "@/lib/stats-presets";
import type { PlayerResearchItem } from "@/lib/types";

export function StatsPreviewRail({ player, columns, season, eligiblePlayers,
  showPercentiles, pinned, collapsed, onTogglePin, onToggleCollapse, onOpenDetails }: {
  player: PlayerResearchItem | null;
  columns: ColumnDefinition[];
  season: string;
  eligiblePlayers: number;
  goodDirections?: Record<string, string | null>;
  showPercentiles: boolean;
  pinned: boolean;
  collapsed: boolean;
  onTogglePin: () => void;
  onToggleCollapse: () => void;
  onOpenDetails: (player: PlayerResearchItem) => void;
}) {
  return <aside className={`stats-preview-rail ${collapsed ? "is-collapsed" : ""}`} aria-label="Player preview">
    <div className="stats-preview-heading">
      <button type="button" onClick={onToggleCollapse} className="stats-icon-action"
        aria-label={collapsed ? "Expand player preview" : "Collapse player preview"} aria-expanded={!collapsed}
        title={collapsed ? "Expand player preview" : "Collapse player preview"}>
        {collapsed ? <Icon name="left" size={14} /> : <Icon name="right" size={14} />}
      </button>
      {!collapsed && <><span>Player preview</span>{player && <button type="button" className="stats-icon-action"
        onClick={onTogglePin} aria-pressed={pinned} aria-label={pinned ? "Unpin player preview" : "Pin player preview"}
        title={pinned ? "Unpin to resume hover previews" : "Keep this player in the preview"}>
        {pinned ? <Icon name="unpin" size={14} /> : <Icon name="pin" size={14} />}
      </button>}</>}
    </div>
    {!collapsed && (player ? <>
      <div className="stats-preview-identity">
        <PlayerPortrait key={player.player_id} playerId={player.player_id} name={player.player_name}
          portraitUrl={player.portrait_url} size="md" />
        <div><h2>{player.player_name}</h2><span className="stats-preview-subtitle">
          <TeamLogoStack teams={player.teams ?? []} decorative />
          {player.teams?.join(" / ") || "Team unknown"} · {season}
        </span></div>
      </div>
      <dl className="stats-preview-metrics">
        {columns.map(column => {
          const percentile = player.table_percentiles?.[column.key];
          const qualified = player.table_qualified === true && player.impact_support?.[column.key]?.qualified !== false;
          return <div key={column.key} className="stats-preview-metric">
            <dt title={column.tooltip}>{column.label}</dt>
            <dd><strong>{formatColumnValue(column, player)}</strong>{showPercentiles && <span
              className="stats-preview-percentile"
              title={`League percentile: ${percentile ?? "unknown"} · ${player.table_cohort_sample_sizes?.[column.key] ?? "unknown"} valid players · 500+ season minutes`}>
              {player.metrics[column.key] == null ? "Unknown" : !qualified ? `${percentile ?? "—"} pct · small` : percentile == null ? "Rank unknown" : `${percentile} pct`}
            </span>}</dd>
          </div>;
        })}
      </dl>
      <div className="stats-preview-footer">
        <span>League reference · 500+ season minutes · {eligiblePlayers} players in view{player.table_qualified === false ? " · Small sample" : ""}</span>
        <button type="button" className="button button-small" onClick={() => onOpenDetails(player)}>
          Full player details
        </button>
      </div>
    </> : <div className="stats-preview-empty">
      <div className="stats-preview-shortcuts"><strong>Quick hotkeys</strong>
        <span><kbd>T</kbd> Expand table</span><span><kbd>W / E</kbd> Row density</span>
        <span><kbd>A / D</kbd> Scroll table</span><span><kbd>C</kbd> Compare focused row</span>
        <span>Shortcuts work with the table focused.</span>
      </div>
      <Icon name="person" size={20} />
      <p>Hover over a player<span>or focus a row to see their stats</span></p>
    </div>)}
  </aside>;
}
