import { expect, test } from "@playwright/test";
import { openWorkbench } from "./workbench-navigation";

test("the Stats move tooltip dates its NBA listing and source-reported trade", async ({ page }) => {
  await openWorkbench(page, "/stats");
  const chip = page.locator(".stats-player-link", { hasText: "Fixture Guard" });
  await expect(chip).toContainText("now");
  await expect(chip.locator('[title*="Now listed"]')).toHaveAttribute("title", /Index refreshed Oct 1, 2026\. Traded Sep 14, 2026 \(Basketball-Reference\)/);
});

for (const width of [1440, 390]) {
  test(`table counting controls use the kit size at ${width}`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    const height = width === 1440 ? 32 : 48;
    await openWorkbench(page, "/stats");
    expect(await page.getByRole("radiogroup", { name: "Counting Mode", exact: true }).evaluate(el => el.getBoundingClientRect().height)).toBe(height);
    await openWorkbench(page, "/players/23");
    for (const name of ["Counting Mode", "Phase"]) {
      const group = page.locator(".stats-controls-row").getByRole("radiogroup", { name, exact: true });
      expect(await group.evaluate(el => el.getBoundingClientRect().height)).toBe(height);
    }
  });
}
