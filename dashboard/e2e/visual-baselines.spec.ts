import { test, expect, type Page } from "@playwright/test";
import { openWorkbench } from "./workbench-navigation";

// FO06 screenshot baselines for the pages approved at owner gate 2 and the /design style guide,
// plus each later block's rebuilt pages (FO08: Live Finals, Playoffs).
// Update a baseline only in a commit that names the reason (Design Language v1.1, Enforcement).
const WIDTHS = [{ name: "desktop", width: 1440, height: 900 }, { name: "phone", width: 390, height: 844 }];
const BOS = "1610612738";
const roster = {
  team: { id: BOS, tricode: "BOS", name: "Boston Celtics" },
  context: { release_id: "fixture-release", season: "2025-26", phase: "regular_season", before_date: "2026-04-13" },
  record: { games_played: 82, wins: 56, losses: 26, win_pct: 0.683 },
  production: {}, allowance: {}, recent_games: [],
  player_cohort: [
    { player_id: "11", player_name: "Fixture Guard", games_played: 80, total_minutes: 2400, points: 1600, points_per_game: 20 },
    { player_id: "12", player_name: "Fixture Wing", games_played: 70, total_minutes: 1400, points: 700, points_per_game: 10 },
    { player_id: "13", player_name: "Fixture Big", games_played: 60, total_minutes: 1200, points: 480, points_per_game: 8 }
  ],
  warnings: []
};

/** A fixed, empty personal workspace so favorites or a compare tray left by other specs never show. */
async function stableWorkspace(page: Page) {
  const state = {
    workspace_id: "default", name: "Default Workspace", version: 1, views: [], favorites: [], compare_tray: [],
    ranking_boards: [], tier_lists: [],
    preferences: { density: "standard", identity_mode: "photos", counting_mode: "per_game", default_view_id: "overview", table_expanded: false, theme: "dark" },
    created_at: "2026-10-05", updated_at: "2026-10-05"
  };
  await page.route("**/api/workspace**", (route) => route.fulfill({ json: state }));
}

async function settle(page: Page) {
  await page.waitForLoadState("networkidle");
  await page.evaluate(() => document.fonts.ready);
  // Images in the captured viewport (logos, headshots) must finish; lazy ones below it never load.
  await page.waitForFunction(() => [...document.images]
    .filter((image) => { const r = image.getBoundingClientRect(); return r.bottom > 0 && r.top < innerHeight && r.width > 0; })
    .every((image) => image.complete));
}

const shot = { animations: "disabled" as const, caret: "hide" as const, maxDiffPixelRatio: 0.01 };

for (const view of WIDTHS) {
  test.describe(`FO06 baselines ${view.name}`, () => {
    test.beforeEach(async ({ page }) => {
      await page.setViewportSize({ width: view.width, height: view.height });
      await stableWorkspace(page);
    });

    test("player showcase", async ({ page }) => {
      await openWorkbench(page, "/showcase");
      await expect(page.locator(".showcase-card-svg")).toBeVisible();
      await settle(page);
      await expect(page).toHaveScreenshot(`showcase-${view.name}.png`, shot);
    });

    test("roster shapes team picker", async ({ page }) => {
      await openWorkbench(page, "/roster-shapes?season=2025-26&phase=regular_season");
      await expect(page.getByRole("list", { name: "Teams" }).getByRole("button")).toHaveCount(30);
      await settle(page);
      await expect(page).toHaveScreenshot(`roster-picker-${view.name}.png`, shot);
    });

    test("roster shapes depth chart", async ({ page }) => {
      await page.route(`**/api/workbench/teams/${BOS}?*`, (route) => route.fulfill({ json: roster }));
      await openWorkbench(page, `/roster-shapes?team=${BOS}&season=2025-26&phase=regular_season`);
      await page.getByRole("button", { name: "Move Fixture Guard" }).click();
      await page.getByRole("menuitem", { name: /^Move to PG/ }).click();
      await expect(page.getByRole("region", { name: "PG lane" })).toContainText("Fixture Guard");
      await page.evaluate(() => scrollTo(0, 0));
      await settle(page);
      await expect(page).toHaveScreenshot(`roster-chart-${view.name}.png`, shot);
    });

    test("search modal", async ({ page }) => {
      await openWorkbench(page, "/showcase");
      if (view.width < 768) await page.getByRole("button", { name: /search/i }).first().click();
      else await page.locator(".courtlens-search-pill").click();
      const dialog = page.getByRole("dialog");
      await dialog.getByRole("combobox").fill("fixture");
      await expect(dialog.getByRole("option").first()).toBeVisible();
      await settle(page);
      await expect(page).toHaveScreenshot(`search-${view.name}.png`, shot);
    });

    // FO08: Finals on a fixed past date (the Live tab depends on today, so it has no baseline).
    test("live finals board", async ({ page }) => {
      const team = (id: string, name: string, side: string, score: number) => ({ source_id: id, canonical_id: id, identity_status: "admitted_research", name, side, score });
      const games = [["0022401190", "1610612738", "Boston Celtics", "1610612761", "Toronto Raptors"], ["0022401191", "1610612747", "Los Angeles Lakers", "1610612744", "Golden State Warriors"]]
        .map(([id, home, homeName, away, awayName], i) => ({ source_id: id, canonical_id: id, identity_status: "admitted_research", namespace: "nba", slate_date: "2025-04-15", event_time: null, status: "final", period: null, clock: null, provisional: false, teams: [team(home, homeName, "home", 110 + i), team(away, awayName, "away", 101 + i)] }));
      await page.route("**/api/live/historical?*", (route) => route.fulfill({ json: { context: { release_id: "fixture-release", dataset_id: "fixture-dataset", season: "2024-25", phase: "regular_season", before_date: "2025-04-16" }, games, players: null, status: "admitted_finals", warnings: [] } }));
      await openWorkbench(page, "/live/2025-04-15?live_mode=history&releaseId=fixture-release&season=2024-25");
      await expect(page.getByRole("region", { name: "Game slate" }).getByRole("link")).toHaveCount(2);
      await settle(page);
      await expect(page).toHaveScreenshot(`live-finals-${view.name}.png`, shot);
    });

    test("playoffs bracket", async ({ page }) => {
      await openWorkbench(page, "/playoffs?season=2025-26");
      await expect(page.getByRole("heading", { level: 1, name: "Live" })).toBeVisible();
      await settle(page);
      await expect(page).toHaveScreenshot(`playoffs-${view.name}.png`, shot);
    });

    test("design style guide", async ({ page }) => {
      await openWorkbench(page, "/design");
      await settle(page);
      await expect(page).toHaveScreenshot(`design-${view.name}.png`, shot);
    });
  });
}
