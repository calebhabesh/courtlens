import type {
  AggregationMethod,
  BoardAggregationResult,
  CustomViewDefinition,
  ImportConflictMode,
  PersonalWorkspaceState,
  RankingBoardDefinition,
  RankingBoardType,
  RankingEntry,
  TierGroup,
  TierListDefinition,
  WorkspaceBundle,
  WorkspacePreferences
} from "./types";

export class WorkspaceConflictError extends Error {
  constructor(
    public currentVersion: number,
    public expectedVersion: number,
    message?: string
  ) {
    super(
      message ||
        `Workspace version conflict: expected version ${expectedVersion} but server has version ${currentVersion}.`
    );
    this.name = "WorkspaceConflictError";
  }
}

export class WorkspaceApiError extends Error {
  constructor(
    public status: number,
    public detail: unknown
  ) {
    super(
      typeof detail === "string"
        ? detail
        : typeof (detail as { detail?: string })?.detail === "string"
        ? (detail as { detail: string }).detail
        : typeof (detail as { message?: string })?.message === "string"
        ? (detail as { message: string }).message
        : "Workspace API request failed"
    );
    this.name = "WorkspaceApiError";
  }
}

function getBaseUrl(): string {
  if (typeof window !== "undefined") {
    return "/api/workspace";
  }
  const internal = process.env.COURTLOAD_API_INTERNAL_URL || "http://localhost:8000";
  return `${internal}/api/workbench/workspace`;
}

async function request<T>(
  path: string,
  options?: RequestInit & {
    workspaceId?: string;
    expectedVersion?: number;
  }
): Promise<T> {
  const base = getBaseUrl();
  const sp = new URLSearchParams();
  if (options?.workspaceId) sp.set("workspaceId", options.workspaceId);
  if (options?.expectedVersion !== undefined) sp.set("expectedVersion", String(options.expectedVersion));

  const queryString = sp.toString() ? `?${sp.toString()}` : "";
  const url = `${base}${path}${queryString}`;

  const headers: Record<string, string> = {
    Accept: "application/json",
    ...((options?.headers as Record<string, string>) || {})
  };

  if (options?.body) {
    headers["Content-Type"] = "application/json";
  }

  let res: Response;
  try {
    res = await fetch(url, {
      ...options,
      headers,
      cache: "no-store",
      signal: options?.signal ?? AbortSignal.timeout(10000)
    });
  } catch (err) {
    throw new WorkspaceApiError(503, {
      message: err instanceof Error ? err.message : "Workspace service unreachable"
    });
  }

  if (res.status === 409) {
    const errorJson = (await res.json().catch(() => ({}))) as {
      detail?: { current_version?: number; expected_version?: number; message?: string };
    };
    const detail = errorJson.detail || {};
    throw new WorkspaceConflictError(
      detail.current_version ?? 0,
      detail.expected_version ?? options?.expectedVersion ?? 0,
      detail.message
    );
  }

  if (!res.ok) {
    const errorJson = (await res.json().catch(() => null)) as { detail?: unknown } | null;
    throw new WorkspaceApiError(res.status, errorJson?.detail ?? errorJson ?? "Request failed");
  }

  return (await res.json()) as T;
}

// ---------------------------------------------------------------------------
// Root Workspace Operations
// ---------------------------------------------------------------------------

export async function getWorkspace(workspaceId = "default"): Promise<PersonalWorkspaceState> {
  return request<PersonalWorkspaceState>("", { method: "GET", workspaceId });
}

export async function saveWorkspace(
  state: PersonalWorkspaceState,
  expectedVersion: number,
  workspaceId = "default"
): Promise<PersonalWorkspaceState> {
  return request<PersonalWorkspaceState>("", {
    method: "PUT",
    workspaceId,
    expectedVersion,
    body: JSON.stringify(state)
  });
}

