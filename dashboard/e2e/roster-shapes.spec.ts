import { test, expect, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { readFileSync } from "node:fs";
import path from "node:path";
import { openWorkbench } from "./workbench-navigation";

// FO05 depth chart (on the team profile since alignment row 12): drag and menu moves,
// Observed/Projected, the 240-minute gauge and the byte-compatible JSON export.
const BOS = "1610612738";
const detail = {
  team: { id: BOS, tricode: "BOS", name: "Boston Celtics" },
  context: { release_id: "fixture-release", season: "2025-26", phase: "regular_season", before_date: "2026-04-13" },
  record: { games_played: 82, wins: 56, losses: 26, win_pct: 0.683 },
  production: {}, allowance: {}, recent_games: [],
  player_cohort: [
    { player_id: "11", player_name: "Fixture Guard", games_played: 80, total_minutes: 2400, pts_per_game: 20, reb_per_game: 4, ast_per_game: 6 },
    { player_id: "12", player_name: "Fixture Wing", games_played: 70, total_minutes: 1400, pts_per_game: 10, reb_per_game: 5, ast_per_game: 2 },
    { player_id: "13", player_name: "Fixture Big", games_played: 60, total_minutes: 1200, pts_per_game: 8, reb_per_game: 9, ast_per_game: 1 }
  ],
  warnings: ["Fixture scope only"]
};

async function mockTeam(page: Page) {
  await page.route(`**/api/workbench/teams/${BOS}?*`, (route) => route.fulfill({ json: detail }));
}

// Roster Shapes (alignment row 12): the real v2 responses (2026-27 projected and 2025-26), captured
// from the local API into e2e/fixtures/roster-shapes-v2.json.
const shapes = JSON.parse(readFileSync(path.resolve(process.cwd(), "e2e/fixtures/roster-shapes-v2.json"), "utf8")) as Record<string, { roster_context: { dataset_id: string } | null; teams: { team_tricode: string; roster: unknown[] }[] }>;
async function mockShapes(page: Page) {
  await page.route("**/api/workbench/roster-shapes*", (route) => {
    const season = new URL(route.request().url()).searchParams.get("season") ?? "2026-27";
    return shapes[season] ? route.fulfill({ json: shapes[season] }) : route.fulfill({ status: 422, json: { detail: "unsupported season" } });
  });
}
const index = shapes["2026-27"].roster_context!.dataset_id;
const depth = `/teams/${BOS}?season=2025-26&phase=regular_season`;

test.describe("Roster Shapes", () => {
  test("opens on 30 boxes with the key, a pinned index and sorting", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await mockShapes(page);
    await openWorkbench(page, "/roster-shapes");
    await expect(page.getByRole("heading", { level: 1, name: "Roster Shapes" })).toBeVisible();
    await expect(page).toHaveURL(new RegExp(`index=${index}`));
    const grid = page.getByRole("list", { name: "Team roster shapes" });
    await expect(grid.getByRole("listitem")).toHaveCount(30);
    await expect(page.locator("main")).toContainText("Created by @taylormetrics");
    await expect(page.locator("main")).toContainText("The box is a +17.4 team.");
    await expect(page.getByRole("region", { name: "How to read the shapes" })).toContainText("Hardest to fit");
    // Fullest first: fills descend down the grid.
    const fills = await grid.locator(".shapes-card-fill").allTextContents();
    const values = fills.map(text => Number(text.replace("%", "")));
    expect(values).toEqual([...values].sort((a, b) => b - a));
    // Unknown and replacement-level players are listed, never drawn.
    const first = shapes["2026-27"].teams.find(t => t.team_tricode === "OKC")!;
    const drawn = (first.roster as { size: number | null }[]).filter(p => p.size !== null && p.size > 0).length;
    await expect(grid.getByRole("listitem").first().locator("[data-shape-id]")).toHaveCount(drawn);

    await page.getByRole("radio", { name: "A–Z" }).click();
    await expect(page).toHaveURL(/sort=az/);
    await expect(grid.getByRole("listitem").first()).toContainText("Atlanta Hawks");
    await page.getByRole("radio", { name: "Best fit" }).click();
    await expect(page).toHaveURL(/sort=fit/);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);

    await grid.getByRole("link", { name: /^Boston Celtics/ }).click();
    await expect(page).toHaveURL(/team=BOS/);
    await expect(page.getByRole("region", { name: "Boston Celtics roster" })).toBeVisible();
  });

  test("a team shows its large box and full roster; Playoff-adjusted adds the shift", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await mockShapes(page);
    await openWorkbench(page, "/roster-shapes?team=SAS");
    await expect(page.getByRole("list", { name: "Team roster shapes" }).getByRole("listitem")).toHaveCount(1);
    await expect(page.getByRole("combobox", { name: "Team" })).toHaveValue("SAS");
    const sas = shapes["2026-27"].teams.find(t => t.team_tricode === "SAS")!;
    const table = page.getByRole("region", { name: "San Antonio Spurs roster" });
    await expect(table.locator("tbody tr")).toHaveCount(sas.roster.length);
    await expect(table.getByRole("row", { name: /Victor Wembanyama/ })).toContainText("Stretch big");
    await expect(table.locator("thead")).not.toContainText("PO shift");
    await page.getByRole("radio", { name: "Playoff-adjusted" }).click();
    await expect(page).toHaveURL(/mode=playoff/);
    await expect(table.locator("thead")).toContainText("PO shift");
    await page.getByRole("combobox", { name: "Team" }).selectOption("");
    await expect(page.getByRole("list", { name: "Team roster shapes" }).getByRole("listitem")).toHaveCount(30);
  });

  test("team view: what's missing, a trade sandbox, changes since last season and a share image", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await mockShapes(page);
    await openWorkbench(page, "/roster-shapes?team=SAS");
    const card = page.getByRole("list", { name: "Team roster shapes" }).getByRole("listitem");
    await expect(card.locator(".shapes-missing")).toContainText("White is");
    const fill = async () => Number((await card.locator(".shapes-card-fill").textContent())!.replace("%", ""));
    const before = await fill();

    // Sandbox: add the league's biggest shape from another roster, then remove it again.
    const sandbox = page.getByRole("region", { name: "Trade sandbox" });
    await sandbox.getByRole("combobox", { name: "Add a player" }).selectOption("203999");
    await expect(page).toHaveURL(/add=203999/);
    await expect(card.locator('[data-mark="added"]')).toHaveCount(1);
    expect(await fill()).toBeGreaterThan(before);
    await sandbox.getByRole("combobox", { name: "Remove a player" }).selectOption("1641705");
    await expect(page).toHaveURL(/drop=1641705/);
    await sandbox.getByRole("button", { name: "Reset" }).click();
    await expect(page).not.toHaveURL(/add=|drop=/);
    expect(await fill()).toBe(before);

    // Since last season: two boxes, arrivals outlined in the projected one.
    const since = page.getByRole("region", { name: "Since last season" });
    await expect(since.locator("figure")).toHaveCount(2);
    await expect(since).toContainText("Arrivals");
    await expect(since).toContainText("Departures");

    const download = page.waitForEvent("download");
    await page.getByRole("button", { name: "Share Image" }).click();
    expect((await download).suggestedFilename()).toBe("courtlens-roster-shape-sas-2026-27.png");
  });

  test("2025-26 shows the season's actual rosters", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await mockShapes(page);
    await openWorkbench(page, "/roster-shapes");
    await page.getByRole("combobox", { name: "Season" }).selectOption("2025-26");
    await expect(page).toHaveURL(/season=2025-26/);
    await expect(page.locator(".shapes-note")).toContainText("A traded player appears on each of his teams.");
    await expect(page.locator("main")).toContainText("2025-26, 30 rosters.");
  });

  test("phone shows one box per row with no sideways scroll", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await mockShapes(page);
    await openWorkbench(page, "/roster-shapes");
    const cards = page.getByRole("list", { name: "Team roster shapes" }).getByRole("listitem");
    await expect(cards).toHaveCount(30);
    const [a, b] = [await cards.nth(0).boundingBox(), await cards.nth(1).boundingBox()];
    expect(b!.y).toBeGreaterThan(a!.y + a!.height - 1);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });

  test("old team links open the team select, and the depth chart on the team profile", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await mockShapes(page);
    await mockTeam(page);
    await openWorkbench(page, "/roster-shapes/SAS");
    await expect(page).toHaveURL(/\/roster-shapes\?team=SAS/);
    await openWorkbench(page, `/roster-shapes/BOS?view=depth&season=2025-26&phase=regular_season`);
    // The profile canonicalises its URL on load (dropping the #depth-chart hash), so check the path and section.
    await expect(page).toHaveURL(new RegExp(`/teams/${BOS}\\?.*season=2025-26`));
    const chart = page.locator("#depth-chart").getByRole("region", { name: "Roster allocations" });
    await expect(page.locator("#depth-chart .roster-team")).toContainText("56–26 · 3 players");
    await expect(chart.getByRole("region", { name: "Unassigned lane" }).locator(".roster-chip")).toHaveCount(3);
    for (const lane of ["PG", "SG", "SF", "PF", "C"]) await expect(chart.getByRole("region", { name: `${lane} lane` })).toContainText("Drop players here");
    // Required caveats stay rendered behind Why? (D14); no code-like rules in the main flow.
    await expect(page.locator("#depth-chart .ui-why-body")).toContainText("Missing participation is not a confirmed zero or roster exclusion.");
    await expect(page.locator("#depth-chart")).not.toContainText("game_date");
  });

  test("moves players by drag and by keyboard menu, with lane shares", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await mockTeam(page);
    await openWorkbench(page, depth);
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
    await openWorkbench(page, depth);
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

  test("depth chart on a phone stacks the board with 40px targets and no sideways scroll", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await mockTeam(page);
    await openWorkbench(page, depth);
    await expect(page.getByRole("region", { name: "Roster allocations" })).toBeVisible();
    const projected = page.locator("#depth-chart").getByRole("radio", { name: "Projected" });
    await projected.scrollIntoViewIfNeeded();
    await expect(projected).toBeVisible();
    // Sub-pixel tolerance: a settling transform can report 39.9999px for a 40px target.
    expect((await projected.boundingBox())!.height).toBeGreaterThanOrEqual(39.99);
    await projected.click();
    await expect(page.getByLabel("Projected minutes for Fixture Guard")).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    const heights = await page.locator(".roster-chip-menu > button").evaluateAll((els) => els.map((el) => el.getBoundingClientRect().height));
    expect(Math.min(...heights)).toBeGreaterThanOrEqual(39.99);
  });

  test("players with only reported non-appearances render unknown minutes, not a crash", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    const inactive = { player_id: "14", player_name: "Fixture Inactive", games_played: 0, total_minutes: null, pts_per_game: null, reb_per_game: null, ast_per_game: null };
    await page.route(`**/api/workbench/teams/${BOS}?*`, (route) => route.fulfill({ json: { ...detail, player_cohort: [...detail.player_cohort, inactive] } }));
    await openWorkbench(page, depth);
    const unassigned = page.getByRole("region", { name: "Roster allocations" }).getByRole("region", { name: "Unassigned lane" });
    await expect(unassigned.locator(".roster-chip")).toHaveCount(4);
    await expect(unassigned.locator(".roster-chip", { hasText: "Fixture Inactive" })).toContainText("— min · 0 GP");
    await page.getByRole("radio", { name: "Projected" }).click();
    await expect(unassigned.locator(".roster-chip", { hasText: "Fixture Inactive" })).toContainText("— min · 0 GP");
  });
});
