// SP06: largest-contentful-paint and layout-shift per page load, from a PerformanceObserver
// registered before any page script (buffered), in a fresh Chromium context each run (cold
// browser cache). Usage: node lcp-cls.mjs <base> <label> <out.json> [runs=5] [paths...]
import { chromium } from "playwright";
import { writeFileSync } from "node:fs";

const [base, label, outFile, runsArg, ...rest] = process.argv.slice(2);
const runs = Number(runsArg ?? 5);
const paths = rest.length ? rest : ["/players/2544", "/players/1449", "/teams/1610612747"];

const observe = () => {
  const describe = (node) => {
    if (!node || node.nodeType !== 1) return node ? { node: node.nodeName } : null;
    const r = node.getBoundingClientRect();
    return { tag: node.tagName.toLowerCase(), cls: String(node.className || "").slice(0, 80),
      src: node.currentSrc || node.src || null, box: [Math.round(r.width), Math.round(r.height)],
      text: node.tagName === "IMG" ? null : (node.textContent || "").trim().slice(0, 60) };
  };
  window.__sp06 = { lcp: [], shifts: [] };
  new PerformanceObserver((list) => {
    for (const e of list.getEntries()) window.__sp06.lcp.push({ time: Math.round(e.startTime),
      render: Math.round(e.renderTime), load: Math.round(e.loadTime), size: e.size, url: e.url || null, el: describe(e.element) });
  }).observe({ type: "largest-contentful-paint", buffered: true });
  new PerformanceObserver((list) => {
    for (const e of list.getEntries()) window.__sp06.shifts.push({ time: Math.round(e.startTime), value: e.value,
      hadRecentInput: e.hadRecentInput, sources: (e.sources || []).map(s => ({ ...describe(s.node), from: [s.previousRect.x, s.previousRect.y, s.previousRect.width, s.previousRect.height].map(Math.round), to: [s.currentRect.x, s.currentRect.y, s.currentRect.width, s.currentRect.height].map(Math.round) })) });
  }).observe({ type: "layout-shift", buffered: true });
};

const browser = await chromium.launch();
const out = { tool: "lcp-cls.mjs (PerformanceObserver in Playwright Chromium)", label, base, runs, viewport: [1440, 900], taken_at: new Date().toISOString(), pages: [] };
for (const path of paths) {
  const page_runs = [];
  for (let i = 0; i < runs; i++) {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await context.newPage();
    await page.addInitScript(observe);
    const images = [];
    page.on("requestfinished", async (r) => { if (r.resourceType() === "image") images.push(r.url().replace(base, "").replace("http://localhost:8180", "API")); });
    await page.goto(base + path, { waitUntil: "networkidle", timeout: 120000 });
    await page.waitForTimeout(1500);
    // LCP stops at the first input; none is sent. Read the observers' records.
    const rec = await page.evaluate(() => window.__sp06);
    const priority = await page.evaluate(() => [...document.images].filter(img => img.fetchPriority === "high" || img.loading === "eager")
      .map(img => ({ src: (img.currentSrc || img.src).slice(-90), loading: img.loading, fetchPriority: img.fetchPriority })));
    const final = rec.lcp.at(-1) ?? null;
    const cls = rec.shifts.filter(s => !s.hadRecentInput).reduce((sum, s) => sum + s.value, 0);
    page_runs.push({ run: i + 1, lcp: final, lcp_candidates: rec.lcp, cls: Number(cls.toFixed(5)), shifts: rec.shifts, eager_or_high: priority, image_requests: images.length });
    console.error(label, path, i + 1, "LCP", final?.time, final?.el?.tag, (final?.el?.src ?? final?.el?.text ?? "").slice(-60), "CLS", cls.toFixed(4), "shifts", rec.shifts.length);
    await context.close();
  }
  const times = page_runs.map(r => r.lcp?.time ?? NaN).sort((a, b) => a - b);
  out.pages.push({ path, median_lcp_ms: times[Math.floor(times.length / 2)], max_cls: Math.max(...page_runs.map(r => r.cls)), runs: page_runs });
}
await browser.close();
writeFileSync(outFile, JSON.stringify(out, null, 1));
