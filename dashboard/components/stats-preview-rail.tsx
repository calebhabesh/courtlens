"use client";

import { useEffect, useRef, useState } from "react";
import { Icon } from "./ui/icon";

import { PlayerPortrait } from "./player-portrait";
import { TeamLogoStack } from "./team-logo";
import { DARKO_COLUMNS, formatColumnValue, type ColumnDefinition } from "@/lib/stats-presets";
import { DarkoSourceLink } from "./darko-source-link";
import type { PlayerResearchItem } from "@/lib/types";

type PercentileVars = React.CSSProperties & { "--pct": number };
const percentileVars = (percentile: number): PercentileVars => ({ "--pct": Math.round(percentile) });

/** The table announces the stat column under the pointer or focus (null when it leaves). */
export const STATS_CELL_HOVER = "stats-cell-hover";

export function StatsPreviewRail({ player, columns, season, eligiblePlayers,
  showPercentiles, pinned, collapsed, onTogglePin, onToggleCollapse, onOpenDetails, isFavorite = false, onToggleFavorite }: {
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
  isFavorite?: boolean;
  onToggleFavorite?: () => void;
}) {
  const [highlight, setHighlight] = useState<string | null>(null);
  const metricsRef = useRef<HTMLDListElement>(null);
  useEffect(() => {
    const onHover = (event: Event) => setHighlight((event as CustomEvent<string | null>).detail);
    window.addEventListener(STATS_CELL_HOVER, onHover);
    return () => window.removeEventListener(STATS_CELL_HOVER, onHover);
  }, []);
  useEffect(() => {
    if (!highlight) return;
    metricsRef.current?.querySelector<HTMLElement>(`[data-column="${CSS.escape(highlight)}"]`)?.scrollIntoView({ block: "nearest" });
  }, [highlight]);
  return <aside className={`stats-preview-rail ${collapsed ? "is-collapsed" : ""}`} aria-label="Player preview">
    <div className="stats-preview-heading">
      <button type="button" onClick={onToggleCollapse} className="stats-icon-action"
        aria-label={collapsed ? "Expand player preview" : "Collapse player preview"} aria-expanded={!collapsed}
        title={collapsed ? "Expand player preview" : "Collapse player preview"}>
        {collapsed ? <Icon name="left" size={14} /> : <Icon name="right" size={14} />}
      </button>
      {!collapsed && <><span>Player Preview</span>{player && onToggleFavorite && <button type="button" className="stats-icon-action"
        onClick={onToggleFavorite} aria-pressed={isFavorite}
        aria-label={isFavorite ? `Remove ${player.player_name} from favorites` : `Add ${player.player_name} to favorites`}
        title={isFavorite ? "Remove from favorites" : "Add to favorites"}>
        <Icon name="star" size={14} filled={isFavorite} />
      </button>}{player && <button type="button" className="stats-icon-action"
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
      <dl className="stats-preview-metrics" ref={metricsRef}>
        {columns.map(column => {
          const percentile = player.table_percentiles?.[column.key];
          const qualified = player.table_qualified === true && player.impact_support?.[column.key]?.qualified !== false;
          const ranked = qualified && player.metrics[column.key] != null && percentile != null;
          return <div key={column.key} data-column={column.key}
            className={`stats-preview-metric ${highlight === column.key ? "is-highlighted" : ""}`}>
            <dt title={column.tooltip}>{column.key in DARKO_COLUMNS
              ? <DarkoSourceLink title={column.tooltip}>{column.label}</DarkoSourceLink> : column.label}</dt>
            <dd><strong>{formatColumnValue(column, player)}</strong>{showPercentiles && <span
              className="stats-preview-percentile" style={ranked ? percentileVars(percentile) : undefined}
              title={`League percentile: ${percentile ?? "unknown"} · ${player.table_cohort_sample_sizes?.[column.key] ?? "unknown"} valid players${qualified ? "" : " · small sample, not ranked"}`}>
              {ranked ? percentile.toFixed(0) : "—"}
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
        <span><kbd>A / D</kbd> Scroll table</span><span><kbd>F</kbd> Filters</span><span><kbd>C</kbd> Compare focused row</span>
        <span>Shortcuts work with the table focused.</span>
      </div>
      <Icon name="person" size={20} />
      <p>Hover over a player<span>or focus a row to see their stats</span></p>
    </div>)}
  </aside>;
}
