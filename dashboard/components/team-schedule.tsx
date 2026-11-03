"use client";

import { useState, type CSSProperties, type ReactNode } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { gameStatus, type LiveGame, type LiveTeam } from "@/lib/live";
import { useLiveRead } from "@/lib/use-live-read";
import { franchiseOf, teamArtwork, teamEra } from "@/lib/team-era";
import { teamBrandColor } from "@/lib/team-colors";
import { TeamWatermark } from "./team-watermark";
import { TeamLogo } from "./team-logo";
import { Icon } from "./ui/icon";
import { IconButton, Segmented } from "./ui/kit";

/** ESPN's team schedule read (`/api/live/teams/{team}/schedule`). */
export interface TeamScheduleData { team_source_id: string; season: string; year: number; season_type: number; games: (LiveGame & { note?: string | null })[]; dropped_events: number }

type ScheduleView = "calendar" | "log";
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const monthKey = (day: string) => day.slice(0, 7);
const monthName = (key: string, style: "long" | "short") =>
  new Intl.DateTimeFormat("en-US", { month: style, ...(style === "long" ? { year: "numeric" } : {}), timeZone: "UTC" }).format(new Date(`${key}-01T12:00:00Z`));
const easternToday = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(new Date());

/** One game from this team's side: its opponent, venue and result. */
export function teamSide(game: LiveGame, own: string) {
  const mine = (team: LiveTeam) => !!team.tricode && (franchiseOf(team.tricode) ?? team.tricode) === own;
  const team = game.teams.find(mine) ?? null;
  const opponent = game.teams.find(entry => entry !== team) ?? null;
  const played = game.status === "final" && team?.score != null && opponent?.score != null;
  const won = played ? team!.score! > opponent!.score! : null;
  return { team, opponent, home: team?.side === "home", won };
}

/** ESPN names franchises by today's code; the season's own (SEA in 1997-98) drives label, logo and colour. */
function opponentCode(opponent: LiveTeam | null, season: string): string {
  const franchise = opponent?.tricode ? franchiseOf(opponent.tricode) : null;
  return (franchise ? teamEra(franchise, season)?.code : null) ?? opponent?.tricode ?? opponent?.abbreviation ?? "—";
}

/** A game date takes its opponent's colours: brand tint and a large faded logo, as the comparison cards do. */
function opponentTheme(game: LiveGame | undefined, own: string, season: string) {
  const opponent = game ? teamSide(game, own).opponent : null;
  const code = opponent ? opponentCode(opponent, season) : null;
  const tint = code ? teamBrandColor(code, season) : null;
  return { style: tint ? ({ "--team-tint": tint } as CSSProperties) : undefined, art: code ? teamArtwork(code, season) : null };
}

/** Every month from the first game to the last, so empty months still page. */
export function scheduleMonths(games: readonly LiveGame[]): string[] {
  const days = games.map(game => game.slate_date).sort();
  if (!days.length) return [];
  const months: string[] = [];
  for (let [year, month] = days[0].split("-").map(Number); `${year}-${String(month).padStart(2, "0")}` <= monthKey(days.at(-1)!); month === 12 ? (year++, month = 1) : month++)
    months.push(`${year}-${String(month).padStart(2, "0")}`);
  return months;
}

/** The weeks of one month, Sunday first; days outside it are null. */
export function monthGrid(key: string): (string | null)[][] {
  const [year, month] = key.split("-").map(Number);
  const first = new Date(Date.UTC(year, month - 1, 1)).getUTCDay();
  const length = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const cells: (string | null)[] = [...Array(first).fill(null), ...Array.from({ length }, (_, i) => `${key}-${String(i + 1).padStart(2, "0")}`)];
  while (cells.length % 7) cells.push(null);
  return Array.from({ length: cells.length / 7 }, (_, i) => cells.slice(i * 7, i * 7 + 7));
}

/** Wins and losses among games played, e.g. "5–2". */
const record = (games: readonly LiveGame[], own: string) => {
  const results = games.map(game => teamSide(game, own).won).filter((won): won is boolean => won != null);
  return results.length ? `${results.filter(Boolean).length}–${results.filter(won => !won).length}` : null;
};

function GameCell({ game, own, season }: { game: LiveGame & { note?: string | null }; own: string; season: string }) {
  const { opponent, home, won } = teamSide(game, own);
  const code = opponentCode(opponent, season);
  const status = game.status === "final" ? null : game.status === "postponed" ? "Postponed" : game.status === "cancelled" ? "Cancelled" : gameStatus(game).replace(/ E[SD]T$/, "");
  const score = won == null ? null : `${teamSide(game, own).team!.score}–${opponent!.score}`;
  const result = won == null ? null : `${won ? "W" : "L"} ${score}`;
  const title = `${home ? "vs" : "at"} ${opponent?.name ?? code}${result ? `: ${result}` : status ? `: ${status}` : ""}${game.note ? ` (${game.note})` : ""}. Open the game page.`;
  return <Link className="team-cal-game" href={`/live/games/${game.source_id}?date=${game.slate_date}`} prefetch={false} title={title}
    data-result={won == null ? undefined : won ? "win" : "loss"} data-live={game.status === "in_progress" || undefined}>
    <span className="team-cal-opponent"><span className="team-cal-venue">{home ? "vs" : "@"}</span>
      {opponent?.tricode && <TeamLogo team={code} season={season} size={20} />}<strong>{code}</strong></span>
    <span className="team-cal-status">{won == null ? status : <><b>{won ? "W" : "L"}</b><span className="team-cal-score"> {score}</span></>}</span>
    {game.note && <span className="team-cal-note">{game.note.replace(/^NBA Cup.*/, "Cup")}</span>}
  </Link>;
}

