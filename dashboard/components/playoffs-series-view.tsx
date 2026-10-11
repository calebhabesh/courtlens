"use client";

import { Icon } from "./ui/icon";
import { useState, useMemo } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { formatDate } from "@/lib/format-date";
import { buildPreservedContextUrl } from "@/lib/query-url";
import { hasTeamLogo } from "@/lib/team-colors";
import { TeamLogo } from "./team-logo";
import { GatedNote } from "./ui/gated-note";
import { TeamIdentity } from "./ui/identity";
import { PageHeader } from "./ui/panel";
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
  /** The shared filter bar, placed directly under the page header. */
  filterBar?: React.ReactNode;
}

export function PlayoffsSeriesView({ detail, filterBar }: PlayoffsSeriesViewProps) {
  const { team1, team2, game_cards, team1_players, team2_players } = detail;
  const searchParams = useSearchParams();

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


  const renderTeam = (team: typeof team1, side: "left" | "right") => {
    const winner = detail.winner_team_id === team.team_id;
    return (
      <div className={`playoff-series-team-card ${winner ? "winner" : ""}`} data-side={side}>
        <TeamIdentity
          team={team.team_id}
          name={team.team_name}
          href={`/teams/${team.team_id}?season=${detail.season}&phase=playoffs`}
          subtitle={`Seed ${team.seed ?? "—"} · ${team.wins}–${team.losses}`}
          size="lg"
        />
        <span className={`playoff-series-team-score ${winner ? "winner" : ""}`}>{team.wins}</span>
      </div>
    );
  };

  return (
    <div className="playoffs-view-container">
      <PageHeader
        title={`${team1.team_name} vs ${team2.team_name}`}
        subtitle={`${detail.season} Postseason · ${detail.round_name}${detail.conference ? ` · ${detail.conference}` : ""}`}
        actions={<>
          <Link href={buildPreservedContextUrl("/playoffs", searchParams)} className="button button-small">
            <Icon name="left" size={14} />Playoffs
          </Link>
          <Link
            href={`/team-compare?teamA=${team1.team_id}&teamB=${team2.team_id}&season=${detail.season}&phase=playoffs`}
            className="button button-small"
          >
            Compare teams
          </Link>
        </>}
      />
      {filterBar}

      {/* Series hero: both teams with logo and team color, series score between them. */}
      <div className="panel playoff-series-hero-panel">
        <div className="responsive-pair playoff-series-hero-grid">
          {renderTeam(team1, "left")}
          <div className="playoff-series-score-center">
            <span className={`badge ${statusBadge.badgeClass} playoff-series-hero-badge`}>{statusBadge.label}</span>
            <span className="text-xs text-muted">Best of 7 · {team1.games_played} played</span>
          </div>
          {renderTeam(team2, "right")}
        </div>
      </div>

      {/* Disclaimers & Zero Inferred Forecasts */}
      <GatedNote why="CourtLens strictly reports verified completed-game box scores and series facts. Automated series winner projections and subjective win probabilities are prohibited. Unplayed placeholder games (Games 6–7) are excluded from team ratings and player denominators.">
        Completed games only; no winner projections.
      </GatedNote>

      {/* 7-Game Cards Grid */}
      <div className="panel">
        <div className="panel-header">
          <div>
            <h2 className="panel-title">7-Game Schedule & Outcomes</h2>
            <p className="text-muted text-xs playoffs-round-subtitle">
              NBA 2-2-1-1-1 host sequence. Unplayed games in completed series retain placeholder status and are excluded from aggregates.
            </p>
          </div>
          <span className="badge font-mono">7 Games Scheduled</span>
        </div>

        <div className="playoff-games-grid">
          {game_cards.map((card) => {
            const display = getGameCardDisplay(card, detail.winner_tricode);
            const isFinal = card.status === "final";
            const isHomeWinner = isFinal && card.winner_team_id === card.home_team_id;
            const isAwayWinner = isFinal && card.winner_team_id === card.away_team_id;

            return (
              <div
                key={card.game_id}
                className={`playoff-game-card ${card.status === "unplayed_placeholder" ? "unplayed" : ""} ${isHomeWinner || isAwayWinner ? "winner" : ""}`}
              >
                {/* Header */}
                <div className="playoff-game-card-header">
                  <span className="font-mono font-bold text-xs">Game {card.game_number}</span>
                  <span className={`badge ${display.badgeClass} font-mono text-xs`}>
                    {display.label}
                  </span>
                </div>

                {/* Score / Matchup */}
                <div className="playoff-game-card-teams">
                  {/* Away team */}
                  <div className={`playoff-game-card-team-row ${isAwayWinner ? "winner" : ""}`}>
                    <span className="playoff-game-card-team">
                      {hasTeamLogo(card.away_team_id) && <TeamLogo team={card.away_team_id} size={16} />}{card.away_team_tricode} <span className="text-muted">(Away)</span>
                    </span>
                    <span className="font-mono font-bold playoff-game-card-score">
                      {card.away_score !== null ? card.away_score : "—"}
                    </span>
                  </div>

                  {/* Home team */}
                  <div className={`playoff-game-card-team-row ${isHomeWinner ? "winner" : ""}`}>
                    <span className="playoff-game-card-team">
                      {hasTeamLogo(card.home_team_id) && <TeamLogo team={card.home_team_id} size={16} />}{card.home_team_tricode} <span className="text-muted">(Home)</span>
                    </span>
                    <span className="font-mono font-bold playoff-game-card-score">
                      {card.home_score !== null ? card.home_score : "—"}
                    </span>
                  </div>
                </div>

                {/* Footer notes */}
                <div className="playoff-game-card-footer">
                  <div className="text-muted">{card.game_date ? formatDate(card.game_date) : "Date TBD"}</div>
                  {display.note && (
                    <div className="text-muted text-xs playoffs-round-subtitle">
                      {display.note}
                    </div>
                  )}
                  {card.venue && (
                    <div className="text-muted text-xs playoffs-round-subtitle">
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
            <p className="text-muted text-xs playoffs-round-subtitle">
              Computed strictly across completed games ({team1.games_played} GP). Unplayed games do not affect ratings.
            </p>
          </div>
          <span className="badge font-mono">{team1.tricode} vs {team2.tricode}</span>
        </div>

        <div className="table-wrapper research-table-scroll" role="region" aria-label="Series statistics scroll area" tabIndex={0}>
          <table className="data-table">
            <thead>
              <tr>
                <th className="playoff-factors-col-metric">Metric / Four Factor</th>
                <th className="num font-mono playoff-factors-col-num">
                  {team1.tricode}
                </th>
                <th className="playoff-factors-col-adv">Advantage</th>
                <th className="num font-mono playoff-factors-col-num">
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
                    <td className={`num font-mono ${isT1Adv ? "font-bold text-accent" : ""}`}>
                      {fmtVal(r.team1Val)}
                    </td>
                    <td className="playoff-factors-adv-cell">
                      {isT1Adv && (
                        <span className="badge badge-accent text-xs font-mono">
                          <Icon name="left" size={14} />{team1.tricode}<span className="sr-only"> advantage</span>
                        </span>
                      )}
                      {isT2Adv && (
                        <span className="badge badge-accent text-xs font-mono">
                          {team2.tricode}<span className="sr-only"> advantage</span><Icon name="right" size={14} />
                        </span>
                      )}
                      {r.advantage === "tied" && (
                        <span className="badge text-xs font-mono text-muted">TIED</span>
                      )}
                      {r.advantage === "unknown" && (
                        <span className="text-muted text-xs">—</span>
                      )}
                    </td>
                    <td className={`num font-mono ${isT2Adv ? "font-bold text-accent" : ""}`}>
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
            <p className="text-muted text-xs playoffs-round-subtitle">
              Per-game averages strictly over played games. Unplayed placeholder games do not dilute denominators.
            </p>
          </div>
          <div className="playoffs-tabs">
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
                <th className="num">#</th>
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
                <th className="playoff-table-col-action">Action</th>
              </tr>
            </thead>
            <tbody>
              {displayedPlayers.map((p, idx) => (
                <tr key={p.player_id}>
                  <td className="num font-mono text-muted text-xs">{idx + 1}</td>
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
                  <td className="playoff-table-col-action">
                    <Link
                      href={`/players/${p.player_id}?season=${detail.season}&phase=playoffs`}
                      className="button button-small button-primary"
                    >
                      Profile
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Capability-Gated Advanced Matchup & Rotation Panels */}
      <div className="playoffs-gated-grid">
        {/* Matchup Matrix Panel (Gated) */}
        <div className="panel playoffs-gated-panel">
          <div className="playoffs-gated-header">
            <span className="badge badge-warning text-xs font-mono">Requires admitted matchup inputs</span>
            <h3 className="panel-title playoffs-gated-title">
              Head-to-Head Defensive Matchup Matrix
            </h3>
          </div>
          <p className="text-muted text-xs playoffs-gated-desc">
            Player-to-player primary defender tracking, matchup shot contests, and shooting efficiency against designated defenders. Gated to rich-source shot &amp; matchup event ingestion.
          </p>
        </div>

        {/* Rotation Stints & Lineups Panel (Gated) */}
        <div className="panel playoffs-gated-panel">
          <div className="playoffs-gated-header">
            <span className="badge badge-warning text-xs font-mono">Requires admitted lineup inputs</span>
            <h3 className="panel-title playoffs-gated-title">
              Rotation Stints &amp; WOWY Lineups
            </h3>
          </div>
          <p className="text-muted text-xs playoffs-gated-desc">
            5-player unit net ratings, substitution pattern timelines, and teammate stat shifts (with/without specified athletes). Gated to play-by-play possession and stint warehouse ingestion.
          </p>
        </div>
      </div>
    </div>
  );
}
