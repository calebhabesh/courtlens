// RD17 before-read, part 2: tables that scroll sideways and player <select>s on the Adjusted views (:3100, GET only).
import { chromium } from "/home/ethioking/dev/courtlens/dashboard/node_modules/playwright/index.mjs";
const browser = await chromium.launch();
for (const path of ["/research/shooting/adjusted", "/research/shooting/adjusted?side=defensive"]) for (const width of [1440, 390]) {
  const page = await browser.newPage({ viewport: { width, height: 900 } });
  await page.goto(`http://localhost:3100${path}`, { waitUntil: "networkidle", timeout: 120000 });
  await page.waitForTimeout(1500);
  const r = await page.evaluate(() => ({
    sideways: [...document.querySelectorAll("main .table-wrapper")].map(w => `${w.getAttribute("aria-label")}: ${w.scrollWidth - w.clientWidth}px`),
    selects: [...document.querySelectorAll("main select")].map(s => `${s.getAttribute("aria-label") ?? s.closest("label")?.textContent?.trim().slice(0, 20)} (${s.options.length} options)`),
    logos: document.querySelectorAll("main table img").length,
    shaded: document.querySelectorAll("main [data-percentile], main .percentile-cell").length,
  }));
  console.log(path, width, JSON.stringify(r));
  await page.close();
}
await browser.close();
