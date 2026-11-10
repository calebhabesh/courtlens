// Real-data check for RD16 (Points Forecasts and its Evaluation Archive tab): every value the page draws against the owner's API through the
// read-only proxy on 4180 (../design-RD10/readonly-proxy.mjs), the production build on 3180, at 1440 and 390. Walks the answer, the miss strip,
// the model grid (both phone views), the coverage strip, the four rules, every slice dimension of both experiments, the ledger (line, totals,
// all 50 rows with photos and logos), About, and the two frozen protocols against their config files. Also colour rules, console errors,
// overflow, broken images, native selects, ISO dates, hyphen-minus numbers and project words in the visible text. Formats and expectations are
// written here independently of dashboard/lib/points-forecasts.ts.
// Usage: node real-check.mjs <report.json> [<shots dir>]
import { chromium } from "/home/ethioking/dev/courtlens/dashboard/node_modules/playwright/index.mjs";
import { readFileSync, writeFileSync } from "node:fs";
const API = "http://127.0.0.1:4180", WEB = "http://localhost:3180";
const [,, out, shots] = process.argv;
const get = async path => (await fetch(`${API}${path}`)).json();
const E = await get("/api/workbench/forecasts/evaluation");
const L = await get("/api/workbench/forecasts?page_size=50");
const A = await get("/api/analytics/evaluations?archive=true");

// Formats, written again.
const f = (v, d) => v.toFixed(d);
const pc = (v, d = 1) => `${(v * 100).toFixed(d)}%`;
const sg = (v, d) => { const t = Math.abs(v).toFixed(d); return Number(t) === 0 ? t : `${v > 0 ? "+" : "−"}${t}`; };
const n = v => Math.round(v).toLocaleString("en-US");
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const day = iso => { const [y, m, d] = iso.slice(0, 10).split("-").map(Number); return `${MONTHS[m - 1]} ${d}, ${y}`; };
const season = iso => { const y = Number(iso.slice(0, 4)), m = Number(iso.slice(5, 7)); const s = m >= 8 ? y : y - 1; return `${s}-${String((s + 1) % 100).padStart(2, "0")}`; };

let checked = 0;
const mismatches = [];
const eq = (where, got, want) => {
  checked += 1;
  const ok = typeof want === "number" ? got !== null && got !== "" && Math.abs(Number(got) - want) <= 1e-9 * Math.max(1, Math.abs(want)) : got === want;
  if (!ok) mismatches.push({ where, got, want });
};
const has = (where, text, want) => { checked += 1; if (!String(text).includes(want)) mismatches.push({ where, got: String(text).slice(0, 240), want }); };

// ---- The frozen protocols against their config files --------------------------------------------------------------------
const yaml = path => readFileSync(`/home/ethioking/dev/courtlens/${path}`, "utf8");
const lib = readFileSync("/home/ethioking/dev/courtlens/dashboard/lib/points-forecasts.ts", "utf8");
for (const [file, block] of [["evaluation/config/baseline-v1.yaml", "ARCHIVE_PROTOCOL"], ["evaluation/config/points-v1.yaml", "POINTS_PROTOCOL"]]) {
  const text = yaml(file);
  const frozen = /frozen_at: "([\d-]+)"/.exec(text)[1];
  const body = lib.slice(lib.indexOf(`export const ${block}`));
  has(`${block} frozen`, body.slice(0, 200), `frozenOn: "${frozen}"`);
  for (const [, start, end] of text.matchAll(/start: "([\d-]+)", end: "([\d-]+)"/g)) has(`${block} split ${start}`, body.slice(0, 1600), `start: "${start}", end: "${end}"`);
}
has("archive target", lib, `target: "${yaml("evaluation/config/baseline-v1.yaml").match(/formula: (.+)/)[1].replace(/\*/g, " ").replace(/\+/g, " + ").replace(/-/g, " − ")}"`);
const pts = yaml("evaluation/config/points-v1.yaml");
for (const [key, want] of [["validation_min_relative_mae_improvement", "validationImprovement"], ["maximum_supported_slice_relative_mae_regression", "sliceRegression"], ["final_min_interval_coverage", "coverage"], ["final_max_interval_width_ratio", "widthRatio"]]) {
  const v = Number(new RegExp(`${key}: ([\\d.]+)`).exec(pts)[1]);
  has(`threshold ${key}`, lib, `${want}: ${v === 1.1 ? "1.1" : v}`);
}

