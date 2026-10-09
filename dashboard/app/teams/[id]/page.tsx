import { Icon } from "@/components/ui/icon";
import { AssistantPageSelection } from "@/lib/assistant-page-context";
import { resolveStatsQuery } from "@/lib/stats-query";
import { getWorkbenchCatalog } from "@/lib/workbench-api";
import type { Metadata } from "next";
import Link from "next/link";
import { ContextBar } from "@/components/context-bar";
import { TeamLogo } from "@/components/team-logo";
import { PlayerPortrait } from "@/components/player-portrait";
import {
  getTeamDetail,
  getTeamFourFactors,
  getTeamSchedule,
  getTeamPeers,
} from "@/lib/workbench-api";
import type {
  TeamDetailResponse,
  TeamFourFactorsResponse,
  TeamScheduleResponse,
  TeamPeersResponse,
} from "@/lib/types";

export const metadata: Metadata = { title: "Team Cohort, Four Factors & Schedule · CourtLens" };
export const dynamic = "force-dynamic";

interface TeamDetailPageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<{
    season?: string;
    phase?: string;
    beforeDate?: string;
    releaseId?: string;
    release_id?: string;
    before_date?: string;
  }>;
}

export default async function TeamDetailPage({
  params,
  searchParams,
}: TeamDetailPageProps) {
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const catalog = await getWorkbenchCatalog(sp.releaseId || sp.release_id).catch(() => null);
  const query = catalog ? resolveStatsQuery(sp, catalog, "per_game") : null;
  const season = query?.season || sp.season || "";
  const phase = query?.phase || sp.phase || "";
  const beforeDate = query?.before_date || sp.beforeDate || sp.before_date || "";
  const resolvedReleaseId = query?.release_id || sp.releaseId || sp.release_id;

  let detail: TeamDetailResponse | null = null;
  let fourFactors: TeamFourFactorsResponse | null = null;
  let schedule: TeamScheduleResponse | null = null;
  let peers: TeamPeersResponse | null = null;
  let loadError: string | null = null;

  try {
    const [detailRes, ffRes, schedRes, peersRes] = await Promise.allSettled([
      getTeamDetail(id, { season, phase, beforeDate, releaseId: resolvedReleaseId }),
      getTeamFourFactors(id, { season, phase, beforeDate, releaseId: resolvedReleaseId }),
      getTeamSchedule(id, { season, phase, beforeDate, releaseId: resolvedReleaseId }),
      getTeamPeers(id, { season, phase, beforeDate, releaseId: resolvedReleaseId, limit: 6 }),
    ]);

    if (detailRes.status === "fulfilled") {
      detail = detailRes.value;
    } else {
      loadError = detailRes.reason instanceof Error ? detailRes.reason.message : "Failed to load team details";
    }

    if (ffRes.status === "fulfilled") {
      fourFactors = ffRes.value;
    }

    if (schedRes.status === "fulfilled") {
      schedule = schedRes.value;
    }

    if (peersRes.status === "fulfilled") {
      peers = peersRes.value;
    }
  } catch (err) {
    loadError = err instanceof Error ? err.message : "Failed to load team data";
  }

  if (loadError || !detail) {
    return (
      <div className="workbench-content">
        <div className="notice-box notice-box-error">
          <strong>Error loading team:</strong> {loadError || "Team not found in this release."}
        </div>
        <Link href="/teams" className="button button-small">
          <Icon name="left" size={14} />Return to all teams
        </Link>
      </div>
    );
  }

  const { team, record, production, allowance, player_cohort, recent_games } = detail;
  const ppg = production.pts_per_game ?? 0;
  const oppPpg = allowance.pts_allowed_per_game ?? 0;
  const netMargin = (ppg - oppPpg).toFixed(1);
  const currentStreak = detail.current_streak || schedule?.overall_record?.current_streak;

  return (
    <>
      <AssistantPageSelection route={`/teams/${team.id}`} teamIds={[team.id]} scope={detail.context} label={team.name} />
      <ContextBar
        catalog={catalog ?? undefined}
        initialReleaseId={resolvedReleaseId}
        initialSeason={season}
        initialPhase={phase}
        initialBeforeDate={beforeDate}
        sampleSize={record?.games_played}
      />

      <div className="workbench-content">
        {/* Team Identity Header */}
        <div className="player-identity-card">
          <div className="callout-number team-badge-box">
            <TeamLogo team={team.tricode} size={48} />
          </div>
          <div className="player-identity-info">
            <span className="text-xs text-muted font-mono uppercase">
              NBA Franchise ID: {team.id} · {season} {phase.replaceAll("_", " ")}
            </span>
            <h1 className="player-identity-name">{team.name}</h1>
            <div className="player-identity-badges">
              <span className="badge badge-accent">
                {record.wins}W - {record.losses}L ({record.win_pct !== null ? record.win_pct.toFixed(3) : "—"})
              </span>
              <span className={`badge ${parseFloat(netMargin) > 0 ? "badge-positive" : "badge-warning"}`}>
                Net: {parseFloat(netMargin) > 0 ? `+${netMargin}` : netMargin} PPG
              </span>
              {currentStreak && (
                <span className={`badge ${currentStreak.startsWith("W") ? "badge-positive" : "badge-warning"}`}>
                  Streak: {currentStreak}
                </span>
              )}
              <span className="badge font-mono">
                {player_cohort.length} Cohort Players
              </span>
            </div>
          </div>
          <div className="team-header-actions">
            <Link
              href={`/team-compare?teamA=${team.id}&season=${season}&phase=${phase}&beforeDate=${beforeDate}&releaseId=${resolvedReleaseId || ""}` }
              className="button button-small button-accent"
            >
              Compare Franchise
            </Link>
            <Link href="/teams" className="button button-small">
              <Icon name="left" size={14} />All Teams
            </Link>
          </div>
        </div>

        {/* Disclaimer */}
        <div className="notice-box">
          <strong>Participation / Current-Roster Distinction:</strong> Player cohort reflects all athletes with observed on-court minutes for {team.tricode} prior to cutoff {beforeDate} (such as Toronto&apos;s 31-player cohort across in-season trades). Ties in record ordering do not establish official conference placement.
        </div>

        {/* Production & Allowance Summary Grid */}
        <div className="grid-4 mb-5">
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
              {production.fg_pct !== null && production.fg_pct !== undefined
                ? `${(production.fg_pct * 100).toFixed(1)}%`
                : "—"}
            </span>
            <span className="stat-label">Field Goal %</span>
            <span className="stat-subtext">
              eFG: {production.efg_pct ? `${(production.efg_pct * 100).toFixed(1)}%` : "—"}
            </span>
          </div>

          <div className="stat-card">
            <span className="stat-value font-mono">
              {allowance.fg_pct_allowed !== null && allowance.fg_pct_allowed !== undefined
                ? `${(allowance.fg_pct_allowed * 100).toFixed(1)}%`
                : "—"}
            </span>
            <span className="stat-label">Opponent FG %</span>
            <span className="stat-subtext">
              Opp eFG: {allowance.efg_pct_allowed ? `${(allowance.efg_pct_allowed * 100).toFixed(1)}%` : "—"}
            </span>
          </div>
        </div>

        {/* Block B15b: Dean Oliver Four Factors */}
        {fourFactors && (
          <div className="panel mb-5">
            <div className="panel-header">
              <div>
                <h2 className="panel-title">Dean Oliver Four Factors & Efficiency</h2>
                <p className="text-muted text-xs panel-subtitle-margin">
                  Four factors of basketball success: Shooting (40%), Turnovers (25%), Rebounding (20%), Free Throws (15%). Ranks out of {fourFactors.games_played > 0 ? "30" : "—"} NBA teams.
                </p>
              </div>
              <div className="header-badge-group">
                <span className="badge badge-accent font-mono">
                  PACE: {fourFactors.pace?.toFixed(1) ?? "—"}
                </span>
                <span className="badge font-mono">
                  ORTG: {fourFactors.off_rating?.toFixed(1) ?? "—"}
                </span>
                <span className="badge font-mono">
                  DRTG: {fourFactors.def_rating?.toFixed(1) ?? "—"}
                </span>
                <span className={`badge font-mono ${(fourFactors.net_rating ?? 0) >= 0 ? "badge-positive" : "badge-warning"}`}>
                  NET: {(fourFactors.net_rating ?? 0) > 0 ? `+${fourFactors.net_rating?.toFixed(1)}` : fourFactors.net_rating?.toFixed(1) ?? "—"}
                </span>
              </div>
            </div>

            <div className="responsive-pair factors-grid">
              {/* Offensive Four Factors */}
              <div className="factors-card">
                <h3 className="factors-heading">
                  Offensive Four Factors
                </h3>
                <div className="factors-list">
                  {fourFactors.offense_factors.map((factor) => {
                    const pctFormatted = factor.unit === "percentage" && factor.value != null
                      ? `${(factor.value * 100).toFixed(1)}%`
                      : factor.value?.toFixed(3) ?? "—";
                    const lgAvgFormatted = factor.unit === "percentage" && factor.league_avg != null
                      ? `${(factor.league_avg * 100).toFixed(1)}%`
                      : factor.league_avg?.toFixed(3) ?? "—";

                    return (
                      <div key={factor.key} className="factors-row">
                        <div>
                          <div className="factors-name">{factor.display_name}</div>
                          <div className="text-muted text-xs font-mono">
                            League Avg: {lgAvgFormatted} · Weight: {factor.weight ? `${(factor.weight * 100).toFixed(0)}%` : "—"}
                          </div>
                        </div>
                        <div className="text-right">
                          <span className="font-mono font-bold text-base">{pctFormatted}</span>
                          <div className="factors-rank-badges">
                            <span className="badge badge-accent text-xs font-mono">#{factor.rank ?? "—"}</span>
                            <span className="badge text-xs font-mono text-muted">{factor.percentile?.toFixed(0)}%ile</span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Defensive Four Factors */}
              <div className="factors-card">
                <h3 className="factors-heading">
                  Defensive Four Factors (Allowed)
                </h3>
                <div className="factors-list">
                  {fourFactors.defense_factors.map((factor) => {
                    const pctFormatted = factor.unit === "percentage" && factor.value != null
                      ? `${(factor.value * 100).toFixed(1)}%`
                      : factor.value?.toFixed(3) ?? "—";
                    const lgAvgFormatted = factor.unit === "percentage" && factor.league_avg != null
                      ? `${(factor.league_avg * 100).toFixed(1)}%`
                      : factor.league_avg?.toFixed(3) ?? "—";

                    return (
                      <div key={factor.key} className="factors-row">
                        <div>
                          <div className="factors-name">{factor.display_name}</div>
                          <div className="text-muted text-xs font-mono">
                            League Avg: {lgAvgFormatted} · Weight: {factor.weight ? `${(factor.weight * 100).toFixed(0)}%` : "—"}
                          </div>
                        </div>
                        <div className="text-right">
                          <span className="font-mono font-bold text-base">{pctFormatted}</span>
                          <div className="factors-rank-badges">
                            <span className="badge badge-accent text-xs font-mono">#{factor.rank ?? "—"}</span>
                            <span className="badge text-xs font-mono text-muted">{factor.percentile?.toFixed(0)}%ile</span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Feature F18: Three-Point Variation Scenario */}
            {fourFactors.three_point_scenario && (
              <div className="factors-scenario-wrapper">
                <div className="factors-scenario-card">
                  <div className="factors-scenario-header">
                    <div className="factors-scenario-title">
                      <span className="badge badge-accent">F18</span>
                      <strong className="text-sm">Three-Point Variation What-If Scenario</strong>
                    </div>
                    <span className="text-muted text-xs font-mono">
                      Observed: {(fourFactors.three_point_scenario.observed_3p_pct * 100).toFixed(1)}% vs League: {(fourFactors.three_point_scenario.league_3p_pct * 100).toFixed(1)}%
                    </span>
                  </div>
                  <div className="factors-scenario-metrics">
                    <div>
                      <span className="text-muted text-xs">Delta Points: </span>
                      <strong className={fourFactors.three_point_scenario.delta_points >= 0 ? "text-positive" : "text-negative"}>
                        {fourFactors.three_point_scenario.delta_points >= 0 ? `+${fourFactors.three_point_scenario.delta_points}` : fourFactors.three_point_scenario.delta_points} PTS
                      </strong>
                    </div>
                    <div>
                      <span className="text-muted text-xs">Expected PPG: </span>
                      <strong>{fourFactors.three_point_scenario.hypothetical_ppg.toFixed(1)} PPG</strong>
                    </div>
                    <div>
                      <span className="text-muted text-xs">ORTG Impact: </span>
                      <strong className={(fourFactors.three_point_scenario.delta_off_rating ?? 0) >= 0 ? "text-positive" : "text-negative"}>
                        {(fourFactors.three_point_scenario.delta_off_rating ?? 0) >= 0 ? `+${fourFactors.three_point_scenario.delta_off_rating}` : fourFactors.three_point_scenario.delta_off_rating}
                      </strong>
                    </div>
                    <div>
                      <span className="text-muted text-xs">Net Rating Shift: </span>
                      <strong className={(fourFactors.three_point_scenario.delta_net_rating ?? 0) >= 0 ? "text-positive" : "text-negative"}>
                        {(fourFactors.three_point_scenario.delta_net_rating ?? 0) >= 0 ? `+${fourFactors.three_point_scenario.delta_net_rating}` : fourFactors.three_point_scenario.delta_net_rating}
                      </strong>
                    </div>
                  </div>
                  <p className="text-muted text-xs factors-scenario-disclaimer">
                    {fourFactors.three_point_scenario.disclaimer}
                  </p>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Block B15a: Schedule & Rest Context Panel */}
        {schedule && (
          <div className="panel mb-5">
            <div className="panel-header">
              <div>
                <h2 className="panel-title">Schedule Context, Venue & Rest Splits</h2>
                <p className="text-muted text-xs panel-subtitle-margin">
                  Venue splits, rest day buckets (calendar difference minus 1 day), and back-to-back performance reconstructed strictly prior to cutoff.
                </p>
              </div>
              <div className="header-badge-group">
                <span className="badge font-mono">
                  Homestand: {schedule.longest_homestand} games
                </span>
                <span className="badge font-mono">
                  Road Trip: {schedule.longest_road_trip} games
                </span>
              </div>
            </div>

            <div className="responsive-pair factors-grid">
              {/* Venue Splits */}
              <div>
                <h3 className="factors-heading mb-2">
                  Venue Splits
                </h3>
                <div className="table-wrapper" role="region" aria-label="Team analytical values" tabIndex={0}><table className="data-table">
                  <thead>
                    <tr>
                      <th>Venue</th>
                      <th className="num">GP</th>
                      <th className="num">W-L</th>
                      <th className="num">Win%</th>
                      <th className="num">PPG</th>
                      <th className="num">Opp PPG</th>
                      <th className="num">Diff</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td><strong>Home</strong></td>
                      <td className="num font-mono">{schedule.home_split.games_played}</td>
                      <td className="num font-mono">{schedule.home_split.wins}-{schedule.home_split.losses}</td>
                      <td className="num font-mono">{schedule.home_split.win_pct?.toFixed(3) ?? "—"}</td>
                      <td className="num font-mono">{schedule.home_split.ppg?.toFixed(1) ?? "—"}</td>
                      <td className="num font-mono">{schedule.home_split.opp_ppg?.toFixed(1) ?? "—"}</td>
                      <td className={`num font-mono ${schedule.home_split.differential > 0 ? "text-positive" : "text-negative"}`}>
                        {schedule.home_split.differential > 0 ? `+${schedule.home_split.differential.toFixed(1)}` : schedule.home_split.differential.toFixed(1)}
                      </td>
                    </tr>
                    <tr>
                      <td><strong>Away</strong></td>
                      <td className="num font-mono">{schedule.away_split.games_played}</td>
                      <td className="num font-mono">{schedule.away_split.wins}-{schedule.away_split.losses}</td>
                      <td className="num font-mono">{schedule.away_split.win_pct?.toFixed(3) ?? "—"}</td>
                      <td className="num font-mono">{schedule.away_split.ppg?.toFixed(1) ?? "—"}</td>
                      <td className="num font-mono">{schedule.away_split.opp_ppg?.toFixed(1) ?? "—"}</td>
                      <td className={`num font-mono ${schedule.away_split.differential > 0 ? "text-positive" : "text-negative"}`}>
                        {schedule.away_split.differential > 0 ? `+${schedule.away_split.differential.toFixed(1)}` : schedule.away_split.differential.toFixed(1)}
                      </td>
                    </tr>
                  </tbody>
                </table></div>
              </div>

              {/* Rest Splits & Back-to-Backs */}
              <div>
                <h3 className="factors-heading mb-2">
                  Rest Day Splits
                </h3>
                <div className="table-wrapper" role="region" aria-label="Team analytical values" tabIndex={0}><table className="data-table">
                  <thead>
                    <tr>
                      <th>Rest Bucket</th>
                      <th className="num">GP</th>
                      <th className="num">W-L</th>
                      <th className="num">Win%</th>
                      <th className="num">Margin</th>
                    </tr>
                  </thead>
                  <tbody>
                    {schedule.rest_splits.map((rs) => (
                      <tr key={rs.bucket_key}>
                        <td>
                          <strong>{rs.bucket_label}</strong>
                          {rs.bucket_key === "0_days_rest" && <span className="badge badge-warning text-xs ml-1">B2B</span>}
                        </td>
                        <td className="num font-mono">{rs.games_played}</td>
                        <td className="num font-mono">{rs.wins}-{rs.losses}</td>
                        <td className="num font-mono">{rs.win_pct?.toFixed(3) ?? "—"}</td>
                        <td className={`num font-mono ${rs.differential > 0 ? "text-positive" : "text-negative"}`}>
                          {rs.differential > 0 ? `+${rs.differential.toFixed(1)}` : rs.differential.toFixed(1)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table></div>
              </div>
            </div>
          </div>
        )}

        {/* Flagship Demonstration 2: Season Participation Player Cohort */}
        <div className="panel mb-5">
          <div className="panel-header">
            <div>
              <h2 className="panel-title">{team.name} Season Participation Cohort</h2>
              <p className="text-muted text-xs panel-subtitle-margin">
                All players with observed participation for {team.tricode} in {season} before {beforeDate}. Includes traded players with team-filtered stints.
              </p>
            </div>
            <span className="badge font-mono">{player_cohort.length} players</span>
          </div>

          <div className="table-wrapper">
            <div className="table-wrapper" role="region" aria-label="Team analytical values" tabIndex={0}><table className="data-table">
              <thead>
                <tr>
                  <th className="col-idx">#</th>
                  <th>Player</th>
                  <th className="num">Stint Games</th>
                  <th className="num">Stint Minutes</th>
                  <th className="num">Stint Points</th>
                  <th className="num">PPG</th>
                  <th className="text-right">Actions</th>
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
                          href={`/players/${p.player_id}?season=${season}&phase=${phase}&beforeDate=${beforeDate}&releaseId=${resolvedReleaseId || ""}` }
                          className="player-cell-name text-accent font-semibold"
                        >
                          {p.player_name}
                        </Link>
                      </div>
                    </td>
                    <td className="num font-mono">{p.games_played}</td>
                    <td className="num font-mono">
                      {p.total_minutes !== undefined && p.total_minutes !== null ? p.total_minutes.toFixed(0) : "—"}
                    </td>
                    <td className="num font-mono font-bold">{p.points ?? "—"}</td>
                    <td className="num font-mono font-semibold">
                      {p.points_per_game !== undefined && p.points_per_game !== null ? p.points_per_game.toFixed(1) : "—"}
                    </td>
                    <td className="text-right">
                      <Link
                        href={`/players/${p.player_id}?season=${season}&phase=${phase}&beforeDate=${beforeDate}&releaseId=${resolvedReleaseId || ""}` }
                        className="button button-small button-primary"
                      >
                        Profile
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table></div>
          </div>
        </div>

        {/* Statistical Team Peers Panel */}
        {peers && peers.peers && peers.peers.length > 0 && (
          <div className="panel mb-5">
            <div className="panel-header">
              <div>
                <h2 className="panel-title">{team.name} Statistical Team Peers</h2>
                <p className="text-muted text-xs panel-subtitle-margin">
                  Closest analytical cohorts determined by standardized Euclidean distance across Pace, Ratings, and Dean Oliver Four Factors.
                </p>
              </div>
              <span className="badge font-mono">{peers.peers.length} peers</span>
            </div>

            <div className="table-wrapper">
              <div className="table-wrapper" role="region" aria-label="Team analytical values" tabIndex={0}><table className="data-table">
                <thead>
                  <tr>
                    <th className="col-idx">#</th>
                    <th>Peer Franchise</th>
                    <th className="num">Similarity Score</th>
                    <th className="num">Euclidean Distance</th>
                    <th className="text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {peers.peers.map((peer, pIdx) => (
                    <tr key={peer.team_id}>
                      <td className="font-mono text-muted text-xs">{pIdx + 1}</td>
                      <td>
                        <div className="peer-cell">
                          <span className="font-mono font-bold text-accent peer-tricode-badge">
                            {peer.tricode}
                          </span>
                          <Link
                            href={`/teams/${peer.team_id}?season=${season}&phase=${phase}&beforeDate=${beforeDate}&releaseId=${resolvedReleaseId || ""}` }
                            className="font-semibold text-accent"
                          >
                            {peer.name}
                          </Link>
                          {peer.conference && (
                            <span className="text-muted text-xs">({peer.conference})</span>
                          )}
                        </div>
                      </td>
                      <td className="num font-mono font-bold">{(peer.similarity_score * 100).toFixed(1)}%</td>
                      <td className="num font-mono text-muted">{peer.distance.toFixed(3)}</td>
                      <td className="text-right whitespace-nowrap">
                        <div className="table-actions-group">
                          <Link
                            href={`/team-compare?teamA=${team.id}&teamB=${peer.team_id}&season=${season}&phase=${phase}&beforeDate=${beforeDate}&releaseId=${resolvedReleaseId || ""}` }
                            className="button button-small"
                          >
                            Compare
                          </Link>
                          <Link
                            href={`/teams/${peer.team_id}?season=${season}&phase=${phase}&beforeDate=${beforeDate}&releaseId=${resolvedReleaseId || ""}` }
                            className="button button-small button-primary"
                          >
                            Profile
                          </Link>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table></div>
            </div>
          </div>
        )}

        {/* Completed Game Outcomes */}
        <div className="panel">
          <div className="panel-header">
            <div>
              <h2 className="panel-title">Completed Game Schedule & Outcomes</h2>
              <p className="text-muted text-xs panel-subtitle-margin">
                Chronological validated two-sided game outcomes strictly prior to cutoff.
              </p>
            </div>
            <span className="badge font-mono">
              {schedule?.games?.length ?? recent_games?.length ?? 0} games
            </span>
          </div>

          <div className="table-wrapper">
            <div className="table-wrapper" role="region" aria-label="Team analytical values" tabIndex={0}><table className="data-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Opponent</th>
                  <th>Side</th>
                  <th>Rest / B2B</th>
                  <th className="num">Team PTS</th>
                  <th className="num">Opp PTS</th>
                  <th className="num">Margin</th>
                  <th>Streak</th>
                  <th>Result</th>
                </tr>
              </thead>
              <tbody>
                {(schedule?.games ?? recent_games ?? []).map((g) => {
                  const pts = g.team_points;
                  const oppPts = g.opponent_points;
                  const margin = pts !== null && oppPts !== null && pts !== undefined && oppPts !== undefined
                    ? pts - oppPts
                    : null;
                  const isWin = g.is_win;

                  return (
                    <tr key={g.game_id}>
                      <td className="font-mono">{g.game_date}</td>
                      <td>
                        <strong>{g.opponent_tricode}</strong>
                      </td>
                      <td>{g.side === "home" ? "Home" : "Away"}</td>
                      <td>
                        {"rest_days" in g && g.rest_days !== undefined && g.rest_days !== null ? (
                          g.rest_days === 0 ? (
                            <span className="badge badge-warning text-xs">B2B (0d)</span>
                          ) : (
                            <span className="text-xs text-muted font-mono">{g.rest_days}d rest</span>
                          )
                        ) : (
                          <span className="text-xs text-muted font-mono">Opener</span>
                        )}
                      </td>
                      <td className="num font-mono font-bold">{pts ?? "—"}</td>
                      <td className="num font-mono">{oppPts ?? "—"}</td>
                      <td className={`num font-mono ${margin && margin > 0 ? "text-positive" : "text-negative"}`}>
                        {margin && margin > 0 ? `+${margin}` : margin ?? "—"}
                      </td>
                      <td className="font-mono text-xs">
                        {"streak" in g && g.streak ? (
                          <span className={g.streak.startsWith("W") ? "text-positive" : "text-negative"}>
                            {g.streak}
                          </span>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td>
                        <span className={`badge ${isWin ? "badge-positive" : "badge-warning"}`}>
                          {isWin ? "WIN" : "LOSS"}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table></div>
          </div>
        </div>
      </div>
    </>
  );
}
