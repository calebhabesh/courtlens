import { waitForStreamedPage } from "./workbench-navigation";
import { expect, test, type Page } from "@playwright/test";
import archive from "./fixtures/rd16-evaluation-archive.json";
import ledger from "./fixtures/rd16-forecast-ledger.json";
import pointsEvaluation from "./fixtures/rd16-points-evaluation.json";

async function tabTo(page: Page, selector: string) {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    await page.keyboard.press("Tab");
    if (await page.locator(selector).evaluate((element) => element === document.activeElement)) return;
  }
  throw new Error(`Keyboard focus did not reach ${selector}`);
}

test("shared-cutoff comparison keeps different target dates and missing context visible", async ({ page }) => {
  await page.goto("/compare?snapshotId=snapshot-browser-fixture");
  await page.waitForLoadState("networkidle");
  await page.getByRole("combobox",{name:"Player A",exact:true}).fill("Fixture");
  await page.getByRole("option").filter({hasText:"Fixture Star"}).click();
  await page.getByRole("combobox",{name:"Player B",exact:true}).fill("Fixture");
  await page.getByRole("option").filter({hasText:"Fixture Guard"}).click();

  await expect(page).toHaveURL(/playerA=23&playerB=24/);
  const evidence = page.getByRole("region", { name: "Side by side" });
  await expect(evidence.getByText(/Jan 11, 2023 · TOR/)).toBeVisible();
  await expect(evidence.getByText(/Jan 12, 2023 · BOS/)).toBeVisible();
  await expect(evidence.getByText("Insufficient opponent coverage")).toBeVisible();
  await expect(evidence.getByText("Estimate unavailable at this cutoff")).toBeVisible();
  await page.getByRole("button", { name: "Swap players" }).click();
  await expect(page).toHaveURL(/playerA=24&playerB=23/);
});

// RD16: Points Forecasts and its Evaluation Archive tab, on the real API's responses (captured 2026-11-10 from :8000).
async function realForecasts(page: Page) {
  await page.route("**/api/workbench/forecasts/evaluation*", route => route.fulfill({ json: pointsEvaluation }));
  await page.route(/\/api\/workbench\/forecasts(\?.*)?$/, route => route.fulfill({ json: ledger }));
  await page.route("**/api/analytics/evaluations?*", route => route.fulfill({ json: archive }));
}
const PROJECT_WORDS = /prior_blend|player_only|player_plus_context|ewma_20_hl5|basketball-points-v1|\bM6\b|\bS3\b|Block F|\b[0-9a-f]{16,}\b/;

