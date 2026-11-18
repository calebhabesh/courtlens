"use client";

import type { MouseEvent as ReactMouseEvent, ReactNode } from "react";
import { IntentLink } from "@/components/intent-link";
import { awayFirst, easternToday, formatRecord, gameStatus, lineFavourite, predictionCall, seasonOf, shiftSlate, teamCode, type LiveGame, type LiveTeam } from "@/lib/live";
import { CourtLensSays } from "./brand";
import { TeamLogo } from "./team-logo";
import { EntityAnchor, TeamLink } from "./entity-link";
import { Icon } from "./ui/icon";
import { Tooltip } from "./ui/tooltip";

/** Days either side of the selected one in the strip (the reference site shows seven). */
const STRIP_RADIUS = 3;

function monthDay(day: string) {
  const date = new Date(`${day}T12:00:00Z`);
  return {
    month: new Intl.DateTimeFormat("en-US", { month: "short", timeZone: "UTC" }).format(date).toUpperCase(),
    day: date.getUTCDate(),
    long: new Intl.DateTimeFormat("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric", timeZone: "UTC" }).format(date),
  };
}

/** the reference site's centred seven-day strip: month over day, the open day in a gold box. */
export function DateStrip({ slate, calendar, href }: { slate: string; calendar?: readonly string[] | null; href: (day: string) => string }) {
  const days = Array.from({ length: STRIP_RADIUS * 2 + 1 }, (_, i) => shiftSlate(slate, i - STRIP_RADIUS));
  const today = easternToday();
  const known = calendar?.length ? new Set(calendar) : null;
  return <nav className="live-strip" aria-label="Live dates">
    <IntentLink className="live-strip-step" href={href(shiftSlate(slate, -1))} aria-label="Previous day"><Icon name="left" size={16} /></IntentLink>
    <ol className="live-strip-days">
      {days.map(day => {
        const label = monthDay(day);
        // The calendar covers the season's phase; outside its range a day is unknown, not empty.
        const empty = known && day >= calendar![0] && day <= calendar!.at(-1)! && !known.has(day);
        return <li key={day}>
          <IntentLink
            href={href(day)}
            className="live-strip-day"
            aria-current={day === slate ? "date" : undefined}
            data-today={day === today || undefined}
            data-empty={empty || undefined}
            aria-label={`${label.long}${day === today ? " (today)" : ""}${empty ? " · no games" : ""}`}
          >
            <span className="live-strip-month">{label.month}</span>
            <span className="live-strip-number">{label.day}</span>
          </IntentLink>
        </li>;
      })}
    </ol>
    <IntentLink className="live-strip-step" href={href(shiftSlate(slate, 1))} aria-label="Next day"><Icon name="right" size={16} /></IntentLink>
  </nav>;
}

/** The banner's "Hotkey: 2". */
export function HotkeyBadge({ n, label = "Hotkey:" }: { n: number; label?: string }) {
  if (n > 9) return null;
  return <span className="live-hotkey" aria-hidden="true"><span>{label}</span><kbd>{n}</kbd></span>;
}

/**
 * A card's keyboard shortcut as a plain key cap (follow-up 6): the reference site's "HK 1" read as jargon.
 * The tip above the cards explains 1–9; the tooltip and screen-reader text say it here too.
 */
function KeyCap({ n }: { n: number }) {
  if (n > 9) return null;
  return <kbd className="live-card-key" title={`Press ${n} to open this game`}>{n}<span className="sr-only">: press {n} to open this game</span></kbd>;
}

/** A team on a card: on the board its logo and code link to the team that season (site links D2);
 * in the compact rail the whole mini card is one link, so the team is plain. */
