import { expect, type Page } from "@playwright/test";

export async function waitForStreamedPage(page: Page) {
  // Shell hydration can finish before React reveals its staged server HTML. Hidden copies
  // also match text/label locators; require staging to settle before testing page controls.
  await expect(page.locator('body > div[hidden][id^="S:"]')).toHaveCount(0);
}

export async function openWorkbench(page: Page, path = "/") {
  // The workspace read starts from a client effect, after shell hydration.
  const initialized = page.waitForResponse(response => new URL(response.url()).pathname === "/api/workspace");
  await page.goto(path);
  if (path === "/") await page.waitForURL(url => url.pathname === "/stats");
  await initialized;
  // A late font swap can move a compact navigation target during a pointer click.
  await page.waitForFunction(() => document.fonts.status === "loaded");
  await waitForStreamedPage(page);
}
