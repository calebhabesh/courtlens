import { readFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";
import type { LiveGameData, LiveRead, LiveSlateData } from "../lib/live";

// Real reads of ESPN through the CourtLens API (2026-10-26 finals, 2026-10-27 upcoming).
const fixture = <T,>(name: string): LiveRead<T> => JSON.parse(readFileSync(`e2e/fixtures/live-${name}.json`, "utf8"));
const finals = fixture<LiveSlateData>("slate-2026-10-26");
const upcoming = fixture<LiveSlateData>("slate-2026-10-27");
const games: Record<string, LiveRead<LiveGameData>> = { "401909869": fixture("game-401909869"), "401909870": fixture("game-401909870"), "401909877": fixture("game-401909877") };

async function mock(page: Page, overrides: Record<string, (url: URL) => unknown> = {}) {
  const calls: string[] = [];
  await page.route("**/api/live**", async route => {
    const url = new URL(route.request().url());
    calls.push(`${url.pathname}${url.search}`);
    for (const [key, respond] of Object.entries(overrides)) if (`${url.pathname}${url.search}`.includes(key)) return route.fulfill({ json: respond(url) });
    const id = url.pathname.match(/games\/(\d+)/)?.[1];
    if (id) return games[id] ? route.fulfill({ json: games[id] }) : route.fulfill({ status: 502, json: { detail: "Live service unavailable" } });
    const day = url.searchParams.get("slate_date");
    return route.fulfill({ json: day === "2026-10-27" ? upcoming : day === "2026-10-26" ? finals : { ...finals, resource: `slate:${day}`, data: { games: [], calendar: finals.data!.calendar } } });
  });
  return calls;
}

const slate = (page: Page) => page.getByRole("region", { name: "Game slate" });

test("board: centred date strip, four-across final cards, hotkeys open a game", async ({ page }) => {
  await mock(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/live/2026-10-26");
  const strip = page.getByRole("navigation", { name: "Live dates" });
  await expect(strip.locator('[aria-current="date"]')).toContainText("26");
  await expect(strip.getByRole("link")).toHaveCount(9);
  await expect(slate(page).getByRole("link")).toHaveCount(9);
  const card = slate(page).getByRole("link").nth(1);
  await expect(card).toContainText("Final/OT");
  await expect(card).toContainText("MIN");
  await expect(card).toContainText("125");
  await expect(card).toContainText("127");
  await expect(card.locator(".live-card-team[data-lost]")).toContainText("MIN");
  const tops = await slate(page).getByRole("link").evaluateAll(cards => cards.slice(0, 5).map(c => Math.round(c.getBoundingClientRect().top)));
  expect(new Set(tops.slice(0, 4)).size).toBe(1);
  expect(tops[4]).toBeGreaterThan(tops[0]);
  await page.keyboard.press("2");
  await expect(page).toHaveURL(/\/live\/games\/401909869\?date=2026-10-26$/);
});

test("upcoming cards carry the free line and injury counts", async ({ page }) => {
  await mock(page);
  await page.goto("/live/2026-10-27");
  const card = slate(page).getByRole("link").first();
  await expect(card).toContainText("PM ED");
  await expect(card).toContainText("BOS by 12.5");
  await expect(card.getByText("BOS by 12.5")).toHaveAttribute("title", "Spread (DraftKings): Boston Celtics favored by 12.5 points");
  await expect(card).toContainText("O/U 222.5");
  await expect(card).toContainText("1 OUT");
  await expect(card.locator(".live-card-score").first()).toHaveText("0");
});

test("the shortcut is a key cap, not HK; an upcoming game opens on Pre-Game", async ({ page }) => {
  await mock(page);
  await page.goto("/live/2026-10-27");
  const card = slate(page).getByRole("link").first();
  await expect(card).not.toContainText("HK");
  await expect(card.locator("kbd.live-card-key")).toHaveAttribute("title", "Press 1 to open this game");
  await page.keyboard.press("1");
  await expect(page).toHaveURL(/\/live\/games\/401909877\?date=2026-10-27$/);
  await expect(page.getByRole("tab", { name: "Pre-Game" })).toHaveAttribute("aria-selected", "true");
  await expect(page.getByRole("region", { name: "Betting Lines" })).toContainText("BOS −12.5");
  // A tab the viewer picks still wins, and Summary is the one that needs the URL now.
  await page.getByRole("tab", { name: "Summary" }).click();
  await expect(page).toHaveURL(/tab=summary/);
  await page.getByRole("tab", { name: "Pre-Game" }).click();
  await expect(page).not.toHaveURL(/tab=/);
  // A final game still opens on Summary.
  await page.goto("/live/games/401909869?date=2026-10-26");
  await expect(page.getByRole("tab", { name: "Summary" })).toHaveAttribute("aria-selected", "true");
});

test("summary: line score, leaders, shot chart and team stats", async ({ page }) => {
  await mock(page);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/live/games/401909869?date=2026-10-26");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Minnesota Timberwolves at Cleveland Cavaliers");
  const banner = page.locator(".live-banner");
  await expect(banner).toContainText("Final/OT");
  await expect(banner.locator("[data-lost]")).toContainText("125");
  const line = page.getByRole("region", { name: "Line score" });
  await expect(line.getByRole("row").nth(1)).toContainText("31292627");
  await expect(line.getByRole("columnheader", { name: "OT1" })).toBeVisible();
  await expect(page.getByRole("group", { name: "Points" })).toContainText("Anthony Edwards");
  await expect(page.getByRole("group", { name: "Points" })).toContainText("47");
  const court = page.getByRole("img", { name: /Shot chart, all periods/ });
  await expect(court).toHaveAttribute("aria-label", /MIN 49-102, CLE 46-104 field goals/);
  expect(await court.locator(".live-shot").count()).toBe(206);
  await page.getByRole("radiogroup", { name: "Shot chart period" }).getByText("OT1").click().catch(async () => page.getByRole("button", { name: "OT1" }).click());
  await expect(page.getByRole("img", { name: /Shot chart, OT1/ })).toBeVisible();
  await expect(page.getByRole("region", { name: "Team Stats" })).toContainText("48.0% (49/102)");
  await expect(page.getByRole("region", { name: "Game Info" })).toContainText("Rocket Arena");
});

test("box score: Databallr's columns, starters and bench, Q and W", async ({ page }) => {
  await mock(page);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/live/games/401909869?date=2026-10-26&tab=box");
  const away = page.getByRole("region", { name: "Minnesota Timberwolves box score" });
  await expect(away.getByRole("columnheader")).toContainText(["Player", "MIN", "PTS", "TS%", "REB(OFF)", "AST", "STL", "BLK", "PF", "TO", "2P", "3PT", "FT", "+/-"]);
  const edwards = away.getByRole("row").filter({ hasText: "A. Edwards" });
  await expect(edwards).toContainText("47");
  // ESPN's box: 19-34 FG, 5-15 3PT, 4-6 FT.
  await expect(edwards.locator('[data-tone="high"]')).toHaveText("64.1");
  await expect(edwards).toContainText("14/19");
  await expect(away.getByRole("rowheader", { name: "Starters" })).toBeVisible();
  await expect(away.getByRole("rowheader", { name: "Bench" })).toBeVisible();
  await expect(away.locator("tfoot")).toContainText("125");
  await page.locator("body").click({ position: { x: 5, y: 5 } });
  await page.keyboard.press("w");
  await expect(page.locator("#live-box-home")).toBeFocused();
  await expect(page.getByRole("region", { name: "Recent plays" })).toContainText("End of Game");
  await page.getByRole("button", { name: "View all plays" }).click();
  await expect(page).toHaveURL(/tab=plays/);
});

test("play-by-play: newest first, scoring sums, search and periods", async ({ page }) => {
  await mock(page);
  await page.goto("/live/games/401909869?date=2026-10-26&tab=plays");
  const plays = page.getByRole("list", { name: "Plays, newest first" }).getByRole("listitem");
  await expect(page.getByRole("status").filter({ hasText: "of 561 plays" })).toHaveText("561 of 561 plays");
  await expect(plays.first()).toContainText("End of Game");
  // The running score sums scoring plays (ESPN's own lags): 122-127 before Edwards' three.
  const three = plays.filter({ hasText: "Anthony Edwards makes 28-foot three pointer" });
  await expect(three).toHaveAttribute("data-scoring", "true");
  await expect(three).toContainText("MIN 125");
  await expect(plays.nth(3)).toContainText("122");
  await expect(plays.nth(3)).toContainText("127 CLE");
  await page.getByRole("searchbox", { name: "Search play-by-play" }).fill("Gobert");
  await expect(page.getByRole("status").filter({ hasText: "of 561 plays" })).not.toHaveText("561 of 561 plays");
  for (const text of await plays.allTextContents()) expect(text).toContain("Gobert");
});

test("pre-game: injury report and the one free line", async ({ page }) => {
  await mock(page);
  await page.goto("/live/games/401909869?date=2026-10-26&tab=pregame");
  const injuries = page.getByRole("region", { name: "Injury Report" });
  await expect(injuries).toContainText("Donte DiVincenzo");
  await expect(injuries.locator('[data-status="out"]')).toHaveText("Out");
  await expect(injuries).toContainText("No injuries reported");
  const lines = page.getByRole("region", { name: "Betting Lines" });
  await expect(lines).toContainText("CLE −3.5");
  await expect(lines).toContainText("Cleveland Cavaliers favored by 3.5 points");
  await expect(lines).toContainText("Cleveland Cavaliers favored to win");
  await expect(lines).toContainText("About 234.5 points combined");
  await expect(lines).toContainText("CLE -155 · MIN +130");
  await expect(lines).toContainText("O/U 234.5");
  await expect(lines).toContainText("DraftKings via ESPN");
});

test("game hotkeys and the All Games rail", async ({ page }) => {
  await mock(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/live/games/401909869?date=2026-10-26");
  const rail = page.getByRole("navigation", { name: "All games" });
  await expect(rail.getByRole("link")).toHaveCount(9);
  await expect(rail.locator('[aria-current="page"]')).toContainText("MIN");
  const box = await rail.boundingBox();
  expect(Math.round(box!.y + box!.height)).toBe(900);
  await page.keyboard.press("3");
  await expect(page).toHaveURL(/games\/401909870/);
  await expect(page.locator(".live-banner")).toContainText("BOS");
  await page.keyboard.press("Tab");
  await expect(page).toHaveURL(/tab=box/);
  await page.keyboard.press("Shift+Tab");
  await expect(page).not.toHaveURL(/tab=/);
  await page.keyboard.press("Escape");
  await expect(page).toHaveURL(/\/live\/2026-10-26$/);
});

test("an empty landing opens the nearest game date; explicit dates stay put", async ({ page }) => {
  await mock(page);
  await page.goto("/live/2026-10-01");
  await expect(page.locator("main")).toContainText("No games on");
  await expect(page).toHaveURL(/\/live\/2026-10-01$/);
  await page.clock.setFixedTime(new Date("2026-10-02T16:00:00Z"));
  await page.goto("/live");
  await expect(page).toHaveURL(/\/live\/2026-10-0[1-9]|\/live\/2026-09/);
});

test("in-progress reads refresh on the API's cadence; finals read once", async ({ page }) => {
  await page.clock.install();
  const live = { ...finals, final: false, refresh_seconds: 20, data: { ...finals.data!, games: finals.data!.games.map(g => ({ ...g, status: "in_progress" as const, period: 3, clock: "4:21" })) } };
  const calls = await mock(page, { "slate_date=2026-10-26": () => live });
  await page.goto("/live/2026-10-26");
  await expect(slate(page)).toContainText("Q3 4:21");
  const first = calls.length;
  await page.clock.fastForward(21_000);
  await expect.poll(() => calls.length).toBeGreaterThan(first);
  await page.unrouteAll();
  const finalCalls = await mock(page);
  await page.goto("/live/2026-10-25");
  await page.goto("/live/2026-10-26");
  await expect(slate(page)).toContainText("Final");
  const settled = finalCalls.length;
  await page.clock.fastForward(120_000);
  expect(finalCalls.length).toBe(settled);
});

test("a game ESPN can't serve says so", async ({ page }) => {
  await mock(page);
  await page.goto("/live/games/999?date=2026-10-26");
  await expect(page.locator("main")).toContainText("isn't available from ESPN right now");
});

for (const view of [{ name: "board", path: "/live/2026-10-26" }, { name: "game", path: "/live/games/401909869?date=2026-10-26&tab=box" }, { name: "summary", path: "/live/games/401909869?date=2026-10-26" }]) {
  test(`phone ${view.name} has no page overflow`, async ({ page }) => {
    await mock(page);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(view.path);
    await expect(page.locator(".live-page")).toBeVisible();
    await page.waitForTimeout(300);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });
}
