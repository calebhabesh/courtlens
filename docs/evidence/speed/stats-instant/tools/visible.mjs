// When does the content become *visible* (effective opacity >= 0.95), not just present?
import { chromium } from "playwright";
const BASES = (process.env.BASES || "https://courtlens.calebhabesh.com").split(",");
const LAT = Number(process.env.LAT || 0);
const RUNS = Number(process.env.RUNS || 5), CPU = Number(process.env.CPU || 1);
const UA = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36";
const browser = await chromium.launch({ executablePath: process.env.CHROME });
const STATS = { re: "^/stats$", sel: ".stats-workspace tbody a[href^='/players/']" };
const PLAYER = { re: "^/players/\\d+$", sel: "main h1" };
async function ctx() {
  const context = await browser.newContext({ userAgent: UA, viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  const s = await context.newCDPSession(page);
  if (CPU > 1) await s.send("Emulation.setCPUThrottlingRate", { rate: CPU });
  if (LAT > 0) { await s.send("Network.enable"); await s.send("Network.emulateNetworkConditions", { offline: false, latency: LAT, downloadThroughput: 50e6 / 8, uploadThroughput: 10e6 / 8 }); }
  return { context, page };
}
// t0 = wall-clock ms (epoch) of the action; returns {present, visible} in ms since t0
async function watch(page, target, t0) {
  const h = await page.waitForFunction(({ re, sel, t0 }) => {
    const now = performance.timeOrigin + performance.now();
    window.__w ??= {};
    if (!new RegExp(re).test(location.pathname)) return false;
    const el = document.querySelector(sel);
    if (!el || document.querySelector('[aria-busy="true"][role="status"]')) return false;
    window.__w.present ??= now - t0;
    let o = 1; for (let n = el; n && n.nodeType === 1; n = n.parentElement) o *= Number(getComputedStyle(n).opacity);
    if (o < 0.95) return false;
    const r = { present: Math.round(window.__w.present), visible: Math.round(now - t0) }; delete window.__w; return r;
  }, { ...target, t0 }, { polling: "raf", timeout: 60000 });
  return h.jsonValue();
}
const out = {};
const add = (k, v) => (out[k] ??= []).push(v);
for (let run = 0; run < RUNS; run++) for (const BASE of BASES) {
  const tag = BASES.length > 1 ? new URL(BASE).port + " " : "";
  for (const [label, path, target] of [["doc /", "/", STATS], ["doc /stats", "/stats", STATS], ["doc /players/2544", "/players/2544", PLAYER]]) {
    const { context, page } = await ctx();
    const t0 = Date.now();
    await page.goto(BASE + path, { waitUntil: "commit" });
    add(tag + label, await watch(page, target, t0));
    await context.close();
  }
  const { context, page } = await ctx();
  await page.goto(BASE + "/players/2544"); await page.waitForLoadState("networkidle");
  for (const [label, act, target] of [
    ["nav player→Stats", () => page.locator('header a[href="/stats"]').first().click(), STATS],
    ["click Stats→player", () => page.locator(STATS.sel).nth(3).click(), PLAYER],
    ["Back player→Stats", () => page.goBack(), STATS],
  ]) {
    await page.waitForTimeout(400);
    const t0 = await page.evaluate(() => performance.timeOrigin + performance.now());
    await act();
    add(tag + label, await watch(page, target, t0));
    await page.waitForLoadState("networkidle").catch(() => {});
  }
  await context.close();
}
await browser.close();
const med = a => [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)];
console.log(`latency ${LAT} ms, CPU x${CPU}, ${RUNS} runs, medians (ms from action): present = in the DOM, visible = opacity >= 0.95`);
for (const [k, v] of Object.entries(out)) console.log(k.padEnd(28), "present", String(med(v.map(x => x.present))).padStart(5), " visible", String(med(v.map(x => x.visible))).padStart(5), "  all visible:", v.map(x => x.visible).join(","));
