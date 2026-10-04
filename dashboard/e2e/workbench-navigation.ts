import type { Page } from "@playwright/test";

export async function openWorkbench(page: Page, path = "/") {
  // The workspace read starts from a client effect, after shell hydration.
  const initialized = page.waitForResponse(response => new URL(response.url()).pathname === "/api/workspace");
  await page.goto(path);
  if (path === "/") await page.waitForURL(url => url.pathname === "/stats");
  await initialized;
  // A late font swap can move a compact navigation target during a pointer click.
  await page.waitForFunction(() => document.fonts.status === "loaded");
}
