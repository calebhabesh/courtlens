import { readdirSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { MORE_LINKS, NAV_MENUS, activeNavSection, analyticalNavItems } from "./nav-model";

const appDir = path.resolve(__dirname, "../app");
function routeExists(href: string): boolean {
  const route = href.split("?")[0];
  try {
    return statSync(path.join(appDir, route, "page.tsx")).isFile();
  } catch {
    return false;
  }
}

describe("navigation model (FO02, D9 and FO07 groups)", () => {
  it("points every entry at an existing page until FO07 merges routes", () => {
    for (const item of [...analyticalNavItems(), ...MORE_LINKS]) expect(routeExists(item.href), item.href).toBe(true);
  });

  it("lists each destination once", () => {
    const hrefs = [...analyticalNavItems(), ...MORE_LINKS].map(item => item.href);
    expect(new Set(hrefs).size).toBe(hrefs.length);
  });

  it("groups Research by the FO07 targets and moves Tier Lists under Players", () => {
    const research = NAV_MENUS.find(menu => menu.id === "research")!;
    expect(research.groups.map(group => group.title)).toEqual(["Impact", "Shooting", "Trends & Distributions", "Forecasts & Evaluation", "Tools"]);
    expect(research.groups[0].items.map(item => item.href)).toEqual(["/research/rapm", "/six-factor-rapm", "/wowy", "/research/defensive-matchups", "/research/epv"]);
    expect(research.groups[3].items.map(item => item.label)).toEqual(["Points Forecasts", "Evaluation Archive", "Case Studies", "Saved Investigations"]);
    const players = NAV_MENUS.find(menu => menu.id === "players")!.groups.flatMap(group => group.items.map(item => item.href));
    expect(players).toEqual(expect.arrayContaining(["/tierlist", "/rankings"]));
  });

  it("keeps the D9 support links in the More menu", () => {
    expect(MORE_LINKS.map(item => item.label)).toEqual(["Settings", "Data status", "Methodology", "What's New", "Schedule", "Planner"]);
  });

  it("resolves the active top-level entry from the pathname", () => {
    expect(activeNavSection("/")).toBe("stats");
    expect(activeNavSection("/wowy")).toBe("research");
    expect(activeNavSection("/tierlist")).toBe("players");
    expect(activeNavSection("/players/2544")).toBe("players");
    expect(activeNavSection("/teams/1610612738")).toBe("teams");
    expect(activeNavSection("/live/2026-04-12")).toBe("live");
    expect(activeNavSection("/settings")).toBe("");
  });

  it("keeps app directory routes discoverable (sanity check on the route probe)", () => {
    expect(readdirSync(appDir).length).toBeGreaterThan(10);
    expect(routeExists("/no-such-route")).toBe(false);
  });
});
