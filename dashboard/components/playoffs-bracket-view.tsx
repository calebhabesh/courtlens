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
    <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
      {/* Controls & Filter Toolbar */}
      <div className="panel" style={{ padding: "0.875rem 1rem" }}>
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: "1rem",
            alignItems: "center",
            justifyContent: "space-between"
          }}
        >
          {/* Left: View Tabs */}
          <div style={{ display: "flex", gap: "0.5rem" }}>
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
          <div style={{ display: "flex", flexWrap: "wrap", gap: "0.75rem", alignItems: "center" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "0.35rem" }}>
              <label htmlFor="playoff-season-select" className="text-xs text-muted font-mono">
                Season:
              </label>
              <select
                id="playoff-season-select"
                value={season}
                onChange={(e) => handleSeasonChange(e.target.value)}
                style={{ fontSize: "0.82rem", padding: "0.25rem 0.5rem" }}
              >
                <option value="2023-24">2023-24 Postseason</option>
                <option value="2024-25">2024-25 Postseason</option>
                <option value="2025-26">2025-26 Postseason</option>
              </select>
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: "0.35rem" }}>
              <label htmlFor="playoff-cutoff-input" className="text-xs text-muted font-mono">
                Replay Cutoff:
              </label>
              <input
                id="playoff-cutoff-input"
                type="date"
                value={cutoffInput}
                onChange={(e) => setCutoffInput(e.target.value)}
                placeholder="YYYY-MM-DD"
                style={{ fontSize: "0.82rem", padding: "0.2rem 0.5rem", width: "135px" }}
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
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: "1rem",
              marginTop: "0.75rem",
              paddingTop: "0.75rem",
              borderTop: "1px solid var(--border)",
              alignItems: "center",
              fontSize: "0.82rem"
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "0.35rem" }}>
              <span className="text-muted text-xs font-mono">Round:</span>
              <div style={{ display: "inline-flex", gap: "0.25rem" }}>
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
                    className={`button button-small ${roundFilter === item.id ? "button-primary" : ""}`}
                    style={{ padding: "0.2rem 0.5rem", fontSize: "0.75rem" }}
                    onClick={() => setRoundFilter(item.id as number | "all")}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: "0.35rem" }}>
              <span className="text-muted text-xs font-mono">Conference:</span>
              <div style={{ display: "inline-flex", gap: "0.25rem" }}>
                {[
                  { id: "all", label: "All" },
                  { id: "East", label: "Eastern" },
                  { id: "West", label: "Western" },
                  { id: "Finals", label: "Finals Only" }
                ].map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    className={`button button-small ${conferenceFilter === item.id ? "button-primary" : ""}`}
                    style={{ padding: "0.2rem 0.5rem", fontSize: "0.75rem" }}
                    onClick={() => setConferenceFilter(item.id as "all" | "East" | "West" | "Finals")}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>

            {bracket.cutoff_date && (
              <div style={{ marginLeft: "auto" }}>
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
        <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
          {displayedRounds.length === 0 ? (
            <div className="panel" style={{ padding: "2rem", textAlign: "center" }}>
              <p className="text-muted">No playoff series match the current round/conference filter.</p>
            </div>
          ) : (
            displayedRounds.map((rnd) => (
              <div key={rnd.round_number} className="panel">
                <div className="panel-header">
                  <div>
                    <h2 className="panel-title">{rnd.round_name}</h2>
                    <p className="text-muted text-xs" style={{ margin: "0.2rem 0 0" }}>
                      Round {rnd.round_number} · Best-of-7 Series (2-2-1-1-1 host sequence)
                    </p>
                  </div>
                  <span className="badge font-mono">{rnd.series.length} Series</span>
                </div>

                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))",
                    gap: "1rem",
                    padding: "1rem"
                  }}
                >
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
              <p className="text-muted text-xs" style={{ margin: "0.2rem 0 0" }}>
                Standings reconstructed strictly prior to playoff tipoff (<code className="font-mono">game_date &lt; playoff_start_date</code>). Regular-season record ties do not establish official conference placement without tiebreaker evidence.
              </p>
            </div>
            <span className="badge font-mono">Explicit Standings Proof</span>
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(420px, 1fr))",
              gap: "1.25rem",
              padding: "1rem"
            }}
          >
            {/* Eastern Conference Seeds */}
            <div>
              <h3
                style={{
                  fontSize: "0.88rem",
                  fontWeight: 700,
                  textTransform: "uppercase",
                  letterSpacing: "0.05em",
                  color: "var(--accent)",
                  margin: "0 0 0.5rem 0"
                }}
              >
                Eastern Conference Standings
              </h3>
              <div className="table-wrapper">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th style={{ width: "45px" }}>Seed</th>
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
                          <div style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
                            <span
                              className="font-mono font-bold text-accent"
                              style={{
                                background: "var(--surface-raised)",
                                padding: "0.1rem 0.3rem",
                                borderRadius: "4px",
                                fontSize: "0.78rem"
                              }}
                            >
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
                            <div style={{ display: "flex", flexDirection: "column", gap: "0.2rem" }}>
                              <span className="badge badge-warning text-xs font-mono" style={{ alignSelf: "flex-start" }}>
                                RECORD TIED
                              </span>
                              <span className="text-xs text-muted" style={{ fontSize: "0.75rem", lineHeight: 1.3 }}>
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
              <h3
                style={{
                  fontSize: "0.88rem",
                  fontWeight: 700,
                  textTransform: "uppercase",
                  letterSpacing: "0.05em",
                  color: "var(--accent)",
                  margin: "0 0 0.5rem 0"
                }}
              >
                Western Conference Standings
              </h3>
              <div className="table-wrapper">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th style={{ width: "45px" }}>Seed</th>
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
                          <div style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
                            <span
                              className="font-mono font-bold text-accent"
                              style={{
                                background: "var(--surface-raised)",
                                padding: "0.1rem 0.3rem",
                                borderRadius: "4px",
                                fontSize: "0.78rem"
                              }}
                            >
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
                            <div style={{ display: "flex", flexDirection: "column", gap: "0.2rem" }}>
                              <span className="badge badge-warning text-xs font-mono" style={{ alignSelf: "flex-start" }}>
                                RECORD TIED
                              </span>
                              <span className="text-xs text-muted" style={{ fontSize: "0.75rem", lineHeight: 1.3 }}>
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
        <div className="panel" style={{ padding: "1.25rem" }}>
          <h2 className="panel-title" style={{ marginBottom: "0.75rem" }}>
            Postseason Analytics Capability Disclosures
          </h2>
          <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
            {Object.entries(bracket.capabilities || {}).map(([key, val]) => (
              <div
                key={key}
                style={{
                  background: "var(--surface)",
                  padding: "0.75rem 1rem",
                  borderRadius: "6px",
                  border: "1px solid var(--border)",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center"
                }}
              >
                <span className="font-mono text-xs font-semibold">{key}</span>
                <span className="badge text-xs font-mono">{val}</span>
              </div>
            ))}
          </div>

          <div className="notice-box" style={{ marginTop: "1rem" }}>
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
    <div
      style={{
        background: "var(--surface)",
        border: "1px solid var(--border)",
        borderRadius: "8px",
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
        transition: "border-color 150ms ease, transform 150ms ease"
      }}
    >
      {/* Header bar */}
      <div
        style={{
          background: "var(--surface-raised)",
          padding: "0.45rem 0.75rem",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          borderBottom: "1px solid var(--border)"
        }}
      >
        <span className="text-xs text-muted font-mono">
          {series.conference ? `${series.conference} · ` : ""}Matchup {series.matchup_index + 1}
        </span>
        <span className={`badge ${badge.badgeClass} font-mono text-xs`}>
          {badge.label}
        </span>
      </div>

      {/* Teams rows */}
      <div style={{ padding: "0.75rem", display: "flex", flexDirection: "column", gap: "0.5rem" }}>
        {/* Team 1 */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "0.4rem 0.6rem",
            borderRadius: "6px",
            background: isTeam1Winner ? "color-mix(in srgb, var(--accent) 10%, transparent)" : "transparent",
            border: isTeam1Winner ? "1px solid var(--accent)" : "1px solid transparent"
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <span className="text-xs text-muted font-mono">#{series.team1.seed ?? "—"}</span>
            <span className="font-mono font-bold" style={{ fontSize: "0.95rem" }}>
              {series.team1.tricode}
            </span>
            <span style={{ fontSize: "0.85rem", fontWeight: isTeam1Winner ? 700 : 500 }}>
              {series.team1.name}
            </span>
          </div>
          <span
            className="font-mono font-bold"
            style={{
              fontSize: "1.1rem",
              color: isTeam1Winner ? "var(--accent)" : "var(--text)"
            }}
          >
            {series.team1.wins}
          </span>
        </div>

        {/* Team 2 */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "0.4rem 0.6rem",
            borderRadius: "6px",
            background: isTeam2Winner ? "color-mix(in srgb, var(--accent) 10%, transparent)" : "transparent",
            border: isTeam2Winner ? "1px solid var(--accent)" : "1px solid transparent"
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <span className="text-xs text-muted font-mono">#{series.team2.seed ?? "—"}</span>
            <span className="font-mono font-bold" style={{ fontSize: "0.95rem" }}>
              {series.team2.tricode}
            </span>
            <span style={{ fontSize: "0.85rem", fontWeight: isTeam2Winner ? 700 : 500 }}>
              {series.team2.name}
            </span>
          </div>
          <span
            className="font-mono font-bold"
            style={{
              fontSize: "1.1rem",
              color: isTeam2Winner ? "var(--accent)" : "var(--text)"
            }}
          >
            {series.team2.wins}
          </span>
        </div>
      </div>

      {/* Footer bar */}
      <div
        style={{
          marginTop: "auto",
          padding: "0.5rem 0.75rem",
          background: "var(--surface-raised)",
          borderTop: "1px solid var(--border)",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center"
        }}
      >
        <span className="text-xs text-muted font-mono" style={{ fontSize: "0.75rem" }}>
          {series.summary_text}
        </span>
        <Link href={detailHref} className="button button-small button-primary font-mono text-xs">
          Series Detail →
        </Link>
      </div>
    </div>
  );
}
