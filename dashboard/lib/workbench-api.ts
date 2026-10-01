import type {
  AssistantAnswer,
  AssistantQueryRequest,
  AssistantStatusResponse,
  ForecastIssuanceDetailResponse,
  ForecastsListResponse,
  InvestigationDetail,
  InvestigationReproduce,
  LineageResponse,
  MetricCatalog,
  PlayerComparisonResponse,
  PlayerGameLogResponse,
  PlayerProfile,
  PlayerResearchQuery,
  PlayerResearchResponse,
  PointsForecastEvaluation,
  SavedInvestigation,
  TeamDetailResponse,
  TeamResearchResponse,
  WorkbenchCatalog,
  WorkbenchJobItem,
  WorkbenchStatus
} from "./types";

const internalApi =
  process.env.COURTLOAD_API_INTERNAL_URL ??
  process.env.NEXT_PUBLIC_COURTLOAD_API_URL ??
  "http://localhost:8000";

export const browserApi =
  process.env.NEXT_PUBLIC_COURTLOAD_API_URL ?? "http://localhost:8000";

export class WorkbenchApiError extends Error {
  constructor(
    public status: number,
    public detail: unknown
  ) {
    super(
      typeof detail === "string"
        ? detail
        : typeof (detail as { detail?: string })?.detail === "string"
        ? (detail as { detail: string }).detail
        : "Workbench API request failed"
    );
  }
}

async function wbFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const url = `${internalApi}${path}`;
  let response: Response;
  try {
    response = await fetch(url, {
      cache: "no-store",
      signal: AbortSignal.timeout(8000),
      ...options
    });
  } catch (err) {
    throw new WorkbenchApiError(503, {
      reason: "api_unavailable",
      message: err instanceof Error ? err.message : "Service unreachable"
    });
  }

  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { detail?: unknown } | null;
    throw new WorkbenchApiError(response.status, body?.detail ?? body);
  }

  return (await response.json()) as T;
}

export async function getWorkbenchCatalog(releaseId?: string): Promise<WorkbenchCatalog> {
  const query = releaseId ? `?releaseId=${encodeURIComponent(releaseId)}` : "";
  return wbFetch<WorkbenchCatalog>(`/api/workbench/catalog${query}`);
}

export async function getMetricCatalog(): Promise<MetricCatalog> {
  return wbFetch<MetricCatalog>("/api/workbench/metrics");
}

export async function getWorkbenchStatus(): Promise<WorkbenchStatus> {
  return wbFetch<WorkbenchStatus>("/api/workbench/status");
}

export async function getWorkbenchJobs(status?: string, limit = 20): Promise<WorkbenchJobItem[]> {
  const query = new URLSearchParams({ limit: String(limit) });
  if (status) query.set("status", status);
  return wbFetch<WorkbenchJobItem[]>(`/api/workbench/jobs?${query}`);
}

export async function getWorkbenchJob(id: string): Promise<WorkbenchJobItem> {
  return wbFetch<WorkbenchJobItem>(`/api/workbench/jobs/${encodeURIComponent(id)}`);
}

export async function queryPlayerResearch(
  query: Partial<PlayerResearchQuery>
): Promise<PlayerResearchResponse> {
  const sp = new URLSearchParams();
  if (query.release_id) sp.set("releaseId", query.release_id);
  if (query.season) sp.set("season", query.season);
  if (query.phase) sp.set("phase", query.phase);
  if (query.before_date) sp.set("beforeDate", query.before_date);
  if (query.window) sp.set("window", query.window);
  if (query.team_id) sp.set("teamId", query.team_id);
  if (query.name) sp.set("name", query.name);
  if (query.min_games !== undefined) sp.set("minGames", String(query.min_games));
  if (query.min_minutes !== undefined) sp.set("minMinutes", String(query.min_minutes));
  if (query.min_avg_minutes !== undefined) sp.set("minAvgMinutes", String(query.min_avg_minutes));
  if (query.sort_metric) sp.set("sortMetric", query.sort_metric);
  if (query.sort_direction) sp.set("sortDirection", query.sort_direction);
  if (query.limit !== undefined) sp.set("limit", String(query.limit));

  return wbFetch<PlayerResearchResponse>(`/api/workbench/players?${sp}`);
}