export async function resetWorkspace(
  expectedVersion: number,
  workspaceId = "default"
): Promise<PersonalWorkspaceState> {
  return request<PersonalWorkspaceState>("/reset", {
    method: "POST",
    workspaceId,
    expectedVersion
  });
}

export async function exportWorkspaceBundle(workspaceId = "default"): Promise<WorkspaceBundle> {
  return request<WorkspaceBundle>("/export", { method: "GET", workspaceId });
}

export async function importWorkspaceBundle(
  bundle: WorkspaceBundle,
  mode: ImportConflictMode = "replace",
  expectedVersion: number,
  workspaceId = "default"
): Promise<PersonalWorkspaceState> {
  return request<PersonalWorkspaceState>("/import", {
    method: "POST",
    workspaceId,
    expectedVersion,
    body: JSON.stringify({ bundle, mode })
  });
}

export async function getWorkspacePresets(): Promise<CustomViewDefinition[]> {
  return request<CustomViewDefinition[]>("/presets", { method: "GET" });
}

// ---------------------------------------------------------------------------
// Custom Views Operations (F04)
// ---------------------------------------------------------------------------

export interface CreateCustomViewPayload {
  name: string;
  columns: string[];
  unavailable_columns?: string[];
  sort_field?: string | null;
  sort_direction?: "asc" | "desc";
  is_default?: boolean;
}

export async function getCustomViews(workspaceId = "default"): Promise<CustomViewDefinition[]> {
  return request<CustomViewDefinition[]>("/views", { method: "GET", workspaceId });
}

export async function createCustomView(
  payload: CreateCustomViewPayload,
  expectedVersion: number,
  workspaceId = "default"
): Promise<PersonalWorkspaceState> {
  return request<PersonalWorkspaceState>("/views", {
    method: "POST",
    workspaceId,
    expectedVersion,
    body: JSON.stringify({
      name: payload.name,
      columns: payload.columns,
      unavailable_columns: payload.unavailable_columns ?? [],
      sort_field: payload.sort_field ?? null,
      sort_direction: payload.sort_direction ?? "desc",
      is_default: Boolean(payload.is_default)
    })
  });
}

export async function updateCustomView(
  viewId: string,
  payload: Partial<CreateCustomViewPayload>,
  expectedVersion: number,
  workspaceId = "default"
): Promise<PersonalWorkspaceState> {
  return request<PersonalWorkspaceState>(`/views/${encodeURIComponent(viewId)}`, {
    method: "PUT",
    workspaceId,
    expectedVersion,
    body: JSON.stringify(payload)
  });
}

export async function deleteCustomView(
  viewId: string,
  expectedVersion: number,
  workspaceId = "default"
): Promise<PersonalWorkspaceState> {
  return request<PersonalWorkspaceState>(`/views/${encodeURIComponent(viewId)}`, {
    method: "DELETE",
    workspaceId,
    expectedVersion
  });
}

export async function reorderCustomViews(
  orderedViewIds: string[],
  expectedVersion: number,
  workspaceId = "default"
): Promise<PersonalWorkspaceState> {
  return request<PersonalWorkspaceState>("/views/reorder", {
    method: "POST",
    workspaceId,
    expectedVersion,
    body: JSON.stringify({ ordered_view_ids: orderedViewIds })
  });
}

// ---------------------------------------------------------------------------
// Favorites Operations (F05)
// ---------------------------------------------------------------------------

export async function getFavorites(workspaceId = "default"): Promise<string[]> {
  return request<string[]>("/favorites", { method: "GET", workspaceId });
}

export async function addFavorite(
  playerId: string,
  expectedVersion: number,
  workspaceId = "default"
): Promise<PersonalWorkspaceState> {
  return request<PersonalWorkspaceState>(`/favorites/${encodeURIComponent(playerId)}`, {
    method: "POST",
    workspaceId,
    expectedVersion
  });
}

