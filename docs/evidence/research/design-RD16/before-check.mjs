// RD16 before-read: the current /forecasts and /evaluation on the owner's :3100 at 1440 and 390 (GET only).
// Height, console errors, page overflow, broken images, native selects, old tables, and hashes or project codes in the visible text.
// Usage: node before-check.mjs <report.json> <shots dir>
import { chromium } from "/home/ethioking/dev/courtlens/dashboard/node_modules/playwright/index.mjs";
import { writeFileSync } from "node:fs";
const [,, out, shots] = process.argv;
const ROUTES = [["forecasts", "/forecasts"], ["evaluation", "/evaluation"]];
const browser = await chromium.launch();
const report = [];
for (const [name, path] of ROUTES) for (const width of [1440, 390]) {
  const page = await browser.newPage({ viewport: { width, height: width === 390 ? 844 : 900 } });
  const errors = [];
  page.on("console", m => { if (m.type() === "error") errors.push(m.text().slice(0, 200)); });
  page.on("pageerror", e => errors.push(String(e).slice(0, 200)));
  await page.goto(`http://localhost:3100${path}`, { waitUntil: "networkidle", timeout: 120000 });
  await page.waitForTimeout(1500);
  const facts = await page.evaluate(() => {
    const text = document.querySelector("main")?.innerText ?? document.body.innerText;
    const hashes = [...new Set(text.match(/\b[0-9a-f]{16,}\b/g) ?? [])];
    const codes = [...new Set(text.match(/\b(?:basketball-points-v1|points-v1[-\w]*|prior_blend|player_only|player_plus_context|ewma_20_hl5|M6|S3|Block F|courtload[\w-]*|courtlens [a-z-]+)\b/g) ?? [])];
    return {
      height: document.documentElement.scrollHeight,
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      brokenImages: [...document.images].filter(i => i.complete && i.naturalWidth === 0).map(i => i.src),
      nativeSelects: document.querySelectorAll("main select").length,
      oldTables: document.querySelectorAll("main table.data-table").length,
      statsGrids: document.querySelectorAll("main .stats-table, main [data-stats-grid]").length,
      sections: [...document.querySelectorAll("main h2")].map(h => h.textContent.trim()),
      hashes, codes,
      oldBadges: document.querySelectorAll("main .badge").length,
    };
  });
  report.push({ route: path, width, consoleErrors: errors, ...facts });
  await page.screenshot({ path: `${shots}/fc-before-${name}-top-${width}.png` });
  await page.screenshot({ path: `${shots}/fc-before-${name}-full-${width}.png`, fullPage: true });
  await page.close();
}
await browser.close();
writeFileSync(out, JSON.stringify(report, null, 2));
console.log(JSON.stringify(report.map(r => ({ route: r.route, width: r.width, height: r.height, overflow: r.overflow, errors: r.consoleErrors.length, broken: r.brokenImages.length, selects: r.nativeSelects, tables: r.oldTables, hashes: r.hashes.length, codes: r.codes })), null, 1));
