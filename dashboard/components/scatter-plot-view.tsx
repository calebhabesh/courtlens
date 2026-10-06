"use client";
import { Icon } from "./ui/icon";

import { useState, useMemo, useRef, useCallback } from "react";
import type { PlayerResearchItem } from "@/lib/types";
import { ALL_CATALOG_METRICS } from "@/lib/stats-presets";
import { useWorkspace } from "@/lib/workspace-context";
import {
  buildScatterDataset,
  projectX,
  projectY,
  type ScatterPoint
} from "@/lib/scatter-plot-math";
import {
  exportSvgAsPng,
  exportSvgFile,
  copyCanonicalQueryUrl
} from "@/lib/image-export";

interface ScatterPlotViewProps {
  items: PlayerResearchItem[];
  context: {
    season: string;
    phase: string;
    before_date: string;
    window: string;
    release_id?: string;
  };
  onSelectPlayer?: (player: PlayerResearchItem) => void;
  initialXMetric?: string;
  initialYMetric?: string;
}

export function ScatterPlotView({
  items,
  context,
  onSelectPlayer,
  initialXMetric = "usg_pct",
  initialYMetric = "ts_pct"
}: ScatterPlotViewProps) {
  const { compareTray, toggleCompare, favorites } = useWorkspace();

  const [xMetricKey, setXMetricKey] = useState<string>(initialXMetric);
  const [yMetricKey, setYMetricKey] = useState<string>(initialYMetric);
  const [hoveredPoint, setHoveredPoint] = useState<ScatterPoint | null>(null);
  const [focusedPoint, setFocusedPoint] = useState<ScatterPoint | null>(null);
  const [showDataTable, setShowDataTable] = useState<boolean>(false);
  const [referenceType, setReferenceType] = useState<"median" | "mean" | "none">("median");
  const [showOutlierLabels, setShowOutlierLabels] = useState<boolean>(true);
  const [exporting, setExporting] = useState<boolean>(false);
  const [copySuccess, setCopySuccess] = useState<boolean>(false);

  const svgRef = useRef<SVGSVGElement | null>(null);

  // Get metric definitions
  const xDef = ALL_CATALOG_METRICS[xMetricKey] || {
    key: xMetricKey,
    label: xMetricKey.toUpperCase(),
    group: "Metric",
    num: true,
    sortMetric: xMetricKey
  };
  const yDef = ALL_CATALOG_METRICS[yMetricKey] || {
    key: yMetricKey,
    label: yMetricKey.toUpperCase(),
    group: "Metric",
    num: true,
    sortMetric: yMetricKey
  };

  // Grouped metrics for select dropdowns
  const groupedMetrics = useMemo(() => {
    const groups: Record<string, Array<{ key: string; label: string; tooltip?: string }>> = {};
    for (const [key, def] of Object.entries(ALL_CATALOG_METRICS)) {
      if (def.group === "Unavailable") continue; // Exclude explicit gated/unavailable metrics from scatter axes
      if (!groups[def.group]) groups[def.group] = [];
      groups[def.group].push({ key, label: def.label, tooltip: def.tooltip });
    }
    return groups;
  }, []);

  // Compute dataset
  const dataset = useMemo(() => {
    return buildScatterDataset(items, xMetricKey, yMetricKey);
  }, [items, xMetricKey, yMetricKey]);

  // Dimensions for SVG
  const width = 860;
  const height = 520;
  const padLeft = 68;
  const padRight = 36;
  const padTop = 36;
  const padBottom = 54;

  const { points, omittedCount, totalCount, xStats, yStats, xDomain, yDomain } = dataset;

  // Reference lines coordinates
  const refXVal = referenceType === "median" ? xStats.median : xStats.mean;
  const refYVal = referenceType === "median" ? yStats.median : yStats.mean;

  const refXCoord = projectX(refXVal, xDomain, width, padLeft, padRight);
  const refYCoord = projectY(refYVal, yDomain, height, padTop, padBottom);

  // Format tick labels
  const formatVal = useCallback((val: number, def: typeof xDef) => {
    if (def.format) return def.format(val);
    return val.toFixed(1);
  }, []);

  // Generate 5 grid ticks for X and Y
  const xTicks = useMemo(() => {
    const ticks: number[] = [];
    const [min, max] = xDomain;
    const step = (max - min) / 4;
    for (let i = 0; i <= 4; i++) {
      ticks.push(min + step * i);
    }
    return ticks;
  }, [xDomain]);

  const yTicks = useMemo(() => {
    const ticks: number[] = [];
    const [min, max] = yDomain;
    const step = (max - min) / 4;
    for (let i = 0; i <= 4; i++) {
      ticks.push(min + step * i);
    }
    return ticks;
  }, [yDomain]);

  const handleExportPng = async () => {
    if (!svgRef.current) return;
    try {
      setExporting(true);
      await exportSvgAsPng(svgRef.current, {
        title: `CourtLoad Two-Axis Scatter: ${xDef.label} vs ${yDef.label}`,
        subtitle: `${points.length} players analyzed · ${referenceType.toUpperCase()} reference lines`,
        context,
        evidenceId: context.release_id,
        filename: `courtload-scatter-${xMetricKey}-vs-${yMetricKey}-${context.before_date || "cutoff"}`
      });
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to export PNG image");
    } finally {
      setExporting(false);
    }
  };

  const handleExportSvg = () => {
    if (!svgRef.current) return;
    exportSvgFile(svgRef.current, `courtload-scatter-${xMetricKey}-vs-${yMetricKey}.svg`, {
      title: `CourtLoad Scatter: ${xDef.label} vs ${yDef.label}`,
      context,
      filename: `courtload-scatter-${xMetricKey}-vs-${yMetricKey}`
    });
  };

  const handleCopyLink = async () => {
    const ok = await copyCanonicalQueryUrl("/stats", {
      season: context.season,
      phase: context.phase,
      beforeDate: context.before_date,
      window: context.window,
      xMetric: xMetricKey,
      yMetric: yMetricKey
    });
    if (ok) {
      setCopySuccess(true);
      setTimeout(() => setCopySuccess(false), 2500);
    }
  };

  const activePoint = hoveredPoint || focusedPoint;

  return (
    <div className="panel scatter-plot-panel" role="region" aria-label="Two-Axis Scatter Plot Explorer">
      {/* Top Header & Metric Selectors */}
      <div className="panel-header" style={{ flexWrap: "wrap", gap: "1rem" }}>
        <div>
          <h2 className="panel-title" style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <span>Two-Axis Scatter Plot</span>
            <span className="badge font-mono" style={{ fontSize: "0.75rem" }}>
              {points.length} charted
            </span>
          </h2>
          <p className="text-muted text-xs" style={{ margin: "0.2rem 0 0" }}>
            Visual correlation and outlier identification under strict temporal cutoff ({context.before_date || "season start"}).
          </p>
        </div>

        {/* Action Buttons: Export & Share */}
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
          <button
            type="button"
            onClick={handleExportPng}
            disabled={exporting}
            className="button button-small"
            title="Download context-stamped PNG image with evidence watermark"
          >
            {exporting ? "Rendering…" : <><Icon name="download" />Export PNG</>}
          </button>
          <button
            type="button"
            onClick={handleExportSvg}
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

      {/* Axis Selection Toolbar */}
      <div className="filter-toolbar" style={{ margin: "0.75rem 0", background: "var(--surface)", padding: "0.6rem 0.8rem", borderRadius: "6px" }}>
        {/* X-Axis Selector */}
        <div className="filter-group">
          <label htmlFor="scatter-x-select">X-Axis Metric</label>
          <select
            id="scatter-x-select"
            value={xMetricKey}
            onChange={(e) => setXMetricKey(e.target.value)}
            aria-label="Select X-axis metric"
          >
            {Object.entries(groupedMetrics).map(([group, metrics]) => (
              <optgroup key={group} label={group}>
                {metrics.map((m) => (
                  <option key={`x-${m.key}`} value={m.key}>
                    {m.label} ({group})
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </div>

        {/* Y-Axis Selector */}
        <div className="filter-group">
          <label htmlFor="scatter-y-select">Y-Axis Metric</label>
          <select
            id="scatter-y-select"
            value={yMetricKey}
            onChange={(e) => setYMetricKey(e.target.value)}
            aria-label="Select Y-axis metric"
          >
            {Object.entries(groupedMetrics).map(([group, metrics]) => (
              <optgroup key={group} label={group}>
                {metrics.map((m) => (
                  <option key={`y-${m.key}`} value={m.key}>
                    {m.label} ({group})
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </div>

        {/* Reference Lines Toggle */}
        <div className="filter-group">
          <label htmlFor="scatter-ref-select">Reference Lines</label>
          <select
            id="scatter-ref-select"
            value={referenceType}
            onChange={(e) => setReferenceType(e.target.value as "median" | "mean" | "none")}
            aria-label="Select reference lines type"
          >
            <option value="median">Cohort Median</option>
            <option value="mean">Cohort Mean</option>
            <option value="none">Off</option>
          </select>
        </div>

        {/* Outlier Labels Toggle */}
        <button
          type="button"
          onClick={() => setShowOutlierLabels((prev) => !prev)}
          className={`control-pill ${showOutlierLabels ? "active" : ""}`}
          style={{ alignSelf: "flex-end", minHeight: "40px" }}
          title="Toggle visible text labels on statistical outliers"
        >
          Labels: {showOutlierLabels ? "On" : "Off"}
        </button>

        {/* Data Table Toggle */}
        <button
          type="button"
          onClick={() => setShowDataTable((prev) => !prev)}
          className={`control-pill ${showDataTable ? "active" : ""}`}
          style={{ alignSelf: "flex-end", minHeight: "40px" }}
          title="Toggle accessible chart data table below"
        >
          {showDataTable ? "Hide Table" : "Show Data Table"}
        </button>
      </div>

      {/* Null/Missing Values Disclosure Banner */}
      {omittedCount > 0 && (
        <div className="notice-box text-xs" style={{ marginBottom: "0.75rem", padding: "0.4rem 0.75rem" }}>
          <strong>Paired observation rule:</strong> {omittedCount} of {totalCount} players omitted due to missing or unrecorded metric data for <em>{xDef.label}</em> or <em>{yDef.label}</em>.
        </div>
      )}

      {/* SVG Chart Container */}
      <div className="scatter-svg-container" style={{ position: "relative", width: "100%", overflowX: "auto" }}>
        <svg
          ref={svgRef}
          viewBox={`0 0 ${width} ${height}`}
          style={{
            display: "block",
            width: "100%",
            maxWidth: "100%",
            height: "auto",
            background: "#20252e",
            borderRadius: "6px",
            border: "1px solid var(--border)"
          }}
          role="img"
          aria-label={`Scatter plot of ${xDef.label} versus ${yDef.label}`}
        >
          {/* Subtle Grid Lines & Ticks */}
          {xTicks.map((tickVal, i) => {
            const xPos = projectX(tickVal, xDomain, width, padLeft, padRight);
            return (
              <g key={`xtick-${i}`}>
                <line
                  x1={xPos}
                  y1={padTop}
                  x2={xPos}
                  y2={height - padBottom}
                  stroke="#2d3542"
                  strokeWidth="1"
                  strokeDasharray="2 2"
                />
                <text
                  x={xPos}
                  y={height - padBottom + 16}
                  fill="#7b8798"
                  fontSize="11"
                  fontFamily="monospace"
                  textAnchor="middle"
                >
                  {formatVal(tickVal, xDef)}
                </text>
              </g>
            );
          })}

          {yTicks.map((tickVal, i) => {
            const yPos = projectY(tickVal, yDomain, height, padTop, padBottom);
            return (
              <g key={`ytick-${i}`}>
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
                  x={padLeft - 10}
                  y={yPos + 4}
                  fill="#7b8798"
                  fontSize="11"
                  fontFamily="monospace"
                  textAnchor="end"
                >
                  {formatVal(tickVal, yDef)}
                </text>
              </g>
            );
          })}

          {/* Reference Lines (Crosshairs) */}
          {referenceType !== "none" && (
            <>
              {/* X Reference Line */}
              <line
                x1={refXCoord}
                y1={padTop}
                x2={refXCoord}
                y2={height - padBottom}
                stroke="var(--accent)"
                strokeWidth="1.5"
                strokeDasharray="4 4"
                opacity="0.8"
              />
              <text
                x={refXCoord + 4}
                y={padTop + 14}
                fill="var(--accent)"
                fontSize="10"
                fontFamily="sans-serif"
                fontWeight="bold"
              >
                {referenceType.toUpperCase()} {xDef.label}: {formatVal(refXVal, xDef)}
              </text>

              {/* Y Reference Line */}
              <line
                x1={padLeft}
                y1={refYCoord}
                x2={width - padRight}
                y2={refYCoord}
                stroke="var(--accent)"
                strokeWidth="1.5"
                strokeDasharray="4 4"
                opacity="0.8"
              />
              <text
                x={width - padRight - 6}
                y={refYCoord - 6}
                fill="var(--accent)"
                fontSize="10"
                fontFamily="sans-serif"
                fontWeight="bold"
                textAnchor="end"
              >
                {referenceType.toUpperCase()} {yDef.label}: {formatVal(refYVal, yDef)}
              </text>
            </>
          )}

          {/* Plot Data Points */}
          {points.map((pt) => {
            const cx = projectX(pt.x, xDomain, width, padLeft, padRight);
            const cy = projectY(pt.y, yDomain, height, padTop, padBottom);

            const isCompared = compareTray.includes(pt.playerId);
            const isFav = favorites.includes(pt.playerId);
            const isHovered = activePoint?.playerId === pt.playerId;

            // Marker appearance
            let r = 4.5;
            let fill = "#637287";
            let stroke = "#20252e";
            let strokeWidth = 1;

            if (pt.isOutlier) {
              fill = "#4ecdc4"; // Cyan for statistical outliers
              r = 5.5;
            }
            if (isFav) {
              fill = "#ffd166"; // Gold for favorites
              r = 6;
            }
            if (isCompared) {
              fill = "#ff6b6b"; // Coral for compare tray
              stroke = "#ffd166";
              strokeWidth = 2;
              r = 7;
            }
            if (isHovered) {
              r = 9;
              stroke = "#ffffff";
              strokeWidth = 2.5;
            }

            return (
              <g
                key={pt.playerId}
                tabIndex={0}
                role="button"
                aria-label={`${pt.playerName}: ${xDef.label} ${formatVal(pt.x, xDef)}, ${yDef.label} ${formatVal(pt.y, yDef)}`}
                onMouseEnter={() => setHoveredPoint(pt)}
                onMouseLeave={() => setHoveredPoint(null)}
                onFocus={() => setFocusedPoint(pt)}
                onBlur={() => setFocusedPoint(null)}
                onClick={() => {
                  const fullItem = items.find((i) => i.player_id === pt.playerId);
                  if (fullItem && onSelectPlayer) {
                    onSelectPlayer(fullItem);
                  } else {
                    toggleCompare(pt.playerId);
                  }
                }}
                style={{ cursor: "pointer", outline: "none" }}
              >
                <circle
                  cx={cx}
                  cy={cy}
                  r={r}
                  fill={fill}
                  stroke={stroke}
                  strokeWidth={strokeWidth}
                  opacity={isHovered ? 1 : 0.88}
                />

                {/* Visible Name Label for Outliers / Compared Players */}
                {((showOutlierLabels && pt.isOutlier) || isCompared || isHovered) && (
                  <text
                    x={cx + (cx > width - 120 ? -8 : 8)}
                    y={cy - 6}
                    fill={isCompared ? "#ffd166" : isHovered ? "#ffffff" : "#b4bdca"}
                    fontSize={isHovered ? "12" : "10"}
                    fontWeight={isHovered || isCompared ? "bold" : "normal"}
                    fontFamily="sans-serif"
                    textAnchor={cx > width - 120 ? "end" : "start"}
                    style={{ pointerEvents: "none" }}
                  >
                    {pt.playerName}
                  </text>
                )}
              </g>
            );
          })}

          {/* Axes Titles */}
          <text
            x={padLeft + (width - padLeft - padRight) / 2}
            y={height - 12}
            fill="#f1f3f6"
            fontSize="13"
            fontWeight="bold"
            fontFamily="sans-serif"
            textAnchor="middle"
          >
            {xDef.label} {xDef.tooltip ? `(${xDef.tooltip})` : ""}
          </text>

          <text
            x={-(padTop + (height - padTop - padBottom) / 2)}
            y={20}
            transform="rotate(-90)"
            fill="#f1f3f6"
            fontSize="13"
            fontWeight="bold"
            fontFamily="sans-serif"
            textAnchor="middle"
          >
            {yDef.label} {yDef.tooltip ? `(${yDef.tooltip})` : ""}
          </text>
        </svg>

        {/* Floating Tooltip when Point is Hovered/Focused */}
        {activePoint && (
          <div
            className="scatter-tooltip"
            style={{
              position: "absolute",
              left: `${Math.min(projectX(activePoint.x, xDomain, width, padLeft, padRight) + 12, width - 220)}px`,
              top: `${Math.max(projectY(activePoint.y, yDomain, height, padTop, padBottom) - 60, 10)}px`,
              background: "rgba(32, 37, 46, 0.95)",
              border: "1px solid var(--accent)",
              borderRadius: "6px",
              padding: "0.6rem 0.8rem",
              boxShadow: "0 6px 16px rgba(0,0,0,0.5)",
              pointerEvents: "none",
              zIndex: 10,
              minWidth: "180px"
            }}
          >
            <div style={{ fontWeight: "bold", color: "var(--accent)", fontSize: "0.85rem" }}>
              {activePoint.playerName}
            </div>
            <div className="text-xs text-muted" style={{ margin: "0.1rem 0 0.3rem" }}>
              {activePoint.teams.join(", ") || "NBA"} · {activePoint.gamesPlayed} GP · {activePoint.totalMinutes.toFixed(0)} MIN
            </div>
            <div style={{ fontSize: "0.8rem", display: "grid", gridTemplateColumns: "1fr auto", gap: "0.2rem 0.6rem" }}>
              <span className="text-muted">{xDef.label}:</span>
              <strong className="font-mono">{formatVal(activePoint.x, xDef)}</strong>
              <span className="text-muted">{yDef.label}:</span>
              <strong className="font-mono">{formatVal(activePoint.y, yDef)}</strong>
            </div>
            {activePoint.outlierReason && (
              <div className="text-xs" style={{ color: "#4ecdc4", marginTop: "0.3rem", fontWeight: "bold" }}>
                ★ {activePoint.outlierReason}
              </div>
            )}
            <div className="text-xs text-muted" style={{ marginTop: "0.3rem", borderTop: "1px solid #323b49", paddingTop: "0.2rem" }}>
              Click to {compareTray.includes(activePoint.playerId) ? "remove from" : "add to"} compare
            </div>
          </div>
        )}
      </div>

      {/* Chart Legend */}
      <div
        className="scatter-legend"
        style={{
          display: "flex",
          flexWrap: "wrap",
          alignItems: "center",
          gap: "1rem",
          marginTop: "0.75rem",
          padding: "0.5rem 0.75rem",
          background: "var(--surface)",
          borderRadius: "4px",
          fontSize: "0.75rem"
        }}
      >
        <span style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
          <span style={{ width: "9px", height: "9px", borderRadius: "50%", background: "#637287", display: "inline-block" }} />
          Standard ({points.filter((p) => !p.isOutlier).length})
        </span>
        <span style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
          <span style={{ width: "11px", height: "11px", borderRadius: "50%", background: "#4ecdc4", display: "inline-block" }} />
          Statistical Outlier ({points.filter((p) => p.isOutlier).length})
        </span>
        <span style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
          <span style={{ width: "11px", height: "11px", borderRadius: "50%", background: "#ffd166", display: "inline-block" }} />
          Favorite ★
        </span>
        <span style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
          <span style={{ width: "13px", height: "13px", borderRadius: "50%", background: "#ff6b6b", border: "1.5px solid #ffd166", display: "inline-block" }} />
          Compare Tray ({compareTray.length})
        </span>
      </div>

      {/* Accessible Chart Data Table (F06) */}
      {showDataTable && (
        <div style={{ marginTop: "1rem" }}>
          <div className="panel-header">
            <h3 className="panel-title" style={{ fontSize: "0.95rem" }}>
              Chart Data Table ({points.length} observations)
            </h3>
          </div>
          <div className="table-wrapper" style={{ maxHeight: "360px", overflowY: "auto" }}>
            <table className="data-table" aria-label="Tabular data for scatter plot">
              <thead>
                <tr>
                  <th style={{ width: "40px" }}>#</th>
                  <th>Player</th>
                  <th>Team</th>
                  <th className="num">GP</th>
                  <th className="num">MIN</th>
                  <th className="num">{xDef.label}</th>
                  <th className="num">{yDef.label}</th>
                  <th>Classification</th>
                </tr>
              </thead>
              <tbody>
                {points.map((pt, idx) => (
                  <tr key={pt.playerId}>
                    <td className="font-mono text-muted text-xs">{idx + 1}</td>
                    <td className="font-semibold">
                      {pt.playerName} {favorites.includes(pt.playerId) ? "★" : ""}
                    </td>
                    <td className="text-muted text-xs">{pt.teams.join(", ") || "—"}</td>
                    <td className="num font-mono">{pt.gamesPlayed}</td>
                    <td className="num font-mono">{pt.totalMinutes.toFixed(0)}</td>
                    <td className="num font-mono font-bold">{formatVal(pt.x, xDef)}</td>
                    <td className="num font-mono font-bold">{formatVal(pt.y, yDef)}</td>
                    <td className="text-xs">
                      {pt.isOutlier ? (
                        <span className="badge" style={{ background: "#4ecdc4", color: "#20252e" }}>
                          {pt.outlierReason || "Outlier"}
                        </span>
                      ) : (
                        <span className="text-muted">Standard</span>
                      )}
                    </td>
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
