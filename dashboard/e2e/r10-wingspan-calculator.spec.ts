import { expect as baseExpect, test, type Locator } from "@playwright/test";
import { readFileSync } from "node:fs";
import { openWorkbench } from "./workbench-navigation";

// Every control on this page writes the URL with router.replace, a server round trip that passed the
// 5 s default under two workers on CI (units, build and overlay checks, 2026-11-05 and 2026-11-12).
const expect = baseExpect.configure({ timeout: 15_000 });

// Real R10 API answers (e2e/fixtures/r10-*.json): the pages must show them exactly.
const read = (name: string) => JSON.parse(readFileSync(`e2e/fixtures/r10-${name}.json`, "utf8"));
const wingspan = read("wingspan"), nearest = read("wingspan-nearest"), ff = read("four-factors"), seasons = read("four-factors-seasons");
const served = (value: string | null) => value === null || value === "" ? null : Number(value);
const value = async (cell: Locator) => served(await cell.getAttribute("data-value"));

type Player = { player_id: string; name: string; measurement_source: string | null; measured: boolean; in_population: boolean; height: number | null; height_shoes: number | null;
  wingspan: number | null; diff: number | null; d_dpm: number | null; d_dpm_now: number | null; position: string | null; active: boolean | null; percentiles: Record<string, number> };
const players = wingspan.players as Player[];
const byWingspan = (rows: Player[]) => [...rows].sort((a, b) => (b.wingspan ?? 0) - (a.wingspan ?? 0) || a.player_id.localeCompare(b.player_id));
const listed = byWingspan(players.filter(p => p.measurement_source !== null));
const active = listed.filter(p => p.active === true);
const grid = (page: import("@playwright/test").Page) => page.locator('[aria-label="Wingspan players"]');
const rowIds = (page: import("@playwright/test").Page) => grid(page).locator("tbody tr[data-row]").evaluateAll(rows => rows.map(r => (r as HTMLElement).dataset.row));

