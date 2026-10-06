"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { SortHeader } from "./table-ui";
import { PlayerPortrait } from "@/components/player-portrait";
import type { PlayoffSeriesDetailResponse, PlayerSeriesStats } from "@/lib/types";
import {
  buildTeamSeriesComparison,
  formatPercent,
  formatStat,
  getGameCardDisplay,
  getSeriesStatusBadge,
  sortPlayerSeriesStats
} from "@/lib/playoffs";

interface PlayoffsSeriesViewProps {
  detail: PlayoffSeriesDetailResponse;
  cutoffDate?: string;
}

export function PlayoffsSeriesView({ detail, cutoffDate }: PlayoffsSeriesViewProps) {
  const { team1, team2, game_cards, team1_players, team2_players } = detail;

  // Player roster tab
  const [playerTab, setPlayerTab] = useState<"all" | "team1" | "team2">("all");
  const [sortField, setSortField] = useState<keyof PlayerSeriesStats>("points_per_game");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  // Comparison rows
  const factorRows = useMemo(() => {
    return buildTeamSeriesComparison(team1, team2);
  }, [team1, team2]);

  // Combined and sorted player list
  const displayedPlayers = useMemo(() => {
    let list: PlayerSeriesStats[] = [];
    if (playerTab === "all") {
      list = [...team1_players, ...team2_players];
    } else if (playerTab === "team1") {
      list = [...team1_players];
    } else {
      list = [...team2_players];
    }
    return sortPlayerSeriesStats(list, sortField, sortDir);
  }, [team1_players, team2_players, playerTab, sortField, sortDir]);

  const handleSort = (field: keyof PlayerSeriesStats) => {
    if (sortField === field) {
      setSortDir((prev) => (prev === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortDir("desc");
    }
  };

  const statusBadge = getSeriesStatusBadge({
    series_id: detail.series_id,
    slug: detail.slug,
    season: detail.season,
    round_number: detail.round_number,
    round_name: detail.round_name,
    conference: detail.conference,
    matchup_index: detail.matchup_index,
    team1: {
      team_id: team1.team_id,
      tricode: team1.tricode,
      name: team1.team_name,
      seed: team1.seed,
      wins: team1.wins
    },
    team2: {
      team_id: team2.team_id,
      tricode: team2.tricode,
      name: team2.team_name,
      seed: team2.seed,
      wins: team2.wins
    },
    series_score: detail.series_score,
    status: detail.status,
    winner_team_id: detail.winner_team_id,
    winner_tricode: detail.winner_tricode,
    games_count: team1.wins + team2.wins,
    total_scheduled: 7,
    is_sweep: team1.wins === 4 && team2.wins === 0 || team2.wins === 4 && team1.wins === 0,
    summary_text: `${team1.tricode} vs ${team2.tricode}`
  });

  const isTeam1Winner = detail.winner_team_id === team1.team_id;
  const isTeam2Winner = detail.winner_team_id === team2.team_id;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
      {/* Top Navigation Bar */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <Link
          href={`/playoffs?season=${encodeURIComponent(detail.season)}${cutoffDate ? `&cutoff_date=${encodeURIComponent(cutoffDate)}` : ""}`}
          className="button button-small"
        >
          ← Back to Playoff Bracket
        </Link>
        <div style={{ display: "flex", gap: "0.5rem" }}>
          <Link
            href={`/team-compare?teamA=${team1.team_id}&teamB=${team2.team_id}&season=${detail.season}&phase=playoffs`}
            className="button button-small button-accent"
          >
            Compare Franchises ⇄
          </Link>
        </div>
      </div>

      {/* Series Hero Matchup Card */}
      <div
        className="panel"
        style={{
          padding: "1.5rem",
          background: "var(--surface)",
          border: "1px solid var(--border)",
          borderRadius: "8px"
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: "1rem",
            borderBottom: "1px solid var(--border)",
            paddingBottom: "0.75rem"
          }}
        >
          <div>
            <span className="text-xs text-muted font-mono uppercase">
              {detail.season} Postseason · {detail.round_name}
              {detail.conference ? ` (${detail.conference})` : ""} · Series ID: {detail.series_id}
            </span>
            <h1 className="page-title" style={{ margin: "0.2rem 0 0 0", fontSize: "1.4rem" }}>
              {team1.team_name} vs {team2.team_name}
            </h1>
          </div>
          <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
            <span className={`badge ${statusBadge.badgeClass} font-mono`} style={{ fontSize: "0.85rem", padding: "0.3rem 0.6rem" }}>
              {statusBadge.label}: {detail.series_score}
            </span>
            {detail.cutoff_date && (
              <span className="badge badge-warning font-mono text-xs">
                Cutoff: {detail.cutoff_date}
              </span>
            )}
          </div>
        </div>

        {/* Matchup Teams Banner */}
        <div className="responsive-pair"
          style={{
            display: "grid",
            gridTemplateColumns: "1fr auto 1fr",
            gap: "1.5rem",
            alignItems: "center"
          }}
        >
          {/* Team 1 Card */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "1rem",
              padding: "1rem",
              borderRadius: "8px",
              background: isTeam1Winner ? "color-mix(in srgb, var(--accent) 12%, transparent)" : "var(--surface-raised)",
              border: isTeam1Winner ? "2px solid var(--accent)" : "1px solid var(--border)"
            }}
          >
            <div
              style={{
                width: "56px",
                height: "56px",
                borderRadius: "8px",
                background: "var(--surface)",
                border: "1px solid var(--border)",
                display: "grid",
                placeItems: "center",
                flexShrink: 0
              }}
            >
              <span className="font-mono font-bold text-accent" style={{ fontSize: "1.1rem" }}>
                {team1.tricode}
              </span>
            </div>
            <div>
              <div className="text-xs text-muted font-mono">Seed #{team1.seed ?? "—"}</div>
              <Link
                href={`/teams/${team1.team_id}?season=${detail.season}&phase=playoffs`}
                className="font-bold text-accent"
                style={{ fontSize: "1.15rem", display: "block" }}
              >
                {team1.team_name}
              </Link>
              <div className="text-xs text-muted font-mono" style={{ marginTop: "0.2rem" }}>
                {team1.wins}W - {team1.losses}L · {team1.games_played} Games
              </div>
            </div>
            <div style={{ marginLeft: "auto", textAlign: "right" }}>
              <span
                className="font-mono font-bold"
                style={{
                  fontSize: "2.5rem",
                  lineHeight: 1,
                  color: isTeam1Winner ? "var(--accent)" : "var(--text)"
                }}
              >
                {team1.wins}
              </span>
            </div>
          </div>

          {/* VS Center Divider */}
          <div style={{ textAlign: "center" }}>
            <span
              className="text-muted font-mono font-bold"
              style={{ fontSize: "1.2rem", letterSpacing: "0.1em" }}
            >
              VS
            </span>
            <div className="text-xs text-muted font-mono" style={{ marginTop: "0.25rem" }}>
              Best of 7
            </div>
          </div>

          {/* Team 2 Card */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "1rem",
              padding: "1rem",
              borderRadius: "8px",
              background: isTeam2Winner ? "color-mix(in srgb, var(--accent) 12%, transparent)" : "var(--surface-raised)",
              border: isTeam2Winner ? "2px solid var(--accent)" : "1px solid var(--border)"
            }}
          >
            <div style={{ textAlign: "left" }}>
              <span
                className="font-mono font-bold"
                style={{
                  fontSize: "2.5rem",
                  lineHeight: 1,
                  color: isTeam2Winner ? "var(--accent)" : "var(--text)"
                }}
              >
                {team2.wins}
              </span>
            </div>
            <div style={{ marginLeft: "auto", textAlign: "right" }}>
              <div className="text-xs text-muted font-mono">Seed #{team2.seed ?? "—"}</div>
              <Link
                href={`/teams/${team2.team_id}?season=${detail.season}&phase=playoffs`}
                className="font-bold text-accent"
                style={{ fontSize: "1.15rem", display: "block" }}
              >
                {team2.team_name}
              </Link>
              <div className="text-xs text-muted font-mono" style={{ marginTop: "0.2rem" }}>
                {team2.wins}W - {team2.losses}L · {team2.games_played} Games
              </div>
            </div>
            <div
              style={{
                width: "56px",
                height: "56px",
                borderRadius: "8px",
                background: "var(--surface)",
                border: "1px solid var(--border)",
                display: "grid",
                placeItems: "center",
                flexShrink: 0
              }}
            >
              <span className="font-mono font-bold text-accent" style={{ fontSize: "1.1rem" }}>
                {team2.tricode}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Disclaimers & Zero Inferred Forecasts */}
      <div className="notice-box">
        <strong>Descriptive Postseason Facts Only:</strong> CourtLoad strictly reports verified completed-game box scores and series facts. Automated series winner projections and subjective win probabilities are prohibited. Unplayed placeholder games (Games 6–7) are excluded from team ratings and player denominators.
      </div>

      {/* 7-Game Cards Grid */}
      <div className="panel">
        <div className="panel-header">
          <div>
            <h2 className="panel-title">7-Game Schedule & Outcomes</h2>
            <p className="text-muted text-xs" style={{ margin: "0.2rem 0 0" }}>
              NBA 2-2-1-1-1 host sequence. Unplayed games in completed series retain placeholder status and are excluded from aggregates.
            </p>
          </div>
          <span className="badge font-mono">7 Games Scheduled</span>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
            gap: "0.875rem",
            padding: "1rem"
          }}
        >
          {game_cards.map((card) => {
            const display = getGameCardDisplay(card, detail.winner_tricode);
            const isFinal = card.status === "final";
            const isHomeWinner = isFinal && card.winner_team_id === card.home_team_id;
            const isAwayWinner = isFinal && card.winner_team_id === card.away_team_id;

            return (
              <div
                key={card.game_id}
                style={{
                  background: card.status === "unplayed_placeholder" ? "var(--surface)" : "var(--surface-raised)",
                  border: isFinal ? "1px solid var(--border)" : "1px dashed var(--border)",
                  borderRadius: "8px",
                  padding: "0.875rem",
                  display: "flex",
                  flexDirection: "column",
                  gap: "0.5rem",
                  opacity: card.status === "unplayed_placeholder" ? 0.75 : 1
                }}
              >
                {/* Header */}
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span className="font-mono font-bold text-xs">Game {card.game_number}</span>
                  <span className={`badge ${display.badgeClass} font-mono text-xs`}>
                    {display.label}
                  </span>
                </div>

                {/* Score / Matchup */}
                <div style={{ display: "flex", flexDirection: "column", gap: "0.35rem", margin: "0.25rem 0" }}>
                  {/* Away team */}
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      fontWeight: isAwayWinner ? 700 : 500
                    }}
                  >
                    <span className="font-mono text-xs">
                      {card.away_team_tricode} <span className="text-muted">(Away)</span>
                    </span>
                    <span className="font-mono font-bold" style={{ fontSize: "1rem" }}>
                      {card.away_score !== null ? card.away_score : "—"}
                    </span>
                  </div>

                  {/* Home team */}
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      fontWeight: isHomeWinner ? 700 : 500
                    }}
                  >
                    <span className="font-mono text-xs">
                      {card.home_team_tricode} <span className="text-muted">(Home)</span>
                    </span>
                    <span className="font-mono font-bold" style={{ fontSize: "1rem" }}>
                      {card.home_score !== null ? card.home_score : "—"}
                    </span>
                  </div>
                </div>

                {/* Footer notes */}
                <div style={{ marginTop: "auto", borderTop: "1px solid var(--border)", paddingTop: "0.4rem", fontSize: "0.75rem" }}>
                  <div className="text-muted font-mono">{card.game_date || "Date TBD"}</div>
                  {display.note && (
                    <div className="text-muted" style={{ fontSize: "0.72rem", marginTop: "0.15rem" }}>
                      {display.note}
                    </div>
                  )}
                  {card.venue && (
                    <div className="text-muted" style={{ fontSize: "0.7rem", marginTop: "0.1rem" }}>
                      {card.venue}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Dean Oliver Four Factors & Team Efficiency Comparison */}
      <div className="panel">
        <div className="panel-header">
          <div>
            <h2 className="panel-title">Dean Oliver Four Factors & Series Efficiency</h2>
            <p className="text-muted text-xs" style={{ margin: "0.2rem 0 0" }}>
              Computed strictly across completed games ({team1.games_played} GP). Unplayed games do not affect ratings.
            </p>
          </div>
          <span className="badge font-mono">{team1.tricode} vs {team2.tricode}</span>
        </div>

        <div className="table-wrapper research-table-scroll" role="region" aria-label="Series statistics scroll area" tabIndex={0}>
          <table className="data-table">
            <thead>
              <tr>
                <th style={{ width: "25%" }}>Metric / Four Factor</th>
                <th className="num font-mono" style={{ width: "25%" }}>
                  {team1.tricode}
                </th>
                <th style={{ textAlign: "center", width: "20%" }}>Advantage</th>
                <th className="num font-mono" style={{ width: "25%" }}>
                  {team2.tricode}
                </th>
              </tr>
            </thead>
            <tbody>
              {factorRows.map((r) => {
                const isT1Adv = r.advantage === "team1";
                const isT2Adv = r.advantage === "team2";

                const fmtVal = (val: number | null | undefined) => {
                  if (val === null || val === undefined) return "—";
                  if (r.unit === "pct") return formatPercent(val);
                  if (r.unit === "rating" || r.unit === "pts") return formatStat(val, 1);
                  return formatStat(val, 3);
                };

                return (
                  <tr key={r.key}>
                    <td>
                      <strong>{r.label}</strong>
                    </td>
                    <td
                      className="num font-mono"
                      style={{
                        fontWeight: isT1Adv ? 700 : 500,
                        color: isT1Adv ? "var(--accent)" : "var(--text)"
                      }}
                    >
                      {fmtVal(r.team1Val)}
                    </td>
                    <td style={{ textAlign: "center" }}>
                      {isT1Adv && (
                        <span className="badge badge-accent text-xs font-mono">
                          ◀ {team1.tricode}
                        </span>
                      )}
                      {isT2Adv && (
                        <span className="badge badge-accent text-xs font-mono">
                          {team2.tricode} ▶
                        </span>
                      )}
                      {r.advantage === "tied" && (
                        <span className="badge text-xs font-mono text-muted">TIED</span>
                      )}
                      {r.advantage === "unknown" && (
                        <span className="text-muted text-xs">—</span>
                      )}
                    </td>
                    <td
                      className="num font-mono"
                      style={{
                        fontWeight: isT2Adv ? 700 : 500,
                        color: isT2Adv ? "var(--accent)" : "var(--text)"
                      }}
                    >
                      {fmtVal(r.team2Val)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Player Series Box Scores Table */}
      <div className="panel">
        <div className="panel-header">
          <div>
            <h2 className="panel-title">Player Series Statistics & Box Scores</h2>
            <p className="text-muted text-xs" style={{ margin: "0.2rem 0 0" }}>
              Per-game averages strictly over played games. Unplayed placeholder games do not dilute denominators.
            </p>
          </div>
          <div style={{ display: "flex", gap: "0.35rem" }}>
            <button
              type="button"
              className={`button button-small ${playerTab === "all" ? "button-primary" : ""}`}
              onClick={() => setPlayerTab("all")}
            >
              All Players ({team1_players.length + team2_players.length})
            </button>
            <button
              type="button"
              className={`button button-small ${playerTab === "team1" ? "button-primary" : ""}`}
              onClick={() => setPlayerTab("team1")}
            >
              {team1.tricode} ({team1_players.length})
            </button>
            <button
              type="button"
              className={`button button-small ${playerTab === "team2" ? "button-primary" : ""}`}
              onClick={() => setPlayerTab("team2")}
            >
              {team2.tricode} ({team2_players.length})
            </button>
          </div>
        </div>

        <div className="table-wrapper research-table-scroll" role="region" aria-label="Series statistics scroll area" tabIndex={0}>
          <table className="data-table">
            <thead>
              <tr>
                <th style={{ width: "40px" }}>#</th>
                <SortHeader className="" label="Player" metric="player_name" active={sortField === "player_name"} direction={sortDir} onSort={() => handleSort("player_name")} />
                <th>Team</th>
                <SortHeader className="num" label="GP" metric="games_played" active={sortField === "games_played"} direction={sortDir} onSort={() => handleSort("games_played")} />
                <SortHeader className="num" label="MPG" metric="minutes_per_game" active={sortField === "minutes_per_game"} direction={sortDir} onSort={() => handleSort("minutes_per_game")} />
                <SortHeader className="num" label="PPG" metric="points_per_game" active={sortField === "points_per_game"} direction={sortDir} onSort={() => handleSort("points_per_game")} />
                <SortHeader className="num" label="RPG" metric="rebounds_per_game" active={sortField === "rebounds_per_game"} direction={sortDir} onSort={() => handleSort("rebounds_per_game")} />
                <SortHeader className="num" label="APG" metric="assists_per_game" active={sortField === "assists_per_game"} direction={sortDir} onSort={() => handleSort("assists_per_game")} />
                <SortHeader className="num" label="SPG" metric="steals_per_game" active={sortField === "steals_per_game"} direction={sortDir} onSort={() => handleSort("steals_per_game")} />
                <SortHeader className="num" label="BPG" metric="blocks_per_game" active={sortField === "blocks_per_game"} direction={sortDir} onSort={() => handleSort("blocks_per_game")} />
                <SortHeader className="num" label="TOPG" metric="turnovers_per_game" active={sortField === "turnovers_per_game"} direction={sortDir} onSort={() => handleSort("turnovers_per_game")} />
                <SortHeader className="num" label="FG%" metric="fg_pct" active={sortField === "fg_pct"} direction={sortDir} onSort={() => handleSort("fg_pct")} />
                <SortHeader className="num" label="3P%" metric="fg3_pct" active={sortField === "fg3_pct"} direction={sortDir} onSort={() => handleSort("fg3_pct")} />
                <SortHeader className="num" label="FT%" metric="ft_pct" active={sortField === "ft_pct"} direction={sortDir} onSort={() => handleSort("ft_pct")} />
                <SortHeader className="num" label="eFG%" metric="efg_pct" active={sortField === "efg_pct"} direction={sortDir} onSort={() => handleSort("efg_pct")} />
                <SortHeader className="num" label="TS%" metric="ts_pct" active={sortField === "ts_pct"} direction={sortDir} onSort={() => handleSort("ts_pct")} />
                <th style={{ textAlign: "right" }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {displayedPlayers.map((p, idx) => (
                <tr key={p.player_id}>
                  <td className="font-mono text-muted text-xs">{idx + 1}</td>
                  <td>
                    <div className="player-cell">
                      <PlayerPortrait playerId={p.player_id} name={p.player_name} size="sm" />
                      <Link
                        href={`/players/${p.player_id}?season=${detail.season}&phase=playoffs`}
                        className="player-cell-name text-accent font-semibold"
                      >
                        {p.player_name}
                      </Link>
                    </div>
                  </td>
                  <td>
                    <span className="badge font-mono text-xs">{p.team_tricode}</span>
                  </td>
                  <td className="num font-mono">{p.games_played}</td>
                  <td className="num font-mono">{p.minutes_per_game.toFixed(1)}</td>
                  <td className="num font-mono font-bold">{p.points_per_game.toFixed(1)}</td>
                  <td className="num font-mono">{p.rebounds_per_game.toFixed(1)}</td>
                  <td className="num font-mono">{p.assists_per_game.toFixed(1)}</td>
                  <td className="num font-mono">{p.steals_per_game.toFixed(1)}</td>
                  <td className="num font-mono">{p.blocks_per_game.toFixed(1)}</td>
                  <td className="num font-mono">{p.turnovers_per_game.toFixed(1)}</td>
                  <td className="num font-mono">{formatPercent(p.fg_pct)}</td>
                  <td className="num font-mono">{formatPercent(p.fg3_pct)}</td>
                  <td className="num font-mono">{formatPercent(p.ft_pct)}</td>
                  <td className="num font-mono font-semibold">{formatPercent(p.efg_pct)}</td>
                  <td className="num font-mono font-bold text-accent">{formatPercent(p.ts_pct)}</td>
                  <td style={{ textAlign: "right" }}>
                    <Link
                      href={`/players/${p.player_id}?season=${detail.season}&phase=playoffs`}
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

      {/* Capability-Gated Advanced Matchup & Rotation Panels */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 400px), 1fr))",
          gap: "1.25rem"
        }}
      >
        {/* Matchup Matrix Panel (Gated) */}
        <div className="panel" style={{ padding: "1.25rem" }}>
          <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "0.5rem", marginBottom: "0.5rem" }}>
            <span className="badge badge-warning text-xs font-mono">Requires admitted matchup inputs</span>
            <h3 className="panel-title" style={{ fontSize: "1rem" }}>
              Head-to-Head Defensive Matchup Matrix
            </h3>
          </div>
          <p className="text-muted text-xs" style={{ lineHeight: 1.5 }}>
            Player-to-player primary defender tracking, matchup shot contests, and shooting efficiency against designated defenders. Gated to rich-source shot &amp; matchup event ingestion.
          </p>
        </div>

        {/* Rotation Stints & Lineups Panel (Gated) */}
        <div className="panel" style={{ padding: "1.25rem" }}>
          <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "0.5rem", marginBottom: "0.5rem" }}>
            <span className="badge badge-warning text-xs font-mono">Requires admitted lineup inputs</span>
            <h3 className="panel-title" style={{ fontSize: "1rem" }}>
              Rotation Stints &amp; WOWY Lineups
            </h3>
          </div>
          <p className="text-muted text-xs" style={{ lineHeight: 1.5 }}>
            5-player unit net ratings, substitution pattern timelines, and teammate stat shifts (with/without specified athletes). Gated to play-by-play possession and stint warehouse ingestion.
          </p>
        </div>
      </div>
    </div>
  );
}
