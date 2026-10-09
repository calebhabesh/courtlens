// FO06 evidence: header search placement, phone mode rows and the v1.1 /design additions.
// Usage: node scripts/capture_fo06_evidence.cjs [baseUrl]
const path = require("path");
const fs = require("fs");
const { chromium } = require(path.join(__dirname, "../dashboard/node_modules/playwright"));

const base = process.argv[2] || "http://localhost:3100";
const outDir = path.join(__dirname, "../docs/evidence/fo06");
fs.mkdirSync(path.join(outDir, "screens"), { recursive: true });

(async () => {
  const browser = await chromium.launch();
  const results = { base, measuredAt: new Date().toISOString(), searchPill: {}, modeRows: {} };

  for (const width of [1024, 1280, 1440, 1740, 1920, 2000]) {
    const page = await browser.newPage({ viewport: { width, height: 900 } });
    await page.goto(`${base}/stats`, { waitUntil: "networkidle" });
    results.searchPill[width] = await page.evaluate(() => {
      const pill = document.querySelector(".courtlens-search-pill").getBoundingClientRect();
      const nav = document.querySelector(".courtlens-nav")?.getBoundingClientRect();
      const actions = document.querySelector(".courtlens-header-right").getBoundingClientRect();
      const center = pill.left + pill.width / 2;
      return {
        pillWidth: Math.round(pill.width),
        offsetFromPageCenter: Math.round(center - innerWidth / 2),
        gapAfterNav: nav && nav.width > 0 ? Math.round(pill.left - nav.right) : null,
        gapBeforeActions: Math.round(actions.left - pill.right)
      };
    });
    if (width === 1440 || width === 1920) await page.screenshot({ path: path.join(outDir, "screens", `header-${width}.png`), clip: { x: 0, y: 0, width, height: 64 } });
    await page.close();
  }

  for (const width of [390, 360]) {
    for (const route of ["/showcase", "/roster-shapes?team=1610612738"]) {
      const page = await browser.newPage({ viewport: { width, height: 844 } });
      await page.goto(`${base}${route}`, { waitUntil: "networkidle" });
      await page.locator(".ui-filter-bar-modes").waitFor();
      results.modeRows[`${route}@${width}`] = await page.evaluate(() => {
        const control = document.querySelector(".ui-filter-bar-modes .ui-segmented-control");
        const items = [...control.querySelectorAll(".ui-segmented-item")];
        return {
          visibleOutsideSheet: getComputedStyle(document.querySelector(".ui-filter-bar-modes")).display !== "none",
          labels: items.map((item) => item.textContent),
          itemHeights: items.map((item) => Math.round(item.getBoundingClientRect().height)),
          overflowPx: control.scrollWidth - control.clientWidth,
          pageSidewaysScroll: document.documentElement.scrollWidth > innerWidth
        };
      });
      if (width === 390) await page.screenshot({ path: path.join(outDir, "screens", `${route.slice(1).split("?")[0]}-modes-390.png`) });
      await page.close();
    }
  }

  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.goto(`${base}/design`, { waitUntil: "networkidle" });
  const grid = page.locator(".team-grid");
  await grid.scrollIntoViewIfNeeded();
  results.designTeamTiles = await grid.locator(".team-grid-tile").count();
  results.designModesSlot = await page.locator(".ui-design-foundation .ui-filter-bar-modes").count();
  await page.screenshot({ path: path.join(outDir, "screens", "design-logo-grid-1440.png") });
  await browser.close();

  fs.writeFileSync(path.join(outDir, "measurements.json"), JSON.stringify(results, null, 2) + "\n");
  console.log(JSON.stringify(results, null, 2));
})();
