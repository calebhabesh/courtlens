import { expect, test } from "@playwright/test";
import { openWorkbench } from "./workbench-navigation";

// Alignment row 2: the player page melds Databallr's in-table career view into its own page.

for (const width of [1440, 390]) {
  test(`awards form a complete column with wrapping badges and continuous row highlighting at ${width}`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.emulateMedia({ reducedMotion: "reduce" });
    await openWorkbench(page, "/players/24");
    const scroll = page.getByRole("region", { name: "Career table scroll area" });
    await scroll.scrollIntoViewIfNeeded();
    await scroll.evaluate(el => { el.scrollLeft = el.scrollWidth; });
    const table = scroll.getByRole("table");
    await expect(table.locator(".stats-header-tier-1").getByRole("columnheader", { name: "Awards", exact: true })).toHaveText("Awards");
    await expect(table.locator(".stats-header-tier-2").getByRole("columnheader", { name: "Accolades", exact: true })).toBeVisible();
    const row = table.locator("tbody .player-career-row").first();
    const awards = row.locator("td").last();
    await expect(awards.locator(".ui-badge > span > [aria-hidden]")).toHaveText(["MVP 2nd", "DPOY Winner", "All-NBA 1st", "All-Def 1st"]);
    await expect(awards.getByTitle("Defensive Player of the Year winner")).toHaveClass(/ui-badge-accent/);
    await expect(awards.getByTitle("All-NBA First Team")).not.toHaveClass(/ui-badge-accent/);
    const fit = await awards.evaluate(el => {
      const cell = el.getBoundingClientRect();
      const badges = [...el.querySelectorAll(".ui-badge")].map(badge => badge.getBoundingClientRect());
      return { contained: badges.every(badge => badge.left >= cell.left && badge.right <= cell.right && badge.top >= cell.top && badge.bottom <= cell.bottom),
        lines: new Set(badges.map(badge => Math.round(badge.top))).size, height: cell.height };
    });
    expect(fit.contained).toBe(true);
    expect(fit.lines).toBe(2);
    expect(fit.height).toBeLessThanOrEqual(52);
    const metric = row.locator("td[data-column]").last();
    expect(await awards.evaluate(el => getComputedStyle(el).backgroundColor)).toBe(await metric.evaluate(el => getComputedStyle(el).backgroundColor));
    const resting = await awards.evaluate(el => getComputedStyle(el).backgroundColor);
    await awards.hover();
    await expect.poll(() => awards.evaluate(el => getComputedStyle(el).backgroundColor)).not.toBe(resting);
    expect(await awards.evaluate(el => getComputedStyle(el).backgroundColor)).toBe(await metric.evaluate(el => getComputedStyle(el).backgroundColor));
    expect(await awards.evaluate(el => el.getBoundingClientRect().right)).toBe(await table.evaluate(el => el.getBoundingClientRect().right));
    // A view switch must retain the awards geometry, without widening the page.
    await page.getByRole("radiogroup", { name: "Career table views" }).getByRole("radio", { name: "Shooting", exact: true }).click();
    await scroll.evaluate(el => { el.scrollLeft = el.scrollWidth; });
    await expect(awards.getByTitle("All-NBA First Team")).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width);
  });

  test(`the pinned Year cell hides scrolling metrics while hovered at ${width}`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.emulateMedia({ reducedMotion: "reduce" });
    await openWorkbench(page, "/players/23");
    const scroll = page.getByRole("region", { name: "Career table scroll area" });
    const year = scroll.locator("tbody .pinned-col-year").first();
    await scroll.scrollIntoViewIfNeeded();
    const maximum = await scroll.evaluate(el => el.scrollWidth - el.clientWidth);
    expect(maximum).toBeGreaterThan(0);
    await scroll.evaluate((el, offset) => { el.scrollLeft = offset; }, maximum / 3);
    await year.hover();
    const firstPosition = await year.boundingBox();
    const first = await year.screenshot({ animations: "disabled" });
    await scroll.evaluate((el, offset) => { el.scrollLeft = offset; }, maximum * 2 / 3);
    await year.hover();
    expect(await year.boundingBox()).toEqual(firstPosition);
    expect((await year.screenshot({ animations: "disabled" })).equals(first)).toBe(true);
  });
}

