import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";
import type { PlayerDetail, ProjectedImpactPage } from "../lib/projected-impact";

// Real answers of the frozen projections' API, cut to a few rows.
const { page: data, players: details }: { page: ProjectedImpactPage; players: Record<string, PlayerDetail> } =
  JSON.parse(readFileSync("e2e/fixtures/projected-impact-page.json", "utf8"));

test("Projected Impact: result, frozen identity, intervals, negative results, credit", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/research/projected-impact");
  await expect(page.getByRole("heading", { name: "Does it beat carrying last season forward?" })).toBeVisible();
  const test = page.getByRole("region", { name: "Final test by rating" });
  await expect(test).toContainText("LightGBM (selected)");
  await expect(test).toContainText("Carry-forward");
  await expect(page.getByText(data.model.projections_sha256).first()).toBeVisible();
  await expect(page.getByText(data.model.version).first()).toBeVisible();
  await expect(page.getByRole("heading", { name: "What did not work" })).toBeVisible();
  await expect(page.getByText("The registered selection did not pick the best test model.").filter({ visible: true })).toBeVisible();
  await expect(page.getByText("The intervals ran wide and failed their registered check.").filter({ visible: true })).toBeVisible();
  await expect(page.getByRole("region", { name: "Interval coverage" })).toContainText("No RAPM last season");
  await expect(page.getByText(/DARKO \(Kostya Medvedovsky\) and EPM \(Taylor Snarr\)/).filter({ visible: true })).toBeVisible();
  await expect(page.getByRole("figure", { name: "Impact by age" })).toBeVisible();
  // No verdicts from overlapping intervals.
  await expect(page.getByText(/better player/i)).toHaveCount(0);
});

test("Projected Impact: pre-freeze games are hindsight, never prospective", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/research/projected-impact");
  const score = page.getByRole("region", { name: "Weekly score" });
  const row = (name: RegExp) => score.getByRole("row", { name });
  await expect(row(/Hindsight, before the freeze/)).toContainText(String(data.scorecard!.hindsight.games));
  await expect(row(/Prospective, after the freeze/).getByRole("cell").first()).toHaveText(String(data.scorecard!.prospective.games));
});

test("Projected Impact: leaderboard filters, and Why shows a player's contributions", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/research/projected-impact");
  const board = page.getByRole("region", { name: "Projected impact leaderboard" });
  await expect(board.getByRole("row")).toHaveCount(26);
  const first = data.players.find(row => row.on_roster)!;
  await expect(board.getByRole("row").nth(1)).toContainText(first.name);
  await expect(board.getByRole("row").nth(1)).toContainText(`${first.low > 0 ? "+" : ""}${first.low.toFixed(1)} to`);
  await expect(page.getByRole("figure", { name: "By source" })).toBeVisible();
  await page.getByRole("radiogroup", { name: "Players" }).getByRole("radio", { name: "Rookies and returners" }).click();
  await expect(board).toContainText("Rookie");
  const rookie = data.players.find(row => row.group === "rookie" && details[row.player_id])!;
  await board.getByRole("link", { name: `Why ${rookie.name} is projected here` }).click();
  await expect(page).toHaveURL(new RegExp(`player=${rookie.player_id}`));
  await expect(page.getByRole("region", { name: "Projected impact leaderboard" })).toBeVisible();
  await expect(page.locator("#contributions")).toContainText(rookie.name);
});

test("Projected Impact: no sideways overflow on a phone", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/research/projected-impact");
  await expect(page.getByRole("heading", { name: "2026-27 projections" })).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
  // The projection and its interval are visible without scrolling the table.
  const board = page.getByRole("region", { name: "Projected impact leaderboard" });
  const fits = await board.evaluate(element => element.scrollWidth <= element.clientWidth);
  expect(fits).toBe(true);
});

test("Projected Impact: a player with no frozen row is stated, not guessed", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/research/projected-impact?player=not-a-player");
  await expect(page.locator("#contributions")).toContainText("No contributions for this player.");
});
