import { expect, test } from "@playwright/test";
import { openWorkbench } from "./workbench-navigation";

// Databallr alignment, Stats instruction 5: readable definitions, calculation on request.
for (const width of [1440, 390]) {
  test(`Stats glossary filters, searches and reveals calculations at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await openWorkbench(page, "/stats");
    await page.getByRole("link", { name: "Stats Glossary", exact: true }).click();
    await expect(page).toHaveURL(/\/stats\/glossary$/);
    await expect(page.getByRole("heading", { level: 1, name: "Stats Glossary" })).toBeVisible();

    const cards = page.locator(".glossary-card");
    const all = await cards.count();
    expect(all).toBeGreaterThan(5);
    await expect(page.getByText("pts_per_game", { exact: true })).toHaveCount(0);

    await page.getByRole("button", { name: /^Shooting/ }).click();
    const shooting = await cards.count();
    expect(shooting).toBeGreaterThan(0);
    expect(shooting).toBeLessThan(all);
    await page.getByRole("button", { name: /^All Stats/ }).click();

    await page.getByRole("searchbox", { name: "Search definitions" }).fill("made basket");
    await expect(cards.first()).toContainText("Passes that directly lead to a made basket by a teammate");

    const description = cards.first().locator(".glossary-card-description");
    await expect(description).toHaveAttribute("aria-expanded", "false");
    await description.click();
    await expect(description).toHaveAttribute("aria-expanded", "true");
    await expect(cards.first().locator(".glossary-card-detail")).toContainText("Formula");
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width);

    await page.getByRole("button", { name: /^Back to Stats/ }).click();
    await expect(page).toHaveURL(/\/stats/);
  });
}
