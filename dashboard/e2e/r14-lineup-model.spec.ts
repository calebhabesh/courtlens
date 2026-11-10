import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { openWorkbench } from "./workbench-navigation";

// Real R14 API answers (e2e/fixtures/lineup-model*.json): the page must show them exactly.
const read = (name: string) => JSON.parse(readFileSync(`e2e/fixtures/lineup-model${name}.json`, "utf8"));
const fixture = read("");
const fit = read("-fit");
const alt = read("-fit-alt");
const roster = read("-players");
const results = fixture.results;
const path = "/research/lineup-model";
const toneOf = (g: { low: number; high: number }) => g.low > 0 ? "good" : g.high < 0 ? "bad" : null;

test.describe("R14 Lineup Model", () => {
  test.beforeEach(async ({ page }) => { await page.setViewportSize({ width: 1440, height: 900 }); });

  test("answers that ridge's edge is no practical difference, and shows it to scale", async ({ page }) => {
    await openWorkbench(page, path);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Lineup Model");
    const answer = page.locator('[data-field="verdict-summary"]');
    await expect(answer).toHaveAttribute("data-verdict", results.verdict);
    await expect(answer).toContainText("no practical difference");
    await expect(answer).toContainText("0.000011");
    await expect(page.locator('[data-field="edge"]')).toHaveAttribute("data-ratio", "17000");
    const strip = page.locator('[data-chart="scale"]');
    for (const key of ["ridge_over_home_only", "lineup_over_home_only", "lineup_over_ridge"]) {
      await expect(strip.locator(`[data-key="${key}"]`)).toHaveAttribute("data-value", String(results.gains[key].pooled.gain));
    }
    await expect(strip.locator('[data-key="lineup_over_ridge"] strong')).not.toHaveAttribute("data-tone", /.*/);
    await expect(page.getByText("Verdict", { exact: true })).toHaveCount(0);
  });

  test("shows every test-season error and gain, leaving lineup against ridge uncoloured", async ({ page }) => {
    await openWorkbench(page, path);
    const table = page.getByRole("table", { name: "Stint margin error by test season" });
    for (const season of [...results.test_seasons, "pooled"]) {
      const row = table.locator(`tr[data-row="${season}"]`);
      const scope = (block: { seasons: Record<string, unknown>; pooled: unknown }) => (season === "pooled" ? block.pooled : block.seasons[season]) as { wrmse: number; gain: number; low: number; high: number };
      for (const model of ["lineup", "ridge", "home_only"]) expect(Number(await row.locator(`[data-field="${model}"]`).getAttribute("data-value"))).toBe(scope(results.models[model]).wrmse);
      for (const key of ["lineup_over_ridge", "lineup_over_home_only", "ridge_over_home_only"]) {
        const cell = row.locator(`[data-field="${key}"]`), g = scope(results.gains[key]);
        expect(Number(await cell.getAttribute("data-value"))).toBe(g.gain);
        expect(await cell.locator(".rs-grid-value").getAttribute("data-tone")).toBe(key === "lineup_over_ridge" ? null : toneOf(g));
      }
    }
    const correlation = results.diagnostics[results.test_seasons[0]].prediction_correlation_with_ridge;
    await expect(page.getByRole("table", { name: "Interaction size by test season" }).locator(`tr[data-row="${results.test_seasons[0]}"] [data-field="correlation"]`)).toHaveText(correlation.toFixed(10));
  });

  test("the lineup tool opens on the most-used five and shows the served prediction", async ({ page }) => {
    await openWorkbench(page, path);
    const table = page.getByRole("table", { name: "Predicted net rating" });
    await expect(table.locator('tr[data-row="lineup_model"] [data-field="net"]')).toHaveAttribute("data-value", String(fit.lineup_model.net));
    await expect(table.locator('tr[data-row="ridge"] [data-field="net"]')).toHaveAttribute("data-value", String(fit.ridge.net));
    await expect(page.locator("[data-slot]")).toHaveCount(5);
    for (const p of fit.players) await expect(page.locator(`[data-slot="${p.player_id}"]`)).toContainText(p.name);
    await expect(page.locator('[data-field="interaction"]')).toHaveAttribute("data-value", String(fit.lineup_model.interaction));
    await expect(page.locator('[data-field="five-note"]')).toContainText("most-used lineup");
    await expect(page.getByRole("button", { name: "Most-used five" })).toHaveCount(0);
  });

  test("changing a player through search puts the five in the URL and refetches, and the five can be reset", async ({ page }) => {
    await openWorkbench(page, path);
    await expect(page.locator("[data-slot]")).toHaveCount(5);
    const changed: string[] = alt.players.map((p: { player_id: string }) => p.player_id);
    const index = changed.findIndex((id, i) => id !== fit.players[i].player_id);
    const incoming = alt.players[index];
    await page.getByRole("button", { name: `Replace ${fit.players[index].name}` }).click();
    await page.getByRole("combobox", { name: `Replace ${fit.players[index].name}` }).fill(incoming.name);
    await page.getByRole("option", { name: new RegExp(incoming.name) }).first().click();
    await expect(page).toHaveURL(new RegExp(`five=${changed.join("%2C")}|five=${changed.join(",")}`));
    const table = page.getByRole("table", { name: "Predicted net rating" });
    await expect(table.locator('tr[data-row="lineup_model"] [data-field="net"]')).toHaveAttribute("data-value", String(alt.lineup_model.net));
    await page.getByRole("button", { name: "Most-used five" }).click();
    await expect(page).toHaveURL(url => !url.searchParams.has("five"));
    await expect(table.locator('tr[data-row="lineup_model"] [data-field="net"]')).toHaveAttribute("data-value", String(fit.lineup_model.net));
  });

  test("swapping a player keeps the last prediction dimmed instead of jumping, and says how close the models are", async ({ page }) => {
    await openWorkbench(page, path);
    const table = page.getByRole("table", { name: "Predicted net rating" });
    await expect(table.locator('tr[data-row="lineup_model"] [data-field="net"]')).toHaveAttribute("data-value", String(fit.lineup_model.net));
    const gap = page.locator('[data-field="model-gap"]');
    await expect(gap).toHaveAttribute("data-value", String(Math.abs(fit.lineup_model.net - fit.ridge.net)));
    await expect(page.locator('[data-field="positions"]')).toContainText("position");
    let release = () => {};
    const held = new Promise<void>(resolve => { release = resolve; });
    await page.route("**/api/lineup-model/fit*", async route => { await held; await route.continue(); });
    const changed: string[] = alt.players.map((p: { player_id: string }) => p.player_id);
    const index = changed.findIndex((id, i) => id !== fit.players[i].player_id);
    const incoming = alt.players[index], name = fit.players[index].name;
    await page.getByRole("button", { name: `Replace ${name}` }).click();
    await page.getByRole("combobox", { name: `Replace ${name}` }).fill(incoming.name);
    await page.getByRole("option", { name: new RegExp(incoming.name) }).first().click();
    const result = page.locator("[data-result]");
    await expect(result).toHaveAttribute("data-stale", "true");
    await expect(table.locator('tr[data-row="lineup_model"] [data-field="net"]')).toHaveAttribute("data-value", String(fit.lineup_model.net));
    await expect(page.getByText("Predicting this five")).toHaveCount(0);
    release();
    await expect(result).not.toHaveAttribute("data-stale", "true");
    await expect(table.locator('tr[data-row="lineup_model"] [data-field="net"]')).toHaveAttribute("data-value", String(alt.lineup_model.net));
  });

  test("the search sits inside the card, keeps the card whole and can be left three ways", async ({ page }) => {
    await openWorkbench(page, path);
    await expect(page.locator("[data-slot]")).toHaveCount(5);
    const name = fit.players[0].name, slot = page.locator(`[data-slot="${fit.players[0].player_id}"]`);
    const field = slot.getByRole("combobox", { name: `Replace ${name}` });
    await slot.getByRole("button", { name: `Replace ${name}` }).click();
    await expect(field).toBeFocused();
    await expect(slot.locator('[data-field="rating"]')).toBeVisible();
    await expect(page.locator(".lookup-dropdown")).toHaveCount(0);
    const [card, box] = await Promise.all([slot.boundingBox(), slot.locator(".lookup-input-wrapper").boundingBox()]);
    expect(box!.x).toBeGreaterThanOrEqual(card!.x);
    expect(box!.x + box!.width).toBeLessThanOrEqual(card!.x + card!.width);
    await field.fill("a");
    await expect(page.locator(".lookup-dropdown")).toHaveCount(1);
    await expect(slot.locator(".lookup-input-wrapper button")).toHaveCount(0);
    await field.press("Escape");
    await expect(field).toHaveCount(0);
    await slot.getByRole("button", { name: `Replace ${name}` }).click();
    await page.getByRole("heading", { name: "Player similarity map" }).click();
    await expect(field).toHaveCount(0);
    await slot.getByRole("button", { name: `Replace ${name}` }).click();
    await slot.getByRole("button", { name: `Cancel replacing ${name}` }).click();
    await expect(field).toHaveCount(0);
  });

  test("the map keeps its warning above the dots and draws every served point", async ({ page }) => {
    await openWorkbench(page, path);
    await expect(page.locator("circle[data-player]")).toHaveCount(fixture.map.points.length);
    await expect(page.locator('[data-field="seed-stability"]')).toHaveAttribute("data-value", String(fixture.map.seed_stability.mean_overlap));
    await expect(page.locator('[data-field="seed-warning"]')).toContainText("Read this map as noise");
    const before = await page.evaluate(() => {
      const warn = document.querySelector('[data-field="seed-warning"]'), dot = document.querySelector("circle[data-player]");
      return Boolean(warn && dot && warn.compareDocumentPosition(dot) & Node.DOCUMENT_POSITION_FOLLOWING);
    });
    expect(before).toBe(true);
    await expect(page.getByText("the axes, directions and distances between groups mean nothing")).toBeVisible();
    await expect(page.locator("circle[data-player][data-on]")).toHaveCount(5);
  });

  test("says when a chosen player has no dot on the map", async ({ page }) => {
    const box = roster.players.find((p: { status: string }) => p.status === "box");
    const five = [...fit.players.slice(0, 4).map((p: { player_id: string }) => p.player_id), box.player_id];
    await openWorkbench(page, `${path}?five=${five.join(",")}`);
    await expect(page.locator('[data-field="map-missing"]')).toContainText(box.name);
    await expect(page.locator("circle[data-player][data-on]")).toHaveCount(4);
    await expect(page.locator(`[data-slot="${box.player_id}"] [data-field="status"]`)).toHaveText("Box-score fallback");
  });

  test("works without the weights: one line for the tool, everything else stays", async ({ page }) => {
    const served = { ...fixture, serving: { ...fixture.serving, tool_available: false } };
    const headers = { "access-control-allow-origin": "*" };
    await page.route("**/api/lineup-model", route => route.fulfill({ json: served, headers }));
    await page.route("**/api/lineup-model/players", route => route.fulfill({ json: { state: "unavailable", players: [] }, headers }));
    await openWorkbench(page, path);
    await expect(page.locator('[data-field="tool-unavailable"]')).toBeVisible();
    await expect(page.locator("[data-slot]")).toHaveCount(0);
    await expect(page.locator('[data-field="five-note"]')).toHaveCount(0);
    await expect(page.getByRole("table", { name: "Stint margin error by test season" })).toBeVisible();
    await expect(page.getByRole("table", { name: "Game margin error, lineup backtest" })).toBeVisible();
    await expect(page.locator("circle[data-player]")).toHaveCount(fixture.map.points.length);
    await expect(page.locator("circle[data-player][data-on]")).toHaveCount(5);
  });

  test("shows the game backtest in registered order, with the ridge row uncoloured", async ({ page }) => {
    await openWorkbench(page, path);
    const bt = page.getByRole("table", { name: "Game margin error, lineup backtest" });
    await expect(bt.locator("tbody tr")).toHaveCount(Object.keys(fixture.backtest.candidates).length);
    const order = await bt.locator("tbody tr").evaluateAll(rows => rows.map(r => (r as HTMLElement).dataset.row));
    expect(order).toEqual(["team_net", "plus_minus", "on_off", "rapm_1y", "rapm_3y", "box_prior_rapm", "time_decay", "time_decay_opener", "projected_impact", "lineup_model", "lineup_ridge"]);
    await expect(bt.locator('tr[data-row="lineup_model"] [data-field="rmse"]')).toHaveAttribute("data-value", String(fixture.backtest.candidates.lineup_model.pooled.rmse));
    const ridge = bt.locator('tr[data-row="lineup_ridge"]');
    expect(await ridge.locator('[data-field="gain"] .rs-grid-value').getAttribute("data-tone")).toBeNull();
    await expect(ridge.locator('[data-field="verdict"]')).toContainText("no practical difference");
    await expect(page.locator('[data-field="samples"]')).toContainText("don't compare RMSE");
    await expect(page.getByRole("link", { name: "Every metric head to head in Metric Backtest" })).toHaveAttribute("href", "/research/backtest");
  });

  test("keeps project detail and the method in the collapsed About", async ({ page }) => {
    await openWorkbench(page, path);
    await expect(page.locator("[data-slot]")).toHaveCount(5);
    const about = page.locator("#about details");
    await expect(about).not.toHaveAttribute("open", "");
    await expect(page.locator('[data-field="results-sha"]')).toHaveAttribute("data-value", results.results_sha256);
    const text = await page.locator(".lm-page").innerText();
    expect(text).not.toMatch(/\bR0?\d{1,2}\b|IM02|docs\/evidence|courtlens-lineup/);
    await about.locator("summary").click();
    for (const name of ["Rosenbaum", "Sill", "McInnes"]) await expect(page.locator('[data-field="credits"]')).toContainText(name);
    await expect(page.getByRole("table", { name: "Stints by season" })).toBeVisible();
  });

  test("is in the Research menu under Models with an icon", async ({ page }) => {
    await openWorkbench(page, "/research/backtest");
    await page.getByRole("button", { name: "Research", exact: true }).click();
    const item = page.getByRole("menu", { name: "Research" }).getByRole("menuitem", { name: /Lineup Model/ });
    await expect(item).toBeVisible();
    await expect(item.locator("svg")).toBeVisible();
    await item.click();
    await expect(page).toHaveURL(url => url.pathname === path);
  });

  test("fits a phone width with no horizontal scroll", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await openWorkbench(page, path);
    await expect(page.getByRole("table", { name: "Predicted net rating" })).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);
  });
});
