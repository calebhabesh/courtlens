import { assertCurrentEnvironment } from "./server-env";

assertCurrentEnvironment();

import type {
  AssistantAnswer,
  AssistantQueryRequest,
  AssistantStatusResponse,
  BackfillStatusResponse,
  ComparePeriodsRequest,
  ComparePeriodsResponse,
  CrosswalkResponse,
  DistributionRequest,
  DistributionResponse,
  ForecastIssuanceDetailResponse,
  ForecastsListResponse,
  InvestigationDetail,
  InvestigationReproduce,
  ImpactResponse,
  LineageResponse,
  LookupResponse,
  MeasurementsQueryResponse,
  MetricCatalog,
  OpponentContextRequest,
  OpponentContextResponse,
  PlayerComparisonResponse,
  PlayerGameLogResponse,
  PlayerMeasurementsDetailResponse,
  PlayerProfile,
  PlayerResearchQuery,
  PlayerResearchResponse,
  PlayoffBracketResponse,
  PlayoffSeriesDetailResponse,
  ScheduleDatesResponse,
  PointsForecastEvaluation,
  RankOperationRequest,
  RankOperationResponse,
  SavedInvestigation,
  QuerySpec,
  StatsPresentation,
  SplitProfileRequest,
  SplitProfileResponse,
  StatisticalPeersRequest,
  StatisticalPeersResponse,
  TeamDetailResponse,
  TeamFourFactorsResponse,
  TeamPeersResponse,
  TeamResearchResponse,
  TeamScheduleResponse,
  ThreePointVariationResponse,
  WorkbenchCatalog,
  WorkbenchJobItem,
  WorkbenchQueryResponse,
  WorkbenchStatus
} from "./types";

const internalApi =
  process.env.COURTLENS_API_INTERNAL_URL ??
  process.env.NEXT_PUBLIC_COURTLENS_API_URL ??
  "http://localhost:8000";

export const browserApi =
  process.env.NEXT_PUBLIC_COURTLENS_API_URL ?? "http://localhost:8000";

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
  return wbFetch<MetricCatalog>("/api/workbench/metrics?version=courtlens-stats-v3");
}

export async function getImpact(params: {
  season: string; phase: string; beforeDate: string; playerId?: string; teamId?: string; window?: string;
}): Promise<ImpactResponse> {
  const query = new URLSearchParams(params);
  return wbFetch<ImpactResponse>(`/api/workbench/impact?${query}`);
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
  if (query.cursor) sp.set("cursor", query.cursor);

  return wbFetch<PlayerResearchResponse>(`/api/workbench/players?${sp}`);
}

export async function executeWorkbenchQuery(
  query: QuerySpec,
  presentation?: StatsPresentation
): Promise<WorkbenchQueryResponse> {
  return wbFetch<WorkbenchQueryResponse>("/api/workbench/query", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query, ...(presentation ? { presentation } : {}) })
  });
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

export async function getTeamSchedule(
  id: string,
  params?: {
    season?: string;
    phase?: string;
    beforeDate?: string;
    releaseId?: string;
  }
): Promise<TeamScheduleResponse> {
  const sp = new URLSearchParams();
  if (params?.releaseId) sp.set("releaseId", params.releaseId);
  if (params?.season) sp.set("season", params.season);
  if (params?.phase) sp.set("phase", params.phase);
  if (params?.beforeDate) sp.set("beforeDate", params.beforeDate);

  return wbFetch<TeamScheduleResponse>(
    `/api/workbench/teams/${encodeURIComponent(id)}/schedule?${sp}`
  );
}

export async function getTeamFourFactors(
  id: string,
  params?: {
    season?: string;
    phase?: string;
    beforeDate?: string;
    releaseId?: string;
  }
): Promise<TeamFourFactorsResponse> {
  const sp = new URLSearchParams();
  if (params?.releaseId) sp.set("releaseId", params.releaseId);
  if (params?.season) sp.set("season", params.season);
  if (params?.phase) sp.set("phase", params.phase);
  if (params?.beforeDate) sp.set("beforeDate", params.beforeDate);

  return wbFetch<TeamFourFactorsResponse>(
    `/api/workbench/teams/${encodeURIComponent(id)}/four-factors?${sp}`
  );
}

