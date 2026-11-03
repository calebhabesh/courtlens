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
  await page.getByRole("button", { name: "Point Guards", exact: true }).click();
  await page.waitForURL(url => url.searchParams.get("positions") === "PG");
  await expect(rows(page)).toHaveCount(1);
  await expect(rows(page).first()).toContainText("Fixture Guard");
  await expect(rows(page).first().locator(".player-cell-teams")).toContainText("PG");
  await expect(page.getByRole("button", { name: "Point Guards", exact: true })).toHaveAttribute("aria-pressed", "true");
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

test("the name search spans the player cards and filters the table as you type", async ({ page }) => {
  await openWorkbench(page, "/stats");
  const field = (await page.locator(".stats-header-search .lookup-input-wrapper").boundingBox())!;
  const card = (await rows(page).first().locator("td").first().boundingBox())!;
  expect(Math.abs(field.x - card.x)).toBeLessThanOrEqual(12);
  // The search spans the cards: its right edge reaches the details buttons below.
  const details = (await rows(page).first().getByRole("button", { name: /^Open details for / }).boundingBox())!;
  expect(Math.abs(field.x + field.width - (details.x + details.width))).toBeLessThanOrEqual(8);
  // Alphabetical order is a table tool (A–Z icon), toggling to Z–A.
  const az = page.getByRole("group", { name: "Table tools" }).getByRole("button", { name: "Sort by Player" });
  await az.click();
  await page.waitForURL(url => url.searchParams.get("sortMetric") === "player_name" && url.searchParams.get("sortDirection") === "asc");
  await expect(az).toHaveAttribute("aria-pressed", "true");
  await expect(az).toHaveAttribute("title", "Sort players Z–A");
  // Databallr: typing narrows the table's own rows; there is no suggestion dropdown.
  await page.getByRole("searchbox", { name: "Filter players by name" }).fill("guard");
  await page.waitForURL(url => url.searchParams.get("name") === "guard");
  await expect(rows(page)).toHaveCount(1);
  await expect(page.locator(".lookup-floating-dropdown, [role='listbox']")).toHaveCount(0);
});

test("Reset table clears every sort and filter, even mid-navigation", async ({ page }) => {
  await openWorkbench(page, "/stats?positions=PG&draftYear=2020&minGames=5");
  await page.getByRole("button", { name: "Sort by AST" }).click();
  await page.waitForURL(url => url.searchParams.has("sortMetric"));
  await page.getByRole("button", { name: "Reset table" }).click();
  await page.waitForURL(url => ["sortMetric", "positions", "draftYear", "minGames"].every(key => !url.searchParams.has(key)));
  await expect(rows(page)).toHaveCount(2);
});

test("hovering a stat cell highlights that stat in the player preview", async ({ page }) => {
  await openWorkbench(page, "/stats");
  const row = rows(page).first();
  await row.hover();
  await row.locator("td[data-column='ast_per_game']").hover();
  const metric = page.locator(".stats-preview-metric[data-column='ast_per_game']");
  await expect(metric).toHaveClass(/is-highlighted/);
  await expect(page.locator(".stats-preview-metric.is-highlighted")).toHaveCount(1);
  await page.mouse.move(5, 5);
  await expect(page.locator(".stats-preview-metric.is-highlighted")).toHaveCount(0);
});

test("table and preview keep one height; selected players fit inside the frame", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await openWorkbench(page, "/stats");
  const frame = page.locator(".stats-table-frame").filter({ visible: true });
  const rail = page.getByRole("complementary", { name: "Player preview" });
  await expect(rail).toContainText("Player Preview");
  // The frame ends 16px above the viewport bottom and the rail matches it, tray or not.
  const fits = async () => {
    const f = (await frame.boundingBox())!, r = (await rail.boundingBox())!;
    // Page coordinates: the frame fills the unscrolled page, whatever the scroll position now.
    const scrollY = await page.evaluate(() => window.scrollY);
    return Math.abs(f.y + scrollY + f.height - 984) <= 1 && Math.abs(f.height - r.height) < 1;
  };
  await expect.poll(fits).toBe(true);
  await rows(page).first().getByRole("button", { name: /^Add .* to comparison$/ }).click();
  const tray = frame.getByRole("region", { name: "Comparison selection tray" });
  await expect(tray).toBeVisible();
  await expect.poll(fits).toBe(true);
  await rows(page).first().getByRole("button", { name: /^Remove .* from comparison$/ }).click();
  await expect(tray).toHaveCount(0);
});

test("trend points stay clear of the axes", async ({ page }) => {
  await openWorkbench(page, "/stats");
  await rows(page).first().getByRole("button", { name: /^PTS .* Open PTS trend$/ }).click();
  const chart = page.getByRole("dialog", { name: "PTS Trend" }).locator(".stats-trend-figure svg");
  await expect(chart.locator(".chart-value-dot").first()).toBeVisible();
  const gap = await chart.evaluate(svg => {
    const axisEnd = Math.max(...[...svg.querySelectorAll(".stats-trend-grid text")].map(t => t.getBoundingClientRect().right));
    const gridBottom = Math.max(...[...svg.querySelectorAll(".stats-trend-grid line")].map(l => l.getBoundingClientRect().bottom));
    const dots = [...svg.querySelectorAll(".chart-value-dot rect, .chart-value-dot circle")].map(r => r.getBoundingClientRect());
    return { left: Math.min(...dots.map(d => d.left)) - axisEnd, bottom: gridBottom - Math.max(...dots.map(d => d.bottom)) };
  });
  expect(gap.left).toBeGreaterThan(8);
  expect(gap.bottom).toBeGreaterThan(0);
});
