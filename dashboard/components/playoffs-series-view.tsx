"use client";

import { useMemo, useState, type CSSProperties } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { BackButton, useNavLabel } from "./ui/back-button";
import { seasonEra } from "@/lib/portrait-source";
import { formatDate } from "@/lib/format-date";
import { buildPreservedContextUrl } from "@/lib/query-url";
import { teamAccent } from "@/lib/team-colors";
import { recordLabel, seasonSeriesLabel } from "@/lib/playoffs-bracket";
import { formatPercent, seriesComparison, splitTeamName, type ComparisonBar } from "@/lib/playoffs";
import type { PlayerSeriesStats, PlayoffGameCard, PlayoffSeriesDetailResponse, TeamSeriesStats } from "@/lib/types";
import { TeamLogo } from "./team-logo";
import { GatedNote } from "./ui/gated-note";
import { Icon } from "./ui/icon";
import { PageHeader } from "./ui/panel";
import { SortHeader } from "./table-ui";
import { ButtonLink, ButtonSummary, Segmented } from "./ui/kit";
import { SeriesImpact, SeriesMatchupsPanel, TeamCode } from "./playoffs-series-sections";

interface PlayoffsSeriesViewProps {
  detail: PlayoffSeriesDetailResponse;
  /** The shared filter bar, placed directly under the back row. */
  filterBar?: React.ReactNode;
}

export function teamVars(team: string, season: string): CSSProperties | undefined {
  const accent = teamAccent(team, season);
  return accent ? ({ "--team-color": accent } as CSSProperties) : undefined;
}

