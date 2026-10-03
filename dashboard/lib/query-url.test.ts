import { describe, expect, it } from "vitest";
import {
  decodeSearchParamsToQuery,
  encodeQueryToSearchParams,
  querySpecToLegacyQuery
} from "./query-url";
import type { QuerySpec } from "./types";

describe("query-url serialization and deserialization", () => {
  it("encodes QuerySpec to camelCase search params by default", () => {
    const query: Partial<QuerySpec> = {
      release_id: "rel_20260210_v1",
      season: "2025-26",
      phase: "regular_season",
      before_date: "2026-02-10",
      name: "Tatum",
      team_scope: { team_id: "BOS" },
      sample_filters: { min_games: 10, min_minutes: 150 },
      sort: [{ field: "pts", direction: "desc", nulls_last: true }],
      page: { limit: 25, cursor: "cur_token_xyz" }
    };

    const params = encodeQueryToSearchParams(query);
    expect(params.get("releaseId")).toBe("rel_20260210_v1");
    expect(params.get("season")).toBe("2025-26");
    expect(params.get("phase")).toBe("regular_season");
    expect(params.get("beforeDate")).toBe("2026-02-10");
    expect(params.get("name")).toBe("Tatum");
    expect(params.get("teamId")).toBe("BOS");
    expect(params.get("minGames")).toBe("10");
    expect(params.get("minMinutes")).toBe("150");
    expect(params.get("sortMetric")).toBe("pts");
    expect(params.get("sortDirection")).toBe("desc");
    expect(params.get("limit")).toBe("25");
    expect(params.get("cursor")).toBe("cur_token_xyz");
  });

  it("encodes QuerySpec to snake_case when specified", () => {
    const query: Partial<QuerySpec> = {
      release_id: "rel_123",
      before_date: "2026-01-01",
      sample_filters: { min_games: 5 }
    };

    const params = encodeQueryToSearchParams(query, { style: "snake_case" });
    expect(params.get("release_id")).toBe("rel_123");
    expect(params.get("before_date")).toBe("2026-01-01");
    expect(params.get("min_games")).toBe("5");
    expect(params.get("releaseId")).toBeNull();
  });

  it("decodes snake_case params (resolving Finding 5 reopened queries)", () => {
    const snakeRecord = {
      release_id: "rel_snapshot_abc",
      season: "2024-25",
      phase: "playoffs",
      before_date: "2025-05-20",
      min_games: "12",
      min_avg_minutes: "32.5",
      sort_metric: "ast",
      sort_direction: "asc",
      cursor: "token_page_2"
    };

    const spec = decodeSearchParamsToQuery(snakeRecord);
    expect(spec.release_id).toBe("rel_snapshot_abc");
    expect(spec.season).toBe("2024-25");
    expect(spec.phase).toBe("playoffs");
    expect(spec.before_date).toBe("2025-05-20");
    expect(spec.sample_filters?.min_games).toBe(12);
    expect(spec.sample_filters?.min_avg_minutes).toBe(32.5);
    expect(spec.sort?.[0].field).toBe("ast");
    expect(spec.sort?.[0].direction).toBe("asc");
    expect(spec.page?.cursor).toBe("token_page_2");
  });

  it("roundtrips QuerySpec through URLSearchParams preserving cursor and filters", () => {
    const original: QuerySpec = {
      release_id: "rel_verified_42",
      season: "2025-26",
      phase: "regular_season",
      before_date: "2026-02-15",
      name: "Curry",
      entity_kind: "player",
      window: { kind: "last_10", n: 10 },
      team_scope: { team_id: "GSW" },
      sample_filters: { min_games: 20 },
      sort: [{ field: "pts", direction: "desc", nulls_last: true }],
      page: { limit: 50, cursor: "cur_next_789" }
    };

    const params = encodeQueryToSearchParams(original);
    const decoded = decodeSearchParamsToQuery(params);

    expect(decoded.release_id).toBe(original.release_id);
    expect(decoded.season).toBe(original.season);
    expect(decoded.phase).toBe(original.phase);
    expect(decoded.before_date).toBe(original.before_date);
    expect(decoded.name).toBe(original.name);
    expect(decoded.team_scope?.team_id).toBe("GSW");
    expect(decoded.sample_filters?.min_games).toBe(20);
    expect(decoded.window?.kind).toBe("last_10");
    expect(decoded.page?.cursor).toBe("cur_next_789");
  });

  it("converts QuerySpec to legacy PlayerResearchQuery accurately", () => {
    const spec: QuerySpec = {
      release_id: "rel_test_1",
      season: "2025-26",
      phase: "regular_season",
      before_date: "2026-03-01",
      window: { kind: "last_5", n: 5 },
      team_scope: { team_id: "DEN" },
      name: "Jokic",
      sample_filters: { min_games: 15, min_minutes: 300 },
      sort: [{ field: "ast", direction: "desc", nulls_last: true }],
      page: { limit: 25, cursor: "page_cursor_den" }
    };

    const legacy = querySpecToLegacyQuery(spec);
    expect(legacy.release_id).toBe("rel_test_1");
    expect(legacy.season).toBe("2025-26");
    expect(legacy.before_date).toBe("2026-03-01");
    expect(legacy.window).toBe("last_5");
    expect(legacy.team_id).toBe("DEN");
    expect(legacy.name).toBe("Jokic");
    expect(legacy.min_games).toBe(15);
    expect(legacy.min_minutes).toBe(300);
    expect(legacy.sort_metric).toBe("ast");
    expect(legacy.sort_direction).toBe("desc");
    expect(legacy.limit).toBe(25);
    expect(legacy.cursor).toBe("page_cursor_den");
  });
});
