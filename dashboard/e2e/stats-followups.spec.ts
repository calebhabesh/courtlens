import { expect, test } from "@playwright/test";
import { openWorkbench } from "./workbench-navigation";

// Databallr alignment, Stats instructions 7, 9-12 (owner, 2026-10-12, second review).
const rows = (page: import("@playwright/test").Page) => page.locator(".stats-table-row");

test("the table frame fits the viewport", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await openWorkbench(page, "/stats");
  const frame = await page.locator(".stats-table-frame").filter({ visible: true }).boundingBox();
  expect(frame!.y + frame!.height).toBeLessThanOrEqual(1000);
});

test("Select Team opens a logo grid and filters by the chosen team", async ({ page }) => {
  await openWorkbench(page, "/stats");
  await page.getByRole("button", { name: "Select Team", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Select Team" });
  await expect(dialog.getByRole("group", { name: "NBA teams" }).getByRole("button")).toHaveCount(30);
  await dialog.getByRole("button", { name: "Boston Celtics", exact: true }).click();
  await page.waitForURL(url => url.searchParams.get("teamId") === "BOS");
  await expect(page.getByRole("button", { name: /^Team: Boston Celtics/ })).toBeVisible();
});

test("position chips narrow the displayed players", async ({ page }) => {
  await openWorkbench(page, "/stats");
  await expect(rows(page)).toHaveCount(2);
  await page.getByRole("button", { name: "Guards", exact: true }).click();
  await page.waitForURL(url => url.searchParams.get("positions") === "G");
  await expect(rows(page)).toHaveCount(1);
  await expect(rows(page).first()).toContainText("Fixture Guard");
  await expect(page.getByRole("button", { name: "Guards", exact: true })).toHaveAttribute("aria-pressed", "true");
});

test("hovering a column header describes the stat", async ({ page }) => {
  await openWorkbench(page, "/stats");
  await page.locator(".stats-header-tier-2 th[data-column='pts_per_game']").hover();
  const tip = page.getByRole("tooltip");
  await expect(tip).toContainText("PTS");
  await expect(tip).toContainText("Click to sort");
});

test("a stat cell opens its season trend and Escape returns to the table", async ({ page }) => {
  await openWorkbench(page, "/stats");
  await rows(page).first().getByRole("button", { name: /^PTS .* Open PTS trend$/ }).click();
  const dialog = page.getByRole("dialog", { name: "PTS Trend" });
  await expect(dialog.getByRole("img", { name: /PTS by season/ })).toBeVisible();
  await expect(dialog.getByRole("combobox", { name: "Trend statistic" })).toHaveValue("pts_per_game");
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
});
