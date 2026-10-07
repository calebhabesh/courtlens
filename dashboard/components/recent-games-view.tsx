"use client";

import { useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { PlayerPortrait } from "./player-portrait";
import { LineageDrawer } from "./lineage-drawer";
import { buildPreservedContextUrl } from "@/lib/query-url";
import { LookupInput } from "./lookup-input";
import { useWorkspace } from "@/lib/workspace-context";
import { exportSvgAsPng, exportSvgFile, copyCanonicalQueryUrl } from "@/lib/image-export";
import {
  calculateRecentFormSummary,
  formatPercent,
  formatRecentGamesCsv,
  scaleToPer36,
  sliceRecentGames,
  type CountingExposureMode,
  type RecentGamesViewMode,
  type RecentGamesWindow
} from "@/lib/player-pages";
import type { PlayerGameLogItem, PlayerProfile } from "@/lib/types";

interface RecentGamesViewProps {
  initialProfile: PlayerProfile;
  initialGames: PlayerGameLogItem[];
}

export function RecentGamesView({
  initialProfile,
  initialGames
}: RecentGamesViewProps) {
  const searchParams = useSearchParams();
  const [lookupText, setLookupText] = useState("");
  const router = useRouter();
  const { player, context, latest_team, last_observed_date } = initialProfile;

  const [windowSelection, setWindowSelection] = useState<RecentGamesWindow>("last_10");
  const [exposureMode, setExposureMode] = useState<CountingExposureMode>("per_game");
  const [viewMode, setViewMode] = useState<RecentGamesViewMode>("table");
  const [selectedFact, setSelectedFact] = useState<string | null>(null);
  const [copiedUrl, setCopiedUrl] = useState(false);
  const [exporting, setExporting] = useState(false);

  const plotSvgRef = useRef<SVGSVGElement | null>(null);

  const { favorites, toggleFavorite, compareTray, toggleCompare } =
    useWorkspace();
  const isFavorite = favorites.includes(player.id);
  const inTray = compareTray.includes(player.id);

  // Filter games based on selected window
  const visibleGames = useMemo(() => {
    return sliceRecentGames(initialGames, windowSelection);
  }, [initialGames, windowSelection]);

  // Compute descriptive summary across the visible window
  const summary = useMemo(() => {
    return calculateRecentFormSummary(visibleGames);
  }, [visibleGames]);

  // Trajectory points for the mini plot (chronological: oldest -> newest)
  const plotData = useMemo(() => {
    const chron = [...visibleGames].reverse();
    return chron.map((g, idx) => ({
      index: idx,
      date: g.game_date,
      opp: g.opponent_tricode ?? "OPP",
      pts: g.points ?? 0,
      min: g.minutes ?? 0,
      fga: g.stats?.field_goals_attempted ?? 0,
      fantasy: g.legacy_fantasy_score ?? 0
    }));
  }, [visibleGames]);

  const handleCopyUrl = async () => {
    const ok = await copyCanonicalQueryUrl("/last-games", {
      playerId: player.id,
      season: context.season,
      phase: context.phase,
      beforeDate: context.before_date,
      window: windowSelection
    });
    if (ok) {
      setCopiedUrl(true);
      setTimeout(() => setCopiedUrl(false), 2000);
    }
  };

  const handleExportCsv = () => {
    const csv = formatRecentGamesCsv(player.name, visibleGames, exposureMode);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `courtlens-${player.name.toLowerCase().replace(/\s+/g, "_")}-recent-games.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleExportPng = async () => {
    if (!plotSvgRef.current) return;
    setExporting(true);
    try {
      await exportSvgAsPng(plotSvgRef.current, {
        title: `${player.name} — Recent Form Trajectory (${windowSelection.replace("_", " ").toUpperCase()})`,
        subtitle: `Sample: ${summary.sampleSize} appearances · PPG: ${summary.ptsPerGame ?? "—"} · TS%: ${formatPercent(summary.tsPct)}`,
        context: {
          season: context.season,
          phase: context.phase,
          before_date: context.before_date,
          release_id: context.release_id
        },
        filename: `${player.name.toLowerCase().replace(/\s+/g, "_")}-recent-trajectory.png`
      });
    } finally {
      setExporting(false);
    }
  };

  const handleExportSvg = () => {
    if (!plotSvgRef.current) return;
    exportSvgFile(
      plotSvgRef.current,
      `${player.name.toLowerCase().replace(/\s+/g, "_")}-recent-trajectory.svg`,
      {
        title: `${player.name} — Recent Form Trajectory`,
        context: {
          season: context.season,
          phase: context.phase,
          before_date: context.before_date,
          release_id: context.release_id
        },
        filename: `${player.name.toLowerCase().replace(/\s+/g, "_")}-recent-trajectory.svg`
      }
    );
  };

  return (
    <div className="recent-games-container">
      {/* Player Identity Hero */}
      <div className="player-identity-card" style={{ marginBottom: "1.25rem" }}>
        <PlayerPortrait
          playerId={player.id}
          name={player.name}
          portraitUrl={player.portrait_url}
          size="lg"
        />

        <div className="player-identity-info">
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <span className="text-xs text-accent font-mono uppercase">
              Recent Games Explorer · {context.season} {context.phase.replace("_", " ")}
            </span>
            <span className="badge font-mono text-xs">ID: {player.id}</span>
          </div>

          <h1 className="player-identity-name" style={{ margin: "0.2rem 0" }}>
            {player.name}
          </h1>

          <div className="player-identity-badges">
            {latest_team && (
              <span className="badge badge-accent">
                {latest_team.tricode} · {latest_team.name}
              </span>
            )}
            {last_observed_date && (
              <span className="badge">Last appearance: {last_observed_date}</span>
            )}
            <span className="badge font-mono">
              Window: {windowSelection.replace("_", " ").toUpperCase()} ({summary.sampleSize} GP)
            </span>
          </div>
        </div>

        {/* Global Lookup & Quick Actions */}
        <div style={{ marginLeft: "auto", display: "flex", flexDirection: "column", gap: "0.5rem", alignItems: "flex-end" }}>
          <div style={{ width: "240px" }}>
            <LookupInput label="Switch player" value={lookupText} onChange={setLookupText}
              kinds={["player"]}
              releaseId={context.release_id}
              season={context.season}
              placeholder="Switch player..."
              onSelect={(item) => {
                setLookupText("");
                if (item.kind === "player") {
                  router.push(buildPreservedContextUrl(
                    `/last-games?playerId=${item.canonical_id}&season=${context.season}&phase=${context.phase}&beforeDate=${context.before_date}`, searchParams)
                  );
                }
              }}
            />
          </div>

          <div style={{ display: "flex", gap: "0.4rem", flexWrap: "wrap", justifyContent: "flex-end" }}>
            <button
              type="button"
              className={`button button-small ${isFavorite ? "button-accent" : ""}`}
              onClick={() => toggleFavorite(player.id)}
              title={isFavorite ? "Remove from favorites" : "Add to favorites"}
            >
              {isFavorite ? "★ Favorited" : "☆ Favorite"}
            </button>

            <button
              type="button"
              className={`button button-small ${inTray ? "button-accent" : ""}`}
              onClick={() => toggleCompare(player.id)}
              title={inTray ? "Remove from Compare Tray" : "Add to Compare Tray"}
            >
              {inTray ? "✓ In Compare Tray" : "+ Compare Tray"}
            </button>

            <Link
              href={`/compare?playerA=${player.id}&season=${context.season}&phase=${context.phase}&beforeDate=${context.before_date}`}
              className="button button-small"
              title="Compare in head-to-head PvP view"
            >
              PvP Head-to-Head →
            </Link>

            <Link
              href={`/players/${player.id}?season=${context.season}&phase=${context.phase}&beforeDate=${context.before_date}`}
              className="button button-small button-dark"
              title="Open full player profile"
            >
              Full Profile →
            </Link>
          </div>
        </div>
      </div>

      {/* Toolbar & Filter Controls */}
      <div className="panel" style={{ padding: "0.75rem 1rem", marginBottom: "1.25rem" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "0.75rem" }}>
          {/* Appearance Window Selector */}
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <span className="text-xs text-muted uppercase font-mono font-semibold">Window:</span>
            <div className="segmented-control" role="group" aria-label="Recent appearance window">
              <button
                type="button"
                className={`segmented-button ${windowSelection === "last_5" ? "active" : ""}`}
                onClick={() => setWindowSelection("last_5")}
              >
                Last 5
              </button>
              <button
                type="button"
                className={`segmented-button ${windowSelection === "last_10" ? "active" : ""}`}
                onClick={() => setWindowSelection("last_10")}
              >
                Last 10
              </button>
              <button
                type="button"
                className={`segmented-button ${windowSelection === "last_20" ? "active" : ""}`}
                onClick={() => setWindowSelection("last_20")}
              >
                Last 20
              </button>
              <button
                type="button"
                className={`segmented-button ${windowSelection === "all" ? "active" : ""}`}
                onClick={() => setWindowSelection("all")}
              >
                All Season ({initialGames.length})
              </button>
            </div>
          </div>

          {/* Exposure Mode (Per Game vs Per 36) */}
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <span className="text-xs text-muted uppercase font-mono font-semibold">Exposure:</span>
            <div className="segmented-control" role="group" aria-label="Counting exposure mode">
              <button
                type="button"
                className={`segmented-button ${exposureMode === "per_game" ? "active" : ""}`}
                onClick={() => setExposureMode("per_game")}
                title="Display actual totals per appearance"
              >
                Per Game
              </button>
              <button
                type="button"
                className={`segmented-button ${exposureMode === "per_36" ? "active" : ""}`}
                onClick={() => setExposureMode("per_36")}
                title="Normalize counting stats to per 36 minutes"
              >
                Per 36 Min
              </button>
            </div>
          </div>

          {/* View Mode (Table vs Cards) */}
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <span className="text-xs text-muted uppercase font-mono font-semibold">Format:</span>
            <div className="segmented-control" role="group" aria-label="View layout mode">
              <button
                type="button"
                className={`segmented-button ${viewMode === "table" ? "active" : ""}`}
                onClick={() => setViewMode("table")}
              >
                ☷ Table
              </button>
              <button
                type="button"
                className={`segmented-button ${viewMode === "cards" ? "active" : ""}`}
                onClick={() => setViewMode("cards")}
              >
                🂡 Cards
              </button>
            </div>
          </div>

          {/* Export Actions */}
          <div style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
            <button
              type="button"
              className="button button-small"
              onClick={handleExportCsv}
              title="Download recent game log as CSV"
            >
              CSV
            </button>
            <button
              type="button"
              className="button button-small"
              onClick={handleExportPng}
              disabled={exporting}
              title="Export trajectory chart as high-DPI PNG"
            >
              {exporting ? "Exporting…" : "Export PNG"}
            </button>
            <button
              type="button"
              className="button button-small"
              onClick={handleExportSvg}
              title="Download trajectory SVG"
            >
              SVG
            </button>
            <button
              type="button"
              className="button button-small"
              onClick={handleCopyUrl}
              title="Copy local query URL"
            >
              {copiedUrl ? "✓ Copied" : "Copy URL"}
            </button>
          </div>
        </div>
      </div>

      {/* Recent Form Summary Grid */}
      <div className="grid-4" style={{ marginBottom: "1.25rem" }}>
        <div className="stat-card">
          <span className="stat-label">Scoring Production</span>
          <span className="stat-value font-mono">
            {summary.ptsPerGame !== null ? summary.ptsPerGame.toFixed(1) : "—"}
            <span className="text-sm font-normal text-muted"> {exposureMode === "per_36" ? "PTS/36" : "PPG"}</span>
          </span>
          <span className="stat-subtext">
            TS%: {formatPercent(summary.tsPct)} · eFG%: {formatPercent(summary.efgPct)}
          </span>
        </div>

        <div className="stat-card">
          <span className="stat-label">Rebounds & Assists</span>
          <span className="stat-value font-mono">
            {summary.rebPerGame?.toFixed(1) ?? "—"} <span className="text-xs text-muted">RPG</span> · {summary.astPerGame?.toFixed(1) ?? "—"} <span className="text-xs text-muted">APG</span>
          </span>
          <span className="stat-subtext">
            STL: {summary.stlPerGame?.toFixed(1) ?? "—"} · BLK: {summary.blkPerGame?.toFixed(1) ?? "—"}
          </span>
        </div>

        <div className="stat-card">
          <span className="stat-label">Minutes & Exposure</span>
          <span className="stat-value font-mono">
            {summary.avgMinutes?.toFixed(1) ?? "—"} <span className="text-sm font-normal text-muted">MPG</span>
          </span>
          <span className="stat-subtext">
            {summary.sampleSize} appearances · {summary.totalMinutes} total min
          </span>
        </div>

        <div className="stat-card">
          <span className="stat-label">Window Statistical Highs</span>
          {summary.highGamePoints ? (
            <div style={{ marginTop: "0.2rem" }}>
              <span className="font-mono text-sm font-bold text-accent">
                {summary.highGamePoints.points} PTS
              </span>
              <span className="text-xs text-muted"> vs {summary.highGamePoints.opponent} ({summary.highGamePoints.date})</span>
              {summary.highGameRebounds && (
                <div className="text-xs text-muted font-mono" style={{ marginTop: "0.15rem" }}>
                  {summary.highGameRebounds.rebounds} REB vs {summary.highGameRebounds.opponent}
                </div>
              )}
            </div>
          ) : (
            <span className="text-sm text-muted">No appearances in window</span>
          )}
        </div>
      </div>

      {/* Production Trajectory Plot */}
      {plotData.length > 0 && (
        <div className="panel" style={{ marginBottom: "1.25rem" }}>
          <div className="panel-header">
            <div>
              <h2 className="panel-title">Recent Trajectory (Chronological)</h2>
              <p className="text-muted text-xs" style={{ margin: "0.2rem 0 0" }}>
                Empirical scoring (gold line) and minutes (blue line) across {plotData.length} appearances. Dashed line denotes window mean.
              </p>
            </div>
            <span className="badge font-mono">{plotData.length} games</span>
          </div>

          <div style={{ padding: "1rem", overflowX: "auto" }}>
            <svg
              ref={plotSvgRef}
              viewBox="0 0 760 180"
              style={{ width: "100%", maxWidth: "760px", height: "auto", display: "block" }}
              aria-label={`Recent scoring trajectory for ${player.name}`}
              role="img"
            >
              {/* Background */}
              <rect width="760" height="180" fill="var(--surface)" rx="4" />

              {/* Gridlines */}
              <line x1="40" y1="30" x2="720" y2="30" stroke="var(--border)" strokeWidth="0.5" strokeDasharray="3 3" />
              <line x1="40" y1="80" x2="720" y2="80" stroke="var(--border)" strokeWidth="0.5" strokeDasharray="3 3" />
              <line x1="40" y1="130" x2="720" y2="130" stroke="var(--border)" strokeWidth="0.5" strokeDasharray="3 3" />
              <line x1="40" y1="150" x2="720" y2="150" stroke="var(--border)" strokeWidth="1" />

              {/* Max points calculation */}
              {(() => {
                const maxPts = Math.max(...plotData.map((d) => d.pts), 20);
                const chartW = 680;
                const chartH = 110;
                const topY = 30;

                const points = plotData.map((d, i) => {
                  const x = 50 + (plotData.length > 1 ? (i / (plotData.length - 1)) * chartW : chartW / 2);
                  const y = topY + chartH - (d.pts / maxPts) * chartH;
                  return { ...d, x, y };
                });

                const pathD = points.length > 0
                  ? `M ${points.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" L ")}`
                  : "";

                const avgY = summary.ptsPerGame !== null
                  ? topY + chartH - (summary.ptsPerGame / maxPts) * chartH
                  : null;

                return (
                  <>
                    {/* Mean line */}
                    {avgY !== null && (
                      <g>
                        <line x1="40" y1={avgY} x2="720" y2={avgY} stroke="var(--text-muted)" strokeDasharray="4 4" strokeWidth="1" />
                        <text x="724" y={avgY + 4} fill="var(--text-muted)" fontSize="10" fontFamily="monospace">
                          Avg: {summary.ptsPerGame}
                        </text>
                      </g>
                    )}

                    {/* Scoring Path */}
                    <path d={pathD} fill="none" stroke="var(--accent)" strokeWidth="2.5" strokeLinejoin="round" />

                    {/* Discrete Points */}
                    {points.map((p) => (
                      <g key={p.date} className="plot-point-group">
                        <circle
                          cx={p.x}
                          cy={p.y}
                          r="4.5"
                          fill="var(--accent)"
                          stroke="var(--surface)"
                          strokeWidth="2"
                        >
                          <title>{`${p.date} vs ${p.opp}: ${p.pts} PTS (${p.min.toFixed(0)} MIN)`}</title>
                        </circle>
                        <text
                          x={p.x}
                          y={p.y - 8}
                          fill="var(--text)"
                          fontSize="10"
                          fontFamily="monospace"
                          fontWeight="bold"
                          textAnchor="middle"
                        >
                          {p.pts}
                        </text>
                        <text
                          x={p.x}
                          y="168"
                          fill="var(--text-muted)"
                          fontSize="9"
                          fontFamily="monospace"
                          textAnchor="middle"
                        >
                          {p.opp}
                        </text>
                      </g>
                    ))}
                  </>
                );
              })()}
            </svg>
          </div>
        </div>
      )}

      {/* Main Content: Table or Cards View */}
      {viewMode === "table" ? (
        <div className="panel" style={{ marginBottom: "1.25rem" }}>
          <div className="panel-header">
            <div>
              <h2 className="panel-title">Appearance Game Log</h2>
              <p className="text-muted text-xs" style={{ margin: "0.2rem 0 0" }}>
                Strict chronological order prior to {context.before_date}. Click Lineage to inspect contributing raw observation hash.
              </p>
            </div>
            <span className="badge font-mono">{visibleGames.length} appearances</span>
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
                  <th className="num">{exposureMode === "per_36" ? "PTS/36" : "PTS"}</th>
                  <th className="num">{exposureMode === "per_36" ? "REB/36" : "REB"}</th>
                  <th className="num">{exposureMode === "per_36" ? "AST/36" : "AST"}</th>
                  <th className="num">{exposureMode === "per_36" ? "STL/36" : "STL"}</th>
                  <th className="num">{exposureMode === "per_36" ? "BLK/36" : "BLK"}</th>
                  <th className="num">FGM/A</th>
                  <th className="num">FG%</th>
                  <th className="num">3PM/A</th>
                  <th className="num">3P%</th>
                  <th className="num">TS%</th>
                  <th className="num">Fantasy</th>
                  <th style={{ textAlign: "right" }}>Provenance</th>
                </tr>
              </thead>
              <tbody>
                {visibleGames.map((g) => {
                  const mins = g.minutes;
                  const pts = exposureMode === "per_36" ? scaleToPer36(g.points, mins) : g.points;
                  const reb = exposureMode === "per_36" ? scaleToPer36(g.stats?.rebounds_total, mins) : g.stats?.rebounds_total;
                  const ast = exposureMode === "per_36" ? scaleToPer36(g.stats?.assists, mins) : g.stats?.assists;
                  const stl = exposureMode === "per_36" ? scaleToPer36(g.stats?.steals, mins) : g.stats?.steals;
                  const blk = exposureMode === "per_36" ? scaleToPer36(g.stats?.blocks, mins) : g.stats?.blocks;

                  const fgm = g.stats?.field_goals_made;
                  const fga = g.stats?.field_goals_attempted;
                  const fgPct = typeof fgm === "number" && typeof fga === "number" && fga > 0 ? fgm / fga : null;

                  const fg3m = g.stats?.three_pointers_made;
                  const fg3a = g.stats?.three_pointers_attempted;
                  const fg3Pct = typeof fg3m === "number" && typeof fg3a === "number" && fg3a > 0 ? fg3m / fg3a : null;

                  const fta = g.stats?.free_throws_attempted ?? 0;
                  const tsDenom = typeof fga === "number" ? 2 * (fga + 0.44 * fta) : 0;
                  const tsPct = typeof g.points === "number" && tsDenom > 0 ? g.points / tsDenom : null;

                  return (
                    <tr key={g.game_id}>
                      <td className="font-mono">{g.game_date}</td>
                      <td><strong>{g.team_tricode}</strong></td>
                      <td>{g.side === "home" ? "vs" : "@"} {g.opponent_tricode}</td>
                      <td>
                        <span className={`badge ${g.appearance === "appeared" ? "badge-positive" : ""}`}>
                          {g.appearance}
                        </span>
                      </td>
                      <td className="num font-mono">{mins?.toFixed(1) ?? "—"}</td>
                      <td className="num font-mono font-bold">{pts !== null ? pts : "—"}</td>
                      <td className="num font-mono">{reb !== null ? reb : "—"}</td>
                      <td className="num font-mono">{ast !== null ? ast : "—"}</td>
                      <td className="num font-mono">{stl !== null ? stl : "—"}</td>
                      <td className="num font-mono">{blk !== null ? blk : "—"}</td>
                      <td className="num font-mono text-xs">
                        {fgm ?? 0}/{fga ?? 0}
                      </td>
                      <td className="num font-mono">{formatPercent(fgPct)}</td>
                      <td className="num font-mono text-xs">
                        {fg3m ?? 0}/{fg3a ?? 0}
                      </td>
                      <td className="num font-mono">{formatPercent(fg3Pct)}</td>
                      <td className="num font-mono font-semibold">{formatPercent(tsPct)}</td>
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
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        /* Cards View */
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: "1rem", marginBottom: "1.25rem" }}>
          {visibleGames.map((g) => {
            const mins = g.minutes;
            const pts = exposureMode === "per_36" ? scaleToPer36(g.points, mins) : g.points;
            const reb = exposureMode === "per_36" ? scaleToPer36(g.stats?.rebounds_total, mins) : g.stats?.rebounds_total;
            const ast = exposureMode === "per_36" ? scaleToPer36(g.stats?.assists, mins) : g.stats?.assists;
            const isHigh = summary.highGamePoints && g.points === summary.highGamePoints.points;

            return (
              <div
                key={g.game_id}
                className="panel"
                style={{
                  padding: "1rem",
                  borderLeft: isHigh ? "3px solid var(--accent)" : "1px solid var(--border)",
                  position: "relative"
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: "0.5rem" }}>
                  <span className="font-mono text-xs text-muted">{g.game_date}</span>
                  <span className="badge badge-accent font-mono text-xs">
                    {g.team_tricode} {g.side === "home" ? "vs" : "@"} {g.opponent_tricode}
                  </span>
                </div>

                <div style={{ display: "flex", alignItems: "baseline", gap: "0.75rem", margin: "0.4rem 0" }}>
                  <span className="font-mono text-3xl font-bold text-accent">
                    {pts !== null ? pts : "—"}
                  </span>
                  <span className="text-xs text-muted uppercase font-mono">
                    {exposureMode === "per_36" ? "PTS/36" : "PTS"}
                  </span>
                  <span className="text-xs text-muted font-mono" style={{ marginLeft: "auto" }}>
                    {mins?.toFixed(1) ?? "—"} MIN
                  </span>
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "0.4rem", margin: "0.6rem 0", background: "var(--surface-raised)", padding: "0.5rem", borderRadius: "var(--radius)" }}>
                  <div>
                    <span className="text-xs text-muted font-mono block">REB</span>
                    <strong className="font-mono text-sm">{reb ?? "—"}</strong>
                  </div>
                  <div>
                    <span className="text-xs text-muted font-mono block">AST</span>
                    <strong className="font-mono text-sm">{ast ?? "—"}</strong>
                  </div>
                  <div>
                    <span className="text-xs text-muted font-mono block">FANTASY</span>
                    <strong className="font-mono text-sm">{g.legacy_fantasy_score?.toFixed(1) ?? "—"}</strong>
                  </div>
                </div>

                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "0.5rem" }}>
                  <span className="text-xs text-muted font-mono">
                    FG: {g.stats?.field_goals_made ?? 0}/{g.stats?.field_goals_attempted ?? 0}
                  </span>
                  <button
                    type="button"
                    className="button button-small"
                    onClick={() => setSelectedFact(g.game_id)}
                  >
                    Lineage
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Strict Guardrail Notice */}
      <div className="notice-box" style={{ marginTop: "1rem" }}>
        <strong>Temporal Discipline & Provenance:</strong> Only games strictly prior to cutoff ({context.before_date}) are evaluated. Changing future records never alters prior feature hashes. Unobserved dates are unknown, not confirmed DNPs or zero outcomes.
      </div>

      {/* Cryptographic Lineage Modal */}
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
