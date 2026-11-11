import { test, expect } from "@playwright/test";
import { CONSOLIDATED_REDIRECTS, OWN_HEADER_TABS, TABBED_PAGES } from "../lib/route-consolidation";
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
      // RD17: a redirect may name an in-page tab (`?tab=`); its own query is kept beside the old link's.
      const target = new URL(destination, "http://localhost");
      expect(location.pathname, source).toBe(target.pathname);
      for (const [key, value] of target.searchParams) expect(location.searchParams.get(key), `${source} ${key}`).toBe(value);
      expect(location.searchParams.get("season"), source).toBe("2024-25");
      expect(location.searchParams.get("playerId"), source).toBe("7");
    }
  });

  test("an old link opens the merged page with its tab selected", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    for (const { source, destination } of CONSOLIDATED_REDIRECTS) {
      const merged = pageOf(destination);
      // RD17: Expected Shots, Adjusted Shooting and Shot Aftermath left the Shooting page; the RD17 test below covers them.
      if (!merged) continue;
      const tab = merged.tabs.find(item => item.href === destination)!;
      await page.goto(`${source}?season=2024-25`);
      await expect(page).toHaveURL(url => url.pathname === destination && url.searchParams.get("season") === "2024-25");
      const tabs = page.getByRole("navigation", { name: `${merged.title} sections` });
      // RD06: a tab with its own centred hero (Learning) shows its own title and no tab bar.
      if (OWN_HEADER_TABS.has(destination)) {
        await expect(page.getByRole("heading", { level: 1 }), source).toHaveText(tab.label);
        await expect(tabs, source).toHaveCount(0);
        continue;
      }
      await expect(page.getByRole("heading", { level: 1 }), source).toHaveText(merged.title);
      // A page left with one tab shows no tab bar (What's New since the Blog was removed).
      if (merged.tabs.length === 1) { await expect(tabs, source).toHaveCount(0); continue; }
      await expect(tabs.getByRole("link")).toHaveText(merged.tabs.map(item => item.label));
      await expect(tabs.locator('[aria-current="page"]'), source).toHaveText(tab.label);
    }
  });

  test("RD17: the Shooting page's old links land on Shot Quality's earlier attempt, zTS's Defense tab and a standalone Shot Aftermath", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/research/expected-shots?season=2024-25");
    await expect(page).toHaveURL(url => url.pathname === "/research/shot-quality" && url.searchParams.get("tab") === "model" && url.searchParams.get("season") === "2024-25");
    await expect(page.getByRole("heading", { name: "An earlier attempt" })).toBeVisible();
    await expect(page.locator(".sq-earlier-list")).toHaveAttribute("open", "");
    await page.goto("/research/adjusted-shooting");
    await expect(page).toHaveURL(url => url.pathname === "/research/zts" && url.searchParams.get("tab") === "defense");
    await expect(page.getByRole("radio", { name: "Defense" })).toBeChecked();
    await expect(page.getByRole("heading", { name: "Points allowed by play type" })).toBeVisible();
    await page.goto("/shot-aftermath");
    await expect(page).toHaveURL(url => url.pathname === "/research/shooting/aftermath");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("What happens after the shot?");
    await expect(page.getByRole("navigation", { name: "Shooting sections" })).toHaveCount(0);
    for (const [source, destination] of [["/zts", "/research/zts"], ["/shotquality", "/research/shot-quality"]] as const) {
      await page.goto(source);
      await expect(page, source).toHaveURL(url => url.pathname === destination);
    }
  });

  test("the old Shot Profile tab opens Player Twins with its scope", async ({ page }) => {
    await openWorkbench(page, "/similar-players/shot-profile?season=2024-25&playerId=1627751");
    await expect(page).toHaveURL(url => url.pathname === "/similar-players"
      && url.searchParams.get("season") === "2024-25" && url.searchParams.get("playerId") === "1627751");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Player Twins");
  });

  test("the Research menu lists each merged page once", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await openWorkbench(page, "/stats");
    await page.getByRole("button", { name: "Research", exact: true }).click();
    const menu = page.getByRole("menu");
    await expect(menu.getByRole("menuitem", { name: /^Six-Factor RAPM/ })).toHaveAttribute("href", /^\/research\/rapm\/six-factor(\?|$)/);
    // RD17 (owner, 2026-11-10): Research → Shooting is Shot Quality, zTS, Shot Aftermath and Defensive Shot Quality; the Shooting page is gone.
    const group = menu.getByRole("group", { name: "Shooting" });
    const shooting = (await group.count()) ? group : menu;
    await expect(menu.getByRole("menuitem", { name: /^Shot Aftermath/ })).toHaveAttribute("href", /^\/research\/shooting\/aftermath(\?|$)/);
    await expect(menu.getByRole("menuitem", { name: /^Shot Quality/ })).toHaveAttribute("href", /^\/research\/shot-quality(\?|$)/);
    await expect(menu.getByRole("menuitem", { name: /^zTS/ })).toHaveAttribute("href", /^\/research\/zts(\?|$)/);
    await expect(shooting.getByRole("menuitem", { name: /^Shooting\b/ })).toHaveCount(0);
    for (const removed of ["RAPM Research", "Expected Shots", "Adjusted Shooting"]) {
      // Anchored: a kept item's description may mention a removed page's name.
      await expect(menu.getByRole("menuitem", { name: new RegExp(`^${removed}`) })).toHaveCount(0);
    }
  });

  test("removed Research pages redirect and the Research menu carries an icon on every item", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto("/research/trends?playerId=1630567&season=2025-26");
    await expect(page).toHaveURL(url => url.pathname === "/last-games" && url.searchParams.get("playerId") === "1630567");
    await page.goto("/research/distributions");
    await expect(page).toHaveURL(url => url.pathname === "/last-games");
    await page.goto("/whats-new/blog");
    await expect(page).toHaveURL(url => url.pathname === "/whats-new");
    await expect(page.getByRole("navigation", { name: "What's New sections" })).toHaveCount(0);
    await page.getByRole("button", { name: "Research", exact: true }).click();
    const menu = page.getByRole("menu", { name: "Research" });
    await expect(menu.getByRole("menuitem")).not.toHaveCount(0);
    for (const removed of ["Workload Trends", "Distributions & Splits", "Case Studies", "Saved Investigations", "Evaluation Archive"]) {
      await expect(menu.getByRole("menuitem", { name: removed })).toHaveCount(0);
    }
    const items = menu.getByRole("menuitem");
    for (let index = 0; index < await items.count(); index++) await expect(items.nth(index).locator("svg")).toBeVisible();
    const box = await menu.boundingBox();
    expect(box!.x + box!.width).toBeLessThanOrEqual(1280);
  });

  test("tabs fit a phone without page overflow", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/methodology");
    const tabs = page.getByRole("navigation", { name: "Methodology sections" });
    await expect(tabs.locator('[aria-current="page"]')).toHaveText("Definitions");
    for (const box of await tabs.getByRole("link").evaluateAll(links => links.map(link => link.getBoundingClientRect().height))) {
      expect(Math.round(box)).toBeGreaterThanOrEqual(40);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });
});
