"use client";

import { useId, useState, type CSSProperties } from "react";
import Link from "next/link";
import type { PlayoffSeriesSummary, TeamSeriesHeader } from "@/lib/types";
import { recordLabel, seasonSeriesLabel, type BracketLayout, type BracketSide, type BracketSlot } from "@/lib/playoffs-bracket";
import { splitTeamName } from "@/lib/playoffs";
import { teamAccent } from "@/lib/team-colors";
import { TeamLogo } from "./team-logo";
import { Icon } from "./ui/icon";
import { Segmented } from "./ui/kit";

type Focus = "Western" | "finals" | "Eastern";

function teamVars(team: string, season: string): CSSProperties | undefined {
  const accent = teamAccent(team, season);
  return accent ? ({ "--team-color": accent } as CSSProperties) : undefined;
}

function finished(series: PlayoffSeriesSummary): boolean {
  return Boolean(series.winner_team_id);
}

/**
 * One team's line in a bracket slot: logo with its seed, the full name (city over nickname) on
 * wide screens or the code on narrower ones, and series wins; a loser is dimmed.
 */
function SlotTeam({ team, series, seeded }: { team: TeamSeriesHeader; series: PlayoffSeriesSummary; seeded: boolean }) {
  const lost = finished(series) && series.winner_team_id !== team.team_id;
  const { city, nickname } = splitTeamName(team.name);
  return (
    <span className={`pb-team ${lost ? "is-out" : ""} ${series.winner_team_id === team.team_id ? "is-winner" : ""}`} style={teamVars(team.team_id, series.season)}>
      <span className="pb-logo">
        <TeamLogo team={team.team_id} season={series.season} size={44} />
        {seeded && team.seed != null && <span className="pb-seed">{team.seed}</span>}
      </span>
      <span className="pb-name" aria-hidden="true"><small>{city}</small><strong>{nickname}</strong></span>
      <span className="pb-code">{team.tricode}</span>
      <span className="pb-wins">{series.games_count ? team.wins : ""}</span>
    </span>
  );
}

function Slot({ slot, seeded, href }: { slot: BracketSlot; seeded: boolean; href: (slug: string) => string }) {
  const tip = useId();
  if (slot.kind === "bye") return <span className="pb-slot is-bye" aria-hidden="true" />;
  if (slot.kind === "tbd") return <span className="pb-slot is-tbd">TBD</span>;
  const { series } = slot;
  const meetings = seasonSeriesLabel(series);
  const records = [series.team1, series.team2].map(team => recordLabel(team) && `${team.tricode} ${recordLabel(team)}`).filter(Boolean);
  return (
    <Link className="pb-slot" href={href(series.slug)} aria-describedby={tip}
      aria-label={`${series.team1.name} vs ${series.team2.name}, ${series.series_score}`}>
      <SlotTeam team={series.team1} series={series} seeded={seeded} />
      <SlotTeam team={series.team2} series={series} seeded={seeded} />
      <span className="pb-pop" role="tooltip" id={tip}>
        <strong>{series.series_score}</strong>
        <span>{meetings ? `Regular season: ${meetings}` : "No regular-season meetings"}</span>
        {records.length > 0 && <span>{records.join(" · ")}</span>}
      </span>
    </Link>
  );
}

