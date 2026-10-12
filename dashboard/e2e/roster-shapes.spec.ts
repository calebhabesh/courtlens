import { test, expect, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { openWorkbench } from "./workbench-navigation";
import { FINANCE_TEAMS } from "../lib/finance-teams";

// FO05 Roster Shapes prototype (D17/D18): logo-grid picker, depth chart, drag and menu moves,
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

// PC10 Roster Shapes: 30 team shapes on first load, Fullest / Best fit / A–Z, team detail with
// the FO05 depth chart as a tab. Unknown players are listed, never drawn as zero.
const clusters = ["Lead creator", "Spacing wing", "Two-way connector", "Stretch big", "Interior hub", "Rim runner"]
  .map((name, cluster) => ({ cluster, name, short: name.toLowerCase(), description: `${name} fixture`, color_token: `--color-category-${cluster + 1}` }));
const shapePlayer = (id: string, name: string, vor: number | null, fit: "returning" | "new" | "unknown", cluster: number | null) => ({
  player_id: id, player_name: name, listed_position: "G", value: vor === null ? null : vor * 2 - 2, value_qualified: true, value_percentile: 50,
  reference_minutes: vor === null ? null : 1968, reference_games: vor === null ? null : 60, vor,
  archetype: cluster === null ? null : { season: "2025-26", minutes: 1968, games: 60, small_sample: false, primary: cluster, primary_name: clusters[cluster].name, membership: [{ cluster, name: clusters[cluster].short, probability: 0.9 }] },
  fit, previous_teams: fit === "new" ? ["DAL"] : fit === "returning" ? ["X"] : [], unknown_reasons: vor === null ? ["No stints in the BPR window; value is unknown."] : []
});
function shapeTeam(team: { id: string; tricode: string; name: string }, index: number) {
  const roster = team.tricode === "BOS"
    ? [shapePlayer("11", "Fixture Guard", 6, "returning", 0), shapePlayer("12", "Fixture Wing", 2, "new", 1), shapePlayer("13", "Fixture Bench", -0.5, "returning", 2), shapePlayer("14", "Fixture Rookie", null, "unknown", null)]
    : [shapePlayer(`${team.tricode}1`, `${team.tricode} Starter`, 1 + index / 10, index % 2 ? "returning" : "new", index % 6)];
  const sized = roster.filter(p => p.vor !== null && p.vor > 0);
  const total = sized.reduce((sum, p) => sum + p.vor!, 0);
  const returning = sized.filter(p => p.fit === "returning").reduce((sum, p) => sum + p.vor!, 0);
  return { team_id: team.id, team_tricode: team.tricode, team_name: team.name, players: roster.length, sized_players: sized.length,
    below_replacement_players: roster.filter(p => p.vor !== null && p.vor <= 0).length, unknown_players: roster.filter(p => p.vor === null).length,
    total_vor: total, returning_share: total ? returning / total : null, archetype_mix: [], roster };
}
const shapes = {
  version: "courtlens-roster-shapes-v1", season: "2026-27", label: "2026-27 · projected", projected_note: "Projected: no 2026-27 minutes played yet.",
  reference_season: "2025-26", phase: "regular_season", replacement_level: -2, full_season_minutes: 3936, capacity: 8,
  value: { label: "Box-prior RAPM (BPR)", unit: "points per 100", artifact_sha256: "v".repeat(64), scope: { seasons: ["2024-25", "2025-26"], phase: "regular_season", cutoff: "2026-07-01" } },
  archetypes: { artifact_sha256: "a".repeat(64), names_status: "confirmed", clusters },
  roster_context: { dataset_id: "fixture-index", observed_at: "2026-10-11T22:43:18Z", source_url: "https://example.test", content_sha256: "c".repeat(64) },
  statistics_release_id: "fixture-release", credit: "Roster shape diagrams after Wyman diagrams by @taylormetrics.", limitations: ["Fixture limitation"],
  teams: FINANCE_TEAMS.map(shapeTeam)
};
async function mockShapes(page: Page) {
  await page.route("**/api/workbench/roster-shapes*", (route) => route.fulfill({ json: shapes }));
}

test.describe("PC10 Roster Shapes", () => {
  test("opens on 30 team shapes with a legend, pinned index and sorting", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await mockShapes(page);
    await openWorkbench(page, "/roster-shapes");
    await expect(page.getByRole("heading", { level: 1, name: "Roster Shapes" })).toBeVisible();
    await expect(page).toHaveURL(/index=fixture-index/);
    const grid = page.getByRole("list", { name: "Team roster shapes" });
    await expect(grid.getByRole("listitem")).toHaveCount(30);
    await expect(grid.getByRole("listitem").first()).toContainText("Boston Celtics");
    await expect(page.locator("main")).toContainText("Wyman diagrams by @taylormetrics");
    await expect(page.getByRole("region", { name: "How to read the shapes" })).toContainText("Interior hub");
    // Unknown and below-replacement players are listed, never drawn.
    const bos = grid.getByRole("listitem").first();
    await expect(bos.locator("[data-shape-id]")).toHaveCount(2);
    await expect(bos.locator('[data-shape-id="12"]')).toHaveAttribute("data-fit", "projected");
    await expect(bos).toContainText("1 unknown");

    await page.getByRole("radio", { name: "A–Z" }).click();
    await expect(page).toHaveURL(/sort=az/);
    await expect(grid.getByRole("listitem").first()).toContainText("Atlanta Hawks");
    await page.getByRole("radio", { name: "Best fit" }).click();
    await expect(page).toHaveURL(/sort=fit/);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);

    await grid.getByRole("link", { name: /^Boston Celtics/ }).click();
    await expect(page).toHaveURL(/\/roster-shapes\/BOS\?index=fixture-index/);
  });

  test("team detail shows the large shape, tiles and roster with unknowns kept", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await mockShapes(page);
    await mockTeam(page);
    await openWorkbench(page, "/roster-shapes/BOS");
    await expect(page.locator(".ui-stat-tile").first()).toContainText("8.0");
    await expect(page.locator(".ui-stat-tile").first()).toContainText("1st");
    const table = page.getByRole("region", { name: "Boston Celtics roster" });
    await expect(table.getByRole("row")).toHaveCount(5);
    await expect(table.getByRole("row", { name: /Fixture Rookie/ })).toContainText("Unknown");
    await expect(table.getByRole("row", { name: /Fixture Bench/ })).toContainText("below replacement");
    await expect(table.getByRole("row", { name: /Fixture Wing/ })).toContainText("DAL in 2025-26");
    await expect(page.getByRole("figure", { name: "Boston Celtics roster shape" }).locator("[data-shape-id]")).toHaveCount(2);

    await page.getByRole("link", { name: "Depth chart" }).click();
    await expect(page).toHaveURL(/view=depth/);
    await expect(page.getByRole("region", { name: "Roster allocations" })).toBeVisible();
  });

  test("old ?team= links open the depth chart tab", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await mockTeam(page);
    await openWorkbench(page, `/roster-shapes?team=${BOS}&season=2025-26&phase=regular_season`);
    await expect(page).toHaveURL(new RegExp(`/roster-shapes/${BOS}\\?.*view=depth`));
    const chart = page.getByRole("region", { name: "Roster allocations" });
    await expect(page.locator(".roster-team")).toContainText("56–26 · 3 players");
    await expect(chart.getByRole("region", { name: "Unassigned lane" }).locator(".roster-chip")).toHaveCount(3);
    for (const lane of ["PG", "SG", "SF", "PF", "C"]) await expect(chart.getByRole("region", { name: `${lane} lane` })).toContainText("Drop players here");
    // Required caveats stay rendered behind Why? (D14); no code-like rules in the main flow.
    await expect(page.locator(".ui-why-body")).toContainText("Missing participation is not a confirmed zero or roster exclusion.");
    await expect(page.locator("main")).not.toContainText("game_date");
    expect(await page.getByRole("button", { name: /^Load/ }).count()).toBe(0);
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
    // Sub-pixel tolerance: a settling transform can report 39.9999px for a 40px target.
    expect((await projected.boundingBox())!.height).toBeGreaterThanOrEqual(39.99);
    await projected.click();
    await expect(page.getByLabel("Projected minutes for Fixture Guard")).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    const heights = await page.locator(".roster-chip-menu .ui-menu-trigger").evaluateAll((els) => els.map((el) => el.getBoundingClientRect().height));
    expect(Math.min(...heights)).toBeGreaterThanOrEqual(39.99);
    await expect(page.getByRole("combobox", { name: "Choose team" })).toHaveValue("BOS");
  });

  test("players with only reported non-appearances render unknown minutes, not a crash", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    const inactive = { player_id: "14", player_name: "Fixture Inactive", games_played: 0, total_minutes: null, pts_per_game: null, reb_per_game: null, ast_per_game: null };
    await page.route(`**/api/workbench/teams/${BOS}?*`, (route) => route.fulfill({ json: { ...detail, player_cohort: [...detail.player_cohort, inactive] } }));
    await openWorkbench(page, `/roster-shapes?team=${BOS}`);
    const unassigned = page.getByRole("region", { name: "Roster allocations" }).getByRole("region", { name: "Unassigned lane" });
    await expect(unassigned.locator(".roster-chip")).toHaveCount(4);
    await expect(unassigned.locator(".roster-chip", { hasText: "Fixture Inactive" })).toContainText("— min · 0 GP");
    await page.getByRole("radio", { name: "Projected" }).click();
    await expect(unassigned.locator(".roster-chip", { hasText: "Fixture Inactive" })).toContainText("— min · 0 GP");
  });
});
