import type { Plan } from "@/lib/types";

const dayLabel = new Intl.DateTimeFormat("en-CA", { weekday: "short", day: "numeric", timeZone: "UTC" });

export function PlanTable({ plan, title }: { plan: Plan; title?: string }) {
  return (
    <div className="plan-block">
      {title ? <h3 className="plan-title">{title}</h3> : null}
      <div className="plan-scroll" role="region" aria-label={title ? `${title} daily assignments` : "Daily player assignments"} tabIndex={0}>
        <table className="plan-table">
          <thead>
            <tr>
              <th scope="col">Player</th>
              {plan.dates.map((day, index) => (
                <th className={plan.days[index].is_light_slate ? "light-column" : ""} key={day} scope="col">
                  {dayLabel.format(new Date(`${day}T12:00:00Z`))}
                  <small>{plan.days[index].nba_games} NBA</small>
                </th>
              ))}
              <th scope="col">Form</th>
            </tr>
          </thead>
          <tbody>
            {plan.players.map((player) => (
              <tr key={player.id}>
                <th scope="row">
                  <span className="player-cell"><strong>{player.name}</strong><small>{player.team ?? "—"} · {player.eligible_slots.join("/")}</small></span>
                </th>
                {plan.days.map((day) => {
                  const cell = day.cells[String(player.id)] ?? { status: "no_game" };
                  return (
                    <td key={day.date} title={cell.reason}>
                      <span className={`game-cell ${cell.status}`}>
                        {cell.status === "startable" ? (
                          <><strong>{cell.is_home ? "vs" : "@"} {cell.opponent}</strong><small>{cell.slot}</small></>
                        ) : cell.status === "lineup_conflict" ? (
                          <><strong>{cell.is_home ? "vs" : "@"} {cell.opponent}</strong><small>CONFLICT</small></>
                        ) : cell.status === "user_marked_inactive" ? (
                          <small>USER OUT</small>
                        ) : (
                          <span className="dash">—</span>
                        )}
                      </span>
                    </td>
                  );
                })}
                <td><span className="form-value">{player.recent_form.fantasy_points_per_game ?? "—"}<small>FP/G · n={player.recent_form.games_played}</small></span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="plan-legend">
        <span><i className="legend-startable" /> Startable</span>
        <span><i className="legend-conflict" /> Lineup conflict</span>
        <span><i className="legend-light" /> Light slate</span>
      </div>
    </div>
  );
}
