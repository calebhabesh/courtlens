import { expect, test } from "@playwright/test";
import { openWorkbench } from "./workbench-navigation";

test("skip link moves focus into the page before its controls", async ({ page }) => {
  await openWorkbench(page, "/stats");
  await page.keyboard.press("Tab");
  await expect(page.getByRole("link", { name: "Skip to content" })).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("main")).toBeFocused();
  await page.keyboard.press("Tab");
  expect(await page.evaluate(() => document.querySelector("main")?.contains(document.activeElement))).toBe(true);
});

for (const width of [1440, 390]) {
  // Databallr alignment (Stats instructions 2 and 4): values, percentile numbers and headers are centred.
  test(`Stats values, percentiles and sort headers centre at ${width}`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await openWorkbench(page, "/stats");
    await expect(page.locator("td.stats-metric-cell.num").first()).toBeVisible();
    const alignment = await page.locator("td.stats-metric-cell.num,.stats-header-tier-2 .num").evaluateAll(cells => cells.map(cell => {
      const s = getComputedStyle(cell);
      const content = cell.querySelector(".chart-percentile-text");
      return { center: s.textAlign === "center", tabular: s.fontVariantNumeric.includes("tabular-nums"), contentCenter: !content || getComputedStyle(content).justifyItems === "center" };
    }));
    expect(alignment.length).toBeGreaterThan(5);
    expect(alignment.every(cell => cell.center && cell.tabular && cell.contentCenter)).toBe(true);
  });
}

for (const route of ["/stats", "/planner", "/live", "/research/ask?experience=manual"]) {
  test(`retained controls meet the phone target on ${route}`, async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await openWorkbench(page, route);
    await page.waitForLoadState("networkidle");
    const short = await page.locator("main button,main summary,main .ui-button,main a:not(p a):not(li a)").evaluateAll(elements => elements.filter(e => e.checkVisibility()).filter(e => {
      const r = e.getBoundingClientRect();
      return r.width > 0 && (r.height < 39.5 || r.width < 39.5);
    }).map(e => e.getAttribute("aria-label") || e.textContent));
    expect(short).toEqual([]);
    if (route === "/stats") {
      const presets = page.getByRole("radiogroup", { name: "Stats Explorer Presets" }).getByRole("radio");
      expect(await presets.count()).toBeGreaterThan(0);
      expect(await presets.evaluateAll(tabs => tabs.filter(tab => tab.scrollWidth > tab.clientWidth + 1).map(tab => tab.textContent))).toEqual([]);
    }
    await expect(page.getByRole("main")).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  });
}

test("Article loading contents match the horizontal phone pill strip", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ width: 390, height: 844 });
  await openWorkbench(page, "/design");
  await page.getByRole("radio", { name: "Article", exact: true }).click();
  const toc = page.locator(".ui-skeleton-article-toc");
  await expect(toc).toBeVisible();
  const geometry = await toc.locator(".ui-skeleton").evaluateAll(elements => elements.map(e => {
    const r = e.getBoundingClientRect();
    return { top: r.top, height: r.height };
  }));
  expect(geometry).toHaveLength(5);
  expect(geometry.every(g => g.height === 40 && g.top === geometry[0].top)).toBe(true);
  expect(await toc.locator(".ui-skeleton").first().evaluate(e => {
    const s = getComputedStyle(e);
    return { fill: s.backgroundColor, animation: s.animationName, image: s.backgroundImage };
  })).toEqual({ fill: "rgb(28, 31, 36)", animation: "none", image: "none" });
  await expect(page.getByRole("status", { name: "Loading", exact: true })).toHaveAttribute("aria-busy", "true");
});

test("phone table links meet the target without stretching Stats rows", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  for (const route of ["/stats", "/teams", "/players/23", "/investigations"]) {
    await openWorkbench(page, route);
    const links = page.locator(".data-table a");
    const short = await links.evaluateAll(elements => elements.filter(e => e.checkVisibility()).filter(e => e.getBoundingClientRect().height < 39.5).map(e => e.textContent));
    expect(short).toEqual([]);
    if (route === "/stats") expect(await page.locator(".stats-table-row").first().evaluate(e => e.getBoundingClientRect().height)).toBe(42);
  }
});

test("404 uses the shared header and a keyboard reachable return action", async ({ page }) => {
  await page.goto("/fo14-missing-page");
  await expect(page.getByRole("heading", { level: 1, name: "Page Not Found" })).toBeVisible();
  await page.getByRole("link", { name: "Return home" }).focus();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(url => url.pathname === "/stats");
});

test("200% desktop reflow keeps the filter sheet usable by keyboard", async ({ page }) => {
  await page.setViewportSize({ width: 720, height: 450 });
  await openWorkbench(page, "/stats");
  const trigger = page.locator(".filter-bar-toggle-slot > button");
  await trigger.focus();
  await page.keyboard.press("Enter");
  const sheet = page.getByRole("dialog", { name: "Filters", exact: true });
  await expect(sheet).toBeVisible();
  for (let i = 0; i < 8; i++) {
    await page.keyboard.press("Tab");
    expect(await sheet.evaluate(e => e.contains(document.activeElement))).toBe(true);
  }
  await page.keyboard.press("Escape");
  await expect(sheet).toHaveCount(0);
  await expect(trigger).toBeFocused();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(720);
});

