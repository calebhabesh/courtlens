import type {
  EntityKind,
  PredicateGroup,
  QuerySpec,
  SampleFilter,
  SortSpec,
  TeamScope,
  ViewState,
  WindowKind,
  WindowSpec,
  PlayerResearchQuery
} from "./types";

type ParamGetter = (camelKey: string, snakeKey: string) => string | undefined;

function createGetter(
  source: URLSearchParams | Record<string, string | string[] | undefined>
): ParamGetter {
  if (source instanceof URLSearchParams) {
    return (camel: string, snake: string) => {
      return source.get(camel) ?? source.get(snake) ?? undefined;
    };
  }
  return (camel: string, snake: string) => {
    const raw = source[camel] ?? source[snake];
    if (Array.isArray(raw)) return raw[0];
    return raw;
  };
}

export function encodeQueryToSearchParams(
  query: Partial<QuerySpec>,
  options: { style?: "camelCase" | "snake_case" } = {}
): URLSearchParams {
  const params = new URLSearchParams();
  const style = options.style ?? "camelCase";

  function set(camel: string, snake: string, val: string | number | undefined | null) {
    if (val === undefined || val === null || val === "") return;
    const key = style === "camelCase" ? camel : snake;
    params.set(key, String(val));
  }

  // Core context
  set("releaseId", "release_id", query.release_id);
  set("impactManifest", "impact_manifest_sha256", query.impact_manifest_sha256);
  set("darkoManifest", "darko_manifest_sha256", query.darko_manifest_sha256);
  set("season", "season", query.season);
  set("phase", "phase", query.phase);
  set("beforeDate", "before_date", query.before_date);

  // Window
  if (query.window?.kind) {
    set("window", "window", query.window.kind);
  }
  if (
    query.window?.n !== undefined &&
    query.window?.n !== null &&
    (query.window.kind === "last_n_appearances" || query.window.kind === "last_n_team_games")
  ) {
    set("windowN", "window_n", query.window.n);
  }
  if (query.window?.from_date) {
    set("fromDate", "from_date", query.window.from_date);
  }
  if (query.window?.to_date) {
    set("toDate", "to_date", query.window.to_date);
  }

  // Entity and name
  if (query.entity_kind && query.entity_kind !== "player") {
    set("entityKind", "entity_kind", query.entity_kind);
  }
  set("name", "name", query.name);

  // Team scope
  if (query.team_scope?.team_id) {
    set("teamId", "team_id", query.team_scope.team_id);
  }

  // Sample filters
  if (query.sample_filters) {
    set("minGames", "min_games", query.sample_filters.min_games);
    set("minMinutes", "min_minutes", query.sample_filters.min_minutes);
    set("minAvgMinutes", "min_avg_minutes", query.sample_filters.min_avg_minutes);
    set("minPossessions", "min_possessions", query.sample_filters.min_possessions);
    set("minAttempts", "min_attempts", query.sample_filters.min_attempts);
  }

  // Sort
  if (query.sort && query.sort.length > 0) {
    const primary = query.sort[0];
    set("sortMetric", "sort_metric", primary.field);
    set("sortDirection", "sort_direction", primary.direction);
    if (query.sort.length > 1) {
      set("sort", "sort", JSON.stringify(query.sort));
    }
  }

  // Page & Cursor
  if (query.page?.limit && query.page.limit !== 50) {
    set("limit", "limit", query.page.limit);
  }
  if (query.page?.cursor) {
    set("cursor", "cursor", query.page.cursor);
  }

  // Predicates
  if (query.predicates && query.predicates.predicates.length > 0) {
    set("predicates", "predicates", JSON.stringify(query.predicates));
  }

  // View state
  if (query.view_state) {
    set("viewId", "view_id", query.view_state.view_id);
    if (query.view_state.columns && query.view_state.columns.length > 0) {
      set("columns", "columns", query.view_state.columns.join(","));
    }
    set("density", "density", query.view_state.density);
    set("identityMode", "identity_mode", query.view_state.identity_mode);
  }

  return params;
}

