"use client";
import { AssistantPageSelection } from "@/lib/assistant-page-context";
import { Icon } from "./ui/icon";

import { useState, useMemo, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { TeamLogoStack } from "./team-logo";
import { PlayerPortrait } from "./player-portrait";
import { MultiPlayerLinesView } from "./multi-player-lines-view";
import { useWorkspace } from "@/lib/workspace-context";
import { ALL_CATALOG_METRICS } from "@/lib/stats-presets";
import { saveInvestigation } from "@/lib/workbench-api";
import {
  exportSvgAsPng,
  exportSvgFile,
  copyCanonicalQueryUrl
} from "@/lib/image-export";
import type {
  PlayerComparisonResponse,
  MetricComparisonItem,
  AnalyticsCatalog
} from "@/lib/types";

export type ComparePresetId = "overall" | "offense" | "defense" | "sixfactor" | "custom";

const PRESET_METRICS: Record<ComparePresetId, { label: string; description: string; metrics: string[] }> = {
  overall: {
    label: "Overall",
    description: "Core descriptive per-game production, workload, and fundamental efficiency.",
    metrics: [
      "pts_per_game",
      "reb_per_game",
      "ast_per_game",
      "stl_per_game",
      "blk_per_game",
      "tov_per_game",
      "min_per_game",
      "gp",
      "ts_pct",
      "efg_pct",
      "ftr"
    ]
  },
  offense: {
    label: "Offense",
    description: "Scoring volume, playmaking, shot creation, and shooting splits.",
    metrics: [
      "pts_per_game",
      "pts_per_36",
      "ast_per_game",
      "ast_per_36",
      "tov_per_game",
      "tov_per_36",
      "ts_pct",
      "efg_pct",
      "fg3m_per_game",
      "fg3a_per_game",
      "fg3_pct",
      "ftm_per_game",
      "fta_per_game",
      "ft_pct",
      "ftr",
      "oreb_per_game"
    ]
  },
  defense: {
    label: "Defense",
    description: "Defensive activity events, defensive rebounding, and foul discipline.",
    metrics: [
      "stl_per_game",
      "stl_per_36",
      "blk_per_game",
      "blk_per_36",
      "dreb_per_game",
      "dreb_per_36",
      "pf_per_game",
      "pf_per_36"
    ]
  },
  sixfactor: {
    label: "Six Factor",
    description: "Box-score factor proxies across shooting, turnovers, and rebounding opportunities.",
    metrics: [
      "ts_pct",
      "efg_pct",
      "ftr",
      "tov_per_game",
      "tov_per_36",
      "oreb_per_game",
      "oreb_per_36",
      "dreb_per_game",
      "dreb_per_36"
    ]
  },
  custom: {
    label: "Custom",
    description: "User-defined selection of up to 25 catalog metrics or personal saved custom views.",
    metrics: []
  }
};

interface PlayerCompareViewProps {
  comparison: PlayerComparisonResponse;
  catalog?: AnalyticsCatalog;
  additionalPlayerIds?: string[];
  context: {
    season: string;
    phase: string;
    before_date: string;
    window: string;
    release_id?: string;
  };
}

export function PlayerCompareView({
  comparison,
  additionalPlayerIds = [],
  context
}: PlayerCompareViewProps) {
  const router = useRouter();
  const { compareTray, views, removeCompare, toggleCompare } = useWorkspace();

  const [activeTab, setActiveTab] = useState<ComparePresetId>("overall");
  const [selectedCustomViewId, setSelectedCustomViewId] = useState<string>("");
  const [customSelectedKeys] = useState<string[]>([
    "pts_per_game",
    "ast_per_game",
    "reb_per_game",
    "ts_pct",
    "efg_pct"
  ]);
  const [mainViewMode, setMainViewMode] = useState<"table" | "bars" | "lines">("table");
  const [exporting, setExporting] = useState<boolean>(false);
  const [copySuccess, setCopySuccess] = useState<boolean>(false);
  const [saving, setSaving] = useState<boolean>(false);
  const [saveSuccess, setSaveSuccess] = useState<string | null>(null);

  const barChartSvgRef = useRef<SVGSVGElement | null>(null);

  const { player_a, player_b, aligned_metrics, no_forced_winner_notice } = comparison;

  // Swap Player A and Player B
  const handleSwap = () => {
    const sp = new URLSearchParams({
      playerA: player_b.id,
      playerB: player_a.id,
      season: context.season,
      phase: context.phase,
      beforeDate: context.before_date,
      window: context.window
    });
    if (context.release_id) sp.set("releaseId", context.release_id);
    if (additionalPlayerIds.length > 0) {
      sp.set("players", [player_b.id, player_a.id, ...additionalPlayerIds].join(","));
    }
    router.push(`/compare?${sp.toString()}`);
  };

  // Active metrics to display based on preset
  const activeMetricsList = useMemo<MetricComparisonItem[]>(() => {
    let targetKeys: string[] = [];

    if (activeTab === "custom") {
      if (selectedCustomViewId) {
        const found = views.find((v) => v.id === selectedCustomViewId);
        if (found) targetKeys = found.columns;
      }
      if (targetKeys.length === 0) targetKeys = customSelectedKeys;
    } else {
      targetKeys = PRESET_METRICS[activeTab].metrics;
    }

    // Filter aligned_metrics preserving order of targetKeys
    const metricMap = new Map<string, MetricComparisonItem>();
    for (const m of aligned_metrics) {
      metricMap.set(m.metric, m);
    }

    const result: MetricComparisonItem[] = [];
    for (const key of targetKeys) {
      const found = metricMap.get(key);
      if (found) {
        result.push(found);
      } else {
        const catDef = ALL_CATALOG_METRICS[key];
        if (catDef) {
          result.push({
            metric: key,
            display_name: catDef.label,
            unit: catDef.group === "Efficiency" ? "%" : "",
            value_a: null,
            value_b: null,
            diff: null,
            n_a: player_a.games_played,
            n_b: player_b.games_played
          });
        }
      }
    }

    // If preset resulted in empty (e.g. initial load), fall back to aligned_metrics
    return result.length > 0 ? result : aligned_metrics.slice(0, 15);
  }, [activeTab, selectedCustomViewId, customSelectedKeys, views, aligned_metrics, player_a, player_b]);

  // Format metric value helper
  const formatVal = (val: number | string | null, unit: string) => {
    if (val === null || val === undefined || val === "") return "—";
    if (typeof val === "number") {
      if (unit === "%") {
        return `${(val > 1 ? val : val * 100).toFixed(1)}%`;
      }
      return val.toFixed(1);
    }
    return String(val);
  };

  // Image Export handlers
  const handleExportPng = async () => {
    if (!barChartSvgRef.current) return;
    try {
      setExporting(true);
      await exportSvgAsPng(barChartSvgRef.current, {
        title: `CourtLens Comparison: ${player_a.name} vs ${player_b.name}`,
        subtitle: `${PRESET_METRICS[activeTab].label} Metrics · ${context.season} (${context.phase.replaceAll("_", " ")})`,
        context,
        evidenceId: context.release_id,
        filename: `courtlens-compare-${player_a.id}-vs-${player_b.id}-${context.before_date || "cutoff"}`
      });
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to export PNG");
    } finally {
      setExporting(false);
    }
  };

  const handleExportSvg = () => {
    if (!barChartSvgRef.current) return;
    exportSvgFile(barChartSvgRef.current, `courtlens-compare-${player_a.id}-vs-${player_b.id}.svg`, {
      title: `CourtLens Comparison: ${player_a.name} vs ${player_b.name}`,
      context,
      filename: `courtlens-compare-${player_a.id}-vs-${player_b.id}`
    });
  };

  const handleCopyLink = async () => {
    const ok = await copyCanonicalQueryUrl("/compare", {
      playerA: player_a.id,
      playerB: player_b.id,
      season: context.season,
      phase: context.phase,
      beforeDate: context.before_date,
      window: context.window,
      releaseId: context.release_id
    });
    if (ok) {
      setCopySuccess(true);
      setTimeout(() => setCopySuccess(false), 2500);
    }
  };

  const handleSaveInvestigation = async () => {
    try {
      setSaving(true);
      const title = `Player Comparison: ${player_a.name} vs ${player_b.name} (${context.season})`;
      const saved = await saveInvestigation(title, {
        type: "player_comparison",
        playerA: player_a.id,
        playerB: player_b.id,
        season: context.season,
        phase: context.phase,
        beforeDate: context.before_date,
        window: context.window,
        preset: activeTab
      });
      setSaveSuccess(saved.title);
      setTimeout(() => setSaveSuccess(null), 5000);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to save investigation");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="player-compare-container" role="region" aria-label="Player Comparison Explorer">
      <AssistantPageSelection route="/compare" playerIds={[player_a.id, player_b.id, ...additionalPlayerIds]} scope={context} label={`${player_a.name} / ${player_b.name}${additionalPlayerIds.length ? ` + ${additionalPlayerIds.length} more` : ""}`} />
      {/* Zero Forced Winner Rule Notice (Key Principle & Guardrail) */}
      <div className="notice-box notice-box-accent mb-5">
        <strong>Temporal discipline & no forced winner:</strong>{" "}
        {no_forced_winner_notice ||
          "CourtLens displays aligned empirical distributions and descriptive differences. We never invent a winner probability or automated start/sit decision from overlapping ranges."}
      </div>

      {saveSuccess && (
        <div className="notice-box notice-box-positive mb-4">
          <strong>Saved investigation:</strong> {saveSuccess}. Inspect in{" "}
          <Link href="/investigations" className="text-accent underline">
            Saved Investigations
          </Link>.
        </div>
      )}

      {/* Side-by-Side Identity Cards */}
      <div className="grid-2 mb-5">
        {/* Player A Card */}
        <div className="panel compare-card-panel">
          <div className="compare-card-leading">
            <PlayerPortrait playerId={player_a.id} name={player_a.name} size="md" />
            <TeamLogoStack teams={player_a.teams ?? []} />
            <div>
              <span className="text-xs text-muted font-mono uppercase">
                Player A · {player_a.teams?.join(", ") || "—"}
              </span>
              <h2 className="panel-title compare-card-title">
                <Link href={`/players/${player_a.id}`} className="text-accent hover-underline">
                  {player_a.name}
                </Link>
              </h2>
              <span className="text-xs text-muted font-mono">
                {player_a.games_played} GP · {player_a.total_minutes?.toFixed(0)} MIN
              </span>
            </div>
          </div>
          <button
            type="button"
            className="control-pill"
            onClick={() => toggleCompare(player_a.id)}
            title={compareTray.includes(player_a.id) ? "Remove from compare tray" : "Keep in compare tray"}
          >
            {compareTray.includes(player_a.id) ? <><Icon name="check" size={14} />In Tray</> : <><Icon name="plus" size={14} />Tray</>}
          </button>
        </div>

        {/* Player B Card */}
        <div className="panel compare-card-panel">
          <div className="compare-card-leading">
            <PlayerPortrait playerId={player_b.id} name={player_b.name} size="md" />
            <TeamLogoStack teams={player_b.teams ?? []} />
            <div>
              <span className="text-xs text-muted font-mono uppercase">
                Player B · {player_b.teams?.join(", ") || "—"}
              </span>
              <h2 className="panel-title compare-card-title">
                <Link href={`/players/${player_b.id}`} className="text-accent hover-underline">
                  {player_b.name}
                </Link>
              </h2>
              <span className="text-xs text-muted font-mono">
                {player_b.games_played} GP · {player_b.total_minutes?.toFixed(0)} MIN
              </span>
            </div>
          </div>
          <button
            type="button"
            className="control-pill"
            onClick={() => toggleCompare(player_b.id)}
            title={compareTray.includes(player_b.id) ? "Remove from compare tray" : "Keep in compare tray"}
          >
            {compareTray.includes(player_b.id) ? <><Icon name="check" size={14} />In Tray</> : <><Icon name="plus" size={14} />Tray</>}
          </button>
        </div>
      </div>

      {/* Control Bar: Swapping, Presets, View Mode & Share */}
      <div className="filter-toolbar compare-filter-toolbar">
        {/* Presets Segmented Buttons (F24) */}
        <div className="control-button-group" role="tablist" aria-label="Comparison Metric Presets">
          {(["overall", "offense", "defense", "sixfactor", "custom"] as const).map((id) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={activeTab === id}
              onClick={() => setActiveTab(id)}
              className={`control-pill ${activeTab === id ? "active" : ""}`}
              title={PRESET_METRICS[id].description}
            >
              {PRESET_METRICS[id].label}
            </button>
          ))}
        </div>

        {/* View Mode Switcher: Table vs Comparative Bars vs Trend Lines */}
        <div className="control-button-group" role="group" aria-label="Comparison View Mode">
          <button
            type="button"
            onClick={() => setMainViewMode("table")}
            className={`control-pill ${mainViewMode === "table" ? "active" : ""}`}
            title="Display aligned descriptive data table"
          >
            <Icon name="table" size={14} />Table
          </button>
          <button
            type="button"
            onClick={() => setMainViewMode("bars")}
            className={`control-pill ${mainViewMode === "bars" ? "active" : ""}`}
            title="Display side-by-side comparative metric bars"
          >
            <Icon name="chart" size={14} />Visual Bars
          </button>
          <button
            type="button"
            onClick={() => setMainViewMode("lines")}
            className={`control-pill ${mainViewMode === "lines" ? "active" : ""}`}
            title="Display multi-player game log trend lines"
          >
            <Icon name="trend" size={14} />Trend Lines
          </button>
        </div>

        {/* Quick Actions: Swap Players, Export Image, Copy URL, Save */}
        <div className="compare-toolbar-actions">
          <button
            type="button"
            onClick={handleSwap}
            className="button button-small"
            title="Swap Player A and Player B"
          >
            <Icon name="swap" size={14} />Swap A and B
          </button>

          <button
            type="button"
            onClick={handleExportPng}
            disabled={exporting}
            className="button button-small"
            title="Export context-stamped PNG image with evidence watermark"
          >
            {exporting ? "Rendering…" : <><Icon name="download" />PNG</>}
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
            {copySuccess ? <><Icon name="check" size={14} />Copied</> : <><Icon name="copy" />Copy local URL</>}
          </button>

          <button
            type="button"
            onClick={handleSaveInvestigation}
            disabled={saving}
            className="button button-small"
            title="Save this comparison to immutable investigations"
          >
            {saving ? "Saving…" : <><Icon name="save" size={14} />Save</>}
          </button>
        </div>
      </div>

      {/* Custom View Options Bar (only shown when Custom tab active) */}
      {activeTab === "custom" && (
        <div className="notice-box text-xs compare-custom-options">
          <span>Use Personal Custom View:</span>
          <select
            value={selectedCustomViewId}
            onChange={(e) => setSelectedCustomViewId(e.target.value)}
            className="w-auto"
          >
            <option value="">Default Custom Selection ({customSelectedKeys.length} metrics)</option>
            {views.map((v) => (
              <option key={v.id} value={v.id}>
                {v.name} ({v.columns.length} columns)
              </option>
            ))}
          </select>
          <Link href="/stats" className="text-accent underline ml-auto">
            <Icon name="settings" size={14} />Manage Views in Stats
          </Link>
        </div>
      )}

      {/* Main View Mode 1: Aligned Descriptive Table */}
      {mainViewMode === "table" && (
        <div className="panel">
          <div className="panel-header">
            <div>
              <h3 className="panel-title">{PRESET_METRICS[activeTab].label} Descriptive Metrics</h3>
              <p className="text-muted text-xs panel-subtitle-margin">
                Side-by-side descriptive metrics under an identical cutoff ({context.before_date || "season start"}) and catalog v2 calculation formula.
              </p>
            </div>
            <span className="badge font-mono text-xs">
              {activeMetricsList.length} metrics
            </span>
          </div>

          <div className="table-wrapper">
            <table className="data-table" aria-label="Player comparison aligned metrics table">
              <thead>
                <tr>
                  <th>Metric</th>
                  <th>Unit</th>
                  <th className="num text-player-a">
                    {player_a.name}
                  </th>
                  <th className="num text-player-b">
                    {player_b.name}
                  </th>
                  <th className="num">Difference (A - B)</th>
                  <th className="num text-muted">N (A)</th>
                  <th className="num text-muted">N (B)</th>
                </tr>
              </thead>
              <tbody>
                {activeMetricsList.map((m) => {
                  const diffNum = m.diff;
                  return (
                    <tr key={m.metric}>
                      <td>
                        <strong>{m.display_name}</strong>
                        <span className="text-xs text-muted font-mono compare-metric-key">
                          ({m.metric})
                        </span>
                      </td>
                      <td className="text-muted text-xs">{m.unit || "—"}</td>
                      <td className="num font-mono font-semibold">
                        {formatVal(m.value_a, m.unit)}
                      </td>
                      <td className="num font-mono font-semibold">
                        {formatVal(m.value_b, m.unit)}
                      </td>
                      <td
                        className={`num font-mono font-bold ${
                          diffNum && diffNum > 0 ? "text-positive" : diffNum && diffNum < 0 ? "text-negative" : ""
                        }`}
                      >
                        {diffNum !== null && diffNum !== undefined
                          ? diffNum > 0
                            ? `+${diffNum.toFixed(m.unit === "%" ? 1 : 1)}`
                            : diffNum.toFixed(m.unit === "%" ? 1 : 1)
                          : "—"}
                      </td>
                      <td className="num font-mono text-muted text-xs">{m.n_a}</td>
                      <td className="num font-mono text-muted text-xs">{m.n_b}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Main View Mode 2: Visual Comparison Bars */}
      {mainViewMode === "bars" && (
        <div className="panel">
          <div className="panel-header">
            <div>
              <h3 className="panel-title">Comparative Metric Bars</h3>
              <p className="text-muted text-xs panel-subtitle-margin">
                Side-by-side descriptive comparison. Gold: {player_a.name}, Cyan: {player_b.name}.
              </p>
            </div>
          </div>

          <div className="compare-svg-scroll">
            <svg
              ref={barChartSvgRef}
              viewBox={`0 0 800 ${Math.max(activeMetricsList.length * 48 + 70, 240)}`}
              className="compare-bar-svg"
              role="img"
              aria-label={`Comparative metric bars for ${player_a.name} versus ${player_b.name}`}
            >
              {/* Header Legend */}
              <g transform="translate(180, 28)">
                <rect x={0} y={-10} width={12} height={12} fill="#ffd166" rx={2} />
                <text x={18} y={0} fill="#ffd166" fontSize="12" fontWeight="bold" fontFamily="sans-serif">
                  {player_a.name} (Player A)
                </text>

                <rect x={240} y={-10} width={12} height={12} fill="#4ecdc4" rx={2} />
                <text x={258} y={0} fill="#4ecdc4" fontSize="12" fontWeight="bold" fontFamily="sans-serif">
                  {player_b.name} (Player B)
                </text>
              </g>

              {/* Metric Rows */}
              {activeMetricsList.map((m, idx) => {
                const yOffset = 64 + idx * 48;
                const vA = typeof m.value_a === "number" ? m.value_a : 0;
                const vB = typeof m.value_b === "number" ? m.value_b : 0;
                const maxVal = Math.max(Math.abs(vA), Math.abs(vB), 1);
                const barMaxWidth = 220;

                const widthA = Math.min((Math.abs(vA) / maxVal) * barMaxWidth, barMaxWidth);
                const widthB = Math.min((Math.abs(vB) / maxVal) * barMaxWidth, barMaxWidth);

                return (
                  <g key={`bar-${m.metric}`} transform={`translate(0, ${yOffset})`}>
                    {/* Background row highlight */}
                    {idx % 2 === 0 && (
                      <rect x={12} y={-12} width={776} height={44} fill="rgba(255,255,255,0.015)" rx={4} />
                    )}

                    {/* Metric Label */}
                    <text
                      x={210}
                      y={8}
                      fill="#f1f3f6"
                      fontSize="12"
                      fontWeight="bold"
                      fontFamily="sans-serif"
                      textAnchor="end"
                    >
                      {m.display_name}
                    </text>
                    <text
                      x={210}
                      y={22}
                      fill="#7b8798"
                      fontSize="10"
                      fontFamily="monospace"
                      textAnchor="end"
                    >
                      {m.unit || ""}
                    </text>

                    {/* Center Baseline */}
                    <line x1={225} y1={-8} x2={225} y2={30} stroke="#323b49" strokeWidth="1" />

                    {/* Player A Bar (Gold) */}
                    <rect
                      x={225}
                      y={-6}
                      width={widthA}
                      height={14}
                      fill="#ffd166"
                      rx={2}
                      opacity="0.9"
                    />
                    <text
                      x={225 + widthA + 8}
                      y={5}
                      fill="#ffd166"
                      fontSize="11"
                      fontFamily="monospace"
                      fontWeight="bold"
                    >
                      {formatVal(m.value_a, m.unit)}
                    </text>

                    {/* Player B Bar (Cyan) */}
                    <rect
                      x={225}
                      y={12}
                      width={widthB}
                      height={14}
                      fill="#4ecdc4"
                      rx={2}
                      opacity="0.9"
                    />
                    <text
                      x={225 + widthB + 8}
                      y={23}
                      fill="#4ecdc4"
                      fontSize="11"
                      fontFamily="monospace"
                      fontWeight="bold"
                    >
                      {formatVal(m.value_b, m.unit)}
                    </text>

                    {/* Difference Label */}
                    <text
                      x={770}
                      y={14}
                      fill={m.diff && m.diff > 0 ? "var(--color-positive)" : m.diff && m.diff < 0 ? "var(--color-negative)" : "#7b8798"}
                      fontSize="11"
                      fontFamily="monospace"
                      fontWeight="bold"
                      textAnchor="end"
                    >
                      Δ {m.diff !== null && m.diff !== undefined ? (m.diff > 0 ? `+${m.diff.toFixed(1)}` : m.diff.toFixed(1)) : "—"}
                    </text>
                  </g>
                );
              })}
            </svg>
          </div>
        </div>
      )}

      {/* Main View Mode 3: Multi-Player Game Log Trend Lines */}
      {mainViewMode === "lines" && (
        <MultiPlayerLinesView
          playerIds={[player_a.id, player_b.id, ...additionalPlayerIds]}
          context={context}
        />
      )}

      {/* Retained Comparison Tray Quick Links */}
      {compareTray.length > 2 && (
        <div className="panel compare-tray-panel">
          <div className="panel-header mb-2">
            <h4 className="panel-title compare-tray-title">
              Compare Tray ({compareTray.length} Players Selected)
            </h4>
            <span className="text-xs text-muted">
              Click any player to swap into Player A or B
            </span>
          </div>
          <div className="compare-tray-chips">
            {compareTray.map((id) => (
              <div
                key={id}
                className={`compare-tray-chip ${id === player_a.id ? "is-player-a" : id === player_b.id ? "is-player-b" : ""}`}
              >
                <span className="text-xs font-semibold">
                  {id === player_a.id ? "Player A: " : id === player_b.id ? "Player B: " : ""}
                  {id}
                </span>
                {id !== player_a.id && (
                  <button
                    type="button"
                    onClick={() => {
                      const sp = new URLSearchParams({
                        playerA: id,
                        playerB: player_b.id,
                        season: context.season,
                        phase: context.phase,
                        beforeDate: context.before_date,
                        window: context.window
                      });
                      if (context.release_id) sp.set("releaseId", context.release_id);
                      router.push(`/compare?${sp.toString()}`);
                    }}
                    className="button button-small compare-tray-btn"
                  >
                    Set A
                  </button>
                )}
                {id !== player_b.id && (
                  <button
                    type="button"
                    onClick={() => {
                      const sp = new URLSearchParams({
                        playerA: player_a.id,
                        playerB: id,
                        season: context.season,
                        phase: context.phase,
                        beforeDate: context.before_date,
                        window: context.window
                      });
                      if (context.release_id) sp.set("releaseId", context.release_id);
                      router.push(`/compare?${sp.toString()}`);
                    }}
                    className="button button-small compare-tray-btn"
                  >
                    Set B
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => removeCompare(id)}
                  className="compare-tray-remove"
                  title="Remove from compare tray"
                  aria-label="Remove from compare tray"
                >
                  <Icon name="close" size={14} />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
