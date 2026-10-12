import { expect, test, type Page } from "@playwright/test";
import { openWorkbench } from "./workbench-navigation";

function initialWorkspace() {
  return { workspace_id: "default", name: "Example test workspace", version: 1, views: [], favorites: [], compare_tray: [], ranking_boards: [] as Record<string, unknown>[], tier_lists: [] as Record<string, unknown>[], preferences: { density: "standard", identity_mode: "photos", counting_mode: "per_game", default_view_id: "overview", table_expanded: false, theme: "dark" }, created_at: "", updated_at: "" };
}
async function workspace(page: Page, initial = initialWorkspace(), failCopy = false) {
  const writes: Record<string, unknown>[] = [];
  await page.route("**/api/workspace**", async route => {
    if (route.request().method() !== "GET") {
      const body = route.request().postDataJSON();
      writes.push(body);
      if (failCopy) return route.fulfill({ status: 503, json: { detail: "Copy unavailable; try again." } });
      initial.version++;
      const key = route.request().url().includes("tier-lists") ? "tier_lists" : "ranking_boards";
      const id = route.request().method() === "POST" ? `copy-${initial.version}` : route.request().url().split("/").at(-1);
      const index = initial[key].findIndex(board => board.id === id);
      if (index < 0) initial[key].push({ id, ...body }); else initial[key][index] = { ...initial[key][index], ...body };
    }
    await route.fulfill({ json: initial });
  });
  return { writes, state: initial };
}

for (const width of [1440, 768, 390, 375]) for (const route of ["rankings", "tierlist"]) {
  test(`${route} example first load at ${width}px pins real scope without creating personal state`, async ({ page }) => {
    await page.setViewportSize({ width, height: width >= 768 ? 900 : 844 });
    const { writes } = await workspace(page);
    await openWorkbench(page, `/${route}`);
    await expect(page.getByRole("region", { name: "Season minutes example board", exact: true })).toBeVisible();
    await expect(page).toHaveURL(/releaseId=fixture-release.*season=2025-26.*beforeDate=/);
    await expect(page.getByRole("button", { name: "Copy to my boards" })).toBeEnabled();
    await expect(page.getByText("Fixture Star", { exact: true }).first()).toBeVisible();
    await expect(page.getByRole("button", { name: /Delete (Board|List)/ })).toHaveCount(0);
    expect(writes).toHaveLength(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBe(0);
    if (width >= 1280) expect((await page.locator(".pc12-example-board").boundingBox())!.y).toBeLessThan(400);
    if (width < 768) {
      expect((await page.getByRole("button", { name: "Copy to my boards" }).boundingBox())!.height).toBeGreaterThanOrEqual(40);
      await page.getByRole("button", { name: "Data details", exact: true }).click();
      await expect(page.getByRole("dialog")).toContainText("canonical player ID");
    }
  });
}

for (const kind of ["rankings", "tierlist"] as const) {
  test(`${kind} explicit copy preserves existing records and can be edited and reopened`, async ({ page }) => {
    const initial = initialWorkspace();
    if (kind === "rankings") initial.ranking_boards.push({ id: "existing", title: "Keep this ranking", board_type: "custom", notes: "Original note", entries: [{ rank: 1, player_id: "23", player_name: "Fixture Star", notes: "Keep", tags: [] }] });
    else initial.tier_lists.push({ id: "existing", title: "Keep these tiers", tiers: [{ tier_id: "keep", label: "Keep", color: "var(--color-category-6)", player_ids: ["23"] }] });
    const original = JSON.stringify(kind === "rankings" ? initial.ranking_boards[0] : initial.tier_lists[0]);
    const { writes, state } = await workspace(page, initial);
    await openWorkbench(page, `/${kind}`);
    await page.getByRole("button", { name: "View minutes example" }).click();
    await page.getByRole("button", { name: "Copy to my boards" }).click();
    if (kind === "rankings") {
      await expect(page.getByRole("table", { name: /Rankings for .*Minutes Leaders/ })).toBeVisible();
      expect(writes[0]).toMatchObject({ scope: { release_id: "fixture-release", season: "2025-26", phase: "regular_season" }, entries: [{ rank: 1, player_id: "23", player_name: "Fixture Star", notes: null, tags: [] }, { rank: 2, player_id: "24", player_name: "Fixture Guard", notes: null, tags: [] }] });
      await page.getByRole("button", { name: "Move Fixture Guard up", exact: true }).focus();
      await page.keyboard.press("Enter");
      await expect(page.locator(".rankings-table tbody tr").first()).toContainText("Fixture Guard");
    } else {
      await expect(page.getByRole("heading", { name: /Minutes Groups/ })).toBeVisible();
      expect(writes[0]).toMatchObject({ tiers: [{ tier_id: "minutes-1", player_ids: ["23", "24"], color: "var(--color-category-1)" }, { tier_id: "minutes-2", player_ids: [] }, { tier_id: "minutes-3", player_ids: [] }] });
      await page.getByRole("combobox", { name: "Move Fixture Star to tier", exact: true }).selectOption("minutes-2");
      await expect(page.locator(".tier-row-card").nth(1)).toContainText("Fixture Star");
      await page.setViewportSize({ width: 390, height: 844 });
      expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBe(0);
    }
    expect(JSON.stringify(kind === "rankings" ? state.ranking_boards[0] : state.tier_lists[0])).toBe(original);
    await page.reload();
    await page.getByRole("tab", { name: /Minutes (Leaders|Groups)/ }).click();
    if (kind === "rankings") await expect(page.locator(".rankings-table tbody tr").first()).toContainText("Fixture Guard");
    else await expect(page.locator(".tier-row-card").nth(1)).toContainText("Fixture Star");
  });
  test(`${kind} failed copy keeps the example and useful retry`, async ({ page }) => {
    const { writes } = await workspace(page, initialWorkspace(), true);
    await openWorkbench(page, `/${kind}`);
    await page.getByRole("button", { name: "Copy to my boards" }).click();
    await expect(page.getByRole("alert")).toContainText("Copy unavailable");
    await expect(page.getByRole("button", { name: "Copy to my boards" })).toBeEnabled();
    await expect(page.getByRole("region", { name: "Season minutes example board", exact: true })).toBeVisible();
    expect(writes).toHaveLength(1);
  });
}