// RD01: one page after Databallr's Wingspan Database; R10's registered numbers below it; round 2 adds
// CraftedNBA's reported players (courtlens-wingspan-coverage-v1), kept out of the registered analysis.
test.describe("R10 Wingspan beside D-DPM (RD01 layout)", () => {
  test.beforeEach(async ({ page }) => { await page.setViewportSize({ width: 1440, height: 900 }); });

  test("shows every registered correlation, positional average and the headline", async ({ page }) => {
    await openWorkbench(page, "/wingspan");
    const table = page.getByRole("table", { name: "Correlations", exact: true });
    const all = [...wingspan.correlations, wingspan.partial];
    await expect(table.locator("tbody tr")).toHaveCount(all.length);
    for (const [i, c] of all.entries()) {
      const row = table.locator("tbody tr").nth(i);
      const r = row.locator('[data-field="r"]');
      expect(await value(r)).toBe(c.r);
      expect(served(await r.getAttribute("data-low"))).toBe(c.low);
      expect(served(await r.getAttribute("data-high"))).toBe(c.high);
      await expect(row.locator('[data-field="verdict"]')).toHaveAttribute("data-value", c.verdict);
      await expect(row.locator("[data-tone], [data-identity]")).toHaveCount(0);
    }
    await expect(page.locator('[data-field="headline"]')).toHaveAttribute("data-value", String(wingspan.correlations[0].r));
    // Within position: one row per position, one cell per pair.
    const within = page.getByRole("table", { name: "Correlations within position" });
    await expect(within.locator("tbody tr")).toHaveCount(5);
    for (const w of wingspan.within_position as { position: string; x: string; y: string; r: number }[])
      expect(await value(within.locator(`tr[data-row="${w.position}"] [data-pair="${w.x}:${w.y}"]`))).toBe(w.r);
    // The full table with intervals sits in the collapsed methodology: CSS locators read it closed.
    const avg = page.locator('table[aria-label="Positional averages"]');
    for (const a of wingspan.positional_averages) {
      const row = avg.locator(`tr[data-row="${a.position}"]`);
      for (const k of ["height", "wingspan", "diff", "weight", "d_dpm"]) {
        expect(await value(row.locator(`[data-field="${k}"]`))).toBe(a[k].mean);
        await expect(row.locator(`[data-field="${k}"]`)).toHaveAttribute("data-n", String(a[k].n));
      }
      if (a.position === "ALL") continue;
      const card = page.locator(`.ws-average[data-row="${a.position}"]`);
      for (const k of ["height", "wingspan", "diff"]) expect(await value(card.locator(`[data-field="${k}"]`))).toBe(a[k].mean);
    }
    // Default scatter: barefoot height against wingspan, combine and reported players, with the served r.
    await expect(page.locator("circle[data-player]")).toHaveCount(listed.filter(p => p.height !== null && p.wingspan !== null).length);
    await expect(page.locator('circle[data-source="craftednba"]')).toHaveCount(listed.filter(p => p.measurement_source === "craftednba" && p.height !== null && p.wingspan !== null).length);
    const hw = wingspan.correlations.find((c: { x: string; y: string }) => c.x === "height" && c.y === "wingspan");
    await expect(page.locator('[data-field="scatter-r"]')).toHaveAttribute("data-value", String(hw.r));
    await page.getByRole("combobox", { name: "Horizontal axis" }).selectOption("wingspan");
    await page.getByRole("combobox", { name: "Vertical axis" }).selectOption("d_dpm");
    await expect(page.locator("circle[data-player]")).toHaveCount(wingspan.population.analysis);
    await expect(page.locator('circle[data-source="craftednba"]')).toHaveCount(0);
  });

  test("opens on active players longest wingspan first, reported players tagged, unknowns blank", async ({ page }) => {
    await openWorkbench(page, "/wingspan");
    await expect(page.getByRole("radio", { name: "Active", exact: true })).toHaveAttribute("aria-checked", "true");
    await expect(page.locator('[data-field="summary"]')).toHaveAttribute("data-value", String(active.length));
    expect(await rowIds(page)).toEqual(active.map(p => p.player_id));
    for (const p of active.slice(0, 20)) {
      const row = grid(page).locator(`tr[data-row="${p.player_id}"]`);
      for (const k of ["height", "wingspan", "diff", "d_dpm_now", "d_dpm"] as const) {
        const cell = row.locator(`td[data-column="${k}"]`);
        expect(served(await cell.getAttribute("data-value"))).toBe(p[k]);
        if (p[k] === null) await expect(cell).toHaveText("—");
      }
      // Coloured by the value as shown (one decimal): a figure that prints as 0.0 takes no colour.
      const shownNow = p.d_dpm_now === null ? 0 : Math.round(p.d_dpm_now * 10) / 10;
      if (shownNow !== 0) await expect(row.locator('td[data-column="d_dpm_now"] .rs-grid-value')).toHaveAttribute("data-identity", shownNow > 0 ? "a" : "b");
      await expect(row.locator(".ws-reported")).toHaveCount(p.measurement_source === "craftednba" ? 1 : 0);
      if (p.measurement_source === "craftednba") await expect(row.locator(".rs-grid-sub")).toHaveCount(0);
    }
    await page.getByRole("radio", { name: "PG", exact: true }).click();
    await expect(page.locator('[data-field="summary"]')).toHaveAttribute("data-value", String(active.filter(p => p.position === "PG").length));
    await page.getByRole("radio", { name: "All Players" }).click();
    await expect(page.locator('[data-field="summary"]')).toHaveAttribute("data-value", String(listed.filter(p => p.position === "PG").length));
    await expect(page).toHaveURL(/status=all/);
    await page.getByRole("radio", { name: "All Positions" }).click();
    await grid(page).getByRole("searchbox", { name: "Search players" }).fill("Holmgren");
    await expect(grid(page).locator("tbody tr[data-row]")).toHaveCount(listed.filter(p => p.name.includes("Holmgren")).length);
    await expect(grid(page).locator("tbody tr[data-row] .ws-reported")).toHaveCount(1);
  });

  test("switches units (inches, m, cm) and to measured shoe height, never an allowance", async ({ page }) => {
    await openWorkbench(page, "/wingspan?shoes=1&units=in");
    const withShoes = active.find(p => p.height_shoes !== null)!, without = active.find(p => p.height_shoes === null)!;
    const cell = (p: Player, k = "height") => grid(page).locator(`tr[data-row="${p.player_id}"] td[data-column="${k}"]`);
    expect(served(await cell(withShoes).getAttribute("data-value"))).toBe(withShoes.height_shoes);
    await expect(cell(withShoes)).toHaveText(`${withShoes.height_shoes!.toFixed(2)}″`);
    await expect(cell(without)).toHaveText("—");
    await page.getByRole("radio", { name: "cm", exact: true }).click();
    await expect(cell(withShoes, "wingspan").locator(".rs-grid-value")).toHaveText(`${(withShoes.wingspan! * 2.54).toFixed(1)} cm`);
    await page.getByRole("radio", { name: "m", exact: true }).click();
    await expect(page).toHaveURL(/units=m/);
    await expect(cell(withShoes, "wingspan").locator(".rs-grid-value")).toHaveText(`${(withShoes.wingspan! * 0.0254).toFixed(2)} m`);
    await expect(cell(withShoes, "diff").locator(".rs-grid-value")).toHaveText(/ cm$/);
  });

  test("similar profiles start empty, then show nearest builds, also for a reported player", async ({ page }) => {
    await openWorkbench(page, "/wingspan");
    await expect(page.locator('table[aria-label="Nearest builds"]')).toHaveCount(0);
    await page.getByRole("button", { name: `Show ${active[0].name}` }).click();
    const first = nearest[active[0].player_id];
    const table = page.getByRole("table", { name: "Nearest builds" });
    await expect(table.locator("tbody tr")).toHaveCount(first.neighbours.length + 1);
    for (const [i, n] of first.neighbours.entries()) {
      const row = table.locator("tbody tr").nth(i + 1);
      await expect(row).toHaveAttribute("data-row", n.player_id);
      expect(await value(row.locator('[data-field="distance"]'))).toBe(n.distance);
    }
    await page.getByRole("button", { name: "Clear the selected player" }).click();
    await expect(page).toHaveURL(/build=none/);
    await expect(table).toHaveCount(0);
    await openWorkbench(page, "/wingspan?build=1641705");
    await expect(table.locator("tbody tr").first()).toContainText("Reported");
    await expect(table.locator("tbody tr").nth(1)).toHaveAttribute("data-row", nearest["1641705"].neighbours[0].player_id);
  });

  test("overlay draws height and wingspan to scale on a labelled axis; highlighted players can be cleared", async ({ page }) => {
    await openWorkbench(page, "/wingspan");
    await expect(page.locator('[data-field="overlay-empty"]')).toBeVisible();
    const [a, b] = active;
    await page.getByRole("button", { name: `Add ${a.name} to the overlay` }).click();
    await expect(page.getByRole("button", { name: `${a.name} is in the overlay` })).toBeDisabled();
    await page.getByRole("button", { name: `Add ${b.name} to the overlay` }).click();
    await expect(page).toHaveURL(new RegExp(`overlay=${a.player_id}(%2C|,)${b.player_id}`));
    for (const p of [a, b]) {
      expect(served(await page.locator(`rect[data-player="${p.player_id}"][data-kind="wingspan"]`).getAttribute("data-value"))).toBe(p.wingspan);
      expect(served(await page.locator(`rect[data-player="${p.player_id}"][data-kind="height"]`).getAttribute("data-value"))).toBe(p.height);
    }
    await expect(page.locator(".ws-overlay-graphic")).toContainText("Length from zero (feet)");
    await expect(page.locator(".ws-overlay-graphic")).toContainText("7′");
    // The scatter rings and labels them, with a chip each and Clear all.
    await expect(page.locator(`.ws-picked[data-selected="${a.player_id}"]`)).toContainText(a.name);
    const chips = page.getByRole("group", { name: "Highlighted players" });
    await chips.getByRole("button", { name: `Stop highlighting ${b.name}` }).click();
    await expect(page.locator(`rect[data-player="${b.player_id}"]`)).toHaveCount(0);
    await page.getByRole("button", { name: "Clear all" }).click();
    await expect(page.locator(".ws-picked")).toHaveCount(0);
    await expect(page.locator('[data-field="overlay-empty"]')).toBeVisible();
  });

  test("adds several players to the graph from its search, each labelled, and clears them", async ({ page }) => {
    await openWorkbench(page, "/wingspan");
    const added = active.slice(2, 6);
    for (const p of added) {
      await page.getByRole("searchbox", { name: "Add a player to the graph" }).fill(p.name);
      await page.getByRole("button", { name: `Add ${p.name} to the graph` }).click();
      await expect(page.getByRole("button", { name: `Stop highlighting ${p.name}` })).toBeVisible();
    }
    await expect(page).toHaveURL(new RegExp(`mark=${added.map(p => p.player_id).join("(%2C|,)")}`));
    for (const p of added) await expect(page.locator(`.ws-picked[data-selected="${p.player_id}"]`)).toContainText(p.name);
    // Labels never share a line: each sits at least 18 px from the next.
    const ys = await page.locator(".ws-picked-label").evaluateAll(els => els.map(e => Number(e.getAttribute("y"))).sort((a, b) => a - b));
    for (let i = 1; i < ys.length; i++) expect(ys[i] - ys[i - 1]).toBeGreaterThanOrEqual(17.9);
    await page.getByRole("group", { name: "Highlighted players" }).getByRole("button", { name: `Stop highlighting ${added[0].name}` }).click();
    await expect(page.locator(".ws-picked")).toHaveCount(added.length - 1);
    await page.getByRole("button", { name: "Clear all" }).click();
    await expect(page.locator(".ws-picked")).toHaveCount(0);
    await expect(page).not.toHaveURL(/mark=/);
  });
});

