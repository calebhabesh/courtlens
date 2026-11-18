// Run from dashboard/ (for its playwright).
import { chromium } from "playwright";
const browser = await chromium.launch({ executablePath: process.env.CHROME });
for (const route of (process.env.ROUTES || "/players,/draft").split(",")) for (const port of [8441, 8442]) {
  const rows = [];
  for (let run = 0; run < 3; run++) {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, ignoreHTTPSErrors: true });
    const page = await ctx.newPage();
    await page.addInitScript(() => { window.__busyGone = null; const t = () => { if (document.readyState !== "loading" && document.querySelector("main h1") && !document.querySelector('[role="status"][aria-busy="true"]')) { window.__busyGone = performance.now(); return; } requestAnimationFrame(t); }; requestAnimationFrame(t); });
    await page.goto(`https://localhost:${port}${route}`, { waitUntil: "networkidle" });
    rows.push(await page.evaluate(() => {
      const n = performance.getEntriesByType("navigation")[0]; const fcp = performance.getEntriesByName("first-contentful-paint")[0]?.startTime;
      const api = performance.getEntriesByType("resource").filter(e => /\/api\//.test(e.name) && !/portrait|logo/.test(e.name) && e.initiatorType === "fetch");
      const js = performance.getEntriesByType("resource").filter(e => e.initiatorType === "script");
      const r = x => Math.round(x);
      return { ttfb: r(n.responseStart), htmlEnd: r(n.responseEnd), jsStart: r(Math.min(...js.map(e => e.startTime))), jsEnd: r(Math.max(...js.map(e => e.responseEnd))), fcp: r(fcp), dcl: r(n.domContentLoadedEventEnd), apiFirst: api.length ? r(Math.min(...api.map(e => e.startTime))) : null, apiLast: api.length ? r(Math.max(...api.map(e => e.responseEnd))) : null, nApi: api.length, settled: r(window.__busyGone) };
    }));
    await ctx.close();
  }
  const med = k => rows.map(x => x[k]).sort((a, b) => a - b)[1];
  console.log(route, port, JSON.stringify(Object.fromEntries(Object.keys(rows[0]).map(k => [k, med(k)]))));
}
await browser.close();
