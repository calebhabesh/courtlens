// R08 browser check: every number the Metric Backtest page shows equals the API's, at 1440 and 390.
// Run from inside a dashboard copy (it imports @playwright/test):
//   API=http://localhost:4180 WEB=http://localhost:3180 OUT=<dir> node browser-check.mjs
import { chromium } from "@playwright/test";
import { writeFileSync } from "node:fs";

const API = process.env.API ?? "http://localhost:4180";
const WEB = process.env.WEB ?? "http://localhost:3180";
const OUT = process.env.OUT ?? ".";
const body = await (await fetch(`${API}/api/metric-backtest`)).json();
const R = body.results;
const names = R.registration.parameters.candidates;
const seasons = R.registration.parameters.test_seasons;
const SCORES = ["rmse", "accuracy", "brier", "log_loss"];

function pairOf(a, b) {
  const p = R.pairs.find(x => (x.candidate === a && x.reference === b) || (x.candidate === b && x.reference === a));
  if (!p || p.candidate === a) return p;
  const flip = g => ({ gain: -g.gain, low: -g.high, high: -g.low });
  const flipRow = row => Object.fromEntries(SCORES.map(s => [s, flip(row[s])]));
  const v = { candidate_better: "reference_better", reference_better: "candidate_better", no_ranking: "no_ranking" }[p.verdict];
  return { ...p, pooled: flipRow(p.pooled), per_season: Object.fromEntries(Object.entries(p.per_season).map(([s, r]) => [s, flipRow(r)])), verdict: v,
    seasons_candidate_lower_rmse: p.seasons.filter(s => p.per_season[s].rmse.gain < 0).length };
}

