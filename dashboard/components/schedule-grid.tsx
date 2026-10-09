import { formatDate } from "@/lib/format-date";
import type { ScheduleWeek } from "@/lib/types";
import { hasTeamLogo } from "@/lib/team-colors";
import { TeamLogo } from "./team-logo";
import { GatedNote } from "./ui/gated-note";

const weekday = new Intl.DateTimeFormat("en-US", { weekday: "short", timeZone: "UTC" });

export function ScheduleGrid({ schedule }: { schedule: ScheduleWeek }) {
  if (!schedule.days.length) {
    return (
      <GatedNote why="This schedule reads the loaded fantasy-league games table, which covers only the weeks loaded by the documented-provider refresh.">
        No games loaded for this week.
      </GatedNote>
    );
  }
  return (
    <div className="schedule-grid">
      {schedule.days.map((day) => (
        <article className={`day-card ${day.is_light_slate ? "light-day" : ""}`} key={day.date}>
          <header>
            <div>
              <span className="eyebrow">{weekday.format(new Date(`${day.date}T12:00:00Z`))}</span>
              <h3>{formatDate(day.date, "compact")}</h3>
            </div>
            <span className="slate-count">{day.game_count} {day.game_count === 1 ? "game" : "games"}</span>
          </header>
          {day.is_light_slate ? <span className="light-label">Light slate</span> : null}
          <div className="games-list">
            {day.games.map((game) => (
              <div className="game-row" key={game.id}>
                <span className="game-team">{hasTeamLogo(game.away.abbreviation) && <TeamLogo team={game.away.abbreviation} size={16} />}{game.away.abbreviation}{game.away.back_to_back ? <small className="b2b">B2B</small> : null}</span>
                <span className="at">@</span>
                <span className="game-team">{hasTeamLogo(game.home.abbreviation) && <TeamLogo team={game.home.abbreviation} size={16} />}{game.home.abbreviation}{game.home.back_to_back ? <small className="b2b">B2B</small> : null}</span>
                <time>
                  {new Intl.DateTimeFormat("en-US", {
                    hour: "numeric",
                    minute: "2-digit",
                    timeZone: schedule.timezone
                  }).format(new Date(game.tipoff_utc))}
                </time>
              </div>
            ))}
            {!day.games.length ? <span className="off-day">No games</span> : null}
          </div>
        </article>
      ))}
    </div>
  );
}
