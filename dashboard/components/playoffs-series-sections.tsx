"use client";

import { useMemo, useState, type CSSProperties } from "react";
import Link from "next/link";
import type { PortraitEra } from "@/lib/portrait-source";
import { seasonEra } from "@/lib/portrait-source";
import { formatDate } from "@/lib/format-date";
import { teamAccent } from "@/lib/team-colors";
import {
  matchupEfg,
  matchupOpponents,
  matchupPlayers,
  matchupTotal,
  pointsPer75,
  shortName,
  type MatchupLine,
  type MatchupPhase,
  type MatchupSide
} from "@/lib/playoffs";
import type { PlayoffSeriesDetailResponse, SeriesImpactBoard, SeriesImpactPlayer, SeriesMatchups } from "@/lib/types";
import { TeamLogo } from "./team-logo";
import { Icon } from "./ui/icon";
import { PlayerAvatar } from "./ui/identity";
import { Segmented } from "./ui/kit";

function vars(team: string, season: string): CSSProperties | undefined {
  const accent = teamAccent(team, season);
  return accent ? ({ "--team-color": accent } as CSSProperties) : undefined;
}

/** A team code with its logo beside it, so teams scan by mark as well as letters (row 8, 14). */
export function TeamCode({ team, code, season, size = 16 }: { team: string; code: string; season: string; size?: number }) {
  return <span className="ps-team-code"><TeamLogo team={team} season={season} size={size} />{code}</span>;
}

type TeamKey = "team1" | "team2";

/** eFG% tone from the offence's view on offence and the defence's on defence. */
function efgTone(efg: number | null, side: MatchupSide): string {
  if (efg == null) return "";
  const good = side === "offense" ? efg >= 0.56 : efg <= 0.48;
  const bad = side === "offense" ? efg <= 0.48 : efg >= 0.56;
  return good ? "is-good" : bad ? "is-bad" : "";
}

