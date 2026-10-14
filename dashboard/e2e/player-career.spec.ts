import { expect, test } from "@playwright/test";
import { openWorkbench } from "./workbench-navigation";

// Alignment row 2: the player page melds Databallr's in-table career view into its own page.

test("a player opened from Stats offers Back to table, and Esc returns to the same table", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openWorkbench(page, "/stats");
  await page.waitForLoadState("networkidle");
  const statsUrl = page.url();
  await page.locator(".stats-player-link", { hasText: "Fixture Star" }).click();
  await page.waitForURL(url => url.pathname === "/players/23" && url.searchParams.get("from") === "stats");
  const back = page.getByRole("button", { name: /Back to table/ });
  await expect(back).toBeVisible();
  await page.keyboard.press("Escape");
  await page.waitForURL(url => url.pathname === "/stats");
  expect(page.url()).toBe(statsUrl);
  // Opened any other way, there is no table to return to.
  await openWorkbench(page, "/players/23");
  await expect(page.getByRole("heading", { level: 1, name: "Fixture Star" })).toBeVisible();
  await expect(page.getByRole("button", { name: /Back to table/ })).toHaveCount(0);
});

test("the header summarises the player and the summary card has no accent edge", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openWorkbench(page, "/players/23");
  await expect(page.locator("h1")).toHaveCount(1);
  const facts = page.locator(".player-bio-facts");
  await expect(facts).toContainText("Age28");
  await expect(facts).toContainText("6′8″ · 220 lb");
  await expect(facts).toContainText("7th season");
  await expect(facts).toContainText("2018 · R1, #9 · TOR");
  await expect(facts).toContainText("Fixtureland");
  // No combine record: no combine line, never a row of dashes.
  await expect(page.locator(".player-bio-combine")).toHaveCount(0);
  const summary = page.getByRole("region", { name: "Season summary" });
  await expect(summary.locator(".ui-stat-tile")).toHaveCount(6);
  expect(await summary.evaluate(el => getComputedStyle(el).boxShadow)).toBe("none");
});

test("the career table lists played seasons with a Career row, and phase links the page", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openWorkbench(page, "/players/23");
  const career = page.getByRole("table", { name: "Career statistics by season" });
  await expect(career.locator("tbody tr.player-career-row")).toHaveCount(1);
  await expect(career.locator("tbody tr.player-career-row").first()).toContainText("2025-26");
  await expect(career.locator("tbody tr.player-career-row").first()).toHaveAttribute("aria-current", "true");
  await expect(career.locator("tfoot")).toContainText("Career");
  await expect(career.locator(".player-career-pending")).toHaveCount(0);
  // View tabs reuse the Stats views.
  await page.getByRole("radiogroup", { name: "Career table views" }).getByRole("radio", { name: "Shooting", exact: true }).click();
  await expect(career.locator("thead")).toContainText("FGM");
  // The fixture catalog observes no playoffs, so that phase cannot be chosen.
  await expect(page.getByRole("radiogroup", { name: "Phase" }).getByRole("radio", { name: "Playoffs" })).toBeDisabled();
  // The trajectory moved to Game Log; Overview leads with the season summary.
  await expect(page.locator(".pc12-profile-trajectory")).toHaveCount(0);
  await page.getByRole("tablist", { name: "Profile sections" }).getByRole("tab", { name: "Game Log" }).click();
  await expect(page.getByRole("region", { name: "Headline result" }).locator(".trend-svg").first()).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
});
