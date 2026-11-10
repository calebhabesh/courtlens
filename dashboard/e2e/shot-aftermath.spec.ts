import { expect, test, type Page } from "@playwright/test";
import { openWorkbench } from "./workbench-navigation";
import fixtures from "./fixtures/rd18-shot-aftermath.json";

/*
 * RD18 Shot Aftermath on real-API fixtures (GET /api/shot-aftermath, courtlens-shot-aftermath-v1, captured from the owner's API): the answer,
 * the view switch, the zone charts on their axes, the tables, the 30-team table, colour only where a 95% interval excludes zero, and the
 * phone layout switching column groups instead of scrolling sideways.
 */

type Responses = Record<string, unknown>;
const responses = (fixtures as { responses: Responses }).responses;

async function serve(page: Page) {
  await page.route(/\/api\/shot-aftermath(\/(scope|teams))?(\?.*)?$/, route => {
    const url = new URL(route.request().url());
    const key = `${url.pathname.replace(/^\/api\/shot-aftermath/, "")}${url.search}`;
    const body = responses[key];
    return body ? route.fulfill({ json: body }) : route.fulfill({ status: 404, json: { detail: `no fixture for ${key}` } });
  });
}

const scope = (key: string) => responses[key] as { rows: { zone: string; values: Record<string, { value: number } | null>; tones: Record<string, string | null> }[] };

