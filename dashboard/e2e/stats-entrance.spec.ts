import { expect, test, type Page } from "@playwright/test";
import type { PersonalWorkspaceState } from "@/lib/types";

declare global {
  interface Window {
    statsEntranceStarts: string[];
  }
}

async function observeEntrance(page: Page, density = "standard") {
  await page.addInitScript(value => {
    localStorage.setItem("courtlens_table_density", value);
    window.statsEntranceStarts = [];
    document.addEventListener("animationstart", event => {
      if (event.target instanceof Element && event.target.matches(
        ".player-explorer-container tbody, .player-explorer-container tbody > tr:first-child"
      )) window.statsEntranceStarts.push(event.animationName);
    });
  }, density);
}

async function expectOneCompletedEntrance(page: Page) {
  const body = page.locator(".player-explorer-container tbody").filter({ visible: true });
  await expect(body).toHaveCount(1);
  await expect.poll(() => page.evaluate(() => window.statsEntranceStarts)).toEqual(["enterFade"]);
  // Retire the entrance after completion, so a later reveal cannot restart its keyframes.
  await expect.poll(() => body.evaluate(element => getComputedStyle(element).animationName)).toBe("none");
  await expect(body).toHaveCSS("opacity", "1");
  await expect(body.locator("tr").first()).toHaveCSS("animation-name", "none");
  await expect(page).toHaveURL(/releaseId=/);
}

for (const density of ["standard", "compact"]) {
  test(`opening and refreshing Stats enters once with ${density} density`, async ({ page }) => {
    await observeEntrance(page, density);
    await page.goto("/stats", { waitUntil: "networkidle" });
    await expectOneCompletedEntrance(page);
    await page.reload({ waitUntil: "networkidle" });
    await expectOneCompletedEntrance(page);
  });
}

test("streamed Stats waits for hydration before entering", async ({ page }) => {
  await observeEntrance(page);
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
    // Let the old server-side stagger finish while all hydration scripts remain blocked.
    await page.waitForTimeout(450);
    expect(await page.evaluate(() => window.statsEntranceStarts)).toEqual([]);
    await expect(body).toHaveCSS("opacity", "0");
    releaseScripts();
    await page.waitForLoadState("networkidle");
    await expectOneCompletedEntrance(page);
  } finally {
    releaseScripts();
  }
});

test("Stats keeps a single opacity entrance with reduced motion", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await observeEntrance(page);
  await page.goto("/stats", { waitUntil: "networkidle" });
  await expectOneCompletedEntrance(page);
  await expect(page.locator(".player-explorer-container tbody")).toHaveCSS("transform", "none");
});

test("restoring a saved view joins the initial entrance", async ({ page }) => {
  await observeEntrance(page);
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
    await expect(body).toHaveCount(1);
    await page.waitForTimeout(450);
    expect(await page.evaluate(() => window.statsEntranceStarts)).toEqual([]);
    releaseWorkspace();
    await page.waitForLoadState("networkidle");
    await expectOneCompletedEntrance(page);
    await expect(page.getByRole("radio", { name: "Shooting", exact: true })).toHaveAttribute("aria-checked", "true");
  } finally {
    releaseWorkspace();
  }
});