export function SeriesMatchupsPanel({ detail, matchups }: { detail: PlayoffSeriesDetailResponse; matchups: SeriesMatchups }) {
  const [teamKey, setTeamKey] = useState<TeamKey>("team1");
  const [side, setSide] = useState<MatchupSide>("offense");
  const [phase, setPhase] = useState<MatchupPhase>("playoffs");
  const [picked, setPicked] = useState<string | null>(null);
  const team = detail[teamKey];
  const opponent = teamKey === "team1" ? detail.team2 : detail.team1;
  const players = useMemo(() => matchupPlayers(matchups.rows, team.team_id, side, phase), [matchups.rows, team.team_id, side, phase]);
  const focus = players.find(player => player.player_id === picked) ?? players[0];
  const lines = useMemo(() => focus ? matchupOpponents(matchups.rows, focus.player_id, side, phase) : [], [matchups.rows, focus, side, phase]);
  const total = matchupTotal(lines);
  const most = Math.max(...lines.map(line => line.possessions), 1);
  const phaseGames = phase === "playoffs" ? matchups.playoff_games : phase === "regular_season" ? matchups.regular_season_games : matchups.playoff_games + matchups.regular_season_games;
  const opponentLabel = side === "offense" ? "Defender" : "Scorer";
  const teamOption = (key: TeamKey) => ({
    value: key,
    label: <TeamCode team={detail[key].team_id} code={detail[key].tricode} season={detail.season} />
  });

  return (
    <section className="player-glass ps-panel ps-matchups" aria-labelledby="ps-matchups">
      <header className="ps-panel-head ps-panel-head-centred">
        <h2 id="ps-matchups"><Icon name="swords" size={20} />Matchups</h2>
        <span className="ps-chip">{matchups.playoff_games} of {matchups.playoff_games_played} playoff games</span>
        <span>NBA.com tracking assigns each possession to a defender; the data can be messy.</span>
      </header>
      <div className="ps-mu-controls">
        <Segmented<TeamKey> size="sm" label="Team" value={teamKey} onChange={value => { setTeamKey(value); setPicked(null); }} options={[teamOption("team1"), teamOption("team2")]} />
        <Segmented<MatchupSide> size="sm" label="Role" value={side} onChange={value => { setSide(value); setPicked(null); }} options={[{ value: "offense", label: "On Offense" }, { value: "defense", label: "On Defense" }]} />
        <Segmented<MatchupPhase> size="sm" label="Games" value={phase} onChange={setPhase} options={[
          { value: "playoffs", label: "Playoffs" },
          { value: "regular_season", label: "Regular Season", disabled: matchups.regular_season_games === 0 },
          { value: "all", label: "All" }
        ]} />
      </div>
      {players.length > 0 && focus ? (
        <>
          <div className="ps-mu-strip" role="region" aria-label={`${team.tricode} players`} tabIndex={0}>
            <Segmented<string> size="sm" dense label={`${team.tricode} player`} value={focus.player_id} onChange={setPicked}
              options={players.map(player => ({ value: player.player_id, label: player.player_name, title: `${player.possessions.toFixed(1)} possessions` }))} />
          </div>
          <div className="ps-mu-card" style={vars(team.team_id, detail.season)}>
            <PlayerAvatar playerId={focus.player_id} name={focus.player_name} team={team.team_id} size="lg" era={seasonEra(detail.season, team.tricode)} />
            <div>
              <Link className="ps-mu-name" href={`/players/${focus.player_id}?season=${detail.season}&phase=playoffs`}>{focus.player_name}</Link>
              <p>{side === "offense" ? "Faced" : "Guarded"} <strong style={vars(opponent.team_id, detail.season)}><TeamCode team={opponent.team_id} code={opponent.tricode} season={detail.season} /></strong> {side === "offense" ? "defenders" : "scorers"} across <strong>{Math.round(focus.possessions)}</strong> possessions in {phaseGames} game{phaseGames === 1 ? "" : "s"}</p>
            </div>
          </div>
          <div className="player-ref-grid-frame">
            <div className="player-ref-grid-scroll" role="region" aria-label="Matchup table scroll area" tabIndex={0}>
              <table className="player-ref-grid ps-mu-table" style={{ "--grid-min-width": "640px" } as CSSProperties}>
                <colgroup><col className="player-ref-grid-lead-column" />{Array.from({ length: 7 }, (_, i) => <col key={i} />)}</colgroup>
                <thead>
                  <tr className="player-ref-grid-tier-2">
                    <th scope="col" className="player-ref-grid-lead">{opponentLabel}</th>
                    <th scope="col" title="Partial possessions NBA.com assigned to the pair">POSS</th>
                    <th scope="col">PTS</th>
                    <th scope="col" title="Effective field goal percentage on the pair's shots">eFG%</th>
                    <th scope="col" title="Points per 75 possessions">PTS/75</th>
                    <th scope="col">FTA</th>
                    <th scope="col">AST</th>
                    <th scope="col">TOV</th>
                  </tr>
                </thead>
                <tbody>
                  {lines.map(line => <MatchupRow key={line.player_id} line={line} share={line.possessions / most} side={side} team={opponent.team_id} season={detail.season} />)}
                </tbody>
                <tfoot>
                  <MatchupRow line={total} side={side} team={opponent.team_id} season={detail.season} />
                </tfoot>
              </table>
            </div>
          </div>
        </>
      ) : <p className="player-open-empty">No matchup rows for {team.tricode} in these games.</p>}
      <ul className="ps-footnotes">
        <li>The total PTS/75 is implied by NBA.com&apos;s matchup data, which credits partial possessions, so it may not match the box score.</li>
        <li>Possessions where tracking assigns no defender are missing from these rows.</li>
        <li>Data via NBA.com ({matchups.source}).</li>
      </ul>
    </section>
  );
}

function MatchupRow({ line, share, side, team, season }: { line: MatchupLine; share?: number; side: MatchupSide; team: string; season: string }) {
  const efg = matchupEfg(line);
  const per75 = pointsPer75(line);
  const total = share === undefined;
  return (
    <tr>
      <th scope="row" className="player-ref-grid-lead ps-mu-lead" style={{ ...vars(team, season), "--share": share ?? 0 } as CSSProperties}>
        <span className="ps-mu-bar" aria-hidden="true" />
        <span className="ps-mu-label">{total ? "Total" : shortName(line.player_name)}</span>
      </th>
      <td><strong>{line.possessions.toFixed(1)}</strong></td>
      <td>{line.points}</td>
      <td className={efgTone(efg, side)}>{efg == null ? "—" : `${Math.round(efg * 100)}%`}</td>
      <td>{per75 == null ? "—" : per75.toFixed(1)}</td>
      <td>{line.fta}</td>
      <td>{line.assists}</td>
      <td>{line.turnovers}</td>
    </tr>
  );
}

type Component = "total" | "offense" | "defense";

const COMPONENT_LABELS: Record<string, Record<Component, string>> = {
  darko: { total: "DPM", offense: "ODPM", defense: "DDPM" },
  rapm: { total: "RAPM", offense: "ORAPM", defense: "DRAPM" }
};

