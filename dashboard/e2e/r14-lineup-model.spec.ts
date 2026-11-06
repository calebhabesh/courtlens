import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { openWorkbench } from "./workbench-navigation";

// Real R14 API answers (e2e/fixtures/lineup-model*.json): the page must show them exactly.
const read = (name: string) => JSON.parse(readFileSync(`e2e/fixtures/lineup-model${name}.json`, "utf8"));
const fixture = read("");
const fit = read("-fit");
const alt = read("-fit-alt");
const results = fixture.results;
const path = "/research/lineup-model";

test.describe("R14 Lineup Model", () => {
  test.beforeEach(async ({ page }) => { await page.setViewportSize({ width: 1440, height: 900 }); });

  test("states the registered verdict and every test-season error exactly", async ({ page }) => {
    await openWorkbench(page, path);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Lineup Model");
    await expect(page.locator('[data-field="verdict-summary"]')).toContainText("(registered rule)");
    const table = page.getByRole("table", { name: "Stint margin error by test season" });
    for (const season of results.test_seasons) {
      const row = table.locator(`tr[data-row="${season}"]`);
      for (const model of ["lineup", "ridge", "home_only"]) {
        expect(Number(await row.locator(`[data-field="${model}"]`).getAttribute("data-value"))).toBe(results.models[model].seasons[season].wrmse);
      }
      const gain = row.locator('[data-field="gain"]');
      const g = results.gains.lineup_over_ridge.seasons[season];
      expect(Number(await gain.getAttribute("data-value"))).toBe(g.gain);
      expect(await gain.getAttribute("data-tone")).toBe(g.low > 0 ? "positive" : g.high < 0 ? "negative" : null);
    }
    const pooled = table.locator('tr[data-row="pooled"] [data-field="gain"]');
    expect(Number(await pooled.getAttribute("data-value"))).toBe(results.gains.lineup_over_ridge.pooled.gain);
    await expect(page.locator("circle[data-season]")).toHaveCount(results.test_seasons.length + 1);
  });

  test("the lineup tool opens on the most-used five and shows the served prediction", async ({ page }) => {
    await openWorkbench(page, path);
    const table = page.getByRole("table", { name: "Predicted net rating" });
    await expect(table.locator('tr[data-row="lineup_model"] [data-field="net"]')).toHaveAttribute("data-value", String(fit.lineup_model.net));
    await expect(table.locator('tr[data-row="ridge"] [data-field="net"]')).toHaveAttribute("data-value", String(fit.ridge.net));
    const five = page.getByRole("table", { name: "Players in this five" });
    await expect(five.locator("tbody tr")).toHaveCount(5);
    for (const p of fit.players) await expect(five.locator(`tr[data-row="${p.player_id}"]`)).toContainText(p.name);
    await expect(page.getByText("Example:")).toBeVisible();
  });

  test("changing a player puts the five in the URL and refetches", async ({ page }) => {
    await openWorkbench(page, path);
    const changed = alt.players.map((p: { player_id: string }) => p.player_id);
    const index = changed.findIndex((id: string, i: number) => id !== fit.players[i].player_id);
    await page.getByRole("combobox", { name: `Player ${index + 1}` }).selectOption(changed[index]);
    await expect(page).toHaveURL(new RegExp(`five=${changed.join("%2C")}|five=${changed.join(",")}`));
    const table = page.getByRole("table", { name: "Predicted net rating" });
    await expect(table.locator('tr[data-row="lineup_model"] [data-field="net"]')).toHaveAttribute("data-value", String(alt.lineup_model.net));
  });

  test("the similarity map draws every served point and says what it does not show", async ({ page }) => {
    await openWorkbench(page, path);
    await expect(page.locator("circle[data-player]")).toHaveCount(fixture.map.points.length);
    await expect(page.locator('[data-field="seed-stability"]')).toHaveAttribute("data-value", String(fixture.map.seed_stability.mean_overlap));
    await expect(page.getByText("the axes, directions and the distances between groups mean nothing")).toBeVisible();
  });

  test("shows the game backtest entry, credits and the registration", async ({ page }) => {
    await openWorkbench(page, path);
    const bt = page.getByRole("table", { name: "Game margin error, lineup backtest" });
    await expect(bt.locator("tbody tr")).toHaveCount(Object.keys(fixture.backtest.candidates).length);
    await expect(bt.locator('tr[data-row="lineup_model"] [data-field="rmse"]')).toHaveAttribute("data-value", String(fixture.backtest.candidates.lineup_model.pooled.rmse));
    for (const name of ["Rosenbaum", "Sill", "McInnes"]) await expect(page.getByText(new RegExp(name)).first()).toBeVisible();
    await expect(page.locator('[data-field="results-sha"]')).toHaveAttribute("data-value", results.results_sha256);
  });

  test("is in the Research menu under Models with an icon", async ({ page }) => {
    await openWorkbench(page, "/research/backtest");
    await page.getByRole("button", { name: "Research", exact: true }).click();
    const item = page.getByRole("menu", { name: "Research" }).getByRole("menuitem", { name: /Lineup Model/ });
    await expect(item).toBeVisible();
    await expect(item.locator("svg")).toBeVisible();
    await item.click();
    await expect(page).toHaveURL(url => url.pathname === path);
  });

  test("fits a phone width with no horizontal scroll", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await openWorkbench(page, path);
    await expect(page.getByRole("table", { name: "Predicted net rating" })).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);
  });
});
