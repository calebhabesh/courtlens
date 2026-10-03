import { describe, expect, it } from "vitest";
import { buildPreservedContextUrl } from "./query-url";

describe("ReplicaNav context-preserving navigation links", () => {
  it("preserves active context parameters across routes", () => {
    const current = new URLSearchParams({
      season: "2024-25",
      phase: "playoffs",
      beforeDate: "2025-05-15",
      window: "last_10",
      releaseId: "rel_snapshot_123"
    });

    const url = buildPreservedContextUrl("/teams", current);
    const parsed = new URL(url, "https://courtload.local");

    expect(parsed.pathname).toBe("/teams");
    expect(parsed.searchParams.get("season")).toBe("2024-25");
    expect(parsed.searchParams.get("phase")).toBe("playoffs");
    expect(parsed.searchParams.get("beforeDate")).toBe("2025-05-15");
    expect(parsed.searchParams.get("window")).toBe("last_10");
    expect(parsed.searchParams.get("releaseId")).toBe("rel_snapshot_123");
  });

  it("does not leak transient query params (cursor, name, sort) to new pages", () => {
    const current = new URLSearchParams({
      season: "2025-26",
      name: "Tatum",
      cursor: "cur_page_2",
      sortMetric: "pts"
    });

    const url = buildPreservedContextUrl("/compare", current);
    const parsed = new URL(url, "https://courtload.local");

    expect(parsed.pathname).toBe("/compare");
    expect(parsed.searchParams.get("season")).toBe("2025-26");
    expect(parsed.searchParams.get("name")).toBeNull();
    expect(parsed.searchParams.get("cursor")).toBeNull();
    expect(parsed.searchParams.get("sortMetric")).toBeNull();
  });

  it("merges context params with target link's existing query params", () => {
    const current = new URLSearchParams({
      season: "2023-24",
      phase: "regular_season"
    });

    const url = buildPreservedContextUrl("/live?view=finals", current);
    const parsed = new URL(url, "https://courtload.local");

    expect(parsed.pathname).toBe("/live");
    expect(parsed.searchParams.get("view")).toBe("finals");
    expect(parsed.searchParams.get("season")).toBe("2023-24");
    expect(parsed.searchParams.get("phase")).toBe("regular_season");
  });

  it("respects target link parameters when they explicitly override context", () => {
    const current = new URLSearchParams({
      season: "2025-26",
      phase: "regular_season"
    });

    // Target link explicitly sets season=2020-21
    const url = buildPreservedContextUrl("/evaluation?season=2020-21", current);
    const parsed = new URL(url, "https://courtload.local");

    expect(parsed.pathname).toBe("/evaluation");
    expect(parsed.searchParams.get("season")).toBe("2020-21");
    expect(parsed.searchParams.get("phase")).toBe("regular_season");
  });

  it("returns base path unchanged when no context params exist", () => {
    const current = new URLSearchParams();
    const url = buildPreservedContextUrl("/stats", current);
    expect(url).toBe("/stats");
  });
});

describe("Replica navigation route inventory and compatibility redirects", () => {
  const CANONICAL_ROUTES = [
    "/stats",
    "/wowy",
    "/live",
    "/last-games",
    "/showcase",
    "/players",
    "/research/similarity",
    "/shot-profile-twin",
    "/rankings",
    "/teams",
    "/roster-shapes",
    "/stat-line-shift",
    "/contracts",
    "/free-agency",
    "/compare",
    "/team-compare",
    "/matchups",
    "/tierlist",
    "/investigations",
    "/research/ask",
    "/forecasts",
    "/evaluation",
    "/research/case-studies",
    "/research/trends",
    "/research/distributions",
    "/research/adjusted-shooting",
    "/six-factor-rapm",
    "/research/expected-shots",
    "/shot-aftermath",
    "/research/defensive-matchups",
    "/research/epv",
    "/wingspan",
    "/calculator",
    "/methodology",
    "/learning",
    "/patch-notes",
    "/blog",
    "/playoffs",
    "/data-status",
    "/settings"
  ];

  const COMPATIBILITY_REDIRECTS: Record<string, string> = {
    "/pvp": "/compare",
    "/StatLineShift": "/stat-line-shift",
    "/zts": "/research/adjusted-shooting",
    "/shotquality": "/research/expected-shots",
    "/d-shotquality": "/research/defensive-matchups",
    "/kawhifiles": "/research/case-studies",
    "/dashboard": "/players"
  };

  it("contains all 40 canonical replica routes without duplicates", () => {
    const set = new Set(CANONICAL_ROUTES);
    expect(set.size).toBe(CANONICAL_ROUTES.length);
    expect(CANONICAL_ROUTES.length).toBe(40);
  });

  it("maps all compatibility redirects to valid canonical routes", () => {
    for (const [source, dest] of Object.entries(COMPATIBILITY_REDIRECTS)) {
      expect(CANONICAL_ROUTES).toContain(dest);
      expect(source).not.toBe(dest);
    }
  });
});
