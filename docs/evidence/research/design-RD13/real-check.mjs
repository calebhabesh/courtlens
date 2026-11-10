// Real-data check for RD13 (Signal vs Noise): every value the page draws against the owner's API through the read-only proxy on 4180
// (../design-RD10/readonly-proxy.mjs), the production build on 3180, at 1440 and 390. Walks both strip families, every stat's curve and bins
// (all 20 at 1440, six at 390), the stabilization grid, a spread of worked examples (the default, a long career, a 1980s season, the live
// season with rim unknown, a season with no games) with their season pickers against the career endpoint, every path series, every test band,
// every prior series, What this doesn't cover and About. Also the search in place, colour rules, console errors, overflow, broken images,
// photos, logos, native selects, ISO dates, hyphen-minus numbers and project words. Formats and lookups are written here independently of
// lib/signal-noise.ts. Round 4 adds the grouped curve picker, the marks on each curve, units spelled out in sentences, the what-if (every
// available stat starts at the served shrunk value, and one slider move is recomputed here from the served prior) and the phone test view.
// Usage: node real-check.mjs <report.json> [<shots dir>]
import { chromium } from "/home/ethioking/dev/courtlens/dashboard/node_modules/playwright/index.mjs";
import { writeFileSync } from "node:fs";
const API = "http://127.0.0.1:4180", WEB = "http://localhost:3180/research/signal-noise";
const [,, out, shots] = process.argv;
const get = async path => (await fetch(`${API}${path}`)).json();
const S = await get("/api/signal-noise");

// The page's formats, written again.
const whole = n => Math.round(n).toLocaleString("en-US");
const rho = (v, d = 3) => v.toFixed(d);
const pct = (v, d = 1) => `${(v * 100).toFixed(d)}%`;
const sgn = (v, d = 1) => { const t = Math.abs(v).toFixed(d); return Number(t) === 0 ? t : `${v > 0 ? "+" : "−"}${t}`; };
const unit = s => s.family === "per_36" ? "min" : s.unit;
const sample = (v, s) => `${whole(v)} ${unit(s)}`;
const WORDS = { FGA: "field-goal attempts", "2PA": "two-point attempts", "3PA": "three-point attempts", FTA: "free-throw attempts", TSA: "true-shooting attempts", "rim FGA": "attempts at the rim", minutes: "minutes" };
const words = (v, s) => `${whole(v)} ${s.family === "per_36" ? "minutes" : WORDS[s.unit]}`;
const isReached = l => l?.status === "reached" && typeof l.n === "number";
const num = v => v === null || v === undefined || v === "" ? null : Number(v);
const STAT = { fg3_pct: "3P%", ft_pct: "FT%", fg2_pct: "2P%", rim_fg_pct: "Rim FG%", ts_pct: "TS%" };
const BAND = { "under 50": "Under 50", "50-199": "50–199", "200 or more": "200 or more" };
const TESTS = ["fg3_pct", "ft_pct", "fg2_pct", "ts_pct", "rim_fg_pct"];

let checked = 0;
const mismatches = [];
const eq = (where, got, want) => {
  checked += 1;
  const ok = typeof want === "number" ? got !== null && Math.abs(Number(got) - want) <= 1e-9 * Math.max(1, Math.abs(want)) : got === want;
  if (!ok) mismatches.push({ where, got, want });
};
const has = (where, text, want) => { checked += 1; if (!String(text).includes(want)) mismatches.push({ where, got: String(text).slice(0, 200), want }); };

const largest = s => [...s.bins].filter(b => b.reported).sort((a, b) => b.n - a.n)[0];
const order = family => S.stabilization.stats.filter(s => s.family === family).sort((a, b) => {
  const k = s => isReached(s.levels["0.5"]) ? [0, s.levels["0.5"].n] : [1, s.levels["0.5"].largest_n];
  const [ga, va] = k(a), [gb, vb] = k(b); return ga - gb || va - vb;
});

const report = { checked: 0, mismatches: [], loads: [], layout: [] };
const browser = await chromium.launch();

async function open(page, query = "") {
  await page.goto(`${WEB}${query}`, { waitUntil: "load", timeout: 120000 });
  await page.waitForSelector(".sn-strip-row", { timeout: 60000 });
  await page.waitForSelector(".sn-card, .sn-example .gated-note, [data-field='path-empty'], .sn-example", { timeout: 60000 });
  await page.waitForFunction(() => !document.querySelector(".sn-example[data-stale]"), null, { timeout: 60000 });
  await page.waitForTimeout(800);
}