export async function removeFavorite(
  playerId: string,
  expectedVersion: number,
  workspaceId = "default"
): Promise<PersonalWorkspaceState> {
  return request<PersonalWorkspaceState>(`/favorites/${encodeURIComponent(playerId)}`, {
    method: "DELETE",
    workspaceId,
    expectedVersion
  });
}

export async function setFavorites(
  favorites: string[],
  expectedVersion: number,
  workspaceId = "default"
): Promise<PersonalWorkspaceState> {
  return request<PersonalWorkspaceState>("/favorites", {
    method: "PUT",
    workspaceId,
    expectedVersion,
    body: JSON.stringify({ favorites })
  });
}

// ---------------------------------------------------------------------------
// Compare Tray Operations (F05)
// ---------------------------------------------------------------------------

export async function getCompareTray(workspaceId = "default"): Promise<string[]> {
  return request<string[]>("/compare-tray", { method: "GET", workspaceId });
}

export async function addComparePlayer(
  playerId: string,
  expectedVersion: number,
  workspaceId = "default"
): Promise<PersonalWorkspaceState> {
  return request<PersonalWorkspaceState>(`/compare-tray/${encodeURIComponent(playerId)}`, {
    method: "POST",
    workspaceId,
    expectedVersion
  });
}

export async function removeComparePlayer(
  playerId: string,
  expectedVersion: number,
  workspaceId = "default"
): Promise<PersonalWorkspaceState> {
  return request<PersonalWorkspaceState>(`/compare-tray/${encodeURIComponent(playerId)}`, {
    method: "DELETE",
    workspaceId,
    expectedVersion
  });
}

export async function clearCompareTray(
  expectedVersion: number,
  workspaceId = "default"
): Promise<PersonalWorkspaceState> {
  return request<PersonalWorkspaceState>("/compare-tray", {
    method: "DELETE",
    workspaceId,
    expectedVersion
  });
}

export async function setCompareTray(
  tray: string[],
  expectedVersion: number,
  workspaceId = "default"
): Promise<PersonalWorkspaceState> {
  return request<PersonalWorkspaceState>("/compare-tray", {
    method: "PUT",
    workspaceId,
    expectedVersion,
    body: JSON.stringify({ compare_tray: tray })
  });
}

// ---------------------------------------------------------------------------
// Ranking Boards Operations (F16)
// ---------------------------------------------------------------------------

export interface CreateRankingBoardPayload {
  title: string;
  board_type?: RankingBoardType;
  scope?: Record<string, unknown> | null;
  notes?: string | null;
  entries?: RankingEntry[];
}

export async function getRankingBoards(workspaceId = "default"): Promise<RankingBoardDefinition[]> {
  return request<RankingBoardDefinition[]>("/ranking-boards", { method: "GET", workspaceId });
}

export async function createRankingBoard(
  board: CreateRankingBoardPayload,
  expectedVersion: number,
  workspaceId = "default"
): Promise<PersonalWorkspaceState> {
  return request<PersonalWorkspaceState>("/ranking-boards", {
    method: "POST",
    workspaceId,
    expectedVersion,
    body: JSON.stringify({
      title: board.title,
      board_type: board.board_type ?? "overall",
      scope: board.scope ?? null,
      notes: board.notes ?? null,
      entries: board.entries ?? []
    })
  });
}

export async function updateRankingBoard(
  boardId: string,
  board: RankingBoardDefinition,
  expectedVersion: number,
  workspaceId = "default"
): Promise<PersonalWorkspaceState> {
  return request<PersonalWorkspaceState>(`/ranking-boards/${encodeURIComponent(boardId)}`, {
    method: "PUT",
    workspaceId,
    expectedVersion,
    body: JSON.stringify(board)
  });
}

export async function deleteRankingBoard(
  boardId: string,
  expectedVersion: number,
  workspaceId = "default"
): Promise<PersonalWorkspaceState> {
  return request<PersonalWorkspaceState>(`/ranking-boards/${encodeURIComponent(boardId)}`, {
    method: "DELETE",
    workspaceId,
    expectedVersion
  });
}

