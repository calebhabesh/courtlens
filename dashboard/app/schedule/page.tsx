import type { Metadata } from "next";
import { DataBadge } from "@/components/data-badge";
import { ScheduleGrid } from "@/components/schedule-grid";
import { getDataStatus, getSchedule, mondayFor } from "@/lib/api";

export const metadata: Metadata = { title: "Team schedule explorer" };
export const dynamic = "force-dynamic";

export default async function SchedulePage({
  searchParams
}: {
  searchParams: Promise<{ start?: string }>;
}) {
  const params = await searchParams;
  const status = await getDataStatus();
  const fallback = status.classification === "fixture" ? "2025-02-03" : mondayFor();
  const start = /^\d{4}-\d{2}-\d{2}$/.test(params.start ?? "") ? (params.start as string) : fallback;
  const schedule = await getSchedule(start);
  const totalGames = schedule.days.reduce((sum, day) => sum + day.game_count, 0);

  return (
    <section className="page shell">
      <div className="page-heading">
        <div>
          <p className="kicker">Public explorer</p>
          <h1>Team schedule</h1>
          <p>Scan loaded game dates and light slates without creating a private roster.</p>
        </div>
        <DataBadge status={status} />
      </div>
      <form className="toolbar" method="get">
        <label>
          Scoring week starts
          <input defaultValue={start} name="start" type="date" />
        </label>
        <button className="button button-dark" type="submit">Load week</button>
        <span className="toolbar-note">{totalGames} games · {schedule.timezone}</span>
      </form>
      <ScheduleGrid schedule={schedule} />
      <p className="method-note">
        A light slate has no more than {schedule.light_slate_threshold} games. Postponed, cancelled,
        and abandoned games are not treated as usable schedule opportunities.
      </p>
    </section>
  );
}
