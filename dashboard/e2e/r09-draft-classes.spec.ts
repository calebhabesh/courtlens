import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { openWorkbench } from "./workbench-navigation";

// Real R09 API answers (e2e/fixtures/draft-*.json): the page must show them exactly.
const read = (name: string) => JSON.parse(readFileSync(`e2e/fixtures/draft-${name}.json`, "utf8"));
const summary = read("summary"), classes = read("classes"), combine = read("combine"), rookies = read("rookies"), rookie = read("rookie");
const path = "/draft";
const STATS = ["mpg", "pts36", "reb36", "ast36", "stl36", "blk36", "tov36", "ts"];
// The page writes an unknown value as an empty data-value.
const served = (value: string | null) => value === null || value === "" ? null : Number(value);

test.describe("R09 Draft Classes (RD08 layout)", () => {
  test.beforeEach(async ({ page }) => { await page.setViewportSize({ width: 1440, height: 900 }); });

  test("the rookie table is titled and built like Stats: per-game, per-36 and totals by group, with past picks as its own view", async ({ page }) => {
    await openWorkbench(page, path);
    await expect(page.getByRole("heading", { name: "2026-27 rookie stats" })).toBeVisible();
    const table = page.getByRole("table", { name: "2026-27 rookies" });
    const played = rookies.rookies.find((r: { state: string }) => r.state === "compared");
    const line = played.comparison.line;
    const row = table.locator(`tr[data-pick="${played.pick}"]`);
    await expect(row.locator('td[data-field="pts"]')).toBeAttached();
    for (const group of ["Draft", "Profile", "Impact", "Counting", "Eff", "Shooting", "Other"]) await expect(table.getByRole("columnheader", { name: group, exact: true })).toBeVisible();
    await expect(row.locator(".stats-guide-cell")).toHaveCount(5);
    const perGame = line.pts36 * (line.minutes / line.games / 36);
    expect(Number(await row.locator('td[data-field="pts"]').getAttribute("data-value"))).toBeCloseTo(perGame, 6);
    await expect(row.locator('td[data-field="gp"]')).toHaveAttribute("data-value", String(line.games));
    const view = page.getByRole("radiogroup", { name: "Rookie stats" });
    await view.getByRole("radio", { name: "Per 36" }).click();
    await expect(page).toHaveURL(/stat=per_36/);
    await expect.poll(async () => Number(await row.locator('td[data-field="pts"]').getAttribute("data-value"))).toBeCloseTo(line.pts36, 6);
    await view.getByRole("radio", { name: "Totals" }).click();
    await expect.poll(async () => Number(await row.locator('td[data-field="pts"]').getAttribute("data-value"))).toBeCloseTo(perGame * line.games, 6);
    await view.getByRole("radio", { name: "Vs Past Picks" }).click();
    await expect(row.locator('td[data-field="pts36"]')).toBeAttached();
    await expect(page.locator('[data-field="rookie-note"]')).toContainText("Per 36 minutes");
    const unplayed = rookies.rookies.find((r: { state: string }) => r.state !== "compared");
    if (unplayed) { await view.getByRole("radio", { name: "Per Game" }).click(); await expect(table.locator(`tr[data-pick="${unplayed.pick}"] td[data-field="pts"]`)).toHaveText("—"); }
    for (const stat of ["Per Game", "Vs Past Picks"]) {
      await view.getByRole("radio", { name: stat }).click();
      await expect(table.locator(".stats-group-th").first()).toHaveText("Draft");
      const gaps = await table.evaluate(t => { const f = t.querySelector(".lookup-input-wrapper")!.getBoundingClientRect(), h = (t as HTMLTableElement).tHead!.getBoundingClientRect(); return { above: f.top - h.top, below: h.bottom - f.bottom, width: f.width }; });
      expect(Math.abs(gaps.above - gaps.below)).toBeLessThanOrEqual(1);
      expect(gaps.above).toBeGreaterThanOrEqual(8);
      expect(gaps.width).toBeGreaterThanOrEqual(260);
    }
    await expect(row.locator('td[data-field="pick"]')).toHaveText(`R${played.round} #${played.pick}`);
  });

  test("opens on one page with every section and shows every compared rookie's values and percentiles", async ({ page }) => {
    await openWorkbench(page, `${path}?stat=past`);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Draft Classes");
    for (const id of ["rookies", "value", "ranges", "classes", "steals", "combine", "reading", "about"]) await expect(page.locator(`section#${id}`)).toBeAttached();
    await expect(page.getByRole("navigation", { name: "Sections", exact: true }).getByRole("link")).toHaveCount(8);
    await expect(page.locator('select[aria-label="Rookie to compare"], select[aria-label="Draft class"]')).toHaveCount(0);
    const table = page.getByRole("table", { name: "2026-27 rookies" });
    await expect(table.locator("tbody tr")).toHaveCount(rookies.rookies.length);
    for (const r of rookies.rookies) {
      const row = table.locator(`tr[data-pick="${r.pick}"]`);
      if (r.state !== "compared") { await expect(row.locator('[data-field="state"]')).toHaveText("No games yet"); continue; }
      for (const stat of STATS) {
        const cell = row.locator(`td[data-field="${stat}"]`);
        const c = r.comparison.stats[stat];
        expect(served(await cell.getAttribute("data-value"))).toBe(c.value);
        expect(served(await cell.getAttribute("data-percentile"))).toBe(c.percentile);
        const outside = c.value !== null && c.n >= 5 && (c.value > c.p90 || c.value < c.p10) && stat !== "mpg";
        const tone = await cell.locator(".rs-grid-value").getAttribute("data-tone");
        if (!outside) expect(tone).toBeNull();
        else if (stat === "tov36") expect(tone).toBe(c.value > c.p90 ? "bad" : "good");
        else expect(tone).toBe(c.value > c.p90 ? "good" : "bad");
      }
      expect(served(await row.locator('td[data-field="darko"]').getAttribute("data-value"))).toBe(r.darko?.dpm ?? null);
    }
    await expect(page.locator('[data-field="compared"]')).toHaveAttribute("data-value", String(rookies.rookies.filter((r: { state: string }) => r.state === "compared").length));
  });

  test("the rookie card follows the search field, can be cleared and lists the same-pick predecessors", async ({ page }) => {
    await openWorkbench(page, `${path}?rookie=${rookie.rookie.player_id}`);
    const card = page.locator(`article[data-card="${rookie.rookie.player_id}"]`);
    await expect(card).toContainText(rookie.rookie.name);
    await expect(card.locator('[data-field="pick"]')).toHaveAttribute("data-value", String(rookie.rookie.pick));
    expect(served(await card.locator('.dc-tile-sub[data-field="pts36"]').getAttribute("data-percentile"))).toBe(rookie.rookie.comparison.stats.pts36.percentile);
    const table = page.getByRole("table", { name: /Past number \d+ picks at \d+ games/ });
    await expect(table.locator("tbody tr")).toHaveCount(rookie.comparisons.length + 1);
    const years = await table.locator('tbody td[data-field="year"]').evaluateAll(cells => cells.map(c => Number((c as HTMLElement).dataset.value)));
    expect(years).toEqual([...years].sort((a, b) => b - a));
    expect(years[0]).toBe(2026);
    for (const c of rookie.comparisons) {
      const row = table.locator(`tr[data-row="${c.player_id}"]`);
      expect(Number(await row.locator('td[data-field="games"]').getAttribute("data-value"))).toBe(c.games);
      expect(served(await row.locator('td[data-field="pts36"]').getAttribute("data-value"))).toBe(c.pts36);
      expect(c.games).toBeLessThanOrEqual(rookie.rookie.comparison.line.games);
    }
    await page.getByRole("button", { name: `Remove ${rookie.rookie.name} from Rookie` }).click();
    await expect(page).toHaveURL(/rookie=none/);
    await expect(page.getByText("No rookie chosen.")).toBeVisible();
    const other = rookies.rookies.find((r: { state: string; player_id: string }) => r.state === "compared" && r.player_id !== rookie.rookie.player_id);
    await page.getByRole("combobox", { name: "Rookie" }).fill(other.name);
    await page.getByRole("option", { name: new RegExp(other.name) }).click();
    await expect(page.locator(`article[data-card="${other.player_id}"]`)).toBeVisible();
  });

  test("value by pick: chart points, band and table equal the served slots, controls live in the URL, and old tab links scroll", async ({ page }) => {
    await openWorkbench(page, `${path}?tab=value`);
    await expect.poll(() => page.evaluate(() => Math.abs(document.getElementById("value")?.getBoundingClientRect().top ?? Infinity) < 200)).toBe(true);
    const figure = page.locator('[data-chart="value-by-pick"]');
    const points = figure.locator(".slc-dot");
    await expect(points).toHaveCount(60);
    await expect(figure.locator(".slc-band")).toHaveCount(1);
    const rows = summary.value_by_pick.window.all.ws;
    for (const point of await points.all()) {
      const slot = Number(await point.getAttribute("data-season"));
      expect(Number(await point.getAttribute("data-value"))).toBe(rows[slot - 1].mean);
      expect(Number(await point.getAttribute("data-low"))).toBe(rows[slot - 1].lo);
      expect(Number(await point.getAttribute("data-high"))).toBe(rows[slot - 1].hi);
    }
    await page.getByRole("radiogroup", { name: "Classes" }).getByRole("radio", { name: "1989 on" }).click();
    await expect(page).toHaveURL(/era=two_round/);
    await page.getByRole("radiogroup", { name: "Measure" }).getByRole("radio", { name: "Minutes" }).click();
    await expect(page).toHaveURL(/measure=min/);
    await expect(page).toHaveURL(/era=two_round/);
    await expect(figure).toHaveAttribute("data-era", "two_round");
    const table = page.locator('table[data-table="value-by-pick"]');
    const expected = summary.value_by_pick.window.two_round.min;
    for (const slot of [1, 14, 30, 60]) {
      const cell = table.locator(`tr[data-row="${slot}"] td[data-field="mean"]`);
      expect(Number(await cell.getAttribute("data-value"))).toBe(expected[slot - 1].mean);
    }
    const bands = page.locator('table[data-table="bands"] tbody tr');
    for (const row of await bands.all()) {
      const cell = row.locator('td[data-field="diff"]');
      const low = Number(await cell.getAttribute("data-low")), high = Number(await cell.getAttribute("data-high"));
      expect(await cell.locator(".rs-grid-value").getAttribute("data-tone")).toBe(low > 0 ? "good" : high < 0 ? "bad" : null);
    }
  });

  test("a complete class is redrafted with logos and the served ranks; a recent class is not; the class search moves between classes", async ({ page }) => {
    await openWorkbench(page, `${path}?year=1984&order=redraft`);
    const table = page.getByRole("table", { name: "1984 draft class" });
    await expect(table.locator("tbody tr")).toHaveCount(classes["1984"].rows.length);
    const first = table.locator("tbody tr").first();
    await expect(first).toHaveAttribute("data-row", String(classes["1984"].rows.find((r: { redraft_window: number }) => r.redraft_window === 1).pick));
    const jordan = table.locator('tr[data-row="3"]');
    await expect(jordan).toContainText("Michael Jordan");
    await expect(jordan.locator('td[data-field="team"] img, td[data-field="team"] .team-logo').first()).toBeVisible();
    expect(Number(await jordan.locator('td[data-field="career_ws"]').getAttribute("data-value"))).toBe(classes["1984"].rows[2].career_ws);
    const surplus = jordan.locator('td[data-field="surplus"] .rs-grid-value');
    await expect(surplus).toHaveAttribute("data-identity", "a");
    expect(await surplus.getAttribute("data-tone")).toBeNull();
    await page.getByRole("combobox", { name: "Draft class" }).fill("2003");
    await page.getByRole("option", { name: /2003 NBA draft/ }).click();
    await expect(page).toHaveURL(/year=2003/);
    await expect(page.getByRole("table", { name: "2003 draft class" })).toBeVisible();
    await openWorkbench(page, `${path}?year=2024`);
    const recent = page.getByRole("table", { name: "2024 draft class" });
    await expect(recent.locator("tbody tr").first()).toHaveAttribute("data-order", "draft");
    await expect(recent.locator('td[data-field="expected"]')).toHaveCount(0);
    await expect(page.getByText(/Only 2 of four seasons have been played/)).toBeVisible();
  });

  test("steals, misses and combine correlations equal the served values; surplus is gold or blue, never green or red", async ({ page }) => {
    await openWorkbench(page, path);
    const steals = page.getByRole("table", { name: "Steals" });
    await expect(steals.locator("tbody tr")).toHaveCount(summary.steals.length);
    for (const s of summary.steals.slice(0, 5)) {
      const cell = steals.locator(`tr[data-row="${s.year}-${s.pick}"] td[data-field="surplus"]`);
      expect(Number(await cell.getAttribute("data-value"))).toBe(s.surplus_window_ws);
      await expect(cell.locator(".rs-grid-value")).toHaveAttribute("data-identity", "a");
      expect(await cell.locator(".rs-grid-value").getAttribute("data-tone")).toBeNull();
    }
    await expect(page.getByRole("table", { name: "Misses" }).locator("tbody tr")).toHaveCount(summary.misses.length);
    for (const s of [...summary.steals.slice(0, 3), ...summary.misses.slice(0, 3)]) {
      const card = page.locator(`article[data-card="${s.year}-${s.pick}"]`);
      expect(Number(await card.locator('[data-field="surplus"]').getAttribute("data-value"))).toBe(s.surplus_window_ws);
    }
    await expect(page.locator('[data-list="misses"]')).toContainText("not whether the choice was sound");
    const table = page.getByRole("table", { name: "Combine correlations" });
    for (const c of combine.correlations.filter((x: { outcome: string }) => x.outcome === "window_ws")) {
      expect(Number(await table.locator(`tr[data-row="${c.measure}"] td[data-field="r_ws"]`).getAttribute("data-value"))).toBe(c.r);
    }
    const plotted = combine.rows.filter((r: { wingspan: number | null; window_ws: number | null }) => r.wingspan !== null && r.window_ws !== null).length;
    await expect(page.locator("circle[data-player]")).toHaveCount(plotted);
    await expect(page.locator("#combine").getByRole("link", { name: "Wingspan" })).toHaveAttribute("href", "/wingspan");
  });

  test("is in the Research menu under Tools with an icon", async ({ page }) => {
    await openWorkbench(page, "/stats");
    await page.getByRole("button", { name: "Research", exact: true }).click();
    const item = page.getByRole("menu", { name: "Research" }).getByRole("menuitem", { name: /Draft Classes/ });
    await expect(item).toHaveAttribute("href", "/draft");
    await expect(item.locator("svg").first()).toBeVisible();
  });

  test("About holds the coverage, the known error and the hashes; the phone layout does not scroll sideways", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await openWorkbench(page, path);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Draft Classes");
    await expect(page.locator("#about")).toBeAttached();
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBe(0);
    await page.locator(".dc-index-phone summary").click();
    await page.getByRole("navigation", { name: "Sections (phone)" }).getByRole("link", { name: /Ranges of picks/ }).click();
    await expect(page.locator(".dc-index-phone")).not.toHaveAttribute("open", "");
    await page.locator("#about summary").click();
    await expect(page.getByText(summary.registration.results_sha256.slice(0, 16))).toBeVisible();
    await expect(page.locator('[data-field="known-error"]')).toContainText("1982 pick 78");
    await expect(page.getByRole("table", { name: "Coverage by class" }).locator("tbody tr")).toHaveCount(summary.classes.length);
    await expect(page.getByText("Page reference", { exact: false })).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBe(0);
  });
});
