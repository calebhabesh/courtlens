// RD12 round 4: the RAPM Ratings Leaders list against the owner's API through the read-only proxy on 4180, production build on 3180, at 1440 and 390, in several scopes. Every
// lookup is written here independently of the page: names, values, the bars' geometry from the served values alone, colours, the scale's labels, the old chart's absence, console errors, overflow.
// Usage: node leaders-check.mjs <report.json> [<shots dir>]
import { chromium } from "/home/ethioking/dev/courtlens/dashboard/node_modules/playwright/index.mjs";
import { writeFileSync } from "node:fs";
const [,, out, shots] = process.argv;
const SCOPES = [["2025-26", "regular_season"], ["2024-25", "regular_season"], ["2023-24", "regular_season"], ["2025-26", "playoffs"]];
const report = [];
const browser = await chromium.launch();
for (const width of [1440, 390]) {
  const page = await browser.newPage({ viewport: { width, height: width > 600 ? 900 : 844 } });
  const errors = [], mismatches = []; let compared = 0, scoped = 0;
  const eq = (what, got, want) => { compared += 1; if (got !== want) mismatches.push({ what, got, want }); };
  const near = (what, got, want) => { compared += 1; if (Math.abs(got - want) > 1e-6) mismatches.push({ what, got, want }); };
  page.on("console", m => { if (m.type() === "error") errors.push(m.text()); });
  page.on("pageerror", e => errors.push(String(e)));
  for (const [season, phase] of SCOPES) {
    const q = new URLSearchParams({ season, phase, beforeDate: "2026-07-01" });
    const data = await (await fetch(`http://127.0.0.1:4180/api/workbench/impact?${q}`)).json();
    await page.goto(`http://localhost:3180/research/rapm?${q}`, { waitUntil: "domcontentloaded", timeout: 120000 });
    const top = (data.players ?? []).filter(p => p.metrics.rapm != null).slice(0, 5);
    if (data.status !== "available" || !top.length) { eq(`${season} ${phase}: no list`, await page.locator(".rs-leaders-list").count(), 0); continue; }
    scoped += 1;
    await page.waitForSelector(".rs-leaders-list li", { state: "attached", timeout: 60000 });
    // The page streams, so a hidden copy of the section exists until the final one lands.
    await page.waitForFunction(() => document.querySelectorAll(".rapm-headline").length === 1, null, { timeout: 60000 });
    const seen = await page.evaluate(() => ({
      rows: [...document.querySelectorAll(".rs-leaders-list > li")].map(li => { const f = li.querySelector(".rs-leaders-fill"), t = li.querySelector(".rs-leaders-track"), v = li.querySelector(".rs-leaders-value"); const fr = f?.getBoundingClientRect(), tr = t.getBoundingClientRect(); return {
        id: li.dataset.row, value: li.dataset.value, name: li.querySelector(".ui-identity-name")?.textContent, shown: v.textContent, valueIdentity: v.dataset.identity ?? null, fillIdentity: f?.dataset.identity ?? null, left: f?.dataset.left, width: f?.dataset.width, drawn: fr ? fr.width / tr.width * 100 : null, fromLeft: fr ? (fr.left - tr.left) / tr.width * 100 : null,
        trackHeight: tr.height, fillColour: f ? getComputedStyle(f).backgroundColor : null, trackColour: getComputedStyle(t).backgroundColor, detail: li.querySelector("small")?.textContent }; }),
      scale: (() => { const s = document.querySelector('[data-field="scale"]'), r = s.getBoundingClientRect(), t = document.querySelector(".rs-leaders-track").getBoundingClientRect(); return { text: [...s.children].map(c => c.textContent), low: s.dataset.low, high: s.dataset.high, left: Math.abs(r.left - t.left), right: Math.abs(r.right - t.right) }; })(),
      gold: (() => { const p = document.createElement("span"); p.style.color = "var(--color-identity-a)"; document.body.append(p); const c = getComputedStyle(p).color; p.remove(); return c; })(),
      oldBars: document.querySelectorAll(".rapm-headline .chart-ranked, .rapm-headline .chart-ranked-bar, .rapm-headline .chart-axis-labels").length,
      title: document.querySelector(".rapm-headline .chart-title")?.textContent, source: document.querySelector(".rapm-headline .chart-meta")?.textContent,
      overflow: document.documentElement.scrollWidth - innerWidth,
    }));
    const low = Math.min(0, ...top.map(p => p.metrics.rapm)), high = Math.max(0, ...top.map(p => p.metrics.rapm)), at = v => (v - low) / (high - low) * 100;
    const tag = `${width} ${season} ${phase}`;
    eq(`${tag} row count`, seen.rows.length, top.length);
    eq(`${tag} old chart gone`, seen.oldBars, 0);
    eq(`${tag} unit in title`, seen.title, "Qualified 1Y RAPM leaders, points per 100 counted controls");
    eq(`${tag} no project code`, /IM0\d/.test(seen.source), false);
    eq(`${tag} overflow`, seen.overflow <= 0, true);
    near(`${tag} scale low`, Number(seen.scale.low), low); near(`${tag} scale high`, Number(seen.scale.high), high);
    eq(`${tag} scale lines up`, seen.scale.left <= 1 && seen.scale.right <= 1, true);
    eq(`${tag} scale says zero`, seen.scale.text.some(t => t === "0 is an average player"), true);
    eq(`${tag} scale says top`, seen.scale.text.at(-1), `${high.toLocaleString("en-US", { maximumFractionDigits: 2 })} is the top of this list`);
    top.forEach((p, i) => {
      const r = seen.rows[i], v = p.metrics.rapm, w = at(Math.max(0, v)) - at(Math.min(0, v)), want = v > 0 ? "a" : v < 0 ? "b" : null;
      eq(`${tag} ${p.player_name} id`, r.id, p.player_id); eq(`${tag} ${p.player_name} name`, r.name, p.player_name);
      eq(`${tag} ${p.player_name} value`, Number(r.value), v); eq(`${tag} ${p.player_name} shown`, r.shown, v.toFixed(2));
      eq(`${tag} ${p.player_name} identity`, r.fillIdentity, want); eq(`${tag} ${p.player_name} value identity`, r.valueIdentity, want);
      near(`${tag} ${p.player_name} width`, Number(r.width), w); near(`${tag} ${p.player_name} left`, Number(r.left), at(Math.min(0, v)));
      compared += 2; if (Math.abs(r.drawn - w) > 0.5) mismatches.push({ what: `${tag} ${p.player_name} drawn width`, got: r.drawn, want: w }); if (Math.abs(r.fromLeft - at(Math.min(0, v))) > 0.5) mismatches.push({ what: `${tag} ${p.player_name} drawn left`, got: r.fromLeft, want: at(Math.min(0, v)) });
      eq(`${tag} ${p.player_name} thin track`, r.trackHeight, 8);
      if (v > 0) eq(`${tag} ${p.player_name} gold`, r.fillColour, seen.gold);
      eq(`${tag} ${p.player_name} detail`, r.detail.includes("games"), true);
    });
    if (shots && season === "2025-26" && phase === "regular_season") await page.locator(".rapm-headline").screenshot({ path: `${shots}/rapm-leaders-${width}.png` });
  }
  const result = { width, scopes: scoped, compared, mismatches: mismatches.length, errors: [...new Set(errors)].slice(0, 8), firstMismatches: mismatches.slice(0, 20) };
  report.push(result); console.log(JSON.stringify(result));
  await page.close();
}
await browser.close();
if (out) writeFileSync(out, JSON.stringify(report, null, 1));