async function checkStrip(page, width) {
  for (const family of ["percentage", "per_36"]) {
    if (family === "per_36") await page.getByRole("radio", { name: "Per 36 minutes" }).click();
    else if (await page.locator('[data-chart="strip"][data-family="percentage"]').count() === 0) await page.getByRole("radio", { name: "Percentages" }).click();
    await page.waitForSelector(`[data-chart="strip"][data-family="${family}"]`);
    const rows = await page.locator(`[data-chart="strip"][data-family="${family}"] .sn-strip-row`).evaluateAll(els => els.map(e => ({
      ...e.dataset, text: e.querySelector(".sn-strip-value").textContent, dots: e.querySelectorAll(".sn-track-dot").length, seventyMarks: e.querySelectorAll(".sn-track-seventy").length,
      observed: e.querySelectorAll(".sn-track-observed").length })));
    const want = order(family);
    eq(`${width} strip ${family} order`, rows.map(r => r.stat).join(","), want.map(s => s.key).join(","));
    for (const [i, s] of want.entries()) {
      const r = rows[i] ?? {}, h = s.levels["0.5"], sv = s.levels["0.7"];
      eq(`${width} strip ${s.key} status`, r.status, h.status);
      eq(`${width} strip ${s.key} typical`, num(r.typical), s.median_sample);
      eq(`${width} strip ${s.key} largest`, num(r.largest), h.largest_n);
      if (isReached(h)) {
        eq(`${width} strip ${s.key} value`, num(r.value), h.n); eq(`${width} strip ${s.key} low`, num(r.low), h.interval.low); eq(`${width} strip ${s.key} high`, num(r.high), h.interval.high);
        eq(`${width} strip ${s.key} seventy`, num(r.seventy), sv.n);
        eq(`${width} strip ${s.key} text`, r.text, `${sample(h.n, s)}${whole(h.interval.low)} to ${whole(h.interval.high)}`);
        eq(`${width} strip ${s.key} dot`, r.dots, 1); eq(`${width} strip ${s.key} 0.7 mark`, r.seventyMarks, 1);
      } else {
        eq(`${width} strip ${s.key} no point`, r.dots + r.seventyMarks, 0); eq(`${width} strip ${s.key} observed`, r.observed, 1);
        eq(`${width} strip ${s.key} text`, r.text, `Not reached${rho(h.largest_rho, 2)} at ${sample(h.largest_n, s)}`);
      }
    }
    const grid = await page.locator('table[aria-label="Stabilization points"] tbody tr').evaluateAll(els => els.map(e => {
      const cell = f => e.querySelector(`[data-field="${f}"]`);
      return { stat: e.dataset.stat, lead: e.querySelector("th").textContent, half: { ...cell("level-0.5").dataset, text: cell("level-0.5").textContent }, seventy: { ...cell("level-0.7").dataset, text: cell("level-0.7").textContent },
        typical: { ...cell("typical").dataset, text: cell("typical").textContent }, largest: { ...cell("largest").dataset, text: cell("largest").textContent }, seasons: { ...cell("player-seasons").dataset, text: cell("player-seasons").textContent } };
    }));
    eq(`${width} grid ${family} order`, grid.map(r => r.stat).join(","), want.map(s => s.key).join(","));
    for (const [i, s] of want.entries()) {
      const r = grid[i]; if (!r) continue;
      eq(`${width} grid ${s.key} lead`, r.lead, `${s.label}${s.family === "per_36" ? "minutes" : s.unit}`);
      for (const [key, cell] of [["0.5", r.half], ["0.7", r.seventy]]) {
        const l = s.levels[key];
        eq(`${width} grid ${s.key} ${key} status`, cell.status, l.status);
        eq(`${width} grid ${s.key} ${key} extrapolated`, num(cell.extrapolated), l.extrapolated);
        eq(`${width} grid ${s.key} ${key} text`, cell.text, isReached(l) ? `${sample(l.n, s)}${whole(l.interval.low)} to ${whole(l.interval.high)}` : "Not reached");
        if (isReached(l)) eq(`${width} grid ${s.key} ${key} value`, num(cell.value), l.n);
      }
      eq(`${width} grid ${s.key} typical`, r.typical.text, sample(s.median_sample, s));
      const b = largest(s);
      eq(`${width} grid ${s.key} largest`, num(r.largest.value), b.rho); eq(`${width} grid ${s.key} largest n`, num(r.largest.n), b.n);
      eq(`${width} grid ${s.key} largest text`, r.largest.text, `${rho(b.rho)} at ${sample(b.n, s)}${rho(b.rho_interval.low)} to ${rho(b.rho_interval.high)}`);
      eq(`${width} grid ${s.key} seasons`, r.seasons.text, whole(s.eligible_player_seasons));
    }
  }
  await page.getByRole("radio", { name: "Percentages" }).click();
}

