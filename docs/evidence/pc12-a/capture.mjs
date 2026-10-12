// First-load evidence from an isolated production build and the real local API.
// BASE=http://localhost:3411 node docs/evidence/pc12-a/capture.mjs
import { createRequire } from "node:module";
import { mkdirSync, writeFileSync } from "node:fs";
const require = createRequire(new URL("../../../dashboard/package.json", import.meta.url).pathname);
const { chromium } = require("@playwright/test");
const base = process.env.BASE ?? "http://localhost:3411";
const out = new URL(".", import.meta.url).pathname;
mkdirSync(`${out}/screenshots`, { recursive: true });
const browser = await chromium.launch({ executablePath: "/usr/bin/chromium" });
const results = [];
for (const route of ["/stats", "/players", "/teams", "/rankings"]) {
  for (const [viewport, size] of Object.entries({ desktop: { width: 1440, height: 900 }, phone: { width: 390, height: 844 } })) {
    const page = await browser.newPage({ viewport: size });
    const errors = [], failed = [];
    page.on("pageerror", error => errors.push(String(error)));
    page.on("console", message => { if (message.type() === "error") errors.push(message.text()); });
    page.on("response", response => { if (response.status() >= 400) failed.push(`${response.status()} ${new URL(response.url()).pathname}`); });
    const started = Date.now();
    await page.goto(base + route, { waitUntil: "networkidle", timeout: 90000 });
    await page.waitForFunction(() => document.fonts.status === "loaded");
    await page.waitForTimeout(500);
    const measured = await page.evaluate(() => {
      const main = document.querySelector("main");
      const visible = el => el.getBoundingClientRect().width > 0 && el.getBoundingClientRect().height > 0 && getComputedStyle(el).visibility !== "hidden";
      const first = selector => { const el = main.querySelector(selector); return el ? Math.round(el.getBoundingClientRect().top) : null; };
      const text = main.innerText;
      const cells = [...main.querySelectorAll(".chart-percentile-cell")];
      return {
        h1: main.querySelector("h1")?.textContent,
        url: location.pathname + location.search,
        first_table_top: first("table"), first_legend_top: first(".table-percentile-legend"),
        rows: main.querySelectorAll("tbody tr").length,
        shaded_cells: cells.filter(cell => cell.dataset.qualified === "true" && /var\(--color-percentile/.test(cell.getAttribute("style") ?? "")).length,
        small_sample_badges: main.querySelectorAll(".table-small-sample").length,
        column_groups: main.querySelectorAll("th[scope=colgroup]").length,
        overflow_px: document.documentElement.scrollWidth - innerWidth,
        iso_dates_in_main: (text.match(/\b20\d\d-\d\d-\d\d\b/g) ?? []).length,
        hex64_in_main: (text.match(/\b[0-9a-f]{64}\b/g) ?? []).length,
        small_targets: [...main.querySelectorAll("button,a,select,input")].filter(visible).filter(el => !el.closest("table,p,.ui-why,.stats-pagination-footer")).filter(el => el.getBoundingClientRect().height < 40).length,
        legend: main.querySelector(".table-percentile-legend")?.textContent,
        date_label: main.querySelector(".context-bar")?.textContent,
        first_load_empty_personal_board: /No Ranking Boards Yet/.test(text),
      };
    });
    await page.screenshot({ path: `${out}/screenshots/${route.slice(1)}-${viewport}.png`, fullPage: false });
    results.push({ route, viewport, ready_ms: Date.now() - started, errors, failed_requests: failed, ...measured });
    console.log(route, viewport, JSON.stringify({ ...measured, errors, failed }));
    await page.close();
  }
}
await browser.close();
writeFileSync(`${out}/measurements.json`, JSON.stringify({ captured_at: new Date().toISOString(), base, results }, null, 2) + "\n");
