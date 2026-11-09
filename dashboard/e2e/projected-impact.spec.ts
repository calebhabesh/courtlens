import { readFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";
import type { PlayerDetail, ProjectedImpactPage, ScoreGroup } from "../lib/projected-impact";

// Real answers of the frozen projections' API, cut to a few rows.
const { page: data, players: details }: { page: ProjectedImpactPage; players: Record<string, PlayerDetail> } =
  JSON.parse(readFileSync("e2e/fixtures/projected-impact-page.json", "utf8"));

const signed = (value: number, digits: number) => { const text = Math.abs(value).toFixed(digits); return Number(text) === 0 ? text : `${value > 0 ? "+" : "−"}${text}`; };

test("Projected Impact: the answer, the test, honest limits, credit and hashes", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/research/projected-impact");
  await expect(page.getByRole("heading", { name: "Does it beat carrying last season forward?" })).toBeVisible();
  await expect(page.locator('[data-field="answer"]')).toContainText("edge over time-decay RAPM is small");
  const players = page.getByRole("table", { name: "Final test, players" });
  await expect(players).toContainText("The frozen model");
  await expect(players).toContainText("Carry-forward");
  await expect(page.getByRole("table", { name: "Final test, games" })).toContainText("Winner picked");
  await expect(page.getByText("The selection didn't pick the best test model.").filter({ visible: true })).toBeVisible();
  await expect(page.locator('[data-field="groups-line"]')).toContainText("Neither group shows a clear gain");
  await expect(page.locator('[data-field="coverage-line"]')).toContainText("They ran wide");
  await expect(page.getByRole("table", { name: "Interval coverage" })).toContainText("No RAPM last season");
  await expect(page.locator('[data-chart="aging"]').getByRole("img")).toBeVisible();
  // About is collapsed, and its body stays in the page.
  await expect(page.locator("#about details")).not.toHaveAttribute("open");
  await page.locator("#about summary").click();
  await expect(page.locator('[data-field="projections-sha"]')).toHaveAttribute("data-value", data.model.projections_sha256);
  await expect(page.locator('[data-field="credit"]')).toContainText("DARKO (Kostya Medvedovsky) and EPM (Taylor Snarr)");
  // No verdicts from overlapping intervals, and no project wording.
  await expect(page.getByText(/better player/i)).toHaveCount(0);
  await expect(page.locator(".pi-page")).not.toContainText(/\bF1\b|owner waived|the plan's/i);
});

test("Projected Impact: a season switch changes the test tables", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/research/projected-impact");
  const games = page.locator('[data-field="test-games"]');
  await expect(games).toHaveAttribute("data-value", String(data.card.test.pooled.game.games));
  await page.getByRole("radiogroup", { name: "Test seasons" }).getByRole("radio", { name: "2025-26" }).click();
  await expect(page).toHaveURL(/testSeason=2025-26/);
  await expect(games).toHaveAttribute("data-value", String(data.card.test.seasons["2025-26"].game.games));
});

test("Projected Impact: pre-freeze games are hindsight, never prospective", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/research/projected-impact");
  await expect(page.locator('[data-field="hindsight-games"]')).toHaveAttribute("data-value", String(data.scorecard!.hindsight.games));
  await expect(page.locator('[data-field="prospective-games"]')).toHaveAttribute("data-value", String(data.scorecard!.prospective.games));
  await expect(page.locator('[data-field="prospective-empty"]')).toBeVisible();
  const hindsight = page.getByRole("table", { name: "Hindsight 2026-27 games" });
  await expect(hindsight).toBeVisible();
  // Hindsight is never coloured, even where its interval excludes zero.
  await expect(hindsight.locator("[data-tone]")).toHaveCount(0);
});

// The real score has no prospective games until the first scheduled run, so these two states use the served hindsight block as their numbers.
async function withProspective(page: Page, prospective: ScoreGroup) {
  await page.route("**/api/projected-impact", route => route.fulfill({ json: { ...data, scorecard: { ...data.scorecard, prospective } }, headers: { "access-control-allow-origin": "*" } }));
}

