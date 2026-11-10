// R14 browser check: every number the Lineup Model page shows equals the API's, at 1440 and 390.
// Run from inside a dashboard copy (it imports @playwright/test):
//   API=http://localhost:4180 WEB=http://localhost:3180 OUT=<dir> node browser-check.mjs
import { chromium } from "@playwright/test";
import { writeFileSync } from "node:fs";

const API = process.env.API ?? "http://localhost:4180";
const WEB = process.env.WEB ?? "http://localhost:3180";
const OUT = process.env.OUT ?? ".";
const get = async path => (await fetch(`${API}${path}`)).json();
const body = await get("/api/lineup-model");
const roster = await get("/api/lineup-model/players");
const R = body.results;
const seasons = R.test_seasons;
const byId = new Map(roster.players.map(p => [p.player_id, p]));
const onMap = new Set(body.map.points.map(p => p.player_id));
// Fives checked: the default and two more, each changing players by a fixed rule (the most-used
// own players in the window that are not already in the five).
const fives = [body.serving.default_five];
const spare = roster.players.filter(p => p.status === "own" && !body.serving.default_five.includes(p.player_id)).map(p => p.player_id);
fives.push([...body.serving.default_five.slice(0, 4), spare[0]]);
fives.push([spare[1], spare[2], spare[3], spare[4], spare[5]]);
const fallbackPlayer = roster.players.find(p => p.status === "box");
if (fallbackPlayer) fives.push([...body.serving.default_five.slice(0, 4), fallbackPlayer.player_id]);
const fits = await Promise.all(fives.map(f => get(`/api/lineup-model/fit?players=${f.join(",")}`)));