async function checkCurves(page, width) {
  const keys = width > 600 ? S.stabilization.stats.map(s => s.key) : ["fg3_pct", "ft_pct", "ts_pct", "rim_fg_pct", "stl_per_36", "pts_per_36"];
  for (const key of keys) {
    const s = S.stabilization.stats.find(x => x.key === key);
    await page.getByLabel("Curve stat").selectOption(key);
    await page.waitForSelector(`[data-chart="curve"][data-stat="${key}"]`);
    const c = await page.locator('[data-chart="curve"]').evaluate(e => ({ fitted: e.dataset.fitted, bins: [...e.querySelectorAll(".sn-bin")].map(b => ({ ...b.dataset })), line: document.querySelector('[data-field="curve-line"]').textContent,
      heading: document.querySelector("#curve h2").textContent, notDrawn: !!document.querySelector('[data-field="curve-not-drawn"]'),
      marks: [...e.querySelectorAll('[data-field="curve-mark"]')].map(m => ({ ...m.dataset })), typical: e.querySelector('[data-field="curve-typical"]')?.dataset.n ?? null }));
    const both = isReached(s.levels["0.5"]) && isReached(s.levels["0.7"]);
    eq(`${width} curve ${key} heading`, c.heading, `Reliability by sample size: ${s.label}`);
    eq(`${width} curve ${key} fitted`, c.fitted, both ? "drawn" : "not-drawn");
    eq(`${width} curve ${key} not-drawn note`, c.notDrawn, !both);
    const bins = s.bins.filter(b => b.reported);
    eq(`${width} curve ${key} bins`, c.bins.length, bins.length);
    bins.forEach((b, i) => { const d = c.bins[i] ?? {}; eq(`${width} curve ${key} bin ${b.bin} n`, num(d.n), b.n); eq(`${width} curve ${key} bin ${b.bin} rho`, num(d.value), b.rho); eq(`${width} curve ${key} bin ${b.bin} low`, num(d.low), b.rho_interval.low); eq(`${width} curve ${key} bin ${b.bin} high`, num(d.high), b.rho_interval.high); });
    const h = s.levels["0.5"], sv = s.levels["0.7"], lb = largest(s);
    eq(`${width} curve ${key} line`, c.line, both
      ? `${s.label} reaches 0.5 at ${words(h.n, s)} (${whole(h.interval.low)} to ${whole(h.interval.high)}) and 0.7 at ${words(sv.n, s)} (${whole(sv.interval.low)} to ${whole(sv.interval.high)}). A typical season has ${words(s.median_sample, s)}.`
      : `No bin of ${s.label} reaches 0.5. The largest, at ${words(lb.n, s)}, is ${rho(lb.rho)} (95% ${rho(lb.rho_interval.low)} to ${rho(lb.rho_interval.high)}). A typical season has ${words(s.median_sample, s)}.`);
    // The strip's marks on the curve: one per reached level, at its served point and interval; the typical season.
    const wantMarks = [["0.5", h], ["0.7", sv]].filter(([, l]) => isReached(l));
    eq(`${width} curve ${key} marks`, c.marks.map(m => m.level).join(","), wantMarks.map(([lv]) => lv).join(","));
    for (const [lv, l] of wantMarks) { const m = c.marks.find(x => x.level === lv) ?? {}; eq(`${width} curve ${key} mark ${lv} n`, num(m.n), l.n); eq(`${width} curve ${key} mark ${lv} low`, num(m.low), l.interval.low); eq(`${width} curve ${key} mark ${lv} high`, num(m.high), l.interval.high); }
    eq(`${width} curve ${key} typical`, num(c.typical), s.median_sample);
    // The bins table under it (collapsed, in the DOM).
    const rows = await page.locator(`table[aria-label="${s.label} bins"] tbody tr`).evaluateAll(els => els.map(e => Object.fromEntries([...e.querySelectorAll("td")].map(td => [td.dataset.field, { ...td.dataset, text: td.textContent }]))));
    eq(`${width} bins ${key} rows`, rows.length, s.bins.length);
    s.bins.forEach((b, i) => {
      const r = rows[i] ?? {};
      eq(`${width} bins ${key} ${b.bin} range`, r.range?.text, `${whole(b.sample_low)} to ${whole(b.sample_high)}`);
      eq(`${width} bins ${key} ${b.bin} players`, r.players?.text, `${whole(b.players_per_split)}${b.reported ? "" : "Too few, not used"}`);
      eq(`${width} bins ${key} ${b.bin} n`, r.n?.text, whole(b.n));
      eq(`${width} bins ${key} ${b.bin} r`, r.r?.text, `${rho(b.r)}SD ${rho(b.r_split_sd)}`);
      eq(`${width} bins ${key} ${b.bin} rho`, r.rho?.text, `${rho(b.rho)}${rho(b.rho_interval.low)} to ${rho(b.rho_interval.high)}`);
    });
  }
  await page.getByLabel("Curve stat").selectOption("fg3_pct");
}

