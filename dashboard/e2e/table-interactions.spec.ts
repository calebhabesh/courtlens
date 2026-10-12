import { expect, test } from "@playwright/test";
import { openWorkbench } from "./workbench-navigation";

async function personalFixture(page: import("@playwright/test").Page, compareTray: string[] = []) {
  const state = { workspace_id: "default", name: "Table fixture", version: 1, views: [
    { id: "reordered", name: "Reordered groups", columns: ["pts", "fg_pct", "pts_per_36", "fga"], unavailable_columns: [] }
  ], favorites: [] as string[], compare_tray: compareTray, ranking_boards: [], tier_lists: [],
    preferences: { density: "standard", identity_mode: "photos", counting_mode: "per_game", default_view_id: "overview", table_expanded: false, theme: "dark" },
    created_at: "2026-10-05", updated_at: "2026-10-05" };
  let comparisonAdds = 0;
  await page.route("**/api/workspace**", async route => {
    const path = new URL(route.request().url()).pathname;
    if (route.request().method() !== "GET") {
      if (path.includes("compare-tray/")) {
        const id = path.split("/").at(-1)!;
        if (route.request().method() === "POST") { comparisonAdds++; state.compare_tray.push(id); }
        else state.compare_tray = state.compare_tray.filter(value => value !== id);
      }
      if (path.endsWith("preferences")) Object.assign(state.preferences, route.request().postDataJSON());
      state.version++;
    }
    await route.fulfill({ json: state });
  });
  return { adds: () => comparisonAdds };
}

test("recurring guide modes preserve primary identity, header alignment and reload", async ({ page }) => {
  await personalFixture(page); await openWorkbench(page, "/stats"); await page.waitForLoadState("networkidle");
  const row = page.locator(".dense-stats-table tbody tr").first();
  const guides = page.getByRole("group", { name: "Group guides", exact: true });
  for (const mode of ["Photos", "Logos", "Initials", "None"]) {
    await guides.getByRole("button", { name: mode, exact: true }).click();
    await page.waitForURL(url => url.searchParams.get("identityMode") === mode.toLowerCase());
    await expect(row.locator(".stats-guide-cell")).toHaveCount(mode === "None" ? 0 : 3);
    await expect(row.locator(".stats-primary-portrait")).toHaveCount(1);
    await expect(row.getByRole("link", { name: "Fixture Star", exact: true })).toBeVisible();
    expect(await row.locator(".stats-guide-cell [tabindex]").count()).toBe(0);
    if (mode === "Initials") {
      const offsets = await row.locator(".stats-guide-initials").evaluateAll(circles => circles.map(circle => {
        const range = document.createRange();
        range.selectNodeContents(circle);
        const text = range.getBoundingClientRect();
        const box = circle.getBoundingClientRect();
        return { x: text.x + text.width / 2 - box.x - box.width / 2,
          y: text.y + text.height / 2 - box.y - box.height / 2 };
      }));
      offsets.forEach(offset => {
        expect(Math.abs(offset.x)).toBeLessThan(1);
        expect(Math.abs(offset.y)).toBeLessThan(2);
      });
    }
    const alignment = await page.locator(".dense-stats-table").evaluate(table => {
      const t = table as HTMLTableElement;
      return { headers: [...t.tHead!.rows].map(r => [...r.cells].reduce((n, c) => n + c.colSpan, 0)), body: t.tBodies[0].rows[0].cells.length };
    });
    expect(alignment.headers).toEqual([alignment.body, alignment.body]);
  }
  await page.reload(); await page.waitForLoadState("networkidle");
  await expect(row.locator(".stats-guide-cell")).toHaveCount(0);
});

