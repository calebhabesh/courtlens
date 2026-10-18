import { test, expect, type Page } from "@playwright/test";
import { mockContracts, mockFinance, mockRosterShapes, initial as financeInitial } from "./finance-fixture";
import { readFileSync } from "node:fs";
import { firstLoadFixtures, offSeasonFixtures } from "./first-load-fixtures";
import { openWorkbench } from "./workbench-navigation";
import research from "./fixtures/research-negative-result.json";

// FO06 screenshot baselines for the pages approved at owner gate 2 and the /design style guide,
// plus each later block's rebuilt pages (FO08: Live Finals, Playoffs; FO09: profile, Recent Games).
// Update a baseline only in a commit that names the reason (Design Language v1.1, Enforcement).
const WIDTHS = [{ name: "desktop", width: 1440, height: 900 }, { name: "phone", width: 390, height: 844 }];
const BOS = "1610612738";
const roster = {
  team: { id: BOS, tricode: "BOS", name: "Boston Celtics" },
  context: { release_id: "fixture-release", season: "2025-26", phase: "regular_season", before_date: "2026-04-13" },
  record: { games_played: 82, wins: 56, losses: 26, win_pct: 0.683 },
  production: {}, allowance: {}, recent_games: [],
  player_cohort: [
    { player_id: "11", player_name: "Fixture Guard", games_played: 80, total_minutes: 2400, pts_per_game: 20, reb_per_game: 4, ast_per_game: 6 },
    { player_id: "12", player_name: "Fixture Wing", games_played: 70, total_minutes: 1400, pts_per_game: 10, reb_per_game: 5, ast_per_game: 2 },
    { player_id: "13", player_name: "Fixture Big", games_played: 60, total_minutes: 1200, pts_per_game: 8, reb_per_game: 9, ast_per_game: 1 }
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
  // Intersect the viewport and every clipping ancestor: lazy logos in offscreen table columns
  // do not load even when their un-clipped boxes overlap the viewport.
  await page.waitForFunction(() => [...document.images]
    .filter((image) => {
      if (!image.checkVisibility()) return false;
      const r = image.getBoundingClientRect();
      let left = Math.max(0, r.left), right = Math.min(innerWidth, r.right), top = Math.max(0, r.top), bottom = Math.min(innerHeight, r.bottom);
      for (let p = image.parentElement; p; p = p.parentElement) {
        const s = getComputedStyle(p), b = p.getBoundingClientRect();
        if (/^(auto|scroll|hidden|clip)$/.test(s.overflowX)) { left = Math.max(left, b.left); right = Math.min(right, b.right); }
        if (/^(auto|scroll|hidden|clip)$/.test(s.overflowY)) { top = Math.max(top, b.top); bottom = Math.min(bottom, b.bottom); }
      }
      return right > left && bottom > top;
    })
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

    test("roster shapes depth chart", async ({ page }) => {
      await page.route(`**/api/workbench/teams/${BOS}?*`, (route) => route.fulfill({ json: roster }));
      await openWorkbench(page, `/roster-shapes/${BOS}?view=depth&season=2025-26&phase=regular_season`);
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
      await expect(page.getByRole("heading", { level: 1, name: "Playoffs" })).toBeVisible();
      await settle(page);
      await expect(page).toHaveScreenshot(`playoffs-${view.name}.png`, shot);
    });

    // FO09: Profile template and Recent Games.
    test("player profile", async ({ page }) => {
      await openWorkbench(page, "/players/23");
      await expect(page.getByLabel("Season summary").locator(".player-summary-stat")).toHaveCount(6);
      await settle(page);
      await expect(page).toHaveScreenshot(`player-profile-${view.name}.png`, shot);
    });

    test("recent games", async ({ page }) => {
      await openWorkbench(page, "/last-games?playerId=23");
      await expect(page.getByLabel("Window summary")).toBeVisible();
      await settle(page);
      await expect(page).toHaveScreenshot(`recent-games-${view.name}.png`, shot);
    });

    // FO10: team explorer/profile, stat shift and finance pages.
    test("team stats", async ({ page }) => {
      await openWorkbench(page, "/teams?season=2025-26&beforeDate=2026-04-13");
      await expect(page.locator("tbody tr")).toHaveCount(2);
      await settle(page);await expect(page).toHaveScreenshot(`team-stats-${view.name}.png`, shot);
    });
    test("team profile", async ({ page }) => {
      await openWorkbench(page, "/teams/100?season=2025-26&beforeDate=2026-04-13");
      await expect(page.getByLabel("Team summary")).toBeVisible();
      await settle(page);await expect(page).toHaveScreenshot(`team-profile-${view.name}.png`, shot);
    });
    test("teammate stat shift", async ({ page }) => {
      const empty = JSON.parse(readFileSync("../docs/evidence/b21-api-smoke.json", "utf8")).response;
      await page.route("**/api/workbench/operations/stat-shift", route => route.fulfill({json:{...empty,operation:"stat-shift",request:{...empty.request,...route.request().postDataJSON()}}}));
      await openWorkbench(page, "/stat-line-shift?player_id=1&together=2&season=2025-26&beforeDate=2026-04-13");
      await expect(page.getByRole("heading",{name:"Observed Stat Shift"})).toBeVisible();
      await settle(page);await expect(page).toHaveScreenshot(`stat-shift-${view.name}.png`, shot);
    });
    test("finance contracts/books", async ({ page }) => {
      const route="contracts/books";
      await mockFinance(page);
      await openWorkbench(page,financeInitial);
      await expect(page.getByRole("region",{name:"Financial query result"})).toBeVisible();
      await settle(page);await expect(page).toHaveScreenshot(`${route.replace("/","-")}-${view.name}.png`, shot);
    });

    test("design style guide", async ({ page }) => {
      await openWorkbench(page, "/design");
      await settle(page);
      await expect(page).toHaveScreenshot(`design-${view.name}.png`, shot);
    });
  });
}

