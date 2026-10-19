"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import type { PlayoffBracketResponse, PlayoffSeriesSummary } from "@/lib/types";
import { getSeriesStatusBadge } from "@/lib/playoffs";
import { buildPreservedContextUrl } from "@/lib/query-url";
import type { WorkbenchCatalog } from "@/lib/types";
import { ContextBar } from "./context-bar";
import { hasTeamLogo } from "@/lib/team-colors";
import { TeamLogo } from "./team-logo";
import { GatedNote } from "./ui/gated-note";
import { ButtonLink, Segmented } from "./ui/kit";

interface PlayoffsBracketViewProps {
  bracket: PlayoffBracketResponse | null;
  season: string;
  cutoffDate?: string;
  catalog?: WorkbenchCatalog;
  releaseId?: string;
  loadError?: string | null;
}

type BracketView = "bracket" | "seed_evidence" | "capabilities";
type RoundFilter = "all" | "1" | "2" | "3" | "4";
type ConferenceFilter = "all" | "East" | "West";

export function PlayoffsBracketView({ bracket, season, cutoffDate, catalog, releaseId, loadError }: PlayoffsBracketViewProps) {
  const searchParams = useSearchParams();
  const [activeTab, setActiveTab] = useState<BracketView>("bracket");
  const [roundFilter, setRoundFilter] = useState<RoundFilter>("all");
  const [conferenceFilter, setConferenceFilter] = useState<ConferenceFilter>("all");
  const seriesHref = (slug: string) => buildPreservedContextUrl(`/playoffs/${slug}`, searchParams);

  // Filter rounds
  const displayedRounds = useMemo(() => {
    return (bracket?.rounds ?? [])
      .filter((r) => roundFilter === "all" || r.round_number === Number(roundFilter))
      .map((r) => {
        let seriesList = r.series;
        if (conferenceFilter === "East") {
          seriesList = r.eastern_series;
        } else if (conferenceFilter === "West") {
          seriesList = r.western_series;
        }
        return {
          ...r,
          series: seriesList
        };
      })
      .filter((r) => r.series.length > 0);
  }, [bracket?.rounds, roundFilter, conferenceFilter]);

  // Seed Evidence
  const eastSeeds = bracket?.seeds?.East ?? [];
  const westSeeds = bracket?.seeds?.West ?? [];

  const filters = activeTab === "bracket" ? <>
    <Segmented<RoundFilter> size="lg" label="Round" value={roundFilter} onChange={setRoundFilter} options={[
      { value: "all", label: "All Rounds" }, { value: "1", label: "Round 1" }, { value: "2", label: "Semis" },
      { value: "3", label: "Conf Finals" }, { value: "4", label: "Finals" }
    ]} />
    <Segmented<ConferenceFilter> size="lg" label="Conference" value={conferenceFilter} onChange={setConferenceFilter} options={[
      { value: "all", label: "Both" }, { value: "East", label: "East" }, { value: "West", label: "West" }
    ]} />
  </> : undefined;

  return (
    <div className="playoffs-view-container">
      <ContextBar
        allowedPhases={["playoffs"]}
        catalog={catalog}
        initialReleaseId={releaseId}
        sampleNoun="series"
        initialSeason={season}
        initialPhase="playoffs"
        initialBeforeDate={cutoffDate || "2026-06-30"}
        showWindow={false}
        sampleSize={bracket?.rounds?.reduce((acc, r) => acc + r.series.length, 0)}
        filters={filters}
        modes={<Segmented<BracketView> size="lg" label="Playoff view" value={activeTab} onChange={setActiveTab} options={[
          { value: "bracket", label: "Bracket" }, { value: "seed_evidence", label: "Seeds" }, { value: "capabilities", label: "Coverage" }
        ]} />}
        detailRows={bracket?.disclaimers?.map((text, i) => ({ label: i ? "" : "Disclaimers", value: text })) ?? []}
      />

      {loadError && <GatedNote tone="warning" why={loadError}>The playoff bracket could not be loaded.</GatedNote>}

      {bracket && <GatedNote why="Descriptive completed-game facts only. Unplayed placeholder games (e.g., Games 6–7 in a 4–1 series) and games scheduled after cutoff are strictly excluded from outcomes, team ratings, and player stat denominators. Subjective win probabilities and automated winner projections are prohibited.">
        Completed games only; no winner projections.
      </GatedNote>}

      {/* TAB 1: TOURNAMENT BRACKET */}
      {bracket && activeTab === "bracket" && (
        <div className="playoffs-bracket-content">
          {displayedRounds.length === 0 ? (
            <div className="panel playoffs-empty-panel">
              <p className="text-muted">No playoff series match the current round and conference.</p>
            </div>
          ) : (
            displayedRounds.map((rnd) => (
              <div key={rnd.round_number} className="panel">
                <div className="panel-header">
                  <div>
                    <h2 className="panel-title">{rnd.round_name}</h2>
                    <p className="text-muted text-xs playoffs-round-subtitle">
                      Round {rnd.round_number} · Best-of-7 Series (2-2-1-1-1 host sequence)
                    </p>
                  </div>
                  <span className="badge font-mono">{rnd.series.length} Series</span>
                </div>

                <div className="playoffs-series-grid">
                  {rnd.series.map((s) => (
                    <SeriesBracketCard
                      key={s.series_id}
                      series={s}
                      href={seriesHref(s.slug)}
                    />
                  ))}
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* TAB 2: SEED EVIDENCE & STANDINGS */}
      {bracket && activeTab === "seed_evidence" && (
        <div className="panel">
          <div className="panel-header">
            <div>
              <h2 className="panel-title">Postseason Seed Evidence & Pre-Playoff Standings</h2>
              <p className="text-muted text-xs playoffs-round-subtitle">
                Standings before the first playoff game. Tied records need tiebreaker evidence for official placement.
              </p>
            </div>
            <span className="badge font-mono">Explicit Standings Proof</span>
          </div>

          <div className="playoffs-seeds-container">
            {/* Eastern Conference Seeds */}
            <div>
              <h3 className="playoffs-conference-title">
                Eastern Conference Standings
              </h3>
              <div className="table-wrapper">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th className="playoffs-seed-cell-center">Seed</th>
                      <th>Franchise</th>
                      <th className="num">W-L</th>
                      <th className="num">Win%</th>
                      <th>Tie Note / Evidence</th>
                    </tr>
                  </thead>
                  <tbody>
                    {eastSeeds.map((st) => (
                      <tr key={st.team_id}>
                        <td className="font-mono font-bold">#{st.seed}</td>
                        <td>
                          <div className="playoffs-seed-team-cell">
                            {hasTeamLogo(st.team_id) && <TeamLogo team={st.team_id} size={20} />}
                            <span className="font-mono font-bold playoffs-seed-tricode">
                              {st.tricode}
                            </span>
                            <Link
                              href={`/teams/${st.team_id}?season=${season}&phase=regular_season`}
                              className="font-semibold text-accent"
                            >
                              {st.team_name}
                            </Link>
                          </div>
                        </td>
                        <td className="num font-mono">
                          {st.wins}-{st.losses}
                        </td>
                        <td className="num font-mono">{st.win_pct.toFixed(3)}</td>
                        <td>
                          {st.is_tied ? (
                            <div className="playoffs-seed-meta-box">
                              <span className="badge badge-warning text-xs font-mono playoffs-seed-meta-badge">
                                RECORD TIED
                              </span>
                              <span className="playoffs-seed-tiebreaker">
                                {st.tie_note}
                              </span>
                            </div>
                          ) : (
                            <span className="text-xs text-muted font-mono">Outright</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Western Conference Seeds */}
            <div>
              <h3 className="playoffs-conference-title">
                Western Conference Standings
              </h3>
              <div className="table-wrapper">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th className="playoffs-seed-cell-center">Seed</th>
                      <th>Franchise</th>
                      <th className="num">W-L</th>
                      <th className="num">Win%</th>
                      <th>Tie Note / Evidence</th>
                    </tr>
                  </thead>
                  <tbody>
                    {westSeeds.map((st) => (
                      <tr key={st.team_id}>
                        <td className="font-mono font-bold">#{st.seed}</td>
                        <td>
                          <div className="playoffs-seed-team-cell">
                            {hasTeamLogo(st.team_id) && <TeamLogo team={st.team_id} size={20} />}
                            <span className="font-mono font-bold playoffs-seed-tricode">
                              {st.tricode}
                            </span>
                            <Link
                              href={`/teams/${st.team_id}?season=${season}&phase=regular_season`}
                              className="font-semibold text-accent"
                            >
                              {st.team_name}
                            </Link>
                          </div>
                        </td>
                        <td className="num font-mono">
                          {st.wins}-{st.losses}
                        </td>
                        <td className="num font-mono">{st.win_pct.toFixed(3)}</td>
                        <td>
                          {st.is_tied ? (
                            <div className="playoffs-seed-meta-box">
                              <span className="badge badge-warning text-xs font-mono playoffs-seed-meta-badge">
                                RECORD TIED
                              </span>
                              <span className="playoffs-seed-tiebreaker">
                                {st.tie_note}
                              </span>
                            </div>
                          ) : (
                            <span className="text-xs text-muted font-mono">Outright</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: CAPABILITIES & GATES */}
      {bracket && activeTab === "capabilities" && (
        <div className="panel playoffs-capabilities-panel">
          <h2 className="panel-title playoffs-capabilities-title">
            Postseason Analytics Capability Disclosures
          </h2>
          <div className="playoffs-capabilities-list">
            {Object.entries(bracket.capabilities || {}).map(([key, val]) => (
              <div key={key} className="playoffs-capability-row">
                <span className="font-mono text-xs font-semibold">{key}</span>
                <span className="badge text-xs font-mono">{val}</span>
              </div>
            ))}
          </div>

          <GatedNote why="Lineup, rotation and defensive tracking require separately admitted inputs.">Final box-score summaries remain available.</GatedNote>
        </div>
      )}
    </div>
  );
}

/**
 * Individual series card in the tournament bracket.
 */
function SeriesBracketCard({
  series,
  href: detailHref
}: {
  series: PlayoffSeriesSummary;
  href: string;
}) {
  const badge = getSeriesStatusBadge(series);
  const isTeam1Winner = series.winner_team_id === series.team1.team_id;
  const isTeam2Winner = series.winner_team_id === series.team2.team_id;

  return (
    <div className="playoff-bracket-card">
      {/* Header bar */}
      <div className="playoff-bracket-card-header">
        <span className="text-xs text-muted font-mono">
          {series.conference ? `${series.conference} · ` : ""}Matchup {series.matchup_index + 1}
        </span>
        <span className={`badge ${badge.badgeClass} font-mono text-xs`}>
          {badge.label}
        </span>
      </div>

      {/* Teams rows */}
      <div className="playoff-bracket-card-body">
        {/* Team 1 */}
        <div className={`playoff-bracket-team-row ${isTeam1Winner ? "winner" : ""}`}>
          <div className="playoff-bracket-team-info">
            <span className="playoff-bracket-team-seed">#{series.team1.seed ?? "—"}</span>
            {hasTeamLogo(series.team1.team_id) && <TeamLogo team={series.team1.team_id} size={20} />}
            <span className={`playoff-bracket-team-name ${isTeam1Winner ? "winner" : ""}`}>
              {series.team1.name}
            </span>
          </div>
          <span className={`playoff-bracket-team-wins ${isTeam1Winner ? "winner" : ""}`}>
            {series.team1.wins}
          </span>
        </div>

        {/* Team 2 */}
        <div className={`playoff-bracket-team-row ${isTeam2Winner ? "winner" : ""}`}>
          <div className="playoff-bracket-team-info">
            <span className="playoff-bracket-team-seed">#{series.team2.seed ?? "—"}</span>
            {hasTeamLogo(series.team2.team_id) && <TeamLogo team={series.team2.team_id} size={20} />}
            <span className={`playoff-bracket-team-name ${isTeam2Winner ? "winner" : ""}`}>
              {series.team2.name}
            </span>
          </div>
          <span className={`playoff-bracket-team-wins ${isTeam2Winner ? "winner" : ""}`}>
            {series.team2.wins}
          </span>
        </div>
      </div>

      {/* Footer bar */}
      <div className="playoff-bracket-card-footer">
        <span className="text-xs text-muted font-mono">
          {series.summary_text}
        </span>
        <ButtonLink size="lg" href={detailHref} aria-label={`${series.team1.name} vs ${series.team2.name} series details`}>
          Details
        </ButtonLink>
      </div>
    </div>
  );
}
