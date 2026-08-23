import type { DataStatus, ScheduleWeek } from "./types";

const internalApi =
  process.env.COURTLOAD_API_INTERNAL_URL ??
  process.env.NEXT_PUBLIC_COURTLOAD_API_URL ??
  "http://localhost:8000";

export const browserApi =
  process.env.NEXT_PUBLIC_COURTLOAD_API_URL ?? "http://localhost:8000";

async function safeFetch<T>(path: string, fallback: T): Promise<T> {
  try {
    const response = await fetch(`${internalApi}${path}`, {
      cache: "no-store",
      signal: AbortSignal.timeout(4000)
    });
    if (!response.ok) return fallback;
    return (await response.json()) as T;
  } catch {
    return fallback;
  }
}

export async function getDataStatus(): Promise<DataStatus> {
  return safeFetch<DataStatus>("/api/data-status", {
    provider: "BALLDONTLIE",
    classification: "unavailable",
    unofficial: true,
    latest_attempt: null,
    latest_success: null,
    latest_source_observation: null,
    freshness: {
      status: "unknown",
      age_hours: null,
      warn_after_hours: 36,
      error_after_hours: 72
    },
    quality: null,
    coverage: {},
    source_contract_checked_on: "2026-08-23",
    source_contract_url: "https://www.balldontlie.io/openapi/nba.yml",
    terms_url: "https://www.balldontlie.io/terms.html",
    limitations: ["The API is not reachable from this dashboard instance."]
  });
}

export async function getSchedule(start: string): Promise<ScheduleWeek> {
  return safeFetch<ScheduleWeek>(
    `/api/schedule/week?start=${encodeURIComponent(start)}&timezone=America%2FToronto`,
    {
      week_start: start,
      week_end: start,
      timezone: "America/Toronto",
      light_slate_threshold: 5,
      days: []
    }
  );
}

export function mondayFor(input = new Date()): string {
  const date = new Date(Date.UTC(input.getUTCFullYear(), input.getUTCMonth(), input.getUTCDate()));
  const day = date.getUTCDay();
  date.setUTCDate(date.getUTCDate() - ((day + 6) % 7));
  return date.toISOString().slice(0, 10);
}