function signed(value: number | null): string {
  return value == null ? "—" : `${value > 0 ? "+" : ""}${value.toFixed(2)}`;
}

/** `ahead`: this player's value beats the other team's player at the same rank. */
function ImpactCell({ player, value, side, season, era, ahead }: { player: SeriesImpactPlayer | undefined; value: number | null; side: "left" | "right"; season: string; era: PortraitEra | null; ahead: boolean }) {
  if (!player) return <div className="ps-impact-cell is-empty" data-side={side} />;
  return (
    <div className={`ps-impact-cell ${ahead ? "is-ahead" : ""}`} data-side={side} style={vars(player.team_id, season)}>
      <PlayerAvatar playerId={player.player_id} name={player.player_name} team={player.team_id} size="md" era={era} />
      <span className="ps-impact-text">
        <Link href={`/players/${player.player_id}?season=${season}`}>{player.player_name}</Link>
        <span className={value == null ? "" : value >= 0 ? "is-good" : "is-bad"}>{signed(value)}</span>
      </span>
    </div>
  );
}

export function SeriesImpact({ detail, boards, era }: { detail: PlayoffSeriesDetailResponse; boards: SeriesImpactBoard[]; era: (team: string) => PortraitEra | null }) {
  const [metric, setMetric] = useState(boards[0].metric);
  const [component, setComponent] = useState<Component>("total");
  const board = boards.find(entry => entry.metric === metric) ?? boards[0];
  const labels = COMPONENT_LABELS[board.metric] ?? { total: board.label, offense: "Offense", defense: "Defense" };
  const ranked = (team: string) => board.players.filter(player => player.team_id === team)
    .sort((a, b) => (b[component] ?? -Infinity) - (a[component] ?? -Infinity));
  const left = ranked(detail.team1.team_id);
  const right = ranked(detail.team2.team_id);
  const rows = Math.max(left.length, right.length);

  return (
    <>
      {boards.length > 1 && (
        <div className="ps-switch">
          <Segmented<string> size="md" label="Impact model" value={board.metric} onChange={setMetric} options={boards.map(entry => ({ value: entry.metric, label: entry.label }))} />
        </div>
      )}
      <section className="player-glass ps-panel ps-impact" aria-labelledby="ps-impact" style={{ "--team-a": teamAccent(detail.team1.team_id, detail.season) ?? "var(--color-info)", "--team-b": teamAccent(detail.team2.team_id, detail.season) ?? "var(--color-brand)" } as CSSProperties}>
        <header className="ps-panel-head">
          <h2 id="ps-impact"><Icon name="chart-column" size={20} />{board.label} Face-Off</h2>
          <span>Top {Math.max(left.length, right.length)} by {board.label}{board.as_of ? ` · through ${formatDate(board.as_of)}` : ""}</span>
        </header>
        <div className="ps-switch">
          <Segmented<Component> size="sm" label={`${board.label} component`} value={component} onChange={setComponent} options={[
            { value: "total", label: labels.total }, { value: "offense", label: labels.offense }, { value: "defense", label: labels.defense }
          ]} />
        </div>
        <div className="ps-impact-head">
          <span style={vars(detail.team1.team_id, detail.season)}>{detail.team1.team_name}<TeamLogo team={detail.team1.team_id} season={detail.season} size={28} /></span>
          <span className="ps-impact-rank-head">{labels.total} rank</span>
          <span style={vars(detail.team2.team_id, detail.season)}><TeamLogo team={detail.team2.team_id} season={detail.season} size={28} />{detail.team2.team_name}</span>
        </div>
        <ol className="ps-impact-rows">
          {Array.from({ length: rows }, (_, index) => {
            const one = left[index]?.[component] ?? null;
            const two = right[index]?.[component] ?? null;
            // A rank with one player missing goes to the player who is there.
            const leftAhead = one != null && (two == null || one > two);
            const rightAhead = two != null && (one == null || two > one);
            return (
              <li key={index} className="ps-impact-row">
                <ImpactCell player={left[index]} value={one} side="left" season={detail.season} era={era(detail.team1.team_id)} ahead={leftAhead} />
                <span className="ps-impact-rank">#{index + 1}</span>
                <ImpactCell player={right[index]} value={two} side="right" season={detail.season} era={era(detail.team2.team_id)} ahead={rightAhead} />
              </li>
            );
          })}
        </ol>
        <p className="ps-impact-note">{board.note}. Players who appeared in the series. The shaded side has the higher {labels[component]} at that rank.</p>
      </section>
    </>
  );
}
