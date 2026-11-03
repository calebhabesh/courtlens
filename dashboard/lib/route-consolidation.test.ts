import { statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { activeRouteTab } from "@/components/ui/route-tabs";
import { analyticalNavItems, MORE_LINKS } from "./nav-model";
import { COMPATIBILITY_REDIRECTS, CONSOLIDATED_REDIRECTS, HIDDEN_REDIRECTS, TABBED_PAGES, mergedPagePath } from "./route-consolidation";
import nextConfig from "../next.config";

const appDir = path.resolve(__dirname, "../app");
function pageFile(route: string) {
  return path.join(appDir, route.split("?")[0], "page.tsx");
}
function isFile(file: string) {
  try { return statSync(file).isFile(); } catch { return false; }
}

describe("FO07 route consolidation (D3)", () => {
  const tabs = Object.values(TABBED_PAGES).flatMap(page => page.tabs);

  it("backs every tab with a page under one layout, first tab at the page's own path", () => {
    for (const page of Object.values(TABBED_PAGES)) {
      const root = page.tabs[0].href;
      expect(isFile(path.join(appDir, root, "layout.tsx")), root).toBe(true);
      for (const tab of page.tabs) {
        expect(isFile(pageFile(tab.href)), tab.href).toBe(true);
        expect(tab.href === root || tab.href.startsWith(`${root}/`), tab.href).toBe(true);
      }
    }
  });

  it("removes every merged URL and redirects it to an existing tab", () => {
    const tabHrefs = new Set<string>(tabs.map(tab => tab.href));
    for (const { source, destination } of CONSOLIDATED_REDIRECTS) {
      expect(isFile(pageFile(source)), `${source} still has a page`).toBe(false);
      expect(tabHrefs.has(destination), destination).toBe(true);
    }
  });

  it("points older aliases straight at a page, never through another redirect", () => {
    const sources = new Set([...COMPATIBILITY_REDIRECTS, ...CONSOLIDATED_REDIRECTS].map(r => r.source));
    for (const { source, destination } of COMPATIBILITY_REDIRECTS) {
      expect(sources.has(destination), `${source} → ${destination}`).toBe(false);
      expect(isFile(pageFile(destination)), destination).toBe(true);
    }
  });

  it("serves the shared table as Next.js redirects", async () => {
    const redirects = await nextConfig.redirects!();
    expect(redirects).toEqual([...COMPATIBILITY_REDIRECTS, ...CONSOLIDATED_REDIRECTS, ...HIDDEN_REDIRECTS].map(r => ({ ...r, permanent: false })));
  });

  it("removes hidden pages from the app and the navigation and sends them to an existing page", () => {
    const nav = [...analyticalNavItems(), ...MORE_LINKS].map(item => item.href.split("?")[0]);
    for (const { source, destination } of HIDDEN_REDIRECTS) {
      expect(isFile(pageFile(source)), `${source} still has a page`).toBe(false);
      expect(isFile(pageFile(destination)), destination).toBe(true);
      expect(nav).not.toContain(source);
    }
  });

  it("lists each merged page once in the navigation, under its page title", () => {
    const nav = [...analyticalNavItems(), ...MORE_LINKS];
    for (const page of Object.values(TABBED_PAGES)) {
      const entries = nav.filter(item => page.tabs.some(tab => tab.href === item.href.split("?")[0]));
      expect(entries.map(({ label, href }) => ({ label, href })), page.title).toEqual([{ label: page.title, href: page.tabs[0].href }]);
    }
    expect(nav.some(item => item.href.startsWith("/design")), "/design stays internal").toBe(false);
    const removed = new Set(CONSOLIDATED_REDIRECTS.map(r => r.source));
    expect(nav.filter(item => removed.has(item.href.split("?")[0]))).toEqual([]);
  });

  it("maps a tab path to its merged page for the current-page marker", () => {
    expect(mergedPagePath("/research/rapm/six-factor")).toBe("/research/rapm");
    expect(mergedPagePath("/methodology/learning")).toBe("/methodology");
    expect(mergedPagePath("/players/2544")).toBe("/players/2544");
  });

  it("selects the tab that owns a pathname", () => {
    const shooting = TABBED_PAGES.shooting.tabs;
    expect(activeRouteTab(shooting, "/research/shooting")?.label).toBe("Expected Shots");
    expect(activeRouteTab(shooting, "/research/shooting/aftermath")?.label).toBe("Shot Aftermath");
    expect(activeRouteTab(shooting, "/research/shootingx")).toBeUndefined();
  });
});
