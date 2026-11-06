import { expect, test } from "@playwright/test";
import { openWorkbench } from "./workbench-navigation";
import research from "./fixtures/research-negative-result.json";

for (const width of [1440, 390]) {
  for (const [name, path, chart] of [
    ["Forecasts", "/forecasts", ".pc12-headline .chart-pairs"],
    ["Shooting", "/research/shooting", ".pc12-headline .chart-reliability"],
    // RD00 round 3: the RAPM headline is an open region in the Research column, not the boxed .pc12-headline.
    ["RAPM", "/research/rapm", ".rapm-headline .chart-ranked"],
  ]) {
    test(`PC12 ${name} headline on first load at ${width}px`, async ({ page }) => {
      await page.setViewportSize({width, height: 900});
      await page.emulateMedia({reducedMotion: "reduce"});
      if (name === "Shooting") {
        await page.route("**/api/workbench/research/experiments", r => r.fulfill({json: [{experiment: research.run.experiment, status: research.run.status, run_id: research.run.run_id, protocol_sha256: research.run.protocol_sha256}]}));
        await page.route("**/api/workbench/research/runs?*", r => r.fulfill({json: [research.run]}));
        await page.route(`**/api/workbench/research/runs/${research.run.run_id}`, r => r.fulfill({json: research}));
      }
      await openWorkbench(page, path);
      await expect(page.locator(chart).first()).toBeVisible();
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
}
