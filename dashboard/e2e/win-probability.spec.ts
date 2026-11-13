import { readFileSync } from "node:fs";
import { expect, test, type Locator, type Page } from "@playwright/test";
import type { LiveGameData, LiveRead, WinProbabilityLine } from "../lib/live";
import { PHASE_LABELS, type WinProbabilityAdded, type WinProbabilityPage } from "../lib/win-probability";

// Real reads: a final game through the CourtLens API and the frozen model's line for it.
const game: LiveRead<LiveGameData> = JSON.parse(readFileSync("e2e/fixtures/live-game-401909869.json", "utf8"));
const line: WinProbabilityLine = JSON.parse(readFileSync("e2e/fixtures/win-probability-line.json", "utf8"));

async function mockLive(page: Page, answer: WinProbabilityLine = line) {
  await page.route("**/api/live/**", route => route.request().url().includes("/win-probability") ? route.fulfill({ json: answer }) : route.fulfill({ json: game }));
  await page.route("**/api/live?**", route => route.fulfill({ json: { ...game, data: { games: [game.data!.game] } } }));
}

test("Live: CourtLens beside ESPN with a toggle, swings and the model's identity", async ({ page }) => {
  await mockLive(page);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/live/games/401909869?date=2026-10-26");
  const panel = page.getByRole("region", { name: "Probabilities & Game Flow" });
  const courtlensPlot = panel.getByRole("img", { name: /Win probability by CourtLens/ });
  const espnPlot = panel.getByRole("img", { name: /Win probability by ESPN Analytics/ });
  await expect(courtlensPlot).toBeVisible();
  await expect(espnPlot).toBeVisible();
  const [courtlensBox, espnBox] = [await courtlensPlot.boundingBox(), await espnPlot.boundingBox()];
  expect(espnBox!.y).toBeGreaterThanOrEqual(courtlensBox!.y + courtlensBox!.height);
  expect(Math.abs(espnBox!.x - courtlensBox!.x)).toBeLessThanOrEqual(2);
  if (process.env.W4_EVIDENCE_DIR) await panel.screenshot({ path: `${process.env.W4_EVIDENCE_DIR}/w4-flow-stacked-1440.png` });
  await expect(panel.getByText(line.model.manifest_sha256.slice(0, 12))).toBeVisible();
  await expect(panel.getByRole("list", { name: "Biggest swings" }).getByRole("listitem")).toHaveCount(line.swings!.length);
  await panel.getByRole("radiogroup", { name: "Model" }).getByRole("radio", { name: "ESPN" }).click();
  await expect(panel.getByRole("img", { name: /Win probability by CourtLens/ })).toHaveCount(0);
  await panel.getByRole("radiogroup", { name: "Model" }).getByRole("radio", { name: "CourtLens" }).click();
  await expect(panel.getByRole("img", { name: /Win probability by ESPN Analytics/ })).toHaveCount(0);
  await panel.getByRole("radiogroup", { name: "Chart" }).getByRole("radio", { name: "Game Flow" }).click();
  await expect(panel.getByRole("img", { name: /Game flow/ })).toBeVisible();
  await expect(panel.getByRole("list", { name: "Biggest swings" })).toBeVisible();
});

test("Live: the line with the betting line is a dashed second trace over the own read's (test data)", async ({ page }) => {
  // W-D16. TEST DATA: the real line shifted by a constant stands in for the Market-informed model's.
  const second = line.points!.map(p => ({ ...p, home: Math.min(0.99, p.home + 0.05) }));
  await mockLive(page, { ...line, market_informed: { model: { ...line.model, version: "courtlens-win-probability-v4-frozen-2026-27" }, market: { own: 2, line: 7.5, mu4: 7.5, w: 1 }, points: second } });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/live/games/401909869?date=2026-10-26");
  const panel = page.getByRole("region", { name: "Probabilities & Game Flow" });
  await expect(panel.getByRole("img", { name: /Win probability by CourtLens.*with the betting line/ })).toBeVisible();
  await expect(panel.locator(".live-flow-second")).toHaveCount(1);
  await expect(panel.locator('[data-field="with-line"]')).toContainText("With the betting line (second model, on trial):");
  // The model named under the chart is still the Original: its line leads.
  await expect(panel.getByText(line.model.manifest_sha256.slice(0, 12))).toBeVisible();
  // ESPN's plot never carries the second trace, and without a market line there is none at all.
  await mockLive(page);
  await page.reload();
  await expect(panel.getByRole("img", { name: /Win probability by CourtLens/ })).toBeVisible();
  await expect(panel.locator(".live-flow-second")).toHaveCount(0);
  await expect(panel.locator('[data-field="with-line"]')).toHaveCount(0);
});

