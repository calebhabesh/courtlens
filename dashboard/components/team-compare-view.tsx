"use client";

import { Icon } from "./ui/icon";
import { EntityField } from "./entity-picker";
import { useSearchParams } from "next/navigation";
import { buildPreservedContextUrl } from "@/lib/query-url";

import { useState, useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { PlayerPortrait } from "./player-portrait";
import type {
  TeamDetailResponse,
  TeamFourFactorsResponse,
  TeamScheduleResponse,
  TeamPeersResponse,
  TeamResearchItem,
} from "@/lib/types";

interface TeamCompareViewProps {
  teamsList: TeamResearchItem[];
  teamAId: string;
  teamBId: string;
  teamADetail: TeamDetailResponse | null;
  teamAFourFactors: TeamFourFactorsResponse | null;
  teamASchedule: TeamScheduleResponse | null;
  teamAPeers: TeamPeersResponse | null;
  teamBDetail: TeamDetailResponse | null;
  teamBFourFactors: TeamFourFactorsResponse | null;
  teamBSchedule: TeamScheduleResponse | null;
  teamBPeers: TeamPeersResponse | null;
  season: string;
  phase: string;
  beforeDate: string;
}

export function TeamCompareView({
  teamAId,
  teamBId,
  teamADetail,
  teamAFourFactors,
  teamASchedule,
  teamAPeers,
  teamBDetail,
  teamBFourFactors,
  teamBSchedule,
  teamBPeers,
  season,
  phase,
  beforeDate,
}: TeamCompareViewProps) {
  const router = useRouter();

  // Selected teams
  const searchParams = useSearchParams();
  const releaseId = searchParams.get("releaseId") ?? searchParams.get("release_id") ?? String(teamADetail?.context.release_id ?? "");
  const [selectedA, setSelectedA] = useState(teamAId);
  const [selectedB, setSelectedB] = useState(teamBId);
  const initialKey = JSON.stringify([teamAId,teamBId]);
  const [previousInitial,setPreviousInitial] = useState(initialKey);
  if(initialKey !== previousInitial) {setPreviousInitial(initialKey);setSelectedA(teamAId);setSelectedB(teamBId);}

  // F18 Three-point variation scenario sliders (0% = observed, 100% = full regression to league avg)
  const [regressionPctA, setRegressionPctA] = useState<number>(100);
  const [regressionPctB, setRegressionPctB] = useState<number>(100);

  // Active section tab
  const [activeTab, setActiveTab] = useState<"overview" | "factors" | "three_point" | "roster" | "peers">("overview");

  // Navigation on team select
  const handleTeamChange = (newA: string, newB: string) => {
    setSelectedA(newA);
    setSelectedB(newB);
    if(newA && newB && newA !== newB) router.push(buildPreservedContextUrl(`/team-compare?teamA=${newA}&teamB=${newB}&season=${season}&phase=${phase}&beforeDate=${beforeDate}&releaseId=${releaseId}`,searchParams));
  };

  const handleSwap = () => {
    handleTeamChange(selectedB, selectedA);
  };

  // Find head-to-head completed games
  const headToHeadGames = useMemo(() => {
    if (!teamASchedule?.games || !teamBDetail?.team) return [];
    const bId = teamBDetail.team.id;
    const bTri = teamBDetail.team.tricode;

    return teamASchedule.games.filter(
      (g) => g.opponent_id === bId || g.opponent_tricode === bTri
    );
  }, [teamASchedule, teamBDetail]);

  const h2hRecord = useMemo(() => {
    let aWins = 0;
    let bWins = 0;
    let aPtsTotal = 0;
    let bPtsTotal = 0;

    for (const g of headToHeadGames) {
      if (g.is_win === true) aWins++;
      else if (g.is_win === false) bWins++;

      if (g.team_points != null && g.opponent_points != null) {
        aPtsTotal += g.team_points;
        bPtsTotal += g.opponent_points;
      }
    }

    const totalGames = aWins + bWins;
    const avgMargin = totalGames > 0 ? (aPtsTotal - bPtsTotal) / totalGames : 0;

    return { aWins, bWins, totalGames, avgMargin };
  }, [headToHeadGames]);

  // Three point scenario dynamic calculations
  const calculate3PScenario = (
    factors: TeamFourFactorsResponse | null,
    pctRegression: number
  ) => {
    if (!factors?.three_point_scenario) return null;
    const s = factors.three_point_scenario;
    const regFraction = pctRegression / 100;
    const target3pPct = s.observed_3p_pct + regFraction * (s.league_3p_pct - s.observed_3p_pct);
    const hypothetical3pm = target3pPct * s.observed_fg3a;
    const deltaPoints = Math.round((hypothetical3pm - s.observed_fg3m) * 3);
    const gp = factors.games_played || 1;
    const hypotheticalPpg = (s.actual_ppg * gp + deltaPoints) / gp;
    const poss = (factors.pace ? (factors.pace * (gp * 48)) / 48 : 0) || gp * 100;
    const deltaOffRating = poss > 0 ? (deltaPoints * 100) / poss : 0;

    return {
      target3pPct,
      hypothetical3pm,
      deltaPoints,
      hypotheticalPpg,
      deltaOffRating,
      hypotheticalOffRating: (factors.off_rating ?? 110) + deltaOffRating,
    };
  };

  const scenarioA = useMemo(
    () => calculate3PScenario(teamAFourFactors, regressionPctA),
    [teamAFourFactors, regressionPctA]
  );
  const scenarioB = useMemo(
    () => calculate3PScenario(teamBFourFactors, regressionPctB),
    [teamBFourFactors, regressionPctB]
  );

  return (
    <div className="team-compare-container">
      {/* Team Selection Header Bar */}
      <div className="panel team-compare-toolbar">
        <div className="team-comparison-selectors">
          {/* Team A Select */}
          <div className="team-compare-selector-col">
            <label className="text-xs text-muted font-mono team-compare-label">
              TEAM A
            </label>
<EntityField label="Team A" kind="team" value={selectedA} releaseId={releaseId} season={season} phase={phase} beforeDate={beforeDate} excludedIds={[selectedB]} onChange={id=>handleTeamChange(id,selectedB)} />
          </div>

          {/* Swap Button */}
          <button
            type="button"
            className="button button-small team-compare-swap-btn"
            onClick={handleSwap}
            title="Swap Teams"
          >
            <Icon name="swap" size={14} />Swap
          </button>

          {/* Team B Select */}
          <div className="team-compare-selector-col">
            <label className="text-xs text-muted font-mono team-compare-label">
              TEAM B
            </label>
<EntityField label="Team B" kind="team" value={selectedB} releaseId={releaseId} season={season} phase={phase} beforeDate={beforeDate} excludedIds={[selectedA]} onChange={id=>handleTeamChange(selectedA,id)} />
          </div>
        </div>

        {/* Section Tabs */}
        <div className="button-group" role="group" aria-label="Comparison tabs">
          <button
            type="button"
            className={`button button-small ${activeTab === "overview" ? "button-primary" : ""}`}
            onClick={() => setActiveTab("overview")}
          >
            Overview & H2H
          </button>
          <button
            type="button"
            className={`button button-small ${activeTab === "factors" ? "button-primary" : ""}`}
            onClick={() => setActiveTab("factors")}
          >
            Four Factors
          </button>
          <button
            type="button"
            className={`button button-small ${activeTab === "three_point" ? "button-primary" : ""}`}
            onClick={() => setActiveTab("three_point")}
          >
            3P variation
          </button>
          <button
            type="button"
            className={`button button-small ${activeTab === "roster" ? "button-primary" : ""}`}
            onClick={() => setActiveTab("roster")}
          >
            Participation Cohorts
          </button>
          <button
            type="button"
            className={`button button-small ${activeTab === "peers" ? "button-primary" : ""}`}
            onClick={() => setActiveTab("peers")}
          >
            Similar Peers
          </button>
        </div>
      </div>

      {/* Zero Inferred Claims & Standings Guardrails */}
      <div className="responsive-pair team-compare-guardrails">
        <div className="notice-box team-compare-notice-left">
          <strong>Official Standings Notice:</strong> Ties in record ordering do not establish official conference placement. Standings reflect verified box scores strictly prior to {beforeDate}.
        </div>
        <div className="notice-box team-compare-notice-right">
          <strong>Zero Inferred Claims:</strong> CourtLens never invents a &ldquo;winner probability&rdquo; or automated matchup prediction from overlapping prediction intervals or descriptive differences.
        </div>
      </div>

      {/* Head-to-Head Banner */}
      <div className="panel team-compare-h2h-panel">
        <div className="team-compare-h2h-header">
          <div>
            <h2 className="team-compare-h2h-title">
              Head-to-Head Series & Matchup History
            </h2>
            <p className="text-muted text-xs team-compare-h2h-subtitle">
              Completed head-to-head encounters between {teamADetail?.team.tricode ?? "Team A"} and {teamBDetail?.team.tricode ?? "Team B"} strictly before cutoff.
            </p>
          </div>
          <div className="text-right">
            {h2hRecord.totalGames > 0 ? (
              <span className="badge badge-accent font-mono team-compare-h2h-badge">
                {h2hRecord.aWins > h2hRecord.bWins
                  ? `${teamADetail?.team.tricode} leads ${h2hRecord.aWins}-${h2hRecord.bWins}`
                  : h2hRecord.bWins > h2hRecord.aWins
                  ? `${teamBDetail?.team.tricode} leads ${h2hRecord.bWins}-${h2hRecord.aWins}`
                  : `Series Tied ${h2hRecord.aWins}-${h2hRecord.bWins}`}
                {" "}({h2hRecord.avgMargin > 0 ? `+${h2hRecord.avgMargin.toFixed(1)}` : h2hRecord.avgMargin.toFixed(1)} avg margin)
              </span>
            ) : (
              <span className="badge text-muted font-mono text-xs">
                0 Head-to-Head matchups observed before cutoff
              </span>
            )}
          </div>
        </div>

        {headToHeadGames.length > 0 ? (
          <div className="team-compare-h2h-grid">
            {headToHeadGames.map((g) => {
              const aPts = g.team_points;
              const bPts = g.opponent_points;
              const isWin = g.is_win;
              return (
                <div
                  key={g.game_id}
                  className="team-compare-h2h-card"
                >
                  <div className="team-compare-h2h-card-header">
                    <span className="font-mono text-muted">{g.game_date}</span>
                    <span className="badge font-mono text-xs">{g.side === "home" ? "Team A Home" : "Team A Away"}</span>
                  </div>
                  <div className="team-compare-h2h-score-row">
                    <div className="team-compare-h2h-score-item">
                      <strong className="text-accent">{teamADetail?.team.tricode}</strong>
                      <span className="font-mono font-bold text-lg">{aPts ?? "—"}</span>
                    </div>
                    <span className="text-muted text-xs">vs</span>
                    <div className="team-compare-h2h-score-item">
                      <span className="font-mono font-bold text-lg">{bPts ?? "—"}</span>
                      <strong className="text-accent">{teamBDetail?.team.tricode}</strong>
                    </div>
                  </div>
                  <div className="team-compare-h2h-footer">
                    <span className="text-muted">
                      Margin: {aPts != null && bPts != null ? (aPts > bPts ? `+${aPts - bPts}` : `${aPts - bPts}`) : "—"}
                    </span>
                    <span className={`badge ${isWin ? "badge-positive" : "badge-warning"}`}>
                      {isWin ? `${teamADetail?.team.tricode} WIN` : `${teamBDetail?.team.tricode} WIN`}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="text-muted text-sm team-compare-h2h-empty">
            No verified two-sided head-to-head games were recorded prior to {beforeDate} for this season and phase.
          </div>
        )}
      </div>

      {/* TAB 1: OVERVIEW & ALIGNED RECORDS */}
      {activeTab === "overview" && (
        <div className="team-compare-stack">
          {/* Side by Side Franchise Headers */}
          <div className="responsive-pair team-compare-pair-grid">
            {/* Team A Card */}
            <div className="panel team-compare-card-a">
              <div className="team-compare-card-header">
                <div>
                  <span className="font-mono font-bold text-accent team-compare-card-tricode-a">
                    {teamADetail?.team.tricode}
                  </span>
                  <h3 className="team-compare-card-name">
                    {teamADetail?.team.name}
                  </h3>
                  <div className="text-xs text-muted font-mono team-compare-card-id">
                    NBA Franchise ID: {teamADetail?.team.id}
                  </div>
                </div>
                <div className="text-right">
                  <div className="font-mono font-bold text-2xl">
                    {teamADetail?.record.wins}-{teamADetail?.record.losses}
                  </div>
                  <div className="text-muted text-xs font-mono">
                    Win%: {teamADetail?.record.win_pct != null ? teamADetail.record.win_pct.toFixed(3) : "—"}
                  </div>
                </div>
              </div>

              <div className="responsive-pair team-compare-card-stats-grid">
                <div className="stat-card team-compare-stat-card">
                  <span className="stat-value font-mono team-compare-stat-val">
                    {teamADetail?.production.pts_per_game?.toFixed(1) ?? "—"}
                  </span>
                  <span className="stat-label">PPG Scored</span>
                </div>
                <div className="stat-card team-compare-stat-card">
                  <span className="stat-value font-mono team-compare-stat-val">
                    {teamADetail?.allowance.pts_allowed_per_game?.toFixed(1) ?? "—"}
                  </span>
                  <span className="stat-label">Opponent PPG</span>
                </div>
              </div>

              <div className="team-compare-card-splits">
                <div className="team-compare-card-split-row">
                  <span className="text-muted">Home Record:</span>
                  <span className="font-mono">
                    {teamASchedule?.home_split.wins}-{teamASchedule?.home_split.losses} ({teamASchedule?.home_split.win_pct?.toFixed(3) ?? "—"})
                  </span>
                </div>
                <div className="team-compare-card-split-row">
                  <span className="text-muted">Away Record:</span>
                  <span className="font-mono">
                    {teamASchedule?.away_split.wins}-{teamASchedule?.away_split.losses} ({teamASchedule?.away_split.win_pct?.toFixed(3) ?? "—"})
                  </span>
                </div>
                <div className="team-compare-card-split-row">
                  <span className="text-muted">Streak:</span>
                  <span className="font-mono">{teamADetail?.current_streak ?? "—"}</span>
                </div>
              </div>
            </div>

            {/* Team B Card */}
            <div className="panel team-compare-card-b">
              <div className="team-compare-card-header">
                <div>
                  <span className="font-mono font-bold text-positive team-compare-card-tricode-b">
                    {teamBDetail?.team.tricode}
                  </span>
                  <h3 className="team-compare-card-name">
                    {teamBDetail?.team.name}
                  </h3>
                  <div className="text-xs text-muted font-mono team-compare-card-id">
                    NBA Franchise ID: {teamBDetail?.team.id}
                  </div>
                </div>
                <div className="text-right">
                  <div className="font-mono font-bold text-2xl">
                    {teamBDetail?.record.wins}-{teamBDetail?.record.losses}
                  </div>
                  <div className="text-muted text-xs font-mono">
                    Win%: {teamBDetail?.record.win_pct != null ? teamBDetail.record.win_pct.toFixed(3) : "—"}
                  </div>
                </div>
              </div>

              <div className="responsive-pair team-compare-card-stats-grid">
                <div className="stat-card team-compare-stat-card">
                  <span className="stat-value font-mono team-compare-stat-val">
                    {teamBDetail?.production.pts_per_game?.toFixed(1) ?? "—"}
                  </span>
                  <span className="stat-label">PPG Scored</span>
                </div>
                <div className="stat-card team-compare-stat-card">
                  <span className="stat-value font-mono team-compare-stat-val">
                    {teamBDetail?.allowance.pts_allowed_per_game?.toFixed(1) ?? "—"}
                  </span>
                  <span className="stat-label">Opponent PPG</span>
                </div>
              </div>

              <div className="team-compare-card-splits">
                <div className="team-compare-card-split-row">
                  <span className="text-muted">Home Record:</span>
                  <span className="font-mono">
                    {teamBSchedule?.home_split.wins}-{teamBSchedule?.home_split.losses} ({teamBSchedule?.home_split.win_pct?.toFixed(3) ?? "—"})
                  </span>
                </div>
                <div className="team-compare-card-split-row">
                  <span className="text-muted">Away Record:</span>
                  <span className="font-mono">
                    {teamBSchedule?.away_split.wins}-{teamBSchedule?.away_split.losses} ({teamBSchedule?.away_split.win_pct?.toFixed(3) ?? "—"})
                  </span>
                </div>
                <div className="team-compare-card-split-row">
                  <span className="text-muted">Streak:</span>
                  <span className="font-mono">{teamBDetail?.current_streak ?? "—"}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Aligned Descriptive Metrics Comparison Table */}
          <div className="panel">
            <div className="panel-header team-compare-table-header">
              <h3 className="team-compare-table-title">
                Descriptive Statistical Comparison
              </h3>
            </div>
            <div className="table-wrapper">
              <table className="data-table">
                <thead>
                  <tr>
                    <th className="team-compare-th-metric">Metric</th>
                    <th className="num team-compare-th-teama">
                      {teamADetail?.team.tricode}
                    </th>
                    <th className="num team-compare-th-teamb">
                      {teamBDetail?.team.tricode}
                    </th>
                    <th className="num team-compare-th-diff">
                      Difference
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {[
                    {
                      label: "Games Played",
                      valA: teamADetail?.record.games_played ?? 0,
                      valB: teamBDetail?.record.games_played ?? 0,
                      fmt: (v: number) => v.toString(),
                    },
                    {
                      label: "Wins",
                      valA: teamADetail?.record.wins ?? 0,
                      valB: teamBDetail?.record.wins ?? 0,
                      fmt: (v: number) => v.toString(),
                    },
                    {
                      label: "Win Percentage",
                      valA: teamADetail?.record.win_pct ?? 0,
                      valB: teamBDetail?.record.win_pct ?? 0,
                      fmt: (v: number) => v.toFixed(3),
                    },
                    {
                      label: "Points Per Game",
                      valA: teamADetail?.production.pts_per_game ?? 0,
                      valB: teamBDetail?.production.pts_per_game ?? 0,
                      fmt: (v: number) => v.toFixed(1),
                    },
                    {
                      label: "Opponent PPG Allowed",
                      valA: teamADetail?.allowance.pts_allowed_per_game ?? 0,
                      valB: teamBDetail?.allowance.pts_allowed_per_game ?? 0,
                      fmt: (v: number) => v.toFixed(1),
                      invertDiff: true, // lower is better
                    },
                    {
                      label: "Net Scoring Margin",
                      valA: (teamADetail?.production.pts_per_game ?? 0) - (teamADetail?.allowance.pts_allowed_per_game ?? 0),
                      valB: (teamBDetail?.production.pts_per_game ?? 0) - (teamBDetail?.allowance.pts_allowed_per_game ?? 0),
                      fmt: (v: number) => (v > 0 ? `+${v.toFixed(1)}` : v.toFixed(1)),
                    },
                    {
                      label: "Field Goal %",
                      valA: teamADetail?.production.fg_pct ?? 0,
                      valB: teamBDetail?.production.fg_pct ?? 0,
                      fmt: (v: number) => `${(v * 100).toFixed(1)}%`,
                    },
                    {
                      label: "Opponent FG % Allowed",
                      valA: teamADetail?.allowance.fg_pct_allowed ?? 0,
                      valB: teamBDetail?.allowance.fg_pct_allowed ?? 0,
                      fmt: (v: number) => `${(v * 100).toFixed(1)}%`,
                      invertDiff: true,
                    },
                    {
                      label: "Three-Point %",
                      valA: teamADetail?.production.fg3_pct ?? 0,
                      valB: teamBDetail?.production.fg3_pct ?? 0,
                      fmt: (v: number) => `${(v * 100).toFixed(1)}%`,
                    },
                    {
                      label: "Free Throw %",
                      valA: teamADetail?.production.ft_pct ?? 0,
                      valB: teamBDetail?.production.ft_pct ?? 0,
                      fmt: (v: number) => `${(v * 100).toFixed(1)}%`,
                    },
                  ].map((row) => {
                    const diff = row.valA - row.valB;
                    const isPositive = row.invertDiff ? diff < 0 : diff > 0;
                    return (
                      <tr key={row.label}>
                        <td><strong>{row.label}</strong></td>
                        <td className="num font-mono font-semibold">{row.fmt(row.valA)}</td>
                        <td className="num font-mono font-semibold">{row.fmt(row.valB)}</td>
                        <td className={`num font-mono ${Math.abs(diff) > 0.0001 ? (isPositive ? "text-positive" : "text-negative") : "text-muted"}`}>
                          {diff > 0 ? `+${row.fmt(diff)}` : diff < 0 ? row.fmt(diff) : "0.0"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: FOUR FACTORS HEAD-TO-HEAD WITH COMPARATIVE BARS */}
      {activeTab === "factors" && (
        <div className="team-compare-container">
          {/* Ratings & Tempo Bar Comparison */}
          <div className="panel team-compare-factors-panel">
            <h3 className="team-compare-factors-title">
              Pace & Efficiency Ratings
            </h3>

            <div className="team-compare-factors-list">
              {[
                {
                  label: "Offensive Rating (ORTG)",
                  sub: "Points scored per 100 estimated possessions",
                  valA: teamAFourFactors?.off_rating ?? null,
                  valB: teamBFourFactors?.off_rating ?? null,
                  min: 105,
                  max: 125,
                  higherIsBetter: true,
                },
                {
                  label: "Defensive Rating (DRTG)",
                  sub: "Points allowed per 100 estimated possessions (lower is better)",
                  valA: teamAFourFactors?.def_rating ?? null,
                  valB: teamBFourFactors?.def_rating ?? null,
                  min: 105,
                  max: 125,
                  higherIsBetter: false,
                },
                {
                  label: "Net Rating (NET)",
                  sub: "ORTG minus DRTG margin per 100 possessions",
                  valA: teamAFourFactors?.net_rating ?? null,
                  valB: teamBFourFactors?.net_rating ?? null,
                  min: -12,
                  max: 14,
                  higherIsBetter: true,
                },
                {
                  label: "Pace (Tempo)",
                  sub: "Estimated possessions per 48 minutes",
                  valA: teamAFourFactors?.pace ?? null,
                  valB: teamBFourFactors?.pace ?? null,
                  min: 94,
                  max: 105,
                  higherIsBetter: true,
                },
              ].map((m) => {
                const a = m.valA ?? 0;
                const b = m.valB ?? 0;
                const aAdvantage = m.higherIsBetter ? a > b : a < b;
                const bAdvantage = m.higherIsBetter ? b > a : b < a;

                return (
                  <div key={m.label} className="team-compare-rating-row">
                    <div className="team-compare-rating-header">
                      <div>
                        <strong>{m.label}</strong>
                        <span className="text-xs text-muted team-compare-rating-sub">{m.sub}</span>
                      </div>
                      <div className="team-compare-rating-scores">
                        <span className={`font-mono font-bold ${aAdvantage ? "text-accent" : "text-muted"}`}>
                          {teamADetail?.team.tricode}: {m.valA != null ? m.valA.toFixed(1) : "—"}
                        </span>
                        <span className={`font-mono font-bold ${bAdvantage ? "text-positive" : "text-muted"}`}>
                          {teamBDetail?.team.tricode}: {m.valB != null ? m.valB.toFixed(1) : "—"}
                        </span>
                      </div>
                    </div>

                    {/* Comparative Visual Bar */}
                    <div className="team-compare-progress-track">
                      <div
                        className="team-compare-progress-a"
                        style={{
                          "--bar-width": `${Math.max(10, Math.min(90, (a / (a + b || 1)) * 100))}%`,
                          "--bar-bg": aAdvantage ? "var(--color-accent)" : "var(--color-hairline)",
                        } as React.CSSProperties}
                      />
                      <div
                        className="team-compare-progress-b"
                        style={{
                          "--bar-width": `${Math.max(10, Math.min(90, (b / (a + b || 1)) * 100))}%`,
                          "--bar-bg": bAdvantage ? "var(--color-positive)" : "var(--color-hairline)",
                        } as React.CSSProperties}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Dean Oliver Offensive Four Factors */}
          <div className="panel team-compare-factors-panel">
            <h3 className="team-compare-factors-title">
              Offensive Four Factors Comparison
            </h3>
            <p className="text-muted text-xs team-compare-factors-subtitle">
              Dean Oliver Four Factors weights: Shooting (eFG% 40%), Turnovers (TOV% 25%), Rebounding (ORB% 20%), Free Throws (FTR 15%).
            </p>

            <div className="responsive-pair team-compare-pair-grid">
              {/* Factors for Team A */}
              <div className="team-compare-factors-card">
                <h4 className="team-compare-factors-heading-a">
                  {teamADetail?.team.tricode} Offensive Factors
                </h4>
                <div className="team-compare-factors-items">
                  {teamAFourFactors?.offense_factors.map((f) => (
                    <div key={f.key} className="team-compare-factor-row">
                      <div>
                        <div className="team-compare-factor-title">{f.display_name}</div>
                        <div className="text-muted text-xs font-mono">Weight: {(f.weight ?? 0) * 100}%</div>
                      </div>
                      <div className="text-right">
                        <span className="font-mono font-bold">
                          {f.unit === "percentage" && f.value != null ? `${(f.value * 100).toFixed(1)}%` : f.value?.toFixed(3) ?? "—"}
                        </span>
                        <div className="team-compare-factor-badges">
                          <span className="badge badge-accent text-xs font-mono">#{f.rank ?? "—"}</span>
                          <span className="badge text-xs font-mono text-muted">{f.percentile?.toFixed(0)}%ile</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Factors for Team B */}
              <div className="team-compare-factors-card">
                <h4 className="team-compare-factors-heading-b">
                  {teamBDetail?.team.tricode} Offensive Factors
                </h4>
                <div className="team-compare-factors-items">
                  {teamBFourFactors?.offense_factors.map((f) => (
                    <div key={f.key} className="team-compare-factor-row">
                      <div>
                        <div className="team-compare-factor-title">{f.display_name}</div>
                        <div className="text-muted text-xs font-mono">Weight: {(f.weight ?? 0) * 100}%</div>
                      </div>
                      <div className="text-right">
                        <span className="font-mono font-bold">
                          {f.unit === "percentage" && f.value != null ? `${(f.value * 100).toFixed(1)}%` : f.value?.toFixed(3) ?? "—"}
                        </span>
                        <div className="team-compare-factor-badges">
                          <span className="badge badge-accent text-xs font-mono">#{f.rank ?? "—"}</span>
                          <span className="badge text-xs font-mono text-muted">{f.percentile?.toFixed(0)}%ile</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Defensive Four Factors */}
          <div className="panel team-compare-factors-panel">
            <h3 className="team-compare-factors-title">
              Defensive Four Factors (Allowed) Comparison
            </h3>

            <div className="responsive-pair team-compare-pair-grid">
              {/* Factors for Team A Defense */}
              <div className="team-compare-factors-card">
                <h4 className="team-compare-factors-heading-a">
                  {teamADetail?.team.tricode} Defensive Factors
                </h4>
                <div className="team-compare-factors-items">
                  {teamAFourFactors?.defense_factors.map((f) => (
                    <div key={f.key} className="team-compare-factor-row">
                      <div>
                        <div className="team-compare-factor-title">{f.display_name}</div>
                        <div className="text-muted text-xs font-mono">Good: {f.good_direction === "low" ? "Lower is better" : "Higher is better"}</div>
                      </div>
                      <div className="text-right">
                        <span className="font-mono font-bold">
                          {f.unit === "percentage" && f.value != null ? `${(f.value * 100).toFixed(1)}%` : f.value?.toFixed(3) ?? "—"}
                        </span>
                        <div className="team-compare-factor-badges">
                          <span className="badge badge-accent text-xs font-mono">#{f.rank ?? "—"}</span>
                          <span className="badge text-xs font-mono text-muted">{f.percentile?.toFixed(0)}%ile</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Factors for Team B Defense */}
              <div className="team-compare-factors-card">
                <h4 className="team-compare-factors-heading-b">
                  {teamBDetail?.team.tricode} Defensive Factors
                </h4>
                <div className="team-compare-factors-items">
                  {teamBFourFactors?.defense_factors.map((f) => (
                    <div key={f.key} className="team-compare-factor-row">
                      <div>
                        <div className="team-compare-factor-title">{f.display_name}</div>
                        <div className="text-muted text-xs font-mono">Good: {f.good_direction === "low" ? "Lower is better" : "Higher is better"}</div>
                      </div>
                      <div className="text-right">
                        <span className="font-mono font-bold">
                          {f.unit === "percentage" && f.value != null ? `${(f.value * 100).toFixed(1)}%` : f.value?.toFixed(3) ?? "—"}
                        </span>
                        <div className="team-compare-factor-badges">
                          <span className="badge badge-accent text-xs font-mono">#{f.rank ?? "—"}</span>
                          <span className="badge text-xs font-mono text-muted">{f.percentile?.toFixed(0)}%ile</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: FEATURE F18 THREE-POINT VARIATION SCENARIO */}
      {activeTab === "three_point" && (
        <div className="panel team-compare-factors-panel">
          <div className="team-scatter-header">
            <div className="factors-scenario-title">
              <span className="badge badge-accent">F18</span>
              <h3 className="team-scatter-title">
                Three-Point Variation What-If Scenario Comparison
              </h3>
            </div>
            <p className="text-muted text-xs team-scatter-subtitle">
              Counterfactual what-if arithmetic evaluating scoring and rating shifts if 3-point conversion regressed toward the league mean, holding attempt volumes constant.
            </p>
          </div>

          <div className="responsive-pair team-compare-pair-grid">
            {/* Team A Scenario Box */}
            <div className="team-compare-scenario-card">
              <div className="team-compare-scenario-card-header">
                <h4 className="team-compare-scenario-heading-a">{teamADetail?.team.tricode} 3P Scenario</h4>
                <span className="badge font-mono text-xs">
                  Observed: {teamAFourFactors?.three_point_scenario ? `${(teamAFourFactors.three_point_scenario.observed_3p_pct * 100).toFixed(1)}%` : "—"}
                </span>
              </div>

              {/* Slider for Team A */}
              <div className="team-compare-slider-group">
                <div className="team-compare-slider-label-row">
                  <span>Regression to League Mean:</span>
                  <strong className="font-mono">{regressionPctA}%</strong>
                </div>
                <input
                  type="range"
                  min="0"
                  max="100"
                  step="5"
                  value={regressionPctA}
                  onChange={(e) => setRegressionPctA(Number(e.target.value))}
                  className="team-compare-slider-input-a"
                />
                <div className="team-compare-slider-ticks">
                  <span>0% (Actual)</span>
                  <span>50%</span>
                  <span>100% (League Mean)</span>
                </div>
              </div>

              {/* Calculated Results Team A */}
              {scenarioA && (
                <div className="team-compare-scenario-results">
                  <div className="team-compare-scenario-result-row">
                    <span className="text-muted">Simulated 3P%:</span>
                    <strong className="font-mono">{(scenarioA.target3pPct * 100).toFixed(1)}%</strong>
                  </div>
                  <div className="team-compare-scenario-result-row">
                    <span className="text-muted">Point Differential (Season):</span>
                    <strong className={`font-mono ${scenarioA.deltaPoints >= 0 ? "text-positive" : "text-negative"}`}>
                      {scenarioA.deltaPoints >= 0 ? `+${scenarioA.deltaPoints}` : scenarioA.deltaPoints} PTS
                    </strong>
                  </div>
                  <div className="team-compare-scenario-result-row">
                    <span className="text-muted">Hypothetical PPG:</span>
                    <strong className="font-mono">{scenarioA.hypotheticalPpg.toFixed(1)} PPG</strong>
                  </div>
                  <div className="team-compare-scenario-result-row">
                    <span className="text-muted">Simulated ORTG Impact:</span>
                    <strong className={`font-mono ${scenarioA.deltaOffRating >= 0 ? "text-positive" : "text-negative"}`}>
                      {scenarioA.deltaOffRating >= 0 ? `+${scenarioA.deltaOffRating.toFixed(2)}` : scenarioA.deltaOffRating.toFixed(2)}
                    </strong>
                  </div>
                </div>
              )}
            </div>

            {/* Team B Scenario Box */}
            <div className="team-compare-scenario-card">
              <div className="team-compare-scenario-card-header">
                <h4 className="team-compare-scenario-heading-b">{teamBDetail?.team.tricode} 3P Scenario</h4>
                <span className="badge font-mono text-xs">
                  Observed: {teamBFourFactors?.three_point_scenario ? `${(teamBFourFactors.three_point_scenario.observed_3p_pct * 100).toFixed(1)}%` : "—"}
                </span>
              </div>

              {/* Slider for Team B */}
              <div className="team-compare-slider-group">
                <div className="team-compare-slider-label-row">
                  <span>Regression to League Mean:</span>
                  <strong className="font-mono">{regressionPctB}%</strong>
                </div>
                <input
                  type="range"
                  min="0"
                  max="100"
                  step="5"
                  value={regressionPctB}
                  onChange={(e) => setRegressionPctB(Number(e.target.value))}
                  className="team-compare-slider-input-b"
                />
                <div className="team-compare-slider-ticks">
                  <span>0% (Actual)</span>
                  <span>50%</span>
                  <span>100% (League Mean)</span>
                </div>
              </div>

              {/* Calculated Results Team B */}
              {scenarioB && (
                <div className="team-compare-scenario-results">
                  <div className="team-compare-scenario-result-row">
                    <span className="text-muted">Simulated 3P%:</span>
                    <strong className="font-mono">{(scenarioB.target3pPct * 100).toFixed(1)}%</strong>
                  </div>
                  <div className="team-compare-scenario-result-row">
                    <span className="text-muted">Point Differential (Season):</span>
                    <strong className={`font-mono ${scenarioB.deltaPoints >= 0 ? "text-positive" : "text-negative"}`}>
                      {scenarioB.deltaPoints >= 0 ? `+${scenarioB.deltaPoints}` : scenarioB.deltaPoints} PTS
                    </strong>
                  </div>
                  <div className="team-compare-scenario-result-row">
                    <span className="text-muted">Hypothetical PPG:</span>
                    <strong className="font-mono">{scenarioB.hypotheticalPpg.toFixed(1)} PPG</strong>
                  </div>
                  <div className="team-compare-scenario-result-row">
                    <span className="text-muted">Simulated ORTG Impact:</span>
                    <strong className={`font-mono ${scenarioB.deltaOffRating >= 0 ? "text-positive" : "text-negative"}`}>
                      {scenarioB.deltaOffRating >= 0 ? `+${scenarioB.deltaOffRating.toFixed(2)}` : scenarioB.deltaOffRating.toFixed(2)}
                    </strong>
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="notice-box team-compare-disclaimer">
            <strong>Non-Inferential Disclaimer:</strong> Feature F18 evaluates counterfactual what-if arithmetic holding observed 3P attempt volumes strictly constant. It is not an injury adjustment, luck-removal guarantee, or causal predictor.
          </div>
        </div>
      )}

      {/* TAB 4: PARTICIPATION COHORTS WITH TORONTO CASE STUDY DISTINCTION */}
      {activeTab === "roster" && (
        <div className="team-compare-stack">
          {/* Prominent Participation vs Roster Notice */}
          <div className="notice-box team-compare-notice-accent">
            <strong>Participation / Current-Roster Distinction:</strong> Player rows represent all individuals with verified on-court minutes for the franchise during this season window (for example, Toronto&rsquo;s 31-player cohort across in-season trades). This is an empirical accounting of court exposure, not a contractual or end-of-season roster claim.
          </div>

          <div className="responsive-pair team-compare-pair-grid">
            {/* Team A Cohort */}
            <div className="panel">
              <div className="panel-header team-compare-table-header">
                <h3 className="team-compare-table-title-a">
                  {teamADetail?.team.tricode} Participation Cohort
                </h3>
                <span className="badge font-mono text-xs">{teamADetail?.player_cohort.length ?? 0} players</span>
              </div>

              <div className="table-wrapper">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Player</th>
                      <th className="num">Stint GP</th>
                      <th className="num">Minutes</th>
                      <th className="num">PPG</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(teamADetail?.player_cohort ?? []).slice(0, 15).map((p) => (
                      <tr key={p.player_id}>
                        <td>
                          <div className="player-cell">
                            <PlayerPortrait playerId={p.player_id} name={p.player_name} size="sm" />
                            <Link
                              href={`/players/${p.player_id}?season=${season}&phase=${phase}&beforeDate=${beforeDate}&releaseId=${releaseId}`}
                              className="player-cell-name text-accent font-semibold"
                            >
                              {p.player_name}
                            </Link>
                          </div>
                        </td>
                        <td className="num font-mono">{p.games_played}</td>
                        <td className="num font-mono">{p.total_minutes?.toFixed(0) ?? "—"}</td>
                        <td className="num font-mono font-semibold">{p.points_per_game?.toFixed(1) ?? "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Team B Cohort */}
            <div className="panel">
              <div className="panel-header team-compare-table-header">
                <h3 className="team-compare-table-title-b">
                  {teamBDetail?.team.tricode} Participation Cohort
                </h3>
                <span className="badge font-mono text-xs">{teamBDetail?.player_cohort.length ?? 0} players</span>
              </div>

              <div className="table-wrapper">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Player</th>
                      <th className="num">Stint GP</th>
                      <th className="num">Minutes</th>
                      <th className="num">PPG</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(teamBDetail?.player_cohort ?? []).slice(0, 15).map((p) => (
                      <tr key={p.player_id}>
                        <td>
                          <div className="player-cell">
                            <PlayerPortrait playerId={p.player_id} name={p.player_name} size="sm" />
                            <Link
                              href={`/players/${p.player_id}?season=${season}&phase=${phase}&beforeDate=${beforeDate}&releaseId=${releaseId}`}
                              className="player-cell-name text-accent font-semibold"
                            >
                              {p.player_name}
                            </Link>
                          </div>
                        </td>
                        <td className="num font-mono">{p.games_played}</td>
                        <td className="num font-mono">{p.total_minutes?.toFixed(0) ?? "—"}</td>
                        <td className="num font-mono font-semibold">{p.points_per_game?.toFixed(1) ?? "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 5: SIMILAR PEERS COMPARISON */}
      {activeTab === "peers" && (
        <div className="responsive-pair team-compare-pair-grid">
          {/* Team A Peers */}
          <div className="panel">
            <div className="panel-header team-compare-table-header">
              <h3 className="team-compare-table-title-a">
                {teamADetail?.team.tricode} Statistical Peers
              </h3>
              <span className="badge font-mono text-xs">Four Factors & Tempo Twins</span>
            </div>

            <div className="table-wrapper">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Franchise</th>
                    <th className="num">Similarity</th>
                    <th className="num">Distance</th>
                    <th className="text-right">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {(teamAPeers?.peers ?? []).map((peer) => (
                    <tr key={peer.team_id}>
                      <td>
                        <strong className="text-accent">{peer.tricode}</strong> {peer.name}
                      </td>
                      <td className="num font-mono font-bold">{(peer.similarity_score * 100).toFixed(1)}%</td>
                      <td className="num font-mono text-muted">{peer.distance.toFixed(3)}</td>
                      <td className="text-right">
                        <button
                          type="button"
                          className="button button-small"
                          onClick={() => handleTeamChange(selectedA, peer.team_id)}
                        >
                          Compare
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Team B Peers */}
          <div className="panel">
            <div className="panel-header team-compare-table-header">
              <h3 className="team-compare-table-title-b">
                {teamBDetail?.team.tricode} Statistical Peers
              </h3>
              <span className="badge font-mono text-xs">Four Factors & Tempo Twins</span>
            </div>

            <div className="table-wrapper">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Franchise</th>
                    <th className="num">Similarity</th>
                    <th className="num">Distance</th>
                    <th className="text-right">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {(teamBPeers?.peers ?? []).map((peer) => (
                    <tr key={peer.team_id}>
                      <td>
                        <strong className="text-positive">{peer.tricode}</strong> {peer.name}
                      </td>
                      <td className="num font-mono font-bold">{(peer.similarity_score * 100).toFixed(1)}%</td>
                      <td className="num font-mono text-muted">{peer.distance.toFixed(3)}</td>
                      <td className="text-right">
                        <button
                          type="button"
                          className="button button-small"
                          onClick={() => handleTeamChange(peer.team_id, selectedB)}
                        >
                          Compare
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