export async function getTeamPeers(
  id: string,
  params?: {
    limit?: number;
    season?: string;
    phase?: string;
    beforeDate?: string;
    releaseId?: string;
  }
): Promise<TeamPeersResponse> {
  const sp = new URLSearchParams();
  if (params?.limit) sp.set("limit", String(params.limit));
  if (params?.releaseId) sp.set("releaseId", params.releaseId);
  if (params?.season) sp.set("season", params.season);
  if (params?.phase) sp.set("phase", params.phase);
  if (params?.beforeDate) sp.set("beforeDate", params.beforeDate);

  return wbFetch<TeamPeersResponse>(
    `/api/workbench/teams/${encodeURIComponent(id)}/peers?${sp}`
  );
}

export async function getTeamThreePointVariation(
  id: string,
  params?: {
    season?: string;
    phase?: string;
    beforeDate?: string;
    releaseId?: string;
  }
): Promise<ThreePointVariationResponse> {
  const sp = new URLSearchParams();
  if (params?.releaseId) sp.set("releaseId", params.releaseId);
  if (params?.season) sp.set("season", params.season);
  if (params?.phase) sp.set("phase", params.phase);
  if (params?.beforeDate) sp.set("beforeDate", params.beforeDate);

  return wbFetch<ThreePointVariationResponse>(
    `/api/workbench/teams/${encodeURIComponent(id)}/three-point-variation?${sp}`
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

export interface LookupQueryOptions {
  query: string;
  releaseId?: string | null;
  season?: string | null;
  phase?: string | null;
  beforeDate?: string | null;
  kinds?: Array<"player" | "team" | "page">;
  limit?: number;
  signal?: AbortSignal;
}

export async function queryLookup(options: LookupQueryOptions): Promise<LookupResponse> {
  const base = typeof window !== "undefined" ? browserApi : internalApi;
  const sp = new URLSearchParams();
  sp.set("q", options.query);
  if (options.releaseId) sp.set("releaseId", options.releaseId);
  if (options.season) sp.set("season", options.season);
  if (options.phase) sp.set("phase", options.phase);
  if (options.beforeDate) sp.set("before_date", options.beforeDate);
  if (options.kinds && options.kinds.length > 0) sp.set("kinds", options.kinds.join(","));
  if (options.limit !== undefined) sp.set("limit", String(options.limit));

  const url = `${base}/api/workbench/lookup?${sp.toString()}`;
  const response = await fetch(url, {
    method: "GET",
    headers: { Accept: "application/json" },
    cache: "no-store",
    signal: options.signal ?? AbortSignal.timeout(5000)
  });

  if (!response.ok) {
    let detail = "Lookup request failed";
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

export async function comparePeriods(
  req: ComparePeriodsRequest
): Promise<ComparePeriodsResponse> {
  const base = typeof window !== "undefined" ? browserApi : internalApi;
  const response = await fetch(`${base}/api/workbench/operations/compare-periods`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(req),
    cache: "no-store",
    signal: AbortSignal.timeout(10000)
  });

  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { detail?: unknown } | null;
    throw new WorkbenchApiError(response.status, body?.detail ?? body);
  }

  return response.json();
}

export async function getDistribution(
  req: DistributionRequest
): Promise<DistributionResponse> {
  const base = typeof window !== "undefined" ? browserApi : internalApi;
  const response = await fetch(`${base}/api/workbench/operations/distribution`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(req),
    cache: "no-store",
    signal: AbortSignal.timeout(10000)
  });

  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { detail?: unknown } | null;
    throw new WorkbenchApiError(response.status, body?.detail ?? body);
  }

  return response.json();
}

export async function getSplitProfile(
  req: SplitProfileRequest
): Promise<SplitProfileResponse> {
  const base = typeof window !== "undefined" ? browserApi : internalApi;
  const response = await fetch(`${base}/api/workbench/operations/splits`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(req),
    cache: "no-store",
    signal: AbortSignal.timeout(10000)
  });

  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { detail?: unknown } | null;
    throw new WorkbenchApiError(response.status, body?.detail ?? body);
  }

  return response.json();
}

