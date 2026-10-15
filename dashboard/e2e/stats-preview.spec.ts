import { expect, test } from "@playwright/test";
import { openWorkbench } from "./workbench-navigation";

const rows = (page: import("@playwright/test").Page) => page.locator(".stats-table-row");
const preview = (page: import("@playwright/test").Page) => page.getByRole("complementary", { name: "Player preview" });

test("hover and keyboard preview reuse table values without fetching or stealing focus", async ({ page }) => {
  await page.setViewportSize({ width: 2048, height: 1100 });
  await openWorkbench(page, "/stats");
  await page.waitForLoadState("networkidle");
  await expect(preview(page)).toContainText("Hover over a player");
  const search = page.getByRole("searchbox", { name: "Filter players by name", exact: true });
  await search.focus();
  await page.waitForLoadState("networkidle");
  await search.press("Escape");
  const fetches: string[] = [];
  page.on("request", request => { if (["fetch", "xhr"].includes(request.resourceType())) fetches.push(request.url()); });
  const identity = rows(page).first().locator(".pinned-col-name");
  const idleBackground = await identity.evaluate(cell => getComputedStyle(cell).backgroundColor);
  await rows(page).first().hover();
  await expect.poll(() => identity.evaluate(cell => getComputedStyle(cell).backgroundColor)).not.toBe(idleBackground);
  await expect(preview(page).getByRole("heading", { name: "Fixture Star" })).toBeVisible();
  await expect(search).toBeFocused();
  const tableValues = await rows(page).first().locator(".stat-main-value").allTextContents();
  expect(await preview(page).locator("dd strong").allTextContents()).toEqual(tableValues);
  const tablePercentiles = await rows(page).first().locator(".stats-metric-cell").evaluateAll(cells => cells.map(cell => cell.querySelector(".stat-pct-sublabel")?.textContent?.trim() ?? "—"));
  expect(await preview(page).locator(".stats-preview-percentile").allTextContents()).toEqual(tablePercentiles);
  await page.locator("h1").hover();
  await expect.poll(() => identity.evaluate(cell => getComputedStyle(cell).backgroundColor)).toBe(idleBackground);
  await expect(preview(page).getByRole("heading", { name: "Fixture Star" })).toBeVisible();
  await rows(page).nth(1).focus();
  await expect(preview(page).getByRole("heading", { name: "Fixture Guard" })).toBeVisible();
  await expect(rows(page).nth(1)).toBeFocused();
  expect(fetches).toEqual([]);
  await page.getByRole("button", { name: "Table settings", exact: true }).click();
  await page.getByRole("menuitem", { name: "Hide percentiles", exact: true }).click();
  await expect(preview(page).locator(".stats-preview-percentile")).toHaveCount(0);
  await expect(rows(page).first().locator(".stat-pct-sublabel")).toHaveCount(0);
});

test("pinning, collapsing and expanding preserve the preview and table geometry", async ({ page }) => {
  await page.setViewportSize({ width: 2048, height: 1100 });
  await openWorkbench(page, "/stats");
  const region = page.getByRole("region", { name: "Player statistics scroll area" });
  await rows(page).first().getByRole("button", { name: "Pin preview for Fixture Star" }).click();
  await rows(page).nth(1).hover();
  await expect(preview(page).getByRole("heading", { name: "Fixture Star" })).toBeVisible();
  await expect(preview(page).getByRole("button", { name: "Unpin player preview" })).toHaveAttribute("aria-pressed", "true");
  const initialWidth = (await region.boundingBox())!.width;
  await preview(page).getByRole("button", { name: "Collapse player preview" }).click();
  expect((await region.boundingBox())!.width).toBeGreaterThan(initialWidth);
  await preview(page).getByRole("button", { name: "Expand player preview" }).click();
  await expect(preview(page).getByRole("heading", { name: "Fixture Star" })).toBeVisible();
  const initialHeight = (await region.boundingBox())!.height;
  await page.getByRole("button", { name: "Expand table", exact: true }).click();
  expect((await region.boundingBox())!.height).toBeGreaterThan(initialHeight);
  await expect(preview(page).getByRole("heading", { name: "Fixture Star" })).toBeVisible();
  await page.getByRole("button", { name: "Standard height", exact: true }).click();
  await preview(page).getByRole("button", { name: "Unpin player preview" }).click();
  await rows(page).nth(1).hover();
  await expect(preview(page).getByRole("heading", { name: "Fixture Guard" })).toBeVisible();
});