async function checkExample(page, width, query, label) {
  await open(page, query);
  const params = new URLSearchParams(query.replace(/^\?/, ""));
  const ex = await get(`/api/signal-noise/player${params.get("player") ? `?playerId=${params.get("player")}&season=${params.get("exampleSeason") ?? "2025-26"}` : ""}`);
  const card = await page.locator(".sn-card").evaluate(e => ({ ...e.dataset, name: e.querySelector(".sn-card-name")?.textContent, sub: e.querySelector('[data-field="card-sub"]')?.textContent,
    options: [...e.querySelectorAll("select option")].map(o => o.value), value: e.querySelector("select")?.value, photo: e.querySelector(".player-portrait")?.getAttribute("src") ?? null,
    fallback: e.querySelectorAll(".player-portrait-fallback").length, logos: e.querySelectorAll(".sn-card-team img").length }));
  eq(`${width} ${label} player`, card.player, ex.player_id); eq(`${width} ${label} season`, card.season, ex.season); eq(`${width} ${label} name`, card.name, ex.player_name);
  eq(`${width} ${label} sub`, card.sub, `${ex.teams.join("")}${ex.games} ${ex.games === 1 ? "game" : "games"}`);
  eq(`${width} ${label} logos`, card.logos, ex.teams.length);
  if (ex.teams.length && card.photo) { has(`${width} ${label} photo season`, card.photo, `season=${ex.season}`); has(`${width} ${label} photo team`, card.photo, `team=${ex.teams[0]}`); }
  // The season picker: the player's own seasons with a prior, newest first. It lists the season shown until the career read arrives.
  const career = await get(`/api/workbench/players/${ex.player_id}/career?phase=regular_season`);
  const priors = new Set(S.priors.fg3_pct.map(p => p.season));
  const want = [...new Set([...career.seasons.filter(s => s.item).map(s => s.season).filter(s => priors.has(s)), ex.season])].sort().reverse();
  await page.waitForFunction(n => document.querySelectorAll(".sn-card select option").length === n, want.length, { timeout: 30000 }).catch(() => {});
  card.options = await page.locator(".sn-card select option").evaluateAll(os => os.map(o => o.value));
  eq(`${width} ${label} seasons`, card.options.join(","), want.join(",")); eq(`${width} ${label} season value`, card.value, ex.season);
  report.loads.push({ width, label, player: ex.player_name, season: ex.season, seasons: card.options.length, photo: card.photo });
  if (!ex.estimates) {
    has(`${width} ${label} no games`, await page.locator(".sn-example").textContent(), `No regular-season games for ${ex.player_name} in ${ex.season}: every value is unknown, not zero.`);
    eq(`${width} ${label} no grid`, await page.locator('table[aria-label="Worked example"]').count(), 0);
    return;
  }
  if (ex.selection_rule) eq(`${width} ${label} rule`, await page.locator('[data-field="selection-rule"]').textContent(), ex.selection_rule);
  else eq(`${width} ${label} no rule`, await page.locator('[data-field="selection-rule"]').count(), 0);
  const rows = await page.locator('table[aria-label="Worked example"] tbody tr').evaluateAll(els => els.map(e => ({ stat: e.dataset.stat, cells: Object.fromEntries([...e.querySelectorAll("td")].map(td => [td.dataset.field, { ...td.dataset, text: td.textContent }])) })));
  const e = ex.estimates;
  const wantRows = [
    ...["fg3_pct", "ft_pct", "fg2_pct"].map(k => ({ k, counts: `${whole(e[k].makes)} / ${whole(e[k].attempts)}`, raw: e[k].raw, shrunk: e[k].shrunk, prior: e[k].prior })),
    { k: "ts_pct", counts: `${whole(e.ts_pct.points)} pts / ${e.ts_pct.attempts.toFixed(1)} TSA`, raw: e.ts_pct.raw, shrunk: e.ts_pct.shrunk, composed: true },
    ex.rim.status === "available" ? { k: "rim_fg_pct", counts: `${whole(ex.rim.makes)} / ${whole(ex.rim.attempts)}`, raw: ex.rim.raw, shrunk: ex.rim.shrunk, prior: ex.rim.prior } : { k: "rim_fg_pct", unknown: ex.rim.reason },
  ];
  eq(`${width} ${label} rows`, rows.map(r => r.stat).join(","), wantRows.map(r => r.k).join(","));
  for (const [i, w] of wantRows.entries()) {
    const c = rows[i]?.cells ?? {};
    if (w.unknown) {
      eq(`${width} ${label} ${w.k} unknown raw`, c.raw?.text, "—");
      has(`${width} ${label} ${w.k} reason`, await page.locator(`[data-field="unknown"][data-stat="${w.k}"]`).textContent(), w.unknown);
      continue;
    }
    eq(`${width} ${label} ${w.k} counts`, c.counts?.text, w.counts);
    eq(`${width} ${label} ${w.k} raw`, c.raw?.text, w.raw == null ? "—" : pct(w.raw)); if (w.raw != null) eq(`${width} ${label} ${w.k} raw value`, num(c.raw?.value), w.raw);
    eq(`${width} ${label} ${w.k} shrunk value`, num(c.shrunk?.value), w.shrunk.value); eq(`${width} ${label} ${w.k} shrunk low`, num(c.shrunk?.low), w.shrunk.low); eq(`${width} ${label} ${w.k} shrunk high`, num(c.shrunk?.high), w.shrunk.high);
    eq(`${width} ${label} ${w.k} shrunk text`, c.shrunk?.text, w.shrunk.value == null ? "—" : `${pct(w.shrunk.value)}${w.shrunk.low != null ? `${pct(w.shrunk.low)} to ${pct(w.shrunk.high)}` : ""}`);
    eq(`${width} ${label} ${w.k} prior text`, c.prior?.text, w.composed ? "From the three above" : w.prior?.status === "available" ? `${pct(w.prior.mean)}${w.prior.strength.toFixed(1)} attempts` : "—");
  }
  const t = e.fg3_pct;
  if (t.prior.status === "available" && t.attempts > 0) eq(`${width} ${label} formula`, await page.locator('[data-field="formula"]').textContent(), `Shrunk 3P% = (${whole(t.makes)} + ${t.prior.alpha.toFixed(1)}) / (${whole(t.attempts)} + ${t.prior.strength.toFixed(1)}) = ${pct(t.shrunk.value)}`);
  const strip = await page.locator('[data-chart="example-strip"] .sn-ex-row').evaluateAll(els => els.map(e => ({ stat: e.dataset.stat, text: e.querySelector(".sn-strip-value").textContent })));
  for (const [i, w] of wantRows.entries()) eq(`${width} ${label} strip ${w.k}`, strip[i]?.text, w.unknown ? "Unknown" : `${pct(w.raw)}to ${pct(w.shrunk.value)}`);
  // The what-if: one option per stat with a served prior; each starts at the served shrunk value and its counts; then one slider move.
  const sources = [...["fg3_pct", "ft_pct", "fg2_pct"].map(k => ({ k, ...e[k] })), ...(ex.rim.status === "available" ? [{ k: "rim_fg_pct", ...ex.rim }] : [])].filter(x => x.prior.status === "available");
  const box = page.locator('[data-chart="what-if"]');
  eq(`${width} ${label} what-if options`, (await box.getByRole("radio").allTextContents()).join(","), sources.map(x => STAT[x.k]).join(","));
  for (const x of sources) {
    await box.getByRole("radio", { name: STAT[x.k], exact: true }).click();
    await page.waitForSelector(`[data-chart="what-if"][data-stat="${x.k}"]`);
    const d = await box.evaluate(el => ({ ...el.dataset, counts: el.querySelector('[data-field="whatif-counts"]').textContent, prior: el.querySelector('[data-field="whatif-prior"]').textContent, formula: el.querySelector('[data-field="whatif-formula"]').textContent }));
    const own = x.attempts > 0 ? (x.makes + x.prior.alpha) / (x.attempts + x.prior.alpha + x.prior.beta) : x.prior.mean;
    eq(`${width} ${label} what-if ${x.k} attempts`, num(d.attempts), x.attempts); eq(`${width} ${label} what-if ${x.k} makes`, num(d.makes), x.makes);
    eq(`${width} ${label} what-if ${x.k} shrunk`, num(d.shrunk), x.attempts > 0 ? x.shrunk.value : own);
    eq(`${width} ${label} what-if ${x.k} counts`, d.counts, `${whole(x.makes)} / ${whole(x.attempts)}`); eq(`${width} ${label} what-if ${x.k} prior`, d.prior, pct(x.prior.mean));
    eq(`${width} ${label} what-if ${x.k} formula`, d.formula, `Shrunk ${STAT[x.k]} = (${whole(x.makes)} + ${x.prior.alpha.toFixed(1)}) / (${whole(x.attempts)} + ${x.prior.strength.toFixed(1)}) = ${pct(x.attempts > 0 ? x.shrunk.value : own)}`);
  }
  if (sources.length) {
    const x = sources[0];
    await box.getByRole("radio", { name: STAT[x.k], exact: true }).click();
    await box.getByRole("slider", { name: /Attempts/ }).fill("250");
    await page.waitForSelector('[data-chart="what-if"][data-attempts="250"]');
    const rate = x.attempts > 0 ? x.makes / x.attempts : x.prior.mean, makes = Math.round(rate * 250);
    eq(`${width} ${label} what-if moved shrunk`, num(await box.getAttribute("data-shrunk")), (makes + x.prior.alpha) / (250 + x.prior.alpha + x.prior.beta));
    eq(`${width} ${label} what-if moved weight`, num(await box.getAttribute("data-weight")), 250 / (250 + x.prior.alpha + x.prior.beta));
    await box.getByRole("button", { name: `${ex.player_name}'s season` }).click();
    eq(`${width} ${label} what-if reset`, num(await box.getAttribute("data-attempts")), x.attempts);
  }
  // Every path series: raw on the main line, shrunk on the overlay, one point per game with attempts.
  for (const key of ["fg3_pct", "ft_pct", "ts_pct"]) {
    await page.getByRole("radiogroup", { name: "Season path" }).getByRole("radio", { name: STAT[key] }).click();
    await page.waitForSelector(`[data-chart="path"][data-path="${key}"]`);
    const p = await page.locator('[data-chart="path"]').evaluate(e => ({ games: e.dataset.games, raw: [...e.querySelectorAll('.slc-dot:not([data-series])')].map(d => [d.dataset.season, d.dataset.value]), shrunk: [...e.querySelectorAll('.slc-dot[data-series="overlay"]')].map(d => [d.dataset.season, d.dataset.value]), empty: !!e.querySelector('[data-field="path-empty"]') }));
    eq(`${width} ${label} path ${key} games`, num(p.games), ex.path.length);
    if (ex.path.filter(g => g[key].raw !== null).length < 2) { eq(`${width} ${label} path ${key} empty`, p.empty, true); continue; }
    const rawWant = ex.path.flatMap((g, i) => g[key].raw === null ? [] : [[String(i + 1), g[key].raw]]), shrunkWant = ex.path.flatMap((g, i) => g[key].shrunk === null ? [] : [[String(i + 1), g[key].shrunk]]);
    eq(`${width} ${label} path ${key} raw points`, p.raw.length, rawWant.length); eq(`${width} ${label} path ${key} shrunk points`, p.shrunk.length, shrunkWant.length);
    rawWant.forEach(([g, v], i) => { eq(`${width} ${label} path ${key} raw ${g} game`, p.raw[i]?.[0], g); eq(`${width} ${label} path ${key} raw ${g}`, num(p.raw[i]?.[1]), v); });
    shrunkWant.forEach(([g, v], i) => { eq(`${width} ${label} path ${key} shrunk ${g} game`, p.shrunk[i]?.[0], g); eq(`${width} ${label} path ${key} shrunk ${g}`, num(p.shrunk[i]?.[1]), v); });
  }
  await page.getByRole("radiogroup", { name: "Season path" }).getByRole("radio", { name: "3P%" }).click();
}

