"use client";
import { Icon } from "./ui/icon";

import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import type { PlayerGameLogItem, PlayerResearchItem } from "@/lib/types";
import { getPlayerGameLog } from "@/lib/workbench-api";
import { useWorkspace } from "@/lib/workspace-context";
import {
  exportSvgAsPng,
  exportSvgFile,
  copyCanonicalQueryUrl
} from "@/lib/image-export";

interface MultiPlayerLinesViewProps {
  playerIds?: string[];
  players?: PlayerResearchItem[];
  context: {
    season: string;
    phase: string;
    before_date: string;
    window: string;
    release_id?: string;
  };
}

export type LineMetricKey = "points" | "minutes" | "ast" | "reb" | "fg3m" | "fga" | "legacy_fantasy_score";

interface MetricOption {
  key: LineMetricKey;
  label: string;
  unit: string;
  accessor: (item: PlayerGameLogItem) => number | null;
}

const LINE_METRIC_OPTIONS: MetricOption[] = [
  {
    key: "points",
    label: "Points",
    unit: "PTS",
    accessor: (g) => g.points
  },
  {
    key: "minutes",
    label: "Minutes",
    unit: "MIN",
    accessor: (g) => g.minutes
  },
  {
    key: "ast",
    label: "Assists",
    unit: "AST",
    accessor: (g) => {
      const v = g.stats?.assists ?? g.stats?.ast;
      return typeof v === "number" ? v : null;
    }
  },
  {
    key: "reb",
    label: "Rebounds",
    unit: "REB",
    accessor: (g) => {
      const v = g.stats?.rebounds ?? g.stats?.reb;
      return typeof v === "number" ? v : null;
    }
  },
  {
    key: "fg3m",
    label: "3-Pointers Made",
    unit: "3PM",
    accessor: (g) => {
      const v = g.stats?.three_pointers_made ?? g.stats?.fg3m;
      return typeof v === "number" ? v : null;
    }
  },
  {
    key: "fga",
    label: "Field Goal Attempts",
    unit: "FGA",
    accessor: (g) => {
      const v = g.stats?.field_goals_attempted ?? g.stats?.fga;
      return typeof v === "number" ? v : null;
    }
  },
  {
    key: "legacy_fantasy_score",
    label: "Legacy Fantasy Score",
    unit: "FP",
    accessor: (g) => g.legacy_fantasy_score
  }
];

// Distinct visual identifiers (color, marker shape, dash style) for up to 8 players
const PLAYER_STYLES = [
  { color: "#ffd166", marker: "circle", dash: "none", symbol: "●" },
  { color: "#4ecdc4", marker: "square", dash: "none", symbol: "■" },
  { color: "#ff6b6b", marker: "triangle", dash: "6 3", symbol: "▲" },
  { color: "#a06cd5", marker: "diamond", dash: "none", symbol: "◆" },
  { color: "#62d2a2", marker: "inverted-triangle", dash: "4 2", symbol: "▼" },
  { color: "#e056fd", marker: "hexagon", dash: "none", symbol: "⬡" },
  { color: "#f0932b", marker: "cross", dash: "8 3 2 3", symbol: "✚" },
  { color: "#70a1ff", marker: "star", dash: "2 2", symbol: "★" }
];

interface PlayerLogSeries {
  playerId: string;
  playerName: string;
  games: PlayerGameLogItem[];
  color: string;
  marker: string;
  dash: string;
  symbol: string;
}

