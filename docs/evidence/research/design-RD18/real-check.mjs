// RD18 real-data check: the sandbox build on :3180, its API on :4180 (readonly-proxy.mjs, GET only → the owner's :8000).
// Expected values come from GET http://127.0.0.1:8000/api/shot-aftermath directly and are formatted here, independently of
// dashboard/lib/shot-aftermath.ts. Every drawn value is compared with the served one at 1440 and 390, in several scopes and views,
// plus console errors, page overflow, tables scrolling sideways, broken images, team logos and hashes in the visible text.
// Usage: node real-check.mjs <report.json> <shots dir>
import { chromium } from "/home/ethioking/dev/courtlens/dashboard/node_modules/playwright/index.mjs";
import { writeFileSync } from "node:fs";

const [,, out, shots] = process.argv;
const API = "http://127.0.0.1:8000/api/shot-aftermath";
const APP = "http://127.0.0.1:3180/research/shooting/aftermath";
const get = async path => (await fetch(API + path)).json();
const MINUS = "−";
const fixed = (v, d = 3) => v.toFixed(d).replace("-", MINUS);
const signed = (v, d = 3) => { const t = Math.abs(v).toFixed(d); return Number(t) === 0 ? t : `${v > 0 ? "+" : MINUS}${t}`; };
const pct = v => `${(v * 100).toFixed(1)}%`;
const toneOf = t => t === "benefit" ? "good" : t === "cost" ? "bad" : "";
const ZONES = ["rim", "short_mid", "long_mid", "three", "all"];
const SHOT_ZONES = ZONES.slice(0, 4);
const COST = new Set(["cost", "miss_cost", "dreb_cost"]);
const VIEW_CHARTS = { all: ["own", "second", "cost", "net"], miss: ["second_per_miss", "miss_cost", "miss_net"], dreb: ["ppp_dreb", "dreb_cost"] };
const POSITION = { all: "All positions", guards: "Guards", forwards: "Forwards", bigs: "Bigs" };

const SCOPES = [
  { season: "2025-26", team: null, position: "all", view: "all", zone: "all" },
  { season: "2024-25", team: null, position: "all", view: "miss", zone: "three" },
  { season: "2025-26", team: "BOS", position: "bigs", view: "dreb", zone: "rim" },
  { season: "2025-26", team: null, position: "guards", view: "all", zone: "long_mid" },
];

const summary = await get("");
const report = { checked: 0, mismatches: [], pages: [] };
const check = (where, expected, actual) => { report.checked += 1; if (String(expected) !== String(actual)) report.mismatches.push({ where, expected: String(expected), actual: String(actual) }); };

