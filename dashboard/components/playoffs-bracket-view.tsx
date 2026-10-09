"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { PlayoffBracketResponse, PlayoffSeriesSummary } from "@/lib/types";
import { getSeriesStatusBadge } from "@/lib/playoffs";

interface PlayoffsBracketViewProps {
  bracket: PlayoffBracketResponse;
  season: string;
  cutoffDate?: string;
}

export function PlayoffsBracketView({
  bracket,
  season,
  cutoffDate
}: PlayoffsBracketViewProps) {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<"bracket" | "seed_evidence" | "capabilities">("bracket");
  const [roundFilter, setRoundFilter] = useState<number | "all">("all");
  const [conferenceFilter, setConferenceFilter] = useState<"all" | "East" | "West" | "Finals">("all");
  const [cutoffInput, setCutoffInput] = useState(cutoffDate || "");

  const handleApplyCutoff = () => {
    const sp = new URLSearchParams();
    sp.set("season", season);
    if (cutoffInput.trim()) {
      sp.set("cutoff_date", cutoffInput.trim());
    }
    router.push(`/playoffs?${sp.toString()}`);
  };

  const handleClearCutoff = () => {
    setCutoffInput("");
    router.push(`/playoffs?season=${encodeURIComponent(season)}`);
  };

  const handleSeasonChange = (newSeason: string) => {
    const sp = new URLSearchParams();
    sp.set("season", newSeason);
    if (cutoffDate) {
      sp.set("cutoff_date", cutoffDate);
    }
    router.push(`/playoffs?${sp.toString()}`);
  };

  // Filter rounds
  const displayedRounds = useMemo(() => {
    return bracket.rounds
      .filter((r) => roundFilter === "all" || r.round_number === roundFilter)
      .map((r) => {
        let seriesList = r.series;
        if (conferenceFilter === "East") {
          seriesList = r.eastern_series;
        } else if (conferenceFilter === "West") {
          seriesList = r.western_series;
        } else if (conferenceFilter === "Finals") {
          seriesList = r.finals_series;
        }
        return {
          ...r,
          series: seriesList
        };
      })
      .filter((r) => r.series.length > 0);
  }, [bracket.rounds, roundFilter, conferenceFilter]);

  // Seed Evidence
  const eastSeeds = bracket.seeds?.East ?? [];
  const westSeeds = bracket.seeds?.West ?? [];

  return (
    <div className="playoffs-view-container">
      {/* Controls & Filter Toolbar */}
      <div className="panel playoffs-controls-panel">
        <div className="playoffs-controls-row">
          {/* Left: View Tabs */}
          <div className="playoffs-tabs">
            <button
              type="button"
              className={`button button-small ${activeTab === "bracket" ? "button-primary" : ""}`}
              onClick={() => setActiveTab("bracket")}
            >
              Tournament Bracket
            </button>
            <button
              type="button"
              className={`button button-small ${activeTab === "seed_evidence" ? "button-primary" : ""}`}
              onClick={() => setActiveTab("seed_evidence")}
            >
              Seed Evidence & Standings
            </button>
            <button
              type="button"
              className={`button button-small ${activeTab === "capabilities" ? "button-primary" : ""}`}
              onClick={() => setActiveTab("capabilities")}
            >
              Capabilities & Gates
            </button>
          </div>

          {/* Right: Season & Temporal Replay Controls */}
          <div className="playoffs-replay-controls">
            <div className="playoffs-control-item">
              <label htmlFor="playoff-season-select" className="text-xs text-muted font-mono">
                Season:
              </label>
              <select
                id="playoff-season-select"
                value={season}
                onChange={(e) => handleSeasonChange(e.target.value)}
                className="playoffs-select-sm"
              >
                <option value="2023-24">2023-24 Postseason</option>
                <option value="2024-25">2024-25 Postseason</option>
                <option value="2025-26">2025-26 Postseason</option>
              </select>
            </div>

            <div className="playoffs-control-item">
              <label htmlFor="playoff-cutoff-input" className="text-xs text-muted font-mono">
                Replay Cutoff:
              </label>
              <input
                id="playoff-cutoff-input"
                type="date"
                value={cutoffInput}
                onChange={(e) => setCutoffInput(e.target.value)}
                placeholder="YYYY-MM-DD"
                className="playoffs-input-date"
              />
              <button
                type="button"
                className="button button-small button-primary"
                onClick={handleApplyCutoff}
              >
                Apply
              </button>
              {cutoffDate && (
                <button
                  type="button"
                  className="button button-small"
                  onClick={handleClearCutoff}
                  title="Clear cutoff and view all final series"
                >
                  Clear
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Sub-toolbar for Bracket Filters */}
        {activeTab === "bracket" && (
          <div className="playoffs-subtoolbar">
            <div className="playoffs-control-item">
              <span className="text-muted text-xs font-mono">Round:</span>
              <div className="playoffs-pill-group">
                {[
                  { id: "all", label: "All Rounds" },
                  { id: 1, label: "Round 1" },
                  { id: 2, label: "Semis" },
                  { id: 3, label: "Conf Finals" },
                  { id: 4, label: "Finals" }
                ].map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    className={`button button-small playoffs-pill-button ${roundFilter === item.id ? "button-primary" : ""}`}
                    onClick={() => setRoundFilter(item.id as number | "all")}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="playoffs-control-item">
              <span className="text-muted text-xs font-mono">Conference:</span>
              <div className="playoffs-pill-group">
                {[
                  { id: "all", label: "All" },
                  { id: "East", label: "Eastern" },
                  { id: "West", label: "Western" },
                  { id: "Finals", label: "Finals Only" }
                ].map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    className={`button button-small playoffs-pill-button ${conferenceFilter === item.id ? "button-primary" : ""}`}
                    onClick={() => setConferenceFilter(item.id as "all" | "East" | "West" | "Finals")}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>

            {bracket.cutoff_date && (
              <div className="playoffs-ml-auto">
                <span className="badge badge-warning font-mono text-xs">
                  Replay Filtered to {bracket.cutoff_date}
                </span>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Disclaimers Banner */}
      <div className="notice-box">
        <strong>Temporal Discipline & Zero Inferred Forecasts:</strong> Descriptive completed-game facts only. Unplayed placeholder games (e.g., Games 6–7 in a 4–1 series) and games scheduled after cutoff are strictly excluded from outcomes, team ratings, and player stat denominators. Subjective win probabilities and automated winner projections are prohibited.
      </div>

      {/* TAB 1: TOURNAMENT BRACKET */}
      {activeTab === "bracket" && (
        <div className="playoffs-bracket-content">
          {displayedRounds.length === 0 ? (
            <div className="panel playoffs-empty-panel">
              <p className="text-muted">No playoff series match the current round/conference filter.</p>
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
                      cutoffDate={bracket.cutoff_date || undefined}
                    />
                  ))}
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* TAB 2: SEED EVIDENCE & STANDINGS */}
      {activeTab === "seed_evidence" && (
        <div className="panel">
          <div className="panel-header">
            <div>
              <h2 className="panel-title">Postseason Seed Evidence & Pre-Playoff Standings</h2>
              <p className="text-muted text-xs playoffs-round-subtitle">
                Standings reconstructed strictly prior to playoff tipoff (<code className="font-mono">game_date &lt; playoff_start_date</code>). Regular-season record ties do not establish official conference placement without tiebreaker evidence.
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
                            <span className="font-mono font-bold text-accent playoffs-seed-tricode">
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
                            <span className="font-mono font-bold text-accent playoffs-seed-tricode">
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
      {activeTab === "capabilities" && (
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

          <div className="notice-box playoffs-notice-box">
            Final box-score summaries remain available. Lineup, rotation and defensive tracking require separately admitted inputs.
          </div>
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
  cutoffDate
}: {
  series: PlayoffSeriesSummary;
  cutoffDate?: string;
}) {
  const badge = getSeriesStatusBadge(series);
  const detailHref = `/playoffs/${series.slug}${cutoffDate ? `?cutoff_date=${encodeURIComponent(cutoffDate)}` : ""}`;
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
            <span className="font-mono font-bold text-sm">
              {series.team1.tricode}
            </span>
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
            <span className="font-mono font-bold text-sm">
              {series.team2.tricode}
            </span>
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
        <Link href={detailHref} className="button button-small button-primary font-mono text-xs">
          Series Detail
        </Link>
      </div>
    </div>
  );
}