export async function getOpponentContext(
  req: OpponentContextRequest = {}
): Promise<OpponentContextResponse> {
  const base = typeof window !== "undefined" ? browserApi : internalApi;
  const response = await fetch(`${base}/api/workbench/operations/opponent-context`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(req),
    cache: "no-store",
    signal: AbortSignal.timeout(10000)
  });

  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { detail?: unknown } | null;
    throw new WorkbenchApiError(response.status, body?.detail ?? body);
  }

  return response.json();
}

export async function getStatisticalPeers(
  req: StatisticalPeersRequest
): Promise<StatisticalPeersResponse> {
  const base = typeof window !== "undefined" ? browserApi : internalApi;
  const response = await fetch(`${base}/api/workbench/operations/similarity`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(req),
    cache: "no-store",
    signal: AbortSignal.timeout(10000)
  });

  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { detail?: unknown } | null;
    throw new WorkbenchApiError(response.status, body?.detail ?? body);
  }

  return response.json();
}

export async function getRankOperation(
  req: RankOperationRequest
): Promise<RankOperationResponse> {
  const base = typeof window !== "undefined" ? browserApi : internalApi;
  const response = await fetch(`${base}/api/workbench/operations/rank`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(req),
    cache: "no-store",
    signal: AbortSignal.timeout(15000)
  });

  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { detail?: unknown } | null;
    throw new WorkbenchApiError(response.status, body?.detail ?? body);
  }

  return response.json();
}

export async function getMeasurements(params?: {
  playerId?: string;
  draftYear?: number;
  minWingspan?: number;
  maxWingspan?: number;
  minHeight?: number;
  maxHeight?: number;
  measurementType?: string;
  limit?: number;
}): Promise<MeasurementsQueryResponse> {
  const base = typeof window !== "undefined" ? browserApi : internalApi;
  const sp = new URLSearchParams();
  if (params?.playerId) sp.set("playerId", params.playerId);
  if (params?.draftYear) sp.set("draftYear", String(params.draftYear));
  if (params?.minWingspan != null) sp.set("minWingspan", String(params.minWingspan));
  if (params?.maxWingspan != null) sp.set("maxWingspan", String(params.maxWingspan));
  if (params?.minHeight != null) sp.set("minHeight", String(params.minHeight));
  if (params?.maxHeight != null) sp.set("maxHeight", String(params.maxHeight));
  if (params?.measurementType) sp.set("measurementType", params.measurementType);
  if (params?.limit != null) sp.set("limit", String(params.limit));

  const qs = sp.toString();
  const url = `${base}/api/workbench/measurements${qs ? `?${qs}` : ""}`;
  const response = await fetch(url, {
    cache: "no-store",
    signal: AbortSignal.timeout(10000)
  });

  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { detail?: unknown } | null;
    throw new WorkbenchApiError(response.status, body?.detail ?? body);
  }

  return response.json();
}

export async function getPlayerMeasurements(
  playerId: string
): Promise<PlayerMeasurementsDetailResponse> {
  const base = typeof window !== "undefined" ? browserApi : internalApi;
  const response = await fetch(
    `${base}/api/workbench/players/${encodeURIComponent(playerId)}/measurements`,
    {
      cache: "no-store",
      signal: AbortSignal.timeout(10000)
    }
  );

  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { detail?: unknown } | null;
    throw new WorkbenchApiError(response.status, body?.detail ?? body);
  }

  return response.json();
}

export async function getCrosswalk(params: {
  sourceNamespace: string;
  sourceId: string;
  targetNamespace?: string;
  kind?: string;
}): Promise<CrosswalkResponse> {
  const base = typeof window !== "undefined" ? browserApi : internalApi;
  const sp = new URLSearchParams({
    sourceNamespace: params.sourceNamespace,
    sourceId: params.sourceId,
    targetNamespace: params.targetNamespace ?? "nba",
    kind: params.kind ?? "player"
  });
  const response = await fetch(`${base}/api/workbench/crosswalk?${sp.toString()}`, {
    cache: "no-store",
    signal: AbortSignal.timeout(10000)
  });

  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { detail?: unknown } | null;
    throw new WorkbenchApiError(response.status, body?.detail ?? body);
  }

  return response.json();
}