function SideView({ side, seeded, href, label }: { side: BracketSide; seeded: boolean; href: (slug: string) => string; label: string }) {
  const rows = side.columns[0].length;
  return (
    <div className="pb-side" data-side={side.conference} style={{ "--pb-columns": side.columns.length, "--pb-rows": rows } as CSSProperties}>
      <h2 className="pb-side-title">{label}</h2>
      {side.roundNames.map((name, index) => <span key={`${name}-${index}`} className="pb-round-name">{name}</span>)}
      {side.columns.map((column, index) => {
        const pairs = column.length > 1 ? Array.from({ length: column.length / 2 }, (_, pair) => column.slice(pair * 2, pair * 2 + 2)) : [column];
        return (
          <div key={index} className="pb-col" data-inner={index === side.columns.length - 1 || undefined}>
            {pairs.map((pair, p) => {
              const bye = pair.length === 2 ? pair[0].kind === "bye" ? "top" : pair[1].kind === "bye" ? "bottom" : undefined : undefined;
              const empty = pair.length === 2 && pair.every(slot => slot.kind === "bye");
              return (
                <div key={p} className="pb-pair" data-bye={empty ? "both" : bye} data-single={pair.length === 1 || undefined}>
                  {pair.map((slot, s) => {
                    const at = pair.length === 1 ? 0 : p * 2 + s;
                    const feeders = index > 0 ? side.columns[index - 1].slice(at * 2, at * 2 + 2) : [];
                    const unfed = index > 0 && feeders.every(feeder => feeder.kind === "bye");
                    return (
                      <div key={s} className={`pb-cell ${slot.kind === "bye" ? "is-bye" : ""}`} data-unfed={unfed || undefined}>
                        <Slot slot={slot} seeded={seeded} href={href} />
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}

function FinalsTeam({ team, series }: { team: TeamSeriesHeader; series: PlayoffSeriesSummary }) {
  const { city, nickname } = splitTeamName(team.name);
  const lost = finished(series) && series.winner_team_id !== team.team_id;
  return (
    <div className={`pb-finals-team ${lost ? "is-out" : ""}`} style={teamVars(team.team_id, series.season)}>
      <span className="pb-finals-logo"><TeamLogo team={team.team_id} season={series.season} size={104} /></span>
      <span className="pb-finals-city">{city}</span>
      <span className="pb-finals-name">{nickname}</span>
      <span className="pb-finals-meta">
        {team.seed != null && <span className="pb-finals-seed">#{team.seed}</span>}
        <span>{team.tricode}</span>
        {recordLabel(team) && <span className="pb-finals-record">{recordLabel(team)}</span>}
      </span>
      {series.games_count > 0 && <span className="pb-finals-wins">{team.wins}</span>}
    </div>
  );
}

function FinalsCard({ series, name, href }: { series: PlayoffSeriesSummary | null; name: string; href: (slug: string) => string }) {
  if (!series) {
    return (
      <div className="pb-finals">
        <span className="pb-finals-kicker">{name}</span>
        <div className="pb-finals-card is-tbd"><span>Finals matchup not set yet</span></div>
      </div>
    );
  }
  const one = splitTeamName(series.team1.name).nickname;
  const two = splitTeamName(series.team2.name).nickname;
  const meetings = seasonSeriesLabel(series);
  const winner = series.winner_team_id === series.team1.team_id ? series.team1 : series.winner_team_id === series.team2.team_id ? series.team2 : null;
  return (
    <div className="pb-finals">
      <span className="pb-finals-kicker">{name}</span>
      <p className="pb-finals-title" aria-hidden="true">
        <span style={teamVars(series.team1.team_id, series.season)}>{one}</span>
        <small>vs</small>
        <span style={teamVars(series.team2.team_id, series.season)}>{two}</span>
      </p>
      <Link className="pb-finals-card" href={href(series.slug)} aria-label={`${name}: ${series.team1.name} vs ${series.team2.name}, ${series.series_score}. Open the series breakdown.`}>
        <span className="pb-finals-teams">
          <FinalsTeam team={series.team1} series={series} />
          <span className="pb-finals-vs">vs</span>
          <FinalsTeam team={series.team2} series={series} />
        </span>
        <span className="pb-finals-foot">
          <span className="pb-finals-status">
            {winner ? <><Icon name="trophy" size={14} />{winner.tricode} won {Math.max(series.team1.wins, series.team2.wins)}–{Math.min(series.team1.wins, series.team2.wins)}</> : series.summary_text}
          </span>
          {meetings && <span className="pb-finals-meetings">Regular season: {meetings}</span>}
          <span className="pb-finals-pips">
            <span>Best of {series.total_scheduled}<span className="sr-only">, {series.games_count} played</span></span>
            {Array.from({ length: series.total_scheduled }, (_, game) => <i key={game} aria-hidden="true" className={game < series.games_count ? "is-played" : ""} />)}
          </span>
        </span>
      </Link>
      <span className="pb-finals-hint">Open any matchup for the full series breakdown.</span>
    </div>
  );
}

export function PlayoffsBracket({ layout, season, seeded, href }: { layout: BracketLayout; season: string; seeded: boolean; href: (slug: string) => string }) {
  const [focus, setFocus] = useState<Focus>("finals");
  const groupLabel = (side: BracketSide) => side.conference === "Western" ? "West" : "East";
  return (
    <section className="pb-bracket" aria-label={`${season} playoff bracket`} data-focus={focus}>
      <div className="pb-switch">
        <Segmented<Focus> size="md" label="Bracket side" value={focus} onChange={setFocus} options={[
          { value: "Western", label: groupLabel(layout.west) }, { value: "finals", label: "Finals" }, { value: "Eastern", label: groupLabel(layout.east) }
        ]} />
      </div>
      <div className="pb-grid">
        <SideView side={layout.west} seeded={seeded} href={href} label={`${groupLabel(layout.west)} bracket`} />
        <FinalsCard series={layout.finals} name={layout.finalsName} href={href} />
        <SideView side={layout.east} seeded={seeded} href={href} label={`${groupLabel(layout.east)} bracket`} />
      </div>
    </section>
  );
}