async function checkTest(page, width) {
  for (const band of ["all", "under 50", "50-199", "200 or more"]) {
    await page.getByRole("radiogroup", { name: "Attempts this season" }).getByRole("radio", { name: band === "all" ? "All" : BAND[band] }).click();
    await page.waitForSelector(`table[aria-label="Shrinkage test"] tbody tr[data-band="${band}"]`);
    // On a phone the table shows gains or errors (round 4): read both views and merge them.
    const read = () => page.locator('table[aria-label="Shrinkage test"] tbody tr').evaluateAll(els => els.map(e => ({ stat: e.dataset.stat, lead: e.querySelector("th").textContent,
      cells: Object.fromEntries([...e.querySelectorAll("td")].map(td => [td.dataset.field, { ...td.dataset, text: td.textContent, tone: td.querySelector("[data-tone]")?.dataset.tone ?? null }])) })));
    let rows = await read();
    if (width < 600) {
      eq(`${width} test ${band} phone gains only`, Object.keys(rows[0]?.cells ?? {}).join(","), "raw_minus_shrunk,prior_minus_shrunk");
      await page.getByRole("radio", { name: "Errors, RMSE" }).click();
      const errs = await read();
      eq(`${width} test ${band} phone errors only`, Object.keys(errs[0]?.cells ?? {}).join(","), "mse-raw,mse-prior,mse-shrunk");
      rows = rows.map((r, i) => ({ ...r, cells: { ...r.cells, ...errs[i]?.cells } }));
      await page.getByRole("radio", { name: "Gains" }).click();
    }
    eq(`${width} test ${band} order`, rows.map(r => r.stat).join(","), TESTS.join(","));
    for (const [i, stat] of TESTS.entries()) {
      const v = S.validation[stat], b = band === "all" ? v.pooled : v.bands.find(x => x.band === band), r = rows[i];
      eq(`${width} test ${band} ${stat} lead`, r.lead, `${STAT[stat]}${whole(b.pairs)} pairs${b.players ? ` · ${whole(b.players)} players` : ""}`);
      for (const key of ["raw_minus_shrunk", "prior_minus_shrunk"]) {
        const g = b[key], c = r.cells[key];
        eq(`${width} test ${band} ${stat} ${key}`, num(c.value), g.value); eq(`${width} test ${band} ${stat} ${key} low`, num(c.low), g.low); eq(`${width} test ${band} ${stat} ${key} high`, num(c.high), g.high);
        eq(`${width} test ${band} ${stat} ${key} text`, c.text, `${sgn(g.value * 1e4)}${sgn(g.low * 1e4)} to ${sgn(g.high * 1e4)}`);
        eq(`${width} test ${band} ${stat} ${key} tone`, c.tone, g.low > 0 ? "good" : g.high < 0 ? "bad" : null);
      }
      for (const key of ["raw", "prior", "shrunk"]) { const c = r.cells[`mse-${key}`]; eq(`${width} test ${band} ${stat} mse ${key}`, num(c.value), b.mse[key]); eq(`${width} test ${band} ${stat} rmse ${key}`, c.text, (Math.sqrt(b.mse[key]) * 100).toFixed(1)); }
    }
  }
  await page.getByRole("radiogroup", { name: "Attempts this season" }).getByRole("radio", { name: "All" }).click();
}

