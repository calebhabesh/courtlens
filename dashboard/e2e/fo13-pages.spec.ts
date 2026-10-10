import { expect, test, type Page } from "@playwright/test";
import { openWorkbench } from "./workbench-navigation";

// FO13: Article template pages, Data Status and the hidden Schedule route.

test("settings lists configuration first in a table of contents that reaches each section", async ({ page }) => {
  await openWorkbench(page, "/settings");
  const toc = page.getByRole("navigation", { name: "On this page" });
  await expect(toc.getByRole("link")).toHaveText(["Display", "Assistant", "History and privacy", "Player portraits", "Install", "Background worker", "Sources and terms"]);
  await toc.getByRole("link", { name: "Background worker" }).click();
  await expect(page).toHaveURL(/#worker$/);
  await expect(page.getByRole("region", { name: "Background worker" })).toBeInViewport();
  await expect(page.getByRole("switch", { name: /Advanced mode/ })).toBeVisible();
});

test("data status keeps release identities and job IDs in Data details, not on the page", async ({ page }) => {
  await openWorkbench(page, "/data-status");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Data Status");
  await expect(page.getByRole("region", { name: "Key findings" })).toContainText("Admitted Seasons");
  const visible = await page.locator(".ui-page").innerText();
  expect(visible).not.toMatch(/\b[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}\b/i);
  expect(visible).not.toMatch(/\b\d{4}-\d{2}-\d{2}\b/);
  await page.getByRole("region", { name: "Published release" }).getByRole("button", { name: "Data details" }).click();
  await expect(page.getByRole("dialog")).toContainText("Snapshot ID");
});

test("methodology and what's new use the Article template with anchored sections", async ({ page }) => {
  await openWorkbench(page, "/methodology");
  await expect(page.locator(".ui-page")).toHaveAttribute("data-template", "article");
  await expect(page.getByRole("navigation", { name: "On this page" }).getByRole("link", { name: "Metric catalog" })).toHaveAttribute("href", "#catalog");
  await openWorkbench(page, "/whats-new");
  await expect(page.getByText("Oct 4, 2026 · CourtLens local workbench", { exact: false })).toBeVisible();
  await expect(page.getByRole("navigation", { name: "On this page" }).getByRole("link", { name: "Open gates" })).toHaveAttribute("href", "#open-gates");
});

test("the hidden Schedule page redirects to Live and is not in the More menu", async ({ page }) => {
  const response = await page.goto("/schedule?start=2025-02-03");
  expect(new URL(page.url()).pathname).toBe("/live");
  expect(response?.ok()).toBe(true);
  await page.setViewportSize({ width: 1440, height: 900 });
  await openWorkbench(page, "/settings");
  await page.getByRole("button", { name: "More options" }).click();
  await expect(page.getByRole("menuitem", { name: "Data Status" })).toBeVisible();
  await expect(page.getByRole("menuitem", { name: "Schedule" })).toHaveCount(0);
});

test("planner applies a week change immediately, keeps it in the URL and signs in once", async ({ page }) => {
  const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "Content-Type, Authorization", "Access-Control-Allow-Methods": "GET, POST, OPTIONS" };
  const weeks: string[] = [];
  let signIns = 0;
  await page.route("**/api/auth/token", route => { signIns++; return route.fulfill({ headers: cors, json: { access_token: "fixture" } }); });
  await page.route("**/api/fantasy/**", route => {
    if (route.request().method() === "OPTIONS") return route.fulfill({ status: 204, headers: cors });
    const url = new URL(route.request().url());
    const league = { id: "fixture", name: "Fixture league", timezone: "UTC", lineup_slots: { UTIL: 1 }, acquisition_limit: 4, scoring_rules_version: "fixture-rules", roster_version: 1 };
    if (url.pathname.endsWith("/roster") || url.pathname.endsWith("/watchlist")) return route.fulfill({ headers: cors, json: [] });
    if (url.pathname.endsWith("/planner")) {
      const week = url.searchParams.get("weekStart")!;
      weeks.push(week);
      return route.fulfill({ headers: cors, json: { league, week_start: week, week_end: week, week_state: { acquisitions_used: 0, acquisitions_remaining: 4 }, dates: [], players: [], days: [], summary: { scheduled_player_games: 0, startable_player_games: 0, lineup_conflicts: 0, light_slate_threshold: 5 }, data_snapshot: { classification: "fixture", id: "fixture-snapshot" }, caveats: [] } });
    }
    return route.fulfill({ headers: cors, json: [league] });
  });
  await page.goto("/planner?week=2026-10-05");
  await page.getByLabel("Email", { exact: true }).fill("fixture@courtlens.local");
  await page.getByLabel("Password", { exact: true }).fill("fixture-only");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect.poll(() => weeks).toEqual(["2026-10-05"]);
  await expect(page.getByRole("region", { name: "Key findings" })).toContainText("Scheduled Games");
  await page.getByRole("button", { name: "Week starts: Oct 5, 2026" }).click();
  for (let i = 0; i < 7; i++) await page.keyboard.press("ArrowRight");
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/week=2026-10-12/);
  await expect.poll(() => weeks.at(-1)).toBe("2026-10-12");
  expect(signIns).toBe(1);
  // Snapshot and rules versions are in Data details, not on the page.
  await expect(page.getByText("fixture-rules")).toHaveCount(0);
  await page.getByRole("region", { name: "Planner scope" }).getByRole("button", { name: "Data details" }).click();
  await expect(page.getByRole("dialog")).toContainText("fixture-rules");
});

