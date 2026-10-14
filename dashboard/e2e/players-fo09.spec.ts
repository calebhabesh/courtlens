import { test, expect, type Page } from "@playwright/test";
import { openWorkbench } from "./workbench-navigation";

// FO09 Players pages: Profile template for the player page, shared header/filter bar elsewhere.
async function noSidewaysScroll(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
}

test.describe("FO09 Players", () => {
  test("profile: one title, hero tiles, tabs in the URL, one Export menu", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await openWorkbench(page, "/players/23");
    await expect(page.locator("h1")).toHaveCount(1);
    await expect(page.locator("h1")).toContainText("Fixture Star");
    const tiles = page.getByLabel("Season summary").locator(".player-summary-stat");
    await expect(tiles).toHaveCount(6);
    await expect(tiles.first()).toContainText("PTS");
    const sections = page.getByRole("tablist", { name: "Profile sections" });
    await expect(sections.getByRole("tab", { name: "Overview" })).toHaveAttribute("aria-selected", "true");
    await sections.getByRole("tab", { name: "Game Log" }).click();
    await expect(page).toHaveURL(/tab=games/);
    await page.reload();
    await expect(page.getByRole("tab", { name: "Game Log" })).toHaveAttribute("aria-selected", "true");
    // Actions are icon buttons plus two menus, not a wall of buttons.
    await expect(page.getByRole("button", { name: "Export", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Explore", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Export PNG", exact: true })).toHaveCount(0);
    // No code-like cutoff rule in the visible flow.
    expect(await page.locator("main").innerText()).not.toMatch(/game_date\s*</);
    await page.setViewportSize({ width: 390, height: 844 });
    await noSidewaysScroll(page);
  });

  test("recent games: window, exposure and layout are separate 40px controls", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await openWorkbench(page, "/last-games?playerId=23");
    await expect(page.locator("h1")).toHaveText("Recent Games");
    for (const name of ["Appearance window", "Exposure", "Layout"]) {
      const group = page.getByRole("radiogroup", { name });
      await expect(group).toBeVisible();
      expect((await group.boundingBox())!.height).toBeGreaterThanOrEqual(38);
    }
    await page.getByRole("radiogroup", { name: "Appearance window" }).getByRole("radio", { name: "Last 5" }).click();
    await expect(page.getByLabel("Window summary")).toContainText("PTS");
    await expect(page.getByRole("button", { name: /^Load/ })).toHaveCount(0);
    await page.setViewportSize({ width: 390, height: 844 });
    await noSidewaysScroll(page);
  });

  test("ranking boards and tier lists use the nav labels and one-line notes", async ({ page }) => {
    await openWorkbench(page, "/rankings");
    await expect(page.locator("h1")).toHaveText("Ranking Boards");
    await expect(page.locator(".notice-box")).toHaveCount(0);
    await openWorkbench(page, "/tierlist");
    await expect(page.locator("h1")).toHaveText("Tier Lists");
    await expect(page.locator(".notice-box")).toHaveCount(0);
  });

  test("similar players: a 40px filter bar and the evidence hash only in Data details", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await openWorkbench(page, "/similar-players?playerId=23");
    const bar = page.getByRole("region", { name: "Similar players controls" });
    await expect(bar).toBeVisible();
    expect((await bar.boundingBox())!.height).toBeLessThanOrEqual(60);
    expect(await page.locator("main").innerText()).not.toMatch(/SHA-256/);
  });
});
