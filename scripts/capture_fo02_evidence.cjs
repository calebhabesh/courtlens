// FO02 evidence: header, menus, search modal and drawer at desktop, tablet and phone widths.
// Usage: node scripts/capture_fo02_evidence.cjs [baseUrl]
const path = require("path");
const fs = require("fs");
const { chromium } = require(path.join(__dirname, "../dashboard/node_modules/playwright"));

const base = process.argv[2] || "http://localhost:3100";
const outDir = path.join(__dirname, "../docs/evidence/fo02/screens");
fs.mkdirSync(outDir, { recursive: true });
const captures = [];

async function shot(page, name) {
  await page.waitForTimeout(450);
  await page.screenshot({ path: path.join(outDir, `${name}.png`) });
  captures.push(name);
}

async function open(browser, width, route = "/stats") {
  const page = await browser.newPage({ viewport: { width, height: width === 390 ? 844 : 900 } });
  await page.goto(`${base}${route}`, { waitUntil: "networkidle" });
  return page;
}

async function search(page, text) {
  const pill = page.locator(".courtlens-search-pill");
  if (await pill.isVisible()) await pill.click(); else await page.locator(".courtlens-mobile-search-btn").click();
  const input = page.getByRole("combobox", { name: "Search players, teams and pages" });
  await input.fill(text);
  await page.waitForTimeout(700);
  return input;
}

(async () => {
  const browser = await chromium.launch();

  for (const width of [1440, 1280, 1024, 390]) {
    const page = await open(browser, width);
    await shot(page, `header-${width}`);
    await page.evaluate(() => scrollTo(0, 500));
    await shot(page, `header-${width}-scrolled`);
    await page.close();
  }

  const desk = await open(browser, 1440);
  await desk.locator('[data-dropdown-id="research"]').click();
  await shot(desk, "menu-research-1440");
  await desk.keyboard.press("Escape");
  await desk.getByRole("button", { name: "More options", exact: true }).click();
  await shot(desk, "menu-more-1440");
  await desk.keyboard.press("Escape");
  // Player and team queries, then pick one so the empty state shows Recent.
  await search(desk, "jokic");
  await shot(desk, "search-player-1440");
  await desk.keyboard.press("Enter");
  await desk.waitForLoadState("networkidle");
  await search(desk, "boston");
  await shot(desk, "search-team-1440");
  await desk.keyboard.press("Escape");
  await desk.keyboard.press("Control+k");
  await shot(desk, "search-empty-recent-1440");
  await desk.keyboard.press("Escape");
  await desk.close();

  for (const width of [1024, 390]) {
    const page = await open(browser, width);
    await page.getByRole("button", { name: "Toggle navigation drawer" }).click();
    await shot(page, `drawer-${width}`);
    await page.keyboard.press("Escape");
    await search(page, "jokic");
    await shot(page, `search-player-${width}`);
    await page.close();
  }

  await browser.close();
  fs.writeFileSync(path.join(outDir, "captures.json"), JSON.stringify({ base, capturedAt: new Date().toISOString(), captures }, null, 2));
  console.log(captures.length, "captures");
})();