test.describe("R10 ORtg calculator inputs", () => {
  test.beforeEach(async ({ page }) => { await page.setViewportSize({ width: 1440, height: 900 }); });
  // RD02: the observed tables sit in the collapsed Observed Inputs & Caveats section.
  const openObserved = async (page: import("@playwright/test").Page) => {
    await page.locator("#observed summary").click();
    await expect(page.locator("#observed details")).toHaveAttribute("open", "");
  };

  test("shows the latest season's league inputs, marginals, rebounds and teams", async ({ page }) => {
    await openWorkbench(page, "/calculator");
    await openObserved(page);
    const s = ff.seasons.at(-1), L = s.league;
    const league = page.getByRole("table", { name: "League inputs" });
    expect(await value(league.locator('tr[data-row="ortg"] [data-value]'))).toBe(L.ortg_factors);
    expect(await value(league.locator('tr[data-row="mu"] [data-value]'))).toBe(s.mu);
    for (const k of ["efg", "ftr", "tov_pct", "orb_pct", "fg", "ft"]) expect(await value(league.locator(`tr[data-row="${k}"] [data-value]`))).toBe(L.inputs[k]);
    const marginals = page.getByRole("table", { name: "Marginal value" });
    for (const [k, v] of Object.entries(L.marginals)) expect(await value(marginals.locator(`tr[data-row="${k}"] [data-value]`))).toBe(v);
    const rebounds = page.getByRole("table", { name: "Offensive rebounds by miss" });
    for (const [k, v] of Object.entries(L.rebounds_by_miss as Record<string, { orb_rate: number | null }>)) expect(await value(rebounds.locator(`tr[data-row="${k}"] [data-field="orb_rate"]`))).toBe(v.orb_rate);
    const teams = page.getByRole("table", { name: `Team inputs ${s.season}` });
    await expect(teams.locator("tbody tr")).toHaveCount(seasons[s.season].teams.length);
    for (const t of seasons[s.season].teams) expect(await value(teams.locator(`tr[data-row="${t.team}"] [data-field="ortg"]`))).toBe(t.ortg_factors);
    await expect(page.getByRole("table", { name: "mu by season" }).locator("tbody tr")).toHaveCount(ff.seasons.length);
  });

  test("switches season and compares 2024-25 with the paper", async ({ page }) => {
    await openWorkbench(page, "/calculator");
    await page.getByRole("combobox", { name: "Season" }).selectOption("2024-25");
    await expect(page).toHaveURL(/season=2024-25/);
    await openObserved(page);
    const s = ff.seasons.find((x: { season: string }) => x.season === "2024-25");
    await expect(page.getByRole("table", { name: "League inputs" }).locator('tr[data-row="ortg"] [data-value]')).toHaveAttribute("data-value", String(s.league.ortg_factors));
    await expect(page.getByRole("table", { name: "Team inputs 2024-25" }).locator("tbody tr")).toHaveCount(30);
    const paper = page.getByRole("table", { name: "Against the paper" });
    expect(await value(paper.locator('tr[data-row="mu"] [data-field="paper"]'))).toBe(0.425);
    expect(await value(paper.locator('tr[data-row="mu"] [data-field="courtlens"]'))).toBe(s.mu);
    await expect(page.locator('.ol-equation [data-field="ortg"]')).toHaveText(s.league.ortg_factors.toFixed(1));
  });
});

