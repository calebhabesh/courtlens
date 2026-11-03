import { expect, test } from "@playwright/test";
import { openWorkbench } from "./workbench-navigation";

// A Stats row keeps the team its games were played for; an active player now listed elsewhere
// gets a "now <team>" chip on the latest season (owner, Stats row; see lib/current-team.ts).
test("a player listed with a new team keeps his row's team and shows where he is now", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openWorkbench(page, "/stats");
  const moved = page.locator(".stats-table-row", { hasText: "Fixture Guard" });
  await expect(moved.locator(".player-cell-teams")).toContainText("BOS");
  // The chip takes the season label's place so it always fits the card.
  await expect(moved.locator(".player-cell-teams")).not.toContainText("2025-26");
  expect(await moved.locator(".player-cell-teams").evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
  const chip = moved.locator(".stats-team-move");
  await expect(chip).toHaveText("nowTOR");
  await expect(chip).toHaveAttribute("title", /Played 2025-26 for the Boston Celtics\. Now listed with the Toronto Raptors/);
  await expect(moved.locator(".stats-player-link")).toHaveAttribute("aria-label", "Fixture Guard, now with the Toronto Raptors");
  // Listed with the team he played for: no chip.
  await expect(page.locator(".stats-table-row", { hasText: "Fixture Star" }).locator(".stats-team-move")).toHaveCount(0);
});

test("the moved-team chip fits the narrow phone card", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openWorkbench(page, "/stats");
  const teams = page.locator(".stats-table-row", { hasText: "Fixture Guard" }).locator(".player-cell-teams");
  await expect(teams.locator(".stats-team-move")).toBeVisible();
  expect(await teams.evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
});

test("a multi-team row keeps its season and puts the chip on its own line", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  // The fixture API answers name=traded with Fixture Guard's season split BOS / MIA.
  await openWorkbench(page, "/stats?name=traded");
  const moved = page.locator(".stats-table-row", { hasText: "Fixture Guard" });
  await expect(moved.locator(".player-cell-teams")).toContainText("BOS / MIA");
  await expect(moved.locator(".player-cell-teams")).toContainText("2025-26");
  await expect(moved.locator(".player-cell-move-line .stats-team-move")).toHaveText("nowTOR");
  for (const line of [".player-cell-teams", ".player-cell-move-line"]) {
    expect(await moved.locator(line).evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
  }
  await moved.locator(".pinned-col-name").screenshot({ path: "test-results/multi-team-move.png" });
});
