// Real-data check for RD12 (Lineup Model): every value the page draws against the owner's API through the read-only proxy on 4180
// (../design-RD10/readonly-proxy.mjs), the production build on 3180, at 1440 and 390. Walks the lineup tool with a spread of fives (default, one-swap, box-score
// fallback, mixed teams, best and worst rated) through GET /api/lineup-model/fit and once through the search, then the strip, the test, the diagnostics, every backtest
// row, every map point, About (selection, coverage, cold start, subsets, method, credits) and the weights-absent state. Also colour rules, console errors, overflow,
// broken images, photos, logos, arrows, ISO dates, project words, phone controls under 40 px and the layout. Lookups are written here independently of lib/lineup-model.ts,
// and which backtest pairs exist, and in which direction, is written out by hand.
// Usage: node real-check.mjs <report.json> [<shots dir>]
import { chromium } from "/home/ethioking/dev/courtlens/dashboard/node_modules/playwright/index.mjs";
import { writeFileSync } from "node:fs";
const API = "http://127.0.0.1:4180", WEB = "http://localhost:3180/research/lineup-model";
const [,, out, shots] = process.argv;
const page0 = await (await fetch(`${API}/api/lineup-model`)).json();
const roster = await (await fetch(`${API}/api/lineup-model/players`)).json();
const fitOf = async ids => (await fetch(`${API}/api/lineup-model/fit?players=${ids.join(",")}`)).json();
const { results: r, map, serving, backtest: bt, selection: sel, coverage: cov } = page0;

// The page's formats, written again so a formatting bug shows up as a mismatch.
const fixed = (v, d = 2) => v.toFixed(d);
const signed = (v, d = 2) => { const t = Math.abs(v).toFixed(d); return Number(t) === 0 ? t : `${v > 0 ? "+" : "−"}${t}`; };
const pct = (v, d = 1) => `${(v * 100).toFixed(d)}%`;
const count = n => Math.round(n).toLocaleString("en-US");
const digits = vals => { const m = Math.max(...vals.map(Math.abs)); if (!(m > 0) || m >= 0.1) return 2; return Math.min(10, Math.max(2, 1 - Math.floor(Math.log10(m)))); };
const band = (b, d = 2) => `${signed(b.low, d)} to ${signed(b.high, d)}`;
const plainBand = (b, d = 2) => `${b.low.toFixed(d)} to ${b.high.toFixed(d)}`;
const tone = b => b.low > 0 ? "good" : b.high < 0 ? "bad" : null;
const identity = v => Number(Math.abs(v).toFixed(2)) === 0 ? null : v > 0 ? "a" : "b";
const num = v => v === null || v === undefined || v === "" ? null : Number(v);
const STATUS = { own: "Own vector", box: "Box-score fallback", newcomer: "Newcomer" };

// Which backtest rows exist, their registered order, and whether the served pair has the lineup model as its candidate (+1) or as its reference (−1).
const ORDER = ["team_net", "plus_minus", "on_off", "rapm_1y", "rapm_3y", "box_prior_rapm", "time_decay", "time_decay_opener", "projected_impact", "lineup_model", "lineup_ridge"];
const DIRECTION = { team_net: 1, plus_minus: 1, on_off: 1, rapm_1y: 1, rapm_3y: 1, box_prior_rapm: 1, time_decay: 1, time_decay_opener: 1, projected_impact: 1, lineup_ridge: -1 };
const LABEL = { team_net: "Team net (baseline)", plus_minus: "Plus-minus", on_off: "On/off", rapm_1y: "RAPM 1Y", rapm_3y: "RAPM 3Y", box_prior_rapm: "Box-prior RAPM", time_decay: "Time decay, monthly", time_decay_opener: "Time decay, opener", projected_impact: "Projected Impact", lineup_model: "Lineup model", lineup_ridge: "Ridge, same stints" };
const VERDICT = { lineup_better: "Lineup model better", other_better: "Lineup model worse", no_ranking: "No ranking" };
const lineupGain = name => {
  const dir = DIRECTION[name];
  const p = bt.pairs.find(x => dir === 1 ? x.candidate === "lineup_model" && x.reference === name : x.candidate === name && x.reference === "lineup_model");
  if (!p) throw new Error(`no served pair for ${name}`);
  const g = p.pooled.rmse;
  return dir === 1 ? g : { gain: -g.gain, low: -g.high, high: -g.low };
};

const players = new Map(roster.players.map(p => [p.player_id, p]));
const onMap = new Set(map.points.map(p => p.player_id));
const def = serving.default_five;
const own = roster.players.filter(p => p.status === "own"), box = roster.players.filter(p => p.status === "box");
const byRating = [...own].sort((a, b) => b.ridge_rating - a.ridge_rating);
const FIVES = [
  ["one swap", [...def.slice(0, 4), byRating[0].player_id === def[4] ? byRating[1].player_id : byRating[0].player_id]],
  ["top five", byRating.slice(0, 5).map(p => p.player_id)],
  ["bottom five", byRating.slice(-5).map(p => p.player_id)],
  ["one box player", [...def.slice(0, 4), box[0].player_id]],
  ["five box players", box.slice(0, 5).map(p => p.player_id)],
  ["mixed spread", [own[17], own[120], box[40], own[300], box[150]].map(p => p.player_id)],
  ["old photos", roster.players.filter(p => p.photo_season === "2023-24").slice(0, 5).map(p => p.player_id)],
];

