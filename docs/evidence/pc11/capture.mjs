// PC11 first-load capture: real API through the owner's dev server, no URL parameters on entry.
// node docs/evidence/pc11/capture.mjs docs/evidence/pc11   (BASE defaults to http://localhost:3100)
import { createRequire } from "node:module";
import { mkdirSync, writeFileSync } from "node:fs";
const require = createRequire(new URL("../../../dashboard/package.json", import.meta.url).pathname);
const { chromium } = require("@playwright/test");
const BASE = process.env.BASE ?? "http://localhost:3100";
const OUT = process.argv[2];
mkdirSync(`${OUT}/screenshots`, { recursive: true });
const ROUTES = ["/research/defensive-matchups", "/matchups", "/research/shooting/adjusted", "/research/rapm/six-factor",
  "/wingspan", "/wowy", "/stats/tracking", "/players/203999?tab=tracking", "/players/203999?tab=measurements"];
const VIEWPORTS = { desktop: { width: 1440, height: 900 }, phone: { width: 390, height: 844 } };
const slug = r => r.slice(1).replace(/[/?=&]/g, "_");
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM ?? "/usr/bin/chromium" });
const results = [];
for (const route of ROUTES) for (const [vp, size] of Object.entries(VIEWPORTS)) {
  const page = await browser.newPage({ viewport: size });
  const errors = [], failed = [];
  page.on("pageerror", e => errors.push(String(e).slice(0, 200)));
  page.on("console", m => m.type() === "error" && errors.push(m.text().slice(0, 200)));
  page.on("response", r => { if (r.status() >= 400 && !r.url().includes("_next")) failed.push(`${r.status()} ${new URL(r.url()).pathname}`); });
  const started = Date.now();
  await page.goto(BASE + route, { waitUntil: "networkidle", timeout: 90000 });
  await page.waitForSelector(".chart-frame, .feed-group, [role=alert]", { timeout: 60000 }).catch(() => {});
  const readyMs = Date.now() - started;
  await page.waitForTimeout(1500);
  const m = await page.evaluate(() => {
    const main = document.querySelector("main") ?? document.body;
    const vis = el => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== "hidden"; };
    const top = el => Math.round(el.getBoundingClientRect().top + scrollY);
    const visuals = [...main.querySelectorAll(".chart-frame, .ui-stat-tile, table, .feed-group")].filter(vis);
    const charts = [...main.querySelectorAll(".chart-frame")].filter(vis);
    const text = main.innerText;
    const targets = [...main.querySelectorAll("button, a, select, input, [role=radio], [role=tab]")].filter(vis)
      .filter(el => !el.closest("table, .chart-ranked, p, dd, dl, figcaption, .ui-why")).map(el => el.getBoundingClientRect().height).filter(h => h < 40);
    return {
      h1: document.querySelector("h1")?.textContent ?? null,
      first_visual_top: visuals.length ? Math.min(...visuals.map(top)) : null,
      first_chart_top: charts.length ? Math.min(...charts.map(top)) : null,
      charts: charts.length, tiles: main.querySelectorAll(".ui-stat-tile").length,
      tables: main.querySelectorAll("table").length, shaded_cells: main.querySelectorAll(".chart-percentile-cell").length,
      gate_notes: main.querySelectorAll(".ui-gated-note").length, example_rule: main.querySelector(".feed-example")?.textContent ?? null,
      overflow_px: document.documentElement.scrollWidth - innerWidth,
      small_targets_outside_tables: targets.length,
      iso_dates_in_main: (text.match(/\b20\d\d-\d\d-\d\d\b/g) ?? []).length,
      hex64_in_main: (text.match(/\b[0-9a-f]{64}\b/g) ?? []).length,
      url: location.pathname + location.search,
    };
  });
  await page.screenshot({ path: `${OUT}/screenshots/${slug(route)}-${vp}.png`, fullPage: false });
  results.push({ route, viewport: vp, ready_ms: readyMs, errors, failed_requests: failed, ...m });
  console.log(vp.padEnd(7), route.padEnd(36), JSON.stringify({ ready_ms: readyMs, ...m, errors: errors.length, failed: failed.length }));
  await page.close();
}
await browser.close();
writeFileSync(`${OUT}/measurements.json`, JSON.stringify({ captured_at: new Date().toISOString(), base: BASE, results }, null, 2) + "\n");