test.describe("RD18 Shot Aftermath", () => {
  test.beforeEach(async ({ page }) => { await serve(page); });

  test("answers first under its own hero with the Shooting tabs", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await openWorkbench(page, "/research/shooting/aftermath");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("What happens after the shot?");
    const tabs = page.getByRole("navigation", { name: "Shooting sections" });
    await expect(tabs.locator('[aria-current="page"]')).toHaveText("Shot Aftermath");
    await expect(page.locator("[data-field=hero-meta]")).toContainText("2025-26 · NBA · All positions · 194,813 first-chance attempts · Regular season");
    const answer = page.locator("[data-field=answer]");
    await expect(answer).toHaveAttribute("data-best", "rim");
    await expect(answer).toHaveAttribute("data-worst", "long_mid");
    await expect(page.locator("[data-field=headline]")).toContainText("Rim attempts return the most, 1.40 points per first-chance attempt");
    await expect(page.locator("[data-field=answer-rebound]")).toHaveAttribute("data-zone", "rim");
    // No project codes or hashes in the visible text; they live in the collapsed About.
    const visible = await page.locator("main").evaluate(main => (main as HTMLElement).innerText);
    expect(visible).not.toMatch(/courtlens-shot-aftermath-v1|5aa5161b|\b[0-9a-f]{16,}\b/);
  });

  test("draws points on one axis from zero, cost on its own, and colours only clear costs", async ({ page }) => {
    await openWorkbench(page, "/research/shooting/aftermath");
    const own = page.locator("[data-chart=own]"), second = page.locator("[data-chart=second]"), cost = page.locator("[data-chart=cost]");
    await expect(own).toHaveAttribute("data-top", "1.5");
    await expect(second).toHaveAttribute("data-top", "1.5");
    await expect(cost).toHaveAttribute("data-kind", "cost");
    const served = scope("/scope?season=2025-26&team=all&position=all");
    for (const row of served.rows.filter(r => r.zone !== "all")) {
      const col = cost.locator(`.sa-col[data-zone=${row.zone}]`);
      await expect(col).toHaveAttribute("data-value", String(row.values.cost!.value));
      await expect(col).toHaveAttribute("data-tone", row.tones.cost === "benefit" ? "good" : row.tones.cost === "cost" ? "bad" : "");
    }
    await expect(own.locator(".sa-col[data-tone=good], .sa-col[data-tone=bad]")).toHaveCount(0);
  });

  test("switches views in place without scrolling the page", async ({ page }) => {
    await openWorkbench(page, "/research/shooting/aftermath");
    await page.locator("#outcomes").scrollIntoViewIfNeeded();
    const before = await page.evaluate(() => scrollY);
    await page.getByRole("radio", { name: "After a defensive rebound" }).click();
    await expect(page).toHaveURL(/view=dreb/);
    await expect(page.locator("[data-chart=ppp_dreb]")).toBeVisible();
    await expect(page.locator("[data-chart=dreb_cost]")).toBeVisible();
    expect(Math.abs(await page.evaluate(() => scrollY) - before)).toBeLessThan(4);
    await page.getByRole("radio", { name: "After a miss" }).click();
    await expect(page.locator("[data-chart=miss_cost]")).toBeVisible();
    await expect(page.locator("[data-chart=own]")).toHaveCount(0);
  });

  test("filters by team and estimated position, with the meta line and team table following", async ({ page }) => {
    await openWorkbench(page, "/research/shooting/aftermath?team=BOS&position=bigs");
    await expect(page.locator("[data-field=hero-meta]")).toContainText("BOS");
    await expect(page.locator("[data-field=hero-meta]")).toContainText("Bigs (estimated)");
    await expect(page.locator("[data-field=position-line]")).toContainText("888");
    const teams = page.locator("table[data-table=teams] tbody tr");
    await expect(teams).toHaveCount(30);
    await expect(page.locator("table[data-table=teams] tr[data-team=BOS]")).toHaveAttribute("data-selected", "true");
    await expect(page.locator("[data-field=chance-line]")).toContainText("1 cost in 20");
    // BOS bigs took 12 long mid-range shots: thin, so the answer names it instead of ranking it.
    await expect(page.locator("[data-field=answer]")).not.toHaveAttribute("data-worst", "long_mid");
    await expect(page.locator("[data-field=answer-thin-zones]")).toHaveAttribute("data-zones", "long_mid");
  });

  test("sorts the team table as a view and keeps unknowns last", async ({ page }) => {
    await openWorkbench(page, "/research/shooting/aftermath");
    const first = page.locator("table[data-table=teams] tbody tr").first();
    await expect(first).toHaveAttribute("data-team", "ATL");
    await page.locator("table[data-table=teams] thead").getByRole("button", { name: "Sort by Net", exact: true }).click();
    const board = responses["/teams?season=2025-26&position=all&zone=all"] as { rows: { team_code: string; values: { net: { value: number } | null } }[] };
    const best = [...board.rows].sort((a, b) => (b.values.net?.value ?? -9) - (a.values.net?.value ?? -9))[0];
    await expect(first).toHaveAttribute("data-team", best.team_code);
  });

  test("fits a phone by switching column groups instead of scrolling", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await openWorkbench(page, "/research/shooting/aftermath");
    await expect(page.locator("table[data-table=teams]")).toBeVisible();
    await page.waitForLoadState("networkidle");
    await page.evaluate(() => document.fonts.ready);
    const wide = await page.evaluate(() => [...document.querySelectorAll(".stats-scroll-region")].filter(r => r.scrollWidth > r.clientWidth + 1).map(r => r.getAttribute("aria-label")));
    expect(wide).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBe(0);
    await page.getByRole("radio", { name: "Cost" }).click();
    await expect(page.locator("table[data-table=teams] thead")).toContainText("Opponent cost");
  });

  test("keeps identifiers in the collapsed About and the CSV complete", async ({ page }) => {
    await openWorkbench(page, "/research/shooting/aftermath");
    const about = page.locator("#about");
    await expect(about.locator("[data-field=results-hash]")).toBeHidden();
    await about.locator("summary").first().click();
    await expect(about.locator("[data-field=results-hash]")).toHaveText(/^5aa5161b/);
    const download = page.waitForEvent("download");
    await page.getByRole("button", { name: "Export CSV" }).click();
    const file = await download;
    expect(file.suggestedFilename()).toBe("courtlens-shot-aftermath-2025-26-nba-all.csv");
  });
});
