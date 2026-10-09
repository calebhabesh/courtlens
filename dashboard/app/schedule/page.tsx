import type { Metadata } from "next";
import { Suspense } from "react";
import { ScheduleGrid } from "@/components/schedule-grid";
import { ScheduleWeekBar } from "@/components/schedule-week-bar";
import { PageShell } from "@/components/ui/page-shell";
import { PageHeader } from "@/components/ui/panel";
import { getDataStatus, getSchedule, mondayFor } from "@/lib/api";
import { formatDate } from "@/lib/format-date";

export const metadata: Metadata = { title: "Schedule" };
export const dynamic = "force-dynamic";

const CLASSIFICATION: Record<string, string> = {
  operational: "Operational source data",
  fixture: "Fixture data",
};

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
    <PageShell template="explorer">
      <PageHeader title="Schedule" subtitle={`Games and light slates for the week of ${formatDate(start)}.`} />
      <Suspense fallback={null}>
        <ScheduleWeekBar
          start={start}
          games={totalGames}
          rows={[
            { label: "Week", value: `${formatDate(schedule.week_start)} – ${formatDate(schedule.week_end)}` },
            { label: "Time zone", value: schedule.timezone, mono: true },
            { label: "Light slate", value: `${schedule.light_slate_threshold} games or fewer` },
            { label: "Data", value: CLASSIFICATION[status.classification] ?? "Data service unavailable" },
            { label: "Excluded", value: "Postponed, cancelled and abandoned games are not usable schedule opportunities." },
          ]}
        />
      </Suspense>
      <ScheduleGrid schedule={schedule} />
    </PageShell>
  );
}
