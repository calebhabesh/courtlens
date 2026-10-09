// FO01 evidence: shared-foundation primitives on /design and on pages that adopted them.
// Usage: node scripts/capture_fo01_evidence.cjs [baseURL]   (default http://localhost:3100;
// use localhost, not 127.0.0.1, which the API CORS allowlist rejects).
const path = require("path");
const fs = require("fs");
const { chromium } = require(path.join(__dirname, "../dashboard/node_modules/@playwright/test"));

const BASE = process.argv[2] || "http://localhost:3100";
const OUT = path.join(__dirname, "../docs/evidence/fo01");
const DESKTOP = { width: 1440, height: 900 };
const PHONE = { width: 390, height: 844 };

// [file, viewport, route, steps]. Steps: {element}, {click}, {wait}, {scrollTo}; the last
// {element} step makes the capture an element screenshot instead of the viewport.
const SHOTS = [
  ["design-foundation--desktop.png", DESKTOP, "/design", [{ element: ".ui-design-foundation" }]],
  ["design-foundation--phone.png", PHONE, "/design", [{ element: ".ui-design-foundation" }]],
  ["design-datepicker-open--desktop.png", DESKTOP, "/design", [{ scrollTo: ".ui-design-foundation" }, { click: ".ui-design-foundation .ui-filter-bar .ui-date-trigger" }]],
  ["design-why-open--desktop.png", DESKTOP, "/design", [{ click: ".ui-design-foundation .ui-why-summary" }, { element: ".ui-design-foundation-grid" }]],
  ["stats-filterbar--desktop.png", DESKTOP, "/stats", []],
  ["stats-filterbar--phone.png", PHONE, "/stats", []],
  ["stats-filter-sheet--phone.png", PHONE, "/stats", [{ click: ".ui-filter-bar-toggle" }]],
  ["stats-data-details--desktop.png", DESKTOP, "/stats", [{ click: ".ui-filter-bar-meta button" }]],
  ["teams-filterbar--desktop.png", DESKTOP, "/teams", []],
  ["roster-shapes-fields--desktop.png", DESKTOP, "/roster-shapes", []],
  ["roster-shapes-fields--phone.png", PHONE, "/roster-shapes", []],
  ["wowy-scope-fields--desktop.png", DESKTOP, "/wowy", []],
  ["settings-advanced-mode--desktop.png", DESKTOP, "/settings", [{ element: "section:has(#advanced-mode-toggle)" }]],
];

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({ executablePath: fs.existsSync("/usr/bin/chromium") ? "/usr/bin/chromium" : undefined });
  const report = { captured_at: new Date().toISOString(), base_url: BASE, shots: [], page_errors: {} };
  for (const [file, viewport, route, steps] of SHOTS) {
    const page = await browser.newPage({ viewport });
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(BASE + route, { timeout: 90000 });
    await page.waitForLoadState("networkidle", { timeout: 20000 }).catch(() => {});
    await page.waitForTimeout(1200);
    let element = null;
    for (const step of steps) {
      if (step.scrollTo) await page.locator(step.scrollTo).first().evaluate((node) => node.scrollIntoView({ block: "start" }));
      if (step.click) await page.locator(step.click).first().click();
      if (step.element) element = page.locator(step.element).first();
      await page.waitForTimeout(step.wait ?? 600);
    }
    if (element) {
      await element.scrollIntoViewIfNeeded();
      await element.screenshot({ path: path.join(OUT, file) });
    } else {
      await page.screenshot({ path: path.join(OUT, file) });
    }
    report.shots.push({ file, route, viewport });
    if (errors.length) report.page_errors[file] = errors;
    process.stdout.write(`${file}\n`);
    await page.close();
  }
  await browser.close();
  fs.writeFileSync(path.join(OUT, "captures.json"), JSON.stringify(report, null, 2) + "\n");
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
