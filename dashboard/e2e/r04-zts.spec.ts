import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { openWorkbench } from "./workbench-navigation";

// Real answers of the R04 API (e2e/fixtures/zts.json): the page must show them exactly.
const fixture = JSON.parse(readFileSync("e2e/fixtures/zts.json", "utf8"));
const board = fixture.boards["2025-26:zts_add"];
const path = "/research/zts";
type Row = { player_id: string; season: string; zts: number; difficulty: number; zts_add: number };

test.describe("R04 zTS", () => {
  test.beforeEach(async ({ page }) => { await page.setViewportSize({ width: 1440, height: 900 }); });

  test("About shows the league references, the registered result and the season leaderboard exactly", async ({ page }) => {
    await openWorkbench(page, path);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("zTS");
    const ref = fixture.summary.references["2025-26"];
    const league = page.getByRole("table", { name: "2025-26 league play-type TS" });
    for (const type of ref.types) expect(Number(await league.locator(`tr[data-type="${type.play_type}"] [data-value]`).first().getAttribute("data-value"))).toBe(type.ts);
    const tracking = fixture.summary.validation.tracking.test.pooled;
    const cell = page.locator(`[data-validation^="tracking-Test, pooled"] [data-low]`);
    expect(Number(await cell.getAttribute("data-value"))).toBe(tracking.metrics.delta_r.value);
    await expect(page.getByRole("region", { name: "Key findings" })).toContainText("zTS better");
    await expect(page.getByRole("region", { name: "Key findings" })).toContainText("rTS better");
    const rows = page.locator("[data-board='about'] [data-row]");
    await expect(rows).toHaveCount(50);
    expect(await rows.evaluateAll(list => list.map(r => r.getAttribute("data-row")))).toEqual(board.rows.slice(0, 50).map((r: Row) => r.player_id));
    await page.getByRole("button", { name: /Show more/ }).click();
    await expect(rows).toHaveCount(board.rows.length);
    await expect(page.getByText("not Databallr's SV/100", { exact: false }).first()).toBeVisible();
  });

  test("the default pair follows its rule and an absent play type reads as not listed", async ({ page }) => {
    await openWorkbench(page, path);
    const pair = page.locator("[data-pair] [data-row]");
    await expect(pair).toHaveCount(2);
    const [a, b] = await pair.evaluateAll(list => list.map(r => r.getAttribute("data-row")));
    expect(Object.keys(fixture.players)).toEqual(expect.arrayContaining([a, b]));
    await expect(page.getByText("Default pair:", { exact: false })).toBeVisible();
    const types = (id: string) => new Set(fixture.players[id].play_types.map((t: { play_type: string }) => t.play_type));
    const missing = fixture.summary.references["2025-26"].types.find((t: { play_type: string }) => !types(b as string).has(t.play_type));
    if (missing) await expect(page.getByRole("img", { name: new RegExp(`${missing.label}, .*: unknown`) }).first()).toBeVisible();
  });

  test("Top 200 ranks every season by zTS add and keeps playoffs unavailable", async ({ page }) => {
    await openWorkbench(page, `${path}?tab=top`);
    const rows = page.locator("[data-board='top'] [data-row]");
    await expect(rows).toHaveCount(200);
    expect(await rows.evaluateAll(list => list.map(r => r.getAttribute("data-row")))).toEqual(fixture.top.rows.map((r: Row) => `${r.season}:${r.player_id}`));
    const first = fixture.top.rows[0];
    expect(Number(await rows.first().locator("[data-field='zts_add']").getAttribute("data-value"))).toBe(first.zts_add);
    await expect(page.getByRole("radio", { name: "Post" })).toBeDisabled();
    await page.getByRole("textbox", { name: "Search players" }).fill(first.player_name.split(" ").at(-1));
    await expect(rows.first()).toHaveAttribute("data-row", `${first.season}:${first.player_id}`);
  });

  test("Player opens on the named default and adds up its mix to Expected TS", async ({ page }) => {
    await openWorkbench(page, `${path}?tab=player`);
    const player = fixture.default_player;
    await expect(page.getByText(player.selection_rule)).toBeVisible();
    const total = page.locator("[data-types] tr[data-type='total'] [data-value]").last();
    expect(Number(await total.getAttribute("data-value"))).toBe(player.expected_ts);
    await expect(page.locator("[data-history] [data-season]")).toHaveCount(player.history.length);
  });

  test("is in the Research menu under Shooting with an icon", async ({ page }) => {
    await openWorkbench(page, "/research/projected-impact");
    await page.getByRole("button", { name: "Research", exact: true }).click();
    const item = page.getByRole("menu", { name: "Research" }).getByRole("menuitem", { name: /zTS/ });
    await expect(item).toBeVisible();
    await expect(item.locator("svg")).toBeVisible();
    await item.click();
    await expect(page).toHaveURL(url => url.pathname === path);
  });
});