export function decodeSearchParamsToQuery(
  source: URLSearchParams | Record<string, string | string[] | undefined>
): QuerySpec {
  const get = createGetter(source);

  const releaseId = get("releaseId", "release_id");
  const season = get("season", "season") || "2025-26";
  const phase = get("phase", "phase") || "regular_season";
  const beforeDate = get("beforeDate", "before_date") || null;

  // Window
  const windowRaw = (get("window", "window") || "season").toLowerCase();
  const windowNRaw = get("windowN", "window_n");
  const windowN = windowNRaw ? parseInt(windowNRaw, 10) : undefined;
  const fromDate = get("fromDate", "from_date") || null;
  const toDate = get("toDate", "to_date") || null;

  let windowSpec: WindowSpec;
  if (windowRaw === "last_5") {
    windowSpec = { kind: "last_5", n: 5 };
  } else if (windowRaw === "last_10") {
    windowSpec = { kind: "last_10", n: 10 };
  } else if (windowRaw === "date_range") {
    windowSpec = { kind: "date_range", from_date: fromDate, to_date: toDate };
  } else if (windowRaw === "last_n_appearances" || windowRaw === "last_n_team_games") {
    windowSpec = {
      kind: windowRaw as WindowKind,
      n: windowN ?? 10
    };
  } else {
    windowSpec = { kind: windowRaw as WindowKind };
  }

  const name = get("name", "name") || null;
  const entityKindRaw = (get("entityKind", "entity_kind") || "player").toLowerCase() as EntityKind;

  const teamId = get("teamId", "team_id") || null;
  const teamScope: TeamScope = { team_id: teamId, participation_only: true };

  // Sample filters
  const minGamesRaw = get("minGames", "min_games");
  const minMinutesRaw = get("minMinutes", "min_minutes");
  const minAvgMinutesRaw = get("minAvgMinutes", "min_avg_minutes");
  const minPossessionsRaw = get("minPossessions", "min_possessions");
  const minAttemptsRaw = get("minAttempts", "min_attempts");

  const sampleFilters: SampleFilter = {
    min_games: minGamesRaw ? parseInt(minGamesRaw, 10) : null,
    min_minutes: minMinutesRaw ? parseFloat(minMinutesRaw) : null,
    min_avg_minutes: minAvgMinutesRaw ? parseFloat(minAvgMinutesRaw) : null,
    min_possessions: minPossessionsRaw ? parseInt(minPossessionsRaw, 10) : null,
    min_attempts: minAttemptsRaw ? parseInt(minAttemptsRaw, 10) : null
  };

  // Sort
  const sortRaw = get("sort", "sort");
  let sortSpecs: SortSpec[] = [];
  if (sortRaw) {
    try {
      const parsed = JSON.parse(sortRaw);
      if (Array.isArray(parsed)) {
        sortSpecs = parsed.map((s) => ({
          field: String(s.field).toLowerCase(),
          direction: String(s.direction).toLowerCase() === "asc" ? "asc" : "desc",
          nulls_last: s.nulls_last ?? true
        }));
      }
    } catch {
      // Ignore malformed JSON and fallback to sortMetric
    }
  }

  if (sortSpecs.length === 0) {
    const sortMetric = (get("sortMetric", "sort_metric") || "pts").toLowerCase();
    const sortDirection =
      (get("sortDirection", "sort_direction") || "desc").toLowerCase() === "asc"
        ? "asc"
        : "desc";
    sortSpecs = [{ field: sortMetric, direction: sortDirection, nulls_last: true }];
  }

  // Limit & Cursor
  const limitRaw = get("limit", "limit");
  const limitParsed = limitRaw ? parseInt(limitRaw, 10) : 50;
  const limit = Math.min(Math.max(1, isNaN(limitParsed) ? 50 : limitParsed), 100);
  const cursor = get("cursor", "cursor") || null;

  // Predicates
  const predicatesRaw = get("predicates", "predicates");
  let predicates: PredicateGroup | null = null;
  if (predicatesRaw) {
    try {
      const parsed = JSON.parse(predicatesRaw);
      if (parsed && typeof parsed === "object") {
        predicates = parsed as PredicateGroup;
      }
    } catch {
      // Ignore malformed predicates JSON
    }
  }

  // View state
  const columnsRaw = get("columns", "columns");
  const viewId = get("viewId", "view_id") || null;
  const density = (get("density", "density") || null) as ViewState["density"];
  const identityMode = (get("identityMode", "identity_mode") || null) as ViewState["identity_mode"];

  let viewState: ViewState | null = null;
  if (columnsRaw || viewId || density || identityMode) {
    viewState = {
      view_id: viewId,
      columns: columnsRaw ? columnsRaw.split(",").map((c) => c.trim()).filter(Boolean) : [],
      density,
      identity_mode: identityMode
    };
  }

  return {
    release_id: releaseId,
    ...(get("impactManifest", "impact_manifest_sha256") ? { impact_manifest_sha256: get("impactManifest", "impact_manifest_sha256") } : {}),
    ...(get("darkoManifest", "darko_manifest_sha256") ? { darko_manifest_sha256: get("darkoManifest", "darko_manifest_sha256") } : {}),
    season,
    phase,
    before_date: beforeDate,
    name,
    entity_kind: entityKindRaw,
    window: windowSpec,
    team_scope: teamScope,
    sample_filters: sampleFilters,
    sort: sortSpecs,
    view_state: viewState,
    page: { limit, cursor },
    predicates
  };
}