const readTable = (page, name) => page.evaluate(n => [...document.querySelectorAll(`table[data-table="${n}"] tbody tr`)].filter(tr => tr.dataset.row).map(tr => ({
  key: tr.dataset.row, lead: tr.querySelector("th")?.innerText ?? "",
  cells: Object.fromEntries([...tr.querySelectorAll("td")].map(td => { const main = td.querySelector(".rs-grid-value"); return [td.dataset.column, {
    field: td.dataset.field, value: td.dataset.value, low: td.dataset.low, high: td.dataset.high, text: td.innerText, main: main?.textContent ?? null, sub: td.querySelector(".rs-grid-sub")?.textContent ?? null, tone: main?.dataset.tone ?? null, identity: main?.dataset.identity ?? null, verdict: td.querySelector(".lm-verdict")?.textContent ?? null }]; })),
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
  const READY = 'table[data-table="fit"] tbody tr';
  const open = async (q = "", ready = READY) => { loads += 1; await page.goto(`${WEB}${q}`, { waitUntil: "domcontentloaded", timeout: 120000 }); await page.waitForSelector(ready, { state: "attached", timeout: 60000 }); };
  const shot = async (name, selector) => { if (!shots) return; const box = page.locator(selector); await box.scrollIntoViewIfNeeded(); await page.waitForTimeout(200); await box.screenshot({ path: `${shots}/lm-${name}-${tag}.png` }); };

  const checkFive = async (label, ids) => {
    const fit = await fitOf(ids);
    eq(`${label} state`, fit.state, "ready");
    const table = await readTable(page, "fit");
    eq(`${label} rows`, table.map(t => t.key).join(), "lineup_model,ridge");
    for (const [row, block] of [["lineup_model", fit.lineup_model], ["ridge", fit.ridge]]) {
      const t = table.find(x => x.key === row);
      eq(`${label} ${row} net`, num(t.cells.net.value), block.net);
      eq(`${label} ${row} net text`, t.cells.net.main, signed(block.net));
      eq(`${label} ${row} low`, num(t.cells.interval.low), block.low);
      eq(`${label} ${row} high`, num(t.cells.interval.high), block.high);
      eq(`${label} ${row} interval text`, t.cells.interval.main, band(block));
      eq(`${label} ${row} tone`, t.cells.net.tone, tone(block));
      eq(`${label} ${row} identity`, t.cells.net.identity, tone(block) ? null : identity(block.net));
    }
    const line = page.locator('[data-field="interaction"]');
    eq(`${label} interaction`, num(await line.getAttribute("data-value")), fit.lineup_model.interaction);
    eq(`${label} additive`, num(await line.getAttribute("data-additive")), fit.lineup_model.additive);
    eq(`${label} interaction text`, (await line.innerText()).includes(signed(fit.lineup_model.interaction, digits([fit.lineup_model.interaction]))), true);
    const note = page.locator('[data-field="fit-note"]');
    eq(`${label} opponents`, num(await note.getAttribute("data-opponents")), fit.opponents);
    eq(`${label} panel`, num(await note.getAttribute("data-panel")), fit.panel_size);
    eq(`${label} refits`, num(await note.getAttribute("data-refits")), fit.refits);
    const slots = await page.evaluate(() => [...document.querySelectorAll("[data-slot]")].map(s => ({
      id: s.dataset.slot, name: s.querySelector(".lm-slot-name")?.textContent, team: s.querySelector('[data-field="team"]')?.dataset.value, teamText: s.querySelector('[data-field="team"]')?.innerText, logos: s.querySelectorAll('[data-field="team"] img, [data-field="team"] svg').length,
      status: s.querySelector('[data-field="status"]')?.textContent, statusCode: s.querySelector('[data-field="status"]')?.dataset.status, rating: s.querySelector('[data-field="rating"]')?.dataset.value, additive: s.querySelector('[data-field="rating"]')?.dataset.additive, ratingText: s.querySelector('[data-field="rating"]')?.textContent, ratingIdentity: s.querySelector('[data-field="rating"]')?.dataset.identity ?? null,
      poss: s.querySelector('[data-field="possessions"]')?.dataset.value, possText: s.querySelector('[data-field="possessions"]')?.textContent, photo: s.querySelector(".player-portrait")?.getAttribute("src") ?? null, fallback: s.querySelectorAll(".player-portrait-fallback").length,
      tint: s.style.getPropertyValue("--lm-team"), clipped: s.querySelector(".lm-slot-name").scrollWidth > s.querySelector(".lm-slot-name").clientWidth + 1 })));
    eq(`${label} slot count`, slots.length, 5);
    eq(`${label} slot order`, slots.map(s => s.id).join(), ids.join());
    for (const s of slots) {
      const p = players.get(s.id), f = fit.players.find(x => x.player_id === s.id);
      eq(`${label} ${p.name} name`, s.name, p.name);
      eq(`${label} ${p.name} matches fit`, f.name, p.name);
      eq(`${label} ${p.name} team`, s.team, p.tricode);
      eq(`${label} ${p.name} team text`, s.teamText.trim(), p.tricode);
      eq(`${label} ${p.name} logo`, s.logos >= 1, true);
      eq(`${label} ${p.name} status`, s.statusCode, p.status);
      eq(`${label} ${p.name} status text`, s.status, STATUS[p.status]);
      eq(`${label} ${p.name} status matches fit`, f.status, p.status);
      eq(`${label} ${p.name} rating`, num(s.rating), p.ridge_rating);
      eq(`${label} ${p.name} additive`, num(s.additive), p.lineup_additive_rating);
      eq(`${label} ${p.name} rating text`, s.ratingText, signed(p.ridge_rating));
      eq(`${label} ${p.name} rating identity`, s.ratingIdentity, identity(p.ridge_rating));
      eq(`${label} ${p.name} possessions`, num(s.poss), p.window_possessions);
      eq(`${label} ${p.name} possessions text`, s.possText, `${count(p.window_possessions)} poss.`);
      eq(`${label} ${p.name} name clipped`, s.clipped, false);
      eq(`${label} ${p.name} tint`, s.tint.length > 0, true);
      if (s.photo) { eq(`${label} ${p.name} photo season`, s.photo.includes(`season=${p.photo_season}`), true); eq(`${label} ${p.name} photo team`, s.photo.includes(`team=${p.tricode}`), true); }
      else eq(`${label} ${p.name} photo or initials`, s.fallback, 1);
    }
    const on = await page.locator("circle[data-player][data-on]").evaluateAll(e => e.map(c => c.dataset.player));
    const want = ids.filter(id => onMap.has(id)).sort();
    eq(`${label} highlighted`, [...on].sort().join(), want.join());
    const missing = ids.filter(id => !onMap.has(id)).map(id => players.get(id).name);
    const missNote = page.locator('[data-field="map-missing"]');
    eq(`${label} map note count`, await missNote.count(), missing.length ? 1 : 0);
    if (missing.length) { const t = await missNote.innerText(); for (const n of missing) eq(`${label} map note names ${n}`, t.includes(n), true); }
    eq(`${label} key`, (await page.locator(".lm-key").innerText()).includes("The five chosen above"), label !== "default");
  };

  await open();

  // Answer and strip.
  const pooled = r.gains.lineup_over_ridge.pooled, home = r.gains.ridge_over_home_only.pooled;
  const edgeDigits = digits([pooled.gain, pooled.low, pooled.high]);
  const headline = await page.locator(".lm-headline").innerText();
  eq("verdict is ridge better", r.verdict, "ridge_better");
  eq("headline: answer", headline.startsWith("No."), true);
  eq("headline: both miss by the same", fixed(r.models.lineup.pooled.wrmse), fixed(r.models.ridge.pooled.wrmse));
  eq("headline: error", headline.includes(`${fixed(r.models.lineup.pooled.wrmse)} points per 100`), true);
  eq("headline: edge 0.000011", headline.includes("0.000011 per 100"), true);
  eq("headline: edge served", fixed(Math.abs(pooled.gain), edgeDigits), "0.000011");
  eq("headline: not a win", headline.includes("no practical difference"), true);
  const ratio = Math.abs(home.gain / pooled.gain), unit = 10 ** (Math.floor(Math.log10(ratio)) - 1), rounded = Math.round(ratio / unit) * unit;
  eq("ratio", num(await page.locator('[data-field="edge"]').getAttribute("data-ratio")), rounded);
  eq("ratio text", (await page.locator('[data-field="edge"]').innerText()).includes(`about ${count(rounded)} times`), true);
  eq("rule line", (await page.locator('[data-field="rule-line"]').innerText()).includes(`${r.test_seasons.length - r.seasons_lineup_lower} of ${r.test_seasons.length} seasons`), true);
  const strip = page.locator('[data-chart="scale"]');
  const left = num(await strip.getAttribute("data-left")), right = num(await strip.getAttribute("data-right"));
  for (const key of ["ridge_over_home_only", "lineup_over_home_only", "lineup_over_ridge"]) {
    const g = r.gains[key].pooled, row = strip.locator(`[data-key="${key}"]`), d = digits([g.gain, g.low, g.high]);
    eq(`strip ${key} value`, num(await row.getAttribute("data-value")), g.gain);
    eq(`strip ${key} low`, num(await row.getAttribute("data-low")), g.low);
    eq(`strip ${key} high`, num(await row.getAttribute("data-high")), g.high);
    eq(`strip ${key} text`, await row.locator("strong").innerText(), signed(g.gain, d));
    eq(`strip ${key} band`, await row.locator("small").innerText(), band(g, d));
    eq(`strip ${key} inside the scale`, g.low >= left && g.high <= right, true);
    eq(`strip ${key} tone`, await row.locator("strong").getAttribute("data-tone"), key === "lineup_over_ridge" ? null : tone(g));
    const at = v => `${((v - left) / (right - left)) * 100}%`;
    const range = await row.locator(".lm-range").evaluate(e => ({ low: e.style.getPropertyValue("--lm-low"), high: e.style.getPropertyValue("--lm-high"), at: e.style.getPropertyValue("--lm-at"), zero: e.style.getPropertyValue("--lm-zero") }));
    eq(`strip ${key} bar low`, range.low, at(g.low)); eq(`strip ${key} bar high`, range.high, at(g.high)); eq(`strip ${key} bar dot`, range.at, at(g.gain)); eq(`strip ${key} bar zero`, range.zero, at(0));
  }

  // The test.
  const test = await readTable(page, "test");
  eq("test rows", test.map(t => t.key).join(), [...r.test_seasons, "pooled"].join());
  for (const t of test) {
    const pool = t.key === "pooled", pick = b => pool ? b.pooled : b.seasons[t.key];
    for (const [key, tinted] of [["lineup_over_ridge", false], ["lineup_over_home_only", true], ["ridge_over_home_only", true]]) {
      const c = t.cells[key], g = pick(r.gains[key]), d = digits([g.gain, g.low, g.high]);
      eq(`test ${t.key} ${key}`, num(c.value), g.gain); eq(`test ${t.key} ${key} low`, num(c.low), g.low); eq(`test ${t.key} ${key} high`, num(c.high), g.high);
      eq(`test ${t.key} ${key} text`, c.main, signed(g.gain, d)); eq(`test ${t.key} ${key} band`, c.sub, band(g, d));
      eq(`test ${t.key} ${key} tone`, c.tone, tinted ? tone(g) : null);
    }
    for (const model of ["lineup", "ridge", "home_only"]) {
      const c = t.cells[model], s = pick(r.models[model]);
      eq(`test ${t.key} ${model}`, num(c.value), s.wrmse); eq(`test ${t.key} ${model} low`, num(c.low), s.low); eq(`test ${t.key} ${model} high`, num(c.high), s.high);
      eq(`test ${t.key} ${model} text`, c.main, fixed(s.wrmse, 3)); eq(`test ${t.key} ${model} band`, c.sub, plainBand(s));
    }
    const stints = pool ? r.test_seasons.reduce((n, s) => n + r.diagnostics[s].test_stints, 0) : r.diagnostics[t.key].test_stints;
    const games = pool ? r.test_seasons.reduce((n, s) => n + r.diagnostics[s].test_games, 0) : r.diagnostics[t.key].test_games;
    eq(`test ${t.key} counts`, t.lead.includes(`${count(stints)} stints`) && t.lead.includes(`${count(games)} games`), true);
  }
  const all = ["lineup", "ridge", "home_only"].flatMap(m => [...Object.values(r.models[m].seasons), r.models[m].pooled].map(s => s.wrmse));
  eq("noise low", num(await page.locator('[data-field="noise"]').getAttribute("data-low")), Math.min(...all));
  eq("noise high", num(await page.locator('[data-field="noise"]').getAttribute("data-high")), Math.max(...all));
  const diag = await readTable(page, "diagnostics");
  eq("diagnostics rows", diag.map(d => d.key).join(), r.test_seasons.join());
  for (const d of diag) {
    const x = r.diagnostics[d.key];
    eq(`diag ${d.key} interaction`, num(d.cells.interaction.value), x.interaction_sd_per100); eq(`diag ${d.key} interaction text`, d.cells.interaction.main, fixed(x.interaction_sd_per100, 4));
    eq(`diag ${d.key} largest`, num(d.cells.largest.value), x.max_abs_interaction_per100); eq(`diag ${d.key} largest text`, d.cells.largest.main, fixed(x.max_abs_interaction_per100, 4));
    eq(`diag ${d.key} additive`, num(d.cells.additive.value), x.additive_sd_per100); eq(`diag ${d.key} additive text`, d.cells.additive.main, fixed(x.additive_sd_per100, 2));
    eq(`diag ${d.key} correlation`, num(d.cells.correlation.value), x.prediction_correlation_with_ridge); eq(`diag ${d.key} correlation text`, d.cells.correlation.main, fixed(x.prediction_correlation_with_ridge, 10));
    eq(`diag ${d.key} correlation isn't 1.0000`, d.cells.correlation.main === "1.0000000000", false);
    eq(`diag ${d.key} more than a thousand times smaller`, x.additive_sd_per100 / x.interaction_sd_per100 > 1000, true);
  }

  // The backtest.
  const back = await readTable(page, "backtest");
  eq("backtest order", back.map(b => b.key).join(), ORDER.join());
  eq("backtest row set is the served set", [...ORDER].sort().join(), Object.keys(bt.candidates).sort().join());
  for (const b of back) {
    const c = bt.candidates[b.key];
    eq(`backtest ${b.key} rmse`, num(b.cells.rmse.value), c.pooled.rmse); eq(`backtest ${b.key} rmse text`, b.cells.rmse.main, fixed(c.pooled.rmse));
    eq(`backtest ${b.key} rmse low`, num(b.cells.rmse.low), c.pooled.intervals.rmse.low); eq(`backtest ${b.key} rmse high`, num(b.cells.rmse.high), c.pooled.intervals.rmse.high);
    eq(`backtest ${b.key} rmse band`, b.cells.rmse.sub, plainBand(c.pooled.intervals.rmse));
    eq(`backtest ${b.key} label`, b.lead.split("\n")[0], LABEL[b.key]);
    eq(`backtest ${b.key} scope`, b.lead.includes(`${c.test_seasons.map(s => s.slice(2)).join(", ")} · ${count(c.pooled.games)} games`), true);
    if (b.key === "lineup_model") { eq("backtest model cell", b.cells.gain.main, "The model"); eq("backtest model verdict", b.cells.verdict.value, ""); continue; }
    const g = lineupGain(b.key), d = digits([g.gain, g.low, g.high]);
    eq(`backtest ${b.key} gain`, num(b.cells.gain.value), g.gain); eq(`backtest ${b.key} gain low`, num(b.cells.gain.low), g.low); eq(`backtest ${b.key} gain high`, num(b.cells.gain.high), g.high);
    eq(`backtest ${b.key} gain text`, b.cells.gain.main, signed(g.gain, d)); eq(`backtest ${b.key} gain band`, b.cells.gain.sub, band(g, d));
    eq(`backtest ${b.key} tone`, b.cells.gain.tone, b.key === "lineup_ridge" ? null : tone(g));
    eq(`backtest ${b.key} verdict`, b.cells.verdict.value, bt.verdict.lineup_model_against[b.key]);
    eq(`backtest ${b.key} verdict text`, b.cells.verdict.verdict, b.key === "lineup_ridge" ? "Better by the registered rule, no practical difference" : VERDICT[bt.verdict.lineup_model_against[b.key]]);
  }
  const backLine = await page.locator('[data-field="backtest-line"]').innerText();
  eq("backtest line says gain", backLine.includes("gain in final-margin error"), true);
  for (const name of ["team_net", "time_decay", "time_decay_opener", "lineup_ridge"]) { const g = lineupGain(name); eq(`backtest line ${name}`, backLine.includes(signed(g.gain, digits([g.gain, g.low, g.high]))), true); }
  const samples = await page.locator('[data-field="samples"]').innerText();
  eq("samples names both", samples.includes("Box-prior RAPM") && samples.includes("Projected Impact"), true);
  eq("two-season rows are those", ORDER.filter(n => bt.candidates[n].test_seasons.length < 3).join(), "box_prior_rapm,projected_impact");
  eq("best", (await page.locator('[data-field="best"]').innerText()).includes(LABEL[bt.verdict.best[0]]), true);
  eq("link to the full backtest", await page.getByRole("link", { name: "Every metric head to head in Metric Backtest" }).getAttribute("href"), "/research/backtest");

  // The map: every point, and the warning above it.
  const dots = await page.locator("circle[data-player]").evaluateAll(list => Object.fromEntries(list.map(c => [c.dataset.player, { x: c.dataset.x, y: c.dataset.value, title: c.querySelector("title")?.textContent, fill: getComputedStyle(c).fill, on: c.hasAttribute("data-on") }])));
  eq("map dots", Object.keys(dots).length, map.points.length);
  for (const p of map.points) {
    const d = dots[p.player_id];
    if (!d) { eq(`map ${p.player_id} present`, false, true); continue; }
    eq(`map ${p.name} x`, num(d.x), p.x); eq(`map ${p.name} y`, num(d.y), p.y);
    eq(`map ${p.name} hover`, d.title, `${p.name}, ${p.tricode} (${p.photo_season})`);
  }
  const s = map.seed_stability;
  eq("seed mean is 1.9%", pct(s.mean_overlap), "1.9%"); eq("seed chance is 1.8%", pct(s.chance), "1.8%");
  const warning = await page.locator('[data-field="seed-warning"]').innerText();
  eq("warning text", warning.includes("Read this map as noise") && warning.includes("1.9%") && warning.includes("1.8%"), true);
  eq("seed value", num(await page.locator('[data-field="seed-stability"]').getAttribute("data-value")), s.mean_overlap);
  eq("seed chance value", num(await page.locator('[data-field="seed-chance"]').getAttribute("data-value")), s.chance);
  eq("warning above the map", await page.evaluate(() => Boolean(document.querySelector('[data-field="seed-warning"]').compareDocumentPosition(document.querySelector("circle[data-player]")) & Node.DOCUMENT_POSITION_FOLLOWING)), true);
  const dotColours = await page.evaluate(() => { const probe = document.createElement("span"); probe.style.color = "var(--color-category-3)"; document.body.append(probe); const c = getComputedStyle(probe).color; probe.remove(); const on = document.querySelector("circle[data-on]"), off = document.querySelector("circle[data-player]:not([data-on])"); return { want: c, on: getComputedStyle(on).fill, off: getComputedStyle(off).fill }; });
  eq("the five take category 3", dotColours.on, dotColours.want);
  eq("other dots are neutral", dotColours.off !== dotColours.want, true);

  // The first-load tool and the shape of the page before anything is opened.
  await checkFive("default", def);
  eq("default note", (await page.locator('[data-field="five-note"]').innerText()).includes("most-used lineup"), true);
  eq("no reset on default", await page.getByRole("button", { name: "Most-used five" }).count(), 0);
  const gap = Math.max(...roster.players.map(p => Math.abs(p.ridge_rating - p.lineup_additive_rating)));
  eq("rating gap", num(await page.locator('[data-field="rating-gap"]').getAttribute("data-value")), gap);
  eq("rating gap text", (await page.locator('[data-field="rating-gap"]').innerText()).includes(`at most ${fixed(gap, 4)} across all ${count(roster.players.length)} players`), true);
  const collapsedHeight = await page.evaluate(() => document.documentElement.scrollHeight);
  eq("about collapsed", await page.locator("#about details").getAttribute("open"), null);
  eq("glossary collapsed", await page.locator("#glossary details").getAttribute("open"), null);
  if (shots) {
    await page.screenshot({ path: `${shots}/lm-top-${tag}.png` });
    await page.screenshot({ path: `${shots}/lm-full-${tag}.png`, fullPage: true });
    await shot("answer", "#answer"); await shot("tool", "#tool"); await shot("test", "#test"); await shot("backtest", "#backtest"); await shot("map", "#map"); await shot("reading", "#reading");
  }

  // Search in place.
  const firstName = players.get(def[0]).name, wanted = byRating.find(p => !def.includes(p.player_id) && p.name.split(" ").at(-1).length > 4);
  await page.getByRole("button", { name: `Replace ${firstName}` }).click();
  const box = page.getByRole("combobox", { name: `Replace ${firstName}` });
  eq("search opens in place", await box.isVisible(), true);
  const opened = await page.evaluate(id => { const slot = document.querySelector(`[data-slot="${id}"]`), s = slot.getBoundingClientRect(), f = slot.querySelector(".lookup-input-wrapper").getBoundingClientRect(), t = slot.querySelector(".lm-slot-tool").getBoundingClientRect(), others = [...document.querySelectorAll("[data-slot]")].filter(x => x !== slot).map(x => x.querySelector(".lm-slot-rating").getBoundingClientRect().top), r = slot.querySelector(".lm-slot-rating").getBoundingClientRect(); return { inside: f.left >= s.left && f.right <= s.right, rating: r.height > 0 && !!slot.querySelector('[data-field="rating"]'), toolTop: Math.round(t.top - s.top), toolRight: Math.round(s.right - t.right), buttonsInField: slot.querySelectorAll(".lookup-input-wrapper button").length, buttonsOutside: [...slot.querySelectorAll("button")].filter(b => !b.closest(".lm-slot-tool")).length, list: document.querySelectorAll(".lookup-dropdown").length, ratingOffset: others.length ? Math.abs(r.top - others[0]) : 0, width: Math.round(f.width), inputWidth: Math.round(slot.querySelector(".lookup-input").getBoundingClientRect().width) }; }, def[0]);
  eq("search field inside the card", opened.inside, true);
  eq("card keeps its rating", opened.rating, true);
  eq("no list before typing", opened.list, 0);
  eq("no button in the field", opened.buttonsInField, 0);
  eq("only the card's own tool", opened.buttonsOutside, 0);
  if (wide) eq("rating doesn't move", opened.ratingOffset <= 2, true);
  await box.fill(wanted.name.split(" ").at(-1));
  await page.waitForSelector('[role="option"]', { timeout: 15000 });
  if (shots) await page.screenshot({ path: `${shots}/lm-search-${tag}.png` });
  const options = await page.locator('[role="option"]').count();
  eq("search offers players", options > 0, true);
  const suggestion = page.locator('[role="option"]', { hasText: wanted.name }).first();
  const suggested = await suggestion.evaluate(e => ({ src: e.querySelector("img.player-portrait")?.getAttribute("src") ?? "", logo: e.querySelectorAll(".team-logo-stack img, .team-logo-stack svg, .team-logo").length }));
  eq("suggestion photo is the season's", suggested.src.includes(`season=${wanted.photo_season}`), true);
  eq("suggestion has a logo", suggested.logo >= 1, true);
  await suggestion.click();
  const swapped = [wanted.player_id, ...def.slice(1)];
  await page.waitForFunction(id => new URL(location.href).searchParams.get("five")?.startsWith(id), wanted.player_id);
  await page.waitForFunction(id => document.querySelector("[data-slot]")?.dataset.slot === id, wanted.player_id);
  await page.waitForSelector(READY, { state: "attached" });
  await page.waitForTimeout(400);
  await checkFive("via search", swapped);
  // Each way out of the search.
  const secondName = players.get(def[1]).name, leave = async how => { await page.getByRole("button", { name: `Replace ${secondName}` }).click(); await page.getByRole("combobox", { name: `Replace ${secondName}` }).waitFor(); await how(); await page.waitForTimeout(150); eq("search closed", await page.getByRole("combobox", { name: `Replace ${secondName}` }).count(), 0); };
  await leave(() => page.keyboard.press("Escape"));
  await leave(() => page.getByRole("button", { name: `Cancel replacing ${secondName}` }).click());
  await leave(() => page.locator(".lm-headline").click());
  await page.getByRole("button", { name: "Most-used five" }).click();
  await page.waitForFunction(() => !new URL(location.href).searchParams.has("five"));
  await page.waitForSelector(READY, { state: "attached" });
  await page.waitForTimeout(400);
  await checkFive("default", def);

  // A spread of fives.
  for (const [label, ids] of FIVES.slice(0, wide ? FIVES.length : 4)) {
    await open(`?five=${ids.join(",")}`);
    await page.waitForFunction(first => document.querySelector("[data-slot]")?.dataset.slot === first, ids[0]);
    await checkFive(label, ids);
    if (shots && label === "one box player") { await shot("tool-box", "#tool"); await shot("map-box", "#map"); }
    if (shots && label === "five box players") await shot("tool-all-box", "#tool");
  }
  // A five the fit has never heard of falls back to the default, and so does a repeated player.
  await open(`?five=${def.slice(0, 4).join(",")},999999999`);
  await page.waitForFunction(id => document.querySelector("[data-slot]:nth-of-type(5)")?.dataset.slot === id, def[4]);
  await open(`?five=${def.slice(0, 4).join(",")},${def[0]}`);
  await page.waitForFunction(id => document.querySelector("[data-slot]:nth-of-type(5)")?.dataset.slot === id, def[4]);

  // About: every grid.
  await open();
  await page.locator("#about summary").click();
  await page.locator("#glossary summary").click();
  await page.waitForTimeout(200);
  const alpha = await readTable(page, "alpha-grid");
  eq("alpha rows", alpha.map(a => a.key).join(), Object.keys(sel.ridge_alpha_grid).join());
  for (const a of alpha) { const row = sel.ridge_alpha_grid[a.key]; for (const season of sel.seasons) { eq(`alpha ${a.key} ${season}`, num(a.cells[season].value), row.seasons[season]); eq(`alpha ${a.key} ${season} text`, a.cells[season].main, fixed(row.seasons[season], 3)); } eq(`alpha ${a.key} pooled`, num(a.cells.pooled.value), row.pooled); eq(`alpha ${a.key} chosen`, a.lead.includes("Chosen"), Number(a.key) === sel.selected_alpha); }
  const grid = await readTable(page, "lineup-grid");
  eq("lineup-grid rows, by size then penalty", grid.map(a => a.key).join(), Object.entries(sel.lineup_grid).sort(([, a], [, b]) => a.dim - b.dim || a.penalty - b.penalty).map(([k]) => k).join());
  for (const a of grid) { const row = sel.lineup_grid[a.key]; eq(`grid ${a.key} penalty`, num(a.cells.penalty.value), row.penalty); eq(`grid ${a.key} dim`, a.lead.split("\n")[0], String(row.dim)); for (const season of sel.seasons) eq(`grid ${a.key} ${season}`, num(a.cells[season].value), row.seasons[season]); eq(`grid ${a.key} pooled`, num(a.cells.pooled.value), row.pooled); eq(`grid ${a.key} chosen`, a.lead.includes("Chosen"), a.key === sel.selected_config.key); }
  const coverage = await readTable(page, "coverage");
  eq("coverage rows", coverage.map(a => a.key).join(), Object.keys(cov.seasons).join());
  for (const a of coverage) { const v = cov.seasons[a.key]; eq(`coverage ${a.key} games`, num(a.cells.games.value), v.games); eq(`coverage ${a.key} stints`, num(a.cells.stints.value), v.stints); eq(`coverage ${a.key} usable`, num(a.cells.usable.value), v.usable_stints); eq(`coverage ${a.key} possessions`, num(a.cells.possessions.value), v.usable_possessions); eq(`coverage ${a.key} share`, a.cells.possessions.sub, pct(v.usable_possessions / v.possessions)); eq(`coverage ${a.key} players`, num(a.cells.players.value), v.players); }
  const cold = await readTable(page, "cold-start");
  eq("cold rows", cold.map(a => a.key).join(), Object.keys(cov.cold_start).join());
  for (const a of cold) {
    const v = cov.cold_start[a.key];
    eq(`cold ${a.key} own`, num(a.cells.own.value), v.target ? v.target.own_embedding : v.own_embedding);
    eq(`cold ${a.key} box`, num(a.cells.box.value), v.target ? v.target.box_fallback : v.fallback_in_window);
    eq(`cold ${a.key} window`, a.lead.includes(`From ${v.window[0]} to ${v.window.at(-1)}`), true);
    if (v.target) { eq(`cold ${a.key} new`, num(a.cells.new.value), v.target.newcomer_no_box_in_window); eq(`cold ${a.key} shares`, a.cells.shares.main, `${pct(v.target.possession_share_own)} / ${pct(v.target.possession_share_box_fallback)} / ${pct(v.target.possession_share_newcomer)}`); }
    else { eq(`cold ${a.key} new is unknown`, a.cells.new.main, "—"); eq(`cold ${a.key} not scored`, a.cells.shares.main, "Not scored"); }
  }
  const subsets = await readTable(page, "subsets");
  eq("subset rows", subsets.map(a => a.key).join(), r.test_seasons.join());
  for (const a of subsets) for (const key of ["all_ten_own", "any_fallback"]) { const v = r.subsets[key][a.key]; eq(`subset ${a.key} ${key} ridge`, num(a.cells[`${key}-ridge`].value), v.ridge); eq(`subset ${a.key} ${key} lineup`, num(a.cells[`${key}-lineup`].value), v.lineup); eq(`subset ${a.key} ${key} share`, a.cells[`${key}-share`].main, pct(v.possession_share)); eq(`subset ${a.key} ${key} stints`, a.cells[`${key}-share`].sub, `${count(v.stints)} stints`); }
  eq("results hash", await page.locator('[data-field="results-sha"]').getAttribute("data-value"), r.results_sha256);
  const seedDetail = await page.locator('[data-field="seed-detail"]').innerText();
  for (const [seed, v] of Object.entries(s.overlap_with_seed_1401)) eq(`seed detail ${seed}`, seedDetail.includes(`seed ${seed} ${pct(v)}`), true);
  const caveats = await page.locator('[data-field="caveats"] li').allInnerTexts();
  eq("caveat count", caveats.length, page0.caveats.length);
  const credits = await page.locator('[data-field="credits"]').innerText();
  for (const c of page0.credits) eq(`credit ${c.what}`, credits.includes(c.what), true);
  for (const name of ["Rosenbaum", "Sill", "McInnes", "Vaswani"]) eq(`credit names ${name}`, credits.includes(name), true);
  eq("evidence link", (await page.getByRole("link", { name: "How the lineup model was built" }).getAttribute("href")).includes("docs/evidence/research/r14/README.md"), true);
  if (shots) { await shot("about", "#about"); await shot("glossary", "#glossary"); }

  // No column of dashes, in any table on the page.
  for (const name of ["fit", "test", "diagnostics", "backtest", "alpha-grid", "lineup-grid", "coverage", "subsets"]) {
    const table = await readTable(page, name);
    for (const key of Object.keys(table[0].cells)) eq(`${name} column ${key} isn't all dashes`, table.some(t => t.cells[key].text.trim() !== "—"), true);
  }

  const layout = await page.evaluate(w => {
    const root = document.querySelector(".lm-page");
    const visible = e => { const b = e.getBoundingClientRect(), c = getComputedStyle(e); return b.width > 0 && b.height > 0 && c.visibility !== "hidden" && c.display !== "none"; };
    const small = w < 600 ? [...root.querySelectorAll(":is(button, select, input:not([type=hidden]), summary)")].filter(visible).filter(e => e.getBoundingClientRect().height < 40 && !e.closest("thead") && !e.closest(".lookup-listbox")).map(e => `${e.tagName}:${e.getAttribute("aria-label") ?? e.textContent.slice(0, 24)}:${e.getBoundingClientRect().height}`) : [];
    const icon = root.querySelector(".ui-page-header-icon")?.getBoundingClientRect(), svg = root.querySelector(".ui-page-header-icon svg")?.getBoundingClientRect();
    const text = root.innerText;
    const slots = [...root.querySelectorAll("[data-slot]")];
    return {
      overflow: document.documentElement.scrollWidth - innerWidth, broken: [...document.images].filter(i => i.complete && i.naturalWidth === 0).length, images: root.querySelectorAll("img").length,
      slotPhotos: root.querySelectorAll("[data-slot] .player-portrait").length, slotFallbacks: root.querySelectorAll("[data-slot] .player-portrait-fallback").length, small, column: Math.round(root.getBoundingClientRect().width), height: document.documentElement.scrollHeight,
      fractionalControlHeights: [...root.querySelectorAll(":is(button, select)")].filter(visible).filter(e => { const h = e.getBoundingClientRect().height; return Math.abs(h - Math.round(h)) > 0.01; }).length,
      iconCentred: icon && svg ? Math.abs((icon.left + icon.width / 2) - (svg.left + svg.width / 2)) <= 1 && Math.abs((icon.top + icon.height / 2) - (svg.top + svg.height / 2)) <= 1 : null,
      projectWords: (text.match(/\b(courtlens-lineup|commit|branch|R\d\d|IM02|runner|owner|the plan|docs\/evidence)\b/gi) ?? []), arrows: /[→←↑↓]/.test(text), isoDates: (text.match(/\b20\d\d-\d\d-\d\d\b/g) ?? []).length, hyphenMinus: (text.match(/(?<![\w–-])-\d+\.\d/g) ?? []).length,
      sectionBorders: [...root.querySelectorAll(":scope > .rs-section")].filter(s => parseFloat(getComputedStyle(s).borderTopWidth) > 0).length,
      cardEdges: slots.map(c => parseFloat(getComputedStyle(c).borderLeftWidth)).reduce((a, b) => Math.max(a, b), 0), watermarks: root.querySelectorAll(".lm-slot > img").length,
      selects: root.querySelectorAll("select").length, inlineStylesWithoutVars: [...root.querySelectorAll("[style]")].filter(e => !e.closest(".lm-page table") && [...e.style].some(p => !p.startsWith("--"))).map(e => e.className).slice(0, 5),
      gainOnScreen: (() => { const g = root.querySelector('table[data-table="test"] tbody tr td[data-column="lineup_over_ridge"]').getBoundingClientRect(); return g.right <= innerWidth; })(),
      fitIntervalOnScreen: (() => { const g = root.querySelector('table[data-table="fit"] tbody tr td[data-column="interval"]').getBoundingClientRect(); return g.right <= innerWidth; })(),
      backtestGainOnScreen: (() => { const g = root.querySelector('table[data-table="backtest"] tbody tr td[data-column="gain"]').getBoundingClientRect(); return g.right <= innerWidth; })(),
      subsOverflow: [...root.querySelectorAll(".rs-grid-sub")].filter(e => { const td = e.closest("td"); if (!td) return false; const b = document.createRange(); b.selectNodeContents(e); const r = b.getBoundingClientRect(), c = td.getBoundingClientRect(); return r.right > c.right + 0.5 || r.left < c.left - 0.5; }).length,
      toolOnNameLine: w < 600 ? slots.map(s => { const a = s.querySelector(".lm-slot-tool").getBoundingClientRect(), n = s.querySelector(".lm-slot-name").getBoundingClientRect(); return a.top < n.bottom && a.bottom > n.top; }).every(Boolean) : null,
      namesWiderThanCard: (() => { const ctx = document.createElement("canvas").getContext("2d"); return [...root.querySelectorAll(".lm-slot-name")].filter(n => { const c = getComputedStyle(n); ctx.font = `${c.fontWeight} ${c.fontSize} ${c.fontFamily}`; return n.textContent.split(/\s+/).some(word => ctx.measureText(word).width > n.closest(".lm-slot-copy").getBoundingClientRect().width + 0.5); }).map(n => n.textContent); })(),
      scaleAligned: (() => { const row = root.querySelector('[data-chart="scale"] .lm-range'); const zero = row.querySelector(".lm-range-zero").getBoundingClientRect(), r = row.getBoundingClientRect(), z = root.querySelector('[data-chart="scale"] [data-end="zero"]').getBoundingClientRect(), a = root.querySelector('[data-chart="scale"] [data-end="left"]').getBoundingClientRect(), b = root.querySelector('[data-chart="scale"] [data-end="right"]').getBoundingClientRect(); return { zero: Math.round(Math.abs(z.left + z.width / 2 - zero.left) * 10) / 10, left: Math.round(Math.abs(a.left - r.left) * 10) / 10, right: Math.round(Math.abs(b.right - r.right) * 10) / 10 }; })(),
    };
  }, width);

  eq("strip scale lines up with its bars", layout.scaleAligned.zero <= 1 && layout.scaleAligned.left <= 1 && layout.scaleAligned.right <= 1, true);
  eq("80% interval on screen", layout.fitIntervalOnScreen, true);

  // The hosted demo's state: no weights. Only the tool goes; everything else stays.
  await page.route("**/api/lineup-model", async route => { const body = JSON.parse(JSON.stringify(page0)); body.serving.tool_available = false; await route.fulfill({ json: body, headers: { "access-control-allow-origin": "*" } }); });
  await page.route("**/api/lineup-model/players", route => route.fulfill({ json: { state: "unavailable", players: [] }, headers: { "access-control-allow-origin": "*" } }));
  await open("", '[data-field="tool-unavailable"]');
  eq("no weights: one line", (await page.locator('[data-field="tool-unavailable"]').innerText()).startsWith("The lineup tool needs"), true);
  eq("no weights: no cards", await page.locator("[data-slot]").count(), 0);
  eq("no weights: no pickers", await page.locator('#tool [role="combobox"]').count(), 0);
  eq("no weights: no default note", await page.locator('[data-field="five-note"]').count(), 0);
  eq("no weights: test stays", (await readTable(page, "test")).length, 4);
  eq("no weights: backtest stays", (await readTable(page, "backtest")).length, 11);
  eq("no weights: map stays", await page.locator("circle[data-player]").count(), map.points.length);
  eq("no weights: warning stays", await page.locator('[data-field="seed-warning"]').count(), 1);
  eq("no weights: the most-used five stay marked", await page.locator("circle[data-on]").count(), def.filter(id => onMap.has(id)).length);
  if (shots) await shot("tool-unavailable", "#tool");
  await page.unroute("**/api/lineup-model"); await page.unroute("**/api/lineup-model/players");

  const result = { width, collapsedHeight, compared, loads, mismatches: mismatches.length, errors: [...new Set(errors)].slice(0, 12), ...layout, firstMismatches: mismatches.slice(0, 30) };
  report.push(result);
  console.log(JSON.stringify({ ...result, firstMismatches: mismatches.slice(0, 12) }, null, 1));
  await page.close();
}
await browser.close();
if (out) writeFileSync(out, JSON.stringify(report, null, 1));