export async function getPlayerProfile(
  id: string,
  params?: {
    season?: string;
    phase?: string;
    beforeDate?: string;
    window?: string;
    releaseId?: string;
  }
): Promise<PlayerProfile> {
  const sp = new URLSearchParams();
  if (params?.releaseId) sp.set("releaseId", params.releaseId);
  if (params?.season) sp.set("season", params.season);
  if (params?.phase) sp.set("phase", params.phase);
  if (params?.beforeDate) sp.set("beforeDate", params.beforeDate);
  if (params?.window) sp.set("window", params.window);

  return wbFetch<PlayerProfile>(
    `/api/workbench/players/${encodeURIComponent(id)}?${sp}`
  );
}

export async function getPlayerGameLog(
  id: string,
  params?: {
    season?: string;
    phase?: string;
    beforeDate?: string;
    releaseId?: string;
    limit?: number;
    cursor?: string;
  }
): Promise<PlayerGameLogResponse> {
  const sp = new URLSearchParams();
  if (params?.releaseId) sp.set("releaseId", params.releaseId);
  if (params?.season) sp.set("season", params.season);
  if (params?.phase) sp.set("phase", params.phase);
  if (params?.beforeDate) sp.set("beforeDate", params.beforeDate);
  if (params?.limit !== undefined) sp.set("limit", String(params.limit));
  if (params?.cursor) sp.set("cursor", params.cursor);

  return wbFetch<PlayerGameLogResponse>(
    `/api/workbench/players/${encodeURIComponent(id)}/games?${sp}`
  );
}

export async function getTeamsResearch(params?: {
  season?: string;
  phase?: string;
  beforeDate?: string;
  releaseId?: string;
}): Promise<TeamResearchResponse> {
  const sp = new URLSearchParams();
  if (params?.releaseId) sp.set("releaseId", params.releaseId);
  if (params?.season) sp.set("season", params.season);
  if (params?.phase) sp.set("phase", params.phase);
  if (params?.beforeDate) sp.set("beforeDate", params.beforeDate);

  return wbFetch<TeamResearchResponse>(`/api/workbench/teams?${sp}`);
}

export async function getTeamDetail(
  id: string,
  params?: {
    season?: string;
    phase?: string;
    beforeDate?: string;
    releaseId?: string;
  }
): Promise<TeamDetailResponse> {
  const sp = new URLSearchParams();
  if (params?.releaseId) sp.set("releaseId", params.releaseId);
  if (params?.season) sp.set("season", params.season);
  if (params?.phase) sp.set("phase", params.phase);
  if (params?.beforeDate) sp.set("beforeDate", params.beforeDate);

  return wbFetch<TeamDetailResponse>(
    `/api/workbench/teams/${encodeURIComponent(id)}?${sp}`
  );
}

export async function comparePlayers(
  playerA: string,
  playerB: string,
  params?: {
    season?: string;
    phase?: string;
    beforeDate?: string;
    window?: string;
    releaseId?: string;
  }
): Promise<PlayerComparisonResponse> {
  const sp = new URLSearchParams({
    playerA,
    playerB
  });
  if (params?.releaseId) sp.set("releaseId", params.releaseId);
  if (params?.season) sp.set("season", params.season);
  if (params?.phase) sp.set("phase", params.phase);
  if (params?.beforeDate) sp.set("beforeDate", params.beforeDate);
  if (params?.window) sp.set("window", params.window);

  return wbFetch<PlayerComparisonResponse>(`/api/workbench/compare?${sp}`);
}

