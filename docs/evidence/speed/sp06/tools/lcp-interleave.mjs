// SP06: LCP and CLS with the two builds served at once against one API, one load at a time,
// alternating build every load (ABAB...), fresh context each load.
// Usage: node lcp-interleave.mjs <out.json> <runs per build> <label=base>...
import { chromium } from "playwright";
import { writeFileSync } from "node:fs";
const [outFile, runsArg, ...pairs] = process.argv.slice(2);
const builds = pairs.map(p => p.split("="));
const paths = ["/players/2544", "/players/1449", "/teams/1610612747"];
const observe = () => {
  window.__sp06 = { lcp: [], shifts: [] };
  const d = n => n && n.nodeType === 1 ? { tag: n.tagName.toLowerCase(), cls: String(n.className || "").split(" ")[0], src: n.currentSrc || null } : null;
  new PerformanceObserver(l => { for (const e of l.getEntries()) window.__sp06.lcp.push({ time: Math.round(e.startTime), size: e.size, el: d(e.element) }); }).observe({ type: "largest-contentful-paint", buffered: true });
  new PerformanceObserver(l => { for (const e of l.getEntries()) window.__sp06.shifts.push({ time: Math.round(e.startTime), value: e.value, hadRecentInput: e.hadRecentInput, sources: (e.sources || []).map(s => d(s.node)) }); }).observe({ type: "layout-shift", buffered: true });
};
const browser = await chromium.launch();
const out = { tool: "lcp-interleave.mjs", builds, runs: Number(runsArg), taken_at: new Date().toISOString(), loads: [] };
// warm-up load per build and page (not recorded): fills the API cache and the server's code paths
for (const path of paths) for (const [, base] of builds) { const c = await browser.newContext(); const p = await c.newPage(); await p.goto(base + path, { waitUntil: "networkidle" }); await c.close(); }
for (let i = 0; i < Number(runsArg); i++) for (const path of paths) for (const [label, base] of (i % 2 ? [...builds].reverse() : builds)) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  await page.addInitScript(observe);
  await page.goto(base + path, { waitUntil: "networkidle", timeout: 120000 });
  await page.waitForTimeout(1000);
  const rec = await page.evaluate(() => window.__sp06);
  const nav = await page.evaluate(() => { const n = performance.getEntriesByType("navigation")[0]; return { ttfb: Math.round(n.responseStart), dcl: Math.round(n.domContentLoadedEventEnd) }; });
  const hero = await page.evaluate(() => { const r = performance.getEntriesByType("resource").find(e => /portrait/.test(e.name) && /size=192|size=288/.test(e.name) && /players\/(2544|1449)\//.test(e.name)); return r ? { start: Math.round(r.startTime), end: Math.round(r.responseEnd) } : null; });
  const cls = rec.shifts.filter(s => !s.hadRecentInput).reduce((a, s) => a + s.value, 0);
  out.loads.push({ i, path, label, lcp: rec.lcp.at(-1), cls: Number(cls.toFixed(5)), shifts: rec.shifts, nav, hero_request: hero });
  console.error(i, label, path, "LCP", rec.lcp.at(-1)?.time, rec.lcp.at(-1)?.el?.cls, "ttfb", nav.ttfb, "hero req", hero?.start, "-", hero?.end, "CLS", cls.toFixed(4));
  await context.close();
}
await browser.close();
writeFileSync(outFile, JSON.stringify(out, null, 1));
