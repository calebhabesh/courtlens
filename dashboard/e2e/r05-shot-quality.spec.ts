import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { openWorkbench } from "./workbench-navigation";

// Real answers of the R05 API (e2e/fixtures/shot-quality.json): the page must show them exactly.
const fixture = JSON.parse(readFileSync("e2e/fixtures/shot-quality.json", "utf8"));
const board = fixture.boards["2025-26:shot_making:all:300"];
const path = "/research/shot-quality";
type Row = { player_id: string; shot_making: number; fga: number };

test.describe("R05 Shot Quality", () => {
  test.beforeEach(async ({ page }) => { await page.setViewportSize({ width: 1440, height: 900 }); });

  test("Players ranks every served player by shot-making with exact values and signed tones", async ({ page }) => {
    await openWorkbench(page, path);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Shot Quality");
    const rows = page.locator("[data-board='players'] [data-row]");
    await expect(rows).toHaveCount(board.rows.length);
    expect(await rows.evaluateAll(list => list.map(r => r.getAttribute("data-row")))).toEqual(board.rows.map((r: Row) => r.player_id));
    const first = rows.first().locator("[data-field='shot_making']");
    expect(Number(await first.getAttribute("data-value"))).toBe(board.rows[0].shot_making);
    await expect(first).toHaveAttribute("data-tone", "positive");
    await expect(rows.last().locator("[data-field='shot_making']")).toHaveAttribute("data-tone", "negative");
    await expect(rows.first().locator("[data-field='xpps']")).not.toHaveAttribute("data-tone", /.+/);
    await expect(page.getByRole("region", { name: "Key findings" })).toContainText("Accepted");
    await expect(page.getByText("RAPM decomposition (oTS, oSQ, oMake, oFT)", { exact: false })).toBeVisible();
    await expect(page.getByRole("radio", { name: "Decomposition" })).toBeVisible();
  });

  test("the team, minimum and sort filters change the served board", async ({ page }) => {
    await openWorkbench(page, `${path}?team=BOS&minFga=1000&sort=fga`);
    const want = fixture.boards["2025-26:fga:BOS:1000"].rows.map((r: Row) => r.player_id);
    const rows = page.locator("[data-board='players'] [data-row]");
    await expect(rows).toHaveCount(want.length);
    expect(await rows.evaluateAll(list => list.map(r => r.getAttribute("data-row")))).toEqual(want);
  });

  test("Model shows the gates, the calibration curve and the data check", async ({ page }) => {
    await openWorkbench(page, `${path}?tab=model`);
    const gates = fixture.summary.test.gates;
    expect(Number(await page.locator("[data-gate='relative_brier'] [data-value]").first().getAttribute("data-value"))).toBe(gates.relative_brier.value);
    await expect(page.locator("[data-table='curve'] [data-bin]")).toHaveCount(20);
    await expect(page.locator("svg.chart-reliability [data-series]")).toHaveCount(40);
    await expect(page.locator("[data-table='data'] [data-season]")).toHaveCount(12);
    await expect(page.locator("[data-outcome]")).toHaveAttribute("data-outcome", fixture.summary.outcome);
  });

  test("Player opens on the named default rule", async ({ page }) => {
    await openWorkbench(page, `${path}?tab=player`);
    await expect(page.locator("[data-rule='default']")).toHaveText(fixture.default_player.selection_rule);
    await expect(page.locator("[data-table='history'] [data-season]")).toHaveCount(fixture.default_player.seasons.length);
  });

  test("an unserved season says why", async ({ page }) => {
    await openWorkbench(page, `${path}?season=2019-20`);
    await expect(page.getByText("seasons no model was trained on", { exact: false }).first()).toBeVisible();
  });
});