const browser = await chromium.launch();
for (const s of SCOPES) {
  const scope = await get(`/scope?season=${s.season}&team=${s.team ?? "all"}&position=${s.position}`);
  const board = await get(`/teams?season=${s.season}&position=${s.position}&zone=${s.zone}`);
  const cells = Object.fromEntries(scope.rows.map(r => [r.zone, r]));
  const params = new URLSearchParams();
  if (s.season !== "2025-26") params.set("season", s.season);
  if (s.team) params.set("team", s.team);
  if (s.position !== "all") params.set("position", s.position);
  if (s.view !== "all") params.set("view", s.view);
  if (s.zone !== "all") params.set("zone", s.zone);
  for (const width of [1440, 390]) {
    const tag = `${s.season}-${s.team ?? "nba"}-${s.position}-${s.view}-${s.zone}-${width}`;
    const page = await browser.newPage({ viewport: { width, height: width === 390 ? 844 : 900 } });
    const errors = [];
    page.on("console", m => { if (m.type() === "error") errors.push(m.text().slice(0, 200)); });
    page.on("pageerror", e => errors.push(String(e).slice(0, 200)));
    await page.goto(`${APP}${params.size ? `?${params}` : ""}`, { waitUntil: "networkidle", timeout: 120000 });
    await page.locator("table[data-table=teams]").waitFor();
    await page.waitForTimeout(800);
    const w = `${tag}`;

    // Meta line.
    const meta = await page.locator("[data-field=hero-meta]").innerText();
    const all = cells.all;
    const expectedMeta = [s.season, s.team ?? "NBA", POSITION[s.position] + (s.position === "all" ? "" : " (estimated)"), `${all.counts.attempts.toLocaleString("en-US")} first-chance attempts`, "Regular season"].join(" · ");
    check(`${w} meta`, expectedMeta, meta.replace(/\s+/g, " ").trim());

    // Answer: best and worst zone by net, computed here.
    // Only cells that aren't thin are ranked (thin zones are named in a note).
    const zoneCells = SHOT_ZONES.map(z => cells[z]).filter(c => c.status === "ok" && c.values.net);
    const thinZones = SHOT_ZONES.filter(z => cells[z].status === "thin");
    const thinNote = page.locator("[data-field=answer-thin-zones]");
    check(`${w} answer thin zones`, thinZones.join(","), thinZones.length ? await thinNote.getAttribute("data-zones") : "");
    const sorted = [...zoneCells].sort((a, b) => b.values.net.value - a.values.net.value);
    const answer = page.locator("[data-field=answer]");
    check(`${w} answer best`, sorted[0].zone, await answer.getAttribute("data-best"));
    check(`${w} answer worst`, sorted.at(-1).zone, await answer.getAttribute("data-worst"));
    const headline = await page.locator("[data-field=headline]").innerText();
    check(`${w} headline best net`, true, headline.includes(sorted[0].values.net.value.toFixed(2).replace("-", MINUS)));
    check(`${w} headline worst net`, true, headline.includes(sorted.at(-1).values.net.value.toFixed(2).replace("-", MINUS)));
    const ac = page.locator("[data-field=answer-cost]");
    if (all.values.cost && all.values.ppp_make) {
      check(`${w} answer cost`, all.values.cost.value, await ac.getAttribute("data-value"));
      check(`${w} answer cost tone`, all.tones.cost ?? "", await ac.getAttribute("data-tone"));
    }
    const toned = zoneCells.filter(c => c.tones.dreb_cost).sort((a, b) => Math.abs(b.values.dreb_cost.value) - Math.abs(a.values.dreb_cost.value));
    check(`${w} answer rebound zone`, toned[0]?.zone ?? "", await page.locator("[data-field=answer-rebound]").getAttribute("data-zone"));

    // Charts of the view: every bar's value, interval, tone and label.
    for (const key of VIEW_CHARTS[s.view]) {
      const chart = page.locator(`[data-chart=${key}]`);
      for (const z of SHOT_ZONES) {
        const e = cells[z].values[key];
        const col = chart.locator(`.sa-col[data-zone=${z}]`);
        check(`${w} chart ${key} ${z} value`, e?.value ?? "", await col.getAttribute("data-value"));
        check(`${w} chart ${key} ${z} low`, e?.low ?? "", await col.getAttribute("data-low"));
        check(`${w} chart ${key} ${z} high`, e?.high ?? "", await col.getAttribute("data-high"));
        check(`${w} chart ${key} ${z} tone`, COST.has(key) ? toneOf(cells[z].tones[key]) : "", await col.getAttribute("data-tone"));
        const label = chart.locator(`.sa-label[data-zone=${z}] [data-field=chart-value]`);
        check(`${w} chart ${key} ${z} text`, e ? (COST.has(key) ? signed(e.value) : fixed(e.value)) : "—", await label.innerText());
      }
    }

    // Zone tables, every phone view.
    const tables = { rates: [["shots", ["attempts", "fg_pct"]], ["points", ["made", "cost"]]], net: [["scoring", ["made", "second"]], ["net", ["cost", "net"]]], opponent: [["make", ["ppp_make", "make_possessions"]], ["dreb", ["ppp_dreb", "dreb_possessions"]]] };
    const titles = { rates: "Make rates and opponent scoring", net: "Net value across all attempts", opponent: "Opponent scoring after each shot result" };
    for (const [name, views] of Object.entries(tables)) {
      for (const [i, [view, fields]] of views.entries()) {
        if (width === 390) await page.getByRole("radiogroup", { name: `${titles[name]} columns` }).getByRole("radio").nth(i).click();
        if (width === 390) await page.waitForTimeout(150);
        for (const z of ZONES) {
          for (const field of fields) {
            const td = page.locator(`table[data-table=${name}] tr[data-zone=${z}] td[data-field=${field}]`);
            if (field.endsWith("possessions") || field === "attempts") {
              check(`${w} ${name} ${z} ${field}`, cells[z].counts[field], await td.getAttribute("data-value"));
              check(`${w} ${name} ${z} ${field} text`, cells[z].counts[field].toLocaleString("en-US"), (await td.innerText()).trim());
              continue;
            }
            const e = cells[z].values[field];
            check(`${w} ${name} ${z} ${field}`, e?.value ?? "", await td.getAttribute("data-value"));
            check(`${w} ${name} ${z} ${field} tone`, COST.has(field) ? cells[z].tones[field] ?? "" : "", await td.getAttribute("data-tone"));
            const main = (await td.locator(".rs-grid-value").innerText()).trim();
            check(`${w} ${name} ${z} ${field} text`, e ? (field === "fg_pct" ? pct(e.value) : COST.has(field) ? signed(e.value) : fixed(e.value)) : "—", main);
          }
        }
      }
    }

    // League line.
    check(`${w} league ppp`, scope.league.ppp.value, await page.locator("[data-field=league-line]").getAttribute("data-value"));

    // Team table: 30 rows in team order, every value in every phone view.
    const order = await page.locator("table[data-table=teams] tbody tr").evaluateAll(rows => rows.map(r => r.getAttribute("data-team")));
    check(`${w} teams order`, [...board.rows].map(r => r.team_code).sort().join(","), order.join(","));
    const teamViews = width === 390 ? [["shots", ["fg_pct"]], ["scoring", ["own", "net"]], ["cost", ["cost", "dreb_cost"]]] : [["all", ["fg_pct", "own", "net", "cost", "dreb_cost"]]];
    for (const [i, [, fields]] of teamViews.entries()) {
      if (width === 390) { await page.getByRole("radiogroup", { name: "Team columns" }).getByRole("radio").nth(i).click(); await page.waitForTimeout(150); }
      for (const row of board.rows) {
        for (const field of fields) {
          const td = page.locator(`table[data-table=teams] tr[data-team=${row.team_code}] td[data-field=${field}]`);
          check(`${w} team ${row.team_code} ${field}`, row.values[field]?.value ?? "", await td.getAttribute("data-value"));
          check(`${w} team ${row.team_code} ${field} tone`, COST.has(field) ? row.tones[field] ?? "" : "", await td.getAttribute("data-tone"));
        }
        check(`${w} team ${row.team_code} status`, row.status, await page.locator(`table[data-table=teams] tr[data-team=${row.team_code}]`).getAttribute("data-status"));
      }
    }
    const coloured = board.rows.filter(r => r.tones.cost).length + board.rows.filter(r => r.tones.dreb_cost).length;
    check(`${w} chance coloured`, coloured, await page.locator("[data-field=chance-line]").getAttribute("data-coloured"));

    // Honesty lines, the count comparison and About.
    check(`${w} position correct`, summary.position_accuracy.group_correct, await page.locator("[data-field=position-line]").getAttribute("data-correct"));
    const cmp = summary.seasons.find(x => x.databallr_comparison)?.databallr_comparison;
    await page.locator("#counts > summary").click();
    for (const z of ZONES) for (const field of ["courtlens", "databallr", "difference"]) {
      check(`${w} counts ${z} ${field}`, cmp[z][field], await page.locator(`table[data-table=counts] tr[data-row=${z}] td[data-field=${field}]`).getAttribute("data-value"));
    }
    await page.locator("#about summary").first().click();
    const season = summary.seasons.find(x => x.season === s.season);
    check(`${w} about shots`, season.data_check.shots, await page.locator("[data-field=about-matching]").getAttribute("data-shots"));
    check(`${w} about joined`, season.data_check.joined, await page.locator("[data-field=about-matching]").getAttribute("data-joined"));
    check(`${w} about results hash`, summary.results_sha256, await page.locator("[data-field=results-hash]").innerText());
    check(`${w} about registration hash`, summary.registration.content_sha256, await page.locator("[data-field=registration-hash]").innerText());
    await page.locator("#about summary").first().click();
    await page.locator("#counts > summary").click();

    const facts = await page.evaluate(() => {
      const text = document.querySelector("main").innerText;
      return {
        height: document.documentElement.scrollHeight,
        overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        sideways: [...document.querySelectorAll(".stats-scroll-region")].filter(r => r.scrollWidth > r.clientWidth + 1).map(r => r.getAttribute("aria-label")),
        brokenImages: [...document.images].filter(i => i.complete && i.naturalWidth === 0).map(i => i.src),
        teamLogos: [...document.querySelectorAll("table[data-table=teams] img")].map(i => i.complete && i.naturalWidth > 0),
        nativeSelects: document.querySelectorAll("main select").length,
        hashes: [...new Set(text.match(/\b[0-9a-f]{16,}\b/g) ?? [])],
        codes: [...new Set(text.match(/courtlens-[a-z0-9-]+-v\d|courtload[\w-]*|\bR17\b|\bRD18\b/g) ?? [])],
      };
    });
    report.pages.push({ tag, consoleErrors: errors, ...facts, teamLogos: { count: facts.teamLogos.length, loaded: facts.teamLogos.filter(Boolean).length } });
    if (s === SCOPES[0] || width === 390) await page.screenshot({ path: `${shots}/sa-r1-${tag}.png`, fullPage: true });
    await page.close();
  }
}
await browser.close();
writeFileSync(out, JSON.stringify(report, null, 1));
console.log(JSON.stringify({ checked: report.checked, mismatches: report.mismatches.length, first: report.mismatches.slice(0, 8),
  pages: report.pages.map(p => ({ tag: p.tag, errors: p.consoleErrors.length, overflow: p.overflow, sideways: p.sideways, broken: p.brokenImages.length, logos: p.teamLogos, selects: p.nativeSelects, hashes: p.hashes, codes: p.codes, height: p.height })) }, null, 1));