export async function aggregateRankingBoards(
  boardIds: string[],
  method: AggregationMethod = "borda",
  missingRankPenalty?: number,
  workspaceId = "default"
): Promise<BoardAggregationResult> {
  return request<BoardAggregationResult>("/ranking-boards/aggregate", {
    method: "POST",
    workspaceId,
    body: JSON.stringify({
      board_ids: boardIds,
      method,
      missing_rank_penalty: missingRankPenalty ?? null
    })
  });
}

// ---------------------------------------------------------------------------
// Tier Lists Operations (F27)
// ---------------------------------------------------------------------------

export interface CreateTierListPayload {
  title: string;
  description?: string | null;
  tiers?: TierGroup[];
}

export async function getTierLists(workspaceId = "default"): Promise<TierListDefinition[]> {
  return request<TierListDefinition[]>("/tier-lists", { method: "GET", workspaceId });
}

export async function createTierList(
  tierList: CreateTierListPayload,
  expectedVersion: number,
  workspaceId = "default"
): Promise<PersonalWorkspaceState> {
  return request<PersonalWorkspaceState>("/tier-lists", {
    method: "POST",
    workspaceId,
    expectedVersion,
    body: JSON.stringify({
      title: tierList.title,
      description: tierList.description ?? null,
      tiers: tierList.tiers ?? []
    })
  });
}

export async function updateTierList(
  tierListId: string,
  tierList: TierListDefinition,
  expectedVersion: number,
  workspaceId = "default"
): Promise<PersonalWorkspaceState> {
  return request<PersonalWorkspaceState>(`/tier-lists/${encodeURIComponent(tierListId)}`, {
    method: "PUT",
    workspaceId,
    expectedVersion,
    body: JSON.stringify(tierList)
  });
}

export async function deleteTierList(
  tierListId: string,
  expectedVersion: number,
  workspaceId = "default"
): Promise<PersonalWorkspaceState> {
  return request<PersonalWorkspaceState>(`/tier-lists/${encodeURIComponent(tierListId)}`, {
    method: "DELETE",
    workspaceId,
    expectedVersion
  });
}

// ---------------------------------------------------------------------------
// Preferences Operations
// ---------------------------------------------------------------------------

export async function getWorkspacePreferences(workspaceId = "default"): Promise<WorkspacePreferences> {
  return request<WorkspacePreferences>("/preferences", { method: "GET", workspaceId });
}

export async function updateWorkspacePreferences(
  prefs: Partial<WorkspacePreferences>,
  expectedVersion: number,
  workspaceId = "default"
): Promise<PersonalWorkspaceState> {
  return request<PersonalWorkspaceState>("/preferences", {
    method: "PATCH",
    workspaceId,
    expectedVersion,
    body: JSON.stringify(prefs)
  });
}

// ---------------------------------------------------------------------------
// Client-side SHA-256 Bundle Checksum Helper
// ---------------------------------------------------------------------------

export async function computeClientBundleChecksum(bundle: Record<string, unknown>): Promise<string> {
  const rest = { ...bundle };
  delete rest.checksum_sha256;
  const canonicalJson = canonicalStringify(rest);
  const encoder = new TextEncoder();
  const data = encoder.encode(canonicalJson);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

function canonicalStringify(obj: unknown): string {
  if (obj === null || typeof obj !== "object") {
    return JSON.stringify(obj);
  }
  if (Array.isArray(obj)) {
    return "[" + obj.map((item) => canonicalStringify(item)).join(",") + "]";
  }
  const keys = Object.keys(obj as Record<string, unknown>).sort();
  const entries = keys.map(
    (key) => `${JSON.stringify(key)}:${canonicalStringify((obj as Record<string, unknown>)[key])}`
  );
  return "{" + entries.join(",") + "}";
}