// FO14: numerical alignment, phone targets and the final shared 404 header.
for (const view of WIDTHS) test.describe(`PC12 directory ${view.name}`, () => {
  test("first load", async ({ page }) => {
    await page.setViewportSize({ width: view.width, height: view.height });
    await stableWorkspace(page);
    await openWorkbench(page, "/players");
    await expect(page.getByRole("table", { name: "Player directory", exact: true })).toBeVisible();
    await settle(page);
    await expect(page).toHaveScreenshot(`pc12-directory-${view.name}.png`, shot);
  });
});

for (const view of WIDTHS) test.describe(`FO14 baselines ${view.name}`, () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: view.width, height: view.height });
    await stableWorkspace(page);
  });
  test("stats", async ({ page }) => {
    await openWorkbench(page, "/stats");
    await expect(page.locator("td.stats-metric-cell.num").first()).toBeVisible();
    await settle(page);
    await expect(page).toHaveScreenshot(`stats-${view.name}.png`, shot);
  });
  test("not found", async ({ page }) => {
    await page.goto("/fo14-missing-page");
    await expect(page.getByRole("heading", { name: "Page Not Found" })).toBeVisible();
    await settle(page);
    await expect(page).toHaveScreenshot(`not-found-${view.name}.png`, shot);
  });
});

// FO11: four Compare routes, including team factors and WOWY's exact-unit view.
for (const view of WIDTHS) test.describe(`FO11 baselines ${view.name}`,()=>{
  test.beforeEach(async({page})=>{await page.setViewportSize({width:view.width,height:view.height});await stableWorkspace(page);});
  test("player comparison",async({page})=>{
    await openWorkbench(page,"/compare?playerA=23&playerB=24&releaseId=fixture-release&season=2025-26&beforeDate=2026-04-13");
    await expect(page.getByRole("table",{name:"Descriptive comparison"})).toBeVisible();await settle(page);await expect(page).toHaveScreenshot(`player-comparison-${view.name}.png`,shot);
  });
  for(const tab of ["overview","factors"])test(`team comparison ${tab}`,async({page})=>{
    await openWorkbench(page,`/team-compare?teamA=100&teamB=200&releaseId=fixture-release&season=2025-26&beforeDate=2026-04-13&tab=${tab}`);
    await expect(page.locator(".tc-card")).toBeVisible();await settle(page);await expect(page).toHaveScreenshot(`team-comparison-${tab}-${view.name}.png`,shot);
  });
});

// FO12: Research template pages with deterministic data (mock API, sealed fixture or static content).
for (const view of WIDTHS) test.describe(`FO12 baselines ${view.name}`, () => {
  test.beforeEach(async ({ page }) => { await page.setViewportSize({ width: view.width, height: view.height }); await stableWorkspace(page); });
  test("expected shots", async ({ page }) => {
    const run = research.run;
    await page.route("**/api/workbench/research/experiments", route => route.fulfill({ json: [{ experiment: run.experiment, status: run.status, run_id: run.run_id, protocol_sha256: run.protocol_sha256, gate: null, classification: run.classification, http_fitting_available: false }] }));
    await page.route("**/api/workbench/research/runs?*", route => route.fulfill({ json: [run] }));
    await page.route(`**/api/workbench/research/runs/${run.run_id}`, route => route.fulfill({ json: research }));
    await openWorkbench(page, "/research/shooting");
    await expect(page.getByRole("region", { name: "Registered research result" })).toBeVisible();
    await settle(page); await expect(page).toHaveScreenshot(`expected-shots-${view.name}.png`, shot);
  });
  for (const [name, path, ready] of [["forecasts", "/forecasts", "Prespecified Out-of-Time Error Slices"], ["evaluation", "/evaluation", "Final Test · 2023–24"], ["case-studies", "/research/case-studies", "Mid-Season Trade & Jersey Stint Tracking"], ["calculator", "/calculator", "Scenario Output"]] as const) test(name, async ({ page }) => {
    await openWorkbench(page, path);
    await expect(page.getByText(ready, { exact: true }).first()).toBeVisible();
    await settle(page); await expect(page).toHaveScreenshot(`${name}-${view.name}.png`, shot);
  });
});

