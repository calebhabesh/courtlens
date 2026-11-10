import { expect, test } from "@playwright/test";
import { openWorkbench } from "./workbench-navigation";

for (const width of [1440, 390]) {
  for (const [name, path, chart] of [
    // RD16: Points Forecasts answers in a sentence and draws its models in the Research column, not the boxed .pc12-headline.
    // RD17: the Shooting page is gone; its sealed result is Shot Quality's earlier attempt (r05-shot-quality.spec.ts).
    // RD00 round 3: the RAPM headline is an open region in the Research column, not the boxed .pc12-headline. RD12 round 4: its leaders list is Research-native.
    ["RAPM", "/research/rapm", ".rapm-headline .rs-leaders-list"],
  ]) {
    test(`PC12 ${name} headline on first load at ${width}px`, async ({ page }) => {
      await page.setViewportSize({width, height: 900});
      await page.emulateMedia({reducedMotion: "reduce"});
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
