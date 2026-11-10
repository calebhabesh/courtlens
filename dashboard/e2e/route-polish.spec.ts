import { test, expect } from "@playwright/test";
import { openWorkbench } from "./workbench-navigation";

test("release availability agrees across desktop and mobile and never carries this page's scope", async ({ page }) => {
  await openWorkbench(page, "/stats?season=2025-26&phase=regular_season&beforeDate=2026-06-30");
  await page.getByRole("button", { name: "More options", exact: true }).click();
  await page.getByRole("menuitem", { name: /Availability/, exact: false }).click();
  const menu = page.locator(".availability-menu");
  await expect(menu.getByRole("menuitem", { name: /WOWY/ })).toBeVisible();
  const links = await menu.locator("a").evaluateAll(items => items.map(item => item.getAttribute("href")));
  await page.keyboard.press("Escape");
  await page.setViewportSize({ width: 375, height: 812 });
  await page.getByRole("button", { name: "Toggle navigation drawer" }).click();
  const section = page.locator(".replica-mobile-section").filter({ has: page.getByText("Availability", { exact: true }) });
  expect(await section.locator("a").evaluateAll(items => items.map(item => item.getAttribute("href")))).toEqual(links);
  await expect(page.locator(".replica-mobile-drawer").getByRole("link", { name: "Shot Quality", exact: true })).toBeVisible();
  // Every page keeps its own season (owner, 2026-10-15): navigation carries no scope parameters.
  expect(links.every(href => !/[?&](season|phase|beforeDate)=/.test(href ?? ""))).toBe(true);
});

test("settings distinguishes configured key from provider health and hides operator details", async ({ page }) => {
  await openWorkbench(page, "/settings");
  await expect(page.getByRole("heading", { name: "Settings", exact: true })).toBeVisible();
  await expect(page.getByText("An idle job queue does not establish worker liveness.", { exact: false }).filter({ visible: true })).toBeVisible();
  const card = page.getByRole("region", { name: "Assistant configuration", exact: true });
  await expect(card).toContainText("Configuration alone does not establish provider availability or answer accuracy");
  await expect(card).toContainText("Limits per turn");
  const details = card.locator("details").filter({ has: page.getByText("Configuration Details", { exact: true }) });
  // Wait for React's hidden streamed copy to be revealed or discarded before strict lookup.
  await expect(details).toHaveCount(1);
  await expect(details).not.toHaveAttribute("open", "");
  await details.locator("summary").click();
  await expect(details).toContainText("synthetic-ag05");
});

test("partial source keeps tools primary; service failure remains a distinct availability state", async ({ page }) => {
  await page.route("**/api/workbench/catalog*", async route => {
    const response = await route.fetch();
    const catalog = await response.json();
    catalog.capabilities = { core_stats: { status: "partial", seasons: ["2025-26"], phases: ["regular_season"], limitations: ["Partial fixture coverage"] } };
    await route.fulfill({ json: catalog });
  });
  await openWorkbench(page, "/calculator?season=2025-26&phase=regular_season");
  await page.getByRole("button", { name: "Players", exact: true }).click();
  await expect(page.getByRole("menuitem", { name: /^Last X Games/ })).toBeVisible();
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "More options", exact: true }).click();
  await page.getByRole("menuitem", { name: /Availability/, exact: false }).click();
  await expect(page.getByRole("menuitem", { name: /WOWY/ })).toContainText("not declared");
  await page.unroute("**/api/workbench/catalog*");
  await page.route("**/api/workbench/catalog*", route => route.fulfill({ status: 503, json: { detail: "Temporary backend failure" } }));
  // Reload starts a new bounded client catalog cache.
  await page.reload(); await page.waitForLoadState("networkidle");
  await page.getByRole("button", { name: "More options", exact: true }).click();
  await page.getByRole("menuitem", { name: /Availability/, exact: false }).click();
  await expect(page.getByRole("menuitem", { name: /Last X Games/ })).toContainText("could not be verified");
  await expect(page.getByRole("region", { name: "Result" })).toBeVisible();
});