export function querySpecToLegacyQuery(spec: QuerySpec): PlayerResearchQuery {
  const primarySort = spec.sort?.[0] || { field: "pts", direction: "desc" };
  return {
    release_id: spec.release_id ?? undefined,
    ...(spec.impact_manifest_sha256 ? { impact_manifest_sha256: spec.impact_manifest_sha256 } : {}),
    ...(spec.darko_manifest_sha256 ? { darko_manifest_sha256: spec.darko_manifest_sha256 } : {}),
    season: spec.season,
    phase: spec.phase,
    before_date: spec.before_date ?? "2026-06-30",
    window: spec.window?.kind ?? "season",
    team_id: spec.team_scope?.team_id ?? undefined,
    name: spec.name ?? undefined,
    min_games: spec.sample_filters?.min_games ?? undefined,
    min_minutes: spec.sample_filters?.min_minutes ?? undefined,
    min_avg_minutes: spec.sample_filters?.min_avg_minutes ?? undefined,
    sort_metric: primarySort.field,
    sort_direction: primarySort.direction,
    limit: spec.page?.limit ?? 50,
    cursor: spec.page?.cursor ?? null
  };
}

export const CONTEXT_PARAMS = [
  "season",
  "phase",
  "beforeDate",
  "before_date",
  "window",
  "windowN", "window_n", "fromDate", "from_date", "toDate", "to_date",
  "releaseId",
  "release_id",
  "impactManifest", "impact_manifest_sha256",
  "darkoManifest", "darko_manifest_sha256",
  "finance_book_id", "finance_financial_season", "finance_known_at", "finance_effective_on",
  "finance_unknown_dates", "finance_team_id", "finance_player_ids", "finance_statuses",
  "finance_amount_kind", "finance_small_big_threshold_cents", "finance_scenario"
] as const;

export function buildPreservedContextUrl(
  targetHref: string,
  sourceParams?: URLSearchParams | null
): string {
  const [basePath, targetQuery] = targetHref.split("?");
  const targetParams = new URLSearchParams(targetQuery || "");

  if (sourceParams) {
    const aliases: Record<string, string> = {
      release_id: "releaseId", before_date: "beforeDate", window_n: "windowN",
      from_date: "fromDate", to_date: "toDate", impact_manifest_sha256: "impactManifest", darko_manifest_sha256: "darkoManifest"
    };
    const normalized = new URLSearchParams();
    for (const param of CONTEXT_PARAMS) {
      const key = aliases[param] ?? param;
      const val = sourceParams.get(key) ?? sourceParams.get(param);
      if (val) normalized.set(key, val);
    }
    for (const [key, val] of normalized) {
      const alias = Object.keys(aliases).find((name) => aliases[name] === key);
      if (!targetParams.has(key) && !(alias && targetParams.has(alias))) targetParams.set(key, val);
    }
  }

  const qs = targetParams.toString();
  return qs ? `${basePath}?${qs}` : basePath;
}
