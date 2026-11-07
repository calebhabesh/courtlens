import { expect, test, type Locator } from "@playwright/test";
import { readFileSync } from "node:fs";
import { openWorkbench } from "./workbench-navigation";

// Real R10 API answers (e2e/fixtures/r10-*.json): the pages must show them exactly.
const read = (name: string) => JSON.parse(readFileSync(`e2e/fixtures/r10-${name}.json`, "utf8"));
const wingspan = read("wingspan"), nearest = read("wingspan-nearest"), ff = read("four-factors"), seasons = read("four-factors-seasons");
const served = (value: string | null) => value === null || value === "" ? null : Number(value);
const value = async (cell: Locator) => served(await cell.getAttribute("data-value"));

type Player = { player_id: string; name: string; measured: boolean; in_population: boolean; height: number | null; height_shoes: number | null; wingspan: number | null; diff: number | null;
  d_dpm: number | null; d_dpm_now: number | null; position: string | null; active: boolean | null };
const players = wingspan.players as Player[];
const byWingspan = (rows: Player[]) => [...rows].sort((a, b) => (b.wingspan ?? 0) - (a.wingspan ?? 0) || a.player_id.localeCompare(b.player_id));
const measured = byWingspan(players.filter(p => p.measured));
const active = measured.filter(p => p.active === true);
const rowIds = (page: import("@playwright/test").Page) => page.locator('[aria-label="Wingspan players"] tbody tr[data-row]').evaluateAll(rows => rows.map(r => (r as HTMLElement).dataset.row));

