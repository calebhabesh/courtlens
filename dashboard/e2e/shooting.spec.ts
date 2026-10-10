import { expect, test } from "@playwright/test";
import { openWorkbench } from "./workbench-navigation";
import { readFileSync } from "node:fs";
const smoke = JSON.parse(readFileSync("../docs/evidence/b23-api-smoke.json", "utf8"));
function fixture(operation: string, request: Record<string, unknown>) {
  const data = structuredClone(smoke.operations[operation].response);
  data.request = { ...data.request, ...request };
  data.context = { ...data.context, release_id: request.release_id || "fixture-release", season: request.season || "2023-24", phase: request.phase || "regular_season", before_date: request.before_date || "2024-04-15" };
  return data;
}
test.beforeEach(async ({ page }) => {
  await page.route("**/api/workbench/operations/*", async route => route.fulfill({ json: fixture(route.request().url().split("/").pop()!, route.request().postDataJSON()) }));
});
test("blocked source exports complete evidence and pins resolved links", async ({ page }) => {
  // FO12: a valid query runs as soon as the player is in scope (D6); there is no Run button.
  await openWorkbench(page, "/similar-players/shot-profile?player_id=1627751");
  await expect(page.getByText("Real analytics are unavailable", { exact: false }).first()).toBeVisible();
  await expect(page.getByRole("status").filter({ hasText: "Source coverage:" })).toContainText("0 / 1230");
  await expect(page).toHaveURL(/release_id=fixture-release/);
  const pending = page.waitForEvent("download"); await page.getByRole("button", { name: "Save evidence JSON" }).click();
  const file = await (await pending).path(); const saved = JSON.parse(readFileSync(file!, "utf8"));
  expect(saved.result.coverage_status).toBe("source_blocked"); expect(saved.result.profile.attempts).toBe(0);
  expect(saved.result.profile.zones[0].fg_pct).toBeNull(); expect(saved.result.evidence_hash).toBeTruthy();
  await expect(page.getByRole("link", { name: "Source assignment matchups" })).toHaveAttribute("href", /release_id=fixture-release/);
  await page.screenshot({ path: test.info().outputPath("b24-empty-desktop-fixture.png"), fullPage: true });
});
test("court and table preserve zero versus unknown; exports and peer zones agree", async ({ page }) => {
  await page.route("**/api/workbench/operations/*", async route => {
    const data = fixture("shot-profile-peers", route.request().postDataJSON()); data.coverage_status = "partial";
    data.shots = [{ game_id: "g", game_date: "2024-01-01", player_id: "1", team_id: "TOR", period: 1, seconds_remaining: 0, shot_value: 2, made: false, points: 0, x_feet: 0, y_feet: 0, distance_feet: 0, zone: "Restricted Area" }, { game_id: "g", game_date: "2024-01-01", player_id: "1", team_id: "TOR", period: 1, seconds_remaining: 10, shot_value: 3, made: true, points: 3, x_feet: null, y_feet: null, distance_feet: 25, zone: "Unknown" }];
    Object.assign(data.profile, { player_id: "1", attempts: 2, makes: 1, points: 3, located_attempts: 1, unknown_attempts: 1, games: 1, sample_status: "insufficient_sample" });
    for (const z of data.profile.zones) if (["Restricted Area", "Unknown"].includes(z.zone)) Object.assign(z, { attempts: 1, makes: z.zone === "Unknown" ? 1 : 0, points: z.zone === "Unknown" ? 3 : 0, fg_pct: z.zone === "Unknown" ? 1 : 0, attempt_share: .5 });
    data.peers = [{ distance: .25, profile: { ...structuredClone(data.profile), player_id: "2" } }];
    await route.fulfill({ json: data });
  });
  await openWorkbench(page, "/similar-players/shot-profile?player_id=1");
  await expect(page.getByText("2 displayed attempts; 1 unplotted", { exact: false })).toBeVisible();
  const pending = page.waitForEvent("download"); await page.getByRole("button", { name: "Export court SVG" }).click();
  const svg = readFileSync((await (await pending).path())!, "utf8"); expect(svg).toContain("fixture-release"); expect(svg).toContain("Evidence"); expect(svg).not.toContain("var(--");
  await page.getByRole("button", { name: "Compare Fixture Player 2", exact: true }).click(); await expect(page.getByRole("region", { name: "Zone profile Fixture Player 2", exact: true })).toContainText("50.0%");
  await page.getByLabel("Display zone").selectOption("Unknown"); await expect(page.getByText("1 displayed attempts; 1 unplotted", { exact: false })).toBeVisible();
  await page.getByRole("button", { name: "Inspect shot 2" }).click(); await expect(page.getByRole("heading", { name: "Selected shot evidence" })).toBeVisible();
  await expect(page.getByText("Source video unavailable: no admitted exact", { exact: false })).toBeVisible();
  // Peer links keep the resolved release; the release itself lives in Data details (D5).
  await page.getByRole("link", { name: "Fixture Player 2", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Shot-profile twins · Fixture Player 2" })).toBeVisible(); await expect(page).toHaveURL(/player_id=2.*release_id=fixture-release|release_id=fixture-release.*player_id=2/);
  await page.goBack(); await expect(page.getByRole("heading", { name: "Shot-profile twins · Fixture Player 1" })).toBeVisible();
});
test("assignment matrix shows fractional exposure and null pooled rates at 375px", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 850 });
  await page.route("**/api/workbench/operations/matchups", async route => {
    const data = fixture("matchups", route.request().postDataJSON()); data.coverage_status = "partial"; data.observed_games = 1;
    data.assignments = [{ offensive_player_id: "1", defensive_player_id: "2", games: 1, seconds: 0, fractional_possessions: .125, attempts: 0, makes: 0, player_points: 0, team_points: 0, fg_pct: null }];
    await route.fulfill({ json: data });
  });
  await openWorkbench(page, "/matchups?player_id=1&defender_id=2");
  await expect(page.getByRole("region", { name: "Assignment matrix" })).toContainText("0.125"); await expect(page.getByRole("region", { name: "Assignment matrix" })).toContainText("—");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole("region", { name: "Assignment matrix" }).focus(); await page.keyboard.press("ArrowRight");
  await page.screenshot({ path: test.info().outputPath("b24-partial-mobile-fixture.png"), fullPage: true });
});
test("aftermath keeps branch samples, unknown membership and censoring distinct", async ({ page }) => {
  await page.route("**/api/workbench/operations/shot-aftermath", async route => {
    const data = fixture("shot-aftermath", route.request().postDataJSON()); data.coverage_status = "partial";
    data.aftermath_summary = [{ branch: "unknown", anchors: 1, games: 1, continued_samples: 0, opponent_samples: 0, missing_opponent: 1, censored_opponent: 0, first_chance_points: null, continued_points: null, next_opponent_points: null, sample_status: "insufficient_sample" }, { branch: "made", anchors: 1, games: 1, continued_samples: 1, opponent_samples: 0, missing_opponent: 0, censored_opponent: 1, first_chance_points: 2, continued_points: 0, next_opponent_points: null, sample_status: "insufficient_sample" }];
    data.anchors = [{ game_id: "g", possession_number: null, branch: "unknown", shot_points: 0, first_chance_points: null, continued_points: null, next_opponent_points: null, next_status: "missing", reason: "unmapped" }, { game_id: "g", possession_number: 5, branch: "made", shot_points: 2, first_chance_points: 2, continued_points: 0, next_opponent_points: null, next_status: "censored", reason: "period_end" }];
    await route.fulfill({ json: data });
  });
  await openWorkbench(page, "/research/shooting/aftermath?player_id=1");
  await expect(page.getByRole("region", { name: "Aftermath branches" })).toContainText("insufficient_sample");
  await page.getByText("Sequence evidence · 2 anchors / unknown candidates", { exact: true }).click();
  await expect(page.getByRole("region", { name: "Sequence evidence" })).toContainText("censored"); await expect(page.getByRole("region", { name: "Sequence evidence" })).toContainText("—");
  const pending = page.waitForEvent("download"); await page.getByRole("button", { name: "Export evidence CSV" }).click();
  expect(readFileSync((await (await pending).path())!, "utf8")).toContain('""first_chance_points"":null');
});
test("query overflow is actionable and cannot export a partial result", async ({ page }) => {
  await page.route("**/api/workbench/operations/*", async route => route.fulfill({ status: 422, json: { detail: { code: "query_bound_exceeded", message: "Narrow the date scope; complete shot input exceeds 50000 records" } } }));
  await openWorkbench(page, "/similar-players/shot-profile?player_id=1"); await expect(page.getByRole("alert").filter({ hasText: "query_bound_exceeded" })).toContainText("query_bound_exceeded"); await expect(page.getByRole("button", { name: "Save evidence JSON" })).toHaveCount(0);
});
test("cancelling an abandoned request prevents stale results", async ({ page }) => {
  await page.route("**/api/workbench/operations/*", async route => { await new Promise(resolve => setTimeout(resolve, 500)); await route.fulfill({ json: fixture("shot-profile-peers", route.request().postDataJSON()) }).catch(() => {}); });
  await openWorkbench(page, "/similar-players/shot-profile?player_id=1"); await page.getByRole("button", { name: "Cancel", exact: true }).click(); await expect(page.getByText("Analysis cancelled.", { exact: true })).toBeVisible(); await expect(page.getByRole("region", { name: "Shooting result" })).toHaveCount(0); await page.waitForTimeout(650); await expect(page.getByRole("region", { name: "Shooting result" })).toHaveCount(0);
});

