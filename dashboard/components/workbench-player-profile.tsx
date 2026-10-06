"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { PlayerPortrait } from "./player-portrait";
import { ResearchTrendCharts } from "./research-trend-charts";
import { LineageDrawer } from "./lineage-drawer";
import { useWorkspace } from "@/lib/workspace-context";
import { exportSvgAsPng, exportSvgFile } from "@/lib/image-export";
import { getPlayerMeasurements } from "@/lib/workbench-api";
import {
  formatPercent,
  scaleToPer36,
  type CareerRollup,
  type CountingExposureMode,
  type SeasonCareerRow
} from "@/lib/player-pages";
import type {
  PlayerGameLogItem,
  PlayerMeasurementsDetailResponse,
  PlayerProfile
} from "@/lib/types";

interface WorkbenchPlayerProfileProps {
  profile: PlayerProfile;
  games: PlayerGameLogItem[];
  careerRows?: SeasonCareerRow[];
  careerRollup?: CareerRollup;
}

function formatInches(val: number | null | undefined): string {
  if (val == null) return "—";
  const feet = Math.floor(val / 12);
  const rem = val % 12;
  const remStr =
    rem === 0 ? "0" : rem % 1 === 0 ? rem.toString() : rem.toFixed(2).replace(/\.?0+$/, "");
  return `${feet}'${remStr}" (${val}")`;
}

