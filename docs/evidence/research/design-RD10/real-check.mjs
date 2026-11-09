// Real-data check for RD10 (Metric Backtest): every value the page draws against the owner's API through the read-only proxy on 4180
// (../design-RD08/readonly-proxy.mjs), the production build on 3180, at 1440 and 390. Walks all 36 pairs both ways in the 9×9, every "against" and
// every season of the paired table, every metric and reference of the season line (72 ordered pairs at 1440, a sample at 390), all eight calibration
// choices, the pooled and by-season grids and the 2026-27 tables. Also the colour rules, console errors, overflow, broken images, arrows, phone
// controls under 40 px and the layout. There are no players or teams on this page, so no photos or logos apply: the check asserts there are none.
// Usage: node real-check.mjs <report.json> [<shots dir>]
import { chromium } from "/home/ethioking/dev/courtlens/dashboard/node_modules/playwright/index.mjs";
import { writeFileSync } from "node:fs";
const API = "http://127.0.0.1:4180", WEB = "http://localhost:3180/research/backtest";
const [,, out, shots] = process.argv;
const data = await (await fetch(`${API}/api/metric-backtest`)).json();
const { results, metrics, prospective } = data;
const p = results.registration.parameters, all = p.candidates, baseline = p.baseline, seasons = p.test_seasons;

// The page's formats, written again here so a formatting bug shows up as a mismatch.
const fixed = (v, d = 2) => v == null ? "—" : v.toFixed(d);
const signed = (v, d = 2) => { if (v == null) return "—"; const t = Math.abs(v).toFixed(d); return Number(t) === 0 ? t : `${v > 0 ? "+" : "−"}${t}`; };
const pct = (v, d = 1) => v == null ? "—" : `${(v * 100).toFixed(d)}%`;
const band = (b, d = 2) => `${fixed(b.low, d)} to ${fixed(b.high, d)}`;
const gainBand = (b, d = 2) => `${signed(b.low, d)} to ${signed(b.high, d)}`;
const count = n => n.toLocaleString("en-US");
const range = s => s.length === 1 ? s[0] : `${s[0]} to ${s.at(-1)}`;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const longDate = iso => { const [y, m, d] = iso.slice(0, 10).split("-").map(Number); return `${MONTHS[m - 1]} ${d}, ${y}`; };
// Project codes in the served notes are replaced on the page (RD07: no repository detail).
const visitor = t => t.replace("R07's frozen model", "the frozen Projected Impact model").replace(" (R07)", "");
const num = v => v === null || v === undefined || v === "" ? null : Number(v);
const tone = g => g.low > 0 ? "good" : g.high < 0 ? "bad" : null;
const DIGITS = { rmse: 2, accuracy: 3, brier: 4, log_loss: 4 }, SCORES = ["rmse", "accuracy", "brier", "log_loss"];
const VERDICT = { candidate_better: "Better", reference_better: "Worse", no_ranking: "No ranking" };
const flipG = g => ({ gain: -g.gain, low: -g.high, high: -g.low });
const flipV = v => v === "candidate_better" ? "reference_better" : v === "reference_better" ? "candidate_better" : v;
// A pair with `a` first, gains flipped when the served pair is the other way round; written independently of lib/metric-backtest.ts.
const pairOf = (a, b) => {
  const d = results.pairs.find(x => x.candidate === a && x.reference === b);
  if (d) return { seasons: d.seasons, games: d.games, pooled: d.pooled, per: d.per_season, lower: d.seasons_candidate_lower_rmse, verdict: d.verdict };
  const r = results.pairs.find(x => x.candidate === b && x.reference === a);
  const flip = row => Object.fromEntries(SCORES.map(s => [s, flipG(row[s])]));
  return { seasons: r.seasons, games: r.games, pooled: flip(r.pooled), per: Object.fromEntries(Object.entries(r.per_season).map(([s, row]) => [s, flip(row)])),
    lower: r.seasons.filter(s => r.per_season[s].rmse.gain < 0).length, verdict: flipV(r.verdict) };
};
const readTable = (page, name) => page.evaluate(n => [...document.querySelectorAll(`table[data-table="${n}"] tbody tr`)].map(tr => ({
  key: tr.dataset.row, data: { ...tr.dataset }, lead: tr.querySelector("th")?.textContent ?? "",
  cells: Object.fromEntries([...tr.querySelectorAll("td")].map(td => { const main = td.querySelector(".rs-grid-value"); return [td.dataset.column, {
    field: td.dataset.field, season: td.dataset.season, value: td.dataset.value, low: td.dataset.low, high: td.dataset.high, self: td.dataset.self, text: td.textContent,
    main: main?.textContent ?? null, sub: td.querySelector(".rs-grid-sub")?.textContent ?? null, tone: main?.dataset.tone ?? null, identity: main?.dataset.identity ?? null }]; })),
})), name);