const report = { api_results_sha256: R.results_sha256, widths: {} };
const browser = await chromium.launch({ executablePath: "/usr/bin/chromium" });
for (const width of [1440, 390]) {
  const page = await browser.newPage({ viewport: { width, height: width === 1440 ? 900 : 844 } });
  const errors = [];
  page.on("console", m => { if (m.type() === "error") errors.push(m.text()); });
  page.on("pageerror", e => errors.push(String(e)));
  let checked = 0; const mismatches = [];
  const same = (label, got, want) => { checked++; if (Number(got) !== want && !(got === "" && want === undefined)) mismatches.push({ label, got, want }); };
  const open = async query => {
    await page.goto(`${WEB}/research/backtest${query}`, { waitUntil: "networkidle" });
    await page.getByRole("table", { name: "Pooled scores" }).waitFor();
  };

  await open("");
  // Pooled table.
  for (const n of names) for (const f of SCORES) same(`pooled ${n} ${f}`, await page.locator(`[data-table="pooled"] tr[data-row="${n}"] [data-field="${f}"]`).getAttribute("data-value"), R.candidates[n].pooled[f]);
  for (const n of names) {
    same(`pooled ${n} games`, await page.locator(`[data-table="pooled"] tr[data-row="${n}"] [data-field="games"]`).getAttribute("data-value"), R.candidates[n].pooled.games);
    same(`pooled ${n} ece`, await page.locator(`[data-table="pooled"] tr[data-row="${n}"] [data-field="ece"]`).getAttribute("data-value"), R.candidates[n].calibration_curve.ece);
    const rmse = page.locator(`[data-table="pooled"] tr[data-row="${n}"] [data-field="rmse"]`);
    same(`pooled ${n} low`, await rmse.getAttribute("data-low"), R.candidates[n].pooled.intervals.rmse.low);
    same(`pooled ${n} high`, await rmse.getAttribute("data-high"), R.candidates[n].pooled.intervals.rmse.high);
  }
  // By-season table.
  for (const n of names) for (const s of seasons) {
    const cell = page.locator(`[data-table="by-season"] tr[data-row="${n}"] [data-season="${s}"]`);
    const row = R.candidates[n].seasons[s];
    same(`season ${n} ${s}`, await cell.getAttribute("data-value"), row?.rmse);
    if (row) { same(`season ${n} ${s} low`, await cell.getAttribute("data-low"), row.intervals.rmse.low); same(`season ${n} ${s} high`, await cell.getAttribute("data-high"), row.intervals.rmse.high); }
  }
  // Verdict text.
  const verdict = await page.locator('[data-field="verdict-summary"]').innerText();
  for (const b of R.verdict.best) if (!verdict.includes(body.metrics[b].label)) mismatches.push({ label: "verdict best", got: verdict, want: b });
  checked++;
  // 2026-27.
  const summary = body.prospective.summary;
  same("prospective games", await page.locator('[data-field="prospective-games"]').getAttribute("data-value"), summary.prospective.games);
  for (const [label, group] of [["prospective", summary.prospective], ["hindsight", summary.hindsight]]) {
    if (!group.candidates) continue;
    for (const n of names) for (const f of ["rmse", "accuracy", "brier"]) same(`${label} ${n} ${f}`, await page.locator(`[data-table="season-2026-27-${label}"] tr[data-row="${n}"] [data-field="${f}"]`).getAttribute("data-value"), group.candidates[n][f]);
  }
  // Results hash.
  if ((await page.locator('[data-field="results-sha"]').getAttribute("data-value")) !== R.results_sha256) mismatches.push({ label: "results hash" });
  checked++;
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  await page.screenshot({ path: `${OUT}/backtest-${width}.png` });
  await page.screenshot({ path: `${OUT}/backtest-${width}-full.png`, fullPage: true });

  // Chart, every metric shown.
  await open(`?show=${names.join(",")}`);
  const points = await page.locator("circle[data-candidate]").all();
  for (const p of points) {
    const n = await p.getAttribute("data-candidate"), s = await p.getAttribute("data-season");
    same(`chart ${n} ${s}`, await p.getAttribute("data-value"), R.candidates[n].seasons[s].rmse);
    same(`chart ${n} ${s} low`, await p.getAttribute("data-low"), R.candidates[n].seasons[s].intervals.rmse.low);
  }
  const expectedPoints = names.reduce((sum, n) => sum + R.candidates[n].test_seasons.length, 0);
  if (points.length !== expectedPoints) mismatches.push({ label: "chart points", got: points.length, want: expectedPoints });
  if (width === 1440) await page.locator("figure.chart-frame").screenshot({ path: `${OUT}/backtest-chart-all-1440.png` });

  // Paired differences: every reference, pooled; and every season against the baseline.
  const views = [...names.map(ref => [ref, "pooled"]), ...seasons.map(s => [R.registration.parameters.baseline, s])];
  for (const [ref, season] of views) {
    await open(`?against=${ref}${season === "pooled" ? "" : `&pairSeason=${season}`}`);
    for (const n of names) {
      if (n === ref) continue;
      const p = pairOf(n, ref);
      const row = page.locator(`[data-table="pairs"] tr[data-row="${n}"]`);
      if (season !== "pooled" && !p.seasons.includes(season)) { if (await row.count()) mismatches.push({ label: `pair row ${n} ${ref} ${season} should be absent` }); checked++; continue; }
      const gains = season === "pooled" ? p.pooled : p.per_season[season];
      for (const f of SCORES) {
        const cell = row.locator(`[data-field="${f}"]`);
        same(`pair ${n}/${ref} ${season} ${f}`, await cell.getAttribute("data-value"), gains[f].gain);
        same(`pair ${n}/${ref} ${season} ${f} low`, await cell.getAttribute("data-low"), gains[f].low);
        same(`pair ${n}/${ref} ${season} ${f} high`, await cell.getAttribute("data-high"), gains[f].high);
        const tone = await cell.getAttribute("data-tone");
        const want = gains[f].low > 0 ? "positive" : gains[f].high < 0 ? "negative" : null;
        checked++; if (tone !== want) mismatches.push({ label: `tone ${n}/${ref} ${season} ${f}`, got: tone, want });
      }
      checked++; if ((await row.locator('[data-field="verdict"]').getAttribute("data-value")) !== p.verdict) mismatches.push({ label: `verdict ${n}/${ref}` });
      same(`lower ${n}/${ref}`, await row.locator('[data-field="lower"]').getAttribute("data-value"), p.seasons_candidate_lower_rmse);
    }
  }
  report.widths[width] = { values_checked: checked, mismatches, console_errors: errors, horizontal_overflow_px: overflow };
  await page.close();
}
await browser.close();
writeFileSync(`${OUT}/dom-checks.json`, JSON.stringify(report, null, 1) + "\n");
console.log(JSON.stringify(Object.fromEntries(Object.entries(report.widths).map(([w, r]) => [w, { checked: r.values_checked, mismatches: r.mismatches.length, errors: r.console_errors.length, overflow: r.horizontal_overflow_px }]))));
