import type { Metadata } from "next";
import Link from "next/link";
import { ContextBar } from "@/components/context-bar";
import { PlayerPortrait } from "@/components/player-portrait";
import { getTeamDetail } from "@/lib/workbench-api";
import type { TeamDetailResponse } from "@/lib/types";

export const metadata: Metadata = { title: "Team Cohort & Production · CourtLoad" };
export const dynamic = "force-dynamic";

interface TeamDetailPageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<{
    season?: string;
    phase?: string;
    beforeDate?: string;
    releaseId?: string;
  }>;
}

export default async function TeamDetailPage({
  params,
  searchParams
}: TeamDetailPageProps) {
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const season = sp.season || "2025-26";
  const phase = sp.phase || "regular_season";
  const beforeDate = sp.beforeDate || "2026-06-30";

  let detail: TeamDetailResponse | null = null;
  let loadError: string | null = null;

  try {
    detail = await getTeamDetail(id, {
      season,
      phase,
      beforeDate,
      releaseId: sp.releaseId
    });
  } catch (err) {
    loadError = err instanceof Error ? err.message : "Failed to load team details";
  }

  if (loadError || !detail) {
    return (
      <div className="workbench-content">
        <div className="notice-box" style={{ borderLeftColor: "var(--negative)" }}>
          <strong>Error loading team:</strong> {loadError || "Team not found in this release."}
        </div>
        <Link href="/teams" className="button button-small">
          ← Return to all teams
        </Link>
      </div>
    );
  }

  const { team, record, production, allowance, player_cohort, recent_games } = detail;
  const ppg = production.pts_per_game ?? 0;
  const oppPpg = allowance.pts_allowed_per_game ?? 0;
  const netMargin = (ppg - oppPpg).toFixed(1);

  return (
    <>
      <ContextBar
        initialSeason={season}
        initialPhase={phase}
        initialBeforeDate={beforeDate}
        sampleSize={recent_games?.length ?? player_cohort?.length ?? record?.games_played ?? 0}
      />

      <div className="workbench-content">
        {/* Team Identity Header */}
        <div className="player-identity-card">
          <div className="callout-number" style={{ width: "64px", height: "64px", borderRadius: "12px", background: "var(--surface-raised)", border: "2px solid var(--accent)", display: "grid", placeItems: "center" }}>
            <span className="font-mono text-accent font-bold text-xl">{team.tricode}</span>
          </div>
          <div className="player-identity-info">
            <span className="text-xs text-muted font-mono uppercase">
              NBA Franchise ID: {team.id} · {season} {phase.replace("_", " ")}
            </span>
            <h1 className="player-identity-name">{team.name}</h1>
            <div className="player-identity-badges">
              <span className="badge badge-accent">
                {record.wins}W - {record.losses}L ({record.win_pct !== null ? record.win_pct.toFixed(3) : "—"})
              </span>
              <span className={`badge ${parseFloat(netMargin) > 0 ? "badge-positive" : "badge-warning"}`}>
                Net: {parseFloat(netMargin) > 0 ? `+${netMargin}` : netMargin} PPG
              </span>
              <span className="badge font-mono">
                {player_cohort.length} Cohort Players
              </span>
            </div>
          </div>
          <div style={{ marginLeft: "auto" }}>
            <Link href="/teams" className="button button-small">
              ← All Teams
            </Link>
          </div>
        </div>

        {/* Disclaimer */}
        <div className="notice-box">
          <strong>Official Standings Rule:</strong> Ties in record ordering do not establish official conference placement. Team research reflects verified box score facts strictly prior to {beforeDate}.
        </div>

        {/* Production & Allowance Summary Grid */}
        <div className="grid-4" style={{ marginBottom: "1.25rem" }}>
          <div className="stat-card">
            <span className="stat-value font-mono">{ppg.toFixed(1)}</span>
            <span className="stat-label">Points Per Game</span>
            <span className="stat-subtext">Scoring production</span>
          </div>

          <div className="stat-card">
            <span className="stat-value font-mono">{oppPpg.toFixed(1)}</span>
            <span className="stat-label">Opponent PPG</span>
            <span className="stat-subtext">Defensive allowance</span>
          </div>

          <div className="stat-card">
            <span className="stat-value font-mono">
              {production.fg_pct !== null && production.fg_pct !== undefined ? `${(production.fg_pct * 100).toFixed(1)}%` : "—"}
            </span>
            <span className="stat-label">Field Goal %</span>
            <span className="stat-subtext">Summed makes / attempts</span>
          </div>

          <div className="stat-card">
            <span className="stat-value font-mono">
              {allowance.fg_pct_allowed !== null && allowance.fg_pct_allowed !== undefined ? `${(allowance.fg_pct_allowed * 100).toFixed(1)}%` : "—"}
            </span>
            <span className="stat-label">Opponent FG %</span>
            <span className="stat-subtext">Allowed shooting efficiency</span>
          </div>
        </div>

        {/* Flagship Demonstration 2: Season Participation Player Cohort */}
        <div className="panel">
          <div className="panel-header">
            <div>
              <h2 className="panel-title">{team.name} Season Participation Cohort</h2>
              <p className="text-muted text-xs" style={{ margin: "0.2rem 0 0" }}>
                All players with observed participation for {team.tricode} in {season} before {beforeDate}. Includes traded players with team-filtered stints.
              </p>
            </div>
            <span className="badge font-mono">{player_cohort.length} players</span>
          </div>

          <div className="table-wrapper">
            <table className="data-table">
              <thead>
                <tr>
                  <th style={{ width: "40px" }}>#</th>
                  <th>Player</th>
                  <th className="num">Stint Games</th>
                  <th className="num">Stint Minutes</th>
                  <th className="num">Stint Points</th>
                  <th className="num">PPG</th>
                  <th style={{ textAlign: "right" }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {player_cohort.map((p, idx) => (
                  <tr key={p.player_id}>
                    <td className="font-mono text-muted text-xs">{idx + 1}</td>
                    <td>
                      <div className="player-cell">
                        <PlayerPortrait playerId={p.player_id} name={p.player_name} size="sm" />
                        <Link
                          href={`/players/${p.player_id}?season=${season}&phase=${phase}&beforeDate=${beforeDate}`}
                          className="player-cell-name text-accent font-semibold"
                        >
                          {p.player_name}
                        </Link>
                      </div>
                    </td>
                    <td className="num font-mono">{p.games_played}</td>
                    <td className="num font-mono">{p.total_minutes !== undefined && p.total_minutes !== null ? p.total_minutes.toFixed(0) : "—"}</td>
                    <td className="num font-mono font-bold">{p.points ?? "—"}</td>
                    <td className="num font-mono font-semibold">
                      {p.points_per_game !== undefined && p.points_per_game !== null ? p.points_per_game.toFixed(1) : "—"}
                    </td>
                    <td style={{ textAlign: "right" }}>
                      <Link
                        href={`/players/${p.player_id}?season=${season}&phase=${phase}&beforeDate=${beforeDate}`}
                        className="button button-small button-primary"
                      >
                        Profile →
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Recent Games & Schedule Outcomes */}
        <div className="panel">
          <div className="panel-header">
            <div>
              <h2 className="panel-title">Completed Game Outcomes</h2>
              <p className="text-muted text-xs" style={{ margin: "0.2rem 0 0" }}>
                Two-sided validated game outcomes strictly prior to cutoff.
              </p>
            </div>
            <span className="badge font-mono">{recent_games?.length ?? 0} games</span>
          </div>

          <div className="table-wrapper">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Opponent</th>
                  <th>Side</th>
                  <th className="num">Team PTS</th>
                  <th className="num">Opp PTS</th>
                  <th className="num">Margin</th>
                  <th>Result</th>
                </tr>
              </thead>
              <tbody>
                {(recent_games ?? []).map((g) => {
                  const margin = g.team_points !== null && g.opponent_points !== null ? g.team_points - g.opponent_points : null;
                  return (
                    <tr key={g.game_id}>
                      <td className="font-mono">{g.game_date}</td>
                      <td>
                        <strong>{g.opponent_tricode}</strong>
                      </td>
                      <td>{g.side === "home" ? "Home" : "Away"}</td>
                      <td className="num font-mono font-bold">{g.team_points ?? "—"}</td>
                      <td className="num font-mono">{g.opponent_points ?? "—"}</td>
                      <td className={`num font-mono ${margin && margin > 0 ? "text-positive" : "text-negative"}`}>
                        {margin && margin > 0 ? `+${margin}` : margin ?? "—"}
                      </td>
                      <td>
                        <span className={`badge ${g.is_win ? "badge-positive" : "badge-warning"}`}>
                          {g.is_win ? "WIN" : "LOSS"}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </>
  );
}
