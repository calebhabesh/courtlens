// Real-data check for R12: every number on the Research landing against the served APIs.
// Usage: node real-check.mjs <out.json> <shots-dir>. Needs the private API on 4180 and the sandbox on 3180.
import { chromium } from "/home/ethioking/dev/courtlens/dashboard/node_modules/playwright/index.mjs";
import { writeFileSync } from "node:fs";

const API = "http://127.0.0.1:4180", WEB = "http://localhost:3180/research";
const [,, out, shots] = process.argv;
const get = async p => (await fetch(`${API}/api/${p}`)).json();
const [wp, bt, pi, sq] = await Promise.all(["win-probability", "metric-backtest", "projected-impact", "shot-quality"].map(get));
const pair = bt.results.pairs.find(p => p.candidate === "time_decay" && p.reference === "team_net");
const r = (v, d) => Number(v.toFixed(d));
const seasons = s => s.length === 2 ? s.join(" and ") : `${s[0]} to ${s.at(-1)}`;
const sign = (v, d) => `${v > 0 ? "+" : v < 0 ? "−" : ""}${Math.abs(v).toFixed(d)}`;
const grouped = n => n.toLocaleString("en-US");
// Every number each card shows, rebuilt from the API answer.
const want = {
  "win-probability": { headline: r(wp.card.models.selected.log_loss.mean, 4), texts: [wp.card.models.selected.log_loss.mean.toFixed(4), wp.card.models.S0.log_loss.mean.toFixed(4), wp.card.gates.A2.ece.toFixed(4), grouped(wp.card.test_games), seasons(wp.card.test_seasons)] },
  "metric-backtest": { headline: r(pair.pooled.rmse.gain, 2), texts: [sign(pair.pooled.rmse.gain, 2), sign(pair.pooled.rmse.low, 2), sign(pair.pooled.rmse.high, 2), grouped(pair.games), seasons(pair.seasons)] },
  "projected-impact": { headline: r(pi.card.test.gates.A1_player.gap, 2), texts: [sign(pi.card.test.gates.A1_player.gap, 2), sign(pi.card.test.gates.A1_player.low, 2), sign(pi.card.test.gates.A1_player.high, 2), seasons(Object.keys(pi.card.test.seasons).sort())] },
  "shot-quality": { headline: r(sq.test.gates.relative_brier.value * 100, 2), texts: [(sq.test.pooled.versus_baseline.lightgbm_31.relative_brier.value * 100).toFixed(2), (sq.test.pooled.versus_baseline.lightgbm_31.relative_brier.interval[0] * 100).toFixed(2), (sq.test.pooled.versus_baseline.lightgbm_31.relative_brier.interval[1] * 100).toFixed(2), seasons(sq.test.seasons)] },
};
const report = { pages: [] };
const browser = await chromium.launch();
for (const width of [1440, 390]) {
  const page = await browser.newPage({ viewport: { width, height: width > 600 ? 900 : 844 } });
  const errors = [], mismatches = []; let compared = 0;
  const eq = (what, got, exp) => { compared += 1; if (got !== exp) mismatches.push({ what, got, exp }); };
  page.on("console", m => { if (m.type() === "error") errors.push(m.text()); });
  page.on("pageerror", e => errors.push(String(e)));
  await page.goto(WEB, { waitUntil: "networkidle" });
  const cards = await page.$$eval('[aria-label="Headline results"] > [role="listitem"]', items => items.map(i => ({ text: i.textContent, value: i.querySelector("[data-fact]")?.getAttribute("data-value") ?? null, tested: i.querySelector("[data-tested]")?.getAttribute("data-tested"), progress: !!i.querySelector('[data-status="in-progress"]') })));
  eq("card count", cards.length, 5);
  for (const card of cards) {
    if (card.tested === "ask-evaluation") { eq("R16 in progress", card.progress, true); eq("R16 shows no number", card.value, null); eq("R16 text has no digits besides R16", /\d/.test(card.text.replace(/R16/g, "")), false); continue; }
    const w = want[card.tested];
    eq(`${card.tested} headline`, Number(card.value), w.headline);
    for (const t of w.texts) eq(`${card.tested} shows ${t}`, card.text.includes(t), true);
  }
  const height = await page.evaluate(() => document.documentElement.scrollHeight);
  for (let y = 0; y < height; y += 700) { await page.evaluate(v => scrollTo(0, v), y); await page.waitForTimeout(60); }
  await page.waitForLoadState("networkidle");
  const broken = await page.$$eval("img", imgs => imgs.filter(i => i.complete && i.naturalWidth === 0).map(i => i.src));
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
  const visible = await page.locator(".ui-page").innerText();
  const iso = visible.match(/\b\d{4}-\d{2}-\d{2}\b/g) ?? [];
  const small = width < 600 ? await page.$$eval(".ui-page a, .ui-page button", els => els.filter(e => { const b = e.getBoundingClientRect(); return b.width && b.height < 40; }).length) : null;
  const firstCard = await page.evaluate(() => Math.round(document.querySelector('[aria-label="Headline results"]').getBoundingClientRect().top + scrollY));
  if (shots) { await page.evaluate(() => scrollTo(0, 0)); await page.screenshot({ path: `${shots}/research-landing-${width}.png`, fullPage: true }); }
  report.pages.push({ width, compared, mismatches, errors, broken, overflow, iso, smallTouchTargets: small, firstCardTop: firstCard });
  await page.close();
}
await browser.close();
writeFileSync(out, JSON.stringify(report, null, 2) + "\n");
const bad = report.pages.reduce((s, p) => s + p.mismatches.length + p.errors.length + p.broken.length + (p.overflow > 0 ? 1 : 0), 0);
console.log(report.pages.map(p => `/research @${p.width}: ${p.compared} compared, ${p.mismatches.length} mismatches, ${p.errors.length} console errors, ${p.broken.length} broken, overflow ${p.overflow}, iso ${p.iso.length}, small ${p.smallTouchTargets}, first card ${p.firstCardTop}px`).join("\n"));
process.exit(bad ? 1 : 0);
