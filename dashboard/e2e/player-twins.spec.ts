import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import { openWorkbench } from "./workbench-navigation";

// Alignment row 17: Databallr's Shot Profile Twin (NBA only) against real API answers captured
// in the mock (`fixtures/player-twins-v1.json`).
const fixture = JSON.parse(readFileSync("e2e/fixtures/player-twins-v1.json", "utf8"));
const shot = fixture.shot, picked = fixture.picked, box = fixture.box, combined = fixture.all, weighted = fixture.weighted;

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
      const labels = [...document.querySelectorAll(".tw-grid .stats-header-tier-2 th")].slice(4, 12);
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
    await page.getByRole("radio", { name: `${shot.player.position} Only` }).click();
    await expect(page).toHaveURL(/position=same/);
    await expect(page.locator(".tw-card").first().locator(".tw-badge-position")).toHaveText(shot.player.position);
    // The own-seasons switch sits on the table, and the season has its own column.
    await expect(page.getByRole("heading", { name: `Closest Matches to ${shot.season} ${shot.player.name}` })).toBeVisible();
    await expect(page.locator(".tw-season-cell").first()).toHaveText(box.matches[0].season);
    await page.locator(".tw-matches").getByRole("radio", { name: "Other Players Only" }).click();
    await expect(page).toHaveURL(/own=exclude/);
    await expect(page.locator(".tw-pool")).toContainText(`without ${shot.player.name}`);
    await page.getByRole("radio", { name: "Same Season" }).click();
    await expect(page).toHaveURL(/pool=same/);
    await expect(page.getByLabel("From season")).toBeDisabled();
    await expect(page.locator(".tw-pool")).toContainText(`${shot.season} only`);
  });

  test("search reaches every player: one outside the season opens at his latest season", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await openWorkbench(page, "/similar-players");
    const corliss = shot.matches.filter((m: { name: string }) => m.name === "Corliss Williamson")
      .map((m: { season: string }) => m.season).sort().at(-1);
    await page.locator(".tw-search").getByRole("combobox").fill("Corliss");
    const option = page.getByRole("option", { name: /Corliss Williamson/ }).first();
    await expect(option).toContainText(`Opens ${corliss}`);
    await option.click();
    await expect(page).toHaveURL(new RegExp(`season=${corliss}`));
    // The card names the team with its logo beside the name.
    await expect(page.locator(".tw-card").first().locator("h3 .tw-name-logo")).toHaveCount(1);
  });

  test("Combined mode reads sixteen measures; weights drop measures and change the twin", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await openWorkbench(page, "/similar-players");
    await page.getByRole("radio", { name: "Combined" }).click();
    await expect(page).toHaveURL(/mode=all/);
    await expect(page.getByRole("heading", { name: "Combined Twin" })).toBeVisible();
    await expect(page.locator(".tw-card").first().locator(".tw-group h4")).toHaveText(["FT", "RIM", "MID", "3P", "SCORING", "PLAYMAKING", "REBOUNDING", "DEFENSE"]);
    await expect(page.locator(".tw-card").nth(1)).toContainText(combined.twin.name);
    await expect(page.locator(".tw-grid .stats-header-tier-2 th")).toHaveCount(16 + 7);

    await page.getByRole("radio", { name: "Shot Profile" }).click();
    await expect(page).not.toHaveURL(/mode=/);
    await page.locator(".tw-weights summary").click();
    await page.getByRole("radiogroup", { name: "FT VOL weight" }).getByRole("radio", { name: "Off" }).click();
    await expect(page).toHaveURL(/w=ft_vol%3A0/);
    await page.getByRole("radiogroup", { name: "FT EFF weight" }).getByRole("radio", { name: "Off" }).click();
    await expect(page).toHaveURL(/w=ft_vol%3A0%2Cft_eff%3A0/);
    await expect(page.locator(".tw-weights summary")).toContainText("2 Changed");
    await expect(page.locator(".tw-card").nth(1)).toContainText(weighted.twin.name);
    // Method notes sit behind info buttons instead of paragraphs under the table.
    await page.getByRole("button", { name: "How matches are scored" }).focus();
    await expect(page.getByRole("tooltip")).toContainText(`${weighted.method.min_overlap} of the ${weighted.method.measures} measures`);
    await page.getByRole("button", { name: "Equal Weights" }).click();
    await expect(page).not.toHaveURL(/w=/);
  });

  test("percentiles, what came next, career twins and the twin map", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await openWorkbench(page, "/similar-players");
    const card = page.locator(".tw-card").first();
    await expect(card.locator(".tw-pct-head").first()).toHaveText("PCTL");
    await expect(card.locator(".tw-pct")).toHaveCount(8);
    await expect(card.locator(".tw-pct").first()).toHaveText(/^\d+(st|nd|rd|th)$/);
    await expect(page.locator(".tw-card").nth(1).locator(".tw-next-line")).toContainText("Next season");

    await expect(page.getByRole("columnheader", { name: "Next", exact: true })).toBeVisible();
    const recorded = shot.matches.slice(0, 12).filter((m: { next: { status: string } }) => m.next.status === "recorded").length;
    await expect(page.locator(".tw-next-summary")).toContainText(`${recorded} of 12 twins on record`);
    await expect(page.locator(".tw-next-summary")).toHaveAttribute("title", /not a forecast/);
    await expect(page.locator(".tw-card-note")).toHaveCount(0);

    const career = page.getByRole("region", { name: "Career twins" });
    await expect(career.locator(".tw-career-card")).toHaveCount(shot.career.length);
    await expect(career.locator(".tw-career-card[aria-current]")).toContainText(shot.season);
    const earlier = shot.career[0];
    await expect(career.locator(".tw-career-card").first()).toHaveAttribute("href", new RegExp(`season=${earlier.season}.*vs=${earlier.twin.player_id}%3A${earlier.twin.season}`));

    const map = page.getByRole("region", { name: "Twin map" });
    await expect(map.locator(".tw-map-twin")).toHaveCount(12);
    await expect(map.locator(".tw-map-player text")).toHaveText(shot.player.name);
    await expect(map.locator(".tw-map-twin[data-current]")).toHaveCount(1);
    const second = shot.matches[1];
    await map.getByRole("button", { name: `#2 ${second.season} ${second.name}: show beside ${shot.player.name}` }).click();
    await expect(page).toHaveURL(new RegExp(`vs=${second.player_id}%3A${second.season}`));
    const spread = () => map.locator(".tw-map-twin circle").evaluateAll(circles => {
      const xs = circles.map(circle => Number(circle.getAttribute("cx")));
      return Math.max(...xs) - Math.min(...xs);
    });
    // Opens on the twins close-up, joined to the player, the closest three named; Whole Season
    // pulls back.
    await expect(map.locator(".tw-map-spoke")).toHaveCount(12);
    await expect(map.locator(".tw-map-name")).toHaveCount(3);
    await expect(map.locator(".tw-map-axis")).toHaveCount(4);
    const close = await spread();
    await map.getByRole("radio", { name: "Whole Season" }).click();
    await expect.poll(spread).toBeLessThan(close / 2);
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