// RD01: one page after Databallr's Wingspan Database; R10's registered numbers below it.
test.describe("R10 Wingspan beside D-DPM (RD01 layout)", () => {
  test.beforeEach(async ({ page }) => { await page.setViewportSize({ width: 1440, height: 900 }); });

  test("shows every registered correlation, positional average and the headline", async ({ page }) => {
    await openWorkbench(page, "/wingspan");
    const table = page.getByRole("table", { name: "Correlations", exact: true });
    const all = [...wingspan.correlations, wingspan.partial];
    await expect(table.locator("tbody tr")).toHaveCount(all.length);
    for (const [i, c] of all.entries()) {
      const row = table.locator("tbody tr").nth(i);
      expect(await value(row.locator('[data-field="r"]'))).toBe(c.r);
      expect(served(await row.locator('[data-field="interval"]').getAttribute("data-low"))).toBe(c.low);
      expect(served(await row.locator('[data-field="interval"]').getAttribute("data-high"))).toBe(c.high);
      await expect(row.locator('[data-field="verdict"]')).toHaveAttribute("data-value", c.verdict);
      await expect(row.locator("[data-tone], [data-identity]")).toHaveCount(0);
    }
    await expect(page.locator('[data-field="headline"]')).toHaveAttribute("data-value", String(wingspan.correlations[0].r));
    await expect(page.getByRole("table", { name: "Correlations within position" }).locator("tbody tr")).toHaveCount(wingspan.within_position.length);
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
    // Default scatter: barefoot height against wingspan over every measured player, with the served r.
    await expect(page.locator("circle[data-player]")).toHaveCount(measured.filter(p => p.height !== null && p.wingspan !== null).length);
    const hw = wingspan.correlations.find((c: { x: string; y: string }) => c.x === "height" && c.y === "wingspan");
    await expect(page.locator('[data-field="scatter-r"]')).toHaveAttribute("data-value", String(hw.r));
    await page.getByRole("combobox", { name: "Horizontal axis" }).selectOption("wingspan");
    await page.getByRole("combobox", { name: "Vertical axis" }).selectOption("d_dpm");
    await expect(page.locator("circle[data-player]")).toHaveCount(wingspan.population.analysis);
  });

  test("opens on active players longest wingspan first, filters and keeps unknowns blank", async ({ page }) => {
    await openWorkbench(page, "/wingspan");
    await expect(page.getByRole("radio", { name: "Active", exact: true })).toHaveAttribute("aria-checked", "true");
    await expect(page.locator('[data-field="summary"]')).toHaveAttribute("data-value", String(active.length));
    expect(await rowIds(page)).toEqual(active.map(p => p.player_id));
    const grid = page.locator('[aria-label="Wingspan players"]');
    for (const p of active.slice(0, 20)) {
      const row = grid.locator(`tr[data-row="${p.player_id}"]`);
      for (const k of ["height", "wingspan", "diff", "d_dpm_now", "d_dpm"] as const) {
        const cell = row.locator(`td[data-column="${k}"]`);
        expect(served(await cell.getAttribute("data-value"))).toBe(p[k]);
        if (p[k] === null) await expect(cell).toHaveText("—");
      }
      if (p.d_dpm_now !== null && p.d_dpm_now !== 0) await expect(row.locator('td[data-column="d_dpm_now"] .rt-value')).toHaveAttribute("data-identity", p.d_dpm_now > 0 ? "a" : "b");
    }
    await page.getByRole("radio", { name: "PG", exact: true }).click();
    await expect(page.locator('[data-field="summary"]')).toHaveAttribute("data-value", String(active.filter(p => p.position === "PG").length));
    await page.getByRole("radio", { name: "All Players" }).click();
    await expect(page.locator('[data-field="summary"]')).toHaveAttribute("data-value", String(measured.filter(p => p.position === "PG").length));
    await expect(page).toHaveURL(/status=all/);
  });

  test("switches to inches and to measured shoe height, never an allowance", async ({ page }) => {
    await openWorkbench(page, "/wingspan?shoes=1&units=in");
    const grid = page.locator('[aria-label="Wingspan players"]');
    const withShoes = active.find(p => p.height_shoes !== null)!, without = active.find(p => p.height_shoes === null)!;
    const cell = (p: Player) => grid.locator(`tr[data-row="${p.player_id}"] td[data-column="height"]`);
    expect(served(await cell(withShoes).getAttribute("data-value"))).toBe(withShoes.height_shoes);
    await expect(cell(withShoes)).toHaveText(`${withShoes.height_shoes!.toFixed(2)}″`);
    await expect(cell(without)).toHaveText("—");
  });

  test("similar profiles start empty, then show nearest builds for a chosen player", async ({ page }) => {
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
    await openWorkbench(page, "/wingspan?build=203497");
    await expect(table.locator("tbody tr").nth(1)).toHaveAttribute("data-row", nearest["203497"].neighbours[0].player_id);
  });

  test("adds players to the overlay to scale and removes them", async ({ page }) => {
    await openWorkbench(page, "/wingspan");
    await expect(page.locator('[data-field="overlay-empty"]')).toBeVisible();
    const [a, b] = active;
    await page.getByRole("button", { name: `Add ${a.name} to the overlay` }).click();
    await expect(page.getByRole("button", { name: `${a.name} is in the overlay` })).toBeDisabled();
    await page.getByRole("button", { name: `Add ${b.name} to the overlay` }).click();
    await expect(page).toHaveURL(new RegExp(`overlay=${a.player_id}(%2C|,)${b.player_id}`));
    for (const p of [a, b]) {
      expect(served(await page.locator(`line[data-player="${p.player_id}"][data-kind="wingspan"]`).getAttribute("data-value"))).toBe(p.wingspan);
      expect(served(await page.locator(`line[data-player="${p.player_id}"][data-kind="height"]`).getAttribute("data-value"))).toBe(p.height);
    }
    await page.getByRole("button", { name: `Remove ${a.name} from the overlay` }).click();
    await expect(page.locator(`line[data-player="${a.player_id}"]`)).toHaveCount(0);
    await page.getByRole("button", { name: "Clear", exact: true }).click();
    await expect(page.locator('[data-field="overlay-empty"]')).toBeVisible();
  });
});

test.describe("R10 ORtg calculator inputs", () => {
  test.beforeEach(async ({ page }) => { await page.setViewportSize({ width: 1440, height: 900 }); });

  test("shows the latest season's league inputs, marginals, rebounds and teams", async ({ page }) => {
    await openWorkbench(page, "/calculator");
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
    const s = ff.seasons.find((x: { season: string }) => x.season === "2024-25");
    await expect(page.getByRole("table", { name: "League inputs" }).locator('tr[data-row="ortg"] [data-value]')).toHaveAttribute("data-value", String(s.league.ortg_factors));
    await expect(page.getByRole("table", { name: "Team inputs 2024-25" }).locator("tbody tr")).toHaveCount(30);
    const paper = page.getByRole("table", { name: "Against the paper" });
    expect(await value(paper.locator('tr[data-row="mu"] [data-field="paper"]'))).toBe(0.425);
    expect(await value(paper.locator('tr[data-row="mu"] [data-field="courtlens"]'))).toBe(s.mu);
  });
});
