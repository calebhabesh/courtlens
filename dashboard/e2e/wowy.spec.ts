// WOWY (alignment row 5): Select Team on arrival, Add / Compare / Always on / Always off, the lineup table, tabs,
// filters in the URL and the late-response guard. Fictional fixtures built from the request.
import { expect, test, type Page, type Route } from "@playwright/test";
import { openWorkbench } from "./workbench-navigation";

const ROSTER = [
  ["99001", "Fixture Anchor"], ["99002", "Fixture Wing"], ["99003", "Fixture Guard"], ["99004", "Fixture Big"], ["99005", "Fixture Sixth"],
].map(([player_id, name], i) => ({ player_id, name, games: 60 - i, minutes: 2000 - i * 250 }));
const NAMES = Object.fromEntries(ROSTER.map(p => [p.player_id, p.name]));
const interval = { lower: null, upper: null, games: 20, reason: "fixture" };

function cell(key: string, present: string[], absent: string[], minutes: number, net: number) {
  return {
    key, present, absent, games: 20, stints: 40, minutes, offensive_possessions: minutes * 2, defensive_possessions: minutes * 2,
    sample_status: minutes >= 100 ? "available" : "insufficient_sample",
    offensive_rating: 112 + net / 2, defensive_rating: 112 - net / 2, net_rating: net, net_interval: interval,
    factors: { efg_pct: 54, tov_pct: 12, oreb_pct: 25, ft_rate: 22, fg3_pct: 36, fg3a_rate: 40, opp_efg_pct: 53, opp_tov_pct: 13, dreb_pct: 74, opp_ft_rate: 20, opp_fg3_pct: 35, opp_fg3a_rate: 39, ts_pct: 58, opp_ts_pct: 57, tov_100: 13, opp_tov_100: 14 },
    teammates: [{ player_id: "99005", minutes: minutes / 2, share: 50, dpm: 1.5, o_dpm: 1, d_dpm: 0.5 }],
    teammate_help: { players: 1, net: 1.5, offense: 1, defense: 0.5, coverage: 100 },
  };
}

export function wowyFixture(url: URL, team = "TOR") {
  const combo = url.searchParams.getAll("combo");
  const masks = Array.from({ length: combo.length ? 2 ** combo.length : 0 }, (_, mask) => mask);
  return {
    operation_version: "courtlens-wowy-combos-v1",
    context: { season: url.searchParams.get("season") ?? "2025-26", phase: "regular_season", stint_dataset_id: "fixture" },
    request: { combo, on: url.searchParams.getAll("on"), off: url.searchParams.getAll("off"), vs_team: null, vs_player: null, vs_state: "on" },
    team_id: url.searchParams.get("team_id") ? team : null,
    available_scopes: [{ season: "2025-26", phase: "regular_season" }, { season: "2024-25", phase: "regular_season" }],
    coverage_status: url.searchParams.get("team_id") ? "available" : "source_blocked",
    expected_games: 82, observed_games: 82, excluded_stints: 0, first_game: "2025-10-21", last_game: "2026-04-12",
    roster: url.searchParams.get("team_id") ? ROSTER : [], names: NAMES,
    league_rating: 112.3,
    league_factors: { ts_pct: 57.5, tov_100: 13.5, oreb_pct: 26, fg3_pct: 36 },
    darko_as_of: "2026-04-12",
    opponents: url.searchParams.get("tier") ? [{ team_id: "1610612738", tricode: "BOS", rank: 1, value: 105.2 }] : [],
    cells: masks.map(mask => cell(
      combo.map((_, i) => mask & (1 << i) ? "0" : "1").join(""),
      combo.filter((_, i) => !(mask & (1 << i))), combo.filter((_, i) => mask & (1 << i)), 800 / (mask + 1), 6 - mask * 3)),
    shifts: combo.map((player_id, i) => ({ player_id, on_minutes: 1500, off_minutes: 400, on_net: 4, off_net: -2, net_difference: i ? null : 6, offense_difference: i ? null : 3.5, defense_difference: i ? null : -2.5, interval })),
    total: url.searchParams.get("team_id") ? cell("all", [], [], 1900, 2.5) : null,
    input_hash: "fixture", evidence_hash: "fixture-evidence", limitations: ["Fixture limitation."],
  };
}

async function mockWowy(page: Page, hold?: (url: URL) => Promise<void>) {
  await page.route("**/api/workbench/operations/wowy-combos*", async (route: Route) => {
    const url = new URL(route.request().url());
    await hold?.(url);
    await route.fulfill({ json: wowyFixture(url) }).catch(() => {});
  });
}

test("WOWY is a top-level link that opens on Select Team", async ({ page }) => {
  await mockWowy(page);
  await openWorkbench(page, "/stats");
  await page.getByRole("navigation", { name: "Workspace Navigation" }).getByRole("link", { name: "WOWY", exact: true }).click();
  await expect(page).toHaveURL(/\/wowy$/);
  const dialog = page.getByRole("dialog", { name: "Select Team" });
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "Toronto Raptors" }).click();
  await expect(page).toHaveURL(/team=TOR/);
  await expect(page.getByRole("region", { name: "Players" })).toContainText("Fixture Anchor");
  await expect(page.getByText("Add up to five players to compare every lineup with and without them")).toBeVisible();
});

