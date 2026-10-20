import { test, expect, type Page } from "@playwright/test";
import { openWorkbench } from "./workbench-navigation";
import { lastGamesFixtures, SGA } from "./first-load-fixtures";

// Last X Games (alignment row 6): Databallr's window card, comparison, game logs and rolling trend.
const URL_SGA = `/last-games?playerId=${SGA}&season=2025-26`;
async function noSidewaysScroll(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
}

test.describe("Last X Games", () => {
  test.beforeEach(async ({ page }) => { await lastGamesFixtures(page); });

  test("titles the player and compares the last five with the games before", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await openWorkbench(page, URL_SGA);
    await expect(page.locator("h1")).toHaveText("Shai Gilgeous-Alexander Last Games Stats");
    const compare = page.getByRole("region", { name: /first 63 against last 5 games/ });
    await expect(compare.locator("thead")).toContainText("First 63 Games");
    await expect(compare.locator("thead")).toContainText("Last 5 Games");
    // Rates come from summed makes and attempts; the change is toned by better or worse.
    const pts = compare.locator("tbody tr").filter({ has: page.getByRole("rowheader", { name: "PTS", exact: true }) });
    await expect(pts.locator(".lg-change")).toHaveAttribute("data-tone", /up|down/);
    const tov = compare.locator("tbody tr").filter({ has: page.getByRole("rowheader", { name: "TOV", exact: true }) });
    await expect(tov).toBeVisible();
    await expect(page.locator(".lg-log tbody tr")).toHaveCount(68);
    await expect(page.locator(".lg-log tbody tr[data-window]")).toHaveCount(5);
  });

  test("the games chooser steps by one, slides across the season and jumps to common windows", async ({ page }) => {
    await openWorkbench(page, URL_SGA);
    const value = page.locator(".lg-chooser-value");
    await page.getByRole("button", { name: "One game more" }).click();
    await expect(value).toHaveText("6");
    await page.getByRole("radiogroup", { name: "Common windows" }).getByRole("radio", { name: "L15" }).click();
    await expect(value).toHaveText("15");
    await expect(page).toHaveURL(/window=15/);
    await expect(page.locator(".lg-log tbody tr[data-window]")).toHaveCount(15);
    const slider = page.getByRole("slider", { name: "Games in the window" });
    await slider.focus();
    await page.keyboard.press("ArrowLeft");
    await expect(value).toHaveText("14");
    await page.keyboard.press("End");
    await expect(value).toHaveText("67");
    await expect(page.getByRole("button", { name: "One game more" })).toBeDisabled();
    await expect(page.locator(".lg-chooser-range")).toContainText("68 played");
  });

  test("Per 36, Choose Stats, sorting and Card View are URL state", async ({ page }) => {
    await openWorkbench(page, URL_SGA);
    await page.getByRole("radio", { name: "Per 36 Min" }).click();
    await expect(page.locator(".lg-compare-table thead")).toContainText("Per 36 Min");
    await expect(page).toHaveURL(/mode=per_36/);
    await page.getByRole("button", { name: "Choose Stats" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByRole("button", { name: "Clear All" }).click();
    await dialog.getByText("PTS", { exact: true }).click();
    await dialog.getByText("+/-", { exact: true }).click();
    await dialog.getByRole("button", { name: "Save Changes" }).click();
    await expect(page).toHaveURL(/stats=pts%2Cpm|stats=pts,pm/);
    await expect(page.locator(".lg-compare-table tbody tr:not(.lg-compare-group):not([data-context])")).toHaveCount(2);
    await page.locator(".lg-log").getByRole("button", { name: "PTS", exact: true }).click();
    await expect(page).toHaveURL(/sort=pts/);
    const pts = (row: number) => page.locator(".lg-log tbody tr").nth(row).locator("td").nth(4).textContent().then(Number);
    await expect.poll(async () => (await pts(0)) >= (await pts(1)) && (await pts(1)) >= (await pts(2))).toBe(true);
    await page.getByRole("radio", { name: "Card View" }).click();
    await expect(page.locator(".lg-card")).toHaveCount(5);
  });

  test("the trend chart follows the window, names the hovered game and takes up to four stats", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await openWorkbench(page, `${URL_SGA}&window=10&trend=ts,ast`);
    const trend = page.getByRole("region", { name: "Rolling Trend Chart (10-game moving average)" });
    await expect(trend.getByLabel("Stat 1")).toHaveValue("ts");
    await trend.locator(".lg-trend-capture").hover({ position: { x: 300, y: 100 } });
    await expect(trend.getByRole("status")).toContainText("TS%");
    // The average is the games window: changing the window retitles the chart.
    await page.getByRole("radiogroup", { name: "Common windows" }).getByRole("radio", { name: "L5" }).click();
    await expect(page.getByRole("region", { name: "Rolling Trend Chart (5-game moving average)" })).toBeVisible();
    const chart = page.locator(".lg-trend");
    await chart.getByRole("button", { name: "Add Stat" }).click();
    await chart.getByRole("button", { name: "Add Stat" }).click();
    await expect(chart.getByLabel("Stat 4")).toBeVisible();
    await expect(chart.getByRole("button", { name: "Add Stat" })).toHaveCount(0);
    await expect(page).toHaveURL(/trend=ts%2Cast%2Creb%2Cpm|trend=ts,ast,reb,pm/);
    // Shared axes name their stats.
    await expect(chart.locator(".lg-trend-axis-name").first()).toBeVisible();
    await chart.getByRole("button", { name: "Remove REB" }).click();
    await expect(chart.getByLabel("Stat 4")).toHaveCount(0);
  });

  test("Add Season Data offers only seasons the catalog holds", async ({ page }) => {
    // The fixture catalog holds 2025-26 alone, so there is nothing earlier to add.
    await openWorkbench(page, `${URL_SGA}&add=2019-20`);
    await expect(page.locator(".lg-log tbody tr")).toHaveCount(68);
    await expect(page.getByRole("button", { name: "Add Season Data" })).toHaveCount(0);
    await expect(page.locator(".lg-chips")).toHaveText("2025-26 (Regular Season)");
  });

  test("the comparison column and Game Logs end on one line (bento fit)", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await openWorkbench(page, URL_SGA);
    await expect(page.locator(".lg-log tbody tr").first()).toBeVisible();
    const bottom = (selector: string) => page.locator(selector).evaluate(node => node.getBoundingClientRect().bottom);
    expect(Math.abs((await bottom(".lg-side")) - (await bottom(".lg-logs")))).toBeLessThanOrEqual(1);
    expect(Math.abs((await bottom(".lg-compare")) - (await bottom(".lg-logs")))).toBeLessThanOrEqual(1);
  });

  test("Change Player opens a dialog with the search focused, inside the dialog", async ({ page }) => {
    await openWorkbench(page, URL_SGA);
    await page.getByRole("button", { name: /^Change player/ }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toContainText("Change Player");
    await expect(dialog.getByRole("combobox", { name: "Search players" })).toBeFocused();
    // Results render in the dialog, not floating over the cards behind it.
    await page.keyboard.type("Fixture");
    await expect(dialog.getByRole("option").first()).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toHaveCount(0);
  });

  test("the log shows each game's result, rest and opponent defence", async ({ page }) => {
    await openWorkbench(page, URL_SGA);
    const first = page.locator(".lg-log tbody tr").first();
    await expect(first.locator(".lg-result")).toHaveText(/^[WL] \d+–\d+$/);
    await expect(first.locator(".lg-rest")).toHaveText(/^(B2B|\d+ days?)$/);
    await expect(first.locator("td").nth(3)).toHaveText(/^\d+(st|nd|rd|th)$/);
    await expect(page.locator(".lg-log tbody .lg-rest[data-b2b]").first()).toHaveText("B2B");
    // The comparison's Context band: opponents' defence and the record.
    await expect(page.locator(".lg-compare tr[data-context]").nth(1)).toContainText(/\d+–\d+/);
  });

  test("changes inside his normal range are grey and the verdict is on hover", async ({ page }) => {
    await openWorkbench(page, URL_SGA);
    await expect(page.locator(".lg-compare .lg-coverage").first()).toContainText("Gold: better · Blue: worse · Grey: his usual range");
    const changes = page.locator(".lg-compare-table .lg-change[title]");
    await expect(changes.first()).toHaveAttribute("title", /(normal range|of the season|stretches this season)/);
    expect(await page.locator(".lg-change[data-normal]").count()).toBeGreaterThan(0);
  });

  test("a comparison row adds its stat to the chart, and a log row marks its game there", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await openWorkbench(page, URL_SGA);
    await page.locator(".lg-compare").getByRole("button", { name: "TS%" }).click();
    await expect(page).toHaveURL(/trend=pts%2Cast%2Cts|trend=pts,ast,ts/);
    await expect(page.locator(".lg-compare").getByRole("button", { name: "TS%" })).toHaveAttribute("aria-pressed", "true");
    const row = page.locator(".lg-log tbody tr").nth(2);
    await row.hover();
    const date = (await row.locator("th").innerText()).trim();
    await expect(page.locator(".lg-trend").getByRole("status")).toContainText(date);
  });

  test("Since starts the window at a played day picked on a standard calendar", async ({ page }) => {
    await openWorkbench(page, `${URL_SGA}&since=2026-03-01`);
    await expect(page.getByRole("button", { name: "Window starts: Mar 1, 2026" })).toBeVisible();
    const count = await page.locator(".lg-log tbody tr").evaluateAll(rows => rows.filter(r => new Date(`${r.querySelector("th")!.textContent!.trim()} UTC`) >= new Date("2026-03-01T00:00:00Z")).length);
    await expect(page.locator(".lg-chooser-value")).toHaveText(String(count));
    // The calendar opens in place; days he did not play are disabled.
    await page.getByRole("button", { name: /^Window starts/ }).click();
    const calendar = page.getByRole("dialog");
    await expect(calendar.locator("[data-date][aria-disabled=\"true\"]").first()).toBeVisible();
    await calendar.locator("[data-date]:not([aria-disabled])").first().click();
    await expect(page).toHaveURL(/since=2026-/);
    await page.getByRole("button", { name: "Since", exact: true }).click();
    await expect(page.getByRole("menuitem").first()).toBeVisible();
    await page.keyboard.press("Escape");
    await page.getByRole("button", { name: "One game more" }).click();
    await expect(page).not.toHaveURL(/since=/);
  });

  test("fits a phone without sideways scroll", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await openWorkbench(page, URL_SGA);
    await expect(page.locator(".lg-compare")).toBeVisible();
    await noSidewaysScroll(page);
  });
});
