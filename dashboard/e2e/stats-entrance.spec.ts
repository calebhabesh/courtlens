import { expect, test, type Page } from "@playwright/test";
import type { PersonalWorkspaceState } from "@/lib/types";

// Stats speed (2026-11-17): the server HTML is the table. Its rows show as soon as they paint, with
// no entrance that waits for hydration, the workspace read or a fade (alignment follow-up 72's
// single entrance is retired). Later changes still settle the body in place.

declare global {
  interface Window {
    statsBodyAnimations: string[];
  }
}

async function observeBody(page: Page, density = "standard") {
  await page.addInitScript(value => {
    localStorage.setItem("courtlens_table_density", value);
    window.statsBodyAnimations = [];
    document.addEventListener("animationstart", event => {
      if (event.target instanceof Element && event.target.matches(
        ".player-explorer-container tbody, .player-explorer-container tbody > tr:first-child"
      )) window.statsBodyAnimations.push(event.animationName);
    });
  }, density);
}

async function expectRowsShownWithoutEntrance(page: Page) {
  const body = page.locator(".player-explorer-container tbody").filter({ visible: true });
  await expect(body).toHaveCount(1);
  await expect(body).toHaveCSS("opacity", "1");
  await expect(body.locator('a[href^="/players/"]').first()).toBeVisible();
  expect(await page.evaluate(() => window.statsBodyAnimations)).toEqual([]);
  await expect(page).toHaveURL(/releaseId=/);
}

for (const density of ["standard", "compact"]) {
  test(`opening and refreshing Stats shows the rows without an entrance (${density} density)`, async ({ page }) => {
    await observeBody(page, density);
    await page.goto("/stats", { waitUntil: "networkidle" });
    await expectRowsShownWithoutEntrance(page);
    await page.reload({ waitUntil: "networkidle" });
    await expectRowsShownWithoutEntrance(page);
  });
}

test("streamed Stats rows are visible before any script runs", async ({ page }) => {
  await observeBody(page);
  let releaseScripts = () => {};
  const scriptsReady = new Promise<void>(resolve => { releaseScripts = resolve; });
  await page.route(/\/_next\/static\/.*\.js(?:\?|$)/, async route => {
    await scriptsReady;
    await route.continue();
  });
  try {
    await page.goto("/stats", { waitUntil: "commit" });
    const body = page.locator(".route-enter .player-explorer-container tbody");
    await expect(body).toHaveCount(1);
    // No loader and no Suspense reveal: the rows are in the document, opaque, with every script held.
    await expect(body).toHaveCSS("opacity", "1");
    await expect(body.locator('a[href^="/players/"]').first()).toBeVisible();
    await expect(page.locator('[role="status"][aria-busy="true"]')).toHaveCount(0);
    releaseScripts();
    await page.waitForLoadState("networkidle");
    await expectRowsShownWithoutEntrance(page);
  } finally {
    releaseScripts();
  }
});

test("a full load of Stats leaves Next's history entry in place, so Back returns to it", async ({ page }) => {
  await page.goto("/stats", { waitUntil: "networkidle" });
  await expect(page).toHaveURL(/releaseId=/);
  // ReplaceUrl writes the canonical scope after the router patches history: the entry keeps its
  // router state, and useSearchParams (which Back to table saves) sees the written scope.
  expect(await page.evaluate(() => (window.history.state as { __NA?: boolean } | null)?.__NA)).toBe(true);
  const statsUrl = page.url();
  await page.locator(".player-explorer-container tbody a[href^='/players/']").first().click();
  await page.waitForURL(url => url.pathname.startsWith("/players/"));
  await page.goBack();
  await page.waitForURL(url => url.pathname === "/stats");
  expect(page.url()).toBe(statsUrl);
  await expect(page.locator(".player-explorer-container tbody a[href^='/players/']").first()).toBeVisible();
});

test("Stats rows do not move with reduced motion", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await observeBody(page);
  await page.goto("/stats", { waitUntil: "networkidle" });
  await expectRowsShownWithoutEntrance(page);
  await expect(page.locator(".player-explorer-container tbody")).toHaveCSS("transform", "none");
});

test("a saved view that differs from the server's settles in place once it arrives", async ({ page }) => {
  await observeBody(page);
  let releaseWorkspace = () => {};
  const workspaceReady = new Promise<void>(resolve => { releaseWorkspace = resolve; });
  const workspace: PersonalWorkspaceState = {
    workspace_id: "default", name: "Default Workspace", version: 1,
    views: [], favorites: [], compare_tray: [], ranking_boards: [], tier_lists: [],
    preferences: {
      density: "standard", identity_mode: "photos", counting_mode: "per_game",
      default_view_id: "shooting", table_expanded: false, theme: "dark"
    },
    created_at: "2026-10-17T00:00:00Z", updated_at: "2026-10-17T00:00:00Z"
  };
  await page.route(url => url.pathname === "/api/workspace", async route => {
    await workspaceReady;
    await route.fulfill({ json: workspace });
  });
  try {
    await page.goto("/stats", { waitUntil: "domcontentloaded" });
    const body = page.locator(".route-enter .player-explorer-container tbody");
    // The server's rows show while the browser's workspace read is still out.
    await expect(body).toHaveCSS("opacity", "1");
    await expect(body.locator('a[href^="/players/"]').first()).toBeVisible();
    releaseWorkspace();
    await expect(page.getByRole("radio", { name: "Shooting", exact: true })).toHaveAttribute("aria-checked", "true");
    await expect.poll(() => page.evaluate(() => window.statsBodyAnimations)).toEqual(["settleA"]);
  } finally {
    releaseWorkspace();
  }
});
