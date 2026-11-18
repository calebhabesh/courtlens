// Per page: unique image URLs in the document, and bytes transferred once every lazy image has loaded.
// Run from dashboard/ (for its playwright).
import { chromium } from "playwright";
const BASE = process.env.BASE || "https://courtlens.calebhabesh.com";
const UA = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36";
const browser = await chromium.launch({ executablePath: process.env.CHROME });
const paths = (process.env.PATHS || "/stats,/players,/players/2544,/teams/1610612747,/draft,/showcase,/standings,/wowy,/free-agency,/contracts,/playoffs,/live,/matchups,/compare").split(",");
for (const p of paths) {
  const ctx = await browser.newContext({ userAgent: UA, viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  try {
    await page.goto(BASE + p, { waitUntil: "networkidle", timeout: 45000 });
    const lazyBefore = await page.evaluate(() => [...document.images].filter(i => i.loading === "lazy" && !i.complete).length);
    await page.evaluate(async () => { for (let y = 0; y < document.documentElement.scrollHeight; y += 700) { window.scrollTo(0, y); await new Promise(r => setTimeout(r, 120)); } });
    await page.waitForLoadState("networkidle").catch(() => {});
    const r = await page.evaluate(() => {
      const imgs = [...document.images]; const uniq = new Set(imgs.map(i => i.currentSrc || i.src).filter(Boolean));
      const res = performance.getEntriesByType("resource").filter(e => e.initiatorType === "img" || /\.(webp|png|svg|jpe?g)(\?|$)/.test(e.name));
      return { imgs: imgs.length, unique: uniq.size, lazy: imgs.filter(i => i.loading === "lazy").length, fetched: res.length, kb: Math.round(res.reduce((a, e) => a + (e.encodedBodySize || e.transferSize || 0), 0) / 1024), pageH: document.documentElement.scrollHeight };
    });
    console.log(p.padEnd(22), JSON.stringify({ ...r, lazyNotLoadedAtStart: lazyBefore }));
  } catch (e) { console.log(p, "ERR", String(e).slice(0, 80)); }
  await ctx.close();
}
await browser.close();
