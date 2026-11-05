// R06 browser check: every number the two pages draw against the API that served it, at 1440 and 390.
// Copy into a sandbox dashboard and run with node, against a build on :3180 and an API on :4180.
import { chromium } from "@playwright/test";
import { writeFileSync, mkdirSync } from "node:fs";

const BASE = "http://localhost:3180"; const API = "http://localhost:4180/api";
const OUT = process.env.R06_OUT ?? "r06-evidence"; mkdirSync(OUT, { recursive: true });
const api = async p => (await fetch(API + p)).json();
const report = { values: 0, mismatches: [], console_errors: [], overflow: {}, pages: {} };
const same = (label, got, want) => {
  report.values += 1;
  const missing = want === null || want === undefined || want === "";
  const ok = missing ? got === "" || got === null : Number(got) === Number(want);
  if (!ok) report.mismatches.push({ label, got, want });
};
const browser = await chromium.launch({ executablePath: "/usr/bin/chromium" });
async function open(width, url, ready) {
  const page = await browser.newPage({ viewport: { width, height: width > 500 ? 900 : 844 } });
  page.on("console", m => { if (m.type() === "error") report.console_errors.push(`${url}: ${m.text()}`); });
  await page.goto(BASE + url, { waitUntil: "domcontentloaded" });
  await page.locator(ready).first().waitFor({ timeout: 90000 });
  report.overflow[`${width} ${url}`] = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  return page;
}
const read = (page, sel) => page.locator(sel).evaluateAll(list => list.map(n => ({
  row: n.closest("[data-row],[data-card],[data-season]")?.getAttribute("data-row") ?? n.closest("[data-card]")?.getAttribute("data-card") ?? n.closest("[data-season]")?.getAttribute("data-season"),
  field: n.getAttribute("data-field"), value: n.getAttribute("data-value"), low: n.getAttribute("data-low"), high: n.getAttribute("data-high"),
})));