const plannerCors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "Content-Type, Authorization", "Access-Control-Allow-Methods": "GET, POST, OPTIONS" };
const plannerLeagues = ["first", "second"].map(id => ({ id, name: `${id} league`, timezone: "UTC", lineup_slots: { UTIL: 1 }, acquisition_limit: 4, scoring_rules_version: "fixture-rules", roster_version: 1 }));
function emptyPlan(id: string, week: string) {
  return { league: plannerLeagues.find(league => league.id === id)!, week_start: week, week_end: week, week_state: { acquisitions_used: 0, acquisitions_remaining: 4 }, dates: [], players: [], days: [], summary: { scheduled_player_games: id === "first" ? 11 : 22, startable_player_games: 0, lineup_conflicts: 0, light_slate_threshold: 5 }, data_snapshot: { classification: "fixture", id: "fixture-snapshot" }, caveats: [] };
}
async function signInPlanner(page: Page) {
  await page.getByLabel("Email", { exact: true }).fill("fixture@courtlens.local");
  await page.getByLabel("Password", { exact: true }).fill("fixture-only");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
}

test("planner keeps a failed workspace sign-in actionable and retries successfully", async ({ page }) => {
  let fail = true;
  await page.route("**/api/auth/token", route => route.fulfill({ headers: plannerCors, json: { access_token: "fixture" } }));
  await page.route("**/api/fantasy/**", route => {
    if (route.request().method() === "OPTIONS") return route.fulfill({ status: 204, headers: plannerCors });
    const url = new URL(route.request().url());
    if (url.pathname.endsWith("/leagues")) return route.fulfill({ status: fail ? 503 : 200, headers: plannerCors, json: fail ? { detail: "League service unavailable" } : plannerLeagues });
    if (url.pathname.endsWith("/planner")) return route.fulfill({ headers: plannerCors, json: emptyPlan("first", url.searchParams.get("weekStart")!) });
    return route.fulfill({ headers: plannerCors, json: [] });
  });
  await page.goto("/planner?week=2026-10-05");
  await signInPlanner(page);
  await expect(page.getByRole("status")).toContainText("League service unavailable");
  await expect(page.getByRole("button", { name: "Sign in", exact: true })).toBeEnabled();
  fail = false;
  await signInPlanner(page);
  await expect(page.getByRole("region", { name: "Key findings" })).toContainText("11");
});

test("planner follows league URL navigation and hides an old plan while the new scope loads", async ({ page }) => {
  let releaseSecond: () => void = () => {};
  const secondReady = new Promise<void>(resolve => { releaseSecond = resolve; });
  const requests: string[] = [];
  await page.route("**/api/auth/token", route => route.fulfill({ headers: plannerCors, json: { access_token: "fixture" } }));
  await page.route("**/api/fantasy/**", async route => {
    if (route.request().method() === "OPTIONS") return route.fulfill({ status: 204, headers: plannerCors });
    const url = new URL(route.request().url());
    if (url.pathname.endsWith("/leagues")) return route.fulfill({ headers: plannerCors, json: plannerLeagues });
    if (url.pathname.endsWith("/planner")) {
      const id = url.pathname.split("/").at(-2)!;
      requests.push(id);
      if (id === "second") await secondReady;
      return route.fulfill({ headers: plannerCors, json: emptyPlan(id, url.searchParams.get("weekStart")!) });
    }
    return route.fulfill({ headers: plannerCors, json: [] });
  });
  await page.goto("/planner?league=first&week=2026-10-05");
  await signInPlanner(page);
  await expect(page.getByRole("region", { name: "Key findings" })).toContainText("11");
  // Next integrates native history changes with useSearchParams; no reload or new sign-in.
  await page.evaluate(() => window.history.pushState(null, "", "/planner?league=second&week=2026-10-05"));
  await expect(page.getByRole("combobox", { name: "League", exact: true })).toHaveValue("second");
  await expect.poll(() => requests).toEqual(["first", "second"]);
  await expect(page.getByRole("region", { name: "Key findings" })).toHaveCount(0);
  releaseSecond();
  await expect(page.getByRole("region", { name: "Key findings" })).toContainText("22");
  await page.goBack();
  await expect(page.getByRole("combobox", { name: "League", exact: true })).toHaveValue("first");
  await expect(page.getByRole("region", { name: "Key findings" })).toContainText("11");
});
