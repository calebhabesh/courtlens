import { test, expect, type Page } from "@playwright/test";
import { openWorkbench } from "./workbench-navigation";

// PC11: former gate pages open on real (here: fictional mock) content with no URL parameters,
// keep their state in the URL, and EPV is removed with a redirect. Fixtures: e2e/pc11-fixtures.mjs.

async function noPhoneOverflow(page: Page) {
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.setViewportSize({ width: 1440, height: 900 });
}

test.describe("PC11 populated pages", () => {
  test("Defensive Matchups opens on a ranked headline, tiles, the focus defender and a shaded table", async ({ page }) => {
    await openWorkbench(page, "/research/defensive-matchups");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Defensive Matchups");
    await expect(page.getByRole("note")).toHaveCount(0); // no gate notice
    await expect(page.getByRole("list", { name: /Makes below expected/ }).getByRole("listitem")).toHaveCount(4);
    await expect(page.getByText("Most makes below expected (qualified)")).toBeVisible();
    await expect(page.getByRole("region", { name: "Defender table" })).toContainText("small sample");
    await page.getByRole("combobox", { name: "Shot category" }).selectOption("3-pointers");
    await expect(page).toHaveURL(/category=3-pointers/);
    await page.getByRole("combobox", { name: "Defender" }).selectOption("99002");
    await expect(page).toHaveURL(/playerId=99002/);
    await expect(page.getByRole("heading", { name: "Who Fixture Guard guarded" })).toBeVisible();
    await noPhoneOverflow(page);
  });

  test("Player Matchups switches sides and opens a matchup both ways", async ({ page }) => {
    await openWorkbench(page, "/matchups");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Player Matchups");
    // The default player says why it was chosen, once, under the slots.
    await expect(page.locator(".mu-default")).toHaveText(/^Shown by default · /);
    const table = page.getByRole("table", { name: "Defenders who guarded Fixture Anchor" });
    await expect(table).toBeVisible();
    await expect(table.getByRole("row", { name: /Fixture Wing D/ })).toContainText("3/8");
    // The name search filters the table locally, like the Stats table's.
    const search = table.getByRole("searchbox", { name: "Filter defenders by name" });
    await search.fill("wing");
    await expect(table.locator("tbody tr")).toHaveCount(1);
    await expect(table.locator("tbody tr")).toContainText("Fixture Wing D");
    await search.fill("nobody");
    await expect(table.locator("tbody")).toContainText("No defender matches");
    await table.getByRole("button", { name: "Clear name search" }).click();
    await expect(search).toHaveValue("");
    // The presets rank by PTS/100 above a possession floor the reader can change.
    await page.getByRole("radio", { name: "Scored Worst" }).click();
    await expect(page).toHaveURL(/sort=points_per_100&dir=asc/);
    await expect(table.locator("tbody tr").first()).toContainText("Fixture Rookie D");
    await page.getByRole("combobox", { name: "Minimum matchup possessions" }).selectOption("50");
    await expect(table.locator("tbody tr")).toHaveCount(3);
    await expect(table.locator("tbody tr").first()).toContainText("Fixture Big D");
    await page.getByRole("radio", { name: "Scored Best" }).click();
    await expect(table.locator("tbody tr").first()).toContainText("Fixture Wing D");
    await page.getByRole("radio", { name: "Most Matched" }).click();
    await page.getByRole("combobox", { name: "Minimum matchup possessions" }).selectOption("0");
    await expect(table.locator("tbody tr")).toHaveCount(4);
    // Sorting is local: GP ascending puts the fewest games first.
    await table.getByRole("button", { name: "Sort by GP" }).click();
    await expect(page).toHaveURL(/sort=games/);
    await table.getByRole("button", { name: "Sort by GP" }).click();
    await expect(page).toHaveURL(/dir=asc/);
    await expect(table.locator("tbody tr").first()).toContainText("Fixture Rookie D");
    // A row opens that matchup both ways; the unobserved direction is said, not zeroed.
    await table.locator("tbody tr", { hasText: "Fixture Wing D" }).locator("td").first().click();
    await expect(page).toHaveURL(/opponentId=99100/);
    const pair = page.getByRole("table", { name: "Fixture Anchor and Fixture Wing D, each guarded by the other" });
    // Each column names whose offense it holds and who was guarding.
    await expect(pair.getByRole("columnheader", { name: "Fixture Anchor On Offense Guarded By Fixture Wing D" })).toBeVisible();
    await expect(pair.getByRole("columnheader", { name: "Fixture Wing D On Offense Guarded By Fixture Anchor" })).toBeVisible();
    await expect(pair).toContainText("33.3");
    await expect(pair).toContainText("unobserved, not zero");
    await page.getByRole("button", { name: "Clear matchup player" }).click();
    await expect(page).not.toHaveURL(/opponentId=/);
    await page.getByRole("radio", { name: "Guarding" }).click();
    await expect(page).toHaveURL(/side=defense/);
    await expect(page.getByRole("table", { name: "Players Fixture Anchor guarded" })).toBeVisible();
    // On defense, best means opponents scored least: the lowest PTS/100 first.
    await page.getByRole("radio", { name: "Defended Best" }).click();
    await expect(page).toHaveURL(/sort=points_per_100/);
    await expect(page).toHaveURL(/dir=asc/);
    await noPhoneOverflow(page);
  });

  test("Adjusted Shooting ranks play-type-adjusted scoring and breaks down the focus player", async ({ page }) => {
    await openWorkbench(page, "/research/shooting/adjusted");
    await expect(page.getByRole("link", { name: "Adjusted Shooting" })).toHaveAttribute("aria-current", "page");
    await expect(page.getByRole("figure", { name: /Points per 100 above the play-type expectation/ })).toBeVisible();
    await expect(page.getByRole("region", { name: "Play-type breakdown table" })).toContainText("Spot-up");
    await page.getByRole("button", { name: "Fixture Guard" }).click();
    await expect(page).toHaveURL(/playerId=99002/);
    await page.getByRole("radio", { name: "Defense" }).click();
    await expect(page).toHaveURL(/side=defensive/);
    await expect(page).not.toHaveURL(/playerId=/);
    await noPhoneOverflow(page);
  });

  test("Six-Factor ranks one factor at a time with shaded percentiles", async ({ page }) => {
    await openWorkbench(page, "/research/rapm/six-factor");
    await expect(page.getByRole("figure", { name: /Offensive shooting \(oTS\), top 15/ })).toBeVisible();
    await expect(page.getByRole("region", { name: "Six-factor ratings" }).locator(".chart-percentile-cell").first()).toBeVisible();
    await page.getByRole("radio", { name: "Defense" }).click();
    await expect(page).toHaveURL(/factor=d_ts/);
    await expect(page.getByRole("figure", { name: /Shooting defense \(dTS\)/ })).toBeVisible();
    await noPhoneOverflow(page);
  });

  test("Combine opens on the latest class with unknown drills and identities kept unknown", async ({ page }) => {
    await openWorkbench(page, "/wingspan");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Combine & Wingspan");
    await expect(page.getByRole("img", { name: /Wingspan versus barefoot height for 4 players, 2026 combine/ })).toBeVisible();
    const table = page.getByRole("region", { name: "Combine measurement table" });
    await expect(table).toContainText("Identity unknown");
    await expect(table.getByRole("row", { name: /Fixture Big/ })).toContainText("—");
    await page.getByRole("combobox", { name: "Draft class" }).selectOption("2025");
    await expect(page).toHaveURL(/draftYear=2025/);
    await noPhoneOverflow(page);
  });

  test("WOWY opens on the example duo and selects another pair from the team table", async ({ page }) => {
    await openWorkbench(page, "/wowy");
    await expect(page.getByText("Minutes leader's team, top duo by shared minutes")).toBeVisible();
    await expect(page.getByRole("list", { name: /Fixture Anchor and Fixture Wing/ }).getByRole("listitem")).toHaveCount(4);
    await page.getByRole("link", { name: "Fixture Wing · Fixture Guard" }).click();
    await expect(page).toHaveURL(/a=99001&b=99002/);
    await expect(page.getByRole("list", { name: /Fixture Wing and Fixture Guard/ })).toBeVisible();
    // A split under the sample rule is not compared.
    await expect(page.getByText("Not compared: a split is under the sample rule")).toBeVisible();
    await noPhoneOverflow(page);
  });

  test("Stats has a Tracking tab with sortable, shaded columns", async ({ page }) => {
    await openWorkbench(page, "/stats/tracking");
    const tabs = page.getByRole("navigation", { name: "Stats sections" });
    await expect(tabs.getByRole("link", { name: "Tracking" })).toHaveAttribute("aria-current", "page");
    await expect(page.getByRole("figure", { name: /Drives per game, top 12/ })).toBeVisible();
    await page.getByRole("button", { name: "Drive FG%" }).click();
    await expect(page).toHaveURL(/sort=drive_fg_pct/);
    await expect(page.getByRole("figure", { name: /Drive FG%, top 12/ })).toBeVisible();
    await noPhoneOverflow(page);
  });
});

test("player profile gains a Tracking tab; a player with no combine record has no Combine tab", async ({ page }) => {
  await openWorkbench(page, "/players/23?tab=tracking");
  await expect(page.getByRole("tab", { name: "Tracking" })).toHaveAttribute("aria-selected", "true");
  const drives = page.getByRole("region", { name: "Drives" });
  await expect(drives).toContainText("12.0");
  await expect(drives.locator(".player-stat-pct", { hasText: "80" })).toHaveCount(1);
  await expect(page.getByRole("tab", { name: "Combine" })).toHaveCount(0);
});

test("EPV is removed: the route redirects to RAPM Research and leaves navigation", async ({ page }) => {
  await openWorkbench(page, "/research/epv?season=2025-26");
  await expect(page).toHaveURL(/\/research\/rapm\?season=2025-26/);
  await expect(page.getByRole("link", { name: "Spatial EPV" })).toHaveCount(0);
});
