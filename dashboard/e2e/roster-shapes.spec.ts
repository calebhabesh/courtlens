import { test, expect, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { openWorkbench } from "./workbench-navigation";

// FO05 Roster Shapes prototype (D17/D18): logo-grid picker, depth chart, drag and menu moves,
// Observed/Projected, the 240-minute gauge and the byte-compatible JSON export.
const BOS = "1610612738";
const detail = {
  team: { id: BOS, tricode: "BOS", name: "Boston Celtics" },
  context: { release_id: "fixture-release", season: "2025-26", phase: "regular_season", before_date: "2026-04-13" },
  record: { games_played: 82, wins: 56, losses: 26, win_pct: 0.683 },
  production: {}, allowance: {}, recent_games: [],
  player_cohort: [
    { player_id: "11", player_name: "Fixture Guard", games_played: 80, total_minutes: 2400, points: 1600, points_per_game: 20 },
    { player_id: "12", player_name: "Fixture Wing", games_played: 70, total_minutes: 1400, points: 700, points_per_game: 10 },
    { player_id: "13", player_name: "Fixture Big", games_played: 60, total_minutes: 1200, points: 480, points_per_game: 8 }
  ],
  warnings: ["Fixture scope only"]
};

async function mockTeam(page: Page) {
  await page.route(`**/api/workbench/teams/${BOS}?*`, (route) => route.fulfill({ json: detail }));
}

test.describe("FO05 Roster Shapes", () => {
  test("picks a team from the logo grid and loads without a form", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await mockTeam(page);
    await openWorkbench(page, "/roster-shapes?season=2025-26&phase=regular_season");
    await expect(page.getByRole("heading", { level: 1, name: "Roster Shapes" })).toBeVisible();
    const grid = page.getByRole("list", { name: "Teams" });
    await expect(grid.getByRole("button")).toHaveCount(30);
    await page.getByRole("searchbox", { name: "Filter teams" }).fill("bos");
    await expect(grid.getByRole("button")).toHaveCount(1);
    expect(await page.getByRole("button", { name: /^Load/ }).count()).toBe(0);
    expect(await page.getByLabel(/Release ID/).count()).toBe(0);

    await grid.getByRole("button", { name: "Boston Celtics" }).click();
    await expect(page).toHaveURL(new RegExp(`team=${BOS}`));
    const chart = page.getByRole("region", { name: "Roster allocations" });
    await expect(page.locator(".roster-team")).toContainText("56–26 · 3 players");
    await expect(chart.getByRole("region", { name: "Unassigned lane" }).locator(".roster-chip")).toHaveCount(3);
    for (const lane of ["PG", "SG", "SF", "PF", "C"]) await expect(chart.getByRole("region", { name: `${lane} lane` })).toContainText("Drop players here");
    // Required caveats stay rendered behind Why? (D14); no code-like rules in the main flow.
    await expect(page.locator(".ui-why-body")).toContainText("Missing participation is not a confirmed zero or roster exclusion.");
    await expect(page.locator("main")).not.toContainText("game_date");
    // The board starts on the first screen (glance item 3).
    expect((await chart.boundingBox())!.y).toBeLessThanOrEqual(400);
  });

  test("moves players by drag and by keyboard menu, with lane shares", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await mockTeam(page);
    await openWorkbench(page, `/roster-shapes?team=${BOS}`);
    const chart = page.getByRole("region", { name: "Roster allocations" });
    const lane = (name: string) => chart.getByRole("region", { name: `${name} lane` });
    await expect(lane("Unassigned").locator(".roster-chip")).toHaveCount(3);

    await lane("Unassigned").locator(".roster-chip", { hasText: "Fixture Guard" }).dragTo(lane("PG"));
    await expect(lane("PG")).toContainText("Fixture Guard");
    await expect(lane("PG")).toContainText("2,400 min · 48.0%");
    await expect(lane("PG").getByRole("meter", { name: "PG minute share" })).toHaveAttribute("aria-valuenow", "48");

    const move = page.getByRole("button", { name: "Move Fixture Big" });
    await move.focus();
    await page.keyboard.press("Enter");
    const target = page.getByRole("menuitem", { name: /^Move to C/ });
    await target.focus();
    await page.keyboard.press("Enter");
    await expect(lane("C")).toContainText("Fixture Big");
    await expect(move).toBeFocused();
    await expect(lane("Unassigned").locator(".roster-chip")).toHaveCount(1);
  });

  test("projected minutes drive the 240 gauge and the export stays v1", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await mockTeam(page);
    await openWorkbench(page, `/roster-shapes?team=${BOS}`);
    await page.getByRole("button", { name: "Move Fixture Guard" }).click();
    await page.getByRole("menuitem", { name: /^Move to PG/ }).click();
    await page.getByRole("radio", { name: "Projected" }).click();
    const gauge = page.locator(".roster-gauge");
    const meter = page.getByRole("meter", { name: "Projected team minutes per game" });
    await page.getByLabel("Projected minutes for Fixture Guard").fill("120");
    await page.getByLabel("Projected minutes for Fixture Wing").fill("100");
    await expect(gauge).toHaveClass(/is-under/);
    await expect(gauge).toContainText("20.0 under · 1 blank");
    await page.getByLabel("Projected minutes for Fixture Big").fill("30");
    await expect(gauge).toHaveClass(/is-over/);
    await page.getByLabel("Projected minutes for Fixture Big").fill("20");
    await expect(gauge).toHaveClass(/is-full/);
    await expect(meter).toHaveAttribute("aria-valuenow", "240");

    await page.getByLabel("Projected minutes for Fixture Big").fill("-1");
    await expect(page.getByRole("alert").filter({ hasText: "Minutes must be finite" })).toContainText("Export is unavailable until corrected.");
    await expect(page.getByRole("button", { name: "Export JSON" })).toBeDisabled();
    await page.getByLabel("Projected minutes for Fixture Big").fill("");

    const download = page.waitForEvent("download");
    await page.getByRole("button", { name: "Export JSON" }).click();
    const file = await download;
    expect(file.suggestedFilename()).toBe("courtlens-roster-allocation.json");
    const text = await readFile((await file.path())!, "utf8");
    const payload = JSON.parse(text);
    expect(Object.keys(payload)).toEqual(["version", "context", "team", "source", "basis", "position_source", "units", "allocations", "warnings"]);
    expect(payload).toMatchObject({ version: "roster-minute-allocation-v1", basis: "projected", position_source: "user_assigned", units: "projected_minutes_per_game", warnings: ["Fixture scope only"] });
    expect(payload.allocations.map((row: { player_id: string; allocation_position: string; allocation_minutes: number | null }) =>
      [row.player_id, row.allocation_position, row.allocation_minutes])).toEqual([["11", "PG", 120], ["12", "Unassigned", 100], ["13", "Unassigned", null]]);
    expect(text).toBe(JSON.stringify(payload, null, 2));
  });

  test("phone layout stacks the board with 40px targets and no sideways scroll", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await mockTeam(page);
    await openWorkbench(page, `/roster-shapes?team=${BOS}`);
    await expect(page.getByRole("region", { name: "Roster allocations" })).toBeVisible();
    await expect(page.getByRole("button", { name: /^Filters/ })).toBeVisible();
    // Gate 2 (Design Language v1.1): the mode switch stays visible outside the Filters sheet.
    const projected = page.getByRole("radio", { name: "Projected" });
    await expect(projected).toBeVisible();
    expect((await projected.boundingBox())!.height).toBeGreaterThanOrEqual(40);
    await projected.click();
    await expect(page.getByLabel("Projected minutes for Fixture Guard")).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    const heights = await page.locator(".roster-chip-menu .ui-menu-trigger").evaluateAll((els) => els.map((el) => el.getBoundingClientRect().height));
    expect(Math.min(...heights)).toBeGreaterThanOrEqual(40);
    await page.getByRole("button", { name: "Change team" }).click();
    await expect(page.getByRole("dialog", { name: "Choose a team" }).getByRole("button", { name: "Boston Celtics" })).toHaveAttribute("aria-pressed", "true");
  });
});
