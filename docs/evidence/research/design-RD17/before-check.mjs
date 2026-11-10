// RD17 before-read: Expected Shots, Adjusted Shooting (both sides), Shot Quality Model and zTS on the owner's :3100 at 1440 and 390 (GET only).
// Height, console errors, page overflow, broken images, native selects, old tables, and hashes or project codes in the visible text.
// Usage: node before-check.mjs <report.json> <shots dir>
import { chromium } from "/home/ethioking/dev/courtlens/dashboard/node_modules/playwright/index.mjs";
import { writeFileSync } from "node:fs";
const [,, out, shots] = process.argv;
const ROUTES = [["expected-shots", "/research/shooting"], ["adjusted-offense", "/research/shooting/adjusted"], ["adjusted-defense", "/research/shooting/adjusted?side=defensive"], ["sq-model", "/research/shot-quality?tab=model"], ["zts", "/research/zts"]];
const browser = await chromium.launch();
const report = [];
for (const [name, path] of ROUTES) for (const width of [1440, 390]) {
  const page = await browser.newPage({ viewport: { width, height: width === 390 ? 844 : 900 } });
  const errors = [];
  const requests = [];
  page.on("console", m => { if (m.type() === "error") errors.push(m.text().slice(0, 200)); });
  page.on("pageerror", e => errors.push(String(e).slice(0, 200)));
  page.on("request", r => { if (r.url().includes("/api/")) requests.push(`${r.method()} ${r.url().replace(/^https?:\/\/[^/]+/, "")}`); });
  await page.goto(`http://localhost:3100${path}`, { waitUntil: "networkidle", timeout: 120000 });
  await page.waitForTimeout(2500);
  const facts = await page.evaluate(() => {
    const text = document.querySelector("main")?.innerText ?? document.body.innerText;
    const hashes = [...new Set(text.match(/\b[0-9a-f]{16,}\b/g) ?? [])];
    const codes = [...new Set(text.match(/\b(?:B2[0-9][a-z]?|B3[0-9][a-z]?|FO\d+|PC\d+|courtload[\w-]*|courtlens-[\w-]+|missed_[a-z_]+|made_[a-z_]+|first_chance[a-z_]*|[a-z]+_[a-z_]+)\b/g) ?? [])];
    return {
      height: document.documentElement.scrollHeight,
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      brokenImages: [...document.images].filter(i => i.complete && i.naturalWidth === 0).map(i => i.src),
      nativeSelects: document.querySelectorAll("main select").length,
      oldTables: document.querySelectorAll("main table.data-table").length,
      statsGrids: document.querySelectorAll("main .stats-table, main [data-stats-grid]").length,
      sections: [...document.querySelectorAll("main h1, main h2, main h3")].map(h => `${h.tagName} ${h.textContent.trim()}`),
      hashes, codes,
      oldBadges: document.querySelectorAll("main .badge").length,
      textSample: text.slice(0, 1500), detailsCount: document.querySelectorAll("main details").length, buttons: [...document.querySelectorAll("main button")].map(b => b.textContent.trim()).filter(Boolean).slice(0, 40),
    };
  });
  report.push({ route: path, width, consoleErrors: errors, apiRequests: [...new Set(requests)], ...facts });
  await page.screenshot({ path: `${shots}/rd17-before-${name}-top-${width}.png` });
  await page.screenshot({ path: `${shots}/rd17-before-${name}-full-${width}.png`, fullPage: true });
  await page.close();
}
await browser.close();
writeFileSync(out, JSON.stringify(report, null, 2));
console.log(JSON.stringify(report.map(r => ({ route: r.route, width: r.width, height: r.height, overflow: r.overflow, errors: r.consoleErrors, broken: r.brokenImages.length, selects: r.nativeSelects, tables: r.oldTables, grids: r.statsGrids, hashes: r.hashes, codes: r.codes, sections: r.sections, api: r.apiRequests })), null, 1));
