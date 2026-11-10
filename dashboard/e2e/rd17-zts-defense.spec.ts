import { expect, test, type Page } from "@playwright/test";
import { openWorkbench } from "./workbench-navigation";
import fixtures from "./fixtures/rd17-zts-defense.json";

/*
 * RD17 zTS → Defense on real-API fixtures (GET /api/workbench/play-types?side=defensive, captured from the owner's API on 2026-11-10):
 * the pattern line, the league's play types, every defender sorted but not ranked and never coloured, thin samples dimmed and last,
 * a traded defender's logos, choosing a defender in place without scrolling, clearing, playoffs, and the phone column switch.
 */

interface Player { player_id: string; player_name: string; team_tricodes: string[]; qualified: boolean; adjusted_per_100: number | null; possessions: number; points_per_possession: number | null }
interface View { season: string; phase: string; players: Player[]; league: { play_type: string; points_per_possession: number }[]; focus: Player & { breakdown: unknown[] }; qualification: { possessions: number } }
const views = (fixtures as unknown as { views: Record<string, View> }).views;

async function serve(page: Page) {
  await page.route(/\/api\/workbench\/play-types\?/, route => {
    const q = new URL(route.request().url()).searchParams;
    expect(q.get("side")).toBe("defensive");
    const body = views[`${q.get("season") ?? "2025-26"}:${q.get("phase") ?? "regular_season"}:${q.get("playerId") ?? ""}`];
    return body ? route.fulfill({ json: body }) : route.fulfill({ status: 404, json: { detail: "no fixture" } });
  });
}

const minus = (v: number) => `${v < 0 ? "−" : "+"}${Math.abs(v).toFixed(1)}`;

test.describe("RD17 zTS Defense", () => {
  test.beforeEach(async ({ page }) => { await serve(page); });

  test("states the pattern from qualified defenders only and calls it a pattern, not a result", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await openWorkbench(page, "/research/zts?tab=defense");
    const view = views["2025-26:regular_season:"];
    const qualified = view.players.filter(p => p.qualified && p.adjusted_per_100 != null).sort((a, b) => a.adjusted_per_100! - b.adjusted_per_100!);
    const line = page.locator("[data-field=pattern]");
    await expect(line).toHaveAttribute("data-lowest", qualified[0].player_id);
    await expect(line).toHaveAttribute("data-highest", qualified.at(-1)!.player_id);
    await expect(line).toHaveAttribute("data-qualified", String(qualified.length));
    await expect(line).toContainText("A pattern, not a result");
    await expect(line).toContainText(`${qualified[0].player_name} allowed the fewest points against expectation (${minus(qualified[0].adjusted_per_100!)} per 100`);
    // Seven play types on the league bars, in the served order.
    await expect(page.locator(".ztd-league .rs-leaders-list > li")).toHaveCount(view.league.length);
    // No hashes or project codes in the visible text.
    const visible = await page.locator("main").evaluate(main => (main as HTMLElement).innerText);
    expect(visible).not.toMatch(/court(?:load|lens)-[a-z]|\b[0-9a-f]{16,}\b/);
  });

  test("lists every defender sorted, not ranked: no colour, thin samples dimmed and last, traded defenders with each logo", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await openWorkbench(page, "/research/zts?tab=defense");
    const view = views["2025-26:regular_season:"];
    const grid = page.getByRole("table", { name: "Defenders by play type, 2025-26 regular season" });
    const rows = grid.locator("tbody tr");
    await expect(rows).toHaveCount(view.players.length);
    const order = await rows.evaluateAll(trs => trs.map(tr => [tr.getAttribute("data-player"), tr.getAttribute("data-qualified")]));
    const firstThin = order.findIndex(([, q]) => q === "false");
    expect(order.slice(firstThin).every(([, q]) => q === "false")).toBe(true);
    expect(firstThin).toBe(view.players.filter(p => p.qualified).length);
    expect(order[0][0]).toBe(view.players.filter(p => p.qualified).sort((a, b) => a.adjusted_per_100! - b.adjusted_per_100!)[0].player_id);
    // No good/bad colour anywhere in the grid and no rank column.
    expect(await grid.locator("[data-tone]").count()).toBe(0);
    await expect(grid.locator("thead")).not.toContainText("#");
    // CJ McCollum played for two teams: both codes with their logos.
    const cj = grid.locator('tr[data-player="203468"]');
    await expect(cj.locator("[data-field=teams]")).toContainText("ATL");
    await expect(cj.locator("[data-field=teams]")).toContainText("WAS");
    await expect(cj.locator("[data-field=teams] img")).toHaveCount(2);
    // Value check against the fixture for one row.
    const reed = view.players.find(p => p.player_id === "1630194")!;
    await expect(grid.locator('tr[data-player="1630194"] [data-field=adjusted_per_100]')).toHaveText(minus(reed.adjusted_per_100!));
    await expect(grid.locator('tr[data-player="1630194"] [data-field=points_per_possession]')).toHaveText(reed.points_per_possession!.toFixed(2));
    // Search filters in place.
    await grid.getByRole("searchbox").or(grid.getByRole("textbox")).first().fill("McCollum");
    await expect(rows).toHaveCount(1);
  });

  test("chooses a defender in place without scrolling, clears to an empty state and returns", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await openWorkbench(page, "/research/zts?tab=defense");
    const card = page.locator("[data-field=defender-card]");
    await expect(card).toHaveAttribute("data-player", views["2025-26:regular_season:"].focus.player_id);
    await expect(page.locator("[data-field=focus-rule]")).toBeVisible();
    const pick = page.getByRole("button", { name: "Show CJ McCollum's play types" });
    await pick.scrollIntoViewIfNeeded();
    const before = await page.evaluate(() => scrollY);
    await pick.click();
    await expect(page).toHaveURL(/dPlayer=203468/);
    await expect(card).toHaveAttribute("data-player", "203468");
    expect(Math.abs(await page.evaluate(() => scrollY) - before)).toBeLessThan(2);
    // A thin sample says so.
    await openWorkbench(page, "/research/zts?tab=defense&dPlayer=1631132");
    await expect(page.locator("[data-field=thin]")).toContainText("A small sample");
    await page.getByRole("button", { name: "Clear the defender" }).click();
    await expect(page).toHaveURL(/dPlayer=none/);
    await expect(page.locator("[data-field=defender-empty]")).toBeVisible();
    await page.getByRole("button", { name: "Show the busiest defender" }).click();
    await expect(card).toHaveAttribute("data-player", views["2025-26:regular_season:"].focus.player_id);
  });

  test("serves playoffs and switches column groups on a phone without scrolling sideways", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await openWorkbench(page, "/research/zts?tab=defense&dSeason=2024-25&dPhase=playoffs");
    const view = views["2024-25:playoffs:"];
    await expect(page.locator("[data-field=count]")).toHaveAttribute("data-count", String(view.players.length));
    await expect(page.locator("[data-field=qualification]")).toHaveAttribute("data-possessions", String(view.qualification.possessions));
    const grid = page.getByRole("table", { name: "Defenders by play type, 2024-25 playoffs" });
    await expect(grid.locator("thead")).toContainText("Per poss");
    await expect(grid.locator("thead")).not.toContainText("GP");
    await page.getByRole("radiogroup", { name: "Defender columns" }).getByRole("radio", { name: "Volume" }).click();
    await expect(grid.locator("thead")).toContainText("GP");
    for (const frame of await page.locator(".rs-grid .stats-scroll-region").all()) {
      expect(await frame.evaluate(el => el.scrollWidth - el.clientWidth)).toBeLessThanOrEqual(1);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });
});
