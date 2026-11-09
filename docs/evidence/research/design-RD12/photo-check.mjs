// RD12 round 2: no player photo on the Six-Factor RAPM tabs is clipped by a box. For every portrait at 1440 and 390, on real data through the read-only proxy, finds any
// ancestor that clips (overflow hidden, clip, auto or scroll) and cuts the photo's 2 px ring. Usage: node photo-check.mjs <report.json> [<shots dir>]
import { chromium } from "/home/ethioking/dev/courtlens/dashboard/node_modules/playwright/index.mjs";
import { writeFileSync } from "node:fs";
const [,, out, shots] = process.argv;
const PAGES = [["ratings", "http://localhost:3180/research/rapm"], ["six-factor", "http://localhost:3180/research/rapm/six-factor"]];
const report = [];
const browser = await chromium.launch();
for (const width of [1440, 390]) for (const [name, url] of PAGES) {
  const page = await browser.newPage({ viewport: { width, height: width > 600 ? 900 : 844 }, deviceScaleFactor: 2 });
  const errors = []; page.on("pageerror", e => errors.push(String(e)));
  await page.goto(url, { waitUntil: "load", timeout: 120000 });
  await page.waitForSelector(".ui-identity-media .player-portrait", { state: "attached", timeout: 60000 });
  await page.waitForTimeout(1500);
  const measure = () => page.evaluate(() => {
    const ring = 2;
    const photos = [...document.querySelectorAll(".ui-identity-media :is(.player-portrait, .player-portrait-fallback)")].filter(p => p.getBoundingClientRect().width > 0);
    const clipped = [];
    for (const photo of photos) {
      const r = photo.getBoundingClientRect();
      for (let e = photo.parentElement; e && e !== document.body; e = e.parentElement) {
        const c = getComputedStyle(e);
        if (![c.overflowX, c.overflowY].some(v => v !== "visible")) continue;
        // Inside a frame that really scrolls, a photo cut at the edge has simply scrolled past it; only a box with nothing to scroll is a fault.
        if (e.scrollHeight > e.clientHeight + 1 || e.scrollWidth > e.clientWidth + 1) break;
        const b = e.getBoundingClientRect();
        if (r.left - ring < b.left - 0.5 && r.right > b.left || r.top - ring < b.top - 0.5 && r.bottom > b.top || r.right + ring > b.right + 0.5 && r.left < b.right || r.bottom + ring > b.bottom + 0.5 && r.top < b.bottom) {
          clipped.push({ alt: photo.getAttribute("alt"), by: String(e.className).slice(0, 60) }); break;
        }
      }
    }
    return { photos: photos.length, circle: photos.filter(p => parseFloat(getComputedStyle(p).borderRadius) >= p.getBoundingClientRect().width / 2).length, clipped, overflow: document.documentElement.scrollWidth - innerWidth, leaders: document.querySelectorAll(".rapm-headline .rs-leaders-list li").length };
  });
  const result = await measure();
  if (result.leaders && shots) await page.locator(".rapm-headline").screenshot({ path: `${shots}/rapm-leaders-${width}.png` });
  // The control: put the old rule back and the check must find every leader cut, or it proves nothing.
  if (result.leaders) { await page.addStyleTag({ content: ".rapm-headline .rs-leaders-label { overflow: hidden; }" }); result.controlClipped = (await measure()).clipped.length; }
  report.push({ width, page: name, ...result, errors });
  console.log(JSON.stringify({ width, page: name, photos: result.photos, circle: result.circle, clipped: result.clipped.slice(0, 6), overflow: result.overflow, leaders: result.leaders, controlClipped: result.controlClipped, errors: errors.slice(0, 3) }));
  await page.close();
}
await browser.close();
if (out) writeFileSync(out, JSON.stringify(report, null, 1));
