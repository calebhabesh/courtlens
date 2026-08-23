import type { ScheduleWeek } from "@/lib/types";

const weekday = new Intl.DateTimeFormat("en-CA", { weekday: "short", timeZone: "UTC" });
const monthDay = new Intl.DateTimeFormat("en-CA", { month: "short", day: "numeric", timeZone: "UTC" });

export function ScheduleGrid({ schedule }: { schedule: ScheduleWeek }) {
  if (!schedule.days.length) {
    return (
      <div className="empty-state">
        <span className="empty-icon">○</span>
        <h3>No games loaded for this week</h3>
        <p>Choose another week or run the documented-provider refresh.</p>
      </div>
    );
  }
  return (
    <div className="schedule-grid">
      {schedule.days.map((day) => {
        const parsed = new Date(`${day.date}T12:00:00Z`);
        return (
          <article className={`day-card ${day.is_light_slate ? "light-day" : ""}`} key={day.date}>
            <header>
              <div>
                <span className="eyebrow">{weekday.format(parsed)}</span>
                <h3>{monthDay.format(parsed)}</h3>
              </div>
              <span className="slate-count">{day.game_count} games</span>
            </header>
            {day.is_light_slate ? <span className="light-label">Light slate</span> : null}
            <div className="games-list">
              {day.games.map((game) => (
                <div className="game-row" key={game.id}>
                  <span>{game.away.abbreviation}{game.away.back_to_back ? <small className="b2b">B2B</small> : null}</span>
                  <span className="at">@</span>
                  <span>{game.home.abbreviation}{game.home.back_to_back ? <small className="b2b">B2B</small> : null}</span>
                  <time>
                    {new Intl.DateTimeFormat("en-CA", {
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
        );
      })}
    </div>
  );
}
