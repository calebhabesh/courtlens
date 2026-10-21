import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import { openWorkbench } from "./workbench-navigation";

// Alignment row 17: Databallr's Shot Profile Twin (NBA only) against real API answers captured
// in the mock (`fixtures/player-twins-v1.json`).
const fixture = JSON.parse(readFileSync("e2e/fixtures/player-twins-v1.json", "utf8"));
const shot = fixture.shot, picked = fixture.picked, box = fixture.box;

test.describe("Player Twins", () => {
  test("the selected player-season beside its #1 twin, four zone groups, then twelve matches", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await openWorkbench(page, "/similar-players");
    await expect(page.getByRole("heading", { level: 1, name: "Player Twins" })).toBeVisible();
    const panel = page.getByRole("region", { name: "Shot Profile Twin" });
    await expect(panel.getByRole("heading", { name: "Shot Profile Twin" })).toBeVisible();
    await expect(panel.locator(".tw-default")).toContainText("Shown by default");
    const cards = panel.locator(".tw-card");
    await expect(cards.first()).toContainText(shot.player.name);
    await expect(cards.first()).toContainText("Selected");
    await expect(cards.nth(1)).toContainText(shot.twin.name);
    await expect(cards.nth(1).locator(".tw-card-kicker")).toHaveText("#1 Match");
    await expect(cards.first().locator(".tw-group h4")).toHaveText(["FT", "RIM", "MID", "3P"]);
    await expect(cards.first().locator(".tw-lg-head").first()).toHaveText("LG AVG");

    const rows = page.locator(".tw-match-row");
    await expect(rows).toHaveCount(12);
    await expect(rows.first()).toHaveAttribute("data-selected", "true");
    // Each group label sits centred over its two columns.
    const offsets = await page.evaluate(() => {
      const heads = [...document.querySelectorAll(".tw-grid .stats-header-tier-1 .stats-group-th")].slice(0, 4);
      const labels = [...document.querySelectorAll(".tw-grid .stats-header-tier-2 th")].slice(3, 11);
      return heads.map((head, index) => {
        const a = labels[index * 2].getBoundingClientRect(), b = labels[index * 2 + 1].getBoundingClientRect(), h = head.getBoundingClientRect();
        return Math.abs((h.left + h.right) / 2 - (a.left + b.right) / 2);
      });
    });
    for (const offset of offsets) expect(offset).toBeLessThan(1);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBe(0);

    await page.getByRole("button", { name: "Load 12 More" }).click();
    await expect(rows).toHaveCount(24);
    await expect(page).toHaveURL(/rows=24/);
  });

  test("a row puts that player-season in the twin card; Compare opens the exact pair", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await openWorkbench(page, "/similar-players");
    const second = shot.matches[1];
    const row = page.locator(".tw-match-row").nth(1);
    await expect(row.getByRole("link", { name: `Compare ${shot.season} ${shot.player.name} with ${second.season} ${second.name}` }))
      .toHaveAttribute("href", new RegExp(`seasonA=${shot.season}.*playerB=${second.player_id}.*seasonB=${second.season}`));
    await row.locator(".tw-score").click();
    await expect(page).toHaveURL(new RegExp(`vs=${second.player_id}%3A${second.season}`));
    await expect(page.locator(".tw-card").nth(1)).toContainText(picked.twin.name);
    await expect(page.locator(".tw-card").nth(1).locator(".tw-card-kicker")).toHaveText("#2 Match");
  });

  test("Box Score mode and the Same Season pool", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await openWorkbench(page, "/similar-players");
    await page.getByRole("radio", { name: "Box Score" }).click();
    await expect(page).toHaveURL(/mode=box/);
    await expect(page.getByRole("heading", { name: "Box Score Twin" })).toBeVisible();
    await expect(page.locator(".tw-card").first().locator(".tw-group h4")).toHaveText(["SCORING", "PLAYMAKING", "REBOUNDING", "DEFENSE"]);
    await expect(page.locator(".tw-card").nth(1)).toContainText(box.twin.name);
    await page.getByRole("radio", { name: "Same Season" }).click();
    await expect(page).toHaveURL(/pool=same/);
    await expect(page.getByLabel("From season")).toBeDisabled();
    await expect(page.locator(".tw-pool")).toContainText(`${shot.season} only`);
  });

  for (const view of [{ name: "desktop", width: 1440, height: 900 }, { name: "phone", width: 390, height: 844 }]) {
    test(`evidence ${view.name}`, async ({ page }) => {
      await page.setViewportSize({ width: view.width, height: view.height });
      await openWorkbench(page, "/similar-players");
      await expect(page.locator(".tw-match-row")).toHaveCount(12);
      expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBe(0);
      await page.screenshot({ path: `../docs/evidence/alignment/similar-players/player-twins-${view.name}.png`, fullPage: true });
    });
  }
});
