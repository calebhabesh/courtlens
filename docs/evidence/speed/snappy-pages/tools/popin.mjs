// Stats: once the page has loaded and gone idle, how many table images are still not loaded? Then
// scroll the table box to the bottom and count images that had to load during the scroll.
// Run from dashboard/ (for its playwright).
import { chromium } from "playwright";
const browser = await chromium.launch({ executablePath: process.env.CHROME });
for (const port of [8441, 8442]) for (const path of ["/stats", "/draft", "/teams/1610612747"]) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, ignoreHTTPSErrors: true });
  const page = await ctx.newPage();
  await page.goto(`https://localhost:${port}${path}`, { waitUntil: "networkidle" });
  await page.waitForTimeout(1500);
  const r = await page.evaluate(async () => {
    const imgs = [...document.querySelectorAll("main img")].filter(i => i.checkVisibility());
    const notLoaded = imgs.filter(i => !i.complete || i.naturalWidth === 0).length;
    const box = document.querySelector(".stats-scroll-region");
    let poppedDuringScroll = 0;
    const seen = new Set(imgs.filter(i => i.complete && i.naturalWidth).map(i => i));
    for (let y = 0; y < (box ? box.scrollHeight : document.documentElement.scrollHeight); y += 400) {
      if (box) box.scrollTop = y; else window.scrollTo(0, y);
      await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
      for (const i of imgs) { const rect = i.getBoundingClientRect(); if (rect.bottom > 0 && rect.top < innerHeight && !seen.has(i)) { if (!i.complete || !i.naturalWidth) poppedDuringScroll++; seen.add(i); } }
    }
    return { visibleImgs: imgs.length, notLoadedAfterIdle: notLoaded, shownUnloadedWhileScrolling: poppedDuringScroll };
  });
  console.log(port === 8441 ? "before" : "after ", path.padEnd(20), JSON.stringify(r));
  await ctx.close();
}
await browser.close();
