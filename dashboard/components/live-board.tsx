"use client";

import Link from "next/link";
import { awayFirst, easternToday, gameStatus, lineFavourite, seasonOf, shiftSlate, teamCode, type LiveGame, type LiveTeam } from "@/lib/live";
import { TeamLogo } from "./team-logo";
import { Icon } from "./ui/icon";

/** Days either side of the selected one in the strip (Databallr shows seven). */
const STRIP_RADIUS = 3;

function monthDay(day: string) {
  const date = new Date(`${day}T12:00:00Z`);
  return {
    month: new Intl.DateTimeFormat("en-US", { month: "short", timeZone: "UTC" }).format(date).toUpperCase(),
    day: date.getUTCDate(),
    long: new Intl.DateTimeFormat("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric", timeZone: "UTC" }).format(date),
  };
}

/** Databallr's centred seven-day strip: month over day, the open day in a gold box. */
export function DateStrip({ slate, calendar, href }: { slate: string; calendar?: readonly string[] | null; href: (day: string) => string }) {
  const days = Array.from({ length: STRIP_RADIUS * 2 + 1 }, (_, i) => shiftSlate(slate, i - STRIP_RADIUS));
  const today = easternToday();
  const known = calendar?.length ? new Set(calendar) : null;
  return <nav className="live-strip" aria-label="Live dates">
    <Link className="live-strip-step" href={href(shiftSlate(slate, -1))} aria-label="Previous day"><Icon name="left" size={16} /></Link>
    <ol className="live-strip-days">
      {days.map(day => {
        const label = monthDay(day);
        // The calendar covers the season's phase; outside its range a day is unknown, not empty.
        const empty = known && day >= calendar![0] && day <= calendar!.at(-1)! && !known.has(day);
        return <li key={day}>
          <Link
            href={href(day)}
            className="live-strip-day"
            aria-current={day === slate ? "date" : undefined}
            data-today={day === today || undefined}
            data-empty={empty || undefined}
            aria-label={`${label.long}${day === today ? " (today)" : ""}${empty ? " · no games" : ""}`}
          >
            <span className="live-strip-month">{label.month}</span>
            <span className="live-strip-number">{label.day}</span>
          </Link>
        </li>;
      })}
    </ol>
    <Link className="live-strip-step" href={href(shiftSlate(slate, 1))} aria-label="Next day"><Icon name="right" size={16} /></Link>
  </nav>;
}

/** The banner's "Hotkey: 2". */
export function HotkeyBadge({ n, label = "Hotkey:" }: { n: number; label?: string }) {
  if (n > 9) return null;
  return <span className="live-hotkey" aria-hidden="true"><span>{label}</span><kbd>{n}</kbd></span>;
}

/**
 * A card's keyboard shortcut as a plain key cap (follow-up 6): Databallr's "HK 1" read as jargon.
 * The tip above the cards explains 1–9; the tooltip and screen-reader text say it here too.
 */
function KeyCap({ n }: { n: number }) {
  if (n > 9) return null;
  return <kbd className="live-card-key" title={`Press ${n} to open this game`}>{n}<span className="sr-only">: press {n} to open this game</span></kbd>;
}

function TeamRow({ team, game, season, compact }: { team: LiveTeam; game: LiveGame; season: string; compact?: boolean }) {
  const played = game.status === "in_progress" || game.status === "final";
  const lost = game.status === "final" && team.winner === false;
  return <span className="live-card-team" data-lost={lost || undefined} data-won={(game.status === "final" && team.winner) || undefined}>
    <TeamLogo team={team.tricode ?? team.canonical_id ?? teamCode(team)} season={season} size={compact ? 16 : 32} />
    <span className="live-card-team-text">
      <span className="live-card-team-line">
        <span className="live-card-code">{teamCode(team)}</span>
        {!compact && team.record && <span className="live-card-record">{team.record}</span>}
      </span>
      {!compact && game.status === "scheduled" && team.out != null && team.out > 0 && <span className="live-card-out"><span className="live-card-out-dot" aria-hidden="true" />{team.out} OUT</span>}
    </span>
    {game.status === "final" && team.winner && !compact && <span className="live-card-winner"><span className="sr-only">Winner</span></span>}
    <strong className="live-card-score">{played ? team.score ?? "—" : compact ? "" : "0"}</strong>
  </span>;
}

function label(game: LiveGame) {
  const teams = awayFirst(game.teams);
  return `${teams.map(t => `${t.name}${t.score != null ? ` ${t.score}` : ""}`).join(" at ")} · ${gameStatus(game)}`;
}

/** One game on the board: status or tipoff, hotkey, the free line before tipoff, both teams. */
export function GameCard({ game, href, index }: { game: LiveGame; href: string; index: number }) {
  const teams = awayFirst(game.teams);
  const season = seasonOf(game.slate_date);
  const odds = game.status === "scheduled" ? game.odds : null;
  const favourite = lineFavourite(odds, game.teams);
  const book = odds?.provider ?? "sportsbook";
  return <Link className="live-card" href={href} aria-label={label(game)} data-status={game.status}>
    <span className="live-card-head">
      <span className="live-card-status">{game.status === "in_progress" && <span className="live-dot" aria-hidden="true" />}{gameStatus(game)}</span>
      <span className="live-card-meta">
        <KeyCap n={index + 1} />
        <Icon name="right" size={14} className="live-card-chevron" />
      </span>
    </span>
    {teams.map(team => <TeamRow key={team.source_id} team={team} game={game} season={season} />)}
    {/* Follow-up 8: the line on its own row, naming the favourite, so the header never wraps. */}
    {(favourite || odds?.over_under != null) && <span className="live-card-line">
      {favourite && <span className="live-chip" title={favourite === "even" ? `Spread (${book}): an even game, no favorite` : `Spread (${book}): ${favourite.team.name} favored by ${favourite.points} points`}>{favourite === "even" ? "Even" : `${teamCode(favourite.team)} by ${favourite.points}`}</span>}
      {odds?.over_under != null && <span className="live-chip" title={`Over/under (${book}): about ${odds.over_under} points combined`}>O/U {odds.over_under}</span>}
    </span>}
  </Link>;
}

/** The fixed All Games rail under a game: numbered mini cards, the open game outlined. */
export function AllGamesRail({ games, current, href }: { games: readonly LiveGame[]; current: string; href: (id: string) => string }) {
  if (games.length < 2) return null;
  return <nav className="live-rail" aria-label="All games">
    <span className="live-rail-title">All Games</span>
    <ol className="live-rail-list">
      {games.map((game, i) => <li key={game.source_id}>
        <Link className="live-rail-card" href={href(game.source_id)} aria-current={game.source_id === current ? "page" : undefined} aria-label={label(game)}>
          <span className="live-rail-head"><span>{gameStatus(game)}</span>{i < 9 && <kbd>{i + 1}</kbd>}</span>
          {awayFirst(game.teams).map(team => <TeamRow key={team.source_id} team={team} game={game} season={seasonOf(game.slate_date)} compact />)}
        </Link>
      </li>)}
    </ol>
  </nav>;
}

