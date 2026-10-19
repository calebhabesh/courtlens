import { describe, expect, it } from "vitest";
import { pageKey, pageLabel, visit, type TrailEntry } from "./nav-trail";

const walk = (...hrefs: string[]) => hrefs.reduce<TrailEntry[]>((trail, href) => visit(trail, href), []);

describe("nav trail", () => {
  it("treats filter changes and a merged page's tabs as the same page; Roster Shapes' team view as another", () => {
    expect(pageKey("/stats?season=2024-25")).toBe(pageKey("/stats?season=2025-26"));
    expect(pageKey("/research/shooting/adjusted")).toBe(pageKey("/research/shooting"));
    expect(pageKey("/roster-shapes?team=SAS&mode=playoff")).not.toBe(pageKey("/roster-shapes?mode=playoff"));
  });

  it("updates the current page in place, pushes a new one and pops on return", () => {
    const trail = walk("/roster-shapes", "/roster-shapes?sort=fit", "/roster-shapes?sort=fit&team=SAS", "/players/1641705");
    expect(trail.map(entry => entry.href)).toEqual(["/roster-shapes?sort=fit", "/roster-shapes?sort=fit&team=SAS", "/players/1641705"]);
    // Going back to the team view pops the player instead of adding the team view again.
    const back = visit(trail, "/roster-shapes?sort=fit&team=SAS");
    expect(back.map(entry => entry.href)).toEqual(["/roster-shapes?sort=fit", "/roster-shapes?sort=fit&team=SAS"]);
  });

  it("names pages from the nav, merged pages and drill-in paths", () => {
    expect(pageLabel("/roster-shapes?season=2025-26")).toBe("Roster Shapes");
    expect(pageLabel("/stats?season=2025-26")).toBe("Stats");
    expect(pageLabel("/players")).toBe("Player Directory");
    expect(pageLabel("/research/shooting/adjusted")).toBe("Shooting");
    expect(pageLabel("/live?live_mode=history")).toBe("Finals");
    expect(pageLabel("/teams/1610612759")).toBe("Team");
    expect(pageLabel("/contracts/books")).toBe("Source Books");
  });
});
