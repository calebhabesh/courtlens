import { expect, test, type Page } from "@playwright/test";
import { openWorkbench } from "./workbench-navigation";

// Finish plan F04: invite-only sign-in, the shared demo account and favourite players per account.
// The mock API keeps accounts in memory (e2e/mock-api.mjs); each test starts from its seed.
const mockApi = process.env.COURTLENS_API_INTERNAL_URL || "http://localhost:4100";
const evidence = process.env.F04_EVIDENCE_DIR;
test.describe.configure({ mode: "serial" });

test.beforeEach(async ({ request }) => {
  expect((await request.post(`${mockApi}/api/__accounts/reset`)).ok()).toBe(true);
});

async function shot(page: Page, name: string) {
  if (!evidence) return;
  // Let entrance and exit animations settle, so the picture shows the resting state.
  await page.evaluate(() => Promise.all(document.getAnimations().map(animation => animation.finished.catch(() => undefined))));
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${evidence}/${name}.png` });
}

const header = (page: Page) => page.locator("header");
const dialog = (page: Page) => page.getByRole("dialog", { name: "Sign in" });

async function signInWithPassword(page: Page, password = "correct horse battery") {
  await header(page).getByRole("button", { name: "Sign in" }).click();
  await dialog(page).getByLabel("Email").fill("owner@example.com");
  await dialog(page).getByLabel("Password").fill(password);
  await dialog(page).getByRole("button", { name: "Sign in", exact: true }).click();
}

test("signed out, the site works and favourite controls invite a sign-in", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openWorkbench(page, "/stats");
  await expect(page.locator(".stats-table-row").first()).toBeVisible();
  await expect(header(page).getByRole("button", { name: "Sign in" })).toBeVisible();

  await header(page).getByRole("button", { name: "Favorite players" }).click();
  const panel = page.getByRole("dialog", { name: "Favorite players" });
  await expect(panel).toContainText("Keep a list of favourite players and filter Stats to them.");
  await shot(page, "f04-favorites-signed-out-1440");
  await page.keyboard.press("Escape");

  // The Stats Favorites filter has no list to apply: it opens sign-in and changes nothing.
  await page.getByRole("button", { name: "Favorites only", exact: true }).click();
  await expect(dialog(page)).toBeVisible();
  await expect(dialog(page)).toContainText("Sign in, or use the demo account, to filter Stats to your favourite players.");
  await expect(page).not.toHaveURL(/favorites=1/);
  await shot(page, "f04-sign-in-dialog-1440");
  await page.keyboard.press("Escape");
  await expect(dialog(page)).toHaveCount(0);

  // A shared link with the filter on never silently shows every player.
  await openWorkbench(page, "/stats?favorites=1");
  await expect(page.getByText("Favourites belong to an account.")).toBeVisible();
  await expect(page.locator(".stats-table-row")).toHaveCount(0);
});

test("the demo account is one click, shows the shared list and keeps the session out of reach of scripts", async ({ page, context }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openWorkbench(page, "/stats");
  await header(page).getByRole("button", { name: "Sign in" }).click();
  await dialog(page).getByRole("button", { name: "Use the demo account" }).click();
  await expect(dialog(page)).toHaveCount(0);
  await expect(header(page).getByRole("button", { name: "Demo account" })).toBeVisible();

  const cookie = (await context.cookies()).find(entry => entry.name === "courtlens-session");
  expect(cookie).toMatchObject({ httpOnly: true, secure: true, sameSite: "Lax", path: "/" });
  expect(await page.evaluate(() => document.cookie)).not.toContain("courtlens-session");

  // The latest season's photo, with that team (the mock may not serve the image itself).
  const portrait = page.waitForRequest(request => /\/api\/workbench\/players\/23\/portrait\?/.test(request.url()));
  await header(page).getByRole("button", { name: "Favorite players (1)" }).click();
  expect((await portrait).url()).toMatch(/season=2025-26&team=TOR/);
  const panel = page.getByRole("dialog", { name: "Favorite players" });
  await expect(panel).toContainText("Demo account: one list shared by every visitor, reset each night.");
  const row = panel.getByRole("link", { name: /Fixture Star/ });
  await expect(row).toHaveAttribute("href", "/players/23");
  await expect(row).toContainText("TOR");
  await expect(row).toContainText("2025-26");
  await expect(row.locator(".team-logo")).toHaveCount(1);
  await shot(page, "f04-favorites-demo-1440");
});

test("an invited account signs in, saves favourites from Stats and filters to them, then signs out", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openWorkbench(page, "/stats");
  await signInWithPassword(page, "not the password");
  await expect(dialog(page).getByRole("alert")).toHaveText("That email and password don't match an account.");
  await dialog(page).getByLabel("Password").fill("correct horse battery");
  await dialog(page).getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(header(page).getByRole("button", { name: "Owner" })).toBeVisible();

  // Add Fixture Guard from the Stats detail drawer.
  await page.locator(".stats-table-row").filter({ hasText: "Fixture Guard" }).locator(".pinned-col-name").click();
  const add = page.getByRole("button", { name: "Add to Favorites" });
  await expect(add).toBeVisible();
  await add.click();
  await expect(page.getByRole("button", { name: "Remove from Favorites" })).toBeVisible();
  await page.keyboard.press("Escape");

  await page.getByRole("button", { name: "Favorites only (1)" }).click();
  await expect(page).toHaveURL(/favorites=1/);
  await expect(page.locator(".stats-table-row")).toHaveCount(1);
  await expect(page.locator(".stats-table-row").first()).toContainText("Fixture Guard");
  await shot(page, "f04-stats-favorites-1440");

  await header(page).getByRole("button", { name: "Favorite players (1)" }).click();
  await expect(page.getByRole("dialog", { name: "Favorite players" }).getByRole("link", { name: /Fixture Guard/ })).toBeVisible();
  await page.keyboard.press("Escape");

  await header(page).getByRole("button", { name: "Owner" }).click();
  await expect(page.getByRole("menu")).toContainText("owner@example.com");
  await page.getByRole("menuitem", { name: "Sign out" }).click();
  await expect(header(page).getByRole("button", { name: "Sign in" })).toBeVisible();
  await expect(page.getByText("Favourites belong to an account.")).toBeVisible();
});

test("favourites persist across a reload and belong to the account", async ({ page, browser }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openWorkbench(page, "/stats");
  await signInWithPassword(page);
  await expect(header(page).getByRole("button", { name: "Owner" })).toBeVisible();
  await page.locator(".stats-table-row").filter({ hasText: "Fixture Star" }).locator(".pinned-col-name").click();
  await page.getByRole("button", { name: "Add to Favorites" }).click();
  await expect(page.getByRole("button", { name: "Remove from Favorites" })).toBeVisible();
  await page.reload();
  await expect(header(page).getByRole("button", { name: "Favorite players (1)" })).toBeVisible();

  // Another browser on the demo account sees the demo's list, not the owner's.
  const other = await browser.newContext({ baseURL: test.info().project.use.baseURL });
  const visitor = await other.newPage();
  await visitor.setViewportSize({ width: 1440, height: 900 });
  await openWorkbench(visitor, "/stats");
  await header(visitor).getByRole("button", { name: "Sign in" }).click();
  await dialog(visitor).getByRole("button", { name: "Use the demo account" }).click();
  await header(visitor).getByRole("button", { name: "Favorite players (1)" }).click();
  const panel = visitor.getByRole("dialog", { name: "Favorite players" });
  await expect(panel.getByRole("link", { name: /Fixture Star/ })).toBeVisible();
  await expect(panel.getByRole("link", { name: /Fixture Guard/ })).toHaveCount(0);
  await other.close();
});

test("a player page saves the player to the account's favourites", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openWorkbench(page, "/players/24");
  const star = page.locator(".workbench-content, main").getByRole("button", { name: "Add to favorites" }).first();
  await star.click();
  await expect(dialog(page)).toContainText("Sign in, or use the demo account, to save favourite players.");
  await dialog(page).getByRole("button", { name: "Use the demo account" }).click();
  await expect(header(page).getByRole("button", { name: "Demo account" })).toBeVisible();
  await page.locator("main").getByRole("button", { name: "Add to favorites" }).first().click();
  await expect(page.locator("main").getByRole("button", { name: "Remove from favorites" }).first()).toBeVisible();
  await expect(header(page).getByRole("button", { name: "Favorite players (2)" })).toBeVisible();
  await shot(page, "f04-player-page-favorite-1440");
});

test("too many failed sign-ins are refused with the wait in words", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openWorkbench(page, "/stats");
  await header(page).getByRole("button", { name: "Sign in" }).click();
  await dialog(page).getByLabel("Email").fill("owner@example.com");
  for (let attempt = 0; attempt < 5; attempt += 1) {
    await dialog(page).getByLabel("Password").fill(`guess ${attempt}`);
    await dialog(page).getByRole("button", { name: "Sign in", exact: true }).click();
    await expect(dialog(page).getByRole("alert")).toHaveText("That email and password don't match an account.");
  }
  await dialog(page).getByLabel("Password").fill("correct horse battery");
  await dialog(page).getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(dialog(page).getByRole("alert")).toHaveText("Too many attempts. Try again in 9 minutes.");
});

test("on a phone, favourites and the account are in the drawer", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openWorkbench(page, "/stats");
  await expect(header(page).getByRole("button", { name: "Sign in" })).toBeHidden();
  await expect(header(page).getByRole("button", { name: "Favorite players" })).toBeHidden();
  await page.getByRole("button", { name: "Toggle navigation drawer" }).click();
  const drawer = page.getByRole("dialog").filter({ has: page.getByRole("navigation", { name: "Drawer navigation" }) });
  await expect(drawer.getByRole("region", { name: "Favorite players" })).toContainText("Keep a list of favourite players");
  await drawer.getByRole("button", { name: "Use the demo account" }).click();
  await page.getByRole("button", { name: "Toggle navigation drawer" }).click();
  await expect(drawer.getByRole("link", { name: /Fixture Star/ })).toBeVisible();
  await expect(drawer).toContainText("Demo account");
  await shot(page, "f04-drawer-demo-390");
  // No horizontal page scroll at phone width.
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await drawer.getByRole("link", { name: /Fixture Star/ }).click();
  await expect(page).toHaveURL(/\/players\/23/);
});

test("the sign-in dialog fits a phone", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openWorkbench(page, "/stats");
  await page.getByRole("button", { name: "Favorites only", exact: true }).click();
  await expect(dialog(page)).toBeVisible();
  const box = await dialog(page).boundingBox();
  expect(box!.x).toBeGreaterThanOrEqual(0);
  expect(box!.x + box!.width).toBeLessThanOrEqual(390);
  await shot(page, "f04-sign-in-dialog-390");
});
