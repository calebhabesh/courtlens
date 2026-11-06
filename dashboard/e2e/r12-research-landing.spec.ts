import { expect, test } from "@playwright/test";
import { RESEARCH_FACTS, evidenceUrl, fact } from "../lib/research-facts";
import { HEADLINE_CARDS } from "../lib/research-landing";
import { openWorkbench } from "./workbench-navigation";

// R12: the Research landing. Each card's number is a fact checked against its frozen result (Vitest)
// and against the served API (real-data check); R16 shows no number while its evaluation runs.
test.describe("R12 Research landing", () => {
  test("shows one card per headline result with its number, test seasons and evidence", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await openWorkbench(page, "/research");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Research");
    const cards = page.getByRole("list", { name: "Headline results" }).getByRole("listitem");
    await expect(cards).toHaveCount(HEADLINE_CARDS.length);
    for (const [index, card] of HEADLINE_CARDS.entries()) {
      const item = cards.nth(index);
      await expect(item).toContainText(`${card.block} · ${card.title}`);
      await expect(item.locator(`[data-tested="${card.id}"]`)).toHaveText(card.tested);
      await expect(item.getByRole("link", { name: card.title, exact: true })).toHaveAttribute("href", card.page);
      if (card.headline) {
        await expect(item.locator(`[data-fact="${card.headline.fact}"]`)).toHaveText(`${fact(card.headline.fact)}${card.headline.suffix ?? ""}`);
        await expect(item.locator(`[data-fact="${card.headline.fact}"]`)).toHaveAttribute("data-value", String(RESEARCH_FACTS[card.headline.fact].value));
        await expect(item.getByRole("link", { name: `${card.block} evidence` })).toHaveAttribute("href", evidenceUrl(card.evidence!));
      } else {
        await expect(item.locator('[data-status="in-progress"]')).toHaveText("Evaluation in progress");
        await expect(item.locator("[data-fact]")).toHaveCount(0);
      }
    }
  });

  test("lists every Research menu page and opens from the menu", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await openWorkbench(page, "/research/backtest");
    await page.getByRole("button", { name: "Research", exact: true }).click();
    const menu = page.getByRole("menu", { name: "Research" });
    await menu.getByRole("menuitem", { name: /^Research Overview/ }).click();
    await expect(page).toHaveURL(url => url.pathname === "/research");
    const pages = page.getByRole("list", { name: "Research pages" });
    for (const name of ["Win Probability", "Metric Backtest", "Shot Quality", "Learning", "Patch Notes"])
      await expect(pages.getByRole("link", { name, exact: true })).toBeVisible();
    await expect(pages.getByRole("link", { name: "Research Overview" })).toHaveCount(0);
  });

  test("fits a phone without horizontal overflow", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await openWorkbench(page, "/research");
    await expect(page.getByRole("list", { name: "Headline results" })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });
});