test("keyboard sorting, single compare shortcut and drawer focus stay scoped", async ({ page }) => {
  const fixture = await personalFixture(page); await openWorkbench(page, "/stats"); await page.waitForLoadState("networkidle");
  const sort = page.getByRole("button", { name: "Sort by PPG", exact: true });
  await sort.focus(); await sort.press("Space"); await page.waitForURL(/sortDirection=asc/);
  await expect(sort.locator("..")).toHaveAttribute("aria-sort", "ascending");
  const row = page.locator(".dense-stats-table tbody tr[data-player-id='23']");
  await row.focus(); await page.keyboard.press("c");
  await expect(row.getByRole("button", { name: "Remove Fixture Star from comparison", exact: true })).toHaveAttribute("aria-pressed", "true");
  expect(fixture.adds()).toBe(1);
  await page.getByRole("combobox", { name: "Filter players by name", exact: true }).fill("c"); await page.getByRole("combobox", { name: "Filter players by name", exact: true }).press("c");
  await page.locator("h1").click(); await page.keyboard.press("c"); expect(fixture.adds()).toBe(1);
  const detail = row.getByRole("button", { name: "Open details for Fixture Star" }); await detail.click();
  const dialog = page.getByRole("dialog", { name: "Fixture Star", exact: true }); await expect(dialog).toBeVisible();
  await page.keyboard.press("Shift+Tab"); expect(await dialog.evaluate(el => el.contains(document.activeElement))).toBe(true);
  await page.keyboard.press("Escape"); await expect(dialog).toHaveCount(0); await expect(detail).toBeFocused();
});

test("custom selected columns deduplicate normalization and preserve recurring group order", async ({ page }) => {
  await personalFixture(page); await openWorkbench(page, "/stats?viewId=reordered&identityMode=logos"); await page.waitForLoadState("networkidle");
  // PTS and PTS/36 become the same displayed per-game metric; keep one effective column.
  await expect(page.locator(".stats-group-th")).toHaveText(["Scoring", "Shooting"]);
  await expect(page.locator(".dense-stats-table tbody tr").first().locator(".stats-guide-cell")).toHaveCount(1);
  await page.getByRole("button", { name: "Totals", exact: true }).click(); await page.waitForURL(/countingMode=raw/);
  await expect(page.getByRole("button", { name: "Sort by PTS", exact: true })).toHaveCount(1);
});

test("selection failure remains actionable and does not change the selected row", async ({ page }) => {
  await personalFixture(page);
  await page.route("**/api/workspace/compare-tray/**", route => route.fulfill({ status: 503, json: { detail: "Selection service unavailable. Try again." } }));
  await openWorkbench(page, "/stats"); await page.waitForLoadState("networkidle");
  const row = page.locator(".dense-stats-table tbody tr").first();
  const toggle = row.locator(".stats-compare-toggle");
  await toggle.click();
  await expect(page.locator(".stats-action-error[role=alert]")).toContainText("Selection service unavailable. Try again.");
  await expect(toggle).toHaveAttribute("aria-pressed", "false");
  await page.getByRole("button", { name: "Dismiss", exact: true }).click();
  await expect(page.locator(".stats-action-error")).toHaveCount(0);
});

test("playoff player table shares native keyboard sorting", async ({ page }) => {
  await personalFixture(page); await openWorkbench(page, "/playoffs/fixture-series"); await page.waitForLoadState("networkidle");
  const sort = page.getByRole("button", { name: "Sort by PPG", exact: true });
  await expect(sort.locator("..")).toHaveAttribute("aria-sort", "descending");
  await sort.focus(); await sort.press("Space");
  await expect(sort.locator("..")).toHaveAttribute("aria-sort", "ascending");
  await sort.press("Enter"); await expect(sort.locator("..")).toHaveAttribute("aria-sort", "descending");
});

test("a larger tray names the two-player comparison action accurately", async ({ page }) => {
  await personalFixture(page, ["23", "24", "1630567"]); await openWorkbench(page, "/stats"); await page.waitForLoadState("networkidle");
  const action = page.getByRole("link", { name: "Compare first 2", exact: true });
  await expect(action).toBeVisible();
  const target = new URL((await action.getAttribute("href"))!, "http://localhost");
  expect(target.searchParams.get("playerA")).toBe("23"); expect(target.searchParams.get("playerB")).toBe("24");
  await expect(page.locator(".compare-tray-chip-name").last()).toHaveText("Scottie Barnes");
});
