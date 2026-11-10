import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { openWorkbench } from "./workbench-navigation";

// Real answers of the R05 API (e2e/fixtures/shot-quality.json): the page must show them exactly (RD04 layout).
const fixture = JSON.parse(readFileSync("e2e/fixtures/shot-quality.json", "utf8"));
const board = fixture.boards["2025-26:shot_making:all:300"];
const path = "/research/shot-quality";
type Row = { player_id: string; shot_making: number; fga: number; interval: [number, number] | null };
const rowsOf = ".sq-players tbody tr[data-row]";
const tone = (band: [number, number] | null) => !band ? null : band[0] > 0 ? "good" : band[1] < 0 ? "bad" : null;

test.describe("R05 Shot Quality", () => {
  test.beforeEach(async ({ page }) => { await page.setViewportSize({ width: 1440, height: 900 }); });

  test("Shot-making ranks every served player with exact values and 95% interval tones", async ({ page }) => {
    await openWorkbench(page, `${path}?tab=shot-making`);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Shot Quality");
    const rows = page.locator(rowsOf);
    await expect(rows).toHaveCount(board.rows.length);
    expect(await rows.evaluateAll(list => list.map(r => r.getAttribute("data-row")))).toEqual(board.rows.map((r: Row) => r.player_id));
    const cells = page.locator(`${rowsOf} td[data-column='shot_making']`);
    expect((await cells.evaluateAll(list => list.map(n => n.getAttribute("data-value")))).map(Number)).toEqual(board.rows.map((r: Row) => r.shot_making));
    expect(await page.locator(`${rowsOf} td[data-column='shot_making'] .rs-grid-value`).evaluateAll(list => list.map(n => n.getAttribute("data-tone"))))
      .toEqual(board.rows.map((r: Row) => tone(r.interval)));
    await expect(rows.first().locator("td[data-column='xpps'] .rs-grid-value")).not.toHaveAttribute("data-tone", /.+/);
    await expect(page.getByText("Helps: 95% interval above zero")).toBeVisible();
    await expect(page.getByText("Design reference: a saved copy of Databallr's ShotQuality RAPM page", { exact: false })).toBeAttached();
  });

  test("the old Players link opens Shot-making, and team, minimum and sort filter like the API", async ({ page }) => {
    await openWorkbench(page, `${path}?tab=players`);
    await expect(page.getByRole("radio", { name: "Shot-making" })).toBeChecked();
    await page.getByRole("button", { name: "Select Team" }).click();
    await page.getByRole("dialog", { name: "Select Team" }).getByRole("button", { name: "Boston Celtics" }).click();
    await expect(page.getByRole("button", { name: /^Team, Boston Celtics/ })).toBeVisible();
    await page.getByRole("spinbutton", { name: "Min FGA" }).fill("1000");
    await page.getByRole("button", { name: "Sort by FGA" }).click();
    const want = fixture.boards["2025-26:fga:BOS:1000"].rows.map((r: Row) => r.player_id);
    const rows = page.locator(rowsOf);
    await expect(rows).toHaveCount(want.length);
    expect(await rows.evaluateAll(list => list.map(r => r.getAttribute("data-row")))).toEqual(want);
  });

  test("Model shows the result tiles, the gates, the calibration curve and the data check", async ({ page }) => {
    await openWorkbench(page, `${path}?tab=model`);
    const gates = fixture.summary.test.gates;
    await expect(page.getByRole("list", { name: "Key findings" })).toContainText("Accepted");
    expect(Number(await page.locator("[data-table='gates'] tr[data-gate='relative_brier'] [data-field='value']").getAttribute("data-value"))).toBe(gates.relative_brier.value);
    await expect(page.locator("[data-table='gates'] tr[data-gate='relative_brier'] [data-field='value']")).toHaveAttribute("data-tone", "good");
    await expect(page.locator("[data-table='gates'] tr[data-gate='ece'] [data-field='value']")).not.toHaveAttribute("data-tone", /.+/);
    await expect(page.locator("[data-table='curve'] tbody tr[data-bin]")).toHaveCount(20);
    await expect(page.locator("svg.chart-reliability [data-series]")).toHaveCount(40);
    await expect(page.locator("[data-table='data'] tbody tr[data-season]")).toHaveCount(12);
    await expect(page.locator("[data-outcome]")).toHaveAttribute("data-outcome", fixture.summary.outcome);
  });

  test("Player opens on the named default rule, and clearing it leaves an empty state with a way back", async ({ page }) => {
    await openWorkbench(page, `${path}?tab=player`);
    await expect(page.locator("[data-rule='default']")).toHaveText(fixture.default_player.selection_rule);
    await expect(page.locator("[data-table='history'] tbody tr[data-season]")).toHaveCount(fixture.default_player.seasons.length);
    await expect(page.locator("[data-table='splits'] tbody tr[data-season]")).toHaveCount(4);
    await expect(page.locator("[data-tile='shot_making']")).toBeVisible();
    await openWorkbench(page, `${path}?tab=player&player=none`);
    await expect(page.getByText("No player chosen.", { exact: false })).toBeVisible();
    await page.getByRole("button", { name: "Open the default player" }).click();
    await expect(page.locator("[data-rule='default']")).toBeVisible();
  });

  test("an unserved season says why", async ({ page }) => {
    await openWorkbench(page, `${path}?tab=shot-making&season=2019-20`);
    await expect(page.getByText(fixture.unknown_season.reason)).toBeVisible();
  });

  test("no horizontal page scroll at phone width on any view", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    for (const tab of ["shot-making", "model", "player"]) {
      await openWorkbench(page, `${path}?tab=${tab}`);
      await expect(page.locator(".sq-page [data-section], .sq-page .sq-table-block, .sq-page .sq-model-head").first()).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
    }
  });
});