/**
 * The team's whole season as a month calendar (ESPN's schedule: every game listed, played or
 * upcoming), each game opening its Live page; the Game Log is the other view. ESPN's schedule is
 * read now, so it shows games after the page's Through date too.
 */
export function TeamScheduleSection({ teamId, tricode, season, phase, log }: { teamId: string; tricode: string; season: string; phase: string; /** The Game Log table (admitted results). */ log: ReactNode }) {
  const params = useSearchParams();
  const [view, setView] = useState<ScheduleView>(params.get("schedule") === "log" ? "log" : "calendar");
  const { read, error } = useLiveRead<TeamScheduleData>(`/teams/${teamId}/schedule?season=${season}&phase=${phase}`);
  const own = franchiseOf(tricode) ?? tricode;
  const games = read?.data?.games ?? [];
  const months = scheduleMonths(games);
  const today = easternToday();
  const [chosen, setChosen] = useState<string | null>(null);
  const month = chosen && months.includes(chosen) ? chosen : months.includes(monthKey(today)) ? monthKey(today) : months[0] ?? null;
  const byDay = new Map<string, typeof games>();
  games.forEach(game => byDay.set(game.slate_date, [...(byDay.get(game.slate_date) ?? []), game]));
  const next = games.find(game => game.status === "scheduled" || game.status === "in_progress");
  const nextSide = next ? teamSide(next, own) : null;
  const index = month ? months.indexOf(month) : -1;
  const monthGames = month ? games.filter(game => monthKey(game.slate_date) === month) : [];

  function choose(nextView: ScheduleView) {
    setView(nextView);
    const url = new URL(window.location.href);
    if (nextView === "log") url.searchParams.set("schedule", "log"); else url.searchParams.delete("schedule");
    window.history.replaceState(null, "", url);
  }

  const summary = [
    games.length ? `${games.length} games` : null,
    record(games, own),
    next && nextSide?.opponent ? `Next: ${new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" }).format(new Date(`${next.slate_date}T12:00:00Z`))} ${nextSide.home ? "vs" : "@"} ${nextSide.opponent.tricode ?? nextSide.opponent.abbreviation}` : null,
  ].filter(Boolean).join(" · ");

  return <section id="schedule" className="player-open-section player-glass team-profile-section team-schedule" aria-label="Schedule">
    <header className="player-open-heading"><h2><Icon name="calendar" size={20} />Schedule</h2>
      <span className="team-schedule-tools">
        {view === "calendar" && summary && <span className="team-schedule-summary">{summary}</span>}
        <Segmented size="sm" label="Schedule view" value={view} onChange={choose} options={[{ value: "calendar", label: "Calendar" }, { value: "log", label: "Game Log" }]} />
      </span>
    </header>
    {view === "log" ? log : <>
      {month && <div className="team-cal-months">
        <IconButton size="sm" variant="ghost" icon="left" label="Previous month" disabled={index <= 0} onClick={() => setChosen(months[index - 1])} />
        <h3 className="team-cal-title" aria-live="polite">{monthName(month, "long")}{record(monthGames, own) && <span>{record(monthGames, own)}</span>}</h3>
        <IconButton size="sm" variant="ghost" icon="right" label="Next month" disabled={index >= months.length - 1} onClick={() => setChosen(months[index + 1])} />
        <span className="team-cal-month-picker"><Segmented size="sm" label="Month" value={month} onChange={setChosen}
          options={months.map(key => ({ value: key, label: monthName(key, "short"), title: monthName(key, "long") }))} /></span>
      </div>}
      {month ? <div className="team-cal-scroll" role="region" aria-label={`${monthName(month, "long")} games`} tabIndex={0}>
        <table className="team-cal">
          <thead><tr>{WEEKDAYS.map(day => <th key={day} scope="col"><abbr title={day}>{day}</abbr></th>)}</tr></thead>
          <tbody>{monthGrid(month).map((week, row) => <tr key={row}>{week.map((day, column) => {
            const dayGames = day ? byDay.get(day) ?? [] : [];
            const theme = opponentTheme(dayGames[0], own, season);
            return <td key={column} data-outside={!day || undefined} data-today={day === today || undefined} data-game={dayGames.length > 0 || undefined}
              data-themed={theme.style ? true : undefined} style={theme.style}>
              {theme.art && <TeamWatermark asset={theme.art.asset} className="team-cal-watermark" />}
              {day && <span className="team-cal-day">{Number(day.slice(8))}</span>}
              {dayGames.map(game => <GameCell key={game.source_id} game={game} own={own} season={season} />)}
            </td>;
          })}</tr>)}</tbody>
        </table>
      </div> : <p className="player-open-empty" role="status">{error ? "ESPN's schedule is unavailable right now." : read ? "ESPN lists no games for this team in this phase." : "Loading the schedule…"}</p>}
      <p className="player-reference-note">ESPN&apos;s schedule as read now (tip-off times Eastern), including games after the page&apos;s Through date. Each date takes its opponent&apos;s colours; vs is home, @ away; each game opens its Live page.{read?.data?.dropped_events ? ` ${read.data.dropped_events} listed game${read.data.dropped_events > 1 ? "s have" : " has"} no date yet.` : ""}</p>
    </>}
  </section>;
}
