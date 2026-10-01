import Link from "next/link";
import { AskCourtLoad } from "@/components/ask-courtload";
import { ContextBar } from "@/components/context-bar";
import { PlayerPortrait } from "@/components/player-portrait";
import { getWorkbenchStatus, queryPlayerResearch } from "@/lib/workbench-api";
import type { PlayerResearchResponse, WorkbenchStatus } from "@/lib/types";

export const dynamic = "force-dynamic";

interface HomePageProps {
  searchParams: Promise<{
    season?: string;
    phase?: string;
    beforeDate?: string;
    window?: string;
  }>;
}

export default async function HomePage({ searchParams }: HomePageProps) {
  const params = await searchParams;
  const season = params.season || "2025-26";
  const phase = params.phase || "regular_season";
  const beforeDate = params.beforeDate || "2026-06-30";
  const windowParam = params.window || "season";

  let status: WorkbenchStatus | null = null;
  let topPlayers: PlayerResearchResponse | null = null;
  let error: string | null = null;

  try {
    status = await getWorkbenchStatus();
  } catch (err) {
    // Graceful fallback if backend is offline
    error = err instanceof Error ? err.message : "Workbench backend unreachable";
  }

  try {
    topPlayers = await queryPlayerResearch({
      season,
      phase,
      before_date: beforeDate,
      window: windowParam,
      sort_metric: "pts",
      sort_direction: "desc",
      limit: 8
    });
  } catch {
    // If query fails (e.g. mock server without workbench routes), keep page working
  }

  return (
    <>
      <ContextBar
        initialSeason={season}
        initialPhase={phase}
        initialBeforeDate={beforeDate}
        initialWindow={windowParam}
        sampleSize={topPlayers?.total_eligible_players}
        lastIncludedDate={topPlayers?.context?.last_included_date}
      />

      <div className="workbench-content">
        <div className="page-header">
          <div>
            <h1 className="page-title">Research Overview</h1>
            <p className="page-subtitle">
              Local NBA analytical workspace with cryptographic data lineage and prospective forecasting.
            </p>
          </div>
          <div className="page-actions">
            <Link href="/players" className="button button-primary">
              Open Player Explorer →
            </Link>
            <Link href="/teams" className="button">
              Teams & Cohorts
            </Link>
          </div>
        </div>

        {/* Quick Search Toolbar */}
        <div className="panel" style={{ padding: "0.85rem 1.25rem" }}>
          <form action="/players" method="GET" style={{ display: "flex", gap: "0.75rem", alignItems: "center", width: "100%" }}>
            <span style={{ fontSize: "1.1rem" }} aria-hidden="true">🔍</span>
            <input
              type="text"
              name="name"
              placeholder="Search player by name (e.g. Scottie Barnes, LeBron James)..."
              style={{ flex: 1, minHeight: "36px" }}
              aria-label="Search player by name"
            />
            <input type="hidden" name="season" value={season} />
            <input type="hidden" name="phase" value={phase} />
            <input type="hidden" name="beforeDate" value={beforeDate} />
            <input type="hidden" name="window" value={windowParam} />
            <button type="submit" className="button button-primary button-small">
              Search
            </button>
          </form>
        </div>

        {/* AI Research Assistant (Milestone P8) */}
        <AskCourtLoad
          initialSeason={season}
          initialPhase={phase}
          initialBeforeDate={beforeDate}
          initialWindow={windowParam}
        />

        {/* System & Freshness Stat Cards */}
        <div className="grid-4" style={{ marginBottom: "1.25rem" }}>
          <div className="stat-card">
            <span className="stat-value text-accent font-mono">
              {status?.release?.channel ?? "public"}
            </span>
            <span className="stat-label">Serving Release</span>
            <span className="stat-subtext">
              {status?.release?.snapshot_id ? `${status.release.snapshot_id.slice(0, 8)}...` : "Active pointer"}
            </span>
          </div>

          <div className="stat-card">
            <span className="stat-value font-mono">
              {topPlayers?.total_eligible_players ?? "—"}
            </span>
            <span className="stat-label">Eligible Players</span>
            <span className="stat-subtext">In {season} {phase.replace("_", " ")}</span>
          </div>

          <div className="stat-card">
            <span className="stat-value font-mono">
              {status?.capabilities?.portraits?.active ?? 0}
            </span>
            <span className="stat-label">Cached Portraits</span>
            <span className="stat-subtext">Local SHA-256 store</span>
          </div>

          <div className="stat-card">
            <span className="stat-value font-mono">09:00 UTC</span>
            <span className="stat-label">Daily Refresh</span>
            <span className="stat-subtext">Worker daemon active</span>
          </div>
        </div>

        {error && (
          <div className="notice-box" style={{ borderLeftColor: "var(--warning)" }}>
            <strong>Operational notice:</strong> {error}. Running in local offline mode.
          </div>
        )}

        {/* Flagship Demonstration 1: Top Scorers Table */}
        <div className="panel">
          <div className="panel-header">
            <div>
              <h2 className="panel-title">Scoring & Production Leaders</h2>
              <p className="text-muted text-xs" style={{ margin: "0.2rem 0 0" }}>
                Strictly prior to {beforeDate} in America/New_York. Single-formula metrics from domain catalog v1.
              </p>
            </div>
            <Link href={`/players?season=${season}&phase=${phase}&beforeDate=${beforeDate}&window=${windowParam}`} className="text-accent text-sm font-semibold">
              View all {topPlayers?.total_eligible_players ?? ""} players →
            </Link>
          </div>

          <div className="table-wrapper">
            <table className="data-table">
              <thead>
                <tr>
                  <th style={{ width: "40px" }}>#</th>
                  <th>Player</th>
                  <th>Team(s)</th>
                  <th className="num">GP</th>
                  <th className="num">MIN</th>
                  <th className="num">PTS</th>
                  <th className="num">PPG</th>
                  <th className="num">REB</th>
                  <th className="num">AST</th>
                  <th className="num">TS%</th>
                  <th className="num">eFG%</th>
                  <th style={{ textAlign: "right" }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {topPlayers?.items && topPlayers.items.length > 0 ? (
                  topPlayers.items.map((p, idx) => (
                    <tr key={p.player_id}>
                      <td className="font-mono text-muted text-xs">{idx + 1}</td>
                      <td>
                        <div className="player-cell">
                          <PlayerPortrait
                            playerId={p.player_id}
                            name={p.player_name}
                            portraitUrl={p.portrait_url}
                            size="sm"
                          />
                          <Link
                            href={`/players/${p.player_id}?season=${season}&phase=${phase}&beforeDate=${beforeDate}&window=${windowParam}`}
                            className="player-cell-name text-accent"
                          >
                            {p.player_name}
                          </Link>
                        </div>
                      </td>
                      <td>
                        <span className="player-cell-teams">
                          {p.teams.join(", ") || "—"}
                        </span>
                      </td>
                      <td className="num font-mono">{p.games_played}</td>
                      <td className="num font-mono">{p.total_minutes.toFixed(0)}</td>
                      <td className="num font-mono font-bold">{p.metrics.pts ?? "—"}</td>
                      <td className="num font-mono">{p.metrics.pts_per_game?.toFixed(1) ?? "—"}</td>
                      <td className="num font-mono">{p.metrics.reb_total ?? "—"}</td>
                      <td className="num font-mono">{p.metrics.ast ?? "—"}</td>
                      <td className="num font-mono">
                        {p.metrics.ts_pct !== null ? `${(p.metrics.ts_pct * 100).toFixed(1)}%` : "—"}
                      </td>
                      <td className="num font-mono">
                        {p.metrics.efg_pct !== null ? `${(p.metrics.efg_pct * 100).toFixed(1)}%` : "—"}
                      </td>
                      <td style={{ textAlign: "right" }}>
                        <Link
                          href={`/compare?playerA=${p.player_id}&season=${season}&phase=${phase}&beforeDate=${beforeDate}&window=${windowParam}`}
                          className="button button-small"
                          style={{ marginRight: "0.4rem" }}
                        >
                          Compare
                        </Link>
                        <Link
                          href={`/players/${p.player_id}?season=${season}&phase=${phase}&beforeDate=${beforeDate}&window=${windowParam}`}
                          className="button button-small button-primary"
                        >
                          Profile
                        </Link>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={12} style={{ textAlign: "center", padding: "2rem" }} className="text-muted">
                      No player records match the selected context ({season}, {phase}, prior to {beforeDate}).
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Flagship Demonstrations Grid */}
        <div className="grid-2">
          {/* Flagship 2: Raptors Team Research */}
          <div className="panel">
            <div className="panel-header">
              <h2 className="panel-title">Flagship 2: Toronto Raptors Research</h2>
              <span className="badge badge-accent">Season Cohort</span>
            </div>
            <p className="text-sm text-muted">
              Inspect season-scoped participation, defensive box statistics, and traded player stints without invented composite impact scores.
            </p>
            <div style={{ marginTop: "1rem", display: "flex", gap: "0.5rem" }}>
              <Link href={`/teams/1610612761?season=${season}&phase=${phase}&beforeDate=${beforeDate}`} className="button button-primary">
                Explore Raptors Cohort →
              </Link>
              <Link href={`/players/1630567?season=${season}&phase=${phase}&beforeDate=${beforeDate}`} className="button">
                Scottie Barnes Profile
              </Link>
            </div>
          </div>

          {/* Flagship 3: Next-Game Points Forecasting */}
          <div className="panel">
            <div className="panel-header">
              <h2 className="panel-title">Flagship 3: Next-Game Points Forecasting</h2>
              <span className="badge">Protocol v1</span>
            </div>
            <p className="text-sm text-muted">
              Explore rolling baseline (EWMA-20) vs boosted challenger point estimates with empirical prediction intervals under strict temporal holdouts.
            </p>
            <div style={{ marginTop: "1rem", display: "flex", gap: "0.5rem" }}>
              <Link href="/forecasts" className="button button-primary">
                View Forecast Evaluation →
              </Link>
              <Link href="/methodology" className="button">
                Read Protocol
              </Link>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