// FO13: Article template pages (Settings, Methodology, What's New) and Data Status on the mock API.
for (const view of WIDTHS) test.describe(`FO13 baselines ${view.name}`, () => {
  test.beforeEach(async ({ page }) => { await page.setViewportSize({ width: view.width, height: view.height }); await stableWorkspace(page); });
  for (const [name, path, ready] of [["settings", "/settings", "Background worker"], ["data-status", "/data-status", "Background jobs"], ["methodology", "/methodology", "Principles"], ["whats-new", "/whats-new", "Open gates"]] as const) test(name, async ({ page }) => {
    await openWorkbench(page, path);
    await expect(page.getByRole("heading", { name: ready, exact: true })).toBeVisible();
    await settle(page); await expect(page).toHaveScreenshot(`${name}-${view.name}.png`, shot);
  });
});

// PC04: every entry is opened without parameters; canonical defaults are written by the page.
for (const view of WIDTHS) test.describe(`PC04 parameter-free baselines ${view.name}`, () => {
  test.beforeEach(async ({page}) => {await page.setViewportSize({width:view.width,height:view.height});await stableWorkspace(page);await firstLoadFixtures(page);});
  for (const [name,path] of [["compare","/compare"],["stat-shift","/stat-line-shift"],["shot-profile","/similar-players/shot-profile"],["shot-aftermath","/research/shooting/aftermath"],["similar-players","/similar-players"],["recent-games","/last-games"],["operation-gallery","/research/operation"]]) test(name,async({page})=>{
    await openWorkbench(page,path);
    if(path === "/compare") await expect(page.getByRole("table",{name:"Descriptive comparison"})).toBeVisible();
    else if(path === "/research/operation") await expect(page.getByRole("region",{name:"Available research operations"})).toBeVisible();
    else await expect(page.getByRole("region",{name:"Observed example context"})).toBeVisible();
    await settle(page);await expect(page).toHaveScreenshot(`first-load-${name}-${view.name}.png`,shot);
  });
  test("live off-season",async({page})=>{await offSeasonFixtures(page);await openWorkbench(page,"/live");await expect(page.getByRole("region",{name:"Top performers"})).toContainText("28 PTS");await settle(page);await expect(page).toHaveScreenshot(`first-load-live-${view.name}.png`,shot);});
  // PC08: Contracts first load from the latest admitted refresh (real captured responses).
  // PC10: Roster Shapes first load and team detail from the captured real response.
  for(const route of ["roster-shapes","roster-shapes/DEN"]) test(`first-load ${route}`,async({page})=>{await mockRosterShapes(page);await openWorkbench(page,`/${route}`);await expect(page.locator(".chart-pack").first()).toBeVisible();await settle(page);await expect(page).toHaveScreenshot(`first-load-${route.replace("/","-")}-${view.name}.png`,shot);});
  for(const route of ["contracts","contracts/DEN"]) test(`first-load ${route}`,async({page})=>{await mockContracts(page);await openWorkbench(page,`/${route}`);await expect(page.getByRole("figure").first()).toBeVisible();await settle(page);await expect(page).toHaveScreenshot(`first-load-${route.replace("/","-")}-${view.name}.png`,shot);});
});

// PC11: former gate pages on first load with no URL parameters (fictional e2e/pc11-fixtures.mjs).
for (const view of WIDTHS) test.describe(`PC11 populated pages ${view.name}`, () => {
  test.beforeEach(async ({ page }) => { await page.setViewportSize({ width: view.width, height: view.height }); await stableWorkspace(page); });
  for (const [name, path, ready] of [["defensive-matchups", "/research/defensive-matchups", "Makes below expected, top 12"], ["player-matchups", "/matchups", "Exposure"],
    ["adjusted-shooting", "/research/shooting/adjusted", "Points per 100 above the play-type expectation"], ["six-factor", "/research/rapm/six-factor", "Offensive shooting (oTS), top 15"],
    ["combine", "/wingspan", "Wingspan versus barefoot height"], ["wowy", "/wowy", "Fixture Anchor and Fixture Wing: net rating by who was on the floor"],
    ["stats-tracking", "/stats/tracking", "Drives per game, top 12"]] as const) test(name, async ({ page }) => {
    await openWorkbench(page, path);
    await expect(page.getByText(ready, { exact: true }).first()).toBeVisible();
    await settle(page); await expect(page).toHaveScreenshot(`pc11-${name}-${view.name}.png`, shot);
  });
});
