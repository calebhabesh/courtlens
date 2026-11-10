import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { openWorkbench } from "./workbench-navigation";

// The real R08 API answer (e2e/fixtures/metric-backtest.json): the page must show it exactly.
const fixture = JSON.parse(readFileSync("e2e/fixtures/metric-backtest.json", "utf8"));
const results = fixture.results;
const candidates: string[] = results.registration.parameters.candidates;
const baseline: string = results.registration.parameters.baseline;
const path = "/research/backtest";
type Row = { candidate: string; reference: string; seasons: string[]; verdict: string; pooled: { rmse: { gain: number; low: number; high: number } }; per_season: Record<string, { rmse: { gain: number; low: number; high: number } }> };
type Group = { games: number; pairs: { candidate: string; reference: string; rmse: { gain: number; low: number; high: number } }[] };
/** A 2026-27 pair's gain with `a` first: the scorer can serve a pair either way round. */
const groupGain = (group: Group, a: string, b: string) => {
  const direct = group.pairs.find(p => p.candidate === a && p.reference === b);
  if (direct) return direct.rmse;
  const other = group.pairs.find(p => p.candidate === b && p.reference === a)!.rmse;
  return { gain: -other.gain, low: -other.high, high: -other.low };
};
const pairFor = (a: string, b: string): { pair: Row; sign: number } => {
  const direct = results.pairs.find((p: Row) => p.candidate === a && p.reference === b);
  return direct ? { pair: direct, sign: 1 } : { pair: results.pairs.find((p: Row) => p.candidate === b && p.reference === a), sign: -1 };
};

