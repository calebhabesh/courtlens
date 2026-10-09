"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { formatDate } from "@/lib/format-date";
import { DataDetailsButton, type DataDetailRow } from "./ui/data-details";
import { DatePicker } from "./ui/date-picker";
import { Field } from "./ui/field";
import { CountChip, FilterBar } from "./ui/filter-bar";

/** Week filter for the schedule: picking a date opens its week immediately (D6, no Load button). */
export function ScheduleWeekBar({ start, games, rows }: { start: string; games: number; rows: DataDetailRow[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  return (
    <FilterBar
      label="Schedule controls"
      scope={<Field label="Week of" layout="inline">
        <DatePicker label="Week starting" value={start} onChange={day => {
          const params = new URLSearchParams(searchParams.toString());
          params.set("start", day);
          router.push(`${pathname}?${params}`);
        }} />
      </Field>}
      summary={`Week of ${formatDate(start, "compact")}`}
      count={<CountChip>{games} {games === 1 ? "game" : "games"}</CountChip>}
      details={<DataDetailsButton rows={rows} />}
    />
  );
}
