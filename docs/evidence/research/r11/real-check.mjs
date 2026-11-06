// Real-data check for R11 (Learning, Glossary, Patch Notes) against the private API and the
// committed frozen results. Usage: node real-check.mjs <out.json> <shots-dir>
// Needs the private API on 4180 and the production sandbox on 3180.
import { chromium } from "/home/ethioking/dev/courtlens/dashboard/node_modules/playwright/index.mjs";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { RESEARCH_FACTS, formatFact } from "../../../../dashboard/lib/research-facts.ts";

const API = "http://127.0.0.1:4180", WEB = "http://localhost:3180";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const [,, out, shots] = process.argv;
const patch = JSON.parse(readFileSync(path.join(ROOT, "dashboard/content/patch-notes.json"), "utf8"));

// Independent re-derivation of every quoted fact from the frozen files (not the Vitest code path).
const cache = new Map();
const load = file => cache.get(file) ?? (cache.set(file, JSON.parse(readFileSync(path.join(ROOT, file), "utf8"))), cache.get(file));
const walk = (node, steps) => steps.reduce((n, s) => typeof s === "object" ? n.filter(x => Object.entries(s).every(([k, v]) => x[k] === v))[0] : n?.[s], node);
const factSource = f => {
  const data = load(f.file);
  if (f.kind === "seasons") { const n = walk(data, f.path); const s = Array.isArray(n) ? n : Object.keys(n).sort(); return s.length === 2 ? s.join(" and ") : `${s[0]} to ${s.at(-1)}`; }
  if (f.kind === "reduction") return Math.round(100 * (1 - walk(data, f.after) / walk(data, f.before)));
  return Number((walk(data, f.path) * (f.scale ?? 1)).toFixed(f.digits));
};

const ff = await (await fetch(`${API}/api/four-factors`)).json();
const catalog = await (await fetch(`${API}/api/workbench/metrics?version=courtlens-stats-v4`)).json();
const report = { facts: [], pages: [] };
for (const [id, f] of Object.entries(RESEARCH_FACTS)) report.facts.push({ id, shown: formatFact(f), source: factSource(f), equal: factSource(f) === f.value });

const browser = await chromium.launch();
for (const width of [1440, 390]) {
  for (const route of ["/methodology/learning", "/whats-new", "/stats/glossary", "/stats"]) {
    const page = await browser.newPage({ viewport: { width, height: width > 600 ? 900 : 844 } });
    const errors = [], mismatches = [];
    let compared = 0;
    const eq = (what, got, want) => { compared += 1; if (got !== want) mismatches.push({ what, got, want }); };
    page.on("console", m => { if (m.type() === "error") errors.push(m.text()); });
    page.on("pageerror", e => errors.push(String(e)));
    await page.goto(`${WEB}${route}`, { waitUntil: "networkidle" });
    if (route === "/methodology/learning") {
      await page.waitForSelector('[data-table="league-trends"] tbody tr');
      for (const season of ff.seasons) {
        const L = season.league;
        const want = { ts: L.ts, efg: L.inputs.efg, tov_pct: L.inputs.tov_pct, orb_pct: L.inputs.orb_pct, fg3a_rate: L.fg3a_rate, ortg: L.ortg_factors };
        for (const [field, value] of Object.entries(want)) {
          const got = await page.getAttribute(`tr[data-row="${season.season}"] [data-field="${field}"]`, "data-value");
          eq(`${season.season} ${field}`, got === "" ? null : Number(got), value);
        }
      }
      eq("league rows", await page.locator('[data-table="league-trends"] tbody tr').count(), ff.seasons.length);
      const measured = await page.$$eval("[data-measured]", els => els.map(e => e.textContent));
      const shownFacts = new Set(Object.values(RESEARCH_FACTS).map(formatFact));
      for (const f of report.facts) {
        const used = measured.some(t => t.includes(f.shown));
        if (used) eq(`fact ${f.id} equals frozen source`, f.equal, true);
      }
      // Every number in a measured box must be a checked fact (no unchecked figures).
      // Seasons and the unit "per 100 possessions" are labels, not figures; a "%" after a fact is its unit.
      for (const text of measured) for (const n of text.replace(/\b(19|20)\d\d-\d\d\b/g, "").replace(/per 100 possessions/g, "").replace(/\b3P%/g, "").match(/[−+]?\d+(?:,\d{3})*(?:\.\d+)?/g) ?? []) {
        const known = shownFacts.has(n) || shownFacts.has(`${n}%`);
        eq(`number "${n}" is a checked fact`, known, true);
      }
      report.measuredBoxes = measured.length;
    }
    if (route === "/whats-new") {
      for (const release of patch.releases) {
        const line = await page.textContent(`[data-release="${release.id}"]`);
        eq(`${release.id} release line has version`, line?.startsWith(release.version), true);
        for (const g of release.groups) for (const e of g.entries) eq(`${release.id} ${e.title} commit link`, await page.locator(`a[href$="/commit/${e.commit}"]`).count() > 0, true);
      }
    }
    if (route === "/stats/glossary") {
      const keys = await page.$$eval("article.glossary-card", els => els.map(e => e.getAttribute("aria-labelledby")?.replace("glossary-", "")));
      const distinct = new Set(catalog.metrics.map(m => `${m.display_name}|${m.formula}`)).size;
      eq("glossary entries = distinct catalog metrics", keys.length, distinct);
      for (const m of catalog.metrics.filter(m => m.key.startsWith("bbref_"))) {
        const text = await page.locator(`article[aria-labelledby="glossary-${m.key}"] .glossary-card-description`).first().textContent().catch(() => null);
        if (text !== null) eq(`${m.key} described from the catalog`, text.includes(m.formula.replace(/\.$/, "")), true);
      }
    }
    if (route === "/stats") {
      const latest = patch.releases.flatMap(r => r.groups.flatMap(g => g.entries)).reduce((a, e) => !a || e.date > a.date ? e : a, null);
      const line = await page.textContent(".stats-whats-new").catch(() => "");
      eq("Stats What's New names the newest entry", line.includes(latest.title), true);
    }
    // Scroll through so lazy images load, then count broken ones and horizontal overflow.
    const height = await page.evaluate(() => document.documentElement.scrollHeight);
    for (let y = 0; y < height; y += 700) { await page.evaluate(v => scrollTo(0, v), y); await page.waitForTimeout(60); }
    await page.waitForLoadState("networkidle");
    const broken = await page.$$eval("img", imgs => imgs.filter(i => i.complete && i.naturalWidth === 0).map(i => i.src));
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
    if (shots && route !== "/stats") {
      await page.evaluate(() => scrollTo(0, 0));
      await page.screenshot({ path: `${shots}/${route.split("/").filter(Boolean).join("-")}-${width}.png`, fullPage: false });
    }
    report.pages.push({ route, width, compared, mismatches, errors, broken, overflow });
    await page.close();
  }
}
await browser.close();
writeFileSync(out, JSON.stringify(report, null, 2) + "\n");
const bad = report.facts.filter(f => !f.equal).length + report.pages.reduce((s, p) => s + p.mismatches.length + p.errors.length + p.broken.length + (p.overflow > 0 ? 1 : 0), 0);
console.log(report.pages.map(p => `${p.route} @${p.width}: ${p.compared} compared, ${p.mismatches.length} mismatches, ${p.errors.length} console errors, ${p.broken.length} broken images, overflow ${p.overflow}`).join("\n"));
console.log(`facts: ${report.facts.filter(f => f.equal).length}/${report.facts.length} equal their frozen source; problems: ${bad}`);
process.exit(bad ? 1 : 0);