test("wide and smaller desktop columns align with stable pinned identity while scrolling", async ({ page }) => {
  for (const width of [2560, 1440]) {
    await page.setViewportSize({ width, height: 1100 });
    await openWorkbench(page, "/stats?identityMode=photos&density=standard");
    await expect(rows(page).first()).toBeVisible();
    const geometry = await page.locator(".dense-stats-table").evaluate(element => {
      const table = element as HTMLTableElement;
      const headers = [...table.tHead!.rows[1].cells].map(cell => cell.getBoundingClientRect());
      const body = [...table.tBodies[0].rows[0].cells].map(cell => cell.getBoundingClientRect());
      return { headerWidths: headers.map(cell => cell.width), bodyWidths: body.map(cell => cell.width),
        headerLeft: headers.map(cell => cell.x), bodyLeft: body.map(cell => cell.x), rowHeight: body[0].height,
        identityWidths: body.slice(0, 3).map(cell => cell.width) };
    });
    expect(geometry.rowHeight).toBeCloseTo(52, 1);
    geometry.identityWidths.slice(0, 2).forEach((value, index) => expect(value).toBeCloseTo([28, 312][index], 0));
    // One search header spans the compare and name columns (Databallr); metric columns match 1:1.
    expect(geometry.headerWidths[0]).toBeCloseTo(geometry.bodyWidths[0] + geometry.bodyWidths[1], 0);
    expect(geometry.headerLeft[0]).toEqual(geometry.bodyLeft[0]);
    expect(geometry.headerWidths.slice(1)).toEqual(geometry.bodyWidths.slice(2));
    expect(geometry.headerLeft.slice(1)).toEqual(geometry.bodyLeft.slice(2));
    const region = page.getByRole("region", { name: "Player statistics scroll area" });
    const identity = rows(page).first().locator(".pinned-col-name");
    const before = (await identity.boundingBox())!.x;
    await region.evaluate(element => { element.scrollLeft = 400; });
    expect((await identity.boundingBox())!.x).toBe(before);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width);
  }
  // A sparse preset must not inflate each metric to fill a wide monitor.
  await page.setViewportSize({ width: 2560, height: 1100 });
  await openWorkbench(page, "/stats?viewId=trueshooting");
  const widths = await rows(page).first().locator(".stats-metric-cell").evaluateAll(cells => cells.map(cell => cell.getBoundingClientRect().width));
  expect(Math.max(...widths)).toBeLessThanOrEqual(141);
});

test("mobile details, collapsed filters and submitted search remain accessible", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await openWorkbench(page, "/stats");
  await expect(preview(page)).toBeHidden();
  await expect(page.getByRole("region", { name: "Statistics filters", exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Filters", exact: true }).click();
  await expect(page.getByLabel("Minimum total minutes played")).toBeVisible();
  await page.getByRole("button", { name: "Filters", exact: true }).click();
  // The team picker sits with the scope controls, which collapse into the Filters sheet on phones.
  await page.locator(".filter-bar-toggle-slot > button").click();
  const sheet = page.getByRole("dialog", { name: "Filters", exact: true });
  await expect(sheet.getByRole("button", { name: "Select Team", exact: true })).toBeVisible();
  await expect(sheet.getByRole("group", { name: "Positions" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(sheet).toHaveCount(0);
  const search = page.getByRole("searchbox", { name: "Filter players by name", exact: true });
  await search.fill("Guard"); await search.press("Enter");
  await page.waitForURL(/name=Guard/);
  const region = page.getByRole("region", { name: "Player statistics scroll area" });
  await region.evaluate(element => { element.scrollLeft = element.scrollWidth; });
  const detail = page.getByRole("button", { name: "Open details for Fixture Guard" });
  await detail.click();
  await expect(page.getByRole("dialog", { name: "Fixture Guard", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Close player details sidebar", exact: true }).click();
  await expect(detail).toBeFocused();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(375);
});