test("a player opened from Stats offers Back to table, and Esc returns to the same table", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openWorkbench(page, "/stats");
  await page.waitForLoadState("networkidle");
  const statsUrl = page.url();
  await page.locator(".stats-player-link", { hasText: "Fixture Star" }).click();
  await page.waitForURL(url => url.pathname === "/players/23" && url.searchParams.get("from") === "stats");
  const back = page.getByRole("button", { name: /Back to table/ });
  await expect(back).toBeVisible();
  await page.keyboard.press("Escape");
  await page.waitForURL(url => url.pathname === "/stats");
  expect(page.url()).toBe(statsUrl);
  // Opened any other way, there is no table to return to.
  await openWorkbench(page, "/players/23");
  await expect(page.getByRole("heading", { level: 1, name: "Fixture Star" })).toBeVisible();
  await expect(page.getByRole("button", { name: /Back to table/ })).toHaveCount(0);
});

test("the header summarises the player and the summary card has no accent edge", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openWorkbench(page, "/players/23");
  await expect(page.locator("h1")).toHaveCount(1);
  const facts = page.locator(".player-bio-facts");
  await expect(facts).toContainText("BornFeb 10, 1998 (28)");
  await expect(facts).toContainText("6′8″ · 220 lb");
  await expect(facts).toContainText("7th season");
  await expect(facts).toContainText("2018 · R1 #9 · TOR");
  await expect(facts).toContainText("Fixtureland");
  // No combine record: no combine line, never a row of dashes.
  await expect(page.locator(".player-bio-combine")).toHaveCount(0);
  const summary = page.getByRole("region", { name: "Season summary" });
  await expect(summary.locator(".player-summary-stat")).toHaveCount(6);
  expect(await summary.evaluate(el => getComputedStyle(el).boxShadow)).toBe("none");
});

test("the career table lists played seasons with a Career row, and phase links the page", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  // The rows arrive with the page and carry every column: the browser never requests them.
  const careerRequests: string[] = [];
  page.on("request", request => { if (new URL(request.url()).pathname.endsWith("/career")) careerRequests.push(request.url()); });
  await openWorkbench(page, "/players/23");
  const career = page.getByRole("table", { name: "Career statistics by season" });
  await expect(career.locator("tbody tr.player-career-row")).toHaveCount(1);
  await expect(career.locator("tbody tr.player-career-row").first()).toContainText("2025-26");
  await expect(career.locator("tbody tr.player-career-row").first()).toHaveAttribute("aria-current", "true");
  await expect(career.locator("tfoot")).toContainText("Career");
  await expect(page.getByRole("region", { name: "Career table scroll area" })).toHaveAttribute("aria-busy", "false");
  // View tabs reuse the Stats views.
  await page.getByRole("radiogroup", { name: "Career table views" }).getByRole("radio", { name: "Shooting", exact: true }).click();
  await expect(career.locator("thead")).toContainText("FGM");
  expect(careerRequests).toEqual([]);
  // The fixture catalog observes no playoffs, so that phase cannot be chosen.
  await expect(page.getByRole("radiogroup", { name: "Phase" }).getByRole("radio", { name: "Playoffs" })).toBeDisabled();
  // The trajectory moved to Game Log; Overview leads with the season summary.
  await expect(page.locator(".pc12-profile-trajectory")).toHaveCount(0);
  await page.getByRole("tablist", { name: "Profile sections" }).getByRole("tab", { name: "Game Log" }).click();
  await expect(page.getByRole("region", { name: "Headline result" }).locator(".trend-svg").first()).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
});
