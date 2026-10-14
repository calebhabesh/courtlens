import { existsSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { buildPreservedContextUrl } from "./query-url";
import { COMPATIBILITY_REDIRECTS, CONSOLIDATED_REDIRECTS, HIDDEN_REDIRECTS, HOSTED_DEMO_REDIRECTS } from "./route-consolidation";

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
    const parsed = new URL(url, "https://courtlens.local");

    expect(parsed.pathname).toBe("/teams");
    expect(parsed.searchParams.get("season")).toBe("2024-25");
    expect(parsed.searchParams.get("phase")).toBe("playoffs");
    expect(parsed.searchParams.get("beforeDate")).toBe("2025-05-15");
    expect(parsed.searchParams.get("window")).toBe("last_10");
    expect(parsed.searchParams.get("releaseId")).toBe("rel_snapshot_123");
  });

  it("site navigation drops release and model pins so old links cannot trap the site", () => {
    const current = new URLSearchParams({
      season: "2024-25", phase: "playoffs", releaseId: "retired", darkoManifest: "old", impactManifest: "old", release_id: "retired"
    });
    const parsed = new URL(buildPreservedContextUrl("/stats", current, { dropPins: true }), "https://courtlens.local");
    expect(parsed.searchParams.get("season")).toBe("2024-25");
    expect(parsed.searchParams.get("phase")).toBe("playoffs");
    for (const pin of ["releaseId", "release_id", "darkoManifest", "impactManifest"]) expect(parsed.searchParams.has(pin)).toBe(false);
  });

  it("does not leak transient query params (cursor, name, sort) to new pages", () => {
    const current = new URLSearchParams({
      season: "2025-26",
      name: "Tatum",
      cursor: "cur_page_2",
      sortMetric: "pts"
    });

    const url = buildPreservedContextUrl("/compare", current);
    const parsed = new URL(url, "https://courtlens.local");

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
    const parsed = new URL(url, "https://courtlens.local");

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
    const parsed = new URL(url, "https://courtlens.local");

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
  // FO07 merged several replica routes into tabs; their old URLs redirect (lib/route-consolidation.ts).
  const CANONICAL_ROUTES = [
    "/stats",
    "/wowy",
    "/live",
    "/last-games",
    "/showcase",
    "/players",
    "/similar-players",
    "/similar-players/shot-profile",
    "/rankings",
    "/teams",
    "/roster-shapes",
    "/stat-line-shift",
    "/contracts",
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
    "/research/shooting/adjusted",
    "/research/rapm/six-factor",
    "/research/shooting",
    "/research/shooting/aftermath",
    "/research/defensive-matchups",
    "/wingspan",
    "/calculator",
    "/methodology",
    "/methodology/learning",
    "/whats-new",
    "/whats-new/blog",
    "/playoffs",
    "/data-status",
    "/settings"
  ];

  it("contains every canonical replica route once (EPV removed in PC11)", () => {
    const set = new Set(CANONICAL_ROUTES);
    expect(set.size).toBe(CANONICAL_ROUTES.length);
    expect(CANONICAL_ROUTES.length).toBe(38);
  });

  it("maps all compatibility and consolidation redirects to valid canonical routes", () => {
    for (const { source, destination } of [...COMPATIBILITY_REDIRECTS, ...CONSOLIDATED_REDIRECTS]) {
      expect(CANONICAL_ROUTES).toContain(destination);
      expect(source).not.toBe(destination);
    }
  });

  it("sends removed and hosted-demo routes to pages that exist (PC08, PC11)", () => {
    for (const { source, destination } of [...HIDDEN_REDIRECTS, ...HOSTED_DEMO_REDIRECTS]) {
      const page = destination === "/" ? "app/page.tsx" : `app${destination}/page.tsx`;
      expect(existsSync(path.resolve(__dirname, "..", page)), `${source} → ${destination}`).toBe(true);
      expect(existsSync(path.resolve(__dirname, "..", `app${source}/page.tsx`)), `${source} still has a page`).toBe(source === "/planner");
    }
  });
});
