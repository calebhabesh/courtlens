import { expect, test } from "@playwright/test";
import { openWorkbench } from "./workbench-navigation";

test("missing ratings stay last in both sort directions and the plot supports keyboard access", async ({ page }) => {
  await openWorkbench(page, "/teams?metrics=all_ratings&sort=off_rating&direction=asc");
  await expect(page.locator("tbody tr").first()).toContainText("Toronto Raptors");
  await expect(page.locator("tbody tr").last().locator("td").nth(4)).toHaveText("—");
  await page.getByRole("button", { name: "Sort by ORTG", exact: true }).click();
  await expect(page.locator("tbody tr").last()).toContainText("Boston Celtics");
  await page.getByRole("radio", { name: "Efficiency Plot", exact: true }).click();
  const point = page.getByRole("link", { name: /Toronto Raptors: offensive rating/ });
  await point.focus();
  await expect(page.locator(".team-scatter-tooltip")).toContainText("Toronto Raptors");
  await expect(point).toHaveAttribute("aria-label", /pace unknown/);
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/teams\/100/);
});

for (const width of [1440, 390]) {
  test(`Team Stats scope, views and filters survive reload at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await openWorkbench(page, "/teams?releaseId=fixture-release&season=2025-26&phase=regular_season&beforeDate=2026-04-13");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Team Stats & Cohorts");
    if (width < 768) await page.getByRole("button", { name: /^Filters/ }).click();
    await (width < 768 ? page.getByRole("dialog") : page).getByLabel("Search franchises").fill("BOS");
    if (width < 768) await page.getByRole("button", { name: "Close drawer" }).click();
    await expect(page.locator("tbody tr")).toHaveCount(1);
    const link = page.getByRole("link", { name: "Profile", exact: true });
    await expect(link).toHaveAttribute("href", /releaseId=fixture-release/);
    await expect(link).toHaveAttribute("href", /beforeDate=2026-04-13/);
    await page.getByRole("radio", { name: "Cards", exact: true }).click();
    await page.reload();
    await expect(page.getByRole("radio", { name: "Cards", exact: true })).toHaveAttribute("aria-checked", "true");
    const cards = page.locator(".team-cards-grid").filter({ visible: true });
    await expect(cards).toHaveCount(1);
    await expect(cards).toContainText("Boston Celtics");
    await expect(cards).not.toContainText("Toronto Raptors");
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width);
    await expect(page.getByRole("button", { name: /^Load/ })).toHaveCount(0);
  });

  test(`Team profile tabs preserve unknowns and have keyboard access at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await openWorkbench(page, "/teams/100?releaseId=fixture-release&season=2025-26&beforeDate=2026-04-13");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Toronto Raptors");
    await expect(page.getByLabel("Team summary").locator(".ui-stat-tile")).toHaveCount(8);
    await expect(page.getByRole("img", { name: "TOR", exact: true }).first()).toBeVisible();
    await page.getByRole("tab", { name: "Overview", exact: true }).focus();
    await page.keyboard.press("ArrowRight");
    await expect(page.getByRole("tab", { name: "Four Factors", exact: true })).toBeFocused();
    await expect(page.locator(".factors-card").last()).toContainText("—");
    await page.getByRole("tab", { name: "Schedule", exact: true }).click();
    await expect(page).toHaveURL(/tab=schedule/);
    const game = page.locator("tbody tr").filter({ hasText: "Mar 1, 2026" });
    await expect(game).toContainText("BOS");
    await expect(game.locator("td").nth(4)).toHaveText("0");
    await expect(game.locator("td").nth(5)).toHaveText("—");
    await expect(game.locator("td").last()).toHaveText("—");
    await page.reload();
    await expect(page.getByRole("tab", { name: "Schedule", exact: true })).toHaveAttribute("aria-selected", "true");
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width);
    await page.getByRole("button", { name: "Data details", exact: true }).click();
    await expect(page.getByRole("dialog")).toContainText("fixture-release");
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toHaveCount(0);
  });
}
