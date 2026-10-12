import { expect, test } from "@playwright/test";
import { openWorkbench } from "./workbench-navigation";

// Databallr alignment, Stats instructions 7, 9-12 (second review) and 15-19 (third review).
const rows = (page: import("@playwright/test").Page) => page.locator(".stats-table-row");

test("the table frame fills the unscrolled page to just above its bottom", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await openWorkbench(page, "/stats");
  const frame = page.locator(".stats-table-frame").filter({ visible: true });
  await expect.poll(async () => { const box = await frame.boundingBox(); return box!.y + box!.height; }).toBeGreaterThan(960);
  const box = await frame.boundingBox();
  expect(box!.y + box!.height).toBeLessThanOrEqual(1000);
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

test("position chips narrow the displayed players and rows show the position", async ({ page }) => {
  await openWorkbench(page, "/stats");
  await expect(rows(page)).toHaveCount(2);
  const chips = page.getByRole("group", { name: "Estimated positions" }).getByRole("button");
  await expect(chips).toHaveText(["PG", "SG", "SF", "PF", "C"]);
  await page.getByRole("button", { name: "Point guards", exact: true }).click();
  await page.waitForURL(url => url.searchParams.get("positions") === "PG");
  await expect(rows(page)).toHaveCount(1);
  await expect(rows(page).first()).toContainText("Fixture Guard");
  await expect(rows(page).first().locator(".player-cell-teams")).toContainText("PG");
  await expect(page.getByRole("button", { name: "Point guards", exact: true })).toHaveAttribute("aria-pressed", "true");
});

test("Draft Class narrows the table to one draft year", async ({ page }) => {
  await openWorkbench(page, "/stats");
  await page.getByRole("button", { name: "Draft Class" }).click();
  await page.getByRole("menuitem", { name: "2018", exact: true }).click();
  await page.waitForURL(url => url.searchParams.get("draftYear") === "2018");
  await expect(rows(page)).toHaveCount(1);
  await expect(page.getByRole("button", { name: "2018 Draft" })).toBeVisible();
  await page.getByRole("button", { name: "2018 Draft" }).click();
  await page.getByRole("menuitem", { name: "All draft classes" }).click();
  await page.waitForURL(url => !url.searchParams.has("draftYear"));
  await expect(rows(page)).toHaveCount(2);
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
  // Databallr prints each value inside its data point.
  await expect(dialog.locator(".chart-value-dot text").first()).toHaveText(/\d/);
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
});

test("the name search spans the player cards and its results drop from the field", async ({ page }) => {
  await openWorkbench(page, "/stats");
  const field = (await page.locator(".stats-header-search .lookup-input-wrapper").boundingBox())!;
  const card = (await rows(page).first().locator("td").first().boundingBox())!;
  expect(Math.abs(field.x - card.x)).toBeLessThanOrEqual(12);
  await page.getByRole("combobox", { name: "Filter players by name" }).fill("fix");
  const results = page.locator(".lookup-floating-dropdown");
  await expect(results).toBeVisible();
  expect(Math.abs((await results.boundingBox())!.x - field.x)).toBeLessThanOrEqual(1);
});

test("Reset table returns to the default sort and first page", async ({ page }) => {
  await openWorkbench(page, "/stats");
  const reset = page.getByRole("button", { name: "Reset table" });
  await expect(reset).toBeDisabled();
  await page.getByRole("button", { name: "Sort by AST" }).click();
  await page.waitForURL(url => url.searchParams.has("sortMetric"));
  await expect(reset).toBeEnabled();
  await reset.click();
  await page.waitForURL(url => !url.searchParams.has("sortMetric"));
  await expect(reset).toBeDisabled();
});
