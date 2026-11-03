import { expect, test } from "@playwright/test";
import { openWorkbench } from "./workbench-navigation";

for (const width of [1440, 390]) {
  test(`Stats shows coloured percentile numbers, not shaded cells, at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await openWorkbench(page, "/stats");
    // Databallr alignment (Stats instruction 4): a small number under the value, yellow high → blue low.
    const cells = page.locator(".stats-table-row").first().locator(".chart-percentile-text");
    await expect(cells.first().locator(".stat-pct-sublabel")).toHaveText(/^\d+$/);
    expect(await cells.first().evaluate(el => getComputedStyle(el).backgroundColor)).toBe("rgba(0, 0, 0, 0)");
    const tones = await page.locator(".stats-table-row .stat-pct-sublabel").evaluateAll(labels => labels.map(label =>
      ({ pct: Number(label.textContent), color: getComputedStyle(label).color })));
    const high = tones.find(tone => tone.pct >= 90), low = tones.find(tone => tone.pct <= 30);
    if (high && low) expect(high.color).not.toBe(low.color);
    await expect(page.getByRole("group", { name: "Percentile shading from low to high" })).toHaveCount(0);
    await expect(page.locator(".stats-group-th")).toHaveCount(6);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width);
  });
}
