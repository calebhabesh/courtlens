import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { openWorkbench } from "./workbench-navigation";

// FO04 Player Showcase prototype (D15/D16) against the mock API's Stats query and cohort.
test.describe("FO04 Player Showcase", () => {
  test("board shows a ranked, percentile card with centered playback and one context line", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await openWorkbench(page, "/showcase");
    await expect(page.getByRole("heading", { level: 1, name: "Player Showcase" })).toBeVisible();
    const card = page.locator(".showcase-card-svg");
    await expect(card).toHaveAttribute("aria-label", /Fixture Star/);
    await expect(card).toContainText("2025-26 Regular Season · Through Jun 29, 2026");
    await expect(card).toContainText("1st");
    await expect(card).toContainText("75th pct");
    await expect(card).not.toContainText("game_date");
    expect(await page.getByRole("button", { name: /^Load/ }).count()).toBe(0);

    const centers = await page.evaluate(() => {
      const center = (selector: string) => { const r = document.querySelector(selector)!.getBoundingClientRect(); return r.left + r.width / 2; };
      return { main: center(".ui-board-main"), card: center(".showcase-card-frame"), playback: center(".showcase-playback") };
    });
    expect(Math.abs(centers.card - centers.main)).toBeLessThanOrEqual(2);
    expect(Math.abs(centers.playback - centers.card)).toBeLessThanOrEqual(2);

    const counter = page.locator(".showcase-counter");
    await expect(counter).toHaveText("1 / 2");
    await page.getByRole("button", { name: "Next player" }).click();
    await expect(counter).toHaveText("2 / 2");
    await expect(card).toHaveAttribute("aria-label", /Fixture Guard/);
    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
    await page.keyboard.press("ArrowRight");
    await expect(counter).toHaveText("1 / 2");

    await page.getByRole("radio", { name: "Scoring" }).click();
    await expect(card).toContainText("SCORING");
    await expect(page.getByRole("radio", { name: "Scoring" })).toHaveAttribute("aria-checked", "true");
  });

  test("export menu downloads the on-screen card as a self-contained SVG and closes", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await openWorkbench(page, "/showcase");
    const exportButton = page.getByRole("button", { name: /Export/ });
    await exportButton.click();
    const pending = page.waitForEvent("download");
    await page.getByRole("menuitem", { name: "SVG file" }).click();
    const download = await pending;
    expect(download.suggestedFilename()).toBe("fixture_star-showcase-overall.svg");
    const svg = await readFile((await download.path())!, "utf8");
    expect(svg).toContain("2025-26 Regular Season · Through Jun 29, 2026");
    expect(svg).not.toContain("var(--");
    expect(svg).not.toMatch(/<image[^>]+href="(?!data:)/);
    await expect(exportButton).toHaveAttribute("aria-expanded", "false");
  });

  test("a deep link selects the requested player and the phone layout stacks without sideways scroll", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await openWorkbench(page, "/showcase?playerId=24");
    await expect(page.locator(".showcase-card-svg")).toHaveAttribute("aria-label", /Fixture Guard/);
    await expect(page.locator(".showcase-roster-item.is-active")).toContainText("Fixture Guard");
    await expect(page.getByRole("button", { name: /^Filters/ })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    for (const name of ["Previous player", "Next player", "Add to favorites"]) {
      const box = await page.getByRole("button", { name, exact: true }).boundingBox();
      expect(box!.height).toBeGreaterThanOrEqual(40);
    }
  });
});