test("reduced-motion status hydrates without replacing the style guide", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ width: 390, height: 844 });
  await openWorkbench(page, "/design");
  await expect(page.locator(".ui-motion-status-reduced")).toBeVisible();
  await expect(page.locator(".ui-motion-status-normal")).toBeHidden();
  expect(errors).toEqual([]);
});

test("phone segmented controls keep every label inside its target", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openWorkbench(page, "/design");
  const clipped = await page.locator(".ui-segmented-item").evaluateAll(items => items.filter(item => item.scrollWidth > item.clientWidth + 1).map(item => item.textContent));
  expect(clipped).toEqual([]);
});

test("switch keeps its compact track inside a full phone target", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openWorkbench(page, "/settings");
  const toggle = page.getByRole("switch", { name: /Advanced mode/ });
  const sizes = await toggle.evaluate(e => ({ target: e.getBoundingClientRect().height, track: getComputedStyle(e, "::before").height }));
  expect(sizes).toEqual({ target: 40, track: "20px" });
  await toggle.focus();
  await page.keyboard.press("Space");
  await expect(toggle).toHaveAttribute("aria-checked", "true");
});

test("tab panels and the Ask composer show their keyboard focus", async ({ page }) => {
  await openWorkbench(page, "/players/23");
  const panel = page.getByRole("tabpanel").first();
  await panel.focus();
  expect(await panel.evaluate(e => getComputedStyle(e).boxShadow)).not.toBe("none");
  await openWorkbench(page, "/research/ask");
  await page.locator(".ask-composer textarea").focus();
  expect(await page.locator(".ask-composer").evaluate(e => getComputedStyle(e).boxShadow)).not.toBe("none");
});

test("clustered distribution values keep distinct readable labels on phones", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.route("**/api/workbench/operations/distribution", route => route.fulfill({ json: {
    operation_version: "fixture-v1", evidence_hash: "c".repeat(64), player_id: "1630567", player_name: "Scottie Barnes",
    metric: "pts", metric_display_name: "Points", window_n: 20, season: "2025-26", phase: "regular_season", before_date: "2026-04-13",
    summary: { summary_available: true, n: 20, mean: 20, median: 20, min: 0, max: 100, population_sd: 2, p10: 19.9, p25: 20, p75: 20, p90: 20.1, iqr: 0 },
    samples: [], disclosures: []
  } }));
  await openWorkbench(page, "/research/distributions?playerId=1630567&season=2025-26&phase=regular_season&beforeDate=2026-04-13");
  const labels = page.locator(".dist-strip-label");
  await expect(labels).toHaveText(["p10: 19.9", "Median: 20", "p90: 20.1"]);
  const boxes = await labels.evaluateAll(elements => elements.map(e => {
    const r = e.getBoundingClientRect();
    return { left: r.left, right: r.right, top: r.top, bottom: r.bottom };
  }));
  for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
    const a = boxes[i], b = boxes[j];
    expect(a.right <= b.left || b.right <= a.left || a.bottom <= b.top || b.bottom <= a.top).toBe(true);
  }
});

test("floating player lookup keeps viewport geometry in CSS variables", async ({ page }) => {
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 844 });
    await openWorkbench(page, "/showcase");
    const input = page.getByRole("combobox", { name: "Find player" });
    await input.focus();
    const dropdown = page.locator(".lookup-floating-dropdown");
    await expect(dropdown).toBeVisible();
    const geometry = await dropdown.evaluate(e => {
      const r = e.getBoundingClientRect();
      return { fixed: getComputedStyle(e).position, left: r.left, right: r.right, top: r.top,
        rawProperties: [...(e as HTMLElement).style].filter(key => !key.startsWith("--")) };
    });
    expect(geometry.fixed).toBe("fixed");
    expect(geometry.left).toBeGreaterThanOrEqual(8);
    expect(geometry.right).toBeLessThanOrEqual(width - 8);
    expect(geometry.rawProperties).toEqual([]);
    await page.keyboard.press("Escape");
    await expect(dropdown).toHaveCount(0);
  }
});

test("summary groups, percentile labels and portrait fallbacks have accessible semantics", async ({ page }) => {
  await openWorkbench(page, "/stats");
  // Percentile numbers carry their meaning in each cell's screen-reader text (no shading legend).
  await expect(page.locator(".stats-table-row").first().locator(".chart-percentile-text .sr-only").first()).toContainText(/percentile|not ranked|unknown/);
  await openWorkbench(page, "/players/23");
  await expect(page.getByRole("group", { name: "Season summary", exact: true })).toBeVisible();
  await openWorkbench(page, "/design");
  await expect(page.getByRole("img", { name: "Missing Photo portrait placeholder" })).toBeVisible();
  await expect(page.getByText("Defensive rating unavailable", { exact: true })).toBeAttached();
});