export async function getLineage(
  factType: string,
  factId: string,
  releaseId?: string
): Promise<LineageResponse> {
  const sp = new URLSearchParams({ factType, factId });
  if (releaseId) sp.set("releaseId", releaseId);
  return wbFetch<LineageResponse>(`/api/workbench/lineage?${sp}`);
}

export async function listSavedInvestigations(limit = 20): Promise<SavedInvestigation[]> {
  return wbFetch<SavedInvestigation[]>(`/api/workbench/analyses?limit=${limit}`);
}

export async function getSavedInvestigation(id: string): Promise<InvestigationDetail> {
  return wbFetch<InvestigationDetail>(`/api/workbench/analyses/${encodeURIComponent(id)}`);
}

export async function saveInvestigation(
  title: string,
  query: Record<string, unknown>
): Promise<SavedInvestigation> {
  return wbFetch<SavedInvestigation>("/api/workbench/analyses", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title, query })
  });
}

export async function reproduceInvestigation(id: string): Promise<InvestigationReproduce> {
  return wbFetch<InvestigationReproduce>(
    `/api/workbench/analyses/${encodeURIComponent(id)}/reproduce`,
    { method: "POST" }
  );
}

export function getExportUrl(id: string, format: "csv" | "json"): string {
  return `${browserApi}/api/workbench/analyses/${encodeURIComponent(id)}/export?format=${format}`;
}

export async function enqueueJob(
  jobType: "bootstrap" | "refresh" | "portraits",
  args: Record<string, unknown> = {}
): Promise<WorkbenchJobItem> {
  // Call internal Next.js proxy route which holds server-side operator token
  const response = await fetch("/api/jobs", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jobType, arguments: args })
  });

  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { detail?: string } | null;
    throw new WorkbenchApiError(response.status, body?.detail ?? "Mutation failed");
  }

  return (await response.json()) as WorkbenchJobItem;
}

export async function getPointsForecastEvaluation(runId?: string): Promise<PointsForecastEvaluation> {
  const query = runId ? `?run_id=${encodeURIComponent(runId)}` : "";
  return wbFetch<PointsForecastEvaluation>(`/api/workbench/forecasts/evaluation${query}`);
}

export async function getProspectiveForecasts(params: {
  playerId?: string;
  teamId?: string;
  targetGameDate?: string;
  status?: string;
  page?: number;
  pageSize?: number;
} = {}): Promise<ForecastsListResponse> {
  const q = new URLSearchParams();
  if (params.playerId) q.set("player_id", params.playerId);
  if (params.teamId) q.set("team_id", params.teamId);
  if (params.targetGameDate) q.set("target_game_date", params.targetGameDate);
  if (params.status) q.set("status", params.status);
  if (params.page) q.set("page", String(params.page));
  if (params.pageSize) q.set("page_size", String(params.pageSize));

  const query = q.toString() ? `?${q.toString()}` : "";
  return wbFetch<ForecastsListResponse>(`/api/workbench/forecasts${query}`);
}

export async function getForecastIssuanceDetail(id: string): Promise<ForecastIssuanceDetailResponse> {
  return wbFetch<ForecastIssuanceDetailResponse>(`/api/workbench/forecasts/${encodeURIComponent(id)}`);
}

export async function getAssistantStatus(): Promise<AssistantStatusResponse> {
  return wbFetch<AssistantStatusResponse>("/api/workbench/assistant/status");
}

export async function queryAssistant(req: AssistantQueryRequest): Promise<AssistantAnswer> {
  const base = typeof window !== "undefined" ? browserApi : internalApi;
  const url = `${base}/api/workbench/assistant/query`;
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(req),
    cache: "no-store",
    signal: AbortSignal.timeout(50000)
  });

  if (!response.ok) {
    let detail = "Assistant query failed";
    try {
      const errJson = await response.json();
      detail = errJson.detail || detail;
    } catch {
      // fallback
    }
    throw new WorkbenchApiError(response.status, detail);
  }

  return response.json();
}