async function checkPriors(page, width) {
  for (const stat of ["fg3_pct", "fg2_pct", "ft_pct", "rim_fg_pct"]) for (const view of ["mean", "strength"]) {
    await page.getByRole("radiogroup", { name: "Prior stat" }).getByRole("radio", { name: STAT[stat] }).click();
    await page.getByRole("radiogroup", { name: "Prior measure" }).getByRole("radio", { name: view === "mean" ? "Prior mean" : "Strength" }).click();
    await page.waitForSelector(`[data-chart="priors"][data-stat="${stat}"][data-view="${view}"]`);
    const dots = await page.locator('[data-chart="priors"] .slc-dot').evaluateAll(els => els.map(d => [d.dataset.season, d.dataset.value]));
    const want = S.priors[stat];
    eq(`${width} priors ${stat} ${view} count`, dots.length, want.length);
    want.forEach((f, i) => { eq(`${width} priors ${stat} ${view} ${f.season} season`, dots[i]?.[0], f.season); eq(`${width} priors ${stat} ${view} ${f.season}`, num(dots[i]?.[1]), view === "mean" ? f.mean : f.strength); });
  }
  const ft = S.priors.ft_pct.find(f => f.season === "2025-26"), rim = S.priors.rim_fg_pct.find(f => f.season === "2025-26");
  const ftM = S.stabilization.stats.find(s => s.key === "ft_pct").m.value, rimM = S.stabilization.stats.find(s => s.key === "rim_fg_pct").m.value;
  has(`${width} priors line`, await page.locator("#priors .sn-lead").textContent(), `for FT% in 2025-26 it is ${ft.strength.toFixed(1)} against ${whole(ftM)}, for Rim FG% ${rim.strength.toFixed(1)} against ${whole(rimM)}`);
  await page.getByRole("radiogroup", { name: "Prior stat" }).getByRole("radio", { name: "3P%" }).click();
  await page.getByRole("radiogroup", { name: "Prior measure" }).getByRole("radio", { name: "Prior mean" }).click();
}

