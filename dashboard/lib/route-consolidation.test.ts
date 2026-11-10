import { statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { activeRouteTab } from "@/components/ui/route-tabs";
import { analyticalNavItems, MORE_LINKS, TAB_SHORTCUTS } from "./nav-model";
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

  it("backs every tab with a page under one layout, at the page's own path or a sub-path", () => {
    for (const page of Object.values(TABBED_PAGES)) {
      const root = page.tabs.map(tab => tab.href).sort((a, b) => a.length - b.length)[0];
      expect(isFile(path.join(appDir, root, "layout.tsx")), root).toBe(true);
      for (const tab of page.tabs) {
        expect(isFile(pageFile(tab.href)), tab.href).toBe(true);
        expect(tab.href === root || tab.href.startsWith(`${root}/`), tab.href).toBe(true);
      }
    }
  });

  it("removes every merged URL and redirects it to an existing tab or page", () => {
    const tabHrefs = new Set<string>(tabs.map(tab => tab.href));
    for (const { source, destination } of CONSOLIDATED_REDIRECTS) {
      expect(isFile(pageFile(source)), `${source} still has a page`).toBe(false);
      // RD17: a page's in-page tab (`?tab=`) or a page that left its tabbed page (Shot Aftermath) is a valid landing too.
      expect(tabHrefs.has(destination) || isFile(pageFile(destination)), destination).toBe(true);
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
      const entries = nav.filter(item => !TAB_SHORTCUTS.has(item.href) && page.tabs.some(tab => tab.href === item.href.split("?")[0]));
      expect(entries.map(({ label, href }) => ({ label, href })), page.title).toEqual([{ label: page.title, href: page.tabs[0].href }]);
    }
    expect(nav.some(item => item.href.startsWith("/design")), "/design stays internal").toBe(false);
    const removed = new Set(CONSOLIDATED_REDIRECTS.map(r => r.source));
    expect(nav.filter(item => removed.has(item.href.split("?")[0]))).toEqual([]);
  });

  it("maps a tab path to its merged page for the current-page marker", () => {
    expect(mergedPagePath("/research/rapm")).toBe("/research/rapm/six-factor");
    expect(mergedPagePath("/methodology/learning")).toBe("/methodology");
    expect(mergedPagePath("/players/2544")).toBe("/players/2544");
  });

  it("selects the tab that owns a pathname", () => {
    const methodology = TABBED_PAGES.methodology.tabs;
    expect(activeRouteTab(methodology, "/methodology")?.label).toBe("Definitions");
    expect(activeRouteTab(methodology, "/methodology/learning")?.label).toBe("Learning");
    expect(activeRouteTab(methodology, "/methodologyx")).toBeUndefined();
  });

  it("removed Research pages redirect to their replacement and no longer exist", () => {
    const redirects = new Map([...CONSOLIDATED_REDIRECTS, ...HIDDEN_REDIRECTS].map(r => [r.source, r.destination]));
    expect(redirects.get("/research/trends")).toBe("/last-games");
    expect(redirects.get("/research/distributions")).toBe("/last-games");
    expect(redirects.get("/whats-new/blog")).toBe("/whats-new");
    expect(redirects.get("/blog")).toBe("/whats-new");
    for (const route of ["/research/trends", "/research/distributions", "/whats-new/blog"]) expect(isFile(pageFile(route)), route).toBe(false);
  });

  it("RD17: Expected Shots and Adjusted Shooting redirect straight to their new tabs, and their pages are gone", () => {
    const redirects = new Map([...CONSOLIDATED_REDIRECTS, ...COMPATIBILITY_REDIRECTS].map(r => [r.source, r.destination]));
    for (const source of ["/research/shooting", "/research/expected-shots"]) expect(redirects.get(source), source).toBe("/research/shot-quality?tab=model&earlier=open");
    for (const source of ["/research/shooting/adjusted", "/research/adjusted-shooting"]) expect(redirects.get(source), source).toBe("/research/zts?tab=defense");
    expect(redirects.get("/zts")).toBe("/research/zts");
    expect(redirects.get("/shotquality")).toBe("/research/shot-quality");
    for (const route of ["/research/shooting", "/research/shooting/adjusted"]) expect(isFile(pageFile(route)), route).toBe(false);
    expect(isFile(pageFile("/research/shooting/aftermath"))).toBe(true);
    expect(Object.values(TABBED_PAGES).flatMap(page => page.tabs).some(tab => tab.href.startsWith("/research/shooting"))).toBe(false);
  });
});
