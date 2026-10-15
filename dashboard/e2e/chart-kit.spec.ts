import { expect, test, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import { openWorkbench } from "./workbench-navigation";

const errorsByPage = new WeakMap<Page, string[]>();
for (const width of [1440, 390, 375]) test.describe(`PC03 chart kit ${width}px`, () => {
  test.beforeEach(async ({ page }) => {
    const errors: string[] = [];
    errorsByPage.set(page, errors);
    page.on("pageerror", e => errors.push(e.message));
    await page.setViewportSize({ width, height: width === 1440 ? 900 : 844 });
    await openWorkbench(page, "/design");
    await expect(page.locator("#chart-kit .chart-frame")).toHaveCount(10);
  });
  test.afterEach(async ({ page }) => expect(errorsByPage.get(page)).toEqual([]));
  test("first load, data changes, state actions and phone forms", async ({ page }) => {
    const kit = page.locator("#chart-kit");
    expect(new URL(page.url()).search).toBe("");
    await expect(kit).toContainText("Geometry examples; no NBA estimates");
    await expect(kit.getByText("Subject B: 0.8 fewer", { exact: true })).toHaveCount(1);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBe(0);
    await kit.getByRole("button", { name: "Change values" }).click();
    await expect(kit.getByRole("img", { name: /signed observed value: 3/ })).toBeVisible();
    await kit.getByRole("button", { name: "Show small sample" }).click();
    await expect(kit.getByText("Small sample", { exact: true })).toHaveCount(5);
    if (width < 768) {
      await expect(kit.locator(".chart-flow-desktop")).toBeHidden();
      await expect(kit.locator(".chart-flow-phone")).toBeVisible();
      const scroll = kit.getByRole("region", { name: /Contract status palette by period/ });
      await scroll.scrollIntoViewIfNeeded();
      const before = await scroll.locator("tbody th").first().boundingBox();
      await scroll.evaluate(el => el.scrollLeft = 250);
      const after = await scroll.locator("tbody th").first().boundingBox();
      expect(Math.abs(before!.x - after!.x)).toBeLessThanOrEqual(1);
    }
    const readyHeights = await kit.locator(".chart-content").evaluateAll(es => es.map(e => e.getBoundingClientRect().height));
    await kit.getByRole("radio", { name: "Loading", exact: true }).click();
    await expect(kit.locator('[data-skeleton="true"]')).toHaveCount(10);
    await expect(kit.locator(".chart-meta")).toHaveCount(10);
    await expect(kit.locator(".chart-loading-layout").first()).toBeHidden();
    await expect(kit.locator(".chart-loading-layout")).toHaveCount(10);
    const loadingHeights = await kit.locator(".chart-content").evaluateAll(es => es.map(e => e.getBoundingClientRect().height));
    loadingHeights.forEach((height, i) => expect(Math.abs(height - readyHeights[i])).toBeLessThanOrEqual(1));
    await kit.getByRole("radio", { name: "Error", exact: true }).click();
    await expect(kit.getByRole("alert")).toHaveCount(10);
    await kit.getByRole("button", { name: "Show example" }).first().click();
    await expect(kit.locator('[data-state="ready"]')).toHaveCount(10);
    await kit.getByRole("radio", { name: "Empty", exact: true }).click();
    await expect(kit.getByText("No observed values.", { exact: false })).toHaveCount(10);
  });
  test("reduced motion collapses every chart fade and semantic transition", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    const durations = await page.locator("#chart-kit .chart-data, #chart-kit .chart-graphic, #chart-kit .chart-delta, #chart-kit .chart-percentile-cell").evaluateAll(elements => elements.map(el => {
      const s = getComputedStyle(el);
      return { animation: s.animationDuration, transition: s.transitionDuration };
    }));
    for (const duration of durations) {
      for (const seconds of duration.animation.split(",")) expect(Number.parseFloat(seconds)).toBeLessThanOrEqual(0.001);
      for (const seconds of duration.transition.split(",")) expect(Number.parseFloat(seconds)).toBeLessThanOrEqual(0.001);
    }
  });
});

test("PC03 prerendered SVG titles contain a single descriptive string", async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  const page = await context.newPage();
  await page.goto("/design");
  const titles = await page.locator("#chart-kit svg title").allTextContents();
  expect(titles.length).toBeGreaterThan(10);
  expect(titles.every(title => title.trim().length > 0)).toBe(true);
  await context.close();
});

test("PC03 Compare exports retain resolved token colors in SVG and PNG", async ({ page }) => {
  await openWorkbench(page, "/compare?playerA=23&playerB=24&releaseId=fixture-release&season=2025-26&beforeDate=2026-04-13");
  // The duel card exports itself (alignment row 3): SVG from the More menu, PNG from Share Image.
  await page.getByRole("button", { name: "More", exact: true }).click();
  const pendingSvg = page.waitForEvent("download");
  await page.getByRole("menuitem", { name: "Export SVG" }).click();
  const svg = readFileSync((await (await pendingSvg).path())!, "utf8");
  expect(svg).not.toContain("var(--");
  // Fixture Star leads points, so the gold identity pill and wordmark resolve; Guard leads nothing.
  expect(svg).toContain("#ffd166"); expect(svg).toContain('fill="#15171b"');
  const pendingPng = page.waitForEvent("download");
  await page.getByRole("button", { name: "Share Image", exact: true }).click();
  const png = readFileSync((await (await pendingPng).path())!);
  expect(png.subarray(1, 4).toString()).toBe("PNG");
});