test("Projected Impact: prospective games are coloured where an interval excludes zero", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await withProspective(page, { ...data.scorecard!.hindsight, games: 25 });
  await page.goto("/research/projected-impact");
  const table = page.getByRole("table", { name: "Prospective 2026-27 games" });
  await expect(table.locator('tr[data-row="lightgbm"] td[data-column="over_carry_forward"] [data-tone="good"]')).toBeVisible();
  await expect(page.locator('[data-field="prospective-games"]')).toHaveAttribute("data-value", "25");
  await expect(page.locator('[data-field="prospective-empty"]')).toHaveCount(0);
  // Hindsight stays uncoloured beside it.
  await expect(page.getByRole("table", { name: "Hindsight 2026-27 games" }).locator("[data-tone]")).toHaveCount(0);
});

test("Projected Impact: under 20 prospective games show scores and say why there are no gains", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await withProspective(page, { games: 5, ratings: data.scorecard!.hindsight.ratings, unprojected_minutes_share: 0 });
  await page.goto("/research/projected-impact");
  await expect(page.locator('[data-field="prospective-intervals"]')).toHaveText("Gains start at 20 games.");
  const table = page.getByRole("table", { name: "Prospective 2026-27 games" });
  await expect(table.locator('tr[data-row="lightgbm"] td[data-column="rmse"]')).toBeVisible();
  await expect(table.locator('td[data-column="over_carry_forward"]')).toHaveCount(0);
});

test("Projected Impact: filters, intervals and the Why card", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/research/projected-impact");
  const board = page.getByRole("table", { name: "Projected impact" });
  const roster = data.players.filter(row => row.on_roster);
  await expect(board.locator("tbody tr")).toHaveCount(roster.length);
  const first = roster[0];
  await expect(board.locator("tbody tr").first()).toContainText(first.name);
  await expect(board.locator("tbody tr").first()).toContainText(`${signed(first.low, 1)} to ${signed(first.high, 1)}`);
  await expect(page.locator(`[data-player="${first.player_id}"]`)).toContainText(first.name);
  await page.getByRole("radiogroup", { name: "Players" }).getByRole("radio", { name: "Rookies and returners" }).click();
  await expect(board).toContainText("Rookie");
  const rookie = data.players.find(row => row.group === "rookie" && details[row.player_id])!;
  await board.getByRole("button", { name: `Why ${rookie.name} is projected here` }).click();
  await expect(page).toHaveURL(new RegExp(`player=${rookie.player_id}`));
  await expect(page.locator("#contributions").filter({ visible: true }).locator(`[data-player="${rookie.player_id}"]`)).toContainText(rookie.name);
  // A rookie has no carry-forward of their own: the tile says what the value is.
  await expect(page.locator('[data-rating="carry_forward"]')).toContainText("Group average");
});

test("Projected Impact: the player search and its clear button", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/research/projected-impact");
  const section = page.locator("#contributions").filter({ visible: true });
  await section.getByRole("button", { name: "Clear" }).click();
  await expect(page).toHaveURL(/player=none/);
  await expect(section).toContainText("No player chosen.");
  await section.getByRole("button", { name: "Open the default player" }).click();
  await expect(page).not.toHaveURL(/player=/);
  const first = data.players.find(row => row.on_roster)!;
  await expect(section.locator(`[data-player="${first.player_id}"]`)).toBeVisible();
});

test("Projected Impact: no sideways overflow on a phone, projection on screen", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/research/projected-impact");
  await expect(page.getByRole("heading", { name: "2026-27 projected RAPM, points per 100 possessions" })).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
  const cell = page.getByRole("table", { name: "Projected impact" }).locator('td[data-column="projection"]').first();
  const box = (await cell.boundingBox())!;
  expect(box.x + box.width).toBeLessThanOrEqual(390);
});

test("Projected Impact: a player with no frozen row is stated, not guessed", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/research/projected-impact?player=not-a-player");
  await expect(page.locator("#contributions").filter({ visible: true })).toContainText("No contributions for this player.");
});
