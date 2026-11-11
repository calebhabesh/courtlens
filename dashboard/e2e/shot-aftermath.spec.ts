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

  test("answers first under its own hero, a page of its own with no tab bar (RD17)", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await openWorkbench(page, "/research/shooting/aftermath");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("What happens after the shot?");
    await expect(page.getByRole("navigation", { name: "Shooting sections" })).toHaveCount(0);
    await expect(page.locator(".ui-route-tabs")).toHaveCount(0);
    await expect(page.locator("[data-field=hero-meta]")).toContainText("2025-26 · NBA · All positions · 194,813 first-chance attempts · Regular season");
    const answer = page.locator("[data-field=answer]");
    await expect(answer).toHaveAttribute("data-best", "rim");
    await expect(answer).toHaveAttribute("data-worst", "long_mid");
    await expect(page.locator("[data-field=headline]")).toContainText("Rim attempts return the most, 1.40 points per first-chance attempt");
    await expect(page.locator("[data-field=answer-rebound]")).toHaveAttribute("data-zone", "rim");
    // RD18 suggestion 1: the other season, same scope, read independently from the served 2024-25 rows (order and rim effect both held).
    const other = page.locator("[data-field=answer-other-season]");
    await expect(other).toHaveAttribute("data-season", "2024-25");
    await expect(other).toHaveAttribute("data-same-order", "true");
    await expect(other).toHaveAttribute("data-order", "rim,three,short_mid,long_mid");
    await expect(other).toHaveAttribute("data-rebound", "held");
    await expect(other).toHaveText("The same zone order held in 2024-25, and the opponent again scored more than average after a\u00a0rim miss the defence rebounded, interval clear of zero.");
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

  test("scopes the page to a team from its row without moving it, and back (RD18 suggestion 2)", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await openWorkbench(page, "/research/shooting/aftermath");
    const row = page.locator("table[data-table=teams] tr[data-team=BOS]");
    await row.scrollIntoViewIfNeeded();
    // The row stays where it was on screen (the browser may adjust scrollY to hold it while content above changes height).
    const top = async () => (await row.boundingBox())!.y;
    const before = await top();
    await row.getByRole("button", { name: "Show the page for BOS" }).click();
    await expect(page).toHaveURL(/team=BOS/);
    await expect(page.locator("[data-field=hero-meta]")).toContainText("BOS");
    await expect(row).toHaveAttribute("data-selected", "true");
    await expect(row.getByRole("button", { name: "Show every team again" })).toHaveAttribute("aria-pressed", "true");
    expect(Math.abs(await top() - before)).toBeLessThan(4);
    await row.getByRole("button", { name: "Show every team again" }).click();
    await expect(page).not.toHaveURL(/team=/);
    await expect(page.locator("[data-field=hero-meta]")).toContainText("NBA");
  });

  test("ends the cost axis on a round step (RD18 suggestion 4)", async ({ page }) => {
    await openWorkbench(page, "/research/shooting/aftermath?team=BOS&position=bigs&view=dreb");
    const cost = page.locator("[data-chart=dreb_cost]");
    await expect(cost).toHaveAttribute("data-top", "2");
    await expect(cost.locator(".sa-axis > span")).toHaveText(["−2.00", "−1.00", "0.00", "+1.00", "+2.00"]);
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
    await page.getByRole("radio", { name: "Cost", exact: true }).click();
    await expect(page.locator("table[data-table=teams] thead")).toContainText("Opponent cost");
  });

  test("keeps every chart's interval on one line on a phone (RD18 suggestion 5)", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    for (const path of ["/research/shooting/aftermath", "/research/shooting/aftermath?team=BOS&position=bigs&view=dreb"]) {
      await openWorkbench(page, path);
      await expect(page.locator("[data-field=chart-band]").first()).toBeVisible();
      await page.evaluate(() => document.fonts.ready);
      const bad = await page.locator("[data-field=chart-band]").evaluateAll(els => els.filter(el => {
        const label = el.closest(".sa-label")!.getBoundingClientRect();
        const range = document.createRange(); range.selectNodeContents(el);
        const lines = new Set([...range.getClientRects()].map(r => Math.round(r.top))).size, text = range.getBoundingClientRect();
        return lines > 1 || text.left < label.left - 1 || text.right > label.right + 1;
      }).map(el => el.textContent));
      expect(bad).toEqual([]);
    }
    await expect(page.locator("[data-chart=dreb_cost] .sa-col[data-zone=rim]")).toHaveAttribute("data-low", /^-0\.3/);
    await expect(page.locator("[data-chart=dreb_cost] [data-field=chart-band]").first()).toHaveText(/^−\.3\d\d to \+\.\d{3}$/);
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

test.describe("RD18 extras (finish plan F02)", () => {
  test.beforeEach(async ({ page }) => { await serve(page); });

  test("shows guards, forwards and bigs by zone with the served values, net or rebound cost", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await openWorkbench(page, "/research/shooting/aftermath");
    const grid = page.locator("table[data-table=positions]");
    await expect(grid.locator("tbody tr")).toHaveCount(3);
    for (const position of ["guards", "forwards", "bigs"]) {
      const served = scope(`/scope?season=2025-26&team=all&position=${position}`);
      for (const zone of ["rim", "three"]) {
        const cell = grid.locator(`tr[data-position=${position}] [data-field="net:${zone}"]`);
        await expect(cell).toHaveAttribute("data-value", String(served.rows.find(r => r.zone === zone)!.values.net!.value));
      }
    }
    await page.getByRole("radio", { name: "Rebound cost" }).click();
    const bigs = scope("/scope?season=2025-26&team=all&position=bigs").rows.find(r => r.zone === "rim")!;
    const cell = grid.locator('tr[data-position=bigs] [data-field="dreb_cost:rim"]');
    await expect(cell).toHaveAttribute("data-value", String(bigs.values.dreb_cost!.value));
    await expect(cell).toHaveAttribute("data-tone", bigs.tones.dreb_cost ?? "");
    await expect(page.locator("[data-field=positions-colour]")).toBeVisible();
  });

  test("dims thin position cells and never colours them (BOS)", async ({ page }) => {
    await openWorkbench(page, "/research/shooting/aftermath?team=BOS");
    await page.getByRole("radio", { name: "Rebound cost" }).click();
    const thin = page.locator('table[data-table=positions] td[data-status="thin"]');
    await expect(thin.first()).toBeVisible();
    for (const td of await thin.all()) {
      await expect(td.locator(".rs-grid-value")).toHaveAttribute("data-muted", "true");
      await expect(td.locator(".rs-grid-value")).not.toHaveAttribute("data-tone", /.+/);
    }
  });

  test("puts after-a-make beside after-a-rebound on the rebound view, neutral, with the league line", async ({ page }) => {
    await openWorkbench(page, "/research/shooting/aftermath?view=dreb");
    const chart = page.locator("[data-chart=make-vs-rebound]");
    await expect(chart).toBeVisible();
    const served = scope("/scope?season=2025-26&team=all&position=all");
    for (const zone of ["rim", "short_mid", "long_mid", "three"]) {
      const row = served.rows.find(r => r.zone === zone)!;
      await expect(chart.locator(`.sa-col[data-zone=${zone}] [data-series=ppp_make]`).first()).toHaveAttribute("data-value", String(row.values.ppp_make!.value));
      await expect(chart.locator(`.sa-col[data-zone=${zone}] [data-series=ppp_dreb]`).first()).toHaveAttribute("data-value", String(row.values.ppp_dreb!.value));
    }
    await expect(chart.locator(".sa-gridline[data-league]")).toHaveCount(1);
    await expect(chart.locator("[data-tone=good], [data-tone=bad]")).toHaveCount(0);
    await page.getByRole("radio", { name: "All attempts" }).click();
    await expect(chart).toHaveCount(0);
  });

  test("fits a phone: position column groups and stacked pair values, no sideways scroll", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await openWorkbench(page, "/research/shooting/aftermath?view=dreb");
    await expect(page.locator("table[data-table=positions]")).toBeVisible();
    await page.evaluate(() => document.fonts.ready);
    const wide = await page.evaluate(() => [...document.querySelectorAll(".stats-scroll-region")].filter(r => r.scrollWidth > r.clientWidth + 1).map(r => r.getAttribute("aria-label")));
    expect(wide).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBe(0);
    await page.getByRole("radio", { name: "Long mid, three, all" }).click();
    await expect(page.locator("table[data-table=positions] thead")).toContainText("Three");
  });
});