test.describe("RD02 ORTG lab", () => {
  const lab = (page: import("@playwright/test").Page) => page.locator('[data-section="ortg-lab"]');
  const ortg = async (page: import("@playwright/test").Page) => Number(await page.locator('.ol-equation [data-field="ortg"]').getAttribute("data-value"));
  // Eq. (11) on the six inputs the page shows, recomputed here from the drawn data-value attributes.
  const eq11 = async (page: import("@playwright/test").Page, mu: number) => {
    const read = async (sel: string) => Number(await page.locator(sel).getAttribute("data-value"));
    const efg = await read('.ol-row[data-key="efg"] [data-field="value"]'), ft = await read('.ol-row[data-key="ft"] [data-field="value"]');
    const fta = await read('.ol-row[data-key="fta"] [data-field="value"]'), tov = await read('.ol-row[data-key="tov"] [data-field="value"]');
    const orb = await read('.ol-row[data-key="orb"] [data-field="value"]'), p2 = await read('.ol-row[data-key="p2"] [data-field="value"]');
    const p3 = await read('.ol-row[data-key="p3"] [data-field="value"]'), r3 = await read('.ol-row[data-key="r3"] [data-field="value"]');
    const fg = (1 - r3) * p2 + r3 * p3, ftr = fta * ft;
    return 100 * (1 - tov) * (ftr + 2 * efg) / (1 - orb * (1 - fg) + mu * ftr / ft);
  };

  for (const width of [1440, 390]) test(`starts from the league inputs and stays Eq. (11) when moved, ${width}`, async ({ page }) => {
    await page.setViewportSize({ width, height: width > 600 ? 900 : 844 });
    await openWorkbench(page, "/calculator");
    const s = ff.seasons.at(-1), L = s.league;
    await expect(lab(page).getByRole("heading", { level: 1 })).toHaveAccessibleName("Offensive Rating Calculator");
    expect(await ortg(page)).toBeCloseTo(L.ortg_factors, 4);
    await expect(page.locator('.ol-equation [data-field="league-ortg"]')).toHaveText(L.ortg_factors.toFixed(1));
    for (const [key, served] of [["efg", L.inputs.efg], ["p2", L.fg2], ["p3", L.fg3], ["ft", L.inputs.ft], ["ts", L.ts], ["r3", L.fg3a_rate], ["tov", L.inputs.tov_pct], ["orb", L.inputs.orb_pct], ["o2", L.rebounds_by_miss.two.orb_rate], ["o3", L.rebounds_by_miss.three.orb_rate], ["oft", L.rebounds_by_miss.ft_end.orb_rate]] as const)
      await expect(page.locator(`.ol-row[data-key="${key}"] .ol-row-value`), key).toHaveText(`${(served * 100).toFixed(1)}%`);
    const tovMarginal = Number(await page.locator('.ol-row[data-key="tov"] [data-field="marginal"]').getAttribute("data-value"));
    expect(tovMarginal).toBeCloseTo(L.marginals.tov_pct, 5);
    // A stepper click, a slider move and a master dial: the rating is Eq. (11) on the inputs drawn each time.
    await page.getByRole("button", { name: "3P% up one point" }).click();
    await expect(page.locator('.ol-step[data-key="p3"] .ol-step-value')).toHaveText(`${(L.fg3 * 100 + 1).toFixed(1)}%`);
    expect(await ortg(page)).toBeCloseTo(await eq11(page, s.mu), 6);
    await page.locator("#ol-tov").fill(String(Math.round((L.inputs.tov_pct - 0.02) * 1000) / 1000));
    expect(await ortg(page)).toBeCloseTo(await eq11(page, s.mu), 6);
    await page.getByRole("button", { name: "eFG% up one point" }).click();
    expect(await ortg(page)).toBeCloseTo(await eq11(page, s.mu), 6);
    expect(await ortg(page)).toBeGreaterThan(L.ortg_factors);
    await expect(page.locator('.ol-equation [data-field="vs-avg"]')).toHaveAttribute("data-identity", "a");
    await page.getByRole("button", { name: "Reset to league average" }).click();
    expect(await ortg(page)).toBeCloseTo(L.ortg_factors, 4);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });

  test("loads a team, clears back to the league, and switches tabs", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await openWorkbench(page, "/calculator");
    const s = ff.seasons.at(-1), team = seasons[s.season].teams[0];
    await page.getByRole("combobox", { name: "Team" }).selectOption(team.team);
    await expect(page).toHaveURL(new RegExp(`team=${team.team}`));
    await expect.poll(() => ortg(page)).toBeCloseTo(team.ortg_factors, 4);
    await expect(page.locator('.ol-row[data-key="p2"] .ol-row-value')).toHaveText(`${(team.fg2 * 100).toFixed(1)}%`);
    await page.getByRole("button", { name: "Clear team" }).click();
    await expect(page).not.toHaveURL(/team=/);
    await expect.poll(() => ortg(page)).toBeCloseTo(s.league.ortg_factors, 4);
    await page.getByRole("radio", { name: "Marginal value" }).click();
    await expect(page.locator(".ol-board-list li")).toHaveCount(12);
    await page.getByRole("radio", { name: "Context notes" }).click();
    await expect(page.locator(".ol-notes")).toContainText("League average");
  });
});