test("Added players are compared; Always on holds for every row; tabs swap the columns", async ({ page }) => {
  await mockWowy(page);
  await openWorkbench(page, "/wowy?team=TOR");
  const players = page.getByRole("region", { name: "Players" });
  // Add compares a player; a role picker then appears on their row.
  await players.getByRole("button", { name: "Add Fixture Anchor" }).click();
  await players.getByRole("button", { name: "Add Fixture Wing" }).click();
  await players.getByRole("button", { name: "Add Fixture Guard" }).click();
  await players.getByRole("radiogroup", { name: "Fixture Guard role" }).getByRole("radio", { name: "Always on" }).click();
  await expect(players.getByRole("group", { name: "Your lineups" })).toContainText("2 players compared: 4 lineup rows");
  await expect(page).toHaveURL(/combo=99001%2C99002|combo=99001,99002/);
  await expect(page).toHaveURL(/on=99003/);
  const matrix = page.getByRole("region", { name: "On/off combinations" });
  await expect(matrix.locator("tbody tr")).toHaveCount(4);
  await expect(page.getByRole("region", { name: "WOWY combos" })).toContainText("Fixture Guard on");
  // Each row shows its players: on first, the rest marked off.
  await expect(matrix.locator("tbody tr").nth(1).locator(".wowy-face[data-off]")).toHaveCount(1);
  await expect(matrix.getByRole("columnheader", { name: "Def" })).toBeVisible();
  // A lineup cell opens Databallr's lineup composition.
  await matrix.locator("tbody tr").first().getByRole("button").click();
  const composition = page.getByRole("dialog", { name: "Lineup Composition" });
  await expect(composition).toContainText("20 games");
  await expect(composition.getByRole("region", { name: "Teammate help" })).toContainText("+1.5 Net");
  await expect(composition.getByRole("region", { name: "Shared floor" })).toContainText("Fixture Sixth");
  await page.keyboard.press("Escape");
  await expect(composition).toBeHidden();
  await page.getByRole("radiogroup", { name: "Table view" }).getByRole("radio", { name: "Expanded" }).click();
  await expect(matrix.getByRole("columnheader", { name: "Opp eFG%" })).toBeVisible();
  await page.getByRole("radiogroup", { name: "Table view" }).getByRole("radio", { name: "Defense" }).click();
  await expect(page).toHaveURL(/tab=defense/);
  await expect(matrix.getByRole("columnheader", { name: "DREB%" })).toBeVisible();
  // Removing a player clears their role.
  await players.getByRole("button", { name: "Remove Fixture Guard" }).first().click();
  await expect(page).not.toHaveURL(/on=/);
});

test("Filters live in the URL and Reset clears them", async ({ page }) => {
  await mockWowy(page);
  await openWorkbench(page, "/wowy?team=TOR&combo=99001");
  const filters = page.getByRole("region", { name: "Filters" });
  await filters.getByRole("group", { name: "Game clock" }).getByRole("button", { name: "Last 5 of Q4 + OT" }).click();
  await expect(page).toHaveURL(/clock=clutch/);
  await filters.getByRole("switch", { name: "Exclude garbage time" }).click();
  await expect(page).toHaveURL(/garbage=1/);
  await filters.getByRole("radiogroup", { name: "Opponents" }).getByRole("radio", { name: "By Tier" }).click();
  await expect(page).toHaveURL(/tierMetric=defense&tier=top|tier=top/);
  await expect(filters.getByRole("list", { name: "Opponents in this tier" }).getByRole("listitem")).toHaveCount(1);
  await expect(page.getByRole("region", { name: "WOWY combos" })).toContainText("Last 5 of Q4 + OT · No garbage time · vs top 10 defenses");
  await filters.getByRole("button", { name: "Reset" }).click();
  await expect(page).not.toHaveURL(/clock=|garbage=|tier=/);
});

test("A late response for an earlier combination cannot replace the current one", async ({ page }) => {
  let release!: () => void;
  const held = new Promise<void>(resolve => { release = resolve; });
  let heldStarted = false;
  await mockWowy(page, async url => {
    if (url.searchParams.getAll("combo").length === 2) { heldStarted = true; await held; }
  });
  await openWorkbench(page, "/wowy?team=TOR&combo=99001");
  const matrix = page.getByRole("region", { name: "On/off combinations" });
  // One combo player: on, off, then Databallr's ON − OFF row.
  await expect(matrix.locator("tbody tr")).toHaveCount(3);
  await expect(matrix.locator(".wowy-onoff")).toContainText("On − Off");
  const players = page.getByRole("region", { name: "Players" });
  await players.getByRole("button", { name: "Add Fixture Wing" }).click();
  await expect.poll(() => heldStarted).toBe(true);
  await players.getByRole("button", { name: "Remove Fixture Wing" }).first().click();
  await expect(page).not.toHaveURL(/99002/);
  release();
  await page.waitForTimeout(250);
  await expect(matrix.locator("tbody tr")).toHaveCount(3);
});

test("WOWY fits a phone without page overflow", async ({ page }) => {
  await mockWowy(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await openWorkbench(page, "/wowy?team=TOR&combo=99001,99002");
  await expect(page.getByRole("region", { name: "On/off combinations" })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
