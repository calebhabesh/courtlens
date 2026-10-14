"use client";

import { ValueDot, valueDotsFit } from "./charts/value-dot";
import { useEffect, useMemo, useRef, useState } from "react";
import { exampleParams, type ExampleSubject } from "@/lib/example-subject";
import { ExampleSubjectCard } from "./example-subject";
import { useRouter, useSearchParams } from "next/navigation";
import { ContextBar } from "./context-bar";
import { GatedNote } from "./ui/gated-note";
import { PlayerIdentity, teamStyle } from "./ui/identity";
import { Menu, MenuItem } from "./ui/menu";
import { PageShell } from "./ui/page-shell";
import { PageHeader } from "./ui/panel";
import { StatTile } from "./ui/stat-tile";
import { formatDate } from "@/lib/format-date";
import { scopeContextLine } from "@/lib/scope-labels";
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
import { Button, ButtonLink, IconButton, Segmented } from "./ui/kit";

interface RecentGamesViewProps {
  initialProfile: PlayerProfile;
  initialGames: PlayerGameLogItem[];
  defaultExample?: ExampleSubject | null;
}

export function RecentGamesView({
  defaultExample,
  initialProfile,
  initialGames
}: RecentGamesViewProps) {
  const searchParams = useSearchParams();
  const [lookupText, setLookupText] = useState("");
  const router = useRouter();
  const { player, context, latest_team, last_observed_date } = initialProfile;
  const serialized = searchParams.toString();
  useEffect(() => {
    if (!defaultExample) return;
    const source = new URLSearchParams(serialized);
    if (!source.get("playerId") && !source.get("id")) window.history.replaceState(null, "", `/last-games?${exampleParams(source,defaultExample,"playerId","player")}`);
  }, [serialized, defaultExample]);

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

  const scopeParams = `season=${context.season}&phase=${context.phase}&beforeDate=${context.before_date}`;
  const exposureSuffix = exposureMode === "per_36" ? "/36" : "";
  const windowLabel = windowSelection === "all" ? "All season" : windowSelection.replace("last_", "Last ");

  return (
    <PageShell template="profile" className="recent-games-container">
      <PageHeader
        title="Recent Games"
        subtitle={[player.name, latest_team?.name, last_observed_date ? `Last game ${formatDate(last_observed_date)}` : null].filter(Boolean).join(" · ")}
        actions={<>
          <div className="player-lookup-box">
            <LookupInput label="Switch player" value={lookupText} onChange={setLookupText}
              kinds={["player"]}
              releaseId={context.release_id}
              season={context.season}
              placeholder="Switch player..."
              onSelect={(item) => {
                setLookupText("");
                if (item.kind === "player") {
                  router.push(buildPreservedContextUrl(`/last-games?playerId=${item.canonical_id}&${scopeParams}`, searchParams));
                }
              }}
            />
          </div>
          <IconButton size="sm" icon="star" label={isFavorite ? "Remove from favorites" : "Add to favorites"} variant="secondary" filled={isFavorite}
            pressed={isFavorite} onClick={() => toggleFavorite(player.id)} />
          <IconButton size="sm" icon={inTray ? "check" : "plus"} label={inTray ? "Remove from compare tray" : "Add to compare tray"} variant="secondary"
            pressed={inTray} onClick={() => toggleCompare(player.id)} />
          <ButtonLink size="sm" href={`/players/${player.id}?${scopeParams}`}>Profile</ButtonLink>
          <Menu align="right" renderTrigger={props => <Button {...props} size="sm" variant="primary" icon="download" iconAfter="chevron-down">
            {exporting ? "Exporting…" : "Export"}</Button>}>
            <MenuItem icon="table" label="CSV game log" onClick={handleExportCsv} />
            <MenuItem icon="download" label="Export PNG" disabled={exporting} onClick={() => void handleExportPng()} />
            <MenuItem icon="page" label="Export SVG" onClick={handleExportSvg} />
            <MenuItem icon={copiedUrl ? "check" : "copy"} label={copiedUrl ? "Copied" : "Copy link"} onClick={() => void handleCopyUrl()} />
          </Menu>
        </>}
      />

      <ContextBar
        initialSeason={context.season}
        initialPhase={context.phase}
        initialBeforeDate={context.before_date}
        initialReleaseId={context.release_id}
        showWindow={false}
        sampleSize={initialGames.length}
        lastIncludedDate={last_observed_date}
        detailRows={[{ label: "Player", value: player.id, mono: true }]}
        filters={<Segmented<RecentGamesWindow> size="lg" label="Appearance window" value={windowSelection} onChange={setWindowSelection} options={[
          { value: "last_5", label: "Last 5" }, { value: "last_10", label: "Last 10" }, { value: "last_20", label: "Last 20" },
          { value: "all", label: `All (${initialGames.length})` }
        ]} />}
        modes={<>
          <Segmented<CountingExposureMode> size="lg" label="Exposure" value={exposureMode} onChange={setExposureMode} options={[
            { value: "per_game", label: "Per Game" }, { value: "per_36", label: "Per 36" }
          ]} />
          <Segmented<RecentGamesViewMode> size="lg" label="Layout" value={viewMode} onChange={setViewMode} options={[
            { value: "table", label: "Table", icon: "table" }, { value: "cards", label: "Cards", icon: "cards" }
          ]} />
        </>}
      />

      {defaultExample && <ExampleSubjectCard example={defaultExample} />}
      {/* Hero: who, then the window's averages. */}
      <div className="player-hero" style={teamStyle(latest_team?.id)}>
        <div className="player-hero-identity">
          <PlayerIdentity playerId={player.id} name={player.name} team={latest_team?.id} portraitUrl={player.portrait_url}
            href={`/players/${player.id}?${scopeParams}`} subtitle={`${windowLabel} · ${summary.sampleSize} games`} size="lg" />
        </div>
        <div className="player-hero-tiles" role="group" aria-label="Window summary">
          <StatTile label={`PTS${exposureSuffix}`} value={summary.ptsPerGame?.toFixed(1)} />
          <StatTile label={`REB${exposureSuffix}`} value={summary.rebPerGame?.toFixed(1)} />
          <StatTile label={`AST${exposureSuffix}`} value={summary.astPerGame?.toFixed(1)} />
          <StatTile label="MPG" value={summary.avgMinutes?.toFixed(1)} />
          <StatTile label="TS%" value={formatPercent(summary.tsPct)} />
          <StatTile label="High" value={summary.highGamePoints ? `${summary.highGamePoints.points} PTS` : null}
            footnote={summary.highGamePoints ? `vs ${summary.highGamePoints.opponent} · ${formatDate(summary.highGamePoints.date)}` : "No appearances in window"} />
        </div>
      </div>

      {/* Production Trajectory Plot */}
      {plotData.length > 0 && (
        <div className="panel recent-games-section-panel">
          <div className="panel-header">
            <div>
              <h2 className="panel-title">Recent Trajectory (Chronological)</h2>
              <p className="text-muted text-xs panel-subtitle-tight">
                Empirical scoring (gold line) and minutes (blue line) across {plotData.length} appearances. Dashed line denotes window mean.
              </p>
            </div>
            <span className="badge font-mono">{plotData.length} games</span>
          </div>

          <div className="trajectory-chart-container">
            <svg
              ref={plotSvgRef}
              viewBox="0 0 760 180"
              className="trajectory-plot-svg"
              aria-label={`Recent scoring trajectory for ${player.name}`}
              role="img"
            >
              {/* Background */}
              <rect width="760" height="180" fill="var(--color-surface-1)" rx="4" />

              {/* Gridlines */}
              <line x1="40" y1="30" x2="720" y2="30" stroke="var(--color-hairline-strong)" strokeWidth="0.5" strokeDasharray="3 3" />
              <line x1="40" y1="80" x2="720" y2="80" stroke="var(--color-hairline-strong)" strokeWidth="0.5" strokeDasharray="3 3" />
              <line x1="40" y1="130" x2="720" y2="130" stroke="var(--color-hairline-strong)" strokeWidth="0.5" strokeDasharray="3 3" />
              <line x1="40" y1="150" x2="720" y2="150" stroke="var(--color-hairline-strong)" strokeWidth="1" />

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

                const dotsFit = valueDotsFit(points.length, chartW, 26);
                const avgY = summary.ptsPerGame !== null
                  ? topY + chartH - (summary.ptsPerGame / maxPts) * chartH
                  : null;

                return (
                  <>
                    {/* Mean line */}
                    {avgY !== null && (
                      <g>
                        <line x1="40" y1={avgY} x2="720" y2={avgY} stroke="var(--color-text-secondary)" strokeDasharray="4 4" strokeWidth="1" />
                        {/* Right-aligned above the line so it stays inside the 760-wide viewBox. */}
                        <text x="720" y={avgY - 4} textAnchor="end" fill="var(--color-text-secondary)" fontSize="10" fontFamily="monospace">
                          Avg: {summary.ptsPerGame?.toFixed(1)}
                        </text>
                      </g>
                    )}

                    {/* Scoring Path */}
                    <path d={pathD} fill="none" stroke="var(--color-accent)" strokeWidth="2.5" strokeLinejoin="round" />

                    {/* Discrete Points */}
                    {points.map((p) => (
                      <g key={p.date} className="plot-point-group">
                        {dotsFit ? (
                          <ValueDot x={p.x} y={p.y} label={String(p.pts)} color="var(--color-accent)"
                            title={`${p.date} vs ${p.opp}: ${p.pts} PTS (${p.min.toFixed(0)} MIN)`} />
                        ) : (
                          <>
                            <circle cx={p.x} cy={p.y} r="4.5" fill="var(--color-accent)" stroke="var(--color-surface-1)" strokeWidth="2">
                              <title>{`${p.date} vs ${p.opp}: ${p.pts} PTS (${p.min.toFixed(0)} MIN)`}</title>
                            </circle>
                            <text x={p.x} y={p.y - 8} fill="var(--color-text)" fontSize="10" fontFamily="monospace" fontWeight="bold" textAnchor="middle">
                              {p.pts}
                            </text>
                          </>
                        )}
                        <text
                          x={p.x}
                          y="168"
                          fill="var(--color-text-secondary)"
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
        <div className="panel recent-games-section-panel">
          <div className="panel-header">
            <div>
              <h2 className="panel-title">Appearance Game Log</h2>
              <p className="text-muted text-xs panel-subtitle-tight">
                Newest first · {scopeContextLine(context.season, context.phase, context.before_date)}. Lineage shows each game&apos;s source observations.
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
                  <th className="text-right">Provenance</th>
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
                      <td className="font-mono">{formatDate(g.game_date)}</td>
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
                      <td className="text-right">
                        <Button size="lg"
                          onClick={() => setSelectedFact(g.game_id)}
                          title="Inspect raw cryptographic lineage">
                          Lineage
                        </Button>
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
        <div className="recent-games-cards-grid">
          {visibleGames.map((g) => {
            const mins = g.minutes;
            const pts = exposureMode === "per_36" ? scaleToPer36(g.points, mins) : g.points;
            const reb = exposureMode === "per_36" ? scaleToPer36(g.stats?.rebounds_total, mins) : g.stats?.rebounds_total;
            const ast = exposureMode === "per_36" ? scaleToPer36(g.stats?.assists, mins) : g.stats?.assists;
            const isHigh = summary.highGamePoints && g.points === summary.highGamePoints.points;

            return (
              <div
                key={g.game_id}
                className={isHigh ? "recent-game-card-high" : "recent-game-card"}
              >
                <div className="recent-game-card-header">
                  <span className="font-mono text-xs text-muted">{formatDate(g.game_date)}</span>
                  <span className="badge badge-accent font-mono text-xs">
                    {g.team_tricode} {g.side === "home" ? "vs" : "@"} {g.opponent_tricode}
                  </span>
                </div>

                <div className="recent-game-card-hero">
                  <span className="font-mono text-3xl font-bold text-accent">
                    {pts !== null ? pts : "—"}
                  </span>
                  <span className="text-xs text-muted uppercase font-mono">
                    {exposureMode === "per_36" ? "PTS/36" : "PTS"}
                  </span>
                  <span className="text-xs text-muted font-mono recent-game-card-mins">
                    {mins?.toFixed(1) ?? "—"} MIN
                  </span>
                </div>

                <div className="recent-game-card-stat-grid">
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

                <div className="recent-game-card-footer">
                  <span className="text-xs text-muted font-mono">
                    FG: {g.stats?.field_goals_made ?? 0}/{g.stats?.field_goals_attempted ?? 0}
                  </span>
                  <Button size="lg"
                    onClick={() => setSelectedFact(g.game_id)}>
                    Lineage
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Strict Guardrail Notice */}
      <GatedNote why={`Only games strictly prior to the cutoff (${formatDate(context.before_date)}) are evaluated. Changing future records never alters prior feature hashes. Unobserved dates are unknown, not confirmed DNPs or zero outcomes.`}>
        Missing games are unknown, not zero.
      </GatedNote>

      {/* Cryptographic Lineage Modal */}
      {selectedFact && (
        <LineageDrawer
          factType="player_game"
          factId={selectedFact}
          releaseId={context.release_id}
          onClose={() => setSelectedFact(null)}
        />
      )}
    </PageShell>
  );
}