test("Live: a game with no sealed inputs shows ESPN and says why", async ({ page }) => {
  await mockLive(page, { status: "no_inputs", model: line.model, reason: "x" });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/live/games/401909869?date=2026-10-26");
  const panel = page.getByRole("region", { name: "Probabilities & Game Flow" });
  await expect(panel.getByRole("img", { name: /Win probability by ESPN Analytics/ })).toBeVisible();
  await expect(panel.getByRole("img", { name: /Win probability by CourtLens/ })).toHaveCount(0);
  await expect(panel).toContainText("no pregame inputs were sealed before tip-off");
  await expect(panel.getByRole("radiogroup", { name: "Model" })).toHaveCount(0);
});

// F03 / RD14: the Research page in the Research pages pattern, every number read from the served fixture (a copy of the real API).
const served: { page: WinProbabilityPage; wpa: Record<string, WinProbabilityAdded> } = JSON.parse(readFileSync("e2e/fixtures/win-probability-page.json", "utf8"));
const wp = served.page;
const num = async (locator: Locator, name: string) => Number(await locator.getAttribute(name));

test.describe("F03 Win Probability research page", () => {
  test("answer first: the prospective gap against ESPN with its interval, to scale from zero", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto("/research/win-probability");
    await expect(page.getByRole("heading", { level: 1, name: "Win Probability" })).toBeVisible();
    const gap = wp.scorecard!.prospective.same_events!.log_loss_gap!;
    const headline = page.locator('[data-field="headline"]');
    expect(await num(headline, "data-value")).toBe(gap.mean);
    expect(await num(headline, "data-low")).toBe(gap.low);
    expect(await num(headline, "data-high")).toBe(gap.high);
    const tied = gap.low <= 0 && gap.high >= 0;
    if (tied) await expect(headline).toContainText("can't be told apart");
    await expect(headline).toContainText(`${wp.scorecard!.prospective.games} games`);
    // W-D16: the hero names the model the page leads with, the own read, and its freeze date.
    await expect(page.locator('[data-field="hero-meta"]')).toHaveText("CourtLens' own read · Original model, frozen Nov 4, 2026 · graded every morning");
    const strip = page.locator('[data-chart="gap"]');
    expect(await num(strip, "data-left")).toBeLessThanOrEqual(0);
    expect(await num(strip.locator('[data-row="courtlens"]'), "data-value")).toBe(wp.scorecard!.prospective.same_events!.courtlens_log_loss);
    expect(await num(strip.locator('[data-row="espn"]'), "data-value")).toBe(wp.scorecard!.prospective.same_events!.espn_log_loss);
    await expect(strip.locator('[data-row="gap"]')).toHaveAttribute("data-tone", tied ? "" : gap.low > 0 ? "good" : "bad");
    const test_ = wp.card.espn.comparison.overall.log_loss.espn_minus_courtlens;
    expect(await num(page.locator('[data-field="answer-test"]'), "data-value")).toBe(test_.mean);
  });

  test("scorecard grid, drift line, replay and ledger behind toggles with logos beside codes", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto("/research/win-probability");
    const sc = wp.scorecard!, same = sc.prospective.same_events!;
    const row = page.getByRole("table", { name: "Games since the freeze" }).locator('tbody tr[data-group="prospective"]');
    for (const [field, value] of [["courtlens_log_loss", same.courtlens_log_loss], ["espn_log_loss", same.espn_log_loss], ["courtlens_brier", same.courtlens_brier],
      ["espn_brier", same.espn_brier], ["courtlens_calibration_error", same.courtlens_calibration_error], ["espn_calibration_error", same.espn_calibration_error]] as const)
      expect(await num(row.locator(`[data-field="${field}"]`), "data-value")).toBe(value);
    expect(await num(row.locator('[data-field="gap"]'), "data-low")).toBe(same.log_loss_gap!.low);
    const drift = page.locator('[data-field="drift-line"]');
    await expect(drift).toHaveAttribute("data-status", sc.drift.latest.status);
    expect(await num(drift, "data-value")).toBe(sc.drift.latest.calibration_error);
    await expect(page.getByRole("table", { name: "Replayed games" })).toBeHidden();
    await expect(page.locator('[data-field="replay-line"]')).toHaveAttribute("data-games", String(sc.pre_freeze_replay.games));
    const ledger = page.getByRole("table", { name: "Scored games" });
    await expect(ledger).toBeHidden();
    await page.getByText(`Show the ${sc.recent_games.length} most recent scored games`).click();
    await expect(ledger.locator("tbody tr")).toHaveCount(sc.recent_games.length);
    for (const g of sc.recent_games.slice(0, 5)) {
      const r = ledger.locator(`tbody tr[data-game="${g.game_id}"]`);
      expect(await num(r.locator('[data-field="courtlens"]'), "data-value")).toBe(g.espn!.courtlens_log_loss);
      expect(await num(r.locator('[data-field="espn"]'), "data-value")).toBe(g.espn!.log_loss);
      await expect(r.locator('[data-field="matchup"] .team-logo')).toHaveCount(2);
    }
    await expect(ledger.locator(".rs-grid-value[data-tone]")).toHaveCount(0);
  });

  test("final test: a phase switch over one grid with intervals and its calibration chart; the rules in words", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto("/research/win-probability");
    for (const phase of ["overall", "overtime"]) {
      if (phase !== "overall") await page.getByRole("radiogroup", { name: "Phase" }).getByRole("radio", { name: "Overtime" }).click();
      const cmp = wp.card.espn.comparison[phase];
      const grid = page.locator('table[aria-label^="Final test"]');
      const gapRow = grid.locator('tbody tr[data-row="gap"]');
      expect(await num(gapRow.locator('[data-field="log_loss"]'), "data-value")).toBe(cmp.log_loss.espn_minus_courtlens.mean);
      expect(await num(grid.locator('tbody tr[data-row="courtlens"] [data-field="log_loss"]'), "data-low")).toBe(cmp.log_loss.courtlens.low);
      const g = cmp.log_loss.espn_minus_courtlens;
      const tone = g.low > 0 ? "good" : g.high < 0 ? "bad" : null;
      const value = gapRow.locator('[data-field="log_loss"] .rs-grid-value');
      if (tone) await expect(value).toHaveAttribute("data-tone", tone); else await expect(value).not.toHaveAttribute("data-tone", /./);
      await expect(page.locator(`figure[aria-label="Calibration on the final test: ${PHASE_LABELS[phase]}"] g[data-series="courtlens"]`)).toHaveAttribute("data-points", String(wp.card.phases[phase].curve.length));
    }
    const rules = page.locator('[data-field="rules"]');
    await expect(rules.locator('[data-rule="A1"] .wp-result')).toHaveText(wp.card.gates!.A1!.passed ? "Passed" : "Not passed");
    await expect(rules.locator('[data-rule="A2"] .wp-result')).toHaveText(wp.card.gates!.A2!.passed ? "Passed" : "Not passed");
  });

  test("what didn't help: every step with its served gains, results in words and no colour", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto("/research/win-probability");
    const grid = page.getByRole("table", { name: "Model steps" });
    for (const [key, step] of Object.entries(wp.card.steps!)) {
      const r = grid.locator(`tbody tr[data-step="${key}"]`);
      expect(await num(r.locator('[data-field="selection"]'), "data-value")).toBe(step.selection_gain.mean);
      await expect(r.locator(".wp-result")).toHaveText(key === "S0g" ? "Diagnostic" : step.accepted ? "Kept" : "Not kept");
    }
    await expect(grid.locator('tbody tr[data-step="E"] .wp-result')).toHaveText("Kept");
    await expect(grid.locator(".rs-grid-value[data-tone]")).toHaveCount(0);
    await expect(page.locator('[data-field="negative-line"]')).toContainText("no live lineup tracker");
    // F05: the tested upgrade, with the served gain against the frozen model and its interval.
    const up = wp.upgrade!, gain = up.comparisons.v3_vs_v2_frozen, finding = page.locator('[data-field="upgrade"]');
    await expect(finding).toHaveAttribute("data-adopted", "false");
    expect(await num(finding, "data-value")).toBe(gain.mean);
    expect(await num(finding, "data-low")).toBe(gain.low);
    expect(await num(finding, "data-high")).toBe(gain.high);
    await expect(finding).toContainText("tested and not adopted");
    await expect(finding).toContainText(`same ${up.games.toLocaleString("en-US")} test games`);
    await expect(finding).toContainText("includes zero, so the frozen model stays");
    await expect(finding).toContainText("an overtime model was tried and not kept");
    // courtlens-pregame-nonlinear-v1: trees on the own read's inputs, every number from the served result.
    const nl = wp.pregame_nonlinear!, nonlinear = page.locator('[data-field="nonlinear"]');
    expect(await num(nonlinear, "data-linear")).toBe(nl.linear.rmse);
    expect(await num(nonlinear, "data-trees")).toBe(nl.candidates.trees.rmse);
    expect(await num(nonlinear, "data-plus")).toBe(nl.candidates.linear_plus_trees.rmse);
    await expect(nonlinear).toHaveAttribute("data-trees-result", nl.candidates.trees.result);
    await expect(nonlinear).toHaveAttribute("data-plus-result", nl.candidates.linear_plus_trees.result);
    await expect(nonlinear).toContainText("A non-linear own read was tested and did not help.");
    await expect(nonlinear).toContainText(`${nl.candidates.trees.rmse.toFixed(2)} points against ${nl.linear.rmse.toFixed(2)} for the linear model: worse`);
    await expect(nonlinear).toContainText(`${nl.candidates.linear_plus_trees.rmse.toFixed(2)}: no clear difference`);
    await expect(nonlinear).toContainText(`On ${nl.games.toLocaleString("en-US")} games of 2022-23 to 2025-26, seasons already read, so this is a diagnostic`);
  });

  test("win probability added: one sortable grid with photos, sorted not ranked, season in the URL", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto("/research/win-probability");
    const season = wp.wpa_seasons[0], table = served.wpa[season];
    const players = new Set([...table.leaders, ...table.clutch_leaders].map(r => r.player));
    const grid = page.getByRole("table", { name: `Win probability added, ${season}` });
    await expect(grid.locator("tbody tr[data-player]")).toHaveCount(players.size);
    const wpa = await grid.locator('tbody tr [data-field="wpa"]').evaluateAll(cells => cells.map(c => Number(c.getAttribute("data-value"))));
    expect(wpa).toEqual([...wpa].sort((a, b) => b - a));
    const top = [...table.leaders].sort((a, b) => b.wpa - a.wpa)[0];
    expect(await num(grid.locator("tbody tr").first().locator('[data-field="clutch_wpa"]'), "data-value")).toBe(top.clutch_wpa);
    await expect(grid.locator("tbody tr").first().locator("img.player-portrait")).toHaveCount(1);
    await grid.getByRole("button", { name: /Clutch WPA/ }).click();
    const clutch = await grid.locator('tbody tr [data-field="clutch_wpa"]').evaluateAll(cells => cells.map(c => Number(c.getAttribute("data-value"))));
    expect(clutch).toEqual([...clutch].sort((a, b) => b - a));
    await expect(grid.locator(".rs-grid-value[data-tone]")).toHaveCount(0);
    await page.getByRole("radiogroup", { name: "Season" }).getByRole("radio", { name: wp.wpa_seasons[2] }).click();
    await expect(page).toHaveURL(new RegExp(`wpaSeason=${wp.wpa_seasons[2]}`));
    await expect(page.getByRole("table", { name: `Win probability added, ${wp.wpa_seasons[2]}` })).toBeVisible();
  });

  test("identifiers and hashes only inside the collapsed About", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto("/research/win-probability");
    await expect(page.locator('[data-field="headline"]')).toBeVisible();
    await expect(page.getByText(wp.model.manifest_sha256)).toBeHidden();
    await page.getByText("About this page").click();
    await expect(page.getByText(wp.model.manifest_sha256)).toBeVisible();
    await expect(page.locator('[data-field="identifiers"]')).toContainText(wp.model.version);
  });

  test("phone: no sideways scroll, a phase select and column switches", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/research/win-probability");
    await expect(page.locator('[data-field="headline"]')).toBeVisible();
    for (const s of await page.locator("details summary").all()) await s.click();
    await expect(page.getByRole("table", { name: "Scored games" })).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);
    for (const grid of await page.locator(".wp-grid .stats-scroll-region").all()) {
      expect(await grid.evaluate(el => el.scrollWidth - el.clientWidth)).toBeLessThanOrEqual(1);
    }
    await page.getByRole("combobox", { name: "Phase" }).selectOption("last_two");
    await expect(page.locator('table[aria-label="Final test: Last 2 min"]')).toBeVisible();
    await page.getByRole("radiogroup", { name: "WPA columns" }).getByRole("radio", { name: "Clutch" }).click();
    await expect(page.locator('table[aria-label^="Win probability added"] [data-field="clutch_wpa"]').first()).toBeVisible();
  });
});

test("evidence screenshots", async ({ page }) => {
  test.skip(!process.env.F03_SCREENSHOTS, "Only when recording evidence");
  const out = process.env.F03_SCREENSHOTS!;
  for (const [width, height] of [[1440, 1000], [390, 844]]) {
    await page.setViewportSize({ width, height });
    await page.goto("/research/win-probability");
    await page.waitForLoadState("networkidle");
    for (let y = 0; y < await page.evaluate(() => document.documentElement.scrollHeight); y += 600) { await page.evaluate(v => window.scrollTo(0, v), y); await page.waitForTimeout(100); }
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({ path: `${out}/f03-after-full-${width}.png`, fullPage: true });
  }
});
