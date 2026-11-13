import { readFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";
import type { LiveGameData, LiveRead, LiveSlateData } from "../lib/live";
import type { WinProbabilityWhy } from "../lib/win-probability";

// W4: real reads of 2026-11-12 (the demo's slate and game, the cards and the "why" built from the VPS's
// 19:10Z post-freeze seal by the PR's API code). Screenshots only when W4_EVIDENCE_DIR is set.
const read = <T,>(name: string): T => JSON.parse(readFileSync(`e2e/fixtures/${name}.json`, "utf8"));
const slate = read<LiveRead<LiveSlateData>>("live-slate-2026-11-12");
const game = read<LiveRead<LiveGameData>>("live-game-401909976");
const why = read<WinProbabilityWhy>("win-probability-why-401909976");
const evidence = process.env.W4_EVIDENCE_DIR;

async function mock(page: Page, { slateRead = slate, breakdown = { status: 200, json: why as unknown } }: { slateRead?: LiveRead<LiveSlateData>; breakdown?: { status: number; json: unknown } } = {}) {
  await page.route("**/api/live**", async route => {
    const url = new URL(route.request().url());
    if (url.pathname.endsWith("/win-probability")) return route.fulfill({ status: 503, json: { detail: "Win probability model unavailable" } });
    if (/games\/401909976$/.test(url.pathname)) return route.fulfill({ json: game });
    if (url.pathname.includes("/games/")) return route.fulfill({ status: 502, json: { detail: "Live service unavailable" } });
    return route.fulfill({ json: slateRead });
  });
  await page.route("**/api/win-probability/games/**", route => route.fulfill(breakdown));
}

async function shot(page: Page, name: string, region?: string) {
  if (!evidence) return;
  await page.evaluate(() => Promise.all(document.getAnimations().map(a => a.finished.catch(() => undefined))));
  await page.waitForTimeout(300);
  // A region shot, so the sticky header and the All Games rail don't cover a full-page capture.
  const style = ".courtlens-header, .live-rail, .skip-link { visibility: hidden !important; }";
  if (region) await page.getByRole("region", { name: region }).screenshot({ path: `${evidence}/${name}.png`, style });
  else await page.screenshot({ path: `${evidence}/${name}.png`, style });
}

const cards = (page: Page) => page.getByRole("region", { name: "Game slate" }).getByRole("link");

test("cards carry the own read's sealed call above the book's chips, the call with the line beside it", async ({ page }) => {
  await mock(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/live/2026-11-12");
  const first = cards(page).first();
  const call = first.locator(".live-card-call");
  // W-D16: the call is the own read (PHI 56%); the Market-informed model's number follows in grey.
  await expect(call).toHaveText(/CourtLens favors\s*PHI\s*56%/);
  await expect(call).toHaveAttribute("title", /^CourtLens' own read \(Original model\): the sealed tip-off probability, sealed 2:10 PM EST/);
  await expect(call.locator(".live-card-call-alt")).toHaveText("with the line PHI 71%");
  await expect(call.locator(".live-card-call-alt")).toHaveAttribute("title", /Market-informed model, on trial/);
  await expect(first).not.toContainText("Market-informed");
  // The call sits above the line chips.
  const [callBox, lineBox] = [await call.boundingBox(), await first.locator(".live-card-line").boundingBox()];
  expect(callBox!.y).toBeLessThan(lineBox!.y);
  await expect(cards(page).nth(1).locator(".live-card-call")).toHaveText(/CourtLens favors\s*DET\s*88%/);
  await expect(cards(page).nth(1).locator(".live-card-call-alt")).toHaveText("with the line DET 84%");
  await shot(page, "w4-cards-1440");
  await page.setViewportSize({ width: 390, height: 844 });
  await shot(page, "w4-cards-390");
});

test("final, in-progress, toss-up and unsealed cards", async ({ page }) => {
  const games = slate.data!.games;
  const final = (g: (typeof games)[number], homeScore: number, awayScore: number, right: boolean) => ({ ...g, status: "final" as const,
    teams: g.teams.map(t => ({ ...t, score: t.side === "home" ? homeScore : awayScore, winner: t.side === "home" ? homeScore > awayScore : awayScore > homeScore })),
    prediction: { ...g.prediction!, right } });
  const changed = { ...slate, data: { ...slate.data!, games: [
    final(games[0], 110, 101, true),
    final(games[1], 115, 101, false),
    { ...games[2], status: "in_progress" as const, period: 2, clock: "4:12", teams: games[2].teams.map(t => ({ ...t, score: 40 })) },
    { ...games[3], prediction: { ...games[3].prediction!, toss_up: true, home_win: 0.52, probability: 0.52 } },
  ] } };
  await mock(page, { slateRead: changed });
  await page.goto("/live/2026-11-12");
  await expect(cards(page).nth(0).locator(".live-card-call")).toHaveText(/Called\s*PHI\s*56%\s*right/);
  await expect(cards(page).nth(0).locator(".live-card-call")).toHaveAttribute("data-right", "true");
  await expect(cards(page).nth(1).locator(".live-card-call")).toHaveText(/Called\s*DET\s*88%\s*wrong/);
  await expect(cards(page).nth(2).locator(".live-card-call")).toHaveText(/Pregame call:\s*MIN\s*71%/);
  await expect(cards(page).nth(3).locator(".live-card-call")).toHaveText(/Toss-up ·\s*PHX\s*52%/);

  await mock(page, { slateRead: { ...slate, data: { ...slate.data!, games: [{ ...games[0], prediction: { status: "no_seal" } }, { ...games[1], prediction: null }] } } });
  await page.reload();
  await expect(cards(page).nth(0)).toContainText("No prediction was sealed for this game");
  await expect(cards(page).nth(1).locator(".live-card-call")).toHaveCount(0);
});

test("pre-game: the CourtLens prediction panel adds up and names its inputs", async ({ page }) => {
  await mock(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/live/games/401909976?date=2026-11-12&tab=pregame");
  const panel = page.getByRole("region", { name: "CourtLens Prediction" });
  // Opened from Live, there is no way back to Win Probability; that link appears only from its cards.
  await expect(panel.getByRole("link", { name: "Back to Win Probability" })).toHaveCount(0);
  await expect(panel.locator('[data-field="headline"]')).toHaveText(/CourtLens\s*favors\s*Philadelphia 76ers\s*· 56% to win · predicted margin PHI by 2.1/);
  const rows = panel.locator(".lp-bar-row[data-row]");
  await expect(rows).toHaveCount(6);
  await expect(panel.locator('.lp-bar-row[data-row="players"] .lp-bar-value')).toHaveText("TOR +0.5");
  await expect(panel.locator('.lp-bar-row[data-row="rest_travel"] .lp-bar-value')).toHaveText("PHI +2.1");
  // W-D16: the groups add up to the prediction, the own read; the line's version is a comparison row under it.
  await expect(panel.locator('.lp-bar-row[data-row="own"]')).toHaveCount(0);
  await expect(panel.locator('.lp-bar-row[data-row="prediction"] .lp-bar-label')).toHaveText("Prediction: CourtLens' own read");
  await expect(panel.locator('.lp-bar-row[data-row="prediction"] .lp-bar-value')).toHaveText(/PHI by 2.1\s*gives\s*56%/);
  await expect(panel.locator('.lp-bar-row[data-row="market"] .lp-bar-label')).toHaveText("With the betting line");
  await expect(panel.locator('.lp-bar-row[data-row="market"] .lp-bar-value')).toHaveText(/PHI by 7.5\s*gives\s*PHI 71%/);
  // The rows add up exactly, on the served values.
  const points = await rows.evaluateAll(els => Object.fromEntries(els.map(e => [e.getAttribute("data-row"), Number(e.getAttribute("data-points"))])));
  expect(points.players + points.form + points.home_court + points.rest_travel).toBeCloseTo(points.prediction, 9);
  expect(points.prediction).toBe(why.own.own);
  expect(points.market).toBe(7.5);
  // Home bars grow right of the centre line, away bars left of it.
  const centre = await panel.locator('.lp-bar-row[data-row="market"] .lp-bar-track').boundingBox();
  const homeBar = await panel.locator('.lp-bar-row[data-row="market"] .lp-bar').boundingBox();
  const awayBar = await panel.locator('.lp-bar-row[data-row="form"] .lp-bar').boundingBox();
  expect(homeBar!.x).toBeGreaterThanOrEqual(centre!.x + centre!.width / 2 - 1);
  expect(awayBar!.x + awayBar!.width).toBeLessThanOrEqual(centre!.x + centre!.width / 2 + 1);

  await expect(panel.locator('[data-field="market"]')).toHaveText("The prediction is CourtLens' own read; the betting line is not in it. The line is PHI by 7.5 (DraftKings). A second model, on trial, moves 100% of the way from the own read to the line; its number is the last row.");
  await expect(panel).toContainText("not a straight conversion of the margin");
  await expect(panel).toContainText("Kawhi Leonard");
  await expect(panel).toContainText("costs TOR about 2.5 points");
  await expect(panel).toContainText("helps PHI about 0.2 points");
  await expect(panel).toContainText("Questionable and Doubtful players count as playing");
  await expect(panel.locator('[data-field="ages"]')).toHaveText(/Sealed 2:10 PM EST · box scores through Nov 11 · ratings as of Nov 1/);
  await expect(panel.locator('[data-field="model"]')).toHaveText(/Model: Original model, CourtLens' own read\.\s*With the betting line, the Market-informed model \(on trial\) gave PHI 71%\.\s*Not betting advice\./);
  // The panel comes first on Pre-Game.
  const regions = await page.locator(".live-pregame > section").evaluateAll(els => els.map(e => e.getAttribute("aria-label")));
  expect(regions[0]).toBe("CourtLens Prediction");

  await panel.getByText("Exact inputs").click();
  const grid = panel.getByRole("table", { name: "Exact inputs" });
  await expect(grid).toBeVisible();
  await expect(grid.locator('[data-input="b2b_away"] [data-field="contribution"]')).toHaveAttribute("data-value", String(why.own.groups[3].rows[2].contribution));
  await expect(panel).toContainText(why.seal);
  await panel.getByText("Players available, by expected minutes").click();
  await shot(page, "w4-pregame-1440", "CourtLens Prediction");
  await page.setViewportSize({ width: 390, height: 844 });
  // Open, the inputs table scrolls inside its own frame; the page never scrolls sideways.
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await shot(page, "w4-pregame-390", "CourtLens Prediction");
});

test("pre-game: no line, the Original's pre-freeze call, a result, and no seal", async ({ page }) => {
  await mock(page, { breakdown: { status: 200, json: { ...why, market: { status: "no_line", w: 1 }, market_informed: null, prediction: { home_margin: why.own.own, home_win: 0.58 }, result: { home_score: 101, away_score: 110, calls: null } } } });
  await page.goto("/live/games/401909976?date=2026-11-12&tab=pregame");
  const panel = page.getByRole("region", { name: "CourtLens Prediction" });
  await expect(panel.locator('[data-field="market"]')).toHaveText("No line when this was sealed; own read only.");
  await expect(panel.locator('.lp-bar-row[data-row="market"]')).toHaveCount(0);
  await expect(panel.locator('[data-field="result"]')).toHaveText(/Final: TOR 110, PHI 101 · the call was WRONG/);
  await expect(panel.locator('[data-field="result"]')).toHaveAttribute("data-right", "false");

  await mock(page, { breakdown: { status: 200, json: { ...why, model: "original", market: { status: "sealed_before_freeze" }, market_informed: null, prediction: { home_margin: why.own.own, home_win: 0.577 } } } });
  await page.reload();
  await expect(panel.locator('[data-field="market"]')).toContainText("Original model's call");
  await expect(panel.locator('[data-field="model"]')).toHaveText(/^Model: Original model, CourtLens' own read\.\s*Not betting advice\.$/);
  await expect(panel.locator('.lp-bar-row[data-row="market"]')).toHaveCount(0);

  await mock(page, { breakdown: { status: 404, json: { detail: "No prediction was sealed for this game" } } });
  await page.reload();
  await expect(panel.locator('[data-field="no-seal"]')).toHaveText("No prediction was sealed for this game.");
});

test("pre-game opened from a Win Probability card links back to that day's board", async ({ page }) => {
  await mock(page);
  await page.goto("/live/games/401909976?date=2026-11-12&tab=pregame&from=win-probability");
  const back = page.getByRole("region", { name: "CourtLens Prediction" }).getByRole("link", { name: "Back to Win Probability" });
  await expect(back).toHaveAttribute("href", "/research/win-probability?day=2026-11-12");
});
