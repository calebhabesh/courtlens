"use client";

import React, { useState } from "react";
import { formatDate } from "@/lib/format-date";
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
  const minutesSeries = validGames.map((g) => g.minutes ?? null);
  const attemptsSeries = validGames.map((g) => {
    const fga = g.stats?.field_goals_attempted;
    return typeof fga === "number" ? fga : null;
  });
  const pointsSeries = validGames.map((g) => g.points ?? null);

  const average = (series: (number | null)[]) => {
    const known = series.filter((v): v is number => v !== null);
    return known.length ? (known.reduce((a, b) => a + b, 0) / known.length).toFixed(1) : "—";
  };
  const avgMinutes = average(minutesSeries), avgAttempts = average(attemptsSeries), avgPoints = average(pointsSeries);

  const renderSmallMultiple = (
    title: string,
    series: (number | null)[],
    color: string,
    avg: string,
    unit: string
  ) => {
    const maxVal = Math.max(...series.filter((v): v is number => v !== null), 1);
    const width = 320;
    const height = 90;
    const padding = 16;
    const chartW = width - padding * 2;
    const chartH = height - padding * 2;

    const points = series.map((val, i) => {
      const x = padding + (series.length > 1 ? (i / (series.length - 1)) * chartW : chartW / 2);
      const y = val === null ? null : height - padding - (val / maxVal) * chartH;
      return { x, y, val };
    });

    const pathD = points.map((p, i) => p.y === null ? "" : `${i === 0 || points[i - 1].y === null ? "M" : "L"} ${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");

    return (
      <div className="trend-card">
        <div className="trend-card-header">
          <span className="trend-card-title">{title}</span>
          <span className="trend-card-avg font-mono">
            Avg: <strong>{avg}</strong> {unit} · {series.filter(v => v !== null).length} known
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
            stroke="var(--color-hairline-strong)"
            strokeWidth="1"
          />

          <text x={padding} y="12" fill="var(--color-text-secondary)" fontSize="12">{maxVal} {unit}</text>
          <text x={padding} y={height - 2} fill="var(--color-text-secondary)" fontSize="12">0</text>
          {/* Average reference line */}
          {parseFloat(avg) > 0 && (
            <line
              x1={padding}
              y1={height - padding - (parseFloat(avg) / maxVal) * chartH}
              x2={width - padding}
              y2={height - padding - (parseFloat(avg) / maxVal) * chartH}
              stroke="var(--color-text-secondary)"
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
          {points.map((p, idx) => p.y !== null && (
            <circle
              key={idx}
              cx={p.x}
              cy={p.y}
              r="3.5"
              fill={color}
              stroke="var(--color-surface-1)"
              strokeWidth="1.5"
            >
              <title>{`${formatDate(validGames[idx].game_date)}: ${p.val} ${unit}`}</title>
            </circle>
          ))}
        </svg>

        <div className="trend-card-footer">
          <span className="text-xs text-muted font-mono">{formatDate(validGames[0].game_date)}</span>
          <span className="text-xs text-muted font-mono">
            {formatDate(validGames[validGames.length - 1].game_date)}
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
            Source: CourtLens admitted player box scores · {validGames.length} appeared games. Color = labeled metric; dashed = mean of known values. Gaps stay unknown.
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
        {renderSmallMultiple("Minutes", minutesSeries, "var(--color-info)", avgMinutes, "min")}
        {renderSmallMultiple("FG Attempts", attemptsSeries, "var(--color-accent)", avgAttempts, "fga")}
        {renderSmallMultiple("Points", pointsSeries, "var(--color-accent)", avgPoints, "pts")}
      </div>

      <p className="trend-narrative">{playerName} · average {avgPoints} points, {avgMinutes} minutes and {avgAttempts} attempts over known observations. These are past games, not a forecast.</p>

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
                  <td>{formatDate(g.game_date)}</td>
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
