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
  const rowsOf = ".sq-board tbody tr[data-row]";
  const tone = (band: [number, number]) => band[0] > 0 ? "good" : band[1] < 0 ? "bad" : null;

  test("RD04: the default view ranks every served player with exact values, intervals and interval tones", async ({ page }) => {
    const board = fixture.boards["2025-26:offense:ts:all:1000"];
    await openWorkbench(page, path);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Shot Quality");
    await expect(page.getByRole("radio", { name: "Decomposition" })).toBeChecked();
    const rows = page.locator(rowsOf);
    await expect(rows).toHaveCount(board.rows.length);
    expect(await rows.evaluateAll(list => list.map(r => r.getAttribute("data-row")))).toEqual(board.rows.map((r: Row) => r.player_id));
    for (const target of ["ts", "sq", "make", "ft"]) {
      expect(await values(page, `${rowsOf} td[data-column='${target}']`)).toEqual(board.rows.map((r: Row) => r.values[target]));
      expect(await values(page, `${rowsOf} td[data-column='${target}']`, "data-low")).toEqual(board.rows.map((r: Row) => r.intervals[target][0]));
      expect(await values(page, `${rowsOf} td[data-column='${target}']`, "data-high")).toEqual(board.rows.map((r: Row) => r.intervals[target][1]));
      const tones = await page.locator(`${rowsOf} td[data-column='${target}'] .rs-grid-value`).evaluateAll(list => list.map(n => n.getAttribute("data-tone")));
      expect(tones).toEqual(board.rows.map((r: Row) => tone(r.intervals[target])));
    }
    await expect(page.getByRole("columnheader", { name: "oMake" })).toBeVisible();
    await expect(page.locator("[data-verdict]")).toHaveAttribute("data-verdict", fixture.summary.persistence.verdict);
    await expect(page.getByRole("link", { name: "Open Six-Factor RAPM" })).toHaveAttribute("href", "/research/rapm/six-factor");
  });

  test("defence and combined change the labels and the values, and the view stays in the URL", async ({ page }) => {
    await openWorkbench(page, `${path}&side=defense`);
    await expect(page.getByRole("columnheader", { name: "dContest" })).toBeVisible();
    await expect(page.locator(rowsOf)).toHaveCount(fixture.boards["2025-26:defense:ts:all:1000"].rows.length);
    expect(await values(page, `${rowsOf} td[data-column='make']`)).toEqual(fixture.boards["2025-26:defense:ts:all:1000"].rows.map((r: Row) => r.values.make));
    await page.getByRole("radio", { name: "Combined" }).click();
    await expect(page).toHaveURL(/side=combined/);
    expect(await values(page, `${rowsOf} td[data-column='ts']`)).toEqual(fixture.boards["2025-26:combined:ts:all:1000"].rows.map((r: Row) => r.values.ts));
  });

  test("search, team, minimum and sorting filter the rows like the API's filtered board", async ({ page }) => {
    const board = fixture.boards["2025-26:offense:make:BOS:2000"];
    await openWorkbench(page, path);
    await page.getByRole("button", { name: "Select Team" }).click();
    await page.getByRole("dialog", { name: "Select Team" }).getByRole("button", { name: "Boston Celtics" }).click();
    await expect(page.getByRole("button", { name: /^Team, Boston Celtics/ })).toBeVisible();
    await page.getByRole("spinbutton", { name: "Min shots" }).fill("2000");
    await page.getByRole("button", { name: "Sort by oMake" }).click();
    await expect(page.locator(rowsOf)).toHaveCount(board.rows.length);
    expect(await values(page, `${rowsOf} td[data-column='make']`)).toEqual(board.rows.map((r: Row) => r.values.make));
    const first = fixture.boards["2025-26:offense:ts:all:1000"].rows[0] as Row & { player_name: string };
    await page.getByRole("button", { name: /^Team, Boston Celtics/ }).click();
    await page.getByRole("dialog", { name: "Select Team" }).getByRole("button", { name: "Show All Teams" }).click();
    await page.getByRole("searchbox", { name: "Search players", exact: true }).fill(first.player_name);
    await expect(page.locator(rowsOf)).toHaveCount(1);
  });

  test("a season without the model's out-of-sample fit says why; Methodology opens the caveats; the CSV holds every side", async ({ page }) => {
    await openWorkbench(page, `${path}&dSeason=2019-20`);
    await expect(page.getByText(fixture.unknown_season.reason)).toBeVisible();
    await openWorkbench(page, path);
    await page.getByRole("button", { name: "Methodology" }).click();
    await expect(page.locator("#methodology details")).toHaveAttribute("open", "");
    await expect(page.locator("[data-table='sq-additivity'] tbody tr[data-row]")).toHaveCount(Object.keys(fixture.summary.seasons).length);
    const download = page.waitForEvent("download");
    await page.getByRole("button", { name: "Download CSV" }).click();
    const file = await download;
    expect(file.suggestedFilename()).toBe("courtlens-decomposition-2025-26.csv");
    const text = readFileSync(await file.path(), "utf8").trim().split(/\r?\n/);
    expect(text).toHaveLength(fixture.boards["2025-26:offense:ts:all:1000"].rows.length + 1);
    expect(text[0]).toContain("oTS_p10");
    expect(text[0]).toContain("dContest_p90");
  });
});

