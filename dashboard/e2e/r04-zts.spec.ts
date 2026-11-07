import { expect, test, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import { openWorkbench } from "./workbench-navigation";

// Real answers of the R04 API and RD03's team and role-moves endpoints (e2e/fixtures/zts.json): the page must show
// them exactly. RD03 redesigned the page as Databallr's zTS explainer (768 px essay column, floating view dock).
const fixture = JSON.parse(readFileSync("e2e/fixtures/zts.json", "utf8"));
const board = fixture.boards["2025-26:zts_add"];
const path = "/research/zts";
type Row = { player_id: string; player_name: string; season: string; zts: number | null; rts: number | null; difficulty: number | null; zts_add: number | null; minutes: number | null; scoring_usage: number | null };
const rows: Row[] = board.rows;
const attr = async (page: Page, selector: string, name = "data-value") => page.locator(selector).first().getAttribute(name);

test.describe("R04 zTS", () => {
  test.beforeEach(async ({ page }) => { await page.setViewportSize({ width: 1440, height: 900 }); });

  test("About shows the league references, the registered result and the season leaderboard exactly", async ({ page }) => {
    await openWorkbench(page, path);
    await expect(page.getByRole("heading", { level: 1 })).toHaveAccessibleName("zTS: Scoring Efficiency and Playtype Difficulty");
    const ref = fixture.summary.references["2025-26"];
    for (const type of ref.types) expect(Number(await attr(page, `.zt-league-row[data-type="${type.play_type}"]`))).toBe(type.ts);
    expect(Number(await attr(page, ".zt-league-avg"))).toBe(ref.ts);
    const tracking = fixture.summary.validation.tracking.test.pooled, predictive = fixture.summary.validation.predictive.test.pooled;
    const deltas = page.locator(".zt-test .rs-value");
    expect(Number(await deltas.nth(0).getAttribute("data-value"))).toBe(tracking.metrics.delta_r.value);
    await expect(deltas.nth(0)).toHaveAttribute("data-tone", "good");
    expect(Number(await deltas.nth(1).getAttribute("data-value"))).toBe(predictive.metrics.delta_r.value);
    await expect(deltas.nth(1)).toHaveAttribute("data-tone", "bad");
    // The by-season tables sit in the collapsed Caveats & Methodology, still in the DOM.
    expect(Number(await attr(page, `[data-validation^="tracking-Test, pooled"] [data-low]`))).toBe(tracking.metrics.delta_r.value);
    const list = page.locator("[data-table='zts-board'] tbody tr[data-row]");
    await expect(list).toHaveCount(50);
    expect(await list.evaluateAll(l => l.map(r => r.getAttribute("data-row")))).toEqual(rows.slice(0, 50).map(r => r.player_id));
    expect(Number(await list.first().locator("[data-field='zts_add']").getAttribute("data-value"))).toBe(rows[0].zts_add);
    await page.getByRole("button", { name: /Show more/ }).click();
    await expect(list).toHaveCount(rows.length);
    await expect(page.getByText("Databallr's SV/100, whose formula is not published", { exact: false }).first()).toBeVisible();
  });

  test("the default pair follows its rule, its fields equal the API and an absent play type reads as not listed", async ({ page }) => {
    await openWorkbench(page, path);
    const sides = page.locator(".zt-compare-side[data-row]");
    await expect(sides).toHaveCount(2);
    const [a, b] = await sides.evaluateAll(l => l.map(r => r.getAttribute("data-row")));
    expect(Object.keys(fixture.players)).toEqual(expect.arrayContaining([a, b]));
    // The rule lives in the collapsed Caveats & Methodology (captions rule), in the DOM while closed.
    await expect(page.locator("#caveats")).toContainText("Default pair:");
    for (const id of [a, b] as string[]) {
      const row = rows.find(r => r.player_id === id)!;
      for (const field of ["scoring_usage", "rts", "difficulty", "zts"] as const)
        expect(Number(await attr(page, `.zt-compare-row[data-field="${field}"] [data-row="${id}"]`))).toBe(row[field]);
      expect(Number(await attr(page, `.zt-expected [data-row="${id}"] [data-field="difficulty"]`))).toBe(row.difficulty);
    }
    const types = (id: string) => new Set(fixture.players[id].play_types.map((t: { play_type: string }) => t.play_type));
    const missing = fixture.summary.references["2025-26"].types.find((t: { play_type: string }) => !types(b as string).has(t.play_type));
    if (missing) await expect(page.getByRole("img", { name: new RegExp(`^${missing.label}, .*not listed`) })).toBeVisible();
  });

  test("a side is changed by searching the season's served players, never by scrolling a list", async ({ page }) => {
    await openWorkbench(page, path);
    // Round 3 (owner): no dropdown of player names anywhere on the page.
    for (const select of await page.locator("select").all()) expect(await select.locator("option").count()).toBeLessThan(30);
    const sga = rows.find(r => r.player_id === fixture.default_player.player_id)!;
    await page.getByRole("button", { name: "Change player A" }).click();
    const search = page.getByRole("combobox", { name: "Search for player A" });
    await expect(search).toBeFocused();
    await search.fill("Gilgeous");
    await page.getByRole("option", { name: /Shai Gilgeous-Alexander/ }).click();
    await expect(page.locator(".zt-compare-side[data-series='a']")).toHaveAttribute("data-row", sga.player_id);
    await expect(page).toHaveURL(new RegExp(`a=${sga.player_id}`));
    expect(Number(await attr(page, `.zt-compare-row[data-field="zts"] [data-row="${sga.player_id}"]`))).toBe(sga.zts);
    await expect(search).toHaveCount(0);
  });

  test("the distribution, the extremes, the explorer, role moves and team difficulty equal the API", async ({ page }) => {
    await openWorkbench(page, path);
    const pool = rows.filter(r => (r.minutes ?? 0) >= 500 && r.difficulty !== null).map(r => (r.difficulty as number) * 100);
    await expect(page.locator(".zt-count[data-count]").first()).toHaveAttribute("data-count", String(pool.length));
    expect(Number(await attr(page, "[data-bands] [data-field='hard'] [data-value]"))).toBe(pool.filter(v => v >= 2).length);
    expect(Number(await attr(page, "[data-bands] [data-field='easy'] [data-value]"))).toBe(pool.filter(v => v <= -2).length);
    expect(Number(await attr(page, "[data-bands] [data-field='middle'] [data-value]"))).toBe(pool.filter(v => Math.abs(v) < 1).length);
    const lo = Math.floor(Math.min(...pool));
    const first = page.locator(`.zt-hist-bin[data-bin="${lo}"]`);
    const count = pool.filter(v => v >= lo && v < lo + 1).length;
    await expect(first).toHaveAttribute("data-count", String(count));
    await first.click();
    await expect(page.locator("[data-table='zts-bin'] tbody tr[data-row]")).toHaveCount(count);

    const big = rows.filter(r => (r.minutes ?? 0) >= 1000 && r.difficulty !== null).sort((x, y) => (x.difficulty as number) - (y.difficulty as number) || x.player_id.localeCompare(y.player_id));
    const small = page.locator("[data-table='zts-small']");
    expect(await small.nth(0).locator("tbody tr[data-row]").evaluateAll(l => l.map(r => r.getAttribute("data-row")))).toEqual(big.slice(0, 5).map(r => r.player_id));
    expect(await small.nth(1).locator("tbody tr[data-row]").evaluateAll(l => l.map(r => r.getAttribute("data-row")))).toEqual(big.slice(-5).reverse().map(r => r.player_id));
    await expect(page.locator(".zt-scatter")).toHaveAttribute("data-points", String(rows.filter(r => r.rts !== null && r.difficulty !== null).length));

    const moves = fixture.role_moves;
    await expect(page.getByRole("radiogroup", { name: "Player" }).getByRole("radio")).toHaveCount(moves.players.length);
    const history = page.locator("[data-table='zts-moves'] tbody tr[data-row]");
    expect(await history.evaluateAll(l => l.map(r => r.getAttribute("data-row")))).toEqual(moves.window);
    for (const [i, h] of moves.players[0].history.entries()) expect(Number(await history.nth(i).locator("[data-field='difficulty']").getAttribute("data-value"))).toBe(h.difficulty);

    const teams = fixture.teams;
    const teamRows = page.locator("[data-table='zts-teams'] tbody tr[data-row]");
    expect(await teamRows.evaluateAll(l => l.map(r => r.getAttribute("data-row")))).toEqual(teams.teams.map((t: { team_id: string }) => t.team_id));
    expect(Number(await teamRows.first().locator("[data-field='difficulty']").getAttribute("data-value"))).toBe(teams.teams[0].difficulty);
    await expect(page.locator(".zt-spread [data-series='teams'][data-sd]")).toHaveAttribute("data-sd", String(teams.spread.teams.sd));
    await page.getByRole("button", { name: `${teams.teams[0].tricode} player roles` }).click();
    await expect(page.locator("[data-table='zts-team-players'] tbody tr[data-row]")).toHaveCount(teams.teams[0].players.length);
  });

  test("Top 200 ranks every season by zTS add and keeps playoffs unavailable", async ({ page }) => {
    await openWorkbench(page, `${path}?tab=top`);
    const list = page.locator("[data-table='zts-top'] tbody tr[data-row]");
    await expect(list).toHaveCount(200);
    expect(await list.evaluateAll(l => l.map(r => r.getAttribute("data-row")))).toEqual(fixture.top.rows.map((r: Row) => `${r.season}:${r.player_id}`));
    const top = fixture.top.rows[0];
    expect(Number(await list.first().locator("[data-field='zts_add']").getAttribute("data-value"))).toBe(top.zts_add);
    await expect(page.getByRole("radio", { name: "Post" })).toBeDisabled();
    await page.getByRole("textbox", { name: "Search players" }).fill(top.player_name.split(" ").at(-1));
    await expect(list.first()).toHaveAttribute("data-row", `${top.season}:${top.player_id}`);
  });

  test("Player opens on the named default, adds up to Expected TS, and its picker clears to an empty state", async ({ page }) => {
    await openWorkbench(page, `${path}?tab=player`);
    const player = fixture.default_player;
    await expect(page.getByText(player.selection_rule)).toBeVisible();
    expect(Number(await attr(page, ".zt-expected [data-field='expected_ts']"))).toBe(player.expected_ts);
    expect(Number(await attr(page, "[data-player-tiles] [data-field='zts'] [data-value]"))).toBe(player.zts);
    await expect(page.locator("[data-table='zts-history'] tbody tr[data-row]")).toHaveCount(player.history.length);
    await page.goto(`${path}?tab=player&player=none`);
    await expect(page.getByText("No player chosen.", { exact: false })).toBeVisible();
    await page.getByRole("button", { name: "Open the default player" }).click();
    await expect(page.getByText(player.selection_rule)).toBeVisible();
  });

  test("the dock switches views and the page fits a phone", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await openWorkbench(page, path);
    const dock = page.getByRole("navigation", { name: "zTS views" });
    await expect(dock).toBeVisible();
    for (const radio of await dock.getByRole("radio").all()) expect((await radio.boundingBox())!.height).toBeGreaterThanOrEqual(40);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(0);
    await dock.getByRole("radio", { name: "Top 200" }).click();
    await expect(page).toHaveURL(/tab=top/);
    await expect(page.locator("[data-table='zts-top'] tbody tr[data-row]")).toHaveCount(200);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(0);
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
