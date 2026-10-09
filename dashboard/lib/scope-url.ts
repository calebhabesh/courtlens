import type { WorkbenchCatalog } from "./types";

export type ScopeKey = "season" | "phase" | "beforeDate" | "window";

const ALIASES: Partial<Record<ScopeKey | "releaseId", string>> = { beforeDate: "before_date", releaseId: "release_id" };
const WINDOW_DEPENDENTS = ["windowN", "window_n", "fromDate", "from_date", "toDate", "to_date"];

export interface ScopeChangeContext {
  catalog?: WorkbenchCatalog;
  season: string;
  phase: string;
  releaseId?: string;
  allowedPhases?: string[];
}

/**
 * Returns the query string after one scope control changes. Season and phase changes move the
 * cutoff to the catalog's default for the new scope; a window change drops window-specific
 * parameters; every change resets cursor pagination and keeps the bound release.
 */
export function applyScopeChange(current: URLSearchParams | string, key: ScopeKey, value: string, context: ScopeChangeContext): URLSearchParams {
  const params = new URLSearchParams(current.toString());
  const { catalog, season, phase, releaseId, allowedPhases } = context;
  const alias = ALIASES[key];
  if (alias) params.delete(alias);
  if (key === "season" && catalog?.stats_scopes) {
    const scopes = catalog.stats_scopes.filter((scope) => scope.season === value && (!allowedPhases || allowedPhases.includes(scope.phase)));
    const scope = scopes.find((item) => item.phase === phase) ?? scopes.find((item) => item.phase === "regular_season") ?? scopes[0];
    if (scope) {
      params.set("phase", scope.phase);
      params.delete("before_date");
      params.set("beforeDate", scope.default_before_date);
    }
  }
  if (key === "phase") {
    const scope = catalog?.stats_scopes?.find((item) => item.season === season && item.phase === value);
    if (scope) {
      params.delete("before_date");
      params.set("beforeDate", scope.default_before_date);
    }
  }
  if (key === "window") for (const name of WINDOW_DEPENDENTS) params.delete(name);
  if (value) params.set(key, value);
  else params.delete(key);
  if (releaseId && !params.has("releaseId") && !params.has("release_id")) params.set("releaseId", releaseId);
  params.delete("cursor");
  return params;
}
