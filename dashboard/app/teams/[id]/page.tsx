import { PairedBars } from "@/components/charts";
import { AssistantPageSelection } from "@/lib/assistant-page-context";
import { resolveStatsQuery } from "@/lib/stats-query";
import { getWorkbenchCatalog } from "@/lib/workbench-api";
import type { Metadata } from "next";
import Link from "next/link";
import { ContextBar } from "@/components/context-bar";
import { TeamLogo } from "@/components/team-logo";
import { PageShell } from "@/components/ui/page-shell";
import { PageHeader } from "@/components/ui/panel";
import { TeamIdentity } from "@/components/ui/identity";
import { StatTile } from "@/components/ui/stat-tile";
import { GatedNote } from "@/components/ui/gated-note";
import { TeamProfileTabs } from "@/components/team-profile-tabs";
import type { CSSProperties } from "react";
import { teamAccent } from "@/lib/team-colors";
import { formatDate, throughLabel } from "@/lib/format-date";
import { ButtonLink } from "@/components/ui/kit";
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
  const contextParams = new URLSearchParams({ season, phase, beforeDate, ...(resolvedReleaseId ? { releaseId: resolvedReleaseId } : {}) });

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

  if (loadError || !detail) return <PageShell template="profile"><PageHeader title="Team Profile" /><GatedNote why={loadError || "Team not found in this release."} action={<ButtonLink size="lg" href="/teams">Return to all teams</ButtonLink>}>Team details are unavailable.</GatedNote></PageShell>;

  const { team, record, production, allowance, player_cohort, recent_games } = detail;
  const ppg = production.pts_per_game ?? null;
  const oppPpg = allowance.pts_allowed_per_game ?? null;
  const netMargin = ppg !== null && oppPpg !== null ? (ppg - oppPpg).toFixed(1) : null;
  const opponentFg = allowance.fg_pct_allowed ?? fourFactors?.shooting_percentages.opp_fg_pct ?? null;
  const opponentEfg = allowance.efg_pct_allowed ?? fourFactors?.defense_factors.find(f => f.key === "opp_efg_pct")?.value ?? null;
  const currentStreak = detail.current_streak || schedule?.overall_record?.current_streak;

  return (
    <PageShell template="profile" className="team-profile-page">
      <AssistantPageSelection route={`/teams/${team.id}`} teamIds={[team.id]} scope={detail.context} label={team.name} />
      <PageHeader title={team.name} subtitle={`${season} · ${phase.replaceAll("_", " ")} · ${throughLabel(beforeDate)}`} actions={<>
        <ButtonLink size="lg" href={`/team-compare?teamA=${team.id}&season=${season}&phase=${phase}&beforeDate=${beforeDate}&releaseId=${resolvedReleaseId || ""}`}>Compare Team</ButtonLink>
        <ButtonLink size="lg" href={`/teams?${contextParams}`} icon="left">All Teams</ButtonLink>
      </>} />
      <ContextBar catalog={catalog ?? undefined} initialReleaseId={resolvedReleaseId} initialSeason={season} initialPhase={phase} initialBeforeDate={beforeDate} showWindow={false} sampleSize={record.games_played}
        detailRows={[
          {label:"Franchise ID",value:team.id,mono:true},
          {label:"Resolved context",value:JSON.stringify(detail.context),mono:true},
          {label:"Source warnings",value:[...(detail.warnings ?? []),...(fourFactors?.warnings ?? []),...(schedule?.warnings ?? []),...(peers?.warnings ?? [])].join(" · ") || "None"}
        ]}
      />
      <TeamProfileTabs hero={<section className="team-profile-hero" style={{"--team-color":teamAccent(team.tricode) ?? "var(--color-accent)"} as CSSProperties} aria-label="Team summary">
        <section className="pc12-headline team-rating-headline" aria-label="Headline result">
          <PairedBars title={`${team.tricode} against the league`} source="CourtLens admitted team box scores · estimated possessions"
            sample={`${record.games_played} team games · ${season}`} names={[team.tricode, "League average"]}
            note="Amber = team, blue = league. Offensive rating measures scoring; defensive rating measures allowance. Descriptive, no overall verdict."
            rows={(fourFactors?.ratings ?? []).filter(f => ["off_rating", "def_rating", "net_rating"].includes(f.key)).map(f => ({key: f.key, label: f.display_name, a: f.value, b: f.league_avg, formattedA: f.value?.toFixed(1), formattedB: f.league_avg?.toFixed(1)}))} />
        </section>
        <TeamIdentity team={team.tricode} name={team.name} size="xl" subtitle={`${record.wins}W · ${record.losses}L${currentStreak ? ` · ${currentStreak}` : ""}`} />
        <div className="team-profile-tiles">
          <StatTile label="Points Per Game" value={ppg?.toFixed(1)} />
          <StatTile label="Opponent PPG" value={oppPpg?.toFixed(1)} />
          <StatTile label="Field Goal %" value={production.fg_pct != null ? `${(production.fg_pct * 100).toFixed(1)}%` : null} footnote={production.efg_pct != null ? `eFG ${(production.efg_pct * 100).toFixed(1)}%` : "eFG unknown"} />
          <StatTile label="Opponent FG %" value={opponentFg != null ? `${(opponentFg * 100).toFixed(1)}%` : null} footnote={opponentEfg != null ? `eFG ${(opponentEfg * 100).toFixed(1)}%` : "eFG unknown"} />
          <StatTile label="Net Margin" value={netMargin} />
          <StatTile label="Win Percentage" value={record.win_pct?.toFixed(3)} />
          <StatTile label="Offensive Rating" value={fourFactors?.off_rating?.toFixed(1)} />
          <StatTile label="Defensive Rating" value={fourFactors?.def_rating?.toFixed(1)} />
        </div>
      </section>}
      overview={<>
        <GatedNote why={<>Participation / Current-Roster Distinction: Player cohort reflects all athletes with observed on-court minutes for {team.tricode} in the selected period (including in-season trades). Ties in record ordering do not establish official conference placement.</>}>Observed participation is a season cohort, not a current roster.</GatedNote>
        {/* Flagship Demonstration 2: Season Participation Player Cohort */}
        <div className="panel mb-5">
          <div className="panel-header">
            <div>
              <h2 className="panel-title">{team.name} Season Participation Cohort</h2>
              <details className="team-method"><summary>Why?</summary><p>
                All players with observed participation for {team.tricode} in {season} before {beforeDate}. Includes traded players with team-filtered stints.
              </p></details>
            </div>
            <span className="badge font-mono">{player_cohort.length} players</span>
          </div>

          <div>
            <div className="table-wrapper" role="region" aria-label="Team analytical values" tabIndex={0}><table className="data-table">
              <thead>
                <tr>
                  <th className="col-idx num">#</th>
                  <th>Player</th>
                  <th className="num">Stint Games</th>
                  <th className="num">Stint Minutes</th>
                  <th className="num">PPG</th>
                  <th className="num">RPG</th>
                  <th className="num">APG</th>
                  <th className="text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {player_cohort.map((p, idx) => (
                  <tr key={p.player_id}>
                    <td className="num font-mono text-muted text-xs">{idx + 1}</td>
                    <td>
                      <div className="player-cell">
                        <TeamLogo team={team.tricode} size={20} />
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
                    <td className="num font-mono font-bold">{p.pts_per_game?.toFixed(1) ?? "—"}</td>
                    <td className="num font-mono">{p.reb_per_game?.toFixed(1) ?? "—"}</td>
                    <td className="num font-mono">{p.ast_per_game?.toFixed(1) ?? "—"}</td>
                    <td className="text-right">
                      <ButtonLink size="lg" variant="primary"
                        href={`/players/${p.player_id}?season=${season}&phase=${phase}&beforeDate=${beforeDate}&releaseId=${resolvedReleaseId || ""}` }>
                        Profile
                      </ButtonLink>
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
                <details className="team-method"><summary>Why?</summary><p>
                  Closest analytical cohorts determined by standardized Euclidean distance across Pace, Ratings, and Dean Oliver Four Factors.
                </p></details>
              </div>
              <span className="badge font-mono">{peers.peers.length} peers</span>
            </div>

            <div className="table-wrapper">
              <div className="table-wrapper" role="region" aria-label="Team analytical values" tabIndex={0}><table className="data-table">
                <thead>
                  <tr>
                    <th className="col-idx num">#</th>
                    <th>Peer Franchise</th>
                    <th className="num">Similarity Score</th>
                    <th className="num">Euclidean Distance</th>
                    <th className="text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {peers.peers.map((peer, pIdx) => (
                    <tr key={peer.team_id}>
                      <td className="num font-mono text-muted text-xs">{pIdx + 1}</td>
                      <td>
                        <div className="peer-cell">
                          <TeamLogo team={peer.tricode} size={20} /><span>{peer.tricode}</span>
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
                          <ButtonLink size="lg"
                            href={`/team-compare?teamA=${team.id}&teamB=${peer.team_id}&season=${season}&phase=${phase}&beforeDate=${beforeDate}&releaseId=${resolvedReleaseId || ""}` }>
                            Compare
                          </ButtonLink>
                          <ButtonLink size="lg" variant="primary"
                            href={`/teams/${peer.team_id}?season=${season}&phase=${phase}&beforeDate=${beforeDate}&releaseId=${resolvedReleaseId || ""}` }>
                            Profile
                          </ButtonLink>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table></div>
            </div>
          </div>
        )}


      </>}
      factors={<>
        {/* Block B15b: Dean Oliver Four Factors */}
        {fourFactors && (
          <div className="panel mb-5">
            <div className="panel-header">
              <div>
                <h2 className="panel-title">Dean Oliver Four Factors & Efficiency</h2>
                <details className="team-method"><summary>Why?</summary><p>
                  Four factors of basketball success: Shooting (40%), Turnovers (25%), Rebounding (20%), Free Throws (15%). Ranks out of {fourFactors.games_played > 0 ? "30" : "—"} NBA teams.
                </p></details>
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
                            League Avg: {lgAvgFormatted} · Weight: {factor.weight != null ? `${(factor.weight * 100).toFixed(0)}%` : "—"}
                          </div>
                        </div>
                        <div className="text-right">
                          <span className="font-mono font-bold text-base">{pctFormatted}</span>
                          <div className="factors-rank-badges">
                            <span className="badge badge-accent text-xs font-mono">{factor.rank != null ? `#${factor.rank}` : "—"}</span>
                            <span className="badge text-xs font-mono text-muted">{factor.percentile != null ? `${factor.percentile.toFixed(0)}%ile` : "—"}</span>
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
                            League Avg: {lgAvgFormatted} · Weight: {factor.weight != null ? `${(factor.weight * 100).toFixed(0)}%` : "—"}
                          </div>
                        </div>
                        <div className="text-right">
                          <span className="font-mono font-bold text-base">{pctFormatted}</span>
                          <div className="factors-rank-badges">
                            <span className="badge badge-accent text-xs font-mono">{factor.rank != null ? `#${factor.rank}` : "—"}</span>
                            <span className="badge text-xs font-mono text-muted">{factor.percentile != null ? `${factor.percentile.toFixed(0)}%ile` : "—"}</span>
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
                  <GatedNote why={fourFactors.three_point_scenario.disclaimer}>Hypothetical shooting scenario.</GatedNote>
                </div>
              </div>
            )}
          </div>
        )}


        {!fourFactors && <GatedNote action={<ButtonLink size="lg" href={`/teams/${team.id}?${contextParams}&tab=factors`}>Retry</ButtonLink>}>Four Factors are unavailable in this scope.</GatedNote>}
      </>}
      schedule={<>
        {/* Block B15a: Schedule & Rest Context Panel */}
        {schedule && (
          <div className="panel mb-5">
            <div className="panel-header">
              <div>
                <h2 className="panel-title">Schedule Context, Venue & Rest Splits</h2>
                <details className="team-method"><summary>Why?</summary><p>
                  Venue splits, rest day buckets (calendar difference minus 1 day), and back-to-back performance reconstructed strictly prior to cutoff.
                </p></details>
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

        {/* Completed Game Outcomes */}
        <div className="panel">
          <div className="panel-header">
            <div>
              <h2 className="panel-title">Completed Game Schedule & Outcomes</h2>
              <details className="team-method"><summary>Why?</summary><p>
                Chronological validated two-sided game outcomes strictly prior to cutoff.
              </p></details>
            </div>
            <span className="badge font-mono">
              {schedule?.games?.length ?? recent_games?.length ?? 0} games
            </span>
          </div>

          <div>
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
                      <td className="font-mono">{formatDate(g.game_date)}</td>
                      <td>
                        <span className="team-cell-identity"><TeamLogo team={g.opponent_tricode} size={20} /><strong>{g.opponent_tricode}</strong></span>
                      </td>
                      <td>{g.side === "home" ? "Home" : g.side === "away" ? "Away" : "—"}</td>
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
                          {isWin === true ? "WIN" : isWin === false ? "LOSS" : "—"}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table></div>
          </div>
        </div>

      </>}
      />
    </PageShell>
  );
}
