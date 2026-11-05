import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { openWorkbench } from "./workbench-navigation";

// The real R08 API answer (e2e/fixtures/metric-backtest.json): the page must show it exactly.
const fixture = JSON.parse(readFileSync("e2e/fixtures/metric-backtest.json", "utf8"));
const results = fixture.results;
const candidates: string[] = results.registration.parameters.candidates;
const path = "/research/backtest";

test.describe("R08 Metric Backtest", () => {
  test.beforeEach(async ({ page }) => { await page.setViewportSize({ width: 1440, height: 900 }); });

  test("states the registered verdict and shows every pooled score exactly", async ({ page }) => {
    await openWorkbench(page, path);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Metric Backtest");
    const verdict = page.locator('[data-field="verdict-summary"]');
    for (const best of results.verdict.best) await expect(verdict).toContainText(fixture.metrics[best].label);
    const pooled = page.getByRole("table", { name: "Pooled scores" });
    await expect(pooled.locator("tbody tr")).toHaveCount(candidates.length);
    for (const name of candidates) {
      const row = pooled.locator(`tr[data-row="${name}"]`);
      for (const field of ["rmse", "accuracy", "brier", "log_loss"]) {
        expect(Number(await row.locator(`[data-field="${field}"]`).getAttribute("data-value"))).toBe(results.candidates[name].pooled[field]);
      }
    }
  });

  test("the chart toggles metrics in the URL and its points equal the served season errors", async ({ page }) => {
    await openWorkbench(page, path);
    const points = page.locator("circle[data-candidate]");
    await expect(page.locator('g[data-series="time_decay"] circle')).toHaveCount(10);
    await page.getByRole("group", { name: "Metrics shown" }).getByRole("button", { name: /RAPM 3Y/ }).click();
    await expect(page).toHaveURL(/show=/);
    await expect(page.locator('g[data-series="rapm_3y"] circle')).toHaveCount(results.candidates.rapm_3y.test_seasons.length);
    for (const point of await points.all()) {
      const name = (await point.getAttribute("data-candidate"))!;
      const season = (await point.getAttribute("data-season"))!;
      expect(Number(await point.getAttribute("data-value"))).toBe(results.candidates[name].seasons[season].rmse);
    }
  });

  test("paired differences follow the served verdicts, with green or red only when the interval excludes zero", async ({ page }) => {
    await openWorkbench(page, `${path}?against=time_decay`);
    const table = page.getByRole("table", { name: /Paired differences against/ });
    await expect(table).toHaveAttribute("data-reference", "time_decay");
    await expect(table.locator("tbody tr")).toHaveCount(candidates.length - 1);
    for (const row of await table.locator("tbody tr").all()) {
      const cell = row.locator('[data-field="rmse"]');
      const low = Number(await cell.getAttribute("data-low"));
      const high = Number(await cell.getAttribute("data-high"));
      const tone = await cell.getAttribute("data-tone");
      expect(tone).toBe(low > 0 ? "positive" : high < 0 ? "negative" : null);
    }
    await expect(table.locator('tr[data-row="team_net"] [data-field="verdict"]')).toHaveText("Worse");
  });

  test("lists the 2026-27 games apart, names DARKO's omission and credits the methods", async ({ page }) => {
    await openWorkbench(page, path);
    await expect(page.locator('[data-field="prospective-games"]')).toHaveAttribute("data-value", String(fixture.prospective.summary.prospective.games));
    await expect(page.getByText("Left out: DARKO")).toBeVisible();
    for (const credit of ["Dan Rosenbaum", "Joe Sill", "CourtLens's own"]) await expect(page.getByText(credit, { exact: false }).filter({ visible: true }).first()).toBeVisible();
    await expect(page.getByText("Actual minutes, on purpose.")).toBeVisible();
  });

  test("is in the Research menu under Impact with an icon", async ({ page }) => {
    await openWorkbench(page, "/research/projected-impact");
    await page.getByRole("button", { name: "Research", exact: true }).click();
    const item = page.getByRole("menu", { name: "Research" }).getByRole("menuitem", { name: /Metric Backtest/ });
    await expect(item).toBeVisible();
    await expect(item.locator("svg")).toBeVisible();
    await item.click();
    await expect(page).toHaveURL(url => url.pathname === path);
  });

  test("fits a phone without sideways page scroll", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await openWorkbench(page, path);
    await expect(page.getByRole("table", { name: "Pooled scores" })).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);
  });
});
