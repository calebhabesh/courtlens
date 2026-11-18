// Time from the action until the destination's content is visible AND painted:
// DOM check every frame (content present, no loader, effective opacity >= 0.95), then the next frame's paint
// (rAF + task). For document loads, also not before first contentful paint.
// Run from dashboard/ (for its playwright): node ../docs/evidence/speed/stats-instant/tools/painted.mjs
import { chromium } from "playwright";
const BASES = (process.env.BASES || "https://courtlens.calebhabesh.com").split(",");
const NODIM = Boolean(process.env.NODIM), ONLYNAV = Boolean(process.env.ONLYNAV);
const RUNS = Number(process.env.RUNS || 5), CPU = Number(process.env.CPU || 1);
const UA = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36";
const browser = await chromium.launch({ executablePath: process.env.CHROME });
const STATS = { re: "^/stats$", sel: ".stats-workspace tbody a[href^='/players/']" };
const PLAYER = { re: "^/players/\\d+$", sel: "main h1" };
async function ctx() {
  const context = await browser.newContext({ userAgent: UA, viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  if (CPU > 1) { const s = await context.newCDPSession(page); await s.send("Emulation.setCPUThrottlingRate", { rate: CPU }); }
  await page.addInitScript(() => { window.__fcp = null; try { new PerformanceObserver(l => { for (const e of l.getEntries()) if (e.name === "first-contentful-paint") window.__fcp = performance.timeOrigin + e.startTime; }).observe({ type: "paint", buffered: true }); } catch {} });
  if (NODIM) await page.addInitScript(() => document.addEventListener("DOMContentLoaded", () => { const st = document.createElement("style"); st.textContent = ".route-enter[data-nav-pending]{transition-delay:var(--dur-slow)!important}"; document.head.append(st); }));
  return { context, page };
}
const shownScript = ({ re, sel, t0 }) => new Promise(resolve => {
  const tick = () => {
    const ok = (() => {
      if (!new RegExp(re).test(location.pathname)) return false;
      const el = document.querySelector(sel);
      if (!el || document.querySelector('[aria-busy="true"][role="status"]')) return false;
      let o = 1; for (let n = el; n && n.nodeType === 1; n = n.parentElement) o *= Number(getComputedStyle(n).opacity);
      return o >= 0.95;
    })();
    if (!ok) return requestAnimationFrame(tick);
    requestAnimationFrame(() => setTimeout(() => {
      const painted = performance.timeOrigin + performance.now();
      const wait = () => window.__fcp == null && performance.getEntriesByName("first-contentful-paint").length === 0 ? setTimeout(wait, 5) : resolve(Math.round(Math.max(painted, window.__fcp ?? 0) - t0));
      wait();
    }, 0));
  };
  tick();
});
async function watch(page, target, t0) {
  for (let i = 0; i < 200; i++) {
    try { return await page.evaluate(shownScript, { ...target, t0 }); }
    catch (e) { if (!/context was destroyed|navigation/i.test(String(e))) throw e; await page.waitForLoadState("domcontentloaded").catch(() => {}); }
  }
  throw new Error("no stable context");
}
const out = {};
const add = (k, v) => (out[k] ??= []).push(v);
for (let run = 0; run < RUNS; run++) for (const BASE of BASES) {
  const tag = BASES.length > 1 ? new URL(BASE).port + " " : "";
  for (const [label, path, target] of (ONLYNAV ? [] : [["doc /", "/", STATS], ["doc /stats", "/stats", STATS], ["doc /players/2544", "/players/2544", PLAYER]])) {
    const { context, page } = await ctx();
    const t0 = Date.now();
    await page.goto(BASE + path, { waitUntil: "commit" });
    if (path === "/") await page.waitForURL(/\/stats/, { waitUntil: "commit" });
    add(tag + label, await watch(page, target, t0));
    await context.close();
  }
  const { context, page } = await ctx();
  await page.goto(BASE + "/players/2544"); await page.waitForLoadState("networkidle");
  const hoverThenClick = async (loc) => { await loc.hover(); await page.waitForTimeout(500); };
  for (const [label, act, target, pre] of [
    ...(process.env.HOVER ? [
      ["hover+click player→Stats", () => page.locator('header a[href="/stats"]').first().click(), STATS, () => hoverThenClick(page.locator('header a[href="/stats"]').first())],
      ["hover+click Stats→player", () => page.locator(STATS.sel).nth(4).click(), PLAYER, () => hoverThenClick(page.locator(STATS.sel).nth(4))],
      ["Back player→Stats (2)", () => page.goBack(), STATS],
    ] : []),
    ["nav player→Stats", () => page.locator('header a[href="/stats"]').first().click(), STATS],
    ["click Stats→player", () => page.locator(STATS.sel).nth(3).click(), PLAYER],
    ["Back player→Stats", () => page.goBack(), STATS],
  ]) {
    await page.waitForTimeout(400);
    if (pre) await pre();
    const t0 = await page.evaluate(() => performance.timeOrigin + performance.now());
    const p = watch(page, target, t0);
    await act();
    add(tag + label, await p);
    await page.waitForLoadState("networkidle").catch(() => {});
  }
  await context.close();
}
await browser.close();
const med = a => [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)];
console.log(`CPU x${CPU}, ${RUNS} runs: median ms from the action until content is visible and painted`);
for (const [k, v] of Object.entries(out)) console.log(k.padEnd(28), String(med(v)).padStart(5), "   runs:", v.join(","));
