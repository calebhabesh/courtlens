// R09 browser check: every value /draft draws equals the API's, at 1440 and 390, on real data.
// Usage (inside a dashboard copy with @playwright/test): node browser-check.mjs <api> <site> <out.json>
import { chromium } from "@playwright/test";
import { writeFileSync } from "node:fs";

const [api, site, out] = process.argv.slice(2);
const get = async path => (await fetch(`${api}/api/draft${path}`)).json();
const summary = await get(""), rookies = await get("/rookies"), combine = await get("/combine");
const STATS = ["mpg", "pts36", "reb36", "ast36", "stl36", "blk36", "tov36", "ts"];
const report = { widths: {}, mismatches: [], console_errors: [] };

function cmp(width, where, got, want) {
  const w = want === null || want === undefined ? "" : String(want);
  report.widths[width].values += 1;
  if (got !== w && !(w !== "" && Number(got) === Number(w))) report.mismatches.push({ width, where, got, want: w });
}

async function attr(locator, name) { return (await locator.getAttribute(name)) ?? null; }

async function open(page, path) {
  await page.goto(`${site}${path}`, { waitUntil: "networkidle" });
  await page.waitForTimeout(150);
}

async function checkWidth(browser, width) {
  report.widths[width] = { values: 0, pages: 0, overflow_px: 0 };
  const page = await browser.newPage({ viewport: { width, height: 900 } });
  page.on("console", m => { if (m.type() === "error") report.console_errors.push(`${width} ${m.text()}`); });
  const visit = async path => {
    await open(page, path);
    report.widths[width].pages += 1;
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    report.widths[width].overflow_px = Math.max(report.widths[width].overflow_px, overflow);
  };

  // Rookies
  await visit("/draft");
  const rows = await page.locator('table[data-table="rookies"] tbody tr').all();
  cmp(width, "rookie rows", String(rows.length), rookies.rookies.length);
  for (const r of rookies.rookies) {
    const row = page.locator(`table[data-table="rookies"] tr[data-pick="${r.pick}"]`);
    cmp(width, `rookie ${r.pick} pool`, await attr(row.locator('[data-field="pool"]'), "data-value"), r.pool);
    cmp(width, `rookie ${r.pick} darko`, await attr(row.locator('[data-field="darko"]'), "data-value"), r.darko?.dpm);
    cmp(width, `rookie ${r.pick} rapm`, await attr(row.locator('[data-field="rapm"]'), "data-value"), r.rapm?.rapm);
    if (r.state !== "compared") { cmp(width, `rookie ${r.pick} state`, await attr(row.locator('[data-field="state"]'), "data-value"), "no_games"); continue; }
    cmp(width, `rookie ${r.pick} games`, await attr(row.locator('[data-field="games"]'), "data-value"), r.comparison.line.games);
    for (const s of STATS) {
      const cell = row.locator(`[data-field="${s}"]`);
      cmp(width, `rookie ${r.pick} ${s}`, await attr(cell, "data-value"), r.comparison.stats[s].value);
      cmp(width, `rookie ${r.pick} ${s} percentile`, await attr(cell, "data-percentile"), r.comparison.stats[s].percentile);
    }
  }
  const compared = rookies.rookies.filter(r => r.state === "compared");
  for (const r of width === 1440 ? compared : compared.slice(0, 3)) {
    const detail = await get(`/rookies/${r.player_id}`);
    await visit(`/draft?rookie=${r.player_id}`);
    const table = page.locator('table[data-table="rookie-comparisons"]');
    cmp(width, `detail ${r.pick} rows`, String(await table.locator("tbody tr").count()), detail.comparisons.length + 1);
    for (const c of detail.comparisons) {
      const row = table.locator(`tr[data-row="${c.player_id}"]`);
      cmp(width, `detail ${r.pick} ${c.player_id} games`, await attr(row.locator('[data-field="games"]'), "data-value"), c.games);
      for (const s of STATS) cmp(width, `detail ${r.pick} ${c.player_id} ${s}`, await attr(row.locator(`[data-field="${s}"]`), "data-value"), c[s]);
    }
  }

  // Value by pick, every view
  const views = [];
  for (const era of ["all", "multi_round", "two_round"]) for (const m of ["ws", "min"]) views.push(["window", era, m], ["career", era, m]);
  views.push(["rapm", "all", "ws"]);
  for (const [span, era, m] of views) {
    const q = new URLSearchParams({ tab: "value" });
    if (span !== "window") q.set("span", span);
    if (era !== "all") q.set("era", era);
    if (m !== "ws") q.set("measure", m);
    await visit(`/draft?${q}`);
    const want = span === "rapm" ? summary.value_by_pick.rapm : summary.value_by_pick[span][era][m];
    for (const w of want) {
      const row = page.locator(`table[data-table="value-by-pick"] tr[data-row="${w.slot}"]`);
      const mean = row.locator('[data-field="mean"]');
      cmp(width, `${span}/${era}/${m} ${w.slot} mean`, await attr(mean, "data-value"), w.mean);
      cmp(width, `${span}/${era}/${m} ${w.slot} lo`, await attr(mean, "data-low"), w.lo);
      cmp(width, `${span}/${era}/${m} ${w.slot} hi`, await attr(mean, "data-high"), w.hi);
      cmp(width, `${span}/${era}/${m} ${w.slot} n`, await attr(row.locator('[data-field="n"]'), "data-value"), w.n);
      cmp(width, `${span}/${era}/${m} ${w.slot} median`, await attr(row.locator('[data-field="median"]'), "data-value"), w.median);
      if (span !== "rapm") {
        cmp(width, `${span}/${era}/${m} ${w.slot} p90`, await attr(row.locator('[data-field="p90"]'), "data-value"), w.p90);
        cmp(width, `${span}/${era}/${m} ${w.slot} played`, await attr(row.locator('[data-field="played"]'), "data-value"), w.played_share);
      }
      if (w.mean !== null) cmp(width, `${span}/${era}/${m} ${w.slot} point`, await attr(page.locator(`circle[data-slot="${w.slot}"]`), "data-value"), w.mean);
    }
    if (span === "window") for (const b of summary.bands.filter(b => b.era === era && b.measure === m)) {
      const cell = page.locator(`table[data-table="bands"] tr[data-row="${b.band}"] [data-field="diff"]`);
      cmp(width, `band ${era}/${m}/${b.band}`, await attr(cell, "data-value"), b.diff);
      cmp(width, `band ${era}/${m}/${b.band} lo`, await attr(cell, "data-low"), b.lo);
      cmp(width, `band ${era}/${m}/${b.band} hi`, await attr(cell, "data-high"), b.hi);
      cmp(width, `band ${era}/${m}/${b.band} verdict`, await attr(page.locator(`table[data-table="bands"] tr[data-row="${b.band}"] [data-field="verdict"]`), "data-value"), b.verdict);
    }
  }

  // Classes
  const years = width === 1440 ? summary.classes.map(c => c.year) : [1966, 1984, 2003, 2022, 2024, 2026];
  for (const year of years) {
    const body = await get(`/classes/${year}`);
    await visit(`/draft?tab=classes&year=${year}`);
    const table = page.locator('table[data-table="class"]');
    cmp(width, `class ${year} rows`, String(await table.locator("tbody tr").count()), body.rows.length);
    const complete = body.status === "complete";
    const cells = await table.locator("tbody tr").evaluateAll(trs => trs.map(tr => Object.fromEntries(
      [...tr.querySelectorAll("[data-field]")].map(td => [td.getAttribute("data-field"), td.getAttribute("data-value")]))));
    body.rows.forEach((r, i) => {
      const got = cells[i] ?? {};
      cmp(width, `class ${year} ${r.pick} pick`, got.pick, r.pick);
      cmp(width, `class ${year} ${r.pick} team`, got.team ?? "", r.team);
      cmp(width, `class ${year} ${r.pick} ws`, got.window_ws, complete ? r.window_ws : r.career_ws);
      cmp(width, `class ${year} ${r.pick} min`, got.window_min, complete ? r.window_min : r.career_min);
      if (complete) {
        cmp(width, `class ${year} ${r.pick} career`, got.career_ws, r.career_ws);
        cmp(width, `class ${year} ${r.pick} expected`, got.expected, r.expected_window_ws);
        cmp(width, `class ${year} ${r.pick} surplus`, got.surplus, r.surplus_window_ws);
        cmp(width, `class ${year} ${r.pick} redraft`, got.rank, r.redraft_window);
      }
      if (year >= 2014 && year <= 2022) cmp(width, `class ${year} ${r.pick} rapm`, got.rapm, r.window_rapm);
    });
  }

  // Steals, misses, combine
  await visit("/draft?tab=steals");
  for (const [name, list] of [["steals", summary.steals], ["misses", summary.misses]]) for (const s of list) {
    const row = page.locator(`table[data-table="${name}"] tr[data-row="${s.year}-${s.pick}"]`);
    cmp(width, `${name} ${s.year}-${s.pick} ws`, await attr(row.locator('[data-field="window_ws"]'), "data-value"), s.window_ws);
    cmp(width, `${name} ${s.year}-${s.pick} expected`, await attr(row.locator('[data-field="expected"]'), "data-value"), s.expected_window_ws);
    cmp(width, `${name} ${s.year}-${s.pick} surplus`, await attr(row.locator('[data-field="surplus"]'), "data-value"), s.surplus_window_ws);
  }
  for (const measure of Object.keys({ height: 1, wingspan: 1, wingspan_minus_height: 1, standing_reach: 1, weight: 1, max_vertical: 1, lane_agility: 1, sprint: 1 })) {
    await visit(`/draft?tab=combine${measure === "wingspan" ? "" : `&measure=${measure}`}`);
    for (const c of combine.correlations.filter(c => c.measure === measure)) {
      const field = c.outcome === "window_ws" ? "r_ws" : "r_min";
      const cell = page.locator(`table[data-table="combine-correlations"] tr[data-row="${measure}"] [data-field="${field}"]`);
      cmp(width, `combine ${measure} ${field}`, await attr(cell, "data-value"), c.r);
      cmp(width, `combine ${measure} ${field} lo`, await attr(cell, "data-low"), c.lo);
      cmp(width, `combine ${measure} ${field} hi`, await attr(cell, "data-high"), c.hi);
    }
    const want = combine.rows.filter(r => r[measure] !== null && r.window_ws !== null);
    const got = await page.locator("circle[data-player]").evaluateAll(cs => cs.map(c => [c.getAttribute("data-player"), c.getAttribute("data-x"), c.getAttribute("data-value")]));
    cmp(width, `combine ${measure} points`, String(got.length), want.length);
    want.forEach((r, i) => {
      cmp(width, `combine ${measure} ${r.player_id} x`, got[i]?.[1] ?? null, r[measure]);
      cmp(width, `combine ${measure} ${r.player_id} y`, got[i]?.[2] ?? null, r.window_ws);
    });
  }
  cmp(width, "results hash", await attr(page.locator('[data-field="results-sha"]'), "data-value"), summary.registration.results_sha256);
  await page.close();
}

const browser = await chromium.launch();
for (const width of [1440, 390]) await checkWidth(browser, width);
await browser.close();
report.results_sha256 = summary.registration.results_sha256;
report.comparison_date = rookies.comparison_date;
report.mismatch_count = report.mismatches.length;
report.mismatches = report.mismatches.slice(0, 50);
writeFileSync(out, JSON.stringify(report, null, 1) + "\n");
console.log(JSON.stringify({ widths: report.widths, mismatches: report.mismatch_count, console_errors: report.console_errors.length }));