function TeamRow({ team, game, season, compact }: { team: LiveTeam; game: LiveGame; season: string; compact?: boolean }) {
  const played = game.status === "in_progress" || game.status === "final";
  const lost = game.status === "final" && team.winner === false;
  const identity = <>
    <TeamLogo team={team.tricode ?? team.canonical_id ?? teamCode(team)} season={season} size={compact ? 16 : 32} />
    <span className="live-card-team-text">
      <span className="live-card-team-line">
        <span className="live-card-code entity-link-text">{teamCode(team)}</span>
        {compact && <span className="live-side">{team.side === "home" ? "Home" : "Away"}</span>}
        {!compact && team.record && <span className="live-card-record">{formatRecord(team.record)}</span>}
      </span>
      {/* Follow-up 12: who is home and away, in grey under the code. */}
      {!compact && <span className="live-card-sub">
        <span className="live-side">{team.side === "home" ? "Home" : "Away"}</span>
        {game.status === "scheduled" && team.out != null && team.out > 0 && <span className="live-card-out"><span className="live-card-out-dot" aria-hidden="true" />{team.out} OUT</span>}
      </span>}
    </span>
  </>;
  return <span className="live-card-team" data-lost={lost || undefined} data-won={(game.status === "final" && team.winner) || undefined}>
    {compact ? identity : <TeamLink team={team.canonical_id} scope={{ season }} variant="block" className="live-card-team-link" title={team.name}>{identity}</TeamLink>}
    {game.status === "final" && team.winner && !compact && <span className="live-card-winner"><span className="sr-only">Winner</span></span>}
    <strong className="live-card-score">{played ? team.score ?? "—" : compact ? "" : "0"}</strong>
  </span>;
}

function label(game: LiveGame) {
  const teams = awayFirst(game.teams);
  return `${teams.map(t => `${t.name}${t.score != null ? ` ${t.score}` : ""}`).join(" at ")} · ${gameStatus(game)}`;
}

/** A team's logo, code and chance, as each row of a card's foot ends. */
function Pick({ team, percent, season }: { team: LiveTeam; percent: number; season: string }) {
  return <span className="live-card-pick">
    <TeamLogo team={team.tricode ?? team.canonical_id ?? teamCode(team)} season={season} size={14} />
    <strong>{teamCode(team)}</strong> <span className="live-card-call-pct">{percent}%</span>
  </span>;
}

const CALL_LEADS = { toss_up: "Toss-up, leaning", pregame: "Pregame call", called: "Called" } as const;

/**
 * The chip sits above the card's stretched link to get its own hover, so its click is handed to that
 * link: it opens the game as the rest of the card does, modifier keys included (a new tab on Cmd/Ctrl).
 */
function openCardGame(event: ReactMouseEvent<HTMLElement>) {
  const link = event.currentTarget.closest(".has-stretched-link")?.querySelector<HTMLAnchorElement>("a.is-stretched");
  link?.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, button: event.button,
    ctrlKey: event.ctrlKey, metaKey: event.metaKey, shiftKey: event.shiftKey, altKey: event.altKey }));
}

/** One of the book's numbers, saying what it means on hover (owner, 2026-11-18: "What does O/U mean?"); readers hear it with the chip. */
function LineChip({ tip, children }: { tip: string; children: ReactNode }) {
  return <Tooltip content={tip} className="live-chip-tip">
    <span className="live-chip" onClick={openCardGame}>{children}<span className="sr-only">. {tip}</span></span>
  </Tooltip>;
}

/**
 * A card's foot (owner, 2026-11-18): label-and-value rows under one hairline, labels on the left and
 * each team's logo, code and number on the right, so the numbers line up down the card. W4:
 * CourtLens' sealed call first; the favoured team is not coloured, and only a final call's ✓ and ✗
 * carry the green and red convention. W-D16: the call is the own read; the same seal's call with the
 * betting line follows in grey. Follow-up 8: the book's line last, naming the favourite. The model is
 * named in the titles only.
 */
