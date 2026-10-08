import fs from "node:fs/promises";
import path from "node:path";
import { test, type Page } from "@playwright/test";
import { easternToday, type LiveCache, type LiveGame } from "../lib/live";
import { openWorkbench } from "./workbench-navigation";

const slate = easternToday();
const game: LiveGame = {
  source_id: "123",
  canonical_id: null,
  identity_status: "unmapped",
  namespace: "espn",
  slate_date: slate,
  event_time: `${slate}T23:00:00Z`,
  status: "in_progress",
  period: 4,
  clock: "2:45",
  provisional: true,
  teams: [
    { source_id: "1", canonical_id: null, identity_status: "unmapped", name: "Boston Celtics", side: "home", score: 108 },
    { source_id: "2", canonical_id: null, identity_status: "unmapped", name: "Miami Heat", side: "away", score: 102 }
  ]
};

const cache: LiveCache = {
  namespace: "espn",
  provisional: true,
  client_poll_seconds: 60,
  capability: "not_yet_observed",
  status: "observed",
  paused: false,
  active_leases: 1,
  stale: false,
  age_seconds: 15,
  last_success_at: `${slate}T23:00:00Z`,
  last_poll_at: null,
  next_poll_at: null,
  error: null,
  observation_id: "observed-fixture-dl05",
  acquired_at: `${slate}T23:00:00Z`,
  source_time: null,
  http_date: null,
  content_sha256: "b".repeat(64),
  data: { games: [game] }
};

async function setupLiveMock(page: Page) {
  await page.route("**/api/live**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (request.method() === "DELETE") return route.fulfill({ status: 204 });
    if (request.method() === "POST") return route.fulfill({ json: { id: "mock-lease", expires_at: "later", heartbeat_seconds: 60 } });
    if (url.pathname.includes("/games/")) {
      return route.fulfill({
        json: {
          ...cache,
          data: {
            game,
            players: [
              { source_id: "101", team_source_id: "1", name: "Jayson Tatum", canonical_id: null, identity_status: "unmapped", reported_nonappearance: false, statistics: { PTS: "31", MIN: "36:12", REB: "8", AST: "6" } },
              { source_id: "102", team_source_id: "1", name: "Jaylen Brown", canonical_id: null, identity_status: "unmapped", reported_nonappearance: false, statistics: { PTS: "24", MIN: "34:40", REB: "5", AST: "3" } },
              { source_id: "201", team_source_id: "2", name: "Bam Adebayo", canonical_id: null, identity_status: "unmapped", reported_nonappearance: false, statistics: { PTS: "22", MIN: "35:05", REB: "11", AST: "4" } }
            ],
            team_sections: null
          }
        }
      });
    }
    return route.fulfill({ json: cache });
  });
}

test.describe("DL05 Evidence Screenshot Capture", () => {
  const evidenceDir = path.resolve(process.cwd(), "../docs/evidence/dl05");

  test.beforeAll(async () => {
    await fs.mkdir(evidenceDir, { recursive: true });
  });

  test("captures live workspace at 1440px and 375px", async ({ page }) => {
    await setupLiveMock(page);

    // Desktop
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(`/live/${slate}`);
    await page.waitForTimeout(500);
    await page.screenshot({
      path: path.join(evidenceDir, "live-1440.png"),
      fullPage: true
    });

    // Mobile
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto(`/live/${slate}`);
    await page.waitForTimeout(500);
    await page.screenshot({
      path: path.join(evidenceDir, "live-375.png"),
      fullPage: true
    });
  });

  test("captures live game details at 1440px and 375px", async ({ page }) => {
    await setupLiveMock(page);

    // Desktop
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(`/live/games/123?date=${slate}`);
    await page.waitForTimeout(500);
    await page.screenshot({
      path: path.join(evidenceDir, "live-game-1440.png"),
      fullPage: true
    });

    // Mobile
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto(`/live/games/123?date=${slate}`);
    await page.waitForTimeout(500);
    await page.screenshot({
      path: path.join(evidenceDir, "live-game-375.png"),
      fullPage: true
    });
  });

  test("captures schedule at 1440px and 375px", async ({ page }) => {
    // Desktop
    await page.setViewportSize({ width: 1440, height: 900 });
    await openWorkbench(page, "/schedule");
    await page.waitForTimeout(500);
    await page.screenshot({
      path: path.join(evidenceDir, "schedule-1440.png"),
      fullPage: true
    });

    // Mobile
    await page.setViewportSize({ width: 375, height: 812 });
    await openWorkbench(page, "/schedule");
    await page.waitForTimeout(500);
    await page.screenshot({
      path: path.join(evidenceDir, "schedule-375.png"),
      fullPage: true
    });
  });

  test("captures last games explorer at 1440px and 375px", async ({ page }) => {
    // Desktop
    await page.setViewportSize({ width: 1440, height: 900 });
    await openWorkbench(page, "/last-games");
    await page.waitForTimeout(500);
    await page.screenshot({
      path: path.join(evidenceDir, "last-games-1440.png"),
      fullPage: true
    });

    // Mobile
    await page.setViewportSize({ width: 375, height: 812 });
    await openWorkbench(page, "/last-games");
    await page.waitForTimeout(500);
    await page.screenshot({
      path: path.join(evidenceDir, "last-games-375.png"),
      fullPage: true
    });
  });

  test("captures playoffs tournament bracket at 1440px and 375px", async ({ page }) => {
    // Desktop
    await page.setViewportSize({ width: 1440, height: 900 });
    await openWorkbench(page, "/playoffs");
    await page.waitForTimeout(500);
    await page.screenshot({
      path: path.join(evidenceDir, "playoffs-1440.png"),
      fullPage: true
    });

    // Mobile
    await page.setViewportSize({ width: 375, height: 812 });
    await openWorkbench(page, "/playoffs");
    await page.waitForTimeout(500);
    await page.screenshot({
      path: path.join(evidenceDir, "playoffs-375.png"),
      fullPage: true
    });
  });

  test("captures playoffs series detail at 1440px and 375px", async ({ page }) => {
    // Desktop
    await page.setViewportSize({ width: 1440, height: 900 });
    await openWorkbench(page, "/playoffs/2024-r1-bos-mia");
    await page.waitForTimeout(500);
    await page.screenshot({
      path: path.join(evidenceDir, "playoffs-series-1440.png"),
      fullPage: true
    });

    // Mobile
    await page.setViewportSize({ width: 375, height: 812 });
    await openWorkbench(page, "/playoffs/2024-r1-bos-mia");
    await page.waitForTimeout(500);
    await page.screenshot({
      path: path.join(evidenceDir, "playoffs-series-375.png"),
      fullPage: true
    });
  });
});