const report = { api_results_sha256: R.results_sha256, serving_sha256: body.serving.serving_sha256, fives, widths: {} };
const browser = await chromium.launch({ executablePath: "/usr/bin/chromium" });
for (const width of [1440, 390]) {
  const page = await browser.newPage({ viewport: { width, height: width === 1440 ? 900 : 844 } });
  const errors = [];
  page.on("console", m => { if (m.type() === "error") errors.push(m.text()); });
  page.on("pageerror", e => errors.push(String(e)));
  let checked = 0; const mismatches = []; let overflow = 0; let loads = 0;
  const same = (label, got, want) => { checked++; if (Number(got) !== Number(want)) mismatches.push({ label, got, want }); };
  const text = (label, got, want) => { checked++; if (got !== want) mismatches.push({ label, got, want }); };
  const open = async query => {
    await page.goto(`${WEB}/research/lineup-model${query}`, { waitUntil: "networkidle" });
    await page.getByRole("table", { name: "Predicted net rating" }).waitFor();
    loads++;
    overflow = Math.max(overflow, await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth));
  };

  for (const [k, five] of fives.entries()) {
    await open(k === 0 ? "" : `?five=${five.join(",")}`);
    const fit = fits[k];
    const t = page.locator('[data-table="fit"]');
    same(`fit ${k} lineup net`, await t.locator('tr[data-row="lineup_model"] [data-field="net"]').getAttribute("data-value"), fit.lineup_model.net);
    same(`fit ${k} lineup low`, await t.locator('tr[data-row="lineup_model"] [data-field="interval"]').getAttribute("data-low"), fit.lineup_model.low);
    same(`fit ${k} lineup high`, await t.locator('tr[data-row="lineup_model"] [data-field="interval"]').getAttribute("data-high"), fit.lineup_model.high);
    same(`fit ${k} additive`, await t.locator('[data-field="additive"]').getAttribute("data-value"), fit.lineup_model.additive);
    same(`fit ${k} interaction`, await t.locator('[data-field="interaction"]').getAttribute("data-value"), fit.lineup_model.interaction);
    same(`fit ${k} ridge net`, await t.locator('tr[data-row="ridge"] [data-field="net"]').getAttribute("data-value"), fit.ridge.net);
    same(`fit ${k} ridge low`, await t.locator('tr[data-row="ridge"] [data-field="interval"]').getAttribute("data-low"), fit.ridge.low);
    same(`fit ${k} ridge high`, await t.locator('tr[data-row="ridge"] [data-field="interval"]').getAttribute("data-high"), fit.ridge.high);
    for (const p of fit.players) {
      const row = page.locator(`[data-table="five"] tr[data-row="${p.player_id}"]`);
      text(`five ${k} ${p.player_id} status`, await row.locator('[data-field="status"]').getAttribute("data-value"), p.status ?? "");
      same(`five ${k} ${p.player_id} poss`, await row.locator('[data-field="possessions"]').getAttribute("data-value"), p.window_possessions);
      same(`five ${k} ${p.player_id} ridge`, await row.locator('[data-field="ridge_rating"]').getAttribute("data-value"), byId.get(p.player_id).ridge_rating);
      same(`five ${k} ${p.player_id} lineup`, await row.locator('[data-field="lineup_rating"]').getAttribute("data-value"), byId.get(p.player_id).lineup_additive_rating);
      text(`five ${k} ${p.player_id} team`, (await row.locator('[data-field="team"]').getAttribute("data-value")) ?? "", p.tricode ?? "");
      if (p.name) { checked++; if (!(await row.innerText()).includes(p.name)) mismatches.push({ label: `five ${k} name`, want: p.name }); }
    }
    // Highlighted map points are the chosen five.
    const lit = await page.locator('circle[data-player][r="5"]').evaluateAll(cs => cs.map(c => c.getAttribute("data-player")).sort());
    // Only players with their own vector have a map point; a box-fallback player has none.
    text(`map highlight ${k}`, lit.join(","), five.filter(id => onMap.has(id)).sort().join(","));
  }

  // Test table, chart, diagnostics.
  for (const s of seasons) {
    const row = page.locator(`[data-table="test"] tr[data-row="${s}"]`);
    for (const m of ["lineup", "ridge", "home_only"]) {
      const cell = row.locator(`[data-field="${m}"]`);
      same(`test ${s} ${m}`, await cell.getAttribute("data-value"), R.models[m].seasons[s].wrmse);
      same(`test ${s} ${m} low`, await cell.getAttribute("data-low"), R.models[m].seasons[s].low);
      same(`test ${s} ${m} high`, await cell.getAttribute("data-high"), R.models[m].seasons[s].high);
    }
    const g = R.gains.lineup_over_ridge.seasons[s];
    const gc = row.locator('[data-field="gain"]');
    same(`gain ${s}`, await gc.getAttribute("data-value"), g.gain);
    same(`gain ${s} low`, await gc.getAttribute("data-low"), g.low);
    same(`gain ${s} high`, await gc.getAttribute("data-high"), g.high);
    text(`gain ${s} tone`, (await gc.getAttribute("data-tone")) ?? "", g.low > 0 ? "positive" : g.high < 0 ? "negative" : "");
    same(`stints ${s}`, await row.locator('[data-field="stints"]').getAttribute("data-value"), R.diagnostics[s].test_stints);
    same(`games ${s}`, await row.locator('[data-field="games"]').getAttribute("data-value"), R.diagnostics[s].test_games);
    same(`chart ${s}`, await page.locator(`circle[data-season="${s}"]`).getAttribute("data-value"), g.gain);
    const d = page.locator(`[data-table="diagnostics"] tr[data-row="${s}"]`);
    same(`interaction sd ${s}`, await d.locator('[data-field="interaction_sd"]').getAttribute("data-value"), R.diagnostics[s].interaction_sd_per100);
    same(`additive sd ${s}`, await d.locator('[data-field="additive_sd"]').getAttribute("data-value"), R.diagnostics[s].additive_sd_per100);
    same(`correlation ${s}`, await d.locator('[data-field="correlation"]').getAttribute("data-value"), R.diagnostics[s].prediction_correlation_with_ridge);
    same(`all own ${s}`, await d.locator('[data-field="all_own"]').getAttribute("data-value"), R.subsets.all_ten_own[s].lineup);
    same(`any fallback ${s}`, await d.locator('[data-field="any_fallback"]').getAttribute("data-value"), R.subsets.any_fallback[s].lineup);
  }
  for (const m of ["lineup", "ridge", "home_only"]) same(`pooled ${m}`, await page.locator(`[data-table="test"] tr[data-row="pooled"] [data-field="${m}"]`).getAttribute("data-value"), R.models[m].pooled.wrmse);
  same("pooled gain", await page.locator('[data-table="test"] tr[data-row="pooled"] [data-field="gain"]').getAttribute("data-value"), R.gains.lineup_over_ridge.pooled.gain);
  same("chart pooled", await page.locator('circle[data-season="pooled"]').getAttribute("data-value"), R.gains.lineup_over_ridge.pooled.gain);

  // Map: every point.
  const points = await page.locator("circle[data-player]").evaluateAll(cs => cs.map(c => [c.getAttribute("data-player"), c.getAttribute("data-x"), c.getAttribute("data-value")]));
  text("map count", String(points.length), String(body.map.points.length));
  const served = new Map(body.map.points.map(p => [p.player_id, p]));
  for (const [id, x, y] of points) { same(`map ${id} x`, x, served.get(id).x); same(`map ${id} y`, y, served.get(id).y); }
  same("seed stability", await page.locator('[data-field="seed-stability"]').getAttribute("data-value"), body.map.seed_stability.mean_overlap);

  // Backtest.
  const bt = body.backtest;
  for (const [name, c] of Object.entries(bt.candidates)) {
    const row = page.locator(`[data-table="backtest"] tr[data-row="${name}"]`);
    same(`bt ${name} rmse`, await row.locator('[data-field="rmse"]').getAttribute("data-value"), c.pooled.rmse);
    same(`bt ${name} games`, await row.locator('[data-field="games"]').getAttribute("data-value"), c.pooled.games);
    text(`bt ${name} verdict`, (await row.locator('[data-field="verdict"]').getAttribute("data-value")) ?? "", bt.verdict.lineup_model_against[name] ?? "");
    if (name !== "lineup_model") {
      const p = bt.pairs.find(q => (q.candidate === "lineup_model" && q.reference === name) || (q.reference === "lineup_model" && q.candidate === name));
      const g = p.candidate === "lineup_model" ? p.pooled.rmse : { gain: -p.pooled.rmse.gain, low: -p.pooled.rmse.high, high: -p.pooled.rmse.low };
      same(`bt ${name} gain`, await row.locator('[data-field="gain"]').getAttribute("data-value"), g.gain);
      text(`bt ${name} tone`, (await row.locator('[data-field="gain"]').getAttribute("data-tone")) ?? "", g.low > 0 ? "positive" : g.high < 0 ? "negative" : "");
    }
  }

  // Selection grids, coverage, cold start.
  for (const [a, row] of Object.entries(body.selection.ridge_alpha_grid)) same(`alpha ${a}`, await page.locator(`[data-table="alpha-grid"] tr[data-row="${a}"] [data-field="pooled"]`).getAttribute("data-value"), row.pooled);
  for (const [k, row] of Object.entries(body.selection.lineup_grid)) same(`config ${k}`, await page.locator(`[data-table="lineup-grid"] tr[data-row="${k}"] [data-field="pooled"]`).getAttribute("data-value"), row.pooled);
  for (const [s, v] of Object.entries(body.coverage.seasons)) for (const [f, key] of [["games", "games"], ["stints", "stints"], ["usable", "usable_stints"], ["possessions", "usable_possessions"], ["players", "players"]]) {
    same(`coverage ${s} ${f}`, await page.locator(`[data-table="coverage"] tr[data-row="${s}"] [data-field="${f}"]`).getAttribute("data-value"), v[key]);
  }
  for (const [s, v] of Object.entries(body.coverage.cold_start)) {
    const row = page.locator(`[data-table="cold-start"] tr[data-row="${s}"]`);
    same(`cold ${s} own`, await row.locator('[data-field="own"]').getAttribute("data-value"), v.target?.own_embedding ?? v.own_embedding);
    if (v.target) {
      same(`cold ${s} box`, await row.locator('[data-field="box"]').getAttribute("data-value"), v.target.box_fallback);
      same(`cold ${s} new`, await row.locator('[data-field="newcomer"]').getAttribute("data-value"), v.target.newcomer_no_box_in_window);
      same(`cold ${s} share`, await row.locator('[data-field="shares"]').getAttribute("data-value"), v.target.possession_share_own);
    }
  }
  text("results sha", await page.locator('[data-field="results-sha"]').getAttribute("data-value"), R.results_sha256);
  const verdict = await page.locator('[data-field="verdict-summary"]').innerText();
  checked++; if (!verdict.includes("(registered rule)")) mismatches.push({ label: "verdict text", got: verdict });

  await page.screenshot({ path: `${OUT}/lineup-model-${width}.png` });
  await page.screenshot({ path: `${OUT}/lineup-model-${width}-full.png`, fullPage: true });
  report.widths[width] = { checked, mismatches, console_errors: errors, max_overflow_px: overflow, page_loads: loads };
  await page.close();
}
await browser.close();
writeFileSync(`${OUT}/dom-checks.json`, JSON.stringify(report, null, 1) + "\n");
console.log(JSON.stringify(Object.fromEntries(Object.entries(report.widths).map(([w, r]) => [w, { checked: r.checked, mismatches: r.mismatches.length, errors: r.console_errors.length, overflow: r.max_overflow_px, loads: r.page_loads }]))));
