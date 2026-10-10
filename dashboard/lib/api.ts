import { assertCurrentEnvironment } from "./server-env";

assertCurrentEnvironment();

import type {
  AnalyticsCatalog,
  AnalyticsCompare,
  AnalyticsEvaluation,
  AnalyticsGames,
  AnalyticsProfile,
  DataStatus,
  LookupResponse
} from "./types";

const internalApi =
  process.env.COURTLENS_API_INTERNAL_URL ??
  process.env.NEXT_PUBLIC_COURTLENS_API_URL ??
  "http://localhost:8000";

export const browserApi =
  process.env.NEXT_PUBLIC_COURTLENS_API_URL ?? "http://localhost:8000";

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

export class AnalyticsApiError extends Error {
  constructor(
    public status: number,
    public detail: unknown
  ) {
    super("Analytics request failed");
  }
}

async function analyticsFetch<T>(path: string): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${internalApi}${path}`, {
      cache: "no-store",
      signal: AbortSignal.timeout(6000)
    });
  } catch {
    throw new AnalyticsApiError(503, { reason: "api_unavailable" });
  }
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { detail?: unknown } | null;
    throw new AnalyticsApiError(response.status, body?.detail);
  }
  return (await response.json()) as T;
}

export function getAnalyticsCatalog(snapshotId?: string): Promise<AnalyticsCatalog> {
  const query = snapshotId ? `?snapshotId=${encodeURIComponent(snapshotId)}` : "";
  return analyticsFetch<AnalyticsCatalog>(`/api/analytics/catalog${query}`);
}

export function getAnalyticsProfile(
  playerId: string,
  date?: string,
  snapshotId?: string
): Promise<AnalyticsProfile> {
  const query = new URLSearchParams();
  if (date) query.set("date", date);
  if (snapshotId) query.set("snapshotId", snapshotId);
  return analyticsFetch<AnalyticsProfile>(
    `/api/analytics/players/${encodeURIComponent(playerId)}?${query}`
  );
}

export function getAnalyticsCompare(
  playerA: string,
  playerB: string,
  date: string,
  snapshotId: string
): Promise<AnalyticsCompare> {
  const query = new URLSearchParams({ playerA, playerB, date, snapshotId });
  return analyticsFetch<AnalyticsCompare>(`/api/analytics/compare?${query}`);
}

export function getAnalyticsEvaluation(snapshotId: string): Promise<AnalyticsEvaluation> {
  return analyticsFetch<AnalyticsEvaluation>(
    `/api/analytics/evaluations?snapshotId=${encodeURIComponent(snapshotId)}`
  );
}

export function getAnalyticsGames(
  playerId: string,
  date: string,
  snapshotId: string,
  limit = 20
): Promise<AnalyticsGames> {
  const query = new URLSearchParams({ date, snapshotId, limit: String(limit) });
  return analyticsFetch<AnalyticsGames>(
    `/api/analytics/players/${encodeURIComponent(playerId)}/games?${query}`
  );
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

export function mondayFor(input = new Date()): string {
  const date = new Date(Date.UTC(input.getUTCFullYear(), input.getUTCMonth(), input.getUTCDate()));
  const day = date.getUTCDay();
  date.setUTCDate(date.getUTCDate() - ((day + 6) % 7));
  return date.toISOString().slice(0, 10);
}

export async function fetchLookup(options: {
  q?: string;
  releaseId?: string;
  season?: string;
  kinds?: string;
  limit?: number;
  signal?: AbortSignal;
} = {}): Promise<LookupResponse> {
  const params = new URLSearchParams();
  if (options.q !== undefined && options.q !== "") params.set("q", options.q);
  if (options.releaseId) params.set("releaseId", options.releaseId);
  if (options.season) params.set("season", options.season);
  if (options.kinds) params.set("kinds", options.kinds);
  if (options.limit !== undefined) params.set("limit", String(options.limit));

  const qs = params.toString() ? `?${params.toString()}` : "";
  const response = await fetch(`${browserApi}/api/workbench/lookup${qs}`, {
    cache: "no-store",
    signal: options.signal ?? AbortSignal.timeout(4000),
  });
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { detail?: unknown } | null;
    throw new AnalyticsApiError(response.status, body?.detail);
  }
  return (await response.json()) as LookupResponse;
}
