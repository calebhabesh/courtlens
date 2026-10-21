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

  test(`PC12 directory search preserves scope and keeps the identity column at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await openWorkbench(page, "/players");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Player Directory");
    await expect(page.locator(".directory-table tbody tr")).toHaveCount(2);
    await page.getByRole("button", { name: "Sort by PPG", exact: true }).click();
    await expect(page).toHaveURL(/sortDirection=desc/);
    await page.getByRole("button", { name: "Sort by PPG", exact: true }).click();
    await expect(page).toHaveURL(/sortDirection=asc/);
    await expect(page.getByRole("tablist", { name: "Stats sections" })).toHaveCount(0);
    if (width < 768) await page.getByRole("button", { name: /^Filters/ }).click();
    await page.getByRole("searchbox", { name: "Find player", exact: true }).fill("Star");
    await page.getByRole("button", { name: "Search", exact: true }).click();
    await expect(page.locator(".directory-table tbody tr")).toHaveCount(1);
    await expect(page).toHaveURL(/name=Star/);
    if (width < 768) await page.getByRole("button", { name: "Close drawer" }).click();
    await expect(page.locator(".directory-player a")).toHaveAttribute("href", /season=2025-26/);
    if (width < 768) {
      const identity = page.locator(".directory-player");
      const before = await identity.boundingBox();
      await page.getByRole("region", { name: "Player directory scroll area" }).evaluate(el => { el.scrollLeft = 400; });
      const after = await identity.boundingBox();
      expect(Math.abs(after!.x - before!.x)).toBeLessThan(2);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width);
  });
}