async function checkFixed(page, width) {
  const ft = S.stabilization.stats.find(s => s.key === "ft_pct").levels["0.5"], ts = S.stabilization.stats.find(s => s.key === "ts_pct").levels["0.5"], th = S.stabilization.stats.find(s => s.key === "fg3_pct").levels["0.5"];
  eq(`${width} hero`, await page.locator('[data-field="hero-meta"]').textContent(), `${whole(S.stabilization.player_seasons_split)} player-seasons · ${whole(S.stabilization.players)} players · ${S.stabilization_seasons[0]} to ${S.stabilization_seasons.at(-1)} · registered before any fit`);
  eq(`${width} answer`, (await page.locator('[data-field="headline"]').textContent()).replace(/\s+/g, " ").trim(),
    `Free-throw percentage starts to mean something after about ${whole(ft.n)} attempts and true shooting after ${whole(ts.n)}. Three-point percentage never got there in a season: its largest group of shooters reached ${rho(th.largest_rho, 2)} at ${whole(th.largest_n)} attempts.`);
  const wins = TESTS.filter(s => S.validation[s].pooled.raw_minus_shrunk.low > 0).length;
  eq(`${width} answer wins`, num(await page.locator('[data-field="answer-shrink"]').getAttribute("data-wins")), wins);
  const others = S.stabilization.stats.filter(s => s.key !== "fg3_pct" && isReached(s.levels["0.5"]) && isReached(s.levels["0.7"])).length;
  has(`${width} answer others`, await page.locator('[data-field="answer-rule"]').textContent(), `The other ${others} stats reach both 0.5 and 0.7.`);
  const three = S.stabilization.stats.find(s => s.key === "fg3_pct"), lb = largest(three);
  has(`${width} not-reached note`, await page.locator('[data-field="not-reached-note"]').textContent(), `its 95% interval there runs from ${rho(lb.rho_interval.low)} to ${rho(lb.rho_interval.high)}.`);
  const covered = await page.locator('table[aria-label="Not covered"] tbody tr').evaluateAll(els => els.map(e => [e.querySelector("th").textContent, e.querySelector("td").textContent]));
  eq(`${width} not covered rows`, covered.length, S.not_covered.length);
  S.not_covered.forEach((n, i) => { eq(`${width} not covered ${i} family`, covered[i]?.[0], n.family); eq(`${width} not covered ${i} reason`, covered[i]?.[1], n.reason); });
  const about = await page.locator("#about").textContent();
  const rim = Object.values(S.coverage.rim);
  has(`${width} about stab`, about, `${whole(S.stabilization.player_seasons_split)} player-seasons with 10 or more games, ${whole(S.stabilization.players)} players`);
  has(`${width} about fitted`, about, `For 3P% the fitted curve would put 0.5 at ${whole(three.m.value)} three-point attempts (95% ${whole(three.m.low)} to ${whole(three.m.high)}), but no bin reaches 0.5, so it isn't a stabilization point.`);
  has(`${width} about coverage`, about, `disagree with the box score in ${whole(rim.reduce((n, r) => n + r.player_games_fga_mismatch, 0))} of ${whole(rim.reduce((n, r) => n + r.player_games, 0))} player-games`);
  has(`${width} about ts`, about, `(${S.coverage.ts_identity_failures} exceptions)`);
  has(`${width} about hashes`, about, `Registration ${S.registration.content_sha256.slice(0, 16)} · results ${S.results_sha256.slice(0, 16)}.`);
  has(`${width} about target`, await page.locator("#test").textContent(), `on target seasons ${S.registration.parameters.validation_target_seasons[0]} to ${S.registration.parameters.validation_target_seasons.at(-1)}`);
}