export function WorkbenchPlayerProfile({
  profile,
  games,
  careerRows = [],
  careerRollup
}: WorkbenchPlayerProfileProps) {
  const [selectedFact, setSelectedFact] = useState<string | null>(null);
  const [exposureMode, setExposureMode] = useState<CountingExposureMode>("per_game");
  const [exporting, setExporting] = useState(false);
  const [measurements, setMeasurements] =
    useState<PlayerMeasurementsDetailResponse | null>(null);

  const cardSvgRef = useRef<SVGSVGElement | null>(null);

  const { favorites, toggleFavorite, compareTray, toggleCompare } =
    useWorkspace();

  const { player, context, summaries, stints, latest_team, last_observed_date, forecast_status } =
    profile;

  useEffect(() => {
    let cancelled = false;
    getPlayerMeasurements(player.id)
      .then((res) => {
        if (!cancelled) setMeasurements(res);
      })
      .catch(() => {
        // Non-blocking
      });
    return () => {
      cancelled = true;
    };
  }, [player.id]);

  const isFavorite = favorites.includes(player.id);
  const inTray = compareTray.includes(player.id);

  const seasonSummary = summaries.season;
  const last10Summary = summaries.last_10;
  const last5Summary = summaries.last_5;

  const handleExportPng = async () => {
    if (!cardSvgRef.current) return;
    setExporting(true);
    try {
      await exportSvgAsPng(cardSvgRef.current, {
        title: `${player.name} — Research Profile Summary`,
        subtitle: `${context.season} ${context.phase.replace("_", " ")} · ${latest_team?.tricode ?? "NBA"} · Cutoff: ${context.before_date}`,
        context: {
          season: context.season,
          phase: context.phase,
          before_date: context.before_date,
          release_id: context.release_id
        },
        filename: `${player.name.toLowerCase().replace(/\s+/g, "_")}-profile-card.png`
      });
    } finally {
      setExporting(false);
    }
  };

  const handleExportSvg = () => {
    if (!cardSvgRef.current) return;
    exportSvgFile(
      cardSvgRef.current,
      `${player.name.toLowerCase().replace(/\s+/g, "_")}-profile-card.svg`,
      {
        title: `${player.name} — Profile Summary`,
        context: {
          season: context.season,
          phase: context.phase,
          before_date: context.before_date,
          release_id: context.release_id
        },
        filename: `${player.name.toLowerCase().replace(/\s+/g, "_")}-profile-card.svg`
      }
    );
  };

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

        <div style={{ marginLeft: "auto", display: "flex", flexDirection: "column", gap: "0.5rem", alignItems: "flex-end" }}>
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
              href={`/last-games?playerId=${player.id}&season=${context.season}&phase=${context.phase}&beforeDate=${context.before_date}`}
              className="button button-small button-dark"
              title="Inspect recent appearances in Recent Games Explorer"
            >
              Recent Games →
            </Link>

            <Link
              href={`/research/trends?playerId=${player.id}&season=${context.season}&phase=${context.phase}&beforeDate=${context.before_date}`}
              className="button button-small"
              title="Analyze workload and performance trends across disjoint windows"
            >
              Trends →
            </Link>

            <Link
              href={`/research/distributions?playerId=${player.id}&season=${context.season}&phase=${context.phase}&beforeDate=${context.before_date}`}
              className="button button-small"
              title="View empirical quantiles, dispersion, and contextual splits"
            >
              Distributions →
            </Link>

            <Link
              href={`/research/similarity?playerId=${player.id}&season=${context.season}&phase=${context.phase}&beforeDate=${context.before_date}`}
              className="button button-small"
              title="Find statistical twin players across standardized dimensions"
            >
              Peers →
            </Link>

            <Link
              href={`/compare?playerA=${player.id}&season=${context.season}&phase=${context.phase}&beforeDate=${context.before_date}`}
              className="button button-small"
              title="Compare with peer in head-to-head PvP view"
            >
              Compare PvP →
            </Link>

            <Link href={`/shot-profile-twin?player_id=${player.id}&release_id=${context.release_id}&season=${context.season}&phase=${context.phase}&before_date=${context.before_date}`} className="button button-small">Shooting →</Link>

            <Link
              href={`/wingspan?playerId=${player.id}`}
              className="button button-small"
              title="Explore physical wingspan and draft combine anthropometry"
            >
              Wingspan →
            </Link>
          </div>

          <div style={{ display: "flex", gap: "0.4rem" }}>
            <button
              type="button"
              className="button button-small"
              onClick={handleExportPng}
              disabled={exporting}
              title="Export high-DPI profile card PNG"
            >
              {exporting ? "Exporting…" : "Export PNG"}
            </button>
            <button
              type="button"
              className="button button-small"
              onClick={handleExportSvg}
              title="Download profile SVG"
            >
              Export SVG
            </button>
          </div>
        </div>
      </div>

      {/* Multi-Team Stints (for Traded Players) */}
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

      {/* Physical Anthropometry & Draft Metadata (Block B14c) */}
      {measurements && measurements.has_measurements && (
        <div className="panel" style={{ marginBottom: "1.25rem" }}>
          <div
            className="panel-header"
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "flex-start",
              flexWrap: "wrap",
              gap: "0.5rem"
            }}
          >
            <div>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "0.5rem",
                  flexWrap: "wrap"
                }}
              >
                <h2 className="panel-title">Physical Anthropometry &amp; Draft Metadata</h2>
                <span className="badge badge-accent">Source-reported measurements</span>
                {measurements.combine && <span className="badge">Draft Combine</span>}
                {measurements.listed && <span className="badge badge-outline">Listed Roster</span>}
              </div>
              <p className="text-muted text-xs" style={{ margin: "0.2rem 0 0" }}>
                Official NBA Draft Combine measurements vs. team-reported roster cards. Missing values are null, never scored as zero.
              </p>
            </div>
            <Link href={`/shot-profile-twin?player_id=${player.id}&release_id=${context.release_id}&season=${context.season}&phase=${context.phase}&before_date=${context.before_date}`} className="button button-small">Shooting →</Link>

            <Link
              href={`/wingspan?playerId=${player.id}`}
              className="button button-small button-dark"
            >
              Open Wingspan Explorer →
            </Link>
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
              gap: "0.75rem",
              margin: "0.75rem 0"
            }}
          >
            {measurements.combine?.wingspan_inches != null && (
              <div className="stat-card" style={{ padding: "0.75rem" }}>
                <span className="stat-label">Wingspan (Combine)</span>
                <span
                  className="stat-value font-mono"
                  style={{ fontSize: "1.2rem", color: "var(--accent)" }}
                >
                  {formatInches(measurements.combine.wingspan_inches)}
                </span>
                <span className="stat-subtext">
                  Ratio:{" "}
                  {measurements.combine.wingspan_to_height_ratio
                    ? `${measurements.combine.wingspan_to_height_ratio.toFixed(2)}x`
                    : "—"}
                </span>
              </div>
            )}

            {measurements.combine?.height_no_shoes_inches != null && (
              <div className="stat-card" style={{ padding: "0.75rem" }}>
                <span className="stat-label">Height Without Shoes</span>
                <span className="stat-value font-mono" style={{ fontSize: "1.2rem" }}>
                  {formatInches(measurements.combine.height_no_shoes_inches)}
                </span>
                <span className="stat-subtext">
                  Shoes: {formatInches(measurements.combine.height_shoes_inches)}
                </span>
              </div>
            )}

            {measurements.combine?.standing_reach_inches != null && (
              <div className="stat-card" style={{ padding: "0.75rem" }}>
                <span className="stat-label">Standing Reach</span>
                <span className="stat-value font-mono" style={{ fontSize: "1.2rem" }}>
                  {formatInches(measurements.combine.standing_reach_inches)}
                </span>
                <span className="stat-subtext">
                  Weight: {measurements.combine.weight_lbs ?? "—"} lbs
                </span>
              </div>
            )}

            {measurements.combine?.max_vertical_inches != null && (
              <div className="stat-card" style={{ padding: "0.75rem" }}>
                <span className="stat-label">Max Vertical Leap</span>
                <span className="stat-value font-mono" style={{ fontSize: "1.2rem" }}>
                  {measurements.combine.max_vertical_inches}&quot;
                </span>
                <span className="stat-subtext">
                  Standing: {measurements.combine.standing_vertical_inches ?? "—"}&quot;
                </span>
              </div>
            )}

            {measurements.listed && (
              <div className="stat-card" style={{ padding: "0.75rem" }}>
                <span className="stat-label">Listed Roster Card</span>
                <span className="stat-value font-mono" style={{ fontSize: "1.2rem" }}>
                  {formatInches(measurements.listed.height_shoes_inches)}
                </span>
                <span className="stat-subtext">
                  {measurements.listed.weight_lbs ?? "—"} lbs ·{" "}
                  {measurements.listed.season ?? "Roster"}
                </span>
              </div>
            )}

            {measurements.draft && (
              <div className="stat-card" style={{ padding: "0.75rem" }}>
                <span className="stat-label">Draft Pedigree</span>
                <span className="stat-value font-mono" style={{ fontSize: "1.1rem" }}>
                  {measurements.draft.draft_type === "undrafted"
                    ? `Undrafted (${measurements.draft.draft_year})`
                    : `${measurements.draft.draft_year} · Pick #${measurements.draft.pick_overall}`}
                </span>
                <span className="stat-subtext">
                  {measurements.draft.drafting_team_name ??
                    measurements.draft.college_or_prior_team ??
                    "NBA"}
                </span>
              </div>
            )}
          </div>

          <div
            style={{
              marginTop: "0.5rem",
              padding: "0.5rem 0.75rem",
              background: "rgba(0,0,0,0.15)",
              borderRadius: "4px",
              fontSize: "0.75rem",
              color: "var(--text-muted)"
            }}
          >
            <strong>Notice:</strong> {measurements.disclaimer}
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
          <div style={{ marginTop: "0.4rem", fontSize: "0.75rem", color: "var(--text-muted)", fontFamily: "var(--font-mono), monospace" }}>
            TS%: {formatPercent(seasonSummary?.ts_pct)} · eFG%: {formatPercent(seasonSummary?.efg_pct)}
          </div>
        </div>

        <div className="stat-card">
          <span className="stat-label">Last 10 Games</span>
          <span className="stat-value font-mono">
            {last10Summary?.pts_per_game?.toFixed(1) ?? "—"} <span className="text-sm font-normal text-muted">PPG</span>
          </span>
          <span className="stat-subtext">
            {last10Summary?.gp ?? 0} GP · {last10Summary?.min_per_game?.toFixed(1) ?? "—"} MPG · {last10Summary?.reb_total_per_game?.toFixed(1) ?? "—"} RPG · {last10Summary?.ast_per_game?.toFixed(1) ?? "—"} APG
          </span>
          <div style={{ marginTop: "0.4rem", fontSize: "0.75rem", color: "var(--text-muted)", fontFamily: "var(--font-mono), monospace" }}>
            TS%: {formatPercent(last10Summary?.ts_pct)} · eFG%: {formatPercent(last10Summary?.efg_pct)}
          </div>
        </div>

        <div className="stat-card">
          <span className="stat-label">Last 5 Games</span>
          <span className="stat-value font-mono">
            {last5Summary?.pts_per_game?.toFixed(1) ?? "—"} <span className="text-sm font-normal text-muted">PPG</span>
          </span>
          <span className="stat-subtext">
            {last5Summary?.gp ?? 0} GP · {last5Summary?.min_per_game?.toFixed(1) ?? "—"} MPG · {last5Summary?.reb_total_per_game?.toFixed(1) ?? "—"} RPG · {last5Summary?.ast_per_game?.toFixed(1) ?? "—"} APG
          </span>
          <div style={{ marginTop: "0.4rem", fontSize: "0.75rem", color: "var(--text-muted)", fontFamily: "var(--font-mono), monospace" }}>
            TS%: {formatPercent(last5Summary?.ts_pct)} · eFG%: {formatPercent(last5Summary?.efg_pct)}
          </div>
        </div>
      </div>

      {/* Multi-Season Career View (F13) */}
      {careerRows.length > 0 && (
        <div className="panel" style={{ marginBottom: "1.25rem" }}>
          <div className="panel-header">
            <div>
              <h2 className="panel-title">Multi-Season Career History</h2>
              <p className="text-muted text-xs" style={{ margin: "0.2rem 0 0" }}>
                Observed participation across admitted snapshot seasons. Click any season row to switch active context.
              </p>
            </div>
            <span className="badge font-mono">{careerRows.length} admitted seasons</span>
          </div>

          <div className="table-wrapper">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Season</th>
                  <th>Team(s)</th>
                  <th className="num">GP</th>
                  <th className="num">MIN</th>
                  <th className="num">MPG</th>
                  <th className="num">PPG</th>
                  <th className="num">RPG</th>
                  <th className="num">APG</th>
                  <th className="num">FG%</th>
                  <th className="num">3P%</th>
                  <th className="num">FT%</th>
                  <th className="num">TS%</th>
                  <th className="num">eFG%</th>
                  <th className="num">Fantasy/G</th>
                </tr>
              </thead>
              <tbody>
                {careerRows.map((r) => {
                  const isCurrent = r.season === context.season;
                  return (
                    <tr
                      key={r.season}
                      style={{ background: isCurrent ? "var(--surface-raised)" : undefined }}
                    >
                      <td>
                        <Link
                          href={`/players/${player.id}?season=${r.season}&phase=${context.phase}&beforeDate=${context.before_date}`}
                          className="font-mono"
                          style={{
                            fontWeight: isCurrent ? "bold" : "normal",
                            color: isCurrent ? "var(--accent)" : undefined
                          }}
                          title={`Switch view to ${r.season}`}
                        >
                          {r.season} {isCurrent && "◀"}
                        </Link>
                      </td>
                      <td><strong>{r.teams}</strong></td>
                      <td className="num font-mono">{r.gamesPlayed}</td>
                      <td className="num font-mono">{r.minutes?.toFixed(0) ?? "—"}</td>
                      <td className="num font-mono">{r.minPerGame?.toFixed(1) ?? "—"}</td>
                      <td className="num font-mono font-bold">{r.ptsPerGame?.toFixed(1) ?? "—"}</td>
                      <td className="num font-mono">{r.rebPerGame?.toFixed(1) ?? "—"}</td>
                      <td className="num font-mono">{r.astPerGame?.toFixed(1) ?? "—"}</td>
                      <td className="num font-mono">{formatPercent(r.fgPct)}</td>
                      <td className="num font-mono">{formatPercent(r.fg3Pct)}</td>
                      <td className="num font-mono">{formatPercent(r.ftPct)}</td>
                      <td className="num font-mono font-semibold">{formatPercent(r.tsPct)}</td>
                      <td className="num font-mono">{formatPercent(r.efgPct)}</td>
                      <td className="num font-mono">{r.fantasyPerGame?.toFixed(1) ?? "—"}</td>
                    </tr>
                  );
                })}

                {/* Career Admitted Totals / Rollup Row */}
                {careerRollup && (
                  <tr style={{ borderTop: "2px solid var(--border)", fontWeight: "bold", background: "var(--surface)" }}>
                    <td colSpan={2}>
                      <span className="font-mono text-xs uppercase" style={{ color: "var(--accent)" }}>
                        Admitted Career
                      </span>
                    </td>
                    <td className="num font-mono">{careerRollup.totalGames}</td>
                    <td className="num font-mono">{careerRollup.totalMinutes.toFixed(0)}</td>
                    <td className="num font-mono">{careerRollup.avgMinutes?.toFixed(1) ?? "—"}</td>
                    <td className="num font-mono text-accent font-bold">{careerRollup.careerPtsPerGame?.toFixed(1) ?? "—"}</td>
                    <td className="num font-mono">{careerRollup.careerRebPerGame?.toFixed(1) ?? "—"}</td>
                    <td className="num font-mono">{careerRollup.careerAstPerGame?.toFixed(1) ?? "—"}</td>
                    <td className="num font-mono">—</td>
                    <td className="num font-mono">—</td>
                    <td className="num font-mono">—</td>
                    <td className="num font-mono">{formatPercent(careerRollup.careerTsPct)}</td>
                    <td className="num font-mono">{formatPercent(careerRollup.careerEfgPct)}</td>
                    <td className="num font-mono">—</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Strict Incomplete Career Guardrail Notice */}
          <div className="notice-box" style={{ margin: "0.75rem 1rem 1rem" }}>
            <strong>Incomplete Career Disclosure:</strong> {careerRollup?.disclaimer ?? "Career data is strictly scoped to admitted dataset seasons. Historical seasons outside admitted coverage are not silently completed or inferred."}
          </div>
        </div>
      )}

      {/* Small-Multiple Trend Charts */}
      <ResearchTrendCharts games={games} playerName={player.name} />

      {/* Reverse-Chronological Game Log with Per-Game / Per-36 Toggle */}
      <div className="panel" style={{ marginBottom: "1.25rem" }}>
        <div className="panel-header">
          <div>
            <h2 className="panel-title">Prior Appearance Game Log</h2>
            <p className="text-muted text-xs" style={{ margin: "0.2rem 0 0" }}>
              Strictly prior to {context.before_date}. Click Lineage to inspect contributing raw observations and SHA-256 provenance.
            </p>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
            <div className="segmented-control" role="group" aria-label="Game log exposure mode">
              <button
                type="button"
                className={`segmented-button ${exposureMode === "per_game" ? "active" : ""}`}
                onClick={() => setExposureMode("per_game")}
              >
                Per Game
              </button>
              <button
                type="button"
                className={`segmented-button ${exposureMode === "per_36" ? "active" : ""}`}
                onClick={() => setExposureMode("per_36")}
              >
                Per 36 Min
              </button>
            </div>
            <span className="badge font-mono">{games.length} games</span>
          </div>
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
                <th className="num">3PM/A</th>
                <th className="num">FTM/A</th>
                <th className="num">Fantasy</th>
                <th style={{ textAlign: "right" }}>Provenance</th>
              </tr>
            </thead>
            <tbody>
              {games.map((g) => {
                const mins = g.minutes;
                const pts = exposureMode === "per_36" ? scaleToPer36(g.points, mins) : g.points;
                const reb = exposureMode === "per_36" ? scaleToPer36(g.stats?.rebounds_total, mins) : g.stats?.rebounds_total;
                const ast = exposureMode === "per_36" ? scaleToPer36(g.stats?.assists, mins) : g.stats?.assists;
                const stl = exposureMode === "per_36" ? scaleToPer36(g.stats?.steals, mins) : g.stats?.steals;
                const blk = exposureMode === "per_36" ? scaleToPer36(g.stats?.blocks, mins) : g.stats?.blocks;

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
                );
              })}
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

      {/* Hidden Renderable SVG Card for Export */}
      <div style={{ display: "none" }}>
        <svg
          ref={cardSvgRef}
          viewBox="0 0 460 520"
          width="460"
          height="520"
          role="img"
          aria-hidden="true"
        >
          <rect width="460" height="520" fill="#282f3b" rx="8" />
          <rect width="460" height="520" fill="none" stroke="#465160" strokeWidth="1.5" rx="8" />
          <path d="M 0 8 Q 0 0 8 0 L 452 0 Q 460 0 460 8 L 460 85 L 0 85 Z" fill="#20252e" />
          <line x1="0" y1="85" x2="460" y2="85" stroke="#ffd166" strokeWidth="2" />
          <text x="24" y="26" fill="#ffd166" fontSize="12" fontWeight="bold" fontFamily="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif">COURTLOAD</text>
          <text x="105" y="26" fill="#b4bdca" fontSize="10" fontFamily="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif">PLAYER PROFILE · {context.season}</text>
          <text x="24" y="55" fill="#f1f3f6" fontSize="20" fontWeight="bold" fontFamily="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif">{player.name}</text>
          <text x="24" y="74" fill="#ffd166" fontSize="11" fontFamily="monospace" fontWeight="bold">{latest_team?.tricode ?? "NBA"} · ID: {player.id}</text>
          <text x="436" y="55" fill="#b4bdca" fontSize="11" fontFamily="monospace" textAnchor="end">{seasonSummary?.gp ?? 0} GP</text>

          {/* 4 Stat Boxes */}
          <rect x="24" y="105" width="95" height="70" fill="#20252e" rx="4" stroke="#323b49" strokeWidth="1" />
          <text x="36" y="125" fill="#b4bdca" fontSize="9" fontFamily="monospace">PPG</text>
          <text x="36" y="155" fill="#f1f3f6" fontSize="20" fontWeight="bold" fontFamily="monospace">{seasonSummary?.pts_per_game?.toFixed(1) ?? "—"}</text>

          <rect x="130" y="105" width="95" height="70" fill="#20252e" rx="4" stroke="#323b49" strokeWidth="1" />
          <text x="142" y="125" fill="#b4bdca" fontSize="9" fontFamily="monospace">RPG</text>
          <text x="142" y="155" fill="#f1f3f6" fontSize="20" fontWeight="bold" fontFamily="monospace">{seasonSummary?.reb_total_per_game?.toFixed(1) ?? "—"}</text>

          <rect x="236" y="105" width="95" height="70" fill="#20252e" rx="4" stroke="#323b49" strokeWidth="1" />
          <text x="248" y="125" fill="#b4bdca" fontSize="9" fontFamily="monospace">APG</text>
          <text x="248" y="155" fill="#f1f3f6" fontSize="20" fontWeight="bold" fontFamily="monospace">{seasonSummary?.ast_per_game?.toFixed(1) ?? "—"}</text>

          <rect x="342" y="105" width="95" height="70" fill="#20252e" rx="4" stroke="#323b49" strokeWidth="1" />
          <text x="354" y="125" fill="#b4bdca" fontSize="9" fontFamily="monospace">TS%</text>
          <text x="354" y="155" fill="#ffd166" fontSize="18" fontWeight="bold" fontFamily="monospace">{formatPercent(seasonSummary?.ts_pct)}</text>

          {/* Forecast Box */}
          <rect x="24" y="195" width="412" height="75" fill="#20252e" rx="4" stroke="#323b49" strokeWidth="1" />
          <text x="36" y="218" fill="#b4bdca" fontSize="10" fontFamily="monospace">PROSPECTIVE FORECAST STATUS</text>
          <text x="36" y="242" fill="#ffd166" fontSize="14" fontWeight="bold" fontFamily="monospace">
            {forecast_status.status === "forecast_issued" && forecast_status.point_estimate !== undefined
              ? `Estimated ${forecast_status.point_estimate.toFixed(1)} PTS [${forecast_status.interval_lower?.toFixed(1)}, ${forecast_status.interval_upper?.toFixed(1)}]`
              : forecast_status.status.replace("_", " ").toUpperCase()}
          </text>
          <text x="36" y="258" fill="#7b8798" fontSize="9" fontFamily="monospace">
            {forecast_status.target_opponent ? `Target: vs ${forecast_status.target_opponent}` : forecast_status.message.slice(0, 50)}
          </text>

          {/* Temporal Guarantee */}
          <line x1="24" y1="460" x2="436" y2="460" stroke="#323b49" strokeWidth="1" />
          <text x="24" y="485" fill="#7b8798" fontSize="9" fontFamily="monospace">TEMPORAL DISCIPLINE: game_date &lt; {context.before_date}</text>
          <text x="24" y="498" fill="#7b8798" fontSize="8" fontFamily="monospace">Strictly Historical Replay · Zero Inferred Claims · CourtLoad Replica</text>
        </svg>
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
