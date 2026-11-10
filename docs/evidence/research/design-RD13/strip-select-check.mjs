// RD13 round 2: on :3100 (read only), pressing a strip stat name must not move the page; the curve button must bring the curve under the header. Usage: node strip-select-check.mjs [<shots dir>]
import { chromium } from "/home/ethioking/dev/courtlens/dashboard/node_modules/playwright/index.mjs";
const b = await chromium.launch();
for (const w of [1440, 390]) {
  const p = await b.newPage({ viewport: { width: w, height: 900 }, deviceScaleFactor: 2 });
  const errs = []; p.on("pageerror", e => errs.push(String(e))); p.on("console", m => m.type() === "error" && errs.push(m.text()));
  await p.goto("http://localhost:3100/research/signal-noise", { waitUntil: "load", timeout: 120000 });
  const row = p.locator('.sn-strip-row[data-stat="fg_pct"]'); await row.scrollIntoViewIfNeeded(); await p.waitForTimeout(800);
  const y0 = await p.evaluate(() => scrollY);
  await row.locator("button").click(); await p.waitForTimeout(800);
  const y1 = await p.evaluate(() => scrollY), stat = await p.locator('[data-chart="curve"]').getAttribute("data-stat");
  await p.locator('.sn-figure[data-chart="strip"]').screenshot({ path: `${process.argv[2] ?? "."}/sn-strip-select-${w}.png` });
  await p.locator('[data-field="curve-jump"]').click(); await p.waitForTimeout(1200);
  const top = await p.evaluate(() => Math.round(document.getElementById("curve").getBoundingClientRect().top));
  const ov = await p.evaluate(() => document.documentElement.scrollWidth - innerWidth);
  console.log(w, { y0, y1, stat, curveTopAfterJump: top, ov, errs });
}
await b.close();