for (const width of [1440, 390]) {
  for (const [season, side] of [["2025-26", "offense"], ["2025-26", "defense"], ["2025-26", "combined"], ["2022-23", "offense"]]) {
    const board = await api(`/shot-quality/decomposition/players?season=${season}&side=${side}`);
    const url = `/research/shot-quality?tab=decomposition&side=${side}&dSeason=${season}`;
    const page = await open(width, url, "[data-board='decomposition'] [data-row]");
    const cells = await read(page, "[data-board='decomposition'] [data-field]");
    const byRow = new Map(board.rows.map(r => [r.player_id, r]));
    const order = await page.locator("[data-board='decomposition'] [data-row]").evaluateAll(l => l.map(n => n.getAttribute("data-row")));
    if (JSON.stringify(order) !== JSON.stringify(board.rows.map(r => r.player_id))) report.mismatches.push({ label: `${url} order` });
    if (cells.length !== board.rows.length * 5) report.mismatches.push({ label: `${url} cell count`, got: cells.length });
    for (const c of cells) {
      const r = byRow.get(c.row);
      if (c.field === "shots") { same(`${url} ${c.row} shots`, c.value, r.shots); continue; }
      same(`${url} ${c.row} ${c.field}`, c.value, r.values[c.field]);
      same(`${url} ${c.row} ${c.field} low`, c.low, r.intervals[c.field][0]);
      same(`${url} ${c.row} ${c.field} high`, c.high, r.intervals[c.field][1]);
    }
    if (season === "2025-26" && side !== "combined" || side === "combined") {
      if (season === "2025-26") await page.screenshot({ path: `${OUT}/decomposition-${side}-${width}.png` });
      if (season === "2025-26" && side === "offense") {
        await page.locator("[data-verdict]").scrollIntoViewIfNeeded();
        await page.waitForTimeout(500);
        await page.screenshot({ path: `${OUT}/decomposition-checks-${width}.png` });
      }
    }
    if (side === "offense" && season === "2025-26") {
      const s = await api("/shot-quality/decomposition");
      for (const [key, c] of Object.entries(s.persistence.correlations)) {
        const row = page.locator(`[data-table='persistence'] [data-row='${key}'] [data-value]`);
        if (await row.count()) {
          same(`persistence ${key} r`, await row.nth(0).getAttribute("data-value"), c.r);
          same(`persistence ${key} low`, await row.nth(1).getAttribute("data-value"), c.interval[0]);
          same(`persistence ${key} high`, await row.nth(1).getAttribute("data-high"), c.interval[1]);
        }
      }
      for (const [season2, b] of Object.entries(s.seasons)) {
        const vals = await page.locator(`[data-table='additivity'] [data-season='${season2}'] [data-value]`).evaluateAll(l => l.map(n => n.getAttribute("data-value")));
        const w = b.median_interval_width.offense; const st = b.second_stage.offense;
        [b.coefficient_additivity_residual.offense, st.coefficients[0], st.r2, st.players, w.ts, w.sq, w.make, w.ft].forEach((x, i) => same(`additivity ${season2} ${i}`, vals[i], x));
        const d = s.data[season2];
        const dv = await page.locator(`[data-table='data'] [data-season='${season2}'] [data-value]`).evaluateAll(l => l.map(n => n.getAttribute("data-value")));
        [d.r05_shots.joined, d.r05_shots.join_rate, d.r05_shots.unjoined.game_not_admitted ?? 0, d.free_throws.joined, Object.keys(d.free_throws.unknown_sub_types).length, d.possessions.counted_possessions_without_attempt].forEach((x, i) => same(`data ${season2} ${i}`, dv[i], x));
      }
    }
    await page.close();
  }
  for (const [season, kind] of [["2025-26", "all"], ["2025-26", "3pt"], ["2019-20", "all"]]) {
    const board = await api(`/defensive-shot-quality/cards?season=${season}&kind=${kind}`);
    const url = `/research/defensive-matchups?season=${season}&kind=${kind}`;
    const page = await open(width, url, "[data-card]");
    if (season === "2025-26" && kind === "all") {
      await page.locator("[data-card]").first().scrollIntoViewIfNeeded();
      await page.waitForTimeout(1500);
      await page.screenshot({ path: `${OUT}/defensive-${width}.png` });
      await page.screenshot({ path: `${OUT}/defensive-${width}-full.png`, fullPage: true });
    }
    for (let i = 0; i < 80; i += 1) {
      const more = page.getByRole("button", { name: /Show next/ });
      if (!(await more.count())) break;
      await more.click();
    }
    const ids = await page.locator("[data-card]").evaluateAll(l => l.map(n => n.getAttribute("data-card")));
    if (JSON.stringify(ids) !== JSON.stringify(board.rows.map(r => r.player_id))) report.mismatches.push({ label: `${url} card order` });
    const data = await page.locator("[data-card]").evaluateAll(cards => cards.map(card => ({
      id: card.getAttribute("data-card"),
      stats: Object.fromEntries([...card.querySelectorAll("[data-stat]")].map(row => [row.getAttribute("data-stat"), [...row.querySelectorAll("[data-value]")].map(n => [n.getAttribute("data-value"), n.getAttribute("data-low"), n.getAttribute("data-high")])])),
      matchups: [...card.querySelectorAll("[data-matchup]")].map(row => [row.getAttribute("data-matchup"), ...[...row.querySelectorAll("[data-value]")].map(n => n.getAttribute("data-value"))]),
    })));
    data.forEach((c, i) => {
      const r = board.rows[i]; const L = `${url} ${c.id}`;
      same(`${L} rapm`, c.stats.rapm[0][0], r.rapm.value); same(`${L} rapm low`, c.stats.rapm[0][1], r.rapm.interval?.[0]); same(`${L} rapm high`, c.stats.rapm[0][2], r.rapm.interval?.[1]);
      same(`${L} dsq`, c.stats.dsq[0][0], r.value.dsq); same(`${L} dsq low`, c.stats.dsq[0][1], r.value.interval?.[0]); same(`${L} dsq high`, c.stats.dsq[0][2], r.value.interval?.[1]);
      same(`${L} dsq rank`, c.stats.dsq[1][0], r.rank?.dsq);
      for (const m of ["fga", "xpps", "pps"]) { same(`${L} ${m}`, c.stats[m][0][0], r.value[m]); same(`${L} ${m} rank`, c.stats[m][1][0], r.rank?.[m]); }
      r.key_matchups.forEach((m, j) => {
        const got = c.matchups[j];
        if (got[0] !== m.player_id) report.mismatches.push({ label: `${L} matchup ${j}` });
        same(`${L} m${j} fga`, got[1], m.fga); same(`${L} m${j} xpps`, got[2], m.xpps); same(`${L} m${j} pps`, got[3], m.pps);
      });
    });
    report.pages[`${width} ${url}`] = data.length;
    if (kind === "all" && season === "2025-26") {
      const s = await api("/defensive-shot-quality");
      const rows = { "persistence-dsq": s.persistence.correlations.dsq, "persistence-pps": s.persistence.correlations.pps, "persistence-xpps": s.persistence.correlations.xpps, "agreement-make": s.agreement_with_rapm.correlations.make, "agreement-sq": s.agreement_with_rapm.correlations.sq, "agreement-ts": s.agreement_with_rapm.correlations.ts };
      for (const [key, c] of Object.entries(rows)) {
        const cells2 = page.locator(`[data-table='checks'] [data-row='${key}'] [data-value]`);
        same(`check ${key} r`, await cells2.nth(0).getAttribute("data-value"), c.r);
        same(`check ${key} low`, await cells2.nth(1).getAttribute("data-value"), c.interval[0]);
        same(`check ${key} high`, await cells2.nth(1).getAttribute("data-high"), c.interval[1]);
      }
      for (const [s2, b] of Object.entries(s.seasons)) {
        const vals = await page.locator(`[data-table='seasons'] [data-season='${s2}'] [data-value]`).evaluateAll(l => l.map(n => n.getAttribute("data-value")));
        [b.games, b.defenders_served, b.interval_excludes_zero, b.interval_excludes_zero_share, b.median_interval_width, b.league.all.pps, b.league.all.xpps].forEach((x, i) => same(`season ${s2} ${i}`, vals[i], x));
      }
    }
    await page.close();
  }
}
await browser.close();
writeFileSync(`${OUT}/dom-checks.json`, JSON.stringify(report, null, 1) + "\n");
console.log(JSON.stringify({ values: report.values, mismatches: report.mismatches.length, first: report.mismatches.slice(0, 5), console: report.console_errors.slice(0, 5), overflow: report.overflow }, null, 1));
