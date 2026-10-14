import { expect, test } from "@playwright/test";
import { openWorkbench } from "./workbench-navigation";

test("Overview uses dated DARKO columns, sort, reset and stable counting modes", async ({ page }) => {
  await openWorkbench(page, "/stats");
  const rows = page.locator(".stats-table-row");
  await expect(page.getByRole("button", { name: "Sort by DPM", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Sort by ODPM", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Sort by DDPM", exact: true })).toBeVisible();
  await expect(rows.first()).toContainText("Fixture Star");
  await expect(rows.first().locator("td[data-column='dpm']")).toContainText("+6.2");
  await expect(page.locator(".stats-results-meta")).toContainText("DARKO · through Apr 12, 2026");
  expect(new URL(page.url()).searchParams.get("darkoManifest")).toBe("b".repeat(64));
  await page.getByRole("button", { name: "Sort by DPM", exact: true }).click();
  await expect(rows.first()).toContainText("Fixture Guard");
  await page.getByRole("button", { name: "Reset table", exact: true }).click();
  await expect(rows.first()).toContainText("Fixture Star");
  await page.getByRole("button", { name: "Per 36", exact: true }).click();
  await expect(rows.first().locator("td[data-column='dpm']")).toContainText("+6.2");
});

test("short windows keep DARKO ratings unknown", async ({ page }) => {
  await openWorkbench(page, "/stats?window=last_10");
  const cells = page.locator(".stats-table-row td[data-column='dpm']");
  await expect(cells).toHaveCount(2);
  for (const cell of await cells.all()) await expect(cell).toContainText("—");
  await expect(page.locator(".stats-results-meta")).toContainText("DARKO · unavailable in this scope");
});

test("DARKO source links are blue, highlighted and clickable from the header hover", async ({ page }) => {
  await openWorkbench(page, "/stats");
  const footer = page.locator(".stats-results-meta .darko-source-link");
  await expect(footer).toHaveAttribute("href", "https://www.darko.app/about");
  await expect(footer).toHaveCSS("color", "rgb(103, 170, 249)");
  expect(await footer.evaluate(el => getComputedStyle(el).backgroundColor)).not.toBe("rgba(0, 0, 0, 0)");
  await page.getByRole("button", { name: "Sort by DPM", exact: true }).hover();
  const credit = page.getByRole("dialog", { name: "DPM definition and source", exact: true }).getByRole("link", { name: "DARKO · Kostya Medvedovsky" });
  await credit.hover();
  await expect(credit).toBeVisible();
  await expect(credit).toHaveCSS("color", "rgb(103, 170, 249)");
  await page.context().route("https://www.darko.app/**", route => route.fulfill({ body: "Source-link navigation fixture" }));
  const opened = page.waitForEvent("popup");
  await credit.click();
  const source = await opened;
  await source.waitForLoadState();
  expect(source.url()).toBe("https://www.darko.app/about");
  await source.close();
});