function HeroTeam({ team, detail, side }: { team: TeamSeriesStats; detail: PlayoffSeriesDetailResponse; side: "left" | "right" }) {
  const { city, nickname } = splitTeamName(team.team_name);
  const winner = detail.winner_team_id === team.team_id;
  const lost = Boolean(detail.winner_team_id) && !winner;
  const record = recordLabel(team);
  return (
    <div className={`ps-hero-team ${lost ? "is-out" : ""}`} data-side={side} style={teamVars(team.team_id, detail.season)}>
      <span className="ps-hero-logo"><TeamLogo team={team.team_id} season={detail.season} size={88} /></span>
      <span className="ps-hero-city">{city}</span>
      <Link className="ps-hero-name" href={`/teams/${team.team_id}?season=${detail.season}&phase=playoffs`}>{nickname}</Link>
      <span className="ps-hero-meta">
        {team.seed != null && <span className="ps-hero-seed">#{team.seed}</span>}
        {record && <strong>{record}</strong>}
        {detail.conference && <span>{detail.conference === "Western" ? "West" : detail.conference === "Eastern" ? "East" : detail.conference}</span>}
      </span>
      <span className="ps-hero-wins">{team.wins}<span className="sr-only"> series wins</span></span>
    </div>
  );
}

function SeasonSeries({ detail }: { detail: PlayoffSeriesDetailResponse }) {
  const games = detail.season_series ?? [];
  const label = seasonSeriesLabel({
    team1: { ...detail.team1, name: detail.team1.team_name, season_series_wins: detail.team1.season_series_wins },
    team2: { ...detail.team2, name: detail.team2.team_name, season_series_wins: detail.team2.season_series_wins }
  });
  if (!games.length || !label) return <p className="ps-meetings-none">No regular-season meetings in this release.</p>;
  return (
    <details className="ps-meetings">
      <ButtonSummary variant="text" size="sm" iconAfter="chevron-down">Regular season: {label}</ButtonSummary>
      <ol className="ps-meetings-list">
        {games.map(game => (
          <li key={game.game_id}>
            <span className="ps-meetings-date">{formatDate(game.game_date)}</span>
            <span className={game.winner_team_id === game.away_team_id ? "is-winner" : ""}><TeamCode team={game.away_team_id} code={game.away_tricode} season={detail.season} /> {game.away_score}</span>
            <span className="ps-meetings-at">@</span>
            <span className={game.winner_team_id === game.home_team_id ? "is-winner" : ""}><TeamCode team={game.home_team_id} code={game.home_tricode} season={detail.season} /> {game.home_score}</span>
          </li>
        ))}
      </ol>
    </details>
  );
}

function Hero({ detail }: { detail: PlayoffSeriesDetailResponse }) {
  const { team1, team2 } = detail;
  const winner = detail.winner_team_id === team1.team_id ? team1 : detail.winner_team_id === team2.team_id ? team2 : null;
  const leader = team1.wins === team2.wins ? null : team1.wins > team2.wins ? team1 : team2;
  return (
    <section className="ps-hero" aria-label="Series" style={{ "--team-a": teamAccent(team1.team_id, detail.season) ?? "var(--color-info)", "--team-b": teamAccent(team2.team_id, detail.season) ?? "var(--color-brand)" } as CSSProperties}>
      <p className="ps-kicker">{detail.conference ? <>{detail.conference} Conference <span aria-hidden="true">·</span> </> : null}<strong>{detail.round_name}</strong></p>
      <div className="ps-hero-grid">
        <HeroTeam team={team1} detail={detail} side="left" />
        <div className="ps-hero-centre">
          {winner ? (
            <span className="ps-hero-winner" style={teamVars(winner.team_id, detail.season)}>
              <span className="ps-hero-winner-label"><Icon name="trophy" size={14} />Series winner</span>
              <TeamLogo team={winner.team_id} season={detail.season} size={56} />
              <strong>{winner.team_name}</strong>
            </span>
          ) : (
            <span className="ps-hero-status">{team1.games_played ? leader ? `${leader.tricode} leads ${Math.max(team1.wins, team2.wins)}–${Math.min(team1.wins, team2.wins)}` : `Series tied ${team1.wins}–${team2.wins}` : "Not started"}</span>
          )}
        </div>
        <HeroTeam team={team2} detail={detail} side="right" />
      </div>
      <SeasonSeries detail={detail} />
    </section>
  );
}

function GameCard({ card, season }: { card: PlayoffGameCard; season: string }) {
  if (card.status === "unplayed_placeholder" || card.home_score == null || card.away_score == null) {
    return <li className="ps-game is-unplayed"><span className="ps-game-number">Game {card.game_number}</span><span className="ps-game-empty">Not played</span></li>;
  }
  const rows = [
    { team: card.away_team_id, code: card.away_team_tricode, score: card.away_score },
    { team: card.home_team_id, code: card.home_team_tricode, score: card.home_score }
  ];
  return (
    <li className="ps-game">
      <span className="ps-game-number">Game {card.game_number}</span>
      {rows.map(row => (
        <span key={row.code} className={`ps-game-row ${card.winner_team_id === row.team ? "is-winner" : ""}`} style={teamVars(row.team, season)}>
          <TeamCode team={row.team} code={row.code} season={season} size={18} /><strong>{row.score}</strong>
        </span>
      ))}
      <span className="ps-game-foot">Final{card.game_date ? ` · ${formatDate(card.game_date)}` : ""}</span>
    </li>
  );
}

function Trajectory({ detail, bestOf }: { detail: PlayoffSeriesDetailResponse; bestOf: number }) {
  const byNumber = new Map(detail.game_cards.map(card => [card.game_number, card]));
  const count = Math.max(bestOf, ...detail.game_cards.map(card => card.game_number));
  return (
    <section className="player-glass ps-panel" aria-labelledby="ps-trajectory">
      <header className="ps-panel-head">
        <h2 id="ps-trajectory"><Icon name="activity" size={20} />Series Trajectory</h2>
        <span>Best of {bestOf}</span>
      </header>
      <ol className="ps-games" style={{ "--ps-games": count } as CSSProperties}>
        {Array.from({ length: count }, (_, index) => {
          const card = byNumber.get(index + 1) ?? ({ game_number: index + 1, status: "unplayed_placeholder" } as PlayoffGameCard);
          return <GameCard key={index} card={card} season={detail.season} />;
        })}
      </ol>
    </section>
  );
}

function Bars({ title, icon, rows, detail, note }: { title: string; icon: "scale" | "chart-column"; rows: ComparisonBar[]; detail: PlayoffSeriesDetailResponse; note?: string }) {
  const id = `ps-${title.toLowerCase().replace(/\s+/g, "-")}`;
  const known = rows.some(row => row.team1 != null && row.team2 != null);
  return (
    <section className="player-glass ps-panel" aria-labelledby={id}>
      <header className="ps-panel-head">
        <h2 id={id}><Icon name={icon} size={20} />{title}</h2>
        {note && <span>{note}</span>}
      </header>
      {known ? (
        <table className="ps-bars">
          <thead>
            <tr>
              <th scope="col" className="ps-bars-track"><span className="sr-only">{detail.team1.tricode} bar</span></th>
              <th scope="col" style={teamVars(detail.team1.team_id, detail.season)}><TeamCode team={detail.team1.team_id} code={detail.team1.tricode} season={detail.season} size={20} /></th>
              <th scope="col"><span className="sr-only">Measure</span></th>
              <th scope="col" style={teamVars(detail.team2.team_id, detail.season)}><TeamCode team={detail.team2.team_id} code={detail.team2.tricode} season={detail.season} size={20} /></th>
              <th scope="col" className="ps-bars-track"><span className="sr-only">{detail.team2.tricode} bar</span></th>
            </tr>
          </thead>
          <tbody>
            {rows.map(row => (
              <tr key={row.key}>
                <td className="ps-bars-track" data-side="left" style={{ ...teamVars(detail.team1.team_id, detail.season), "--fill": row.fill1 } as CSSProperties}><i className={row.better === "team1" ? "is-better" : ""} /></td>
                <td className={`ps-bars-value ${row.better === "team1" ? "is-better" : ""}`} style={teamVars(detail.team1.team_id, detail.season)}>{row.format(row.team1)}</td>
                <th scope="row">{row.label}</th>
                <td className={`ps-bars-value ${row.better === "team2" ? "is-better" : ""}`} style={teamVars(detail.team2.team_id, detail.season)}>{row.format(row.team2)}</td>
                <td className="ps-bars-track" data-side="right" style={{ ...teamVars(detail.team2.team_id, detail.season), "--fill": row.fill2 } as CSSProperties}><i className={row.better === "team2" ? "is-better" : ""} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : <p className="player-open-empty">Box scores start in 1983-84; this series has game scores only.</p>}
    </section>
  );
}

type AveragesView = "basic" | "advanced";
type AveragesTeam = "both" | "team1" | "team2";

interface AverageColumn {
  key: string;
  label: string;
  group: string;
  title: string;
  value: (player: PlayerSeriesStats) => number | null;
  format: (value: number | null) => string;
}

const perGame = (total: (p: PlayerSeriesStats) => number) => (p: PlayerSeriesStats) => p.games_played ? total(p) / p.games_played : null;
const one = (value: number | null) => value == null ? "—" : value.toFixed(1);
const pct = (value: number | null) => formatPercent(value);
const ratio = (num: (p: PlayerSeriesStats) => number, den: (p: PlayerSeriesStats) => number) => (p: PlayerSeriesStats) => den(p) ? num(p) / den(p) : null;

const PROFILE: AverageColumn[] = [
  { key: "gp", label: "GP", group: "Profile", title: "Games played", value: p => p.games_played, format: v => v == null ? "—" : String(v) },
  { key: "min", label: "MIN", group: "Profile", title: "Minutes per game", value: p => p.minutes_per_game, format: one }
];

const COLUMNS: Record<AveragesView, AverageColumn[]> = {
  basic: [
    ...PROFILE,
    { key: "pts", label: "PTS", group: "Scoring", title: "Points per game", value: p => p.points_per_game, format: one },
    { key: "ts", label: "TS%", group: "Scoring", title: "True shooting percentage", value: p => p.ts_pct, format: pct },
    { key: "reb", label: "REB", group: "Counting", title: "Rebounds per game", value: p => p.rebounds_per_game, format: one },
    { key: "ast", label: "AST", group: "Counting", title: "Assists per game", value: p => p.assists_per_game, format: one },
    { key: "stl", label: "STL", group: "Counting", title: "Steals per game", value: p => p.steals_per_game, format: one },
    { key: "blk", label: "BLK", group: "Counting", title: "Blocks per game", value: p => p.blocks_per_game, format: one },
    { key: "tov", label: "TOV", group: "Counting", title: "Turnovers per game", value: p => p.turnovers_per_game, format: one },
    { key: "fgm", label: "FGM", group: "Shooting", title: "Field goals made per game", value: perGame(p => p.fgm), format: one },
    { key: "fga", label: "FGA", group: "Shooting", title: "Field goals attempted per game", value: perGame(p => p.fga), format: one },
    { key: "fg3m", label: "3PM", group: "Shooting", title: "Threes made per game", value: perGame(p => p.fg3m), format: one },
    { key: "fg3a", label: "3PA", group: "Shooting", title: "Threes attempted per game", value: perGame(p => p.fg3a), format: one },
    { key: "ftm", label: "FTM", group: "Shooting", title: "Free throws made per game", value: perGame(p => p.ftm), format: one },
    { key: "fta", label: "FTA", group: "Shooting", title: "Free throws attempted per game", value: perGame(p => p.fta), format: one },
    { key: "fg", label: "FG%", group: "Shooting", title: "Field goal percentage", value: p => p.fg_pct, format: pct },
    { key: "fg3", label: "3P%", group: "Shooting", title: "Three-point percentage", value: p => p.fg3_pct, format: pct },
    { key: "ft", label: "FT%", group: "Shooting", title: "Free throw percentage", value: p => p.ft_pct, format: pct }
  ],
  advanced: [
    ...PROFILE,
    { key: "ts", label: "TS%", group: "Efficiency", title: "True shooting percentage", value: p => p.ts_pct, format: pct },
    { key: "efg", label: "eFG%", group: "Efficiency", title: "Effective field goal percentage", value: p => p.efg_pct, format: pct },
    { key: "par3", label: "3PAr", group: "Efficiency", title: "Share of field goal attempts from three", value: ratio(p => p.fg3a, p => p.fga), format: pct },
    { key: "ftr", label: "FTr", group: "Efficiency", title: "Free throw attempts per field goal attempt", value: ratio(p => p.fta, p => p.fga), format: v => v == null ? "—" : v.toFixed(3) },
    { key: "oreb", label: "OREB", group: "Rebounding", title: "Offensive rebounds per game", value: perGame(p => p.offensive_rebounds), format: one },
    { key: "dreb", label: "DREB", group: "Rebounding", title: "Defensive rebounds per game", value: perGame(p => p.defensive_rebounds), format: one },
    { key: "ast", label: "AST", group: "Playmaking", title: "Assists per game", value: p => p.assists_per_game, format: one },
    { key: "tov", label: "TOV", group: "Playmaking", title: "Turnovers per game", value: p => p.turnovers_per_game, format: one },
    { key: "asto", label: "AST/TO", group: "Playmaking", title: "Assists per turnover", value: ratio(p => p.assists_total, p => p.turnovers_total), format: v => v == null ? "—" : v.toFixed(2) },
    { key: "stl", label: "STL", group: "Defense", title: "Steals per game", value: p => p.steals_per_game, format: one },
    { key: "blk", label: "BLK", group: "Defense", title: "Blocks per game", value: p => p.blocks_per_game, format: one },
    { key: "pf", label: "PF", group: "Defense", title: "Personal fouls per game", value: p => p.fouls_per_game, format: one }
  ]
};

function Averages({ detail }: { detail: PlayoffSeriesDetailResponse }) {
  const [view, setView] = useState<AveragesView>("basic");
  const [team, setTeam] = useState<AveragesTeam>("both");
  const [sort, setSort] = useState<{ key: string; dir: "asc" | "desc" }>({ key: "pts", dir: "desc" });
  const columns = COLUMNS[view];
  const players = useMemo(() => {
    const list = team === "both" ? [...detail.team1_players, ...detail.team2_players] : team === "team1" ? detail.team1_players : detail.team2_players;
    const column = columns.find(c => c.key === sort.key);
    const sign = sort.dir === "asc" ? 1 : -1;
    if (sort.key === "player") return [...list].sort((a, b) => sign * a.player_name.localeCompare(b.player_name));
    if (!column) return [...list].sort((a, b) => b.points_per_game - a.points_per_game);
    return [...list].sort((a, b) => {
      const x = column.value(a);
      const y = column.value(b);
      if (x == null) return 1;
      if (y == null) return -1;
      return sign * (x - y);
    });
  }, [detail, team, sort, columns]);
  const onSort = (key: string) => setSort(current => current.key === key ? { key, dir: current.dir === "asc" ? "desc" : "asc" } : { key, dir: key === "player" ? "asc" : "desc" });
  const groups = columns.reduce<{ name: string; span: number }[]>((all, column) => {
    const last = all.at(-1);
    if (last?.name === column.group) last.span += 1;
    else all.push({ name: column.group, span: 1 });
    return all;
  }, []);
  const starts = new Set(columns.filter((column, index) => index === 0 || columns[index - 1].group !== column.group).map(column => column.key));
  const tricode = (id: string) => id === detail.team1.team_id ? detail.team1.tricode : detail.team2.tricode;
  const played = detail.team1.games_played;

  if (!detail.team1_players.length && !detail.team2_players.length) {
    return (
      <section className="player-glass ps-panel" aria-labelledby="ps-averages">
        <header className="ps-panel-head"><h2 id="ps-averages"><Icon name="table" size={20} />Series Averages</h2></header>
        <p className="player-open-empty">Player box scores start in 1983-84; the {detail.season} playoffs have game scores only.</p>
      </section>
    );
  }

  return (
    <>
      <div className="ps-switch">
        <Segmented<AveragesView> size="md" label="Averages view" value={view} onChange={setView} options={[{ value: "basic", label: "Basic" }, { value: "advanced", label: "Advanced" }]} />
      </div>
      <section className="player-glass ps-panel" aria-labelledby="ps-averages">
        <header className="ps-panel-head">
          <h2 id="ps-averages"><Icon name="table" size={20} />Series Averages <span className="ps-chip">{played} of {played} games</span></h2>
          <span>Per game</span>
        </header>
        <div className="ps-switch">
          <Segmented<AveragesTeam> size="sm" label="Series players" value={team} onChange={setTeam} options={[
            { value: "both", label: "Both" }, { value: "team1", label: <TeamCode team={detail.team1.team_id} code={detail.team1.tricode} season={detail.season} /> }, { value: "team2", label: <TeamCode team={detail.team2.team_id} code={detail.team2.tricode} season={detail.season} /> }
          ]} />
        </div>
        <div className="player-ref-grid-frame">
          <div className="player-ref-grid-scroll ps-averages-scroll" role="region" aria-label="Series averages scroll area" tabIndex={0}>
            <table className="player-ref-grid ps-averages" style={{ "--grid-min-width": `${200 + columns.length * 64}px` } as CSSProperties}>
              <colgroup>
                <col className="player-ref-grid-lead-column" />
                {columns.map(column => <col key={column.key} />)}
              </colgroup>
              <thead>
                <tr className="player-ref-grid-tier-1">
                  <th scope="col" className="player-ref-grid-lead">Player</th>
                  {groups.map(group => <th key={group.name} scope="colgroup" colSpan={group.span}>{group.name}</th>)}
                </tr>
                <tr className="player-ref-grid-tier-2">
                  <SortHeader className="player-ref-grid-lead" label="Name" metric="player" active={sort.key === "player"} direction={sort.dir} onSort={onSort} />
                  {columns.map(column => (
                    <SortHeader key={column.key} className={starts.has(column.key) ? "group-start" : ""} label={column.label} metric={column.key}
                      description={column.title} active={sort.key === column.key} direction={sort.dir} onSort={onSort} />
                  ))}
                </tr>
              </thead>
              <tbody>
                {players.map(player => (
                  <tr key={`${player.team_id}-${player.player_id}`}>
                    <th scope="row" className="player-ref-grid-lead">
                      <span className="ps-player">
                        <TeamLogo team={player.team_id} season={detail.season} size={16} />
                        <Link href={`/players/${player.player_id}?season=${detail.season}&phase=playoffs`}>{player.player_name}</Link>
                        <span className="sr-only">{tricode(player.team_id)}</span>
                      </span>
                    </th>
                    {columns.map(column => (
                      <td key={column.key} className={`${starts.has(column.key) ? "group-start" : ""} ${sort.key === column.key ? "is-sorted" : ""}`}>{column.format(column.value(player))}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>
    </>
  );
}

export function PlayoffsSeriesView({ detail, filterBar }: PlayoffsSeriesViewProps) {
  const { team1, team2, game_cards } = detail;
  const searchParams = useSearchParams();
  useNavLabel(`${team1.team_name} vs ${team2.team_name}`);
  const comparison = useMemo(() => seriesComparison(team1, team2), [team1, team2]);
  // A finished series' length follows from its winner (best-of-3 and -5 rounds before 2003).
  const bestOf = detail.winner_team_id ? 2 * Math.max(team1.wins, team2.wins) - 1 : Math.max(game_cards.length, 7);
  const played = `Series · ${team1.games_played} game${team1.games_played === 1 ? "" : "s"}`;

  return (
    <div className="playoffs-view-container ps-page">
      <div className="ps-top">
        <BackButton parent={{ href: buildPreservedContextUrl("/playoffs", searchParams), label: "Playoffs" }} />
        <ButtonLink size="md" variant="ghost" icon="scale"
          href={`/team-compare?teamA=${team1.team_id}&teamB=${team2.team_id}&season=${detail.season}&phase=playoffs`}>
          Compare teams
        </ButtonLink>
      </div>
      <PageHeader className="sr-only" title={`${team1.team_name} vs ${team2.team_name}`}
        subtitle={`${detail.season} Postseason · ${detail.round_name}${detail.conference ? ` · ${detail.conference}` : ""}`} />
      {filterBar}

      <Hero detail={detail} />
      <Trajectory detail={detail} bestOf={bestOf} />
      <div className="ps-pair">
        <Bars title="Team Comparison" icon="scale" rows={comparison.ratings} detail={detail} note={played} />
        <Bars title="Four Factors" icon="chart-column" rows={comparison.factors} detail={detail} />
      </div>
      <Averages detail={detail} />
      {detail.matchups && <SeriesMatchupsPanel detail={detail} matchups={detail.matchups} />}
      {(detail.impact?.length ?? 0) > 0 && <SeriesImpact detail={detail} boards={detail.impact ?? []} era={(team: string) => seasonEra(detail.season, team === team1.team_id ? team1.tricode : team2.tricode)} />}

      <GatedNote why="Unplayed games are never results and never enter ratings or averages. CourtLens shows no series-winner projections or win probabilities.">
        Completed games only; no winner projections.
      </GatedNote>
    </div>
  );
}