function CardFoot({ game, season }: { game: LiveGame; season: string }) {
  const call = predictionCall(game);
  const odds = game.status === "scheduled" ? game.odds : null;
  const favourite = lineFavourite(odds, game.teams);
  const book = odds?.provider ?? "sportsbook";
  const line = favourite != null || odds?.over_under != null;
  if (!call && !line) return null;
  const sideTeam = (side?: "home" | "away") => side ? game.teams.find(t => t.side === side) : undefined;
  const team = call?.kind === "none" ? undefined : sideTeam(call?.side);
  const lineTeam = sideTeam(call?.withLine?.side);
  return <div className="live-card-foot">
    {call?.kind === "none" && <span className="live-card-call" data-call="none" title={call.title}>No prediction was sealed for this game</span>}
    {call && call.kind !== "none" && team && <span className="live-card-row live-card-call" data-call={call.kind} data-right={call.right == null ? undefined : String(call.right)} title={call.title}>
      {/* A final call's mark sits by "Called", so the chances keep one right edge. */}
      <span className="live-card-label">{call.kind === "favours" ? <><CourtLensSays size={10} /> favors</> : CALL_LEADS[call.kind]}
        {call.kind === "called" && call.right != null && <span className="live-card-call-mark"><Icon name={call.right ? "check" : "close"} size={14} /><span className="sr-only">{call.right ? "right" : "wrong"}</span></span>}</span>
      <span className="live-card-value"><Pick team={team} percent={call.percent!} season={season} /></span>
    </span>}
    {call?.withLine && lineTeam && <span className="live-card-row live-card-call-alt" title="The same seal with the betting line: the Market-informed model, on trial beside CourtLens' own read">
      <span className="live-card-label">With the line</span>
      <span className="live-card-value"><Pick team={lineTeam} percent={call.withLine.percent} season={season} /></span>
    </span>}
    {line && <span className="live-card-row live-card-line">
      <span className="live-card-label">Line</span>
      <span className="live-card-value">
        {favourite && <LineChip tip={favourite === "even" ? `Spread (${book}): an even game, no favorite` : `Spread (${book}): the ${favourite.team.name} are favored to win by ${favourite.points} points`}>
          {favourite === "even" ? "Even" : <><TeamLogo team={favourite.team.tricode ?? favourite.team.canonical_id ?? teamCode(favourite.team)} season={season} size={12} />{teamCode(favourite.team)} by {favourite.points}</>}
        </LineChip>}
        {odds?.over_under != null && <LineChip tip={`Over/under (${book}): the book expects about ${odds.over_under} points from both teams combined`}>O/U {odds.over_under}</LineChip>}
      </span>
    </span>}
  </div>;
}

/** One game on the board: status or tipoff, hotkey, both teams, then the call and the free line before tipoff. */
export function GameCard({ game, href, index }: { game: LiveGame; href: string; index: number }) {
  const teams = awayFirst(game.teams);
  const season = seasonOf(game.slate_date);
  // Site links D2: the card is one target that opens the game (a stretched link, first in tab
  // order), and each team's logo and code is its own link on top of it. Anchors never nest.
  return <article className="live-card has-stretched-link" data-status={game.status}>
    <EntityAnchor href={href} variant="stretched" className="live-card-head" label={label(game)}>
      <span className="live-card-status">{game.status === "in_progress" && <span className="live-dot" aria-hidden="true" />}{gameStatus(game)}</span>
      <span className="live-card-meta">
        <KeyCap n={index + 1} />
        <Icon name="right" size={14} className="live-card-chevron" />
      </span>
    </EntityAnchor>
    {teams.map(team => <TeamRow key={team.source_id} team={team} game={game} season={season} />)}
    <CardFoot game={game} season={season} />
  </article>;
}

/** The fixed All Games rail under a game: numbered mini cards, the open game outlined. */
export function AllGamesRail({ games, current, href }: { games: readonly LiveGame[]; current: string; href: (id: string) => string }) {
  if (games.length < 2) return null;
  return <nav className="live-rail" aria-label="All games">
    <span className="live-rail-title">All Games</span>
    <ol className="live-rail-list">
      {games.map((game, i) => <li key={game.source_id}>
        <IntentLink className="live-rail-card" href={href(game.source_id)} aria-current={game.source_id === current ? "page" : undefined} aria-label={label(game)}>
          <span className="live-rail-head"><span>{gameStatus(game)}</span>{i < 9 && <kbd>{i + 1}</kbd>}</span>
          {awayFirst(game.teams).map(team => <TeamRow key={team.source_id} team={team} game={game} season={seasonOf(game.slate_date)} compact />)}
        </IntentLink>
      </li>)}
    </ol>
  </nav>;
}