test.describe("RD16 Points Forecasts", () => {
  test("answers first, keeps the paired gain neutral and draws every model on one axis", async ({ page }) => {
    await realForecasts(page);
    await page.goto("/forecasts");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Points Forecasts");
    const tabs = page.getByRole("navigation", { name: "Points Forecasts sections" });
    await expect(tabs.getByRole("link", { name: "Points Forecasts" })).toHaveAttribute("aria-current", "page");
    const answer = page.locator("#answer");
    await expect(answer.locator("[data-field=headline]")).toContainText("Not by enough to matter. On 2025-26, a season none of them saw, all 3 models missed a player's points by about 4.6 a game.");
    await expect(answer.locator("[data-field=answer-gain]")).toContainText("Player trees missed by 0.015 points a game less than the prior blend");
    await expect(answer.locator("[data-field=answer-gain]")).toContainText("−0.014 to +0.052: it can't be told from zero. The prior blend stays.");
    const strip = page.locator("[data-chart=miss]");
    await expect(strip.locator("[data-row=miss]")).toHaveCount(3);
    await expect(strip.locator("[data-row=gain]")).not.toHaveAttribute("data-tone", /./);
    await expect(page.locator(".fc-models [data-tone]")).toHaveCount(0);
    await expect(page.locator(".fc-gates [data-gate]")).toHaveCount(4);
    await expect(page.locator(".fc-gates")).toContainText("Not passed");
    const text = await page.locator("main").innerText();
    expect(text).not.toMatch(PROJECT_WORDS);
  });

  test("switches slices in place, labels every served key and leaves changes uncoloured", async ({ page }) => {
    await realForecasts(page);
    await page.goto("/forecasts");
    const slices = page.locator("#slices");
    await expect(slices.locator("tbody tr")).toHaveCount(5);
    const before = await page.evaluate(() => scrollY);
    await page.getByRole("combobox", { name: "Slice" }).selectOption("prior_minutes_slice");
    await expect(page).toHaveURL(/slice=prior_minutes_slice/);
    await expect(slices.getByRole("heading", { level: 2 })).toHaveText("Where the misses differ: minutes, last 10 games");
    await expect(slices.locator("tbody")).toContainText("Under 15");
    await expect(slices.locator("tbody")).toContainText("28 or more");
    expect(await page.evaluate(() => scrollY)).toBe(before);
    await expect(slices.locator("[data-tone]")).toHaveCount(0);
    await expect(slices.locator("[data-field=opponent-missing]")).toContainText("missing for all 48,870 test forecasts");
  });

  test("says the ledger is a back-dated test and keeps it collapsed", async ({ page }) => {
    await realForecasts(page);
    await page.goto("/forecasts");
    const line = page.locator("#ledger [data-field=ledger-line]");
    await expect(line).toHaveAttribute("data-timing", "after");
    await expect(line).toContainText("The newest of the 489 on record is for a game on Jan 17, 2026.");
    await expect(line).toContainText("issued on Oct 1, 2026, after their games, which fall inside the test season: a back-dated test");
    const list = page.locator("#ledger-list");
    await expect(list.locator(".fc-ledger")).toBeHidden();
    await list.locator("summary").click();
    await expect(list.locator(".fc-ledger tbody tr")).toHaveCount(50);
    await expect(list.locator("[data-field=ledger-totals]")).toContainText("489 issued: 313 scored, 176 where the player did not play or was not in the box score (unknown, not zero)");
    await expect(list.locator(".fc-ledger [data-tone]")).toHaveCount(0);
    await expect(list.getByText("Not in the box score, unknown").first()).toBeVisible();
  });

  test("fits a phone by switching column groups instead of scrolling", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await realForecasts(page);
    await page.goto("/forecasts");
    await expect(page.locator("#models tbody tr")).toHaveCount(3);
    for (const table of [".fc-models", ".fc-slices", ".fc-gates"]) {
      const fits = await page.locator(`${table} .stats-scroll-region`).evaluate(e => e.scrollWidth - e.clientWidth);
      expect(fits, table).toBeLessThanOrEqual(1);
    }
    await page.getByRole("radiogroup", { name: "Model columns" }).getByRole("radio", { name: "80% ranges" }).click();
    await expect(page.locator(".fc-models thead")).toContainText("10+ games");
    await expect(page.locator(".fc-models thead")).not.toContainText("RMSE");
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBe(0);
  });

  test("the archive tab colours the one gain whose interval excludes zero", async ({ page }) => {
    await realForecasts(page);
    await page.goto("/evaluation");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Points Forecasts");
    await expect(page.getByRole("navigation", { name: "Points Forecasts sections" }).getByRole("link", { name: "Evaluation Archive" })).toHaveAttribute("aria-current", "page");
    await expect(page.locator("#answer [data-field=headline]")).toContainText("No. On 2023-24, a season none of them saw, the player + context trees missed by 0.14 reference points a game more than EWMA-20");
    await expect(page.locator("#answer [data-field=headline]")).toContainText("(95% interval 0.11 to 0.18 more, so the gap is real)");
    await expect(page.locator("[data-chart=miss] [data-row=gain]")).toHaveAttribute("data-tone", "bad");
    await expect(page.locator(".fc-gates")).toContainText("Minutes, recent games under 15: 6.3% worse");
    await expect(page.locator("main")).not.toContainText("Latest build");
    expect(await page.locator("main").innerText()).not.toMatch(PROJECT_WORDS);
    await page.locator("#about summary").click();
    await expect(page.locator("#about [data-field=run-id]")).toHaveText("6f7af9e63f27aada910d");
  });

  test("a ledger issued before its games reads as forecasts, on the mock API", async ({ page }) => {
    await page.goto("/forecasts");
    await expect(page.locator("#ledger [data-field=ledger-line]")).toHaveAttribute("data-timing", "before");
    await expect(page.locator("#ledger").getByRole("link", { name: "Fixture Star" })).toBeVisible();
    await expect(page.locator("#ledger")).toContainText("Waiting for the game");
  });
});

test("comparison controls work by keyboard and fit a 375px viewport", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/compare?snapshotId=snapshot-browser-fixture");
  await page.waitForLoadState("networkidle");

  for(const label of ["Player A","Player B"]) {
    await tabTo(page, `[role="combobox"][aria-label="${label}"]`);
    await page.keyboard.type(label === "Player A" ? "Fixture Star" : "Fixture Guard");
    await page.getByRole("option").first().waitFor();
    await page.keyboard.press("ArrowDown");await page.keyboard.press("Enter");
  }

  await expect(page.getByRole("heading", { name: "Side by side" })).toBeVisible();
  const dimensions = await page.evaluate(() => ({
    client: document.documentElement.clientWidth,
    scroll: document.documentElement.scrollWidth
  }));
  expect(dimensions.scroll).toBe(dimensions.client);
});

test("invalid date preserves selections and recovers to sparse history", async ({ page }) => {
  await page.goto(
    "/compare?playerA=23&playerB=24&date=2023-01-09&snapshotId=snapshot-browser-fixture"
  );

  await waitForStreamedPage(page);
  await expect(page.getByText("Unable to compare.", {exact:true})).toBeVisible();
  await expect(page.getByRole("button",{name:"Remove Fixture Star from Player A",exact:true})).toBeVisible();
  await expect(page.getByLabel("Replay date")).toHaveValue("2023-01-09");
  await page.getByLabel("Replay date").selectOption("2023-01-02");

  await expect(page.getByText("No reconstructed target")).toHaveCount(2);
  await expect(page.getByText("Fewer than 5 valid games")).toHaveCount(2);
});
