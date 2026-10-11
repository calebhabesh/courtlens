// PC02 first-load audit: every route, no URL parameters, desktop + phone.
import { createRequire } from "node:module";
import { mkdirSync, writeFileSync } from "node:fs";
const require = createRequire("/home/ethioking/dev/courtlens/dashboard/package.json");
const { chromium } = require("@playwright/test");

const BASE = process.env.BASE ?? "http://localhost:3200";
const OUT = process.argv[2];
mkdirSync(`${OUT}/shots`, { recursive: true });

const STATIC = `/ /stats /players /teams /compare /team-compare /last-games /showcase /similar-players
/similar-players/shot-profile /roster-shapes /playoffs /wowy /stat-line-shift /matchups /wingspan
/contracts /free-agency /live /rankings /tierlist /calculator /planner /forecasts /evaluation
/investigations /methodology /methodology/learning /whats-new /whats-new/blog /data-status /settings /design
/research/ask /research/case-studies /research/defensive-matchups /research/distributions /research/epv
/research/operation /research/rapm /research/rapm/six-factor /research/shooting /research/shooting/adjusted
/research/shooting/aftermath /research/trends`.split(/\s+/).filter(Boolean);
const DYNAMIC = [
  ["/players", /^\/players\/\d+$/], ["/teams", /^\/teams\/[^/?]+$/], ["/contracts", /^\/contracts\/[^/?]+$/],
  ["/playoffs", /^\/playoffs\/[^/?]+$/], ["/live", /^\/live\/\d{4}-\d{2}-\d{2}$/], ["/live", /^\/live\/games\/[^/?]+$/],
  ["/investigations", /^\/investigations\/saved\/[^/?]+$/],
];
const VIEWPORTS = { desktop: { width: 1440, height: 900 }, phone: { width: 390, height: 844 } };
const slug = r => (r === "/" ? "root" : r.slice(1).replace(/[/]/g, "_"));

const browser = await chromium.launch({ executablePath: "/usr/bin/chromium" });

async function discover(index, pattern) {
  const page = await browser.newPage();
  await page.goto(BASE + index, { waitUntil: "networkidle", timeout: 45000 }).catch(() => {});
  await page.waitForTimeout(1500);
  const hrefs = await page.$$eval("a[href]", as => as.map(a => a.getAttribute("href")));
  await page.close();
  return hrefs.map(h => h.split("?")[0].split("#")[0]).find(h => pattern.test(h)) ?? null;
}

async function capture(route, vpName) {
  const context = await browser.newContext({ viewport: VIEWPORTS[vpName], deviceScaleFactor: 1 });
  const page = await context.newPage();
  const consoleErrors = [], pageErrors = [], failed = [];
  page.on("console", m => m.type() === "error" && consoleErrors.push(m.text().slice(0, 200)));
  page.on("pageerror", e => pageErrors.push(String(e).slice(0, 200)));
  page.on("response", r => { if (r.status() >= 400 && !r.url().includes("_next")) failed.push(`${r.status()} ${r.url().replace(/^https?:\/\/[^/]+/, "").slice(0, 120)}`); });
  let status = null;
  try {
    const resp = await page.goto(BASE + route, { waitUntil: "networkidle", timeout: 45000 });
    status = resp?.status() ?? null;
  } catch (e) { pageErrors.push("goto: " + String(e).slice(0, 120)); }
  await page.waitForTimeout(2000);
  const metrics = await page.evaluate(() => {
    const main = document.querySelector("main") ?? document.body;
    const vis = el => { const r = el.getBoundingClientRect(); const s = getComputedStyle(el); return r.width > 0 && r.height > 0 && s.visibility !== "hidden" && s.display !== "none"; };
    const top = el => Math.round(el.getBoundingClientRect().top + scrollY);
    const charts = [...main.querySelectorAll("svg, canvas")].filter(el => vis(el) && el.getBoundingClientRect().width >= 80 && el.getBoundingClientRect().height >= 60);
    const tables = [...main.querySelectorAll("table")].filter(vis);
    const rows = tables.reduce((n, t) => n + t.querySelectorAll("tbody tr").length, 0);
    const imgs = [...main.querySelectorAll("img")].filter(vis);
    const visuals = [...charts, ...tables, ...main.querySelectorAll("[class*=card], [class*=tile], [class*=board]")].filter(vis);
    const firstVisual = visuals.length ? Math.min(...visuals.map(top)) : null;
    const text = (main.innerText || "").replace(/\s+/g, " ").trim();
    const small = [...document.querySelectorAll("a, button, input, select, [role=button], [role=tab]")]
      .filter(vis).filter(el => { const r = el.getBoundingClientRect(); return r.height < 40 && r.top < innerHeight * 3; }).length;
    const notices = [...main.querySelectorAll("[role=status], [role=alert], .gated-note, [class*=notice], [class*=empty]")].filter(vis).map(el => el.innerText.replace(/\s+/g, " ").trim().slice(0, 140)).filter(Boolean).slice(0, 5);
    return {
      url: location.pathname + location.search,
      h1: document.querySelector("h1")?.innerText.trim() ?? null,
      overflowX: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      pageHeight: document.documentElement.scrollHeight,
      charts: charts.length, tables: tables.length, rows, images: imgs.length,
      firstVisualY: firstVisual, smallTargets: small, notices,
      textLength: text.length, text: text.slice(0, 600),
    };
  });
  const name = `${slug(route)}__${vpName}`;
  await page.screenshot({ path: `${OUT}/shots/${name}.png` });
  await page.screenshot({ path: `${OUT}/shots/${name}__full.png`, fullPage: true, clip: { x: 0, y: 0, width: VIEWPORTS[vpName].width, height: Math.min(metrics.pageHeight, 3600) } }).catch(() => {});
  await context.close();
  return { route, viewport: vpName, status, ...metrics, consoleErrors: consoleErrors.slice(0, 5), pageErrors, failedRequests: [...new Set(failed)].slice(0, 8) };
}

const routes = [...STATIC];
for (const [index, pattern] of DYNAMIC) { const found = await discover(index, pattern); routes.push(found ?? `MISSING:${index}:${pattern}`); }
const results = [];
for (const route of routes) {
  if (route.startsWith("MISSING")) { results.push({ route, missing: true }); continue; }
  for (const vp of Object.keys(VIEWPORTS)) { const r = await capture(route, vp); results.push(r); console.log(vp, route, r.status, r.h1, `charts=${r.charts} rows=${r.rows} err=${r.pageErrors.length}`); }
}
writeFileSync(`${OUT}/results.json`, JSON.stringify({ base: BASE, captured_at: new Date().toISOString(), results }, null, 2));
await browser.close();
