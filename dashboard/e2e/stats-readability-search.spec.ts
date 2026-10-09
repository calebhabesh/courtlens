import { expect, test } from "@playwright/test";
import { openWorkbench } from "./workbench-navigation";
test.use({ hasTouch: true });

test("standard records are readable and portrait gutters center between metric values", async ({ page }) => {
  await page.setViewportSize({ width: 2048, height: 1100 });
  await openWorkbench(page, "/stats");
  const geometry = await page.locator(".stats-table-row").first().evaluate(row => {
    const center = (element: Element) => { const box = element.getBoundingClientRect(); return box.x + box.width / 2; };
    return { height: row.getBoundingClientRect().height,
      font: getComputedStyle(row.querySelector(".stat-main-value")!).fontSize,
      offsets: [...row.querySelectorAll(".stats-guide-cell")].map(cell => center(cell.firstElementChild!) -
        (center(cell.previousElementSibling!.querySelector(".stat-main-value")!) + center(cell.nextElementSibling!.querySelector(".stat-main-value")!)) / 2) };
  });
  expect(geometry.height).toBe(52);
  expect(geometry.font).toBe("14px");
  geometry.offsets.forEach(offset => expect(Math.abs(offset)).toBeLessThan(1));
  const portraits = await page.locator(".stats-table-row").first().evaluate(row => ({
    main: row.querySelector(".stats-primary-portrait")!.getBoundingClientRect().width,
    guides: [...row.querySelectorAll(".stats-guide-cell > *")].map(image => image.getBoundingClientRect().width)
  }));
  expect(portraits).toEqual({ main: 40, guides: [34, 34, 34] });
});

test("header branding and secondary navigation align", async ({ page }) => {
  await openWorkbench(page, "/stats");
  expect(await page.locator(".brand-title").textContent()).toBe("CourtLens");
  expect(await page.locator(".brand-mark-svg rect").count()).toBe(0);
  expect(await page.locator(".replica-nav-right").getByRole("button", { name: "More options", exact: true }).count()).toBe(1);
  const offset = await page.locator(".brand").evaluate(element => {
    const center = (e: Element) => { const r = e.getBoundingClientRect(); return r.y + r.height / 2; };
    return center(element.querySelector("svg")!) - center(element.querySelector(".brand-title")!);
  });
  expect(Math.abs(offset)).toBeLessThan(1);
  expect(await page.locator(".brand-title path").getAttribute("d")).toBe(await page.locator(".stats-table-brand path").getAttribute("d"));
});

test("profile exports keep the same shared wordmark artwork", async ({ page }) => {
  await openWorkbench(page, "/players/23");
  const brandPath = await page.locator(".brand-title path").getAttribute("d");
  expect(await page.locator(".player-detail-container .courtlens-wordmark path").getAttribute("d")).toBe(brandPath);
  const svgDownload = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export", exact: true }).click();
  await page.getByRole("menuitem", { name: "Export SVG", exact: true }).click();
  const path = await (await svgDownload).path();
  const { readFile } = await import("node:fs/promises");
  const svg = await readFile(path!, "utf8");
  expect(svg).toContain(brandPath!);
  expect(svg).not.toContain("fontshare.com/wf");
  const pngDownload = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export", exact: true }).click();
  await page.getByRole("menuitem", { name: "Export PNG", exact: true }).click();
  const png = await readFile((await (await pngDownload).path())!, "hex");
  expect(png.startsWith("89504e470d0a1a0a")).toBe(true);
});

test("global search clear button uses the right edge and concise player captions", async ({ page }) => {
  await openWorkbench(page, "/stats");
  await page.route("**/api/workbench/lookup?**", async route => {
    const response = await route.fetch();
    const data = await response.json();
    const first = data.items[0];
    data.items = [
      { ...first, matched_alias: "star", subtitle: "TOR · Observed in selected scope", team_association: { basis: "selected_scope", teams: ["TOR"], season: "2025-26" } },
      { ...first, canonical_id: "missing", display_name: "Missing Star", matched_alias: "star", subtitle: "No observed appearances in selected scope", availability: { status: "no_current_games" } },
      { ...first, canonical_id: "historical", display_name: "Historical Star", team_association: { basis: "last_observed", teams: ["BOS"], season: "2023-24" } }
    ];
    await route.fulfill({ response, json: data });
  });
  await page.locator(".courtlens-search-pill").click();
  const input = page.getByRole("combobox", { name: "Search players, teams and pages", exact: true });
  await input.fill("Star");
  // FO02: the search modal is .ui-command-palette; .ui-command-palette on its scrim caused the 480px dim column.
  const gap = await page.locator(".ui-command-palette").evaluate(element =>
    element.querySelector("input")!.getBoundingClientRect().right - element.querySelector(".lookup-clear-btn")!.getBoundingClientRect().right);
  expect(gap).toBeLessThanOrEqual(8);
  await expect(page.locator(".ui-command-palette").getByRole("option")).toHaveCount(3);
  await expect(page.locator(".ui-command-palette .lookup-alias-badge")).toHaveCount(0);
  const captions = await page.locator(".ui-command-palette .lookup-item-subtitle").allTextContents();
  expect(captions).toEqual(["TOR · 2025-26", "No stats in selected scope", "BOS · Last observed team"]);
});

test("table suggestions remain visible outside the scroll region and filter in place", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1100 });
  await openWorkbench(page, "/stats?season=2025-26&phase=regular_season&beforeDate=2026-04-13&window=season");
  await expect(page.getByRole("combobox", { name: "Filter players by name" })).toBeVisible();
  const input = page.getByRole("combobox", { name: "Filter players by name" });
  const lookup = page.waitForRequest(request => request.url().includes("/lookup") && new URL(request.url()).searchParams.get("q") === "Star");
  await input.fill("Star");
  const request = new URL((await lookup).url());
  expect(request.searchParams.get("kinds")).toBe("player");
  expect(request.searchParams.get("season")).toBe("2025-26");
  const option = page.getByRole("option", { name: /Fixture Star/ });
  await expect(option).toBeVisible();
  expect(await option.evaluate(element => { const box = element.getBoundingClientRect(); return element.contains(document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2)); })).toBe(true);
  await input.press("ArrowDown"); await input.press("Enter");
  await page.waitForURL(url => url.searchParams.get("name") === "Fixture Star");
  expect(new URL(page.url()).pathname).toBe("/stats");
  expect(new URL(page.url()).searchParams.get("beforeDate")).toBe("2026-04-13");
  await expect(page.locator(".stats-table-row")).toHaveCount(1);
  await page.getByRole("button", { name: "Clear player search", exact: true }).click();
  await page.waitForURL(url => !url.searchParams.has("name"));
  await expect(page.locator(".stats-table-row")).toHaveCount(2);
});

test("touch can pick a table suggestion and Escape preserves the draft", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await openWorkbench(page, "/stats");
  const input = page.getByRole("combobox", { name: "Filter players by name" });
  await expect(input).toBeVisible();
  await input.fill("Guard");
  const option = page.getByRole("option", { name: /Fixture Guard/ });
  await expect(option).toBeVisible();
  await input.press("Escape");
  await expect(option).toBeHidden();
  await expect(input).toHaveValue("Guard");
  expect(new URL(page.url()).searchParams.has("name")).toBe(false);
  await input.press("ArrowDown");
  await expect(option).toBeVisible();
  await option.tap();
  await page.waitForURL(url => url.searchParams.get("name") === "Fixture Guard");
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(375);
});
