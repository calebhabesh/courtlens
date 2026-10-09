"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { TeamLogoStack } from "./team-logo";
import { Icon } from "./ui/icon";
import { PlayerPortrait } from "./player-portrait";
import { formatStatValue, formatIntValue, formatPctValue } from "@/lib/stats-presets";
import type { PlayerResearchItem } from "@/lib/types";

interface StatsDetailDrawerProps {
  player: PlayerResearchItem | null;
  isOpen: boolean;
  onClose: () => void;
  context: {
    season: string;
    phase: string;
    before_date: string;
    window: string;
    release_id?: string;
  };
  onToggleCompare?: (player: PlayerResearchItem) => void;
  isCompared?: boolean;
  onToggleFavorite?: () => void;
  isFavorite?: boolean;
}

export function StatsDetailDrawer({
  player,
  isOpen,
  onClose,
  context,
  onToggleCompare,
  isCompared = false,
  onToggleFavorite,
  isFavorite = false
}: StatsDetailDrawerProps) {
  const drawerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;

    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const panel = drawerRef.current;
    panel?.focus();
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.preventDefault(); onClose(); }
      if (e.key === "Tab" && panel) {
        const controls = [...panel.querySelectorAll<HTMLElement>("a[href], button:not(:disabled), input, select, textarea, [tabindex='0']")];
        const first = controls[0], last = controls.at(-1);
        if (e.shiftKey && (document.activeElement === first || document.activeElement === panel)) {
          e.preventDefault(); last?.focus();
        } else if (!e.shiftKey && (document.activeElement === last || document.activeElement === panel)) {
          e.preventDefault(); first?.focus();
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => { window.removeEventListener("keydown", handleKeyDown); previousFocus?.focus(); };

  }, [isOpen, player?.player_id, onClose]);

  if (!isOpen || !player) return null;

  const m = player.metrics;
  const s = player.sample_sizes;

  const queryParams = new URLSearchParams({
    season: context.season,
    phase: context.phase,
    beforeDate: context.before_date,
    window: context.window
  });
  if (context.release_id) {
    queryParams.set("releaseId", context.release_id);
  }
  const queryString = queryParams.toString();

  return (
    <div
      className="stats-drawer-backdrop"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="player-drawer-title"
    >
      <div className="stats-drawer-panel" ref={drawerRef} tabIndex={-1}>
        {/* Header */}
        <div className="stats-drawer-header">
          <div className="stats-drawer-hero">
            <PlayerPortrait
              playerId={player.player_id}
              name={player.player_name}
              portraitUrl={player.portrait_url}
              size="lg"
            />
            <div className="stats-drawer-title-group">
              <span className="stats-drawer-tag font-mono text-xs">
                ID: {player.player_id}
              </span>
              <h2 id="player-drawer-title" className="stats-drawer-name">
                {player.player_name}
              </h2>
              <div className="stats-drawer-teams">
                <TeamLogoStack teams={player.teams ?? []} />
                {player.teams?.length > 0 ? (
                  player.teams.map((t) => (
                    <span key={t} className="stats-drawer-team-pill">
                      {t}
                    </span>
                  ))
                ) : (
                  <span className="text-muted text-xs">No represented team in this window</span>
                )}
                <span className="stats-drawer-meta-dot">·</span>
                <span className="text-xs text-muted">
                  {player.games_played} GP · {formatStatValue(m.min_per_game, 1)} MPG
                </span>
              </div>
            </div>
          </div>
          <button
            type="button"
            className="stats-drawer-close"
            onClick={onClose}
            aria-label="Close player details sidebar"
          >
            <Icon name="close" />
          </button>
        </div>

        {/* Action Buttons */}
        <div className="stats-drawer-actions">
          <Link
            href={`/players/${player.player_id}?${queryString}`}
            className="button button-primary stats-drawer-action-primary"
          >
            View Full Profile
          </Link>
          <Link
            href={`/compare?playerA=${player.player_id}&${queryString}`}
            className="button"
          >
            Compare Head-to-Head
          </Link>
          {onToggleCompare && (
            <button
              type="button"
              onClick={() => onToggleCompare(player)}
              className={`button ${isCompared ? "button-active" : ""}`}
              title={isCompared ? "Remove from Compare Tray" : "Add to Compare Tray (C)"}
            >
              {isCompared ? <><Icon name="check" size={14} />In Compare Tray</> : <><Icon name="plus" size={14} />Add to Tray</>}
            </button>
          )}
          {onToggleFavorite && (
            <button
              type="button"
              onClick={onToggleFavorite}
              className={`button ${isFavorite ? "button-active text-accent" : ""}`}
              title={isFavorite ? "Remove from Favorites" : "Add to Favorites"}
              aria-label={isFavorite ? "Remove from Favorites" : "Add to Favorites"}
            >
              {isFavorite ? <><Icon name="star" size={14} filled />Favorited</> : <><Icon name="star" size={14} />Favorite</>}
            </button>
          )}
        </div>

        {/* Investigation Shortcuts */}
        <div className="stats-drawer-shortcuts">
          <Link
            href={`/research/trends?playerId=${player.player_id}&${queryString}`}
            className="button button-small"
            title="Analyze workload and performance trends across disjoint windows"
          >
            Trends
          </Link>
          <Link
            href={`/research/distributions?playerId=${player.player_id}&${queryString}`}
            className="button button-small"
            title="View empirical quantiles, dispersion, and contextual splits"
          >
            Distributions
          </Link>
          <Link
            href={`/research/similarity?playerId=${player.player_id}&${queryString}`}
            className="button button-small"
            title="Find statistical twin players across standardized dimensions"
          >
            Peers
          </Link>
        </div>

        {/* Temporal Discipline & Quality Disclaimer */}
        <div className="stats-drawer-disclaimer">
          <strong className="text-accent text-xs">Temporal Discipline Notice:</strong>
          <p className="text-xs text-muted">
            Exclusively derived from games strictly prior to <code>{context.before_date}</code> ({context.season}, {context.phase.replace("_", " ")}).
            Absent box scores are unknown, never zero outcomes.
          </p>
        </div>

        {/* Drawer Body Sections */}
        <div className="stats-drawer-body">
          {player.impact_support && <section className="stats-drawer-section">
            <h3 className="stats-drawer-section-title">CourtLens impact samples</h3>
            <p>Model support differs from the box-score appearance sample. Missing metrics stay unknown.</p>
            <details><summary>Metric-specific support</summary>
              {Object.entries(player.impact_support).map(([key, sample]) => <p key={key}>
                <strong>{key}</strong>: {sample.covered_games ?? sample.games ?? 0} covered games
                {sample.total_games != null && ` / ${sample.total_games} player games`}
                {sample.denominator != null && ` · denominator ${sample.denominator.toFixed(2)}`}
                {sample.off_opportunities != null && ` · offense ${sample.off_opportunities}, defense ${sample.def_opportunities}`}
                {sample.on && sample.off && ` · on/off minutes ${(sample.on.seconds / 60).toFixed(1)} / ${(sample.off.seconds / 60).toFixed(1)}`}
                {` · ${sample.qualified ? "Qualified" : sample.reason || "Below ranking sample"}`}
              </p>)}
            </details>
          </section>}
          {/* Section: Scoring & Volume */}
          <div className="stats-drawer-section">
            <h3 className="stats-drawer-section-title">Scoring &amp; Volume</h3>
            <div className="stats-drawer-grid">
              <div className="stats-card">
                <span className="stats-card-label">Points (Total)</span>
                <span className="stats-card-value">{formatIntValue(m.pts)}</span>
                <span className="stats-card-sub">{s.pts ?? player.games_played} games</span>
              </div>
              <div className="stats-card">
                <span className="stats-card-label">Points / Game</span>
                <span className="stats-card-value font-bold text-accent">
                  {formatStatValue(m.pts_per_game, 1)}
                </span>
                <span className="stats-card-sub">PPG</span>
              </div>
              <div className="stats-card">
                <span className="stats-card-label">Points / 36</span>
                <span className="stats-card-value">{formatStatValue(m.pts_per_36, 1)}</span>
                <span className="stats-card-sub">Per 36 Min</span>
              </div>
              <div className="stats-card">
                <span className="stats-card-label">Total Minutes</span>
                <span className="stats-card-value">{formatIntValue(player.total_minutes)}</span>
                <span className="stats-card-sub">{formatStatValue(m.min_per_game, 1)} MPG</span>
              </div>
            </div>
          </div>

          {/* Section: Shooting Efficiency */}
          <div className="stats-drawer-section">
            <h3 className="stats-drawer-section-title">Shooting &amp; Efficiency</h3>
            <div className="stats-drawer-grid">
              <div className="stats-card">
                <span className="stats-card-label">True Shooting %</span>
                <span className="stats-card-value font-semibold text-positive">
                  {formatPctValue(m.ts_pct)}
                </span>
                <span className="stats-card-sub">PTS / (2*(FGA+0.44*FTA))</span>
              </div>
              <div className="stats-card">
                <span className="stats-card-label">Effective FG %</span>
                <span className="stats-card-value font-semibold">
                  {formatPctValue(m.efg_pct)}
                </span>
                <span className="stats-card-sub">(FGM+0.5*3PM) / FGA</span>
              </div>
              <div className="stats-card">
                <span className="stats-card-label">Free Throw Rate</span>
                <span className="stats-card-value">{formatStatValue(m.ftr, 3)}</span>
                <span className="stats-card-sub">FTA / FGA</span>
              </div>
              <div className="stats-card">
                <span className="stats-card-label">Field Goals</span>
                <span className="stats-card-value">{formatPctValue(m.fg_pct)}</span>
                <span className="stats-card-sub">{formatIntValue(m.fgm)} / {formatIntValue(m.fga)}</span>
              </div>
              <div className="stats-card">
                <span className="stats-card-label">3-Pointers</span>
                <span className="stats-card-value">{formatPctValue(m.fg3_pct)}</span>
                <span className="stats-card-sub">{formatIntValue(m.fg3m)} / {formatIntValue(m.fg3a)}</span>
              </div>
              <div className="stats-card">
                <span className="stats-card-label">Free Throws</span>
                <span className="stats-card-value">{formatPctValue(m.ft_pct)}</span>
                <span className="stats-card-sub">{formatIntValue(m.ftm)} / {formatIntValue(m.fta)}</span>
              </div>
            </div>
          </div>

          {/* Section: Rebounds & Playmaking */}
          <div className="stats-drawer-section">
            <h3 className="stats-drawer-section-title">Rebounding &amp; Playmaking</h3>
            <div className="stats-drawer-grid">
              <div className="stats-card">
                <span className="stats-card-label">Total Rebounds</span>
                <span className="stats-card-value">{formatStatValue(m.reb_per_game, 1)}</span>
                <span className="stats-card-sub">{formatIntValue(m.reb)} total · {formatStatValue(m.reb_per_36, 1)}/36</span>
              </div>
              <div className="stats-card">
                <span className="stats-card-label">Off / Def Rebounds</span>
                <span className="stats-card-value">
                  {formatStatValue(m.oreb_per_game, 1)} / {formatStatValue(m.dreb_per_game, 1)}
                </span>
                <span className="stats-card-sub">{formatIntValue(m.oreb)} O · {formatIntValue(m.dreb)} D</span>
              </div>
              <div className="stats-card">
                <span className="stats-card-label">Assists</span>
                <span className="stats-card-value">{formatStatValue(m.ast_per_game, 1)}</span>
                <span className="stats-card-sub">{formatIntValue(m.ast)} total · {formatStatValue(m.ast_per_36, 1)}/36</span>
              </div>
              <div className="stats-card">
                <span className="stats-card-label">Turnovers</span>
                <span className="stats-card-value">{formatStatValue(m.tov_per_game, 1)}</span>
                <span className="stats-card-sub">{formatIntValue(m.tov)} total · {formatStatValue(m.tov_per_36, 1)}/36</span>
              </div>
            </div>
          </div>

          {/* Section: Defense & Discipline */}
          <div className="stats-drawer-section">
            <h3 className="stats-drawer-section-title">Defense &amp; Activity</h3>
            <div className="stats-drawer-grid">
              <div className="stats-card">
                <span className="stats-card-label">Steals</span>
                <span className="stats-card-value">{formatStatValue(m.stl_per_game, 1)}</span>
                <span className="stats-card-sub">{formatIntValue(m.stl)} total · {formatStatValue(m.stl_per_36, 1)}/36</span>
              </div>
              <div className="stats-card">
                <span className="stats-card-label">Blocks</span>
                <span className="stats-card-value">{formatStatValue(m.blk_per_game, 1)}</span>
                <span className="stats-card-sub">{formatIntValue(m.blk)} total · {formatStatValue(m.blk_per_36, 1)}/36</span>
              </div>
              <div className="stats-card">
                <span className="stats-card-label">Personal Fouls</span>
                <span className="stats-card-value">{formatStatValue(m.pf_per_game, 1)}</span>
                <span className="stats-card-sub">{formatIntValue(m.pf)} total · {formatStatValue(m.pf_per_36, 1)}/36</span>
              </div>
              <div className="stats-card">
                <span className="stats-card-label">Legacy Fantasy</span>
                <span className="stats-card-value">{formatStatValue(m.legacy_fantasy_score_per_game, 1)}</span>
                <span className="stats-card-sub">Baseline scoring model</span>
              </div>
            </div>
          </div>
        </div>

        {/* Drawer Footer */}
        <div className="stats-drawer-footer">
          <span className="text-xs text-muted">
            Press <kbd>Esc</kbd> to dismiss drawer
          </span>
          <button type="button" className="button button-small" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