const report = [];
const browser = await chromium.launch();
for (const width of [1440, 390]) {
  const wide = width > 600, tag = wide ? "1440" : "390";
  const page = await browser.newPage({ viewport: { width, height: wide ? 900 : 844 } });
  const errors = [], mismatches = []; let compared = 0, loads = 0;
  const eq = (what, got, want) => { compared += 1; if (got !== want) mismatches.push({ what, got, want }); };
  page.on("console", m => { if (m.type() === "error") errors.push(m.text()); });
  page.on("pageerror", e => errors.push(String(e)));
  const open = async (q, ready) => { loads += 1; await page.goto(`${WEB}${q}`, { waitUntil: "domcontentloaded", timeout: 120000 }); await page.waitForSelector(ready, { state: "attached", timeout: 60000 }); };
  const READY = 'table[data-table="pooled"] tbody tr';
  const checkGain = (what, cell, g, d) => {
    eq(`${what} value`, num(cell.value), g.gain); eq(`${what} low`, num(cell.low), g.low); eq(`${what} high`, num(cell.high), g.high);
    const points = v => signed(v * 100, 1);
    eq(`${what} text`, cell.main, d === "pts" ? `${points(g.gain)} pts` : signed(g.gain, d)); eq(`${what} sub`, cell.sub, d === "pts" ? `${points(g.low)} to ${points(g.high)}` : gainBand(g, d)); eq(`${what} tone`, cell.tone, tone(g)); eq(`${what} no identity`, cell.identity, null);
  };

  // Default page: every section at once.
  await open("", READY);
  await page.waitForLoadState("networkidle").catch(() => {});
  eq("h1", await page.locator("h1").innerText(), "Metric Backtest");
  eq("hero", (await page.locator('[data-field="hero-meta"]').innerText()).trim(), `${count(results.candidates[baseline].pooled.games)} games · ${range(seasons)} · ${all.length} metrics`);
  const best = results.verdict.best[0], bestGain = pairOf(best, baseline).pooled.rmse;
  const answer = await page.locator('[data-field="verdict-summary"]').innerText();
  eq("answer names the best", answer.includes(`${metrics[best].label}, predicted game margins better than each of the other 8 metrics.`), true);
  eq("answer rmse", await page.locator('[data-field="best-line"] strong').first().getAttribute("data-value"), String(results.candidates[best].pooled.rmse));
  eq("answer gain", await page.locator('[data-field="best-line"] strong').nth(1).getAttribute("data-value"), String(bestGain.gain));
  eq("answer gain band", (await page.locator('[data-field="best-line"]').innerText()).includes(`(95% interval of the gain ${gainBand(bestGain)})`), true);
  eq("answer honest line", answer.includes("tests ratings, not game forecasts"), true);
  eq("answer unranked", answer.includes("Projected Impact can't be separated from RAPM 3Y or Time decay (opener)."), true);
  eq("answer unranked pairs served", results.pairs.filter(q => q.verdict === "no_ranking").map(q => [q.candidate, q.reference].sort().join()).sort().join(";"), [["projected_impact", "rapm_3y"], ["projected_impact", "time_decay_opener"]].map(a => a.sort().join()).sort().join(";"));

  // The 9×9: 72 ordered cells and nine blanks, in registered order.
  const matrix = await readTable(page, "head-to-head");
  eq("matrix order", matrix.map(r => r.key).join(), all.join());
  for (const a of all) for (const b of all) {
    const c = matrix.find(r => r.key === a).cells[b];
    if (a === b) { eq(`matrix ${a} self`, c.self, "true"); continue; }
    checkGain(`matrix ${a}/${b}`, c, pairOf(a, b).pooled.rmse, 2);
  }
  eq("matrix no tone without an interval side", matrix.flatMap(r => Object.values(r.cells)).filter(c => c.tone && !(Number(c.low) > 0 || Number(c.high) < 0)).length, 0);

  // Pooled grid.
  const pooled = await readTable(page, "pooled");
  eq("pooled order", pooled.map(r => r.key).join(), all.join());
  for (const n of all) {
    const c = results.candidates[n], r = pooled.find(x => x.key === n).cells, lead = pooled.find(x => x.key === n);
    eq(`pooled ${n} games`, num(lead.data.games), c.pooled.games); eq(`pooled ${n} seasons`, num(lead.data.seasons), c.test_seasons.length);
    eq(`pooled ${n} lead`, lead.lead, `${metrics[n].short}${range(c.test_seasons)} · ${count(c.pooled.games)} games`);
    eq(`pooled ${n} rmse`, num(r.rmse.value), c.pooled.rmse); eq(`pooled ${n} low`, num(r.rmse.low), c.pooled.intervals.rmse.low); eq(`pooled ${n} high`, num(r.rmse.high), c.pooled.intervals.rmse.high);
    eq(`pooled ${n} rmse text`, r.rmse.main, fixed(c.pooled.rmse)); eq(`pooled ${n} rmse sub`, r.rmse.sub, band(c.pooled.intervals.rmse)); eq(`pooled ${n} rmse neutral`, r.rmse.tone, null);
    eq(`pooled ${n} accuracy`, num(r.accuracy.value), c.pooled.accuracy); eq(`pooled ${n} accuracy text`, r.accuracy.main, pct(c.pooled.accuracy));
    eq(`pooled ${n} brier`, num(r.brier.value), c.pooled.brier); eq(`pooled ${n} brier text`, r.brier.main, fixed(c.pooled.brier, 4));
    eq(`pooled ${n} log`, num(r.log_loss.value), c.pooled.log_loss); eq(`pooled ${n} log text`, r.log_loss.main, fixed(c.pooled.log_loss, 4));
    eq(`pooled ${n} ece`, num(r.ece.value), c.calibration_curve.ece); eq(`pooled ${n} ece text`, r.ece.main, fixed(c.calibration_curve.ece, 4)); eq(`pooled ${n} ece neutral`, r.ece.tone, null);
    if (n === baseline) { eq("pooled baseline replaced dash", r.replaced.text, "—"); eq("pooled baseline replaced empty", r.replaced.value, ""); }
    else { const want = Object.values(c.seasons).reduce((s, x) => s + x.replaced_minutes_share * x.games, 0) / c.pooled.games; eq(`pooled ${n} replaced`, num(r.replaced.value), want); eq(`pooled ${n} replaced text`, r.replaced.main, pct(want)); }
  }

  // RMSE by season.
  const bySeason = await readTable(page, "by-season");
  for (const n of all) for (const s of seasons) {
    const row = results.candidates[n].seasons[s], c = bySeason.find(x => x.key === n).cells[s];
    eq(`season ${n} ${s}`, num(c.value), row?.rmse ?? null); eq(`season ${n} ${s} season`, c.season, s);
    if (row) { eq(`season ${n} ${s} low`, num(c.low), row.intervals.rmse.low); eq(`season ${n} ${s} high`, num(c.high), row.intervals.rmse.high); eq(`season ${n} ${s} text`, c.main, fixed(row.rmse)); eq(`season ${n} ${s} sub`, c.sub, band(row.intervals.rmse, 1)); eq(`season ${n} ${s} neutral`, c.tone, null); }
    else eq(`season ${n} ${s} dash`, c.text, "—");
  }

  // 2026-27.
  const sum = prospective.summary, manifest = prospective.manifest;
  eq("frozen date in copy", (await page.locator("#season-2026-27").innerText()).includes(`frozen on ${longDate(manifest.frozen_at)}`), true);
  eq("season status", (await page.locator('[data-field="season-status"]').innerText()).startsWith(`Scored through ${longDate(sum.scored_through)} (last run ${longDate(sum.written_at)}):`), true);
  eq("prospective games", num(await page.locator('[data-field="prospective-games"]').getAttribute("data-value")), sum.prospective.games);
  eq("hindsight games", num(await page.locator('[data-field="hindsight-games"]').getAttribute("data-value")), sum.hindsight.games);
  const checkGroup = async (group, name) => {
    const rows = await readTable(page, name);
    eq(`${name} rows`, rows.map(r => r.key).join(), all.join());
    for (const n of all) {
      const s = group.candidates[n], c = rows.find(r => r.key === n).cells;
      eq(`${name} ${n} rmse`, num(c.rmse.value), s.rmse); eq(`${name} ${n} rmse text`, c.rmse.main, fixed(s.rmse));
      eq(`${name} ${n} accuracy`, num(c.accuracy.value), s.accuracy); eq(`${name} ${n} accuracy text`, c.accuracy.main, pct(s.accuracy));
      eq(`${name} ${n} brier`, num(c.brier.value), s.brier); eq(`${name} ${n} brier text`, c.brier.main, fixed(s.brier, 4));
      if (n === baseline) { eq(`${name} baseline`, c.gain?.main, "Baseline"); eq(`${name} replaced dash`, c.replaced.text, "—"); }
      else {
        eq(`${name} ${n} replaced`, num(c.replaced.value), s.replaced_minutes_share); eq(`${name} ${n} replaced text`, c.replaced.main, pct(s.replaced_minutes_share));
        // The scorer can serve a pair either way round; written independently of the page's lookup.
        const direct = group.pairs.find(x => x.candidate === n && x.reference === baseline)?.rmse, other = group.pairs.find(x => x.candidate === baseline && x.reference === n)?.rmse;
        const g = direct ?? (other ? flipG(other) : null);
        eq(`${name} ${n} gain served`, group.pairs.length > 0 ? g !== null : true, true);
        if (g) checkGain(`${name} ${n} gain`, c.gain, g, 2); else eq(`${name} ${n} no gain`, c.gain, undefined);
      }
    }
  };
  if (sum.prospective.games > 0) await checkGroup(sum.prospective, "season-2026-27-prospective");
  else eq("prospective empty note", await page.locator('[data-field="prospective-empty"]').count(), 1);
  if (sum.hindsight.games > 0) await checkGroup(sum.hindsight, "season-2026-27-hindsight");

  // Words: every metric's served note and DARKO.
  const words = await page.locator("#glossary").textContent();
  eq("definitions collapsed", await page.locator("#glossary details").getAttribute("open"), null);
  eq("darko line visible", await page.locator('[data-field="darko-line"]').isVisible(), true);
  eq("calibration captions hidden", await page.locator(".mb-calibration .chart-meta").isVisible(), false);
  eq("calibration title hidden", await page.locator(".mb-calibration .chart-title").isVisible(), false);
  for (const n of all) { eq(`glossary ${n} label`, words.includes(metrics[n].label), true); eq(`glossary ${n} what`, words.includes(metrics[n].what), true); eq(`glossary ${n} credit`, words.includes(visitor(metrics[n].credit)), true); eq(`glossary ${n} source`, words.includes(visitor(metrics[n].source)), true); }
  for (const text of Object.values(data.omitted)) eq("glossary DARKO", words.includes(text), true);

  if (shots) {
    await page.screenshot({ path: `${shots}/backtest-top-${tag}.png` });
    await page.screenshot({ path: `${shots}/backtest-full-${tag}.png`, fullPage: true });
    for (const id of ["head-to-head", "scores-against", "seasons", "scores", "season-2026-27", "reading"]) { await page.locator(`#${id}`).scrollIntoViewIfNeeded(); await page.waitForTimeout(200); await page.locator(`#${id}`).screenshot({ path: `${shots}/backtest-${id}-${tag}.png` }); }
    await page.evaluate(() => window.scrollTo(0, 0));
  }

  // About, collapsed by default, keeps its body in the page.
  const collapsedHeight = await page.evaluate(() => document.documentElement.scrollHeight);
  eq("about collapsed", await page.locator("#about details").getAttribute("open"), null);
  await page.locator("#about summary").click();
  eq("about results hash", await page.locator('[data-field="results-sha"]').getAttribute("data-value"), results.results_sha256);
  eq("about registration hash", await page.locator('[data-field="registration-sha"]').getAttribute("data-value"), results.registration.content_sha256);
  eq("about manifest hash", await page.locator('[data-field="manifest-sha"]').getAttribute("data-value"), manifest.manifest_sha256);
  const about = await page.locator("#about").innerText();
  eq("about rule", about.includes(`${results.verdict.rule.charAt(0).toUpperCase()}${results.verdict.rule.slice(1)}.`), true);
  eq("about replicates", about.includes(`${count(p.replicates)} replicates`), true);
  eq("about leakage", about.includes(`For ${count(Object.values(results.leakage).reduce((s, l) => s + l.game_ratings_checked, 0))} game ratings`), true);
  eq("about actual minutes", about.includes("Actual minutes, on purpose."), true);
  eq("about source", about.includes("CourtLens backtest of NBA regular-season box scores"), true);
  if (shots) { await page.locator("#about").scrollIntoViewIfNeeded(); await page.waitForTimeout(200); await page.locator("#about").screenshot({ path: `${shots}/backtest-about-${tag}.png` }); }
  await page.locator("#glossary summary").click();
  if (shots) { await page.locator("#glossary").scrollIntoViewIfNeeded(); await page.waitForTimeout(200); await page.locator("#glossary").screenshot({ path: `${shots}/backtest-glossary-${tag}.png` }); }
  await page.locator("#glossary summary").click();

  // Page-wide layout and rules.
  await page.evaluate(async () => { document.querySelectorAll("img").forEach(i => { i.loading = "eager"; }); await Promise.all([...document.images].map(i => i.complete ? 0 : new Promise(r => { i.onload = i.onerror = r; }))); });
  const layout = await page.evaluate(w => {
    const text = document.querySelector(".mb-page").innerText;
    const visible = e => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 && !e.closest("[aria-hidden='true']"); };
    const small = w < 600 ? [...document.querySelectorAll(".mb-page :is(button, select, input, summary, a)")].filter(visible).filter(e => Math.round(e.getBoundingClientRect().height) < 40 && !e.closest("th")).map(e => `${e.tagName} ${(e.getAttribute("aria-label") || e.textContent || "").trim().slice(0, 40)} ${e.getBoundingClientRect().height}`) : [];
    const cal = document.querySelector(".mb-calibration .mb-figure").getBoundingClientRect(), bins = document.querySelector(".mb-bins .stats-table-frame").getBoundingClientRect();
    const icon = document.querySelector(".research-hero .ui-page-header-icon").getBoundingClientRect(), svg = document.querySelector(".research-hero .ui-page-header-icon svg").getBoundingClientRect();
    const fractional = [...document.querySelectorAll(".mb-page :is(button, select)")].filter(visible).filter(e => { const h = e.getBoundingClientRect().height; return Math.abs(h - Math.round(h)) > 0.01; }).length;
    return {
      overflow: document.documentElement.scrollWidth - innerWidth, broken: [...document.images].filter(i => i.complete && i.naturalWidth === 0).length,
      small, fractionalControlHeights: fractional, column: Math.round(document.querySelector(".mb-page").getBoundingClientRect().width), height: document.documentElement.scrollHeight,
      iconCentred: Math.abs((icon.left + icon.width / 2) - (svg.left + svg.width / 2)) <= 1 && Math.abs((icon.top + icon.height / 2) - (svg.top + svg.height / 2)) <= 1,
      axisTitleOverlaps: (() => { const svg = document.querySelector(".mb-calibration svg.chart-reliability"), t = [...svg.querySelectorAll("text")], y = t.find(x => x.getAttribute("transform")), b = y.getBoundingClientRect(); return t.filter(x => x !== y).filter(x => { const a = x.getBoundingClientRect(); return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top; }).length; })(),
      calibrationLevel: w >= 1024 ? Math.abs(cal.bottom - bins.bottom) : null,
      images: document.querySelectorAll(".mb-page img").length, logos: document.querySelectorAll(".mb-page .team-logo").length, repoWords: /\b(courtlens-metric-backtest|commit|branch|registered rule|R\d\d)\b/i.test(document.querySelector(".mb-page").innerText.replace(/How the backtest was built/, "")),
      arrows: /[→←↑↓]/.test(text), isoDates: (text.match(/\b20\d\d-\d\d-\d\d\b/g) ?? []).length,
      identityInPage: document.querySelectorAll('.mb-page [data-identity]').length, watermarks: document.querySelectorAll(".mb-page .rs-card > img").length,
      sectionBorders: [...document.querySelectorAll(".mb-page > .rs-section")].filter(s => parseFloat(getComputedStyle(s).borderTopWidth) > 0).length,
    };
  }, width);

  // Walks: every reference, season and metric choice.
  const wantRefs = wide ? all : [baseline, "time_decay", "projected_impact"];
  for (const ref of wantRefs) for (const season of wide ? ["pooled", ...seasons] : ["pooled", "2025-26"]) {
    const q = new URLSearchParams(); if (ref !== baseline) q.set("against", ref); if (season !== "pooled") q.set("pairSeason", season);
    await open(q.size ? `?${q}` : "", READY);
    const id = `pairs ${ref}/${season}`, table = await readTable(page, "pairs");
    const want = all.filter(n => n !== ref).map(n => [n, pairOf(n, ref)]).filter(([, x]) => season === "pooled" || x.seasons.includes(season));
    eq(`${id} rows`, table.map(r => r.key).join(), want.map(([n]) => n).join());
    eq(`${id} reference`, await page.locator('[data-field="pairs"]').getAttribute("data-reference"), ref);
    const verdicts = new Set(want.map(([, x]) => x.verdict)), shared = verdicts.size === 1 ? [...verdicts][0] : null;
    const verdictLine = page.locator('[data-field="pairs-verdict"]'), sentence = await verdictLine.count() ? await verdictLine.getAttribute("data-value") : null;
    eq(`${id} shared verdict`, want.length ? sentence : null, want.length ? shared : null);
    for (const [n, x] of want) {
      const row = table.find(r => r.key === n);
      const games = season === "pooled" ? x.games : results.candidates[n].seasons[season].games;
      eq(`${id} ${n} games`, num(row.data.games), games); eq(`${id} ${n} lead`, row.lead, `${metrics[n].short}${range(x.seasons)} · ${count(games)} games`);
      for (const s of SCORES) checkGain(`${id} ${n} ${s}`, row.cells[s], season === "pooled" ? x.pooled[s] : x.per[season][s], s === "accuracy" ? "pts" : DIGITS[s]);
      eq(`${id} ${n} lower`, num(row.cells.lower.value), x.lower); eq(`${id} ${n} lower text`, row.cells.lower.main, `${x.lower} of ${x.seasons.length}`);
      if (shared === null) { eq(`${id} ${n} verdict`, row.cells.verdict.value, x.verdict); eq(`${id} ${n} verdict text`, row.cells.verdict.text, VERDICT[x.verdict]); } else eq(`${id} ${n} no verdict column`, row.cells.verdict, undefined);
    }
  }
  const lines = wide ? all.flatMap(a => all.filter(b => a !== b).map(b => [a, b])) : [["time_decay", baseline], ["projected_impact", baseline], ["projected_impact", "box_prior_rapm"], ["box_prior_rapm", "rapm_1y"]];
  for (const [a, b] of lines) {
    const q = new URLSearchParams(); if (a !== best) q.set("metric", a); if (b !== baseline) q.set("vs", b);
    await open(q.size ? `?${q}` : "", '[data-chart="gain-by-season"]');
    const x = pairOf(a, b), id = `line ${a}/${b}`;
    if (x.seasons.length === 1) { const g = x.per[x.seasons[0]].rmse; eq(`${id} single`, await page.locator('[data-field="single-season"]').innerText(), `These two share one season, ${x.seasons[0]}: ${signed(g.gain)} (95% ${gainBand(g)}).`); continue; }
    await page.waitForSelector('[data-chart="gain-by-season"] .slc-dot', { state: "attached", timeout: 30000 });
    eq(`${id} metric`, await page.locator('[data-chart="gain-by-season"]').getAttribute("data-metric"), a);
    eq(`${id} reference`, await page.locator('[data-chart="gain-by-season"]').getAttribute("data-reference"), b);
    const dots = await page.evaluate(() => [...document.querySelectorAll('[data-chart="gain-by-season"] .slc-dot')].map(d => ({ s: d.dataset.season, v: d.dataset.value, lo: d.dataset.low, hi: d.dataset.high })));
    eq(`${id} dots`, dots.length, x.seasons.length);
    for (const s of x.seasons) { const d = dots.find(o => o.s === s.slice(2)), g = x.per[s].rmse; if (!d) { eq(`${id} ${s}`, false, true); continue; } eq(`${id} ${s}`, num(d.v), g.gain); eq(`${id} ${s} low`, num(d.lo), g.low); eq(`${id} ${s} high`, num(d.hi), g.high); }
    eq(`${id} zero line`, await page.locator('[data-chart="gain-by-season"] .slc-grid[data-zero]').count(), 1);
  }
  for (const m of wide ? all.filter(n => n !== baseline) : ["time_decay", "projected_impact"]) {
    await open(m === best ? "" : `?cal=${m}`, '[data-chart="calibration"] table tbody tr');
    const id = `cal ${m}`, chosen = results.candidates[m].calibration_curve, base = results.candidates[baseline].calibration_curve;
    eq(`${id} metric`, await page.locator('[data-chart="calibration"]').getAttribute("data-metric"), m);
    eq(`${id} ece`, num(await page.locator('[data-field="ece-chosen"]').getAttribute("data-value")), chosen.ece); eq(`${id} ece base`, num(await page.locator('[data-field="ece-base"]').getAttribute("data-value")), base.ece);
    const rows = await readTable(page, "bins");
    eq(`${id} bins`, rows.length, chosen.bins.length);
    chosen.bins.forEach((b, i) => {
      const c = rows[i].cells, o = base.bins[i];
      eq(`${id} ${i} label`, rows[i].lead, `${Math.round(b.low * 100)}–${Math.round(b.high * 100)}%`);
      for (const [tag2, bin] of [["chosen", b], ["base", o]]) {
        eq(`${id} ${i} ${tag2} games`, num(c[`${tag2}-games`].value), bin.games); eq(`${id} ${i} ${tag2} games text`, c[`${tag2}-games`].main, count(bin.games));
        eq(`${id} ${i} ${tag2} pred`, num(c[`${tag2}-predicted`].value), bin.predicted ?? null); eq(`${id} ${i} ${tag2} obs`, num(c[`${tag2}-observed`].value), bin.observed ?? null);
        eq(`${id} ${i} ${tag2} pred text`, c[`${tag2}-predicted`].text, bin.predicted === undefined ? "—" : pct(bin.predicted)); eq(`${id} ${i} ${tag2} obs text`, c[`${tag2}-observed`].text, bin.observed === undefined ? "—" : pct(bin.observed));
      }
    });
    const dots = await page.evaluate(() => [...document.querySelectorAll('[data-chart="calibration"] g[data-series]')].map(g => ({ s: g.dataset.series, b: g.dataset.bin, p: g.dataset.predicted, o: g.dataset.observed, c: g.dataset.count, f: g.getAttribute("fill") })));
    for (const [series, curve] of [["0", chosen], ["1", base]]) {
      const mine = dots.filter(d => d.s === series);
      const measured = curve.bins.map((b, i) => [b, i]).filter(([b]) => b.games > 0);
      eq(`${id} ${series} points`, mine.length, measured.length);
      for (const [b, i] of measured) { const d = mine.find(o => o.b === String(i)); if (!d) { eq(`${id} ${series} ${i}`, false, true); continue; } eq(`${id} ${series} ${i} pred`, num(d.p), b.predicted); eq(`${id} ${series} ${i} obs`, num(d.o), b.observed); eq(`${id} ${series} ${i} n`, num(d.c), b.games); eq(`${id} ${series} ${i} tint`, d.f, series === "0" ? "var(--color-category-3)" : "var(--color-category-4)"); }
    }
  }
  const result = { width, collapsedHeight, compared, loads, mismatches: mismatches.length, errors: [...new Set(errors)].slice(0, 12), ...layout, firstMismatches: mismatches.slice(0, 30) };
  report.push(result);
  console.log(JSON.stringify({ ...result, firstMismatches: mismatches.slice(0, 12) }, null, 1));
  await page.close();
}
await browser.close();
if (out) writeFileSync(out, JSON.stringify(report, null, 1));