test.describe("R06 Defensive Shot Quality", () => {
  test.beforeEach(async ({ page }) => { await page.setViewportSize({ width: 1440, height: 900 }); });
  const board = fixture.cards["2025-26:all:dsq:all"];
  const tone = (band: [number, number] | null) => !band ? null : band[0] > 0 ? "good" : band[1] < 0 ? "bad" : null;
  type Card = { player_id: string; value: { dsq: number | null; fga: number; xpps: number | null; pps: number | null; interval: [number, number] | null };
    rank: Record<string, number> | null; rapm: { value: number | null; interval: [number, number] | null }; key_matchups: { player_id: string }[] };

  test("RD05: Databallr's cards in rank order with exact values, ranks, interval tones and key matchups; paging", async ({ page }) => {
    await openWorkbench(page, defense);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Defensive Shot Quality");
    const cards = page.locator("[data-card]");
    await expect(cards).toHaveCount(6);
    for (const [i, row] of (board.rows as Card[]).slice(0, 6).entries()) {
      const card = cards.nth(i);
      await expect(card).toHaveAttribute("data-card", row.player_id);
      await expect(card.locator("[data-field='position']")).toHaveText(`#${i + 1}`);
      const dsq = card.locator("[data-field='dsq']");
      expect(Number(await dsq.getAttribute("data-value"))).toBe(row.value.dsq);
      expect(await dsq.getAttribute("data-tone")).toBe(tone(row.value.interval));
      const rapm = card.locator("[data-field='rapm']");
      expect(Number(await rapm.getAttribute("data-value"))).toBe(row.rapm.value);
      expect(await rapm.getAttribute("data-tone")).toBe(tone(row.rapm.interval));
      for (const key of ["fga", "xpps", "pps"] as const) {
        const cell = card.locator(`.dq-stat [data-field='${key}']`);
        expect(Number(await cell.getAttribute("data-value"))).toBe(row.value[key]);
        await expect(cell).not.toHaveAttribute("data-tone", /.+/);
        expect(Number(await card.locator(`[data-field='${key}-rank']`).getAttribute("data-value"))).toBe(row.rank?.[key]);
      }
      expect(Number(await card.locator("[data-field='dsq-rank']").getAttribute("data-value"))).toBe(row.rank?.dsq);
      await expect(card.locator("tr[data-matchup]")).toHaveCount(row.key_matchups.length);
    }
    // No 2nd Defender tiles, no dropdown for teams, the RAPM chip's tone is the 80% interval's (Capela's includes zero: neutral).
    await expect(page.getByText("2nd Defender", { exact: true })).toHaveCount(0);
    await expect(page.locator("select[aria-label='Team']")).toHaveCount(0);
    await page.getByRole("button", { name: /Show next 6 players \(6\/329 shown\)/ }).click();
    await expect(cards).toHaveCount(12);
    await expect(page.getByText("Reproduced: the ranked player cards", { exact: false })).toBeAttached();
    await page.locator("#methodology summary").click();
    await expect(page.getByRole("link", { name: "Tracking page" })).toHaveAttribute("href", "/research/defensive-matchups/tracking");
  });

  test("RD05: each card switches its own shot type to that board's values; the global switch reorders", async ({ page }) => {
    const twos = fixture.cards["2025-26:2pt:dsq:all"], threes = fixture.cards["2025-26:3pt:dsq:all"];
    await openWorkbench(page, defense);
    const card = page.locator("[data-card]").first();
    const id = await card.getAttribute("data-card");
    await card.getByRole("radio", { name: "2PT" }).click();
    const two = (twos.rows as Card[]).find(r => r.player_id === id)!;
    await expect(card).toHaveAttribute("data-kind", "2pt");
    expect(Number(await card.locator("[data-field='dsq']").getAttribute("data-value"))).toBe(two.value.dsq);
    expect(Number(await card.locator(".dq-stat [data-field='fga']").getAttribute("data-value"))).toBe(two.value.fga);
    await expect(card).toContainText("Matchup shots (2PT)");
    await expect(page.locator("[data-card]").nth(1)).toHaveAttribute("data-kind", "all");
    await openWorkbench(page, `${defense}?kind=3pt`);
    const first = page.locator("[data-card]").first();
    await expect(first).toHaveAttribute("data-card", threes.rows[0].player_id);
    expect(Number(await first.locator("[data-field='dsq']").getAttribute("data-value"))).toBe(threes.rows[0].value.dsq);
    await expect(first).toContainText("Matchup shots (3PT)");
  });

  test("RD05: search filters the cards and keeps their rank; the team picker serves that team", async ({ page }) => {
    await openWorkbench(page, defense);
    const target = (board.rows as (Card & { player_name: string })[])[9];
    await page.getByRole("searchbox", { name: "Search defenders" }).fill(target.player_name);
    await expect(page.locator("[data-card]")).toHaveCount(1);
    await expect(page.locator("[data-card] [data-field='position']")).toHaveText("#10");
    await page.getByRole("searchbox", { name: "Search defenders" }).fill("");
    await page.getByRole("button", { name: "Select Team" }).click();
    await page.getByRole("dialog", { name: "Select Team" }).getByRole("button", { name: "Boston Celtics" }).click();
    await expect(page).toHaveURL(/team=BOS/);
    const bos = fixture.cards["2025-26:all:dsq:BOS"];
    await expect(page.locator("[data-card]").first()).toHaveAttribute("data-card", bos.rows[0].player_id);
  });

  test("a season before the decomposition shows the RAPM chip as unknown with its reason", async ({ page }) => {
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
    await expect(page.locator(".sq-board tbody tr[data-row]").first()).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
  });
});
