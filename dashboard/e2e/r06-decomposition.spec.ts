import { expect, test, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import { openWorkbench } from "./workbench-navigation";

// Real answers of the R06 APIs (e2e/fixtures/shot-decomposition.json): the pages must show them exactly.
const fixture = JSON.parse(readFileSync("e2e/fixtures/shot-decomposition.json", "utf8"));
const path = "/research/shot-quality?tab=decomposition";
const defense = "/research/defensive-matchups";
type Row = { player_id: string; values: Record<string, number>; intervals: Record<string, [number, number]> };

async function values(page: Page, selector: string, attribute = "data-value") {
  return (await page.locator(selector).evaluateAll((list, a) => list.map(n => n.getAttribute(a)), attribute)).map(Number);
}

test.describe("R06 decomposition", () => {
  test.beforeEach(async ({ page }) => { await page.setViewportSize({ width: 1440, height: 900 }); });

  test("offence ranks every served player with exact values, intervals and tones", async ({ page }) => {
    const board = fixture.boards["2025-26:offense:ts:all:1000"];
    await openWorkbench(page, path);
    const rows = page.locator("[data-board='decomposition'] [data-row]");
    await expect(rows).toHaveCount(board.rows.length);
    expect(await rows.evaluateAll(list => list.map(r => r.getAttribute("data-row")))).toEqual(board.rows.map((r: Row) => r.player_id));
    for (const target of ["ts", "sq", "make", "ft"]) {
      expect(await values(page, `[data-board='decomposition'] [data-field='${target}']`)).toEqual(board.rows.map((r: Row) => r.values[target]));
      expect(await values(page, `[data-board='decomposition'] [data-field='${target}']`, "data-low")).toEqual(board.rows.map((r: Row) => r.intervals[target][0]));
      expect(await values(page, `[data-board='decomposition'] [data-field='${target}']`, "data-high")).toEqual(board.rows.map((r: Row) => r.intervals[target][1]));
    }
    await expect(rows.first().locator("[data-field='ts']")).toHaveAttribute("data-tone", "positive");
    await expect(rows.last().locator("[data-field='ts']")).toHaveAttribute("data-tone", "negative");
    await expect(page.getByRole("table", { name: /^Decomposition/ }).getByRole("columnheader", { name: "oMake" })).toBeVisible();
    await expect(page.locator("[data-verdict]")).toHaveAttribute("data-verdict", fixture.summary.persistence.verdict);
  });

  test("defence and combined change the labels and the values", async ({ page }) => {
    await openWorkbench(page, `${path}&side=defense`);
    await expect(page.getByRole("table", { name: /^Decomposition/ }).getByRole("columnheader", { name: "dContest" })).toBeVisible();
    await expect(page.locator("[data-board='decomposition'] [data-row]")).toHaveCount(fixture.boards["2025-26:defense:ts:all:1000"].rows.length);
    expect(await values(page, "[data-board='decomposition'] [data-field='make']")).toEqual(fixture.boards["2025-26:defense:ts:all:1000"].rows.map((r: Row) => r.values.make));
    await openWorkbench(page, `${path}&side=combined`);
    await expect(page.locator("[data-board='decomposition'] [data-row]")).toHaveCount(fixture.boards["2025-26:combined:ts:all:1000"].rows.length);
    expect(await values(page, "[data-board='decomposition'] [data-field='ts']")).toEqual(fixture.boards["2025-26:combined:ts:all:1000"].rows.map((r: Row) => r.values.ts));
  });

  test("the team, minimum and rank filters serve the filtered board", async ({ page }) => {
    const board = fixture.boards["2025-26:offense:make:BOS:2000"];
    await openWorkbench(page, `${path}&dSort=make&dTeam=BOS&minShots=2000`);
    await expect(page.locator("[data-board='decomposition'] [data-row]")).toHaveCount(board.rows.length);
    expect(await values(page, "[data-board='decomposition'] [data-field='make']")).toEqual(board.rows.map((r: Row) => r.values.make));
  });

  test("a season without the model's out-of-sample fit says why, and the CSV holds the table", async ({ page }) => {
    await openWorkbench(page, `${path}&dSeason=2019-20`);
    await expect(page.getByText(fixture.unknown_season.reason)).toBeVisible();
    await openWorkbench(page, path);
    const download = page.waitForEvent("download");
    await page.getByRole("button", { name: "Download CSV" }).click();
    const file = await download;
    expect(file.suggestedFilename()).toBe("courtlens-decomposition-2025-26-offense.csv");
    const text = readFileSync(await file.path(), "utf8").trim().split("\n");
    expect(text).toHaveLength(fixture.boards["2025-26:offense:ts:all:1000"].rows.length + 1);
    expect(text[0]).toContain("oTS_p10");
  });
});

test.describe("R06 Defensive Shot Quality", () => {
  test.beforeEach(async ({ page }) => { await page.setViewportSize({ width: 1440, height: 900 }); });
  const board = fixture.cards["2025-26:all:dsq:all"];

  test("cards rank by D-SQ with exact values, ranks, key matchups and paging", async ({ page }) => {
    await openWorkbench(page, defense);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Defensive Shot Quality");
    const cards = page.locator("[data-card]");
    await expect(cards).toHaveCount(6);
    const first = board.rows[0];
    const card = cards.first();
    await expect(card).toHaveAttribute("data-card", first.player_id);
    expect(Number(await card.locator("[data-field='dsq']").getAttribute("data-value"))).toBe(first.value.dsq);
    await expect(card.locator("[data-field='dsq']")).toHaveAttribute("data-tone", "positive");
    expect(Number(await card.locator("[data-field='xpps']").first().getAttribute("data-value"))).toBe(first.value.xpps);
    await expect(card.locator("[data-field='xpps']").first()).not.toHaveAttribute("data-tone", /.+/);
    await expect(card.locator("[data-matchup]")).toHaveCount(first.key_matchups.length);
    await page.getByRole("button", { name: /Show next 6 players/ }).click();
    await expect(cards).toHaveCount(12);
    await expect(page.getByText("Reproduced: the ranked player cards", { exact: false })).toBeVisible();
    await expect(page.getByRole("link", { name: "Tracking page" })).toHaveAttribute("href", "/research/defensive-matchups/tracking");
  });

  test("the shot-type switch serves that type's values and unknowns stay unknown", async ({ page }) => {
    const threes = fixture.cards["2025-26:3pt:dsq:all"];
    await openWorkbench(page, `${defense}?kind=3pt`);
    const card = page.locator("[data-card]").first();
    await expect(card).toHaveAttribute("data-card", threes.rows[0].player_id);
    expect(Number(await card.locator("[data-field='dsq']").getAttribute("data-value"))).toBe(threes.rows[0].value.dsq);
    await expect(card).toContainText("Shots (3PT)");
  });

  test("a season before the decomposition shows the RAPM headline as unknown with its reason", async ({ page }) => {
    await openWorkbench(page, `${defense}?season=2019-20`);
    const card = page.locator("[data-card]").first();
    await expect(card.locator("[data-field='rapm']")).toHaveText("unknown");
    await expect(card).toContainText("The decomposition starts in 2022-23.");
    await openWorkbench(page, `${defense}?season=2016-17`);
    await expect(page.getByText(fixture.unknown_cards.reason)).toBeVisible();
  });

  test("no horizontal page scroll at phone width", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await openWorkbench(page, defense);
    await expect(page.locator("[data-card]").first()).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
    await openWorkbench(page, path);
    await expect(page.locator("[data-board='decomposition'] [data-row]").first()).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
  });
});
