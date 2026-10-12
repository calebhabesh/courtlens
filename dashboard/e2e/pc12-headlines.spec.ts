import { expect, test } from "@playwright/test";
import { openWorkbench } from "./workbench-navigation";
import { mockContracts } from "./finance-fixture";
import research from "./fixtures/research-negative-result.json";

for (const width of [1440, 390]) {
  for (const [name, path, chart] of [
    ["Teams", "/teams", ".pc12-headline .chart-ranked"],
    ["Team profile", "/teams/100", ".pc12-headline .chart-pairs"],
    ["Team Compare", "/team-compare", ".pc12-headline .chart-pairs"],
    ["Forecasts", "/forecasts", ".pc12-headline .chart-pairs"],
    ["Player trajectory", "/players/23", ".pc12-profile-trajectory .trend-svg"],
    ["Shooting", "/research/shooting", ".pc12-headline .chart-reliability"],
    ["RAPM", "/research/rapm", ".pc12-headline .chart-ranked"],
    ["Trends", "/research/trends", ".pc12-headline .chart-pairs"],
  ]) {
    test(`PC12 ${name} headline on first load at ${width}px`, async ({ page }) => {
      await page.setViewportSize({width, height: 900});
      await page.emulateMedia({reducedMotion: "reduce"});
      if (name === "Shooting") {
        await page.route("**/api/workbench/research/experiments", r => r.fulfill({json: [{experiment: research.run.experiment, status: research.run.status, run_id: research.run.run_id, protocol_sha256: research.run.protocol_sha256}]}));
        await page.route("**/api/workbench/research/runs?*", r => r.fulfill({json: [research.run]}));
        await page.route(`**/api/workbench/research/runs/${research.run.run_id}`, r => r.fulfill({json: research}));
      }
      if (name === "Trends") {
        const period = {label: "Observed window", mode: "appearances", start_date: "2026-03-01", end_date: "2026-03-15", appearances_count: 10, total_minutes: 320, stints: ["TOR"], metrics: {}, sample_counts: {}};
        await page.route("**/api/workbench/operations/compare-periods", r => r.fulfill({json: {operation_version: "fixture-v1", evidence_hash: "c".repeat(64), player_id: "23", player_name: "Fixture Star", season: "2025-26", phase: "regular_season", period_a: period, period_b: {...period, start_date: "2026-02-01", end_date: "2026-02-15"}, has_calendar_overlap: false, disclosures: ["Synthetic UI test inputs"], deltas: [{metric_key: "pts_per_game", display_name: "Points Per Game", period_a_value: 20, period_b_value: 18, absolute_delta: 2, percentage_delta: 11.1, period_a_n: 10, period_b_n: 10}, {metric_key: "ts_pct", display_name: "True Shooting %", period_a_value: .56, period_b_value: .5, absolute_delta: .06, percentage_delta: 12, period_a_n: 10, period_b_n: 10}]}}));
      }
      await openWorkbench(page, path);
      await expect(page.locator(chart).first()).toBeVisible();
      if (name === "Trends") {
        await expect(page).toHaveURL(/playerId=23/);
        await expect(page.getByRole("region", {name: "Headline result"})).toContainText("Example: Fixture Star");
        await page.getByRole("button", {name: "Change", exact: true}).click();
        await expect(page.getByRole("combobox", {name: "Target player", exact: true})).toBeFocused();
        if (width < 768) await page.getByRole("button", {name: "Close drawer"}).click();
      }
      const visual = await page.locator(chart).first().boundingBox();
      expect(visual!.y).toBeLessThan(800);
      const headline = page.getByRole("region", {name: "Headline result"});
      await expect(headline).toContainText("Source:");
      const firstTable = page.locator("main table").first();
      if (await firstTable.count()) expect((await firstTable.boundingBox())!.y).toBeGreaterThan(visual!.y);
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width);
      await page.evaluate(() => document.fonts.ready);
      await expect(page).toHaveScreenshot(`pc12-b-${name.toLowerCase().replaceAll(" ", "-")}-${width}.png`, {animations: "disabled", caret: "hide", maxDiffPixelRatio: .01});
      const duration = await page.locator(chart).first().evaluate(el => getComputedStyle(el).animationDuration);
      if (duration !== "0s") expect(parseFloat(duration)).toBeLessThanOrEqual(.001);
    });
  }
  test(`PC12 Others preserves the full Contracts roster at ${width}px`, async ({ page }) => {
    await page.setViewportSize({width, height: 900});
    await mockContracts(page);
    await openWorkbench(page, "/contracts/DEN");
    const flow = page.getByRole("figure", {name: "Where the known salary goes"});
    await expect(flow).toContainText("Others");
    await expect(flow).toContainText("Top five known roster salaries");
    await expect(page.getByRole("region", {name: "Roster contracts and impact"})).toContainText("Nikola Jokić");
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width);
    await expect(page).toHaveScreenshot(`pc12-b-contracts-${width}.png`, {animations: "disabled", caret: "hide", maxDiffPixelRatio: .01});
  });
}
