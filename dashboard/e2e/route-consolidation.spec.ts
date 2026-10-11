import { test, expect } from "@playwright/test";
import { CONSOLIDATED_REDIRECTS, TABBED_PAGES } from "../lib/route-consolidation";
import { openWorkbench } from "./workbench-navigation";

// FO07 route consolidation (D3): merged pages are one title with link tabs, and every removed URL
// lands on its tab with the query string intact.
const pages = Object.values(TABBED_PAGES);
function pageOf(href: string) {
  return pages.find(page => page.tabs.some(tab => tab.href === href))!;
}

test.describe("FO07 route consolidation", () => {
  test("every removed URL redirects to its tab and keeps the query", async ({ request }) => {
    for (const { source, destination } of CONSOLIDATED_REDIRECTS) {
      const response = await request.get(`${source}?season=2024-25&playerId=7`, { maxRedirects: 0 });
      expect(response.status(), source).toBe(307);
      const location = new URL(response.headers().location, "http://localhost");
      expect(location.pathname, source).toBe(destination);
      expect(location.searchParams.get("season"), source).toBe("2024-25");
      expect(location.searchParams.get("playerId"), source).toBe("7");
    }
  });

  test("an old link opens the merged page with its tab selected", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    for (const { source, destination } of CONSOLIDATED_REDIRECTS) {
      const merged = pageOf(destination);
      const tab = merged.tabs.find(item => item.href === destination)!;
      await page.goto(`${source}?season=2024-25`);
      await expect(page).toHaveURL(url => url.pathname === destination && url.searchParams.get("season") === "2024-25");
      await expect(page.getByRole("heading", { level: 1 }), source).toHaveText(merged.title);
      const tabs = page.getByRole("navigation", { name: `${merged.title} sections` });
      await expect(tabs.getByRole("link")).toHaveText(merged.tabs.map(item => item.label));
      await expect(tabs.locator('[aria-current="page"]'), source).toHaveText(tab.label);
    }
  });

  test("tabs switch in place and carry the scope and player", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await openWorkbench(page, "/similar-players?season=2024-25&playerId=1627751");
    const tabs = page.getByRole("navigation", { name: "Similar Players sections" });
    await tabs.getByRole("link", { name: "Shot Profile" }).click();
    await expect(page).toHaveURL(url => url.pathname === "/similar-players/shot-profile"
      && url.searchParams.get("season") === "2024-25" && url.searchParams.get("playerId") === "1627751");
    await expect(tabs.locator('[aria-current="page"]')).toHaveText("Shot Profile");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Similar Players");
    // The embedded view drops its own title; the page has exactly one h1.
    await expect(page.locator("h1")).toHaveCount(1);
  });

  test("the Research menu lists each merged page once", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await openWorkbench(page, "/stats");
    await page.getByRole("button", { name: "Research", exact: true }).click();
    const menu = page.getByRole("menu");
    await expect(menu.getByRole("menuitem", { name: "RAPM Research" })).toHaveAttribute("href", /^\/research\/rapm(\?|$)/);
    await expect(menu.getByRole("menuitem", { name: "Shooting", exact: true })).toHaveAttribute("href", /^\/research\/shooting(\?|$)/);
    for (const removed of ["Six-Factor RAPM", "Expected Shots", "Adjusted Shooting", "Shot Aftermath"]) {
      await expect(menu.getByRole("menuitem", { name: removed })).toHaveCount(0);
    }
  });

  test("tabs fit a phone without page overflow", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/research/shooting/aftermath");
    const tabs = page.getByRole("navigation", { name: "Shooting sections" });
    await expect(tabs.locator('[aria-current="page"]')).toHaveText("Shot Aftermath");
    for (const box of await tabs.getByRole("link").evaluateAll(links => links.map(link => link.getBoundingClientRect().height))) {
      expect(box).toBeGreaterThanOrEqual(40);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });
});