test.describe("R08 Metric Backtest (RD10 design)", () => {
  test.beforeEach(async ({ page }) => { await page.setViewportSize({ width: 1440, height: 900 }); });

  test("states the served verdict under a centred hero and shows every pooled score exactly", async ({ page }) => {
    await openWorkbench(page, path);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Metric Backtest");
    await expect(page.locator('[data-field="hero-meta"]')).toContainText("11,979 games");
    const verdict = page.locator('[data-field="verdict-summary"]');
    for (const best of results.verdict.best) await expect(verdict).toContainText(fixture.metrics[best].label);
    await expect(verdict).toContainText("tests ratings, not game forecasts");
    const pooled = page.getByRole("table", { name: "Pooled scores" });
    await expect(pooled.locator("tbody tr")).toHaveCount(candidates.length);
    expect(await pooled.locator("tbody tr").evaluateAll(rows => rows.map(r => (r as HTMLElement).dataset.row))).toEqual(candidates);
    for (const name of candidates) {
      const row = pooled.locator(`tr[data-row="${name}"]`);
      for (const field of ["rmse", "accuracy", "brier", "log_loss"]) {
        expect(Number(await row.locator(`[data-field="${field}"]`).getAttribute("data-value"))).toBe(results.candidates[name].pooled[field]);
      }
    }
    await expect(pooled.locator(`tr[data-row="${baseline}"] [data-field="replaced"]`)).toHaveText("—");
  });

  test("the head-to-head grid draws all 36 served gains in both directions, coloured only where the interval excludes zero", async ({ page }) => {
    await openWorkbench(page, path);
    const grid = page.getByRole("table", { name: "Head-to-head RMSE gains" });
    await expect(grid.locator("tbody tr")).toHaveCount(candidates.length);
    await expect(grid.locator('td[data-self="true"]')).toHaveCount(candidates.length);
    for (const a of candidates) for (const b of candidates) {
      if (a === b) continue;
      const { pair, sign } = pairFor(a, b);
      const want = sign === 1 ? pair.pooled.rmse : { gain: -pair.pooled.rmse.gain, low: -pair.pooled.rmse.high, high: -pair.pooled.rmse.low };
      const cell = grid.locator(`tr[data-row="${a}"] td[data-column="${b}"]`);
      expect(Number(await cell.getAttribute("data-value"))).toBe(want.gain);
      expect(Number(await cell.getAttribute("data-low"))).toBe(want.low);
      expect(Number(await cell.getAttribute("data-high"))).toBe(want.high);
      const tone = await cell.locator(".rs-grid-value").getAttribute("data-tone");
      expect(tone).toBe(want.low > 0 ? "good" : want.high < 0 ? "bad" : null);
    }
  });

  test("every score against a chosen metric says one shared verdict once and shows mixed verdicts by row", async ({ page }) => {
    await openWorkbench(page, `${path}?against=time_decay`);
    await expect(page.locator('[data-field="pairs"]')).toHaveAttribute("data-reference", "time_decay");
    const table = page.getByRole("table", { name: /Paired differences against/ });
    await expect(table.locator("tbody tr")).toHaveCount(candidates.length - 1);
    await expect(page.locator('[data-field="pairs-verdict"]')).toHaveAttribute("data-value", "reference_better");
    await expect(table.locator('[data-field="verdict"]')).toHaveCount(0);
    await expect(table.locator('tr[data-row="team_net"] [data-field="accuracy"] .rs-grid-value')).toHaveText(/^[+−]\d+\.\d pts$/);
    await page.getByRole("combobox", { name: "Compare against" }).selectOption("projected_impact");
    await expect(page).toHaveURL(/against=projected_impact/);
    await expect(page.locator('[data-field="pairs-verdict"]')).toHaveCount(0);
    await expect(page.getByRole("table", { name: /Paired differences against Projected Impact/ }).locator('tr[data-row="rapm_3y"] [data-field="verdict"]')).toHaveText("No ranking");
    for (const row of await page.getByRole("table", { name: /Paired differences against/ }).locator("tbody tr").all()) {
      const cell = row.locator('[data-field="rmse"]');
      const low = Number(await cell.getAttribute("data-low")), high = Number(await cell.getAttribute("data-high"));
      expect(await cell.locator(".rs-grid-value").getAttribute("data-tone")).toBe(low > 0 ? "good" : high < 0 ? "bad" : null);
    }
  });

  test("the season line draws the served per-season gain with its band and keeps zero on the axis", async ({ page }) => {
    await openWorkbench(page, path);
    const figure = page.locator('[data-chart="gain-by-season"]');
    await expect(figure.locator(".slc-dot")).toHaveCount(10);
    await expect(figure.locator('.slc-grid[data-zero]')).toHaveCount(1);
    const { pair, sign } = pairFor("time_decay", baseline);
    expect(sign).toBe(1);
    for (const season of pair.seasons) {
      const dot = figure.locator(`.slc-dot[data-season="${season.slice(2)}"]`);
      expect(Number(await dot.getAttribute("data-value"))).toBe(pair.per_season[season].rmse.gain);
      expect(Number(await dot.getAttribute("data-low"))).toBe(pair.per_season[season].rmse.low);
    }
    await page.getByRole("combobox", { name: "Metric charted", exact: true }).selectOption("projected_impact");
    await expect(page).toHaveURL(/metric=projected_impact/);
    await expect(figure.locator(".slc-dot")).toHaveCount(2);
    await page.getByRole("combobox", { name: "Metric charted against" }).selectOption("box_prior_rapm");
    await expect(page.locator('[data-field="single-season"]')).toContainText("2025-26");
    const grid = page.getByRole("table", { name: "Margin RMSE by season" });
    expect(Number(await grid.locator('tr[data-row="rapm_1y"] td[data-season="2025-26"]').getAttribute("data-value"))).toBe(results.candidates.rapm_1y.seasons["2025-26"].rmse);
    await expect(grid.locator('tr[data-row="projected_impact"] td[data-season="2016-17"]')).toHaveText("—");
  });

  test("the calibration plot draws the served bins for the chosen metric and Team net, in category tints", async ({ page }) => {
    await openWorkbench(page, `${path}?cal=rapm_1y`);
    const block = page.locator('[data-chart="calibration"]');
    await expect(block).toHaveAttribute("data-metric", "rapm_1y");
    const measured = (name: string) => results.candidates[name].calibration_curve.bins.filter((b: { games: number }) => b.games > 0);
    await expect(block.locator('g[data-series="0"]')).toHaveCount(measured("rapm_1y").length);
    await expect(block.locator('g[data-series="1"]')).toHaveCount(measured(baseline).length);
    await expect(block.locator('g[data-series="0"]').first()).toHaveAttribute("fill", "var(--color-category-3)");
    const first = results.candidates.rapm_1y.calibration_curve.bins[0];
    await expect(block.locator('tr[data-row="0"] [data-field="chosen-games"]')).toHaveAttribute("data-value", String(first.games));
    await expect(block.locator('[data-field="ece-chosen"]')).toHaveAttribute("data-value", String(results.candidates.rapm_1y.calibration_curve.ece));
  });

  test("reads the served 2026-27 games, keeping prospective and hindsight apart", async ({ page }) => {
    await openWorkbench(page, path);
    const summary = fixture.prospective.summary;
    await expect(page.locator('[data-field="prospective-games"]')).toHaveAttribute("data-value", String(summary.prospective.games));
    const prospective = page.getByRole("table", { name: "Prospective 2026-27 games" });
    for (const [group, table] of [[summary.prospective, prospective], [summary.hindsight, page.getByRole("table", { name: "Hindsight 2026-27 games" })]] as const) {
      await expect(table.locator("tbody tr")).toHaveCount(candidates.length);
      for (const name of candidates.filter(n => n !== baseline)) {
        const want = groupGain(group, name, baseline);
        const cell = table.locator(`tr[data-row="${name}"] [data-field="gain"]`);
        expect(Number(await cell.getAttribute("data-value"))).toBe(want.gain);
        expect(await cell.locator(".rs-grid-value").getAttribute("data-tone")).toBe(want.low > 0 ? "good" : want.high < 0 ? "bad" : null);
      }
    }
    await expect(prospective.locator(`tr[data-row="${baseline}"] [data-field="replaced"]`)).toHaveText("—");
  });

  test("says so when no prospective game has been scored, and leaves gains out below the interval minimum", async ({ page }) => {
    const empty = structuredClone(fixture); empty.prospective.summary.prospective = { games: 0 };
    await page.route("**/api/metric-backtest", route => route.fulfill({ json: empty }));
    await openWorkbench(page, path);
    await expect(page.locator('[data-field="prospective-empty"]')).toBeVisible();
    await expect(page.getByRole("table", { name: "Prospective 2026-27 games" })).toHaveCount(0);
    const few = structuredClone(fixture); few.prospective.summary.prospective.games = 5; delete few.prospective.summary.prospective.pairs;
    await page.unroute("**/api/metric-backtest");
    await page.route("**/api/metric-backtest", route => route.fulfill({ json: few }));
    await page.reload();
    await expect(page.locator('[data-field="prospective-intervals"]')).toBeVisible();
    await expect(page.getByRole("table", { name: "Prospective 2026-27 games" }).locator('[data-field="gain"]')).toHaveCount(0);
  });

  test("keeps the DARKO line visible, the definitions collapsed, and credits the methods", async ({ page }) => {
    await openWorkbench(page, path);
    await expect(page.locator('[data-field="darko-line"]')).toBeVisible();
    await expect(page.locator("#glossary details")).not.toHaveAttribute("open");
    await page.locator("#glossary summary").click();
    await expect(page.locator("dt", { hasText: /^DARKO$/ })).toBeVisible();
    for (const credit of ["Dan Rosenbaum", "Joe Sill", "CourtLens's own"]) await expect(page.getByText(credit, { exact: false }).filter({ visible: true }).first()).toBeVisible();
    await expect(page.locator("#about details")).not.toHaveAttribute("open");
    await page.locator("#about summary").click();
    await expect(page.getByText("Actual minutes, on purpose.")).toBeVisible();
    await expect(page.locator('[data-field="results-sha"]')).toHaveAttribute("data-value", results.results_sha256);
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