export function MultiPlayerLinesView({
  playerIds: propPlayerIds,
  players,
  context
}: MultiPlayerLinesViewProps) {
  const { compareTray, removeCompare } = useWorkspace();

  // Selected player IDs: priority given to prop, then workspace compare tray
  const effectivePlayerIds = useMemo(() => {
    if (propPlayerIds && propPlayerIds.length > 0) return propPlayerIds.slice(0, 8);
    return compareTray.slice(0, 8);
  }, [propPlayerIds, compareTray]);

  const [selectedMetric, setSelectedMetric] = useState<LineMetricKey>("points");
  const [rollingMode, setRollingMode] = useState<"none" | "5" | "10">("none");
  const [gameLimit, setGameLimit] = useState<number>(20);
  const [seriesList, setSeriesList] = useState<PlayerLogSeries[]>([]);
  const currentFetchKey = useMemo(() => {
    return `${effectivePlayerIds.join(",")}-${context.season}-${context.phase}-${context.before_date}-${gameLimit}`;
  }, [effectivePlayerIds, context, gameLimit]);

  const [loadedKey, setLoadedKey] = useState<string>("");
  const loading = effectivePlayerIds.length > 0 && loadedKey !== currentFetchKey;
  const [error, setError] = useState<string | null>(null);
  const [hoveredPoint, setHoveredPoint] = useState<{
    playerId: string;
    playerName: string;
    gameDate: string;
    opponent: string;
    val: number;
    rollingVal?: number | null;
    x: number;
    y: number;
  } | null>(null);
  const [showDataTable, setShowDataTable] = useState<boolean>(false);
  const [exporting, setExporting] = useState<boolean>(false);
  const [copySuccess, setCopySuccess] = useState<boolean>(false);

  const svgRef = useRef<SVGSVGElement | null>(null);

  const metricDef = useMemo(() => {
    return LINE_METRIC_OPTIONS.find((m) => m.key === selectedMetric) || LINE_METRIC_OPTIONS[0];
  }, [selectedMetric]);

  // Fetch game logs for all players
  useEffect(() => {
    if (effectivePlayerIds.length === 0) {
      return;
    }

    let isMounted = true;

    async function fetchLogs() {
      try {
        const results = await Promise.all(
          effectivePlayerIds.map(async (id, idx) => {
            const style = PLAYER_STYLES[idx % PLAYER_STYLES.length];
            const fallbackPlayer = players?.find((p) => p.player_id === id);
            try {
              const res = await getPlayerGameLog(id, {
                season: context.season,
                phase: context.phase,
                beforeDate: context.before_date,
                releaseId: context.release_id,
                limit: gameLimit
              });
              // Filter to confirmed appearances strictly prior to cutoff
              const appearedGames = (res.games || []).filter(
                (g) => g.appearance === "appeared" && (!context.before_date || g.game_date < context.before_date)
              );
              return {
                playerId: id,
                playerName: res.player?.name || fallbackPlayer?.player_name || `Player ${id}`,
                games: appearedGames,
                color: style.color,
                marker: style.marker,
                dash: style.dash,
                symbol: style.symbol
              };
            } catch {
              return {
                playerId: id,
                playerName: fallbackPlayer?.player_name || `Player ${id}`,
                games: [],
                color: style.color,
                marker: style.marker,
                dash: style.dash,
                symbol: style.symbol
              };
            }
          })
        );

        if (isMounted) {
          setSeriesList(results);
          setLoadedKey(currentFetchKey);
          setError(null);
        }
      } catch (err) {
        if (isMounted) {
          setError(err instanceof Error ? err.message : "Failed to load player game logs");
          setLoadedKey(currentFetchKey);
        }
      }
    }

    fetchLogs();

    return () => {
      isMounted = false;
    };
  }, [effectivePlayerIds, context, gameLimit, players, currentFetchKey]);

  // Calculate rolling statistics for a series
  const computeRollingValues = useCallback(
    (values: (number | null)[], windowSize: number): (number | null)[] => {
      const result: (number | null)[] = [];
      for (let i = 0; i < values.length; i++) {
        // Look at window [max(0, i - windowSize + 1) .. i]
        const start = Math.max(0, i - windowSize + 1);
        const windowSlice = values.slice(start, i + 1).filter((v): v is number => typeof v === "number" && Number.isFinite(v));
        if (windowSlice.length === 0) {
          result.push(null);
        } else {
          const sum = windowSlice.reduce((a, b) => a + b, 0);
          result.push(sum / windowSlice.length);
        }
      }
      return result;
    },
    []
  );

  // Unified chronological game indexes for plotting
  // To align multiple players, we index by relative game index (0 = oldest, N-1 = newest in window)
  const maxGamesCount = useMemo(() => {
    return Math.max(...seriesList.map((s) => s.games.length), 1);
  }, [seriesList]);

  // Extract plottable points for each series
  const plottableSeries = useMemo(() => {
    return seriesList.map((series) => {
      // Reverse so chronological order: index 0 is oldest, index (N-1) is latest
      const chronoGames = [...series.games].reverse();
      const rawValues = chronoGames.map((g) => metricDef.accessor(g));
      const rollingValues =
        rollingMode === "5"
          ? computeRollingValues(rawValues, 5)
          : rollingMode === "10"
          ? computeRollingValues(rawValues, 10)
          : rawValues;

      return {
        ...series,
        chronoGames,
        rawValues,
        rollingValues
      };
    });
  }, [seriesList, metricDef, rollingMode, computeRollingValues]);

  // Calculate global Y domain
  const yDomain = useMemo<[number, number]>(() => {
    let min = 0;
    let max = 10;
    for (const s of plottableSeries) {
      for (const val of s.rollingValues) {
        if (typeof val === "number" && Number.isFinite(val)) {
          if (val > max) max = val;
          if (val < min) min = val;
        }
      }
    }
    const span = max - min || 1;
    return [Math.max(0, min - span * 0.05), max + span * 0.1];
  }, [plottableSeries]);

  // Dimensions
  const width = 860;
  const height = 480;
  const padLeft = 60;
  const padRight = 36;
  const padTop = 36;
  const padBottom = 54;
  const plotWidth = width - padLeft - padRight;
  const plotHeight = height - padTop - padBottom;

  const projectXCoord = (index: number, total: number) => {
    if (total <= 1) return padLeft + plotWidth / 2;
    return padLeft + (index / (total - 1)) * plotWidth;
  };

  const projectYCoord = (val: number) => {
    const [min, max] = yDomain;
    if (max === min) return padTop + plotHeight / 2;
    const fraction = (val - min) / (max - min);
    return height - padBottom - Math.max(0, Math.min(1, fraction)) * plotHeight;
  };

  const renderMarkerSymbol = (
    marker: string,
    x: number,
    y: number,
    color: string,
    size = 5
  ) => {
    switch (marker) {
      case "square":
        return <rect x={x - size} y={y - size} width={size * 2} height={size * 2} fill={color} stroke="#20252e" strokeWidth="1" />;
      case "triangle":
        return <polygon points={`${x},${y - size * 1.3} ${x - size * 1.1},${y + size} ${x + size * 1.1},${y + size}`} fill={color} stroke="#20252e" strokeWidth="1" />;
      case "inverted-triangle":
        return <polygon points={`${x},${y + size * 1.3} ${x - size * 1.1},${y - size} ${x + size * 1.1},${y - size}`} fill={color} stroke="#20252e" strokeWidth="1" />;
      case "diamond":
        return <polygon points={`${x},${y - size * 1.3} ${x + size * 1.1},${y} ${x},${y + size * 1.3} ${x - size * 1.1},${y}`} fill={color} stroke="#20252e" strokeWidth="1" />;
      case "cross":
        return (
          <g stroke={color} strokeWidth="2.5">
            <line x1={x - size} y1={y} x2={x + size} y2={y} />
            <line x1={x} y1={y - size} x2={x} y2={y + size} />
          </g>
        );
      case "circle":
      default:
        return <circle cx={x} cy={y} r={size} fill={color} stroke="#20252e" strokeWidth="1.5" />;
    }
  };

  const handleExportPng = async () => {
    if (!svgRef.current) return;
    try {
      setExporting(true);
      const names = seriesList.map((s) => s.playerName).join(" vs ");
      await exportSvgAsPng(svgRef.current, {
        title: `CourtLens Multi-Player Lines: ${metricDef.label}`,
        subtitle: `${names} · ${rollingMode === "none" ? "Single-Game Actuals" : `${rollingMode}-Game Rolling Avg`}`,
        context,
        evidenceId: context.release_id,
        filename: `courtlens-lines-${metricDef.key}-${context.before_date || "cutoff"}`
      });
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to export PNG image");
    } finally {
      setExporting(false);
    }
  };

  const handleExportSvg = () => {
    if (!svgRef.current) return;
    exportSvgFile(svgRef.current, `courtlens-lines-${metricDef.key}.svg`, {
      title: `CourtLens Multi-Player Lines: ${metricDef.label}`,
      context,
      filename: `courtlens-lines-${metricDef.key}`
    });
  };

  const handleCopyLink = async () => {
    const ok = await copyCanonicalQueryUrl("/compare", {
      season: context.season,
      phase: context.phase,
      beforeDate: context.before_date,
      window: context.window,
      players: effectivePlayerIds.join(","),
      metric: selectedMetric
    });
    if (ok) {
      setCopySuccess(true);
      setTimeout(() => setCopySuccess(false), 2500);
    }
  };

  // If no players are selected
  if (effectivePlayerIds.length === 0) {
    return (
      <div className="panel lines-empty-panel">
        <h3 className="panel-title lines-empty-lead">
          No Players Selected for Comparison Lines
        </h3>
        <p className="text-muted text-sm lines-empty-desc">
          Select up to 8 players from the Stats table or Compare Tray to plot and compare their recent game progression side by side.
        </p>
      </div>
    );
  }

  return (
    <div className="panel multi-player-lines-panel" role="region" aria-label="Multi-Player Lines Progression Explorer">
      {/* Top Header */}
      <div className="panel-header panel-header-wrap">
        <div>
          <h2 className="panel-title lines-panel-title">
            <span>Multi-Player Trend Lines</span>
            <span className="badge font-mono text-xs">
              {seriesList.length} player{seriesList.length === 1 ? "" : "s"}
            </span>
          </h2>
          <p className="text-muted text-xs mt-1">
            Historical game-by-game progression prior to cutoff date ({context.before_date || "season start"}).
          </p>
        </div>

        {/* Action Buttons: Export & Share */}
        <div className="lines-header-actions">
          <button
            type="button"
            onClick={handleExportPng}
            disabled={exporting || loading}
            className="button button-small"
            title="Download context-stamped PNG image with evidence watermark"
          >
            {exporting ? "Rendering…" : <><Icon name="download" />Export PNG</>}
          </button>
          <button
            type="button"
            onClick={handleExportSvg}
            disabled={loading}
            className="button button-small"
            title="Download standalone SVG file"
          >
            SVG
          </button>
          <button
            type="button"
            onClick={handleCopyLink}
            className="button button-small"
            title="Copy local query link to clipboard"
          >
            {copySuccess ? "✓ Copied" : <><Icon name="copy" />Copy local URL</>}
          </button>
        </div>
      </div>

      {/* Toolbar: Metric Selector, Rolling Mode, Game Window */}
      <div className="filter-toolbar lines-filter-toolbar">
        {/* Metric Selector */}
        <div className="filter-group">
          <label htmlFor="lines-metric-select">Metric</label>
          <select
            id="lines-metric-select"
            value={selectedMetric}
            onChange={(e) => setSelectedMetric(e.target.value as LineMetricKey)}
            aria-label="Select metric to plot"
          >
            {LINE_METRIC_OPTIONS.map((opt) => (
              <option key={opt.key} value={opt.key}>
                {opt.label} ({opt.unit})
              </option>
            ))}
          </select>
        </div>

        {/* Rolling Statistic Mode */}
        <div className="filter-group">
          <label htmlFor="lines-rolling-select">Statistic Mode</label>
          <select
            id="lines-rolling-select"
            value={rollingMode}
            onChange={(e) => setRollingMode(e.target.value as "none" | "5" | "10")}
            aria-label="Select rolling average window"
          >
            <option value="none">Single-Game Actuals</option>
            <option value="5">5-Game Rolling Average</option>
            <option value="10">10-Game Rolling Average</option>
          </select>
        </div>

        {/* Game Limit */}
        <div className="filter-group">
          <label htmlFor="lines-limit-select">Window</label>
          <select
            id="lines-limit-select"
            value={gameLimit}
            onChange={(e) => setGameLimit(Number(e.target.value))}
            aria-label="Select game log window"
          >
            <option value={10}>Last 10 Appearances</option>
            <option value={20}>Last 20 Appearances</option>
            <option value={50}>Last 50 Appearances</option>
          </select>
        </div>

        {/* Data Table Toggle */}
        <button
          type="button"
          onClick={() => setShowDataTable((prev) => !prev)}
          className={`control-pill filter-action-pill ${showDataTable ? "active" : ""}`}
          title="Toggle accessible chart data table"
        >
          {showDataTable ? "Hide Table" : "Show Data Table"}
        </button>
      </div>

      {loading && (
        <div className="empty-panel lines-empty-panel">
          <p className="text-muted">Loading player game logs…</p>
        </div>
      )}

      {error && (
        <div className="notice-box lines-notice-warning">
          <strong>Error loading game logs:</strong> {error}
        </div>
      )}

      {/* SVG Chart */}
      {!loading && !error && (
        <div className="lines-svg-container">
          <svg
            ref={svgRef}
            viewBox={`0 0 ${width} ${height}`}
            className="lines-svg"
            role="img"
            aria-label={`Line chart of ${metricDef.label} across recent games`}
          >
            {/* Grid Lines */}
            {[0, 0.25, 0.5, 0.75, 1.0].map((frac, i) => {
              const [min, max] = yDomain;
              const tickVal = min + (max - min) * frac;
              const yPos = projectYCoord(tickVal);
              return (
                <g key={`ygrid-${i}`}>
                  <line
                    x1={padLeft}
                    y1={yPos}
                    x2={width - padRight}
                    y2={yPos}
                    stroke="#2d3542"
                    strokeWidth="1"
                    strokeDasharray="2 2"
                  />
                  <text
                    x={padLeft - 8}
                    y={yPos + 4}
                    fill="#7b8798"
                    fontSize="11"
                    fontFamily="monospace"
                    textAnchor="end"
                  >
                    {tickVal.toFixed(selectedMetric === "minutes" || rollingMode !== "none" ? 1 : 0)}
                  </text>
                </g>
              );
            })}

            {/* X-axis tick indicators */}
            <line
              x1={padLeft}
              y1={height - padBottom}
              x2={width - padRight}
              y2={height - padBottom}
              stroke="var(--color-hairline-strong)"
              strokeWidth="1.5"
            />
            <text
              x={padLeft}
              y={height - padBottom + 16}
              fill="#7b8798"
              fontSize="11"
              fontFamily="monospace"
              textAnchor="start"
            >
              Older games (←)
            </text>
            <text
              x={width - padRight}
              y={height - padBottom + 16}
              fill="#7b8798"
              fontSize="11"
              fontFamily="monospace"
              textAnchor="end"
            >
              Latest games (→)
            </text>

            {/* Polylines and Data Points for each Player Series */}
            {plottableSeries.map((series) => {
              const validPoints: Array<{
                x: number;
                y: number;
                val: number;
                rollingVal: number | null;
                game: PlayerGameLogItem;
              }> = [];

              series.rollingValues.forEach((val, idx) => {
                if (typeof val === "number" && Number.isFinite(val)) {
                  const x = projectXCoord(idx, maxGamesCount);
                  const y = projectYCoord(val);
                  const rawVal = series.rawValues[idx] ?? val;
                  const game = series.chronoGames[idx];
                  if (game) {
                    validPoints.push({ x, y, val: rawVal, rollingVal: rollingMode !== "none" ? val : null, game });
                  }
                }
              });

              if (validPoints.length === 0) return null;

              const pathD = `M ${validPoints.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" L ")}`;

              return (
                <g key={series.playerId} className="player-series-group">
                  {/* Connecting Line */}
                  <path
                    d={pathD}
                    fill="none"
                    stroke={series.color}
                    strokeWidth="2.5"
                    strokeDasharray={series.dash === "none" ? undefined : series.dash}
                    opacity="0.9"
                  />

                  {/* Marker Symbols on each point */}
                  {validPoints.map((pt, ptIdx) => {
                    const isHovered =
                      hoveredPoint?.playerId === series.playerId &&
                      hoveredPoint?.gameDate === pt.game.game_date;

                    return (
                      <g
                        key={`pt-${series.playerId}-${ptIdx}`}
                        tabIndex={0}
                        role="button"
                        aria-label={`${series.playerName} on ${pt.game.game_date} vs ${pt.game.opponent_tricode}: ${pt.val} ${metricDef.unit}`}
                        onMouseEnter={() =>
                          setHoveredPoint({
                            playerId: series.playerId,
                            playerName: series.playerName,
                            gameDate: pt.game.game_date,
                            opponent: pt.game.opponent_tricode,
                            val: pt.val,
                            rollingVal: pt.rollingVal,
                            x: pt.x,
                            y: pt.y
                          })
                        }
                        onMouseLeave={() => setHoveredPoint(null)}
                        className="lines-point-group"
                      >
                        {renderMarkerSymbol(series.marker, pt.x, pt.y, series.color, isHovered ? 7 : 4.5)}
                      </g>
                    );
                  })}
                </g>
              );
            })}

            {/* Axis Titles */}
            <text
              x={padLeft + plotWidth / 2}
              y={height - 12}
              fill="#f1f3f6"
              fontSize="12"
              fontWeight="bold"
              fontFamily="sans-serif"
              textAnchor="middle"
            >
              Appearances Chronology (Strictly prior to {context.before_date || "cutoff"})
            </text>

            <text
              x={-(padTop + plotHeight / 2)}
              y={18}
              transform="rotate(-90)"
              fill="#f1f3f6"
              fontSize="12"
              fontWeight="bold"
              fontFamily="sans-serif"
              textAnchor="middle"
            >
              {metricDef.label} ({metricDef.unit})
            </text>
          </svg>

          {/* Floating Tooltip */}
          {hoveredPoint && (
            <div
              className="lines-tooltip"
              style={{
                "--tooltip-left": `${Math.min(hoveredPoint.x + 12, width - 200)}px`,
                "--tooltip-top": `${Math.max(hoveredPoint.y - 50, 10)}px`
              } as React.CSSProperties}
            >
              <div className="lines-tooltip-title">
                {hoveredPoint.playerName}
              </div>
              <div className="text-xs text-muted lines-tooltip-sub">
                {hoveredPoint.gameDate} · vs {hoveredPoint.opponent}
              </div>
              <div className="lines-tooltip-grid">
                <span className="text-muted">Actual {metricDef.label}:</span>
                <strong className="font-mono">{hoveredPoint.val} {metricDef.unit}</strong>
                {hoveredPoint.rollingVal !== null && hoveredPoint.rollingVal !== undefined && (
                  <>
                    <span className="text-muted">{rollingMode}G Rolling:</span>
                    <strong className="font-mono">{hoveredPoint.rollingVal.toFixed(1)} {metricDef.unit}</strong>
                  </>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Legend with Player Chips, Unique Colors and Marker Symbols */}
      <div className="lines-legend">
        {seriesList.map((series) => (
          <div
            key={series.playerId}
            className="lines-series-card"
            style={{ "--series-color": series.color } as React.CSSProperties}
          >
            <span className="lines-symbol">{series.symbol}</span>
            <span className="lines-player-name">{series.playerName}</span>
            <span className="text-xs font-mono text-muted">({series.games.length}G)</span>
            <button
              type="button"
              onClick={() => removeCompare(series.playerId)}
              className="lines-card-remove"
              title={`Remove ${series.playerName} from comparison`}
              aria-label={`Remove ${series.playerName}`}
            >
              ✕
            </button>
          </div>
        ))}
      </div>

      <p className="snapshot-footnote mt-2">
        <strong>Rolling statistic discipline:</strong> Rolling averages are calculated strictly chronologically across confirmed active appearances prior to {context.before_date || "cutoff date"}. Gaps between games are preserved without zero-fill.
      </p>

      {/* Accessible Chart Data Table (F06) */}
      {showDataTable && (
        <div className="lines-table-container">
          <div className="panel-header">
            <h3 className="panel-title text-sm">
              Multi-Player Game Log Matrix ({metricDef.label} - {metricDef.unit})
            </h3>
          </div>
          <div className="table-wrapper lines-table-wrapper">
            <table className="data-table" aria-label="Tabular game log data for multi-player lines">
              <thead>
                <tr>
                  <th className="th-rank">#</th>
                  {seriesList.map((s) => (
                    <th
                      key={`th-${s.playerId}`}
                      className="lines-th-series"
                      style={{ "--series-color": s.color } as React.CSSProperties}
                    >
                      {s.symbol} {s.playerName}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {Array.from({ length: maxGamesCount }).map((_, gameIdx) => (
                  <tr key={`row-${gameIdx}`}>
                    <td className="font-mono text-muted text-xs">G{gameIdx + 1}</td>
                    {plottableSeries.map((s) => {
                      const game = s.chronoGames[gameIdx];
                      const val = s.rollingValues[gameIdx];
                      if (!game) {
                        return (
                          <td key={`cell-${s.playerId}-${gameIdx}`} className="text-muted text-xs">
                            —
                          </td>
                        );
                      }
                      return (
                        <td key={`cell-${s.playerId}-${gameIdx}`} className="font-mono text-xs">
                          <strong>{typeof val === "number" ? val.toFixed(rollingMode !== "none" ? 1 : 0) : "—"}</strong>
                          <span className="text-muted lines-game-context">
                            ({game.game_date} vs {game.opponent_tricode})
                          </span>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