test("name lookup alone never runs analysis; choosing a player and a view does", async ({ page }) => {
  let calls = 0;
  page.on("request", r => { if (r.url().includes("/operations/")) calls++; });
  await page.route("**/api/workbench/lookup?*", route => route.fulfill({ json: { items: [{ kind: "player", canonical_id: "1627751", display_name: "Fixture Shooter" }] } }));
  await openWorkbench(page, "/similar-players/shot-profile");
  await page.getByRole("combobox",{name:"Player",exact:true}).fill("Shooter");
  await expect(page.getByRole("option").filter({hasText:"Fixture Shooter"})).toBeVisible();
  expect(calls).toBe(0);
  await page.getByRole("option").filter({hasText:"Fixture Shooter"}).click();
  await expect(page.getByRole("heading", { name: "Shot-profile twins · Fixture Shooter" })).toBeVisible();
  await expect(page.getByRole("combobox",{name:"Player",exact:true})).toHaveAttribute("placeholder", "Player: Fixture Shooter");
  await page.getByRole("radio", { name: "Shooting profile", exact: true }).click();
  await expect(page.getByRole("heading", { name: /^Shooting profile · / })).toBeVisible();
  await expect(page).toHaveURL(/operation=shot-profile/);
});

test("shot pagination bounds the court/table while exports retain all facts", async ({ page }) => {
  await page.route("**/api/workbench/operations/*", async route => {
    const data = fixture("shot-profile", route.request().postDataJSON()); data.coverage_status = "partial";
    data.shots = Array.from({ length: 101 }, (_, i) => ({ game_id: `g-${i}`, game_date: "2024-01-01", player_id: "1", team_id: "TOR", period: 1, seconds_remaining: i, shot_value: 2, made: false, points: 0, x_feet: 0, y_feet: 0, distance_feet: 0, zone: "Restricted Area" }));
    Object.assign(data.profile, { attempts: 101, located_attempts: 101, games: 101, sample_status: "available" });
    Object.assign(data.profile.zones[0], { attempts: 101, makes: 0, points: 0, fg_pct: 0, attempt_share: 1 });
    await route.fulfill({ json: data });
  });
  await openWorkbench(page, "/similar-players/shot-profile?player_id=1&operation=shot-profile");
  await expect(page.getByRole("region", { name: "Shot facts", exact: true }).getByRole("button")).toHaveCount(100);
  await page.getByRole("button", { name: "Next shots" }).click(); await expect(page.getByRole("region", { name: "Shot facts", exact: true }).getByRole("button")).toHaveCount(1); await expect(page.getByRole("button", { name: "Inspect shot 101" })).toBeVisible();
  await expect(page.locator("svg.shooting-court g")).toHaveCount(1);
  const pending = page.waitForEvent("download"); await page.getByRole("button", { name: "Save evidence JSON" }).click();
  const bundle = JSON.parse(readFileSync((await (await pending).path())!, "utf8")); expect(bundle.result.shots).toHaveLength(101); expect(bundle.display_filters.shot_page).toBe(2);
});
