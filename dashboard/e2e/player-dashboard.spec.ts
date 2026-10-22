import { test, expect } from "@playwright/test";
import { openWorkbench } from "./workbench-navigation";

// Alignment row 22: Databallr's Player Dashboard on the mock's two fixture players.
test.describe("Player Dashboard", () => {
  test("the DPM carousel adds panels, swap opens the head-to-head, close removes a panel", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await openWorkbench(page, "/players");
    await expect(page.getByRole("heading", { level: 1, name: "Player Dashboard" })).toBeVisible();
    const carousel = page.getByRole("region", { name: /^Top 2 by DARKO DPM/ });
    // Highest DPM first.
    await expect(carousel.locator(".pd-card-name")).toHaveText(["Fixture Star", "Fixture Guard"]);
    await expect(carousel.locator(".pd-card-dpm").first()).toHaveText("+6.2");

    await carousel.getByRole("button", { name: /Fixture Star/ }).click();
    await expect(page).toHaveURL(/p=23\.2025-26\.rs/);
    const star = page.getByRole("article", { name: "2025-26 Fixture Star" });
    await expect(star.locator(".pd-block-group")).toContainText(["DARKO", "MP", "1 Year RAPM", "Scoring", "ORB", "Playmaking", "Contesting", "DRB", "D-Playmaking"]);
    await expect(star.locator(".pd-cell", { hasText: "POTAST" }).locator(".pd-cell-value")).toHaveText("9.2");
    await expect(star.locator(".pd-play-label")).toHaveText(["Creation", "Spacing", "Transition", "Finishing"]);
    await expect(carousel.getByRole("button", { name: /Fixture Star.*shown below/ })).toBeVisible();

    // Rate and the Basic view change only that panel and live in the URL.
    await star.getByRole("button", { name: "Per 36" }).click();
    await expect(page).toHaveURL(/p=23\.2025-26\.rs\.g/);
    await star.getByRole("button", { name: "Advanced" }).click();
    await expect(page).toHaveURL(/p=23\.2025-26\.rs\.bg/);
    await expect(star.locator(".pd-block-group")).toContainText(["Production", "Games", "Defense & Ball Security"]);
    await star.getByRole("button", { name: "Advanced" }).click();

    await carousel.getByRole("button", { name: /Fixture Guard/ }).click();
    const guard = page.getByRole("article", { name: "2025-26 Fixture Guard" });
    await expect(guard).toBeVisible();
    await expect(guard.locator(".pd-plays")).toContainText("No Synergy play types");

    await star.getByRole("button", { name: "Compare Fixture Star head to head" }).click();
    await guard.getByRole("button", { name: "Compare Fixture Guard head to head" }).click();
    await expect(page).toHaveURL(/vs=0\.1/);
    const versus = page.getByRole("article", { name: "2025-26 Fixture Star versus 2025-26 Fixture Guard" });
    const potast = versus.locator(".pd-vs-cell", { hasText: "POTAST" });
    await expect(potast).toHaveAttribute("data-leader", "a");
    await expect(potast.locator(".pd-cell-value")).toHaveText("+5.1");
    await expect(potast.locator(".pd-vs-name")).toHaveText("Star");
    // Lower is better for DIFF: the Star's −6% beats +2%.
    await expect(versus.locator(".pd-vs-cell", { hasText: "DIFF" }).first()).toHaveAttribute("data-leader", "a");

    await star.getByRole("button", { name: "Close Fixture Star" }).click();
    await expect(page).not.toHaveURL(/vs=/);
    await expect(page.getByRole("article", { name: "2025-26 Fixture Star" })).toHaveCount(0);
    await expect(versus).toHaveCount(0);
  });

  test("search adds a panel, key 1 focuses it, and a phone keeps one column with no sideways scroll", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await openWorkbench(page, "/players");
    await page.locator("body").press("1");
    const search = page.getByRole("combobox", { name: "Add a player" });
    await expect(search).toBeFocused();
    await search.fill("Guard");
    await page.getByRole("option", { name: /Fixture Guard/ }).click();
    const guard = page.getByRole("article", { name: "2025-26 Fixture Guard" });
    await expect(guard).toBeVisible();
    const box = await guard.boundingBox();
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(390);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
  });
});