export async function getBackfillStatus(params?: {
  startYear?: number;
  endYear?: number;
}): Promise<BackfillStatusResponse> {
  const base = typeof window !== "undefined" ? browserApi : internalApi;
  const sp = new URLSearchParams();
  if (params?.startYear != null) sp.set("startYear", String(params.startYear));
  if (params?.endYear != null) sp.set("endYear", String(params.endYear));

  const qs = sp.toString();
  const url = `${base}/api/workbench/backfill/status${qs ? `?${qs}` : ""}`;
  const response = await fetch(url, {
    cache: "no-store",
    signal: AbortSignal.timeout(10000)
  });

  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { detail?: unknown } | null;
    throw new WorkbenchApiError(response.status, body?.detail ?? body);
  }

  return response.json();
}

export async function getPlayoffBracket(params?: {
  season?: string | number;
  cutoffDate?: string;
  releaseId?: string;
}): Promise<PlayoffBracketResponse> {
  const sp = new URLSearchParams();
  if (params?.season) sp.set("season", String(params.season));
  if (params?.cutoffDate) sp.set("cutoff_date", params.cutoffDate);
  if (params?.releaseId) sp.set("releaseId", params.releaseId);

  const qs = sp.toString();
  const base = typeof window !== "undefined" ? browserApi : internalApi;
  const url = `${base}/api/workbench/playoffs${qs ? `?${qs}` : ""}`;
  const response = await fetch(url, {
    cache: "no-store",
    signal: AbortSignal.timeout(10000)
  });

  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { detail?: unknown } | null;
    throw new WorkbenchApiError(response.status, body?.detail ?? body);
  }

  return response.json();
}

export async function getPlayoffSeriesDetail(
  seriesId: string,
  params?: {
    cutoffDate?: string;
    releaseId?: string;
  }
): Promise<PlayoffSeriesDetailResponse> {
  const sp = new URLSearchParams();
  if (params?.cutoffDate) sp.set("cutoff_date", params.cutoffDate);
  if (params?.releaseId) sp.set("releaseId", params.releaseId);

  const qs = sp.toString();
  const base = typeof window !== "undefined" ? browserApi : internalApi;
  const url = `${base}/api/workbench/playoffs/series/${encodeURIComponent(seriesId)}${qs ? `?${qs}` : ""}`;
  const response = await fetch(url, {
    cache: "no-store",
    signal: AbortSignal.timeout(10000)
  });

  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { detail?: unknown } | null;
    throw new WorkbenchApiError(response.status, body?.detail ?? body);
  }

  return response.json();
}




export async function runSharedFloor(
  operation: import("./shared-floor").FloorOperation,
  request: import("./shared-floor").FloorRequest,
  signal?: AbortSignal
): Promise<import("./shared-floor").FloorResponse> {
  const base = typeof window !== "undefined" ? browserApi : internalApi;
  const response = await fetch(`${base}/api/workbench/operations/${operation}`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify(request), cache: "no-store",
    signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(15000)]) : AbortSignal.timeout(15000)
  });
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    const detail = body?.detail;
    throw new WorkbenchApiError(response.status,
      typeof detail === "string" ? detail : JSON.stringify(detail ?? body ?? "Shared-floor request failed"));
  }
  return response.json();
}

export async function runShooting(
  operation: import("./shooting-types").ShootingOperation,
  request: import("./shooting-types").ShootingInput,
  signal?: AbortSignal
): Promise<import("./shooting-types").ShootingResponse> {
  const base = typeof window !== "undefined" ? browserApi : internalApi;
  const response = await fetch(`${base}/api/workbench/operations/${operation}`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify(request), cache: "no-store",
    signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(15000)]) : AbortSignal.timeout(15000)
  });
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new WorkbenchApiError(response.status, typeof body?.detail === "string" ? body.detail : JSON.stringify(body?.detail ?? body ?? "Shooting request failed"));
  }
  return response.json();
}

export async function getScheduleDates(params: {
  start: string;
  end: string;
  releaseId?: string;
  phase?: string;
  beforeDate?: string;
  focus?: string;
}): Promise<ScheduleDatesResponse> {
  const sp = new URLSearchParams({ start: params.start, end: params.end });
  if (params.releaseId) sp.set("releaseId", params.releaseId);
  if (params.phase) sp.set("phase", params.phase);
  if (params.beforeDate) sp.set("beforeDate", params.beforeDate);
  if (params.focus) sp.set("focus", params.focus);
  return wbFetch<ScheduleDatesResponse>(`/api/workbench/schedule/dates?${sp}`);
}
