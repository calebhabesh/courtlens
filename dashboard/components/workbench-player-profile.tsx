"use client";

import Link from "next/link";
import { useState } from "react";
import { PlayerPortrait } from "./player-portrait";
import { ResearchTrendCharts } from "./research-trend-charts";
import { LineageDrawer } from "./lineage-drawer";
import type { PlayerGameLogItem, PlayerProfile } from "@/lib/types";

interface WorkbenchPlayerProfileProps {
  profile: PlayerProfile;
  games: PlayerGameLogItem[];
}

export function WorkbenchPlayerProfile({ profile, games }: WorkbenchPlayerProfileProps) {
  const [selectedFact, setSelectedFact] = useState<string | null>(null);

  const { player, context, summaries, stints, latest_team, last_observed_date, forecast_status } =
    profile;

  const seasonSummary = summaries.season;
  const last10Summary = summaries.last_10;
  const last5Summary = summaries.last_5;

  return (
    <div className="player-detail-container">
      {/* Identity Card */}
      <div className="player-identity-card">
        <PlayerPortrait
          playerId={player.id}
          name={player.name}
          portraitUrl={player.portrait_url}
          size="lg"
        />
        <div className="player-identity-info">
          <span className="text-xs text-accent font-mono uppercase">
            NBA ID: {player.id} · {context.season} {context.phase.replace("_", " ")}
          </span>
          <h1 className="player-identity-name">{player.name}</h1>
          <div className="player-identity-badges">
            {latest_team && (
              <span className="badge badge-accent">
                {latest_team.tricode} · {latest_team.name}
              </span>
            )}
            {last_observed_date && (
              <span className="badge">
                Last appearance: {last_observed_date}
              </span>
            )}
            <span className="badge">
              Window: {context.window}
            </span>
          </div>
        </div>

        <div style={{ marginLeft: "auto", display: "flex", gap: "0.5rem" }}>
          <Link
            href={`/compare?playerA=${player.id}&season=${context.season}&phase=${context.phase}&beforeDate=${context.before_date}`}
            className="button button-small"
          >
            Compare with peer →
          </Link>
        </div>
      </div>

      {/* Multi-Team Stints (e.g. Pascal Siakam TOR + IND) */}
      {stints && stints.length > 0 && (
        <div className="panel">
          <div className="panel-header">
            <div>
              <h2 className="panel-title">Participation Stints</h2>
              <p className="text-muted text-xs" style={{ margin: "0.2rem 0 0" }}>
                Observed participation per team stint for {context.season}. Traded players have explicit team affiliations.
              </p>
            </div>
          </div>
          <div className="table-wrapper">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Team</th>
                  <th className="num">Games</th>
                  <th className="num">Minutes</th>
                  <th className="num">PPG</th>
                  <th className="num">RPG</th>
                  <th className="num">APG</th>
                  <th className="num">FG%</th>
                  <th className="num">3P%</th>
                  <th className="num">TS%</th>
                </tr>
              </thead>
              <tbody>
                {stints.map((stint) => (
                  <tr key={stint.team_id}>
                    <td>
                      <strong>{stint.team_tricode}</strong> ({stint.team_name})
                    </td>
                    <td className="num font-mono">{stint.games_played}</td>
                    <td className="num font-mono">{stint.metrics.min?.toFixed(0) ?? "—"}</td>
                    <td className="num font-mono font-semibold">{stint.metrics.pts_per_game?.toFixed(1) ?? "—"}</td>
                    <td className="num font-mono">{stint.metrics.reb_total_per_game?.toFixed(1) ?? "—"}</td>
                    <td className="num font-mono">{stint.metrics.ast_per_game?.toFixed(1) ?? "—"}</td>
                    <td className="num font-mono">
                      {stint.metrics.fg_pct !== null ? `${(stint.metrics.fg_pct * 100).toFixed(1)}%` : "—"}
                    </td>
                    <td className="num font-mono">
                      {stint.metrics.fg3_pct !== null ? `${(stint.metrics.fg3_pct * 100).toFixed(1)}%` : "—"}
                    </td>
                    <td className="num font-mono">
                      {stint.metrics.ts_pct !== null ? `${(stint.metrics.ts_pct * 100).toFixed(1)}%` : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Production & Role Summary Grid */}
      <div className="grid-3" style={{ marginBottom: "1.25rem" }}>
        <div className="stat-card">
          <span className="stat-label">Season Production</span>
          <span className="stat-value font-mono">
            {seasonSummary?.pts_per_game?.toFixed(1) ?? "—"} <span className="text-sm font-normal text-muted">PPG</span>
          </span>
          <span className="stat-subtext">
            {seasonSummary?.gp ?? 0} GP · {seasonSummary?.min_per_game?.toFixed(1) ?? "—"} MPG · {seasonSummary?.reb_total_per_game?.toFixed(1) ?? "—"} RPG · {seasonSummary?.ast_per_game?.toFixed(1) ?? "—"} APG
          </span>
        </div>

        <div className="stat-card">
          <span className="stat-label">Last 10 Games</span>
          <span className="stat-value font-mono">
            {last10Summary?.pts_per_game?.toFixed(1) ?? "—"} <span className="text-sm font-normal text-muted">PPG</span>
          </span>
          <span className="stat-subtext">
            {last10Summary?.gp ?? 0} GP · {last10Summary?.min_per_game?.toFixed(1) ?? "—"} MPG · {last10Summary?.reb_total_per_game?.toFixed(1) ?? "—"} RPG · {last10Summary?.ast_per_game?.toFixed(1) ?? "—"} APG
          </span>
        </div>

        <div className="stat-card">
          <span className="stat-label">Last 5 Games</span>
          <span className="stat-value font-mono">
            {last5Summary?.pts_per_game?.toFixed(1) ?? "—"} <span className="text-sm font-normal text-muted">PPG</span>
          </span>
          <span className="stat-subtext">
            {last5Summary?.gp ?? 0} GP · {last5Summary?.min_per_game?.toFixed(1) ?? "—"} MPG · {last5Summary?.reb_total_per_game?.toFixed(1) ?? "—"} RPG · {last5Summary?.ast_per_game?.toFixed(1) ?? "—"} APG
          </span>
        </div>
      </div>

      {/* Small-Multiple Trend Charts (Solid lines, no fabricated smoothing) */}
      <ResearchTrendCharts games={games} playerName={player.name} />

      {/* Reverse-Chronological Game Log */}
      <div className="panel">
        <div className="panel-header">
          <div>
            <h2 className="panel-title">Prior Appearance Game Log</h2>
            <p className="text-muted text-xs" style={{ margin: "0.2rem 0 0" }}>
              Strictly prior to {context.before_date}. Click Lineage to inspect contributing raw observations and SHA-256 provenance.
            </p>
          </div>
          <span className="badge font-mono">{games.length} games</span>
        </div>

        <div className="table-wrapper">
          <table className="data-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Team</th>
                <th>Opponent</th>
                <th>Status</th>
                <th className="num">MIN</th>
                <th className="num">PTS</th>
                <th className="num">REB</th>
                <th className="num">AST</th>
                <th className="num">STL</th>
                <th className="num">BLK</th>
                <th className="num">FGM/A</th>
                <th className="num">3PM/A</th>
                <th className="num">FTM/A</th>
                <th className="num">Fantasy</th>
                <th style={{ textAlign: "right" }}>Provenance</th>
              </tr>
            </thead>
            <tbody>
              {games.map((g) => (
                <tr key={g.game_id}>
                  <td className="font-mono">{g.game_date}</td>
                  <td><strong>{g.team_tricode}</strong></td>
                  <td>{g.side === "home" ? "vs" : "@"} {g.opponent_tricode}</td>
                  <td>
                    <span className={`badge ${g.appearance === "appeared" ? "badge-positive" : ""}`}>
                      {g.appearance}
                    </span>
                  </td>
                  <td className="num font-mono">{g.minutes?.toFixed(1) ?? "—"}</td>
                  <td className="num font-mono font-bold">{g.points ?? "—"}</td>
                  <td className="num font-mono">{g.stats?.rebounds_total ?? "—"}</td>
                  <td className="num font-mono">{g.stats?.assists ?? "—"}</td>
                  <td className="num font-mono">{g.stats?.steals ?? "—"}</td>
                  <td className="num font-mono">{g.stats?.blocks ?? "—"}</td>
                  <td className="num font-mono text-xs">
                    {g.stats?.field_goals_made ?? 0}/{g.stats?.field_goals_attempted ?? 0}
                  </td>
                  <td className="num font-mono text-xs">
                    {g.stats?.three_pointers_made ?? 0}/{g.stats?.three_pointers_attempted ?? 0}
                  </td>
                  <td className="num font-mono text-xs">
                    {g.stats?.free_throws_made ?? 0}/{g.stats?.free_throws_attempted ?? 0}
                  </td>
                  <td className="num font-mono">{g.legacy_fantasy_score?.toFixed(1) ?? "—"}</td>
                  <td style={{ textAlign: "right" }}>
                    <button
                      type="button"
                      className="button button-small"
                      onClick={() => setSelectedFact(g.game_id)}
                      title="Inspect raw cryptographic lineage"
                    >
                      Lineage
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Forecast Status Card */}
      <div className="panel" style={{ borderLeft: "3px solid var(--series-secondary)" }}>
        <div className="panel-header">
          <div>
            <h2 className="panel-title">Prospective Forecast Status</h2>
            <p className="text-muted text-xs" style={{ margin: "0.2rem 0 0" }}>
              Next scheduled game points estimation under active policy conditional on appearance.
            </p>
          </div>
          <span className={`badge font-mono ${forecast_status.status === "forecast_issued" ? "badge-positive" : "badge-accent"}`}>
            {forecast_status.status}
          </span>
        </div>

        {forecast_status.status === "forecast_issued" && forecast_status.point_estimate !== undefined ? (
          <div>
            <div style={{ display: "flex", alignItems: "baseline", gap: "1rem", margin: "0.75rem 0" }}>
              <div>
                <span className="text-xs text-muted uppercase font-mono">Point Estimate</span>
                <div className="font-mono text-2xl font-bold text-accent">
                  {forecast_status.point_estimate.toFixed(1)} <span className="text-sm font-normal text-muted">PTS</span>
                </div>
              </div>
              <div>
                <span className="text-xs text-muted uppercase font-mono">80% Empirical Interval</span>
                <div className="font-mono text-lg font-semibold">
                  [{forecast_status.interval_lower?.toFixed(1)}, {forecast_status.interval_upper?.toFixed(1)}] <span className="text-xs font-normal text-muted">PTS</span>
                </div>
              </div>
              {forecast_status.target_opponent && (
                <div>
                  <span className="text-xs text-muted uppercase font-mono">Target Game</span>
                  <div className="font-mono text-sm">
                    {forecast_status.target_game_date} vs {forecast_status.target_opponent}
                  </div>
                </div>
              )}
            </div>
            <p className="text-sm text-muted">
              {forecast_status.message}
            </p>
          </div>
        ) : (
          <p className="text-sm text-muted">
            {forecast_status.message}
          </p>
        )}

        <p className="text-xs text-muted" style={{ marginTop: "0.5rem" }}>
          In accordance with CourtLoad principles, empirical prediction intervals are conditional on player appearance; an absent box score row is unknown, not an injury confirmation.
        </p>
      </div>

      {/* Lineage Modal Drawer */}
      {selectedFact && (
        <LineageDrawer
          factType="player_game"
          factId={selectedFact}
          releaseId={context.release_id}
          onClose={() => setSelectedFact(null)}
        />
      )}
    </div>
  );
}
