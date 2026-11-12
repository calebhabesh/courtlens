import { readFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";
import type { LiveRead, LiveSlateData } from "../lib/live";
import type { HeadToHead, WinProbabilityPage, WinProbabilityWhy } from "../lib/win-probability";

// W5: the page's v4 sections. `real` is the API's answer on 2026-11-12 (no game graded yet, the
// frozen do-no-harm check); `graded` is TEST DATA for the populated layout, never shown as real.
const read = <T,>(name: string): T => JSON.parse(readFileSync(`e2e/fixtures/${name}.json`, "utf8"));
const real = read<{ page: WinProbabilityPage }>("win-probability-page").page;
const slate = read<LiveRead<LiveSlateData>>("live-slate-2026-11-12");
const why = read<WinProbabilityWhy>("win-probability-why-401909976");
const evidence = process.env.W5_EVIDENCE_DIR;

const interval = (mean: number, spread: number, games: number) => ({ mean, low: mean - spread, high: mean + spread, games });
const curve = [{ predicted: 0.2, observed: 0.18, share: 0.3 }, { predicted: 0.5, observed: 0.53, share: 0.4 }, { predicted: 0.8, observed: 0.79, share: 0.3 }];
const graded: WinProbabilityPage = {
  ...real,
  head_to_head: {
    ...real.head_to_head!, games: 40,
    record_of_calls: { games: 40, original: 25.5, market_informed: 27, line: { games: 39, right: 26.5 }, toss_ups: 6 },
    current: { games: 40, through: "2026-11-20T03:00Z", v1: { ...interval(9.1, 6, 40), result: "better" }, v2: { ...interval(0.004, 0.01, 40), result: "inconclusive", phases: {} } },
  } as HeadToHead,
  head_to_head_calibration: { games: 40, market_informed: { curve, calibration_error: 0.021 }, original: { curve, calibration_error: 0.024 } },
  worked_example: { ...real.worked_example!, stored: true, why: { ...why, result: { home_score: 110, away_score: 101, calls: null } },
    game: { game_id: why.game_id, date: why.date, home: "PHI", away: "TOR", home_score: 110, away_score: 101, calls: { original: 1, market_informed: 1, line: 1 } } },
};

async function mock(page: Page, body: WinProbabilityPage, liveSlate: LiveRead<LiveSlateData> = slate) {
  await page.route("**/api/win-probability", route => route.fulfill({ json: body }));
  await page.route("**/api/live?**", route => route.fulfill({ json: liveSlate }));
}

async function shot(page: Page, name: string) {
  if (!evidence) return;
  await page.evaluate(() => Promise.all(document.getAnimations().map(a => a.finished.catch(() => undefined))));
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${evidence}/${name}.png`, fullPage: true, style: ".courtlens-header, .skip-link { visibility: hidden !important; }" });
}

test("the v4 sections come first, in the plan's order, and read correctly before any graded game", async ({ page }) => {
  await mock(page, real);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/research/win-probability");
  await expect(page.getByText("CourtLens picks a favorite for every game, shows its reasoning, and is graded every night.")).toBeVisible();
  const ids = await page.locator(".wp-page > section.rs-section, .wp-page > h2#evidence").evaluateAll(els => els.map(e => e.id));
  expect(ids.slice(0, 6)).toEqual(["slate", "track-record", "how", "trial", "evidence", "answer"]);
  await expect(page.locator(".wp-slate .live-card")).toHaveCount(4);
  await expect(page.locator(".wp-slate .live-card").first().locator(".live-card-call")).toHaveText(/CourtLens favors\s*PHI\s*71%/);
  await expect(page.locator('[data-field="record-empty"]')).toContainText("No game has been graded yet");
  await expect(page.locator('[data-field="weight"]')).toContainText("100%. With a line, the pregame margin is the line");
  await expect(page.locator('[data-field="example-empty"]')).toBeVisible();
  await expect(page.locator('[data-field="example-rule"]')).toContainText("a player ESPN listed Out cost at least 1.0 point");
  await expect(page.locator('[data-field="trial-progress"]')).toContainText("0 of 300 games");
  await expect(page.locator('[data-field="too-early"]')).toContainText("Too early to call");
  await expect(page.locator('[data-field="too-early"]')).toContainText("Running numbers appear from game 25");
  await expect(page.locator('[data-field="serving"]')).toHaveAttribute("data-model", "market_informed");
  await expect(page.locator('[data-field="do-no-harm"]')).toContainText("On 2,439 games of 2024-25 and 2025-26");
  await expect(page.locator('[data-field="do-no-harm"]')).toContainText("It passed all three.");
  await page.getByText(/^Protocol notes/).click();
  await expect(page.locator('[data-field="protocol-notes"] li')).toHaveCount(real.protocol_notes!.length);
  await shot(page, "w5-page-1440");
  await page.setViewportSize({ width: 390, height: 844 });
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await shot(page, "w5-page-390");
});

test("offseason: no slate today or earlier says so", async ({ page }) => {
  await mock(page, real, { ...slate, data: { games: [], calendar: [] } });
  await page.goto("/research/win-probability");
  await expect(page.locator('[data-field="slate-empty"]')).toContainText("No games are scheduled");
});

test("a day with no games shows the latest earlier slate", async ({ page }) => {
  await page.route("**/api/win-probability", route => route.fulfill({ json: real }));
  await page.route("**/api/live?**", route => {
    const day = new URL(route.request().url()).searchParams.get("slate_date");
    return route.fulfill({ json: day === "2026-11-12" ? slate : { ...slate, data: { games: [], calendar: ["2026-11-10", "2026-11-12", "2099-01-01"] } } });
  });
  await page.clock.setFixedTime(new Date("2026-11-13T17:00:00Z"));
  await page.goto("/research/win-probability");
  await expect(page.getByRole("heading", { name: "The latest slate" })).toBeVisible();
  await expect(page.locator('[data-field="slate-day"]')).toHaveAttribute("data-day", "2026-11-12");
});

test("graded games (test data): record, calibration, the worked example and the running read", async ({ page }) => {
  await mock(page, graded);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/research/win-probability");
  await expect(page.locator('[data-field="record"]')).toHaveText("On 40 games since the freeze, CourtLens picked the winner 27 times (68%).");
  await expect(page.locator('[data-field="record-table"]')).toContainText("25.5 of 40");
  await expect(page.locator('[data-field="record-table"]')).toContainText("26.5 of 39");
  await expect(page.getByRole("figure", { name: "Calibration on the graded games" })).toBeVisible();
  const example = page.locator('[data-field="example"]');
  await expect(example.locator('[data-field="headline"]')).toContainText("CourtLens favors");
  await expect(example.locator('[data-field="result"]')).toContainText("the call was right");
  await expect(page.locator('[data-field="v1"]')).toContainText("+9.10");
  await expect(page.locator('[data-field="v2"]')).toContainText("no clear difference");
  await expect(page.locator('[data-field="too-early"]')).toContainText("The running numbers below can change");
  await shot(page, "w5-page-graded-test-data-1440");
});