async function layout(page, width, name) {
  const m = await page.evaluate(() => {
    const root = document.querySelector(".sn-page");
    const text = root.innerText;
    const small = [...root.querySelectorAll("button, select, input, a[data-kit]")].filter(e => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 && r.height < 40; }).map(e => e.getAttribute("aria-label") ?? e.textContent.trim().slice(0, 24));
    return {
      overflow: document.documentElement.scrollWidth - innerWidth, broken: [...document.images].filter(i => i.complete && i.naturalWidth === 0).length, images: document.images.length,
      selects: root.querySelectorAll("select").length, column: Math.round(root.getBoundingClientRect().width), height: document.documentElement.scrollHeight,
      projectWords: text.match(/\b(courtlens-signal|commit|branch|R0\d|registration\b.*sha|owner|docs\/evidence)\b/gi) ?? [], hashes: text.match(/\b[0-9a-f]{16}\b/g) ?? [],
      isoDates: (text.match(/\b20\d\d-\d\d-\d\d\b/g) ?? []).length, hyphenMinus: (text.match(/(?<![\w–-])-\d+(\.\d)?/g) ?? []).length, arrows: /[→←↑↓]/.test(text),
      phoneSmall: innerWidth < 600 ? small : [], heroIcon: (() => { const h = document.querySelector(".research-hero"); const i = h?.querySelector(".page-header-icon, [class*='icon']"); return h && i ? Math.round(Math.abs((i.getBoundingClientRect().left + i.getBoundingClientRect().right) / 2 - (h.getBoundingClientRect().left + h.getBoundingClientRect().right) / 2)) : null; })(),
    };
  });
  report.layout.push({ width, name, ...m });
  const fail = (what, got) => mismatches.push({ where: `${width} ${name} ${what}`, got, want: "none" });
  checked += 6;
  if (m.overflow > 0) fail("overflow", m.overflow);
  if (m.broken > 0) fail("broken images", m.broken);
  if (m.hashes.length || m.projectWords.length) fail("project words or hashes", [...m.hashes, ...m.projectWords]);
  if (m.isoDates) fail("ISO dates", m.isoDates);
  if (m.hyphenMinus) fail("hyphen-minus numbers", m.hyphenMinus);
  if (m.arrows) fail("arrow characters", true);
}

for (const width of [1440, 390]) {
  const page = await browser.newPage({ viewport: { width, height: width > 600 ? 900 : 844 } });
  const errors = [];
  page.on("console", m => { if (m.type() === "error") errors.push(m.text()); });
  page.on("pageerror", e => errors.push(String(e)));
  await open(page);
  await layout(page, width, "default");
  eq(`${width} column`, report.layout.at(-1).column, Math.min(992, width - (width > 600 ? 32 : 24)));
  eq(`${width} native selects`, report.layout.at(-1).selects, 2);
  await checkFixed(page, width);
  await checkStrip(page, width);
  await checkCurves(page, width);
  await checkTest(page, width);
  await checkPriors(page, width);
  await checkExample(page, width, "", "default");
  if (shots) await page.screenshot({ path: `${shots}/sn-full-${width}.png`, fullPage: true });
  const examples = width > 600
    ? [["?player=201939&exampleSeason=2014-15", "Curry 2014-15"], ["?player=76003&exampleSeason=1984-85", "Abdul-Jabbar 1984-85"], ["?player=1642905&exampleSeason=2026-27", "Yang 2026-27"], ["?player=201939&exampleSeason=1990-91", "Curry no games"], ["?player=2544&exampleSeason=2003-04", "James 2003-04"]]
    : [["?player=201939&exampleSeason=2014-15", "Curry 2014-15"], ["?player=1642905&exampleSeason=2026-27", "Yang 2026-27"], ["?player=201939&exampleSeason=1990-91", "Curry no games"]];
  for (const [query, label] of examples) { await checkExample(page, width, query, label); await layout(page, width, label); }
  if (width > 600) {
    // The search in place: open, type, pick, and the URL and card follow; Escape leaves it.
    await open(page);
    const card = page.locator(".sn-card");
    await card.getByRole("button", { name: /^Replace / }).click();
    const box = card.getByRole("combobox", { name: "Search players" });
    eq("search focused", await box.evaluate(e => e === document.activeElement), true);
    eq("search no list before typing", await page.locator(".lookup-dropdown").count(), 0);
    await box.fill("Stephen Curry");
    const option = page.locator(".lookup-dropdown [role=option]").filter({ hasText: "Stephen Curry" }).first();
    await option.waitFor({ timeout: 20000 });
    await option.click();
    await page.waitForURL(/player=201939/, { timeout: 20000 });
    await page.waitForSelector('.sn-card[data-player="201939"]', { timeout: 30000 });
    eq("search picked", await page.locator(".sn-card").getAttribute("data-player"), "201939");
    await page.locator(".sn-card").getByRole("button", { name: /^Replace / }).click();
    await page.keyboard.press("Escape");
    eq("search escape", await page.locator(".sn-card .sn-card-name").count(), 1);
    await page.getByRole("button", { name: "Default example" }).click();
    await page.waitForFunction(() => !location.search.includes("player="));
    await page.waitForSelector('.sn-card[data-player="1642905"]', { timeout: 30000 });
    eq("reset to default", await page.locator(".sn-card").getAttribute("data-player"), "1642905");
  }
  report[`consoleErrors${width}`] = errors;
  if (errors.length) mismatches.push({ where: `${width} console`, got: errors, want: [] });
  await page.close();
}
await browser.close();
report.checked = checked; report.mismatches = mismatches;
writeFileSync(out, JSON.stringify(report, null, 1));
console.log(`checked ${checked} values, ${mismatches.length} mismatches`);
if (mismatches.length) console.log(JSON.stringify(mismatches.slice(0, 25), null, 1));
