// Per route: ms until the page is shown and settled (h1 filled, no loader [role=status][aria-busy], main opaque,
// then the next painted frame), for a document load and for a client navigation from /stats (router.push).
// Run from dashboard/ (for its playwright).
import { chromium } from "playwright";
const BASES = (process.env.BASES || "http://localhost:3181,http://localhost:3182").split(",");
const RUNS = Number(process.env.RUNS || 3), CPU = Number(process.env.CPU || 1);
const ROUTES = (process.env.ROUTES || "/players,/teams,/teams/1610612747,/standings,/draft,/research/rapm,/showcase,/compare?playerA=2544&playerB=203999,/wowy,/free-agency,/research/zts,/contracts,/players/2544").split(",");
// A real portrait's bytes, answered from memory: stands in for Cloudflare's edge cache (HIT) so the API
// process does not serve every portrait locally.
const EDGE_BODY = process.env.EDGEIMG ? Buffer.from(await (await fetch(process.env.EDGEIMG)).arrayBuffer()) : null;
const browser = await chromium.launch({ executablePath: process.env.CHROME });
async function ctx() {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, ignoreHTTPSErrors: true });
  const page = await context.newPage();
  if (process.env.EDGEIMG) await page.route(/\/portrait(\.webp)?\?/, route => route.fulfill({ status: 200, contentType: "image/webp", body: EDGE_BODY, headers: { "cache-control": "public, max-age=86400" } }));
  if (CPU > 1) { const s = await context.newCDPSession(page); await s.send("Emulation.setCPUThrottlingRate", { rate: CPU }); }
  await page.addInitScript(() => { window.__fcp = null; try { new PerformanceObserver(l => { for (const e of l.getEntries()) if (e.name === "first-contentful-paint") window.__fcp = performance.timeOrigin + e.startTime; }).observe({ type: "paint", buffered: true }); } catch {} });
  return { context, page };
}
const settledScript = ({ path, t0 }) => new Promise(resolve => {
  const target = path.split("?")[0];
  const tick = () => {
    const ok = location.pathname === target && document.querySelector("main h1")?.textContent?.trim()
      && !document.querySelector('[role="status"][aria-busy="true"]')
      && Number(getComputedStyle(document.querySelector("main")).opacity) >= 0.95;
    if (!ok) { if (performance.timeOrigin + performance.now() - t0 > 20000) return resolve(-1); return requestAnimationFrame(tick); }
    requestAnimationFrame(() => setTimeout(() => {
      const wait = () => window.__fcp == null && !performance.getEntriesByName("first-contentful-paint").length ? setTimeout(wait, 5)
        : resolve(Math.round(Math.max(performance.timeOrigin + performance.now(), window.__fcp ?? 0) - t0));
      wait();
    }, 0));
  };
  tick();
});
async function watch(page, path, t0) {
  for (let i = 0; i < 200; i++) {
    try { return await page.evaluate(settledScript, { path, t0 }); }
    catch (e) { if (!/context was destroyed|navigation/i.test(String(e))) throw e; await page.waitForLoadState("domcontentloaded").catch(() => {}); }
  }
}
const out = {};
const add = (k, v) => (out[k] ??= []).push(v);
for (let run = 0; run < RUNS; run++) for (const route of ROUTES) for (const BASE of BASES) {
  const tag = new URL(BASE).port;
  { const { context, page } = await ctx(); const t0 = Date.now(); await page.goto(BASE + route, { waitUntil: "commit" }); add(`${route}|doc|${tag}`, await watch(page, route, t0)); await context.close(); }
  { const { context, page } = await ctx();
    await page.goto(BASE + "/stats"); await page.waitForLoadState("networkidle"); await page.waitForTimeout(300);
    const t0 = await page.evaluate(() => performance.timeOrigin + performance.now());
    const p = watch(page, route, t0);
    await page.evaluate(path => window.next.router.push(path), route);
    add(`${route}|nav|${tag}`, await p); await context.close(); }
}
await browser.close();
const med = a => { const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };
console.log(`CPU x${CPU}, ${RUNS} runs, median ms until shown and settled (before :${new URL(BASES[0]).port} → after :${new URL(BASES.at(-1)).port})`);
console.log("route".padEnd(40), "doc load".padStart(16), "client nav".padStart(18));
for (const route of ROUTES) {
  const f = (kind) => `${med(out[`${route}|${kind}|${new URL(BASES[0]).port}`])} → ${med(out[`${route}|${kind}|${new URL(BASES.at(-1)).port}`])}`;
  console.log(route.padEnd(40), f("doc").padStart(16), f("nav").padStart(18));
}
