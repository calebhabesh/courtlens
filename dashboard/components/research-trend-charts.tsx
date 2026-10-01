"use client";

import { useState } from "react";
import type { PlayerGameLogItem } from "@/lib/types";

interface ResearchTrendChartsProps {
  games: PlayerGameLogItem[];
  playerName: string;
}

export function ResearchTrendCharts({ games, playerName }: ResearchTrendChartsProps) {
  const [showTable, setShowTable] = useState(false);

  // Use chronological order for plotting left-to-right (oldest -> newest)
  const chronological = [...games].reverse();
  const validGames = chronological.filter((g) => g.appearance === "appeared");

  if (validGames.length === 0) {
    return (
      <div className="empty-panel">
        <p className="text-muted">No confirmed active appearances in this window to plot.</p>
      </div>
    );
  }

  // Compute stats for series
  const minutesSeries = validGames.map((g) => g.minutes ?? 0);
  const attemptsSeries = validGames.map((g) => {
    const fga = g.stats?.field_goals_attempted;
    return typeof fga === "number" ? fga : 0;
  });
  const pointsSeries = validGames.map((g) => g.points ?? 0);

  const avgMinutes = (minutesSeries.reduce((a, b) => a + b, 0) / minutesSeries.length).toFixed(1);
  const avgAttempts = (attemptsSeries.reduce((a, b) => a + b, 0) / attemptsSeries.length).toFixed(1);
  const avgPoints = (pointsSeries.reduce((a, b) => a + b, 0) / pointsSeries.length).toFixed(1);

  const renderSmallMultiple = (
    title: string,
    series: number[],
    color: string,
    avg: string,
    unit: string
  ) => {
    const maxVal = Math.max(...series, 1);
    const width = 320;
    const height = 90;
    const padding = 16;
    const chartW = width - padding * 2;
    const chartH = height - padding * 2;

    const points = series.map((val, i) => {
      const x = padding + (series.length > 1 ? (i / (series.length - 1)) * chartW : chartW / 2);
      const y = height - padding - (val / maxVal) * chartH;
      return { x, y, val };
    });

    const pathD = points.length > 0
      ? `M ${points.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" L ")}`
      : "";

    return (
      <div className="trend-card">
        <div className="trend-card-header">
          <span className="trend-card-title">{title}</span>
          <span className="trend-card-avg font-mono">
            Avg: <strong>{avg}</strong> {unit}
          </span>
        </div>

        <svg
          viewBox={`0 0 ${width} ${height}`}
          className="trend-svg"
          aria-label={`${title} trend over ${series.length} games`}
          role="img"
        >
          {/* Subtle baseline */}
          <line
            x1={padding}
            y1={height - padding}
            x2={width - padding}
            y2={height - padding}
            stroke="var(--border)"
            strokeWidth="1"
          />

          {/* Average reference line */}
          {parseFloat(avg) > 0 && (
            <line
              x1={padding}
              y1={height - padding - (parseFloat(avg) / maxVal) * chartH}
              x2={width - padding}
              y2={height - padding - (parseFloat(avg) / maxVal) * chartH}
              stroke="var(--text-muted)"
              strokeDasharray="3 3"
              strokeWidth="1"
            />
          )}

          {/* Observation line (solid, zero smoothing to avoid fabricated points) */}
          <path
            d={pathD}
            fill="none"
            stroke={color}
            strokeWidth="2"
            strokeLinejoin="round"
          />

          {/* Discrete points for actual observations */}
          {points.map((p, idx) => (
            <circle
              key={idx}
              cx={p.x}
              cy={p.y}
              r="3.5"
              fill={color}
              stroke="var(--surface)"
              strokeWidth="1.5"
            >
              <title>{`${validGames[idx].game_date}: ${p.val} ${unit}`}</title>
            </circle>
          ))}
        </svg>

        <div className="trend-card-footer">
          <span className="text-xs text-muted font-mono">{validGames[0].game_date}</span>
          <span className="text-xs text-muted font-mono">
            {validGames[validGames.length - 1].game_date}
          </span>
        </div>
      </div>
    );
  };

  return (
    <div className="research-trend-section">
      <div className="trend-section-header">
        <div>
          <h3 className="section-title">Production Trajectory</h3>
          <p className="section-note">
            Empirical observations across {validGames.length} appeared games. Dashed line denotes sample mean; no synthetic smoothing applied.
          </p>
        </div>
        <button
          type="button"
          className="button button-small"
          onClick={() => setShowTable(!showTable)}
          aria-expanded={showTable}
        >
          {showTable ? "Hide Data Table" : "View Data Table"}
        </button>
      </div>

      <div className="trend-cards-grid">
        {renderSmallMultiple("Minutes", minutesSeries, "var(--series-secondary)", avgMinutes, "min")}
        {renderSmallMultiple("FG Attempts", attemptsSeries, "var(--warning)", avgAttempts, "fga")}
        {renderSmallMultiple("Points", pointsSeries, "var(--accent)", avgPoints, "pts")}
      </div>

      <p className="trend-narrative">
        <strong>Interpretation:</strong> Over the last {validGames.length} appearances for {playerName}, scoring peaked at {Math.max(...pointsSeries)} points ({validGames[pointsSeries.indexOf(Math.max(...pointsSeries))].game_date}) while averaging {avgMinutes} minutes and {avgAttempts} field goal attempts.
      </p>

      {showTable && (
        <div className="trend-data-table-wrapper">
          <table className="data-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Team</th>
                <th>Opponent</th>
                <th className="num">Minutes</th>
                <th className="num">FGA</th>
                <th className="num">Points</th>
              </tr>
            </thead>
            <tbody>
              {validGames.map((g) => (
                <tr key={g.game_id}>
                  <td>{g.game_date}</td>
                  <td>{g.team_tricode}</td>
                  <td>{g.opponent_tricode}</td>
                  <td className="num font-mono">{g.minutes?.toFixed(1) ?? "—"}</td>
                  <td className="num font-mono">{g.stats?.field_goals_attempted ?? "—"}</td>
                  <td className="num font-mono font-semibold">{g.points ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