// ---- Page helpers -------------------------------------------------------------------------------------------------------
const report = { checked: 0, mismatches: [], loads: [] };
const browser = await chromium.launch();
async function open(path, width) {
  const page = await browser.newPage({ viewport: { width, height: width < 768 ? 844 : 900 } });
  const errors = [];
  page.on("console", m => { if (m.type() === "error") errors.push(m.text().slice(0, 240)); });
  page.on("pageerror", e => errors.push(String(e).slice(0, 240)));
  await page.goto(`${WEB}${path}`, { waitUntil: "networkidle", timeout: 120000 });
  await page.waitForSelector("#answer", { timeout: 60000 });
  await page.waitForTimeout(800);
  return { page, errors };
}
const attrs = (page, selector) => page.$$eval(selector, els => els.map(e => ({ ...Object.fromEntries([...e.attributes].filter(a => a.name.startsWith("data-")).map(a => [a.name.slice(5), a.value])), text: e.innerText })));
const cell = (page, grid, row, field) => page.$eval(`${grid} tr[data-${row[0]}="${row[1]}"] [data-field="${field}"]`, e => ({ ...e.dataset, text: e.innerText })).catch(() => null);
async function layout(page, errors, where) {
  const facts = await page.evaluate(() => {
    const text = document.querySelector("main").innerText;
    return {
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      broken: [...document.images].filter(i => i.complete && i.naturalWidth === 0).map(i => i.src),
      selects: document.querySelectorAll("main select").length,
      projectWords: [...new Set(text.match(/prior_blend|player_only|player_plus_context|ewma_20_hl5|basketball-points-v1|\bM6\b|\bS3\b|Block F|\b[0-9a-f]{16,}\b/g) ?? [])],
      iso: [...new Set(text.match(/\b\d{4}-\d{2}-\d{2}\b/g) ?? [])],
      hyphenMinus: [...new Set(text.match(/(?:^|[\s(])-\d/gm) ?? [])],
      tones: [...document.querySelectorAll("main [data-tone]")].map(e => e.getAttribute("data-tone")),
    };
  });
  report.loads.push({ where, consoleErrors: errors, ...facts });
  return facts;
}

// ---- Points Forecasts ---------------------------------------------------------------------------------------------------
const served = E.validation.baseline, finalist = E.validation.challenger_finalist;
const models = [served, finalist, ...Object.keys(E.final_test.metrics).filter(m => m !== served && m !== finalist)];
const G = E.promotion.gates;
const gain = { value: -G.final_paired_superiority.mae_difference, low: -G.final_paired_superiority.upper, high: -G.final_paired_superiority.lower };
const NAMES = { prior_blend: "Prior blend", player_only: "Player trees", player_plus_context: "Player + context trees", ewma_20_hl5: "EWMA-20" };

async function checkForecasts(width) {
  const { page, errors } = await open("/forecasts", width);
  const w = `forecasts@${width}`;
  const m = E.final_test.metrics[served];
  has(`${w} meta`, await page.innerText("[data-field=hero-meta]"), `${n(m.forecast_rows)} test forecasts · ${n(m.players)} players · ${E.final_test.split.season} season · fixed Oct 1, 2026, before the test`);
  const maes = models.map(k => E.final_test.metrics[k].mae);
  const hl = (await attrs(page, "[data-field=typical-miss]"))[0];
  eq(`${w} typical low`, hl.low, Math.min(...maes)); eq(`${w} typical high`, hl.high, Math.max(...maes));
  has(`${w} headline`, await page.innerText("[data-field=headline]"), `all ${models.length} models missed a player's points by about ${f(Math.min(...maes), 1)}`);
  const ag = (await attrs(page, "[data-field=answer-gain]"))[0];
  eq(`${w} gain`, ag.value, gain.value); eq(`${w} gain low`, ag.low, gain.low); eq(`${w} gain high`, ag.high, gain.high);
  has(`${w} gain text`, ag.text, `${NAMES[finalist]} missed by ${f(Math.abs(gain.value), 3)} points a game less than the ${NAMES[served].toLowerCase()}, and the 95% interval for that gain runs from ${sg(gain.low, 3)} to ${sg(gain.high, 3)}`);
  // Strip.
  const strip = await attrs(page, "[data-chart=miss] [data-row]");
  for (const k of models) eq(`${w} strip ${k}`, strip.find(r => r.model === k)?.value ?? null, E.final_test.metrics[k].mae);
  const sg_ = strip.find(r => r.row === "gain");
  eq(`${w} strip gain`, sg_.value, gain.value); eq(`${w} strip gain low`, sg_.low, gain.low); eq(`${w} strip gain high`, sg_.high, gain.high);
  eq(`${w} strip gain tone`, sg_.tone ?? "", gain.low > 0 ? "good" : gain.high < 0 ? "bad" : "");
  // Model grid, both views on a phone.
  const views = width < 768 ? ["Misses", "80% ranges"] : [null];
  for (const view of views) {
    if (view) await page.getByRole("radiogroup", { name: "Model columns" }).getByRole("radio", { name: view }).click();
    await sideways(page, `${w} models ${view}`);
    for (const k of models) {
      const mm = E.final_test.metrics[k], iv = E.final_test.intervals[k];
      const want = view === "80% ranges" ? { "coverage-core": iv.core.coverage, "coverage-early": iv.early_season.coverage, rows: mm.forecast_rows }
        : view === "Misses" ? { mae: mm.mae, rmse: mm.rmse, "player-balanced": mm.player_balanced_mae }
          : { mae: mm.mae, rmse: mm.rmse, "player-balanced": mm.player_balanced_mae, "coverage-core": iv.core.coverage, "coverage-early": iv.early_season.coverage, rows: mm.forecast_rows };
      for (const [field, value] of Object.entries(want)) {
        const c = await cell(page, ".fc-models", ["model", k], field);
        eq(`${w} models ${k} ${field}`, c?.value ?? null, value);
        if (field === "mae") has(`${w} models ${k} mae text`, c?.text, f(value, 3));
        if (field.startsWith("coverage")) has(`${w} models ${k} ${field} text`, c?.text, pc(value));
      }
      if (view !== "80% ranges") {
        const g = await cell(page, ".fc-models", ["model", k], "gain");
        if (k === finalist) { eq(`${w} models gain`, g?.value ?? null, gain.value); has(`${w} models gain text`, g?.text, `${sg(gain.value, 3)}\n${sg(gain.low, 3)} to ${sg(gain.high, 3)}`); }
        else has(`${w} models ${k} gain`, g?.text, k === served ? "Served" : "Not paired");
      }
    }
  }
  // Coverage strip.
  const cov = await attrs(page, "[data-chart=coverage] [data-row=coverage]");
  for (const k of models) for (const [grp, key] of [["Established players", "core"], ["Early season", "early_season"]]) {
    const r = cov.find(x => x.model === k && x.group === grp), iv = E.final_test.intervals[k][key];
    eq(`${w} cov ${k} ${key}`, r?.value ?? null, iv.coverage); eq(`${w} cov ${k} ${key} width`, r?.width ?? null, iv.mean_width); eq(`${w} cov ${k} ${key} rows`, r?.rows ?? null, iv.rows);
    has(`${w} cov ${k} ${key} text`, r?.text, `${pc(iv.coverage)}\n${f(iv.mean_width, 1)} points wide`);
  }
  has(`${w} coverage line`, await page.innerText("[data-field=coverage-line]"), `held it in ${pc(E.final_test.intervals[served].core.coverage)} of games for established players and ${pc(E.final_test.intervals[served].early_season.coverage)} early in the season, and it was about ${f(E.final_test.intervals[served].core.mean_width, 1)} points wide`);
  // Rules.
  const rules = await attrs(page, ".fc-gates tr[data-gate]");
  const fd = G.validation_improvement.fold_differences;
  const wantRules = {
    validation: [G.validation_improvement.passed, `${sg(G.validation_improvement.pooled_relative_improvement * 100, 1)}% pooled; fold 1 ${sg(fd.v1, 3)}, fold 2 ${sg(fd.v2, 3)} points`],
    final: [G.final_paired_superiority.passed, `${sg(gain.value, 3)} points, ${sg(gain.low, 3)} to ${sg(gain.high, 3)}`],
    slices: [G.supported_slices.passed, `${G.supported_slices.supported_count} slices tested, ${G.supported_slices.regressions_over_limit.length ? G.supported_slices.regressions_over_limit.length : "none"} over`],
    intervals: [G.interval_guardrails.passed, `${pc(G.interval_guardrails.challenger_coverage)} coverage, width ${pc(G.interval_guardrails.width_ratio)}`],
  };
  for (const [key, [passed, observed]] of Object.entries(wantRules)) {
    const r = rules.find(x => x.gate === key);
    eq(`${w} rule ${key} passed`, r?.passed ?? null, String(passed)); has(`${w} rule ${key} observed`, r?.text, observed); has(`${w} rule ${key} result`, r?.text, passed ? "Passed" : "Not passed");
  }
  has(`${w} rules line`, await page.innerText("[data-field=gates-line]"), `cleared ${Object.values(wantRules).filter(([p]) => p).length} of 4`);
  // Every slice dimension.
  const dims = Object.keys(E.final_test.prespecified_slices);
  const phone = width < 768;
  for (const dim of dims) {
    await page.getByRole("combobox", { name: "Slice" }).selectOption(dim);
    await page.waitForSelector(`.fc-slices tr[data-dimension="${dim}"]`, { timeout: 30000 });
    for (const view of phone ? ["Misses", "Change"] : [null]) {
      if (view) await page.getByRole("radiogroup", { name: "Slice columns" }).getByRole("radio", { name: view }).click();
      await sideways(page, `${w} slices ${dim} ${view}`);
      for (const [sub, est] of Object.entries(E.final_test.prespecified_slices[dim])) {
        const row = await page.$(`.fc-slices tr[data-dimension="${dim}"][data-subgroup="${CSS_ESCAPE(sub)}"]`);
        checked += 1; if (!row) { mismatches.push({ where: `${w} slice ${dim} ${sub}`, got: "missing row" }); continue; }
        const vals = await row.$$eval("[data-field]", els => Object.fromEntries(els.map(e => [e.dataset.field, e.dataset.value])));
        if (view !== "Change") for (const k of models) if (est[k]) eq(`${w} slice ${dim} ${sub} ${k}`, vals[`mae-${k}`] ?? null, est[k].mae);
        if (view !== "Misses") { eq(`${w} slice ${dim} ${sub} change`, vals.change ?? null, est[finalist].mae - est[served].mae); eq(`${w} slice ${dim} ${sub} rows`, vals.rows ?? null, est[served].forecast_rows); }
      }
      eq(`${w} slice ${dim} row count`, await page.locator(".fc-slices tbody tr").count(), Object.keys(E.final_test.prespecified_slices[dim]).length);
    }
    if (phone) await page.getByRole("radiogroup", { name: "Slice columns" }).getByRole("radio", { name: "Misses" }).click();
  }
  // Ledger.
  const items = L.items;
  const line = (await attrs(page, "[data-field=ledger-line]"))[0];
  const back = items.every(i => i.issued_at_utc.slice(0, 10) > i.target_game_date);
  eq(`${w} ledger timing`, line.timing, back ? "after" : "before");
  const newest = items.map(i => i.target_game_date).sort().at(-1);
  const issued = [...new Set(items.map(i => i.issued_at_utc.slice(0, 10)))].sort();
  has(`${w} ledger line`, line.text, `The newest of the ${n(L.total_items)} on record is for a game on ${day(newest)}. The ${items.length} newest were issued on ${day(issued[0])}, after their games, which fall inside the test season`);
  await page.locator("#ledger-list summary").click();
  const tot = (await attrs(page, "[data-field=ledger-totals]"))[0];
  for (const [k, v] of [["issued", L.summary.total_issued], ["scored", L.summary.total_scored], ["unscored", L.summary.total_unscored_dnp], ["pending", L.summary.total_pending]]) eq(`${w} ledger ${k}`, tot[k], v);
  const acc = (await attrs(page, "[data-field=ledger-accuracy]"))[0];
  eq(`${w} ledger mae`, acc.mae, L.summary.accuracy_metrics.mae); eq(`${w} ledger coverage`, acc.coverage, L.summary.accuracy_metrics.interval_coverage);
  const right = Math.max(10, Math.ceil(Math.max(...items.map(i => i.interval_upper)) / 10) * 10);
  eq(`${w} ledger axis`, (await attrs(page, "[data-field=ledger-axis]"))[0]?.right ?? null, right);
  for (const view of phone ? ["Forecast", "Result", "Basis"] : [null]) {
    if (view) await page.getByRole("radiogroup", { name: "Ledger columns" }).getByRole("radio", { name: view }).click();
    await sideways(page, `${w} ledger ${view}`);
    for (const i of items) {
      const row = await page.$(`.fc-ledger tr[data-id="${i.id}"]`);
      checked += 1; if (!row) { mismatches.push({ where: `${w} ledger ${i.id}`, got: "missing row" }); continue; }
      const v = await row.$$eval("[data-field]", els => Object.fromEntries(els.map(e => [e.dataset.field, { ...e.dataset, text: e.innerText }])));
      has(`${w} ledger ${i.id} player`, await row.innerText(), i.player_name);
      if (view === "Forecast" || view === null) {
        eq(`${w} ledger ${i.id} estimate`, v.estimate?.value ?? null, i.point_estimate); eq(`${w} ledger ${i.id} low`, v.estimate?.low ?? null, i.interval_lower); eq(`${w} ledger ${i.id} high`, v.estimate?.high ?? null, i.interval_upper);
        has(`${w} ledger ${i.id} estimate text`, v.estimate?.text, `${f(i.point_estimate, 1)}\n${f(i.interval_lower, 1)} to ${f(i.interval_upper, 1)}`);
        eq(`${w} ledger ${i.id} game`, v.game?.value ?? null, i.target_game_date); has(`${w} ledger ${i.id} game text`, v.game?.text, `${day(i.target_game_date)}`); eq(`${w} ledger ${i.id} opp`, v.game?.opponent ?? null, i.target_opponent_tricode);
      }
      if (view === "Basis" || view === null) eq(`${w} ledger ${i.id} basis`, v.basis?.value ?? null, i.availability_reason);
      if (view === "Result" || view === null) {
        const s = i.latest_score;
        const outcome = !s ? "pending" : ["scored", "revised"].includes(s.score_status) ? "scored" : s.score_status === "unscored_dnp" ? (s.reason === "did_not_appear_dnp" ? "did_not_play" : "absent") : "other";
        eq(`${w} ledger ${i.id} outcome`, v.actual?.outcome ?? null, outcome);
        if (outcome === "scored") { eq(`${w} ledger ${i.id} points`, v.actual?.value ?? null, s.observed_points); eq(`${w} ledger ${i.id} miss`, v.miss?.value ?? null, s.absolute_error); eq(`${w} ledger ${i.id} hit`, v.miss?.hit ?? null, String(s.interval_hit)); }
        else { has(`${w} ledger ${i.id} unknown`, v.actual?.text, outcome === "absent" ? "Not in the box score, unknown" : outcome === "did_not_play" ? "Did not play" : "Waiting"); eq(`${w} ledger ${i.id} no miss`, v.miss?.value ?? "", ""); }
      }
    }
  }
  // Photos and logos in the ledger: each the game season's photo of that team, and a logo beside the team code and the opponent.
  await page.waitForTimeout(1500);
  const photos = await page.$$eval(".fc-ledger tbody tr", rows => rows.map(r => {
    const img = r.querySelector(".stats-primary-portrait");
    const logos = [...r.querySelectorAll("img")].filter(i => !i.classList.contains("stats-primary-portrait") && !i.closest(".stats-primary-portrait"));
    const name = r.querySelector(".player-cell-name");
    return { id: r.dataset.id, nameCut: name ? name.scrollWidth > name.clientWidth + 1 : null, src: img?.getAttribute("src") ?? null, tag: img?.tagName ?? null, fallback: img?.classList.contains("player-portrait-fallback") ?? null,
      loaded: img?.tagName !== "IMG" || (img.complete && img.naturalWidth > 0), logos: logos.length, logosLoaded: logos.filter(i => i.complete && i.naturalWidth > 0).length };
  }));
  report.photos = report.photos ?? [];
  for (const p of photos) {
    const i = items.find(x => x.id === p.id);
    const seasonOk = p.fallback || (p.src ?? "").includes(`season=${season(i.target_game_date)}`), teamOk = p.fallback || (p.src ?? "").includes(`team=${i.team_tricode}`);
    const ok = !p.nameCut && p.loaded && seasonOk && teamOk && p.logosLoaded === p.logos && p.logos >= (phone ? 1 : 2);
    report.photos.push({ width, player: i.player_name, ...p, seasonOk, teamOk, ok });
    checked += 1; if (!ok) mismatches.push({ where: `${w} photo ${i.player_name}`, got: p });
  }
  if (shots) {
    await page.locator("#ledger").screenshot({ path: `${shots}/fc-ledger-${width}.png` });
  }
  // About.
  await page.locator("#about summary").click();
  eq(`${w} run id`, await page.innerText("[data-field=run-id]"), E.run_id);
  await sideways(page, `${w} about`);
  const c = E.final_test.counts;
  has(`${w} about counts`, await page.innerText("[data-field=about-counts]"), `${n(c.potential_player_cutoffs)} player-dates were considered; ${n(c.candidate_rows)} had a next game in range and enough history, and ${n(c.label_scored)} of those were played and scored. ${n(c.label_explicit_nonappearance)} were recorded non-appearances and ${n(c.label_unmatched_or_unknown)} unknown`);
  const cal = E.calibration[served];
  has(`${w} about calibration`, await page.innerText("[data-field=about-calibration]"), `± ${f(cal.core.absolute_residual_quantile, 2)} points for established players and ± ${f(cal.early_season.absolute_residual_quantile, 2)} early in the season, from ${n(cal.core.rows)} and ${n(cal.early_season.rows)}`);
  eq(`${w} model card`, await page.$eval("[data-field=model-card]", e => e.textContent), E.model_card_markdown);
  await page.locator("#about summary").click();
  await page.locator("#ledger-list summary").click();
  await page.getByRole("combobox", { name: "Slice" }).selectOption(dims[0]);
  return { page, errors };
}

// ---- Evaluation Archive -------------------------------------------------------------------------------------------------
const AG = A.promotion.gates;
const AU = A.final_test.paired_uncertainty;
const [aA, aB] = /^(\w+?)_MAE - (\w+?)_MAE$/.exec(AU.estimand).slice(1);
const again = { value: -(A.final_test.metrics[aA].mae - A.final_test.metrics[aB].mae), low: -AU.upper, high: -AU.lower };
const aServed = A.serving_policy.historical_s3_primary, aFinalist = A.validation.challenger_finalist;
const aModels = [aServed, aFinalist, ...Object.keys(A.final_test.metrics).filter(k => k !== aServed && k !== aFinalist)];

async function checkArchive(width) {
  const { page, errors } = await open("/evaluation", width);
  const w = `archive@${width}`;
  const m = A.final_test.metrics[aServed];
  has(`${w} meta`, await page.innerText("[data-field=hero-meta]"), `${n(m.forecast_rows)} test forecasts · ${n(m.players)} players · ${A.final_test.split.season} season · fixed Sep 21, 2026, before the test`);
  const hl = (await attrs(page, "[data-field=headline]"))[0];
  eq(`${w} gain`, hl.value, again.value); eq(`${w} gain low`, hl.low, again.low); eq(`${w} gain high`, hl.high, again.high);
  const lo = Math.min(Math.abs(again.low), Math.abs(again.high)), hi = Math.max(Math.abs(again.low), Math.abs(again.high));
  has(`${w} headline`, hl.text, `On ${A.final_test.split.season}, a season none of them saw, the ${NAMES[aA].toLowerCase()} missed by ${f(Math.abs(again.value), 2)} reference points a game ${again.value < 0 ? "more" : "less"} than ${NAMES[aB]}`);
  has(`${w} headline interval`, hl.text, `(95% interval ${f(lo, 2)} to ${f(hi, 2)} ${again.value < 0 ? "more" : "less"}`);
  const strip = await attrs(page, "[data-chart=miss] [data-row]");
  for (const k of aModels) eq(`${w} strip ${k}`, strip.find(r => r.model === k)?.value ?? null, A.final_test.metrics[k].mae);
  const sgain = strip.find(r => r.row === "gain");
  eq(`${w} strip gain`, sgain.value, again.value); eq(`${w} strip tone`, sgain.tone ?? "", again.low > 0 ? "good" : again.high < 0 ? "bad" : "");
  const valMae = k => k === A.validation.baseline ? A.validation.baseline_validation.pooled.mae : A.validation.variants[k].configs[A.validation.variants[k].selected_config].pooled.mae;
  for (const view of width < 768 ? ["Misses", "Validation, ranges"] : [null]) {
    if (view) await page.getByRole("radiogroup", { name: "Model columns" }).getByRole("radio", { name: view }).click();
    await sideways(page, `${w} models ${view}`);
    for (const k of aModels) {
      const mm = A.final_test.metrics[k], iv = A.final_test.intervals[k];
      const all = { mae: mm.mae, rmse: mm.rmse, validation: valMae(k), coverage: iv.coverage, width: iv.mean_width, rows: mm.forecast_rows };
      const fields = view === "Misses" ? ["mae", "rmse"] : view === "Validation, ranges" ? ["validation", "coverage", "width"] : Object.keys(all);
      for (const field of fields) eq(`${w} models ${k} ${field}`, (await cell(page, ".fc-models", ["model", k], field))?.value ?? null, all[field]);
      if (view !== "Validation, ranges" && k === aA) { const g = await cell(page, ".fc-models", ["model", k], "gain"); eq(`${w} models gain`, g?.value ?? null, again.value); }
    }
  }
  const cov = await attrs(page, "[data-chart=coverage] [data-row=coverage]");
  for (const k of aModels) { const r = cov.find(x => x.model === k); eq(`${w} cov ${k}`, r?.value ?? null, A.final_test.intervals[k].coverage); eq(`${w} cov ${k} width`, r?.width ?? null, A.final_test.intervals[k].mean_width); }
  const rules = await attrs(page, ".fc-gates tr[data-gate]");
  const fold = Object.values(AG.validation_improvement.fold_absolute_improvements);
  const over = AG.supported_slices.regressions_over_limit[0];
  const want = {
    validation: [AG.validation_improvement.passed, `${sg(AG.validation_improvement.pooled_relative_improvement * 100, 1)}% pooled; folds ${fold.map(v => sg(v, 3)).join(" and ")} reference points`],
    final: [AG.final_paired_superiority.passed, `${sg(again.value, 3)}, ${sg(again.low, 3)} to ${sg(again.high, 3)}`],
    slices: [AG.supported_slices.passed, over ? `${(over.relative_mae_regression * 100).toFixed(1)}% worse` : "none over"],
    intervals: [AG.interval_guardrails.passed, `${pc(AG.interval_guardrails.challenger_coverage)} coverage, width ${pc(AG.interval_guardrails.width_ratio)}`],
  };
  for (const [key, [passed, observed]] of Object.entries(want)) { const r = rules.find(x => x.gate === key); eq(`${w} rule ${key}`, r?.passed ?? null, String(passed)); has(`${w} rule ${key} observed`, r?.text, observed); }
  for (const dim of Object.keys(A.final_test.prespecified_slices)) {
    await page.getByRole("combobox", { name: "Slice" }).selectOption(dim);
    await page.waitForSelector(`.fc-slices tr[data-dimension="${dim}"]`, { timeout: 30000 });
    for (const view of width < 768 ? ["Misses", "80% range"] : [null]) {
      if (view) await page.getByRole("radiogroup", { name: "Slice columns" }).getByRole("radio", { name: view }).click();
      await sideways(page, `${w} slices ${dim} ${view}`);
      for (const [sub, est] of Object.entries(A.final_test.prespecified_slices[dim])) {
        const vals = await page.$$eval(`.fc-slices tr[data-dimension="${dim}"][data-subgroup="${CSS_ESCAPE(sub)}"] [data-field]`, els => Object.fromEntries(els.map(e => [e.dataset.field, e.dataset.value])));
        for (const k of aModels) {
          if (view !== "80% range") eq(`${w} slice ${dim} ${sub} ${k}`, vals[`mae-${k}`] ?? null, est[k].mae);
          if (view !== "Misses") eq(`${w} slice ${dim} ${sub} ${k} cov`, vals[`coverage-${k}`] ?? null, est[k].interval.coverage);
        }
      }
    }
    if (width < 768) await page.getByRole("radiogroup", { name: "Slice columns" }).getByRole("radio", { name: "Misses" }).click();
  }
  await page.locator("#about summary").click();
  eq(`${w} run id`, await page.innerText("[data-field=run-id]"), A.run_id);
  await sideways(page, `${w} about`);
  const c = A.final_test.counts;
  has(`${w} about counts`, await page.innerText("[data-field=about-counts]"), `${n(c.candidate_rows)} candidate forecasts in 2023-24; ${n(c.label_scored)} were played and scored, ${n(c.core_rows)} of them for established players. ${n(c.label_explicit_nonappearance)} were recorded non-appearances and ${n(c.label_unmatched_or_unknown)} unknown; ${n(c.insufficient_history_rows)} had too little history`);
  has(`${w} about coverage`, await page.innerText("[data-field=about-coverage]"), `${day(A.coverage_start)} to ${day(A.coverage_end)}`);
  await page.locator("#about summary").click();
  await page.getByRole("combobox", { name: "Slice" }).selectOption(Object.keys(A.final_test.prespecified_slices)[0]);
  return { page, errors };
}
// No table scrolls sideways inside its frame (RD13: a phone switches column groups instead), the rules grid included.
async function sideways(page, where) {
  const wide = await page.$$eval(".fc-page .rs-grid", grids => grids.filter(g => !g.closest("details:not([open])")).map(g => { const r = g.querySelector(".stats-scroll-region"); return { name: g.className, over: r ? r.scrollWidth - r.clientWidth : 0 }; }).filter(x => x.over > 1));
  checked += 1; if (wide.length) mismatches.push({ where: `${where} sideways`, got: wide });
}
const CSS_ESCAPE = s => s.replace(/["\\]/g, "\\$&");

for (const width of [1440, 390]) {
  for (const [name, fn] of [["forecasts", checkForecasts], ["archive", checkArchive]]) {
    const { page, errors } = await fn(width);
    await page.evaluate(() => scrollTo(0, 0));
    const facts = await layout(page, errors, `${name}@${width}`);
    checked += 1; if (errors.length || facts.overflow || facts.broken.length || facts.projectWords.length || facts.iso.length || facts.hyphenMinus.length || facts.selects !== 1) mismatches.push({ where: `${name}@${width} layout`, got: { errors, ...facts } });
    // Only the archive's paired gain excludes zero (below it), so red there and nowhere else; the points page has no tone at all.
    checked += 1; if (name === "archive" ? (!facts.tones.length || facts.tones.some(t => t !== "bad")) : facts.tones.length) mismatches.push({ where: `${name}@${width} tones`, got: facts.tones });
    if (shots) await page.screenshot({ path: `${shots}/${name === "forecasts" ? "fc" : "ev"}-full-${width}.png`, fullPage: true });
    await page.close();
  }
}
await browser.close();
report.checked = checked; report.mismatches = mismatches;
writeFileSync(out, JSON.stringify(report, null, 1));
console.log(`${checked} values, ${mismatches.length} mismatches`);
for (const m of mismatches.slice(0, 30)) console.log(JSON.stringify(m).slice(0, 400));
for (const l of report.loads) console.log(l.where, "errors", l.consoleErrors.length, "overflow", l.overflow, "broken", l.broken.length, "selects", l.selects, "words", l.projectWords, "iso", l.iso, "hyphen", l.hyphenMinus, "tones", l.tones.length);
