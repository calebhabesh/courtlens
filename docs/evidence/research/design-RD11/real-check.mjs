// Real-data check for RD11 (Projected Impact): every value the page draws against the owner's API through the read-only proxy on 4180
// (../design-RD10/readonly-proxy.mjs), the production build on 3180, at 1440 and 390. Walks all three player views, every team (1440), the search, the sort,
// the Why card for a spread of players (top of the board, rookies, returners, off-roster), the test tables for pooled and each season, the groups, both weekly
// tables, both aging curves, coverage and About. Also the colour rules, console errors, overflow, broken images, photos, logos, arrows, ISO dates, project words,
// phone controls under 40 px and the layout. Every lookup is written here independently of lib/projected-impact.ts, and which pairs exist is written out by hand.
// Usage: node real-check.mjs <report.json> [<shots dir>]
import { chromium } from "/home/ethioking/dev/courtlens/dashboard/node_modules/playwright/index.mjs";
import { writeFileSync } from "node:fs";
const API = "http://127.0.0.1:4180", WEB = "http://localhost:3180/research/projected-impact";
const [,, out, shots] = process.argv;
const data = await (await fetch(`${API}/api/projected-impact`)).json();
const { model, card, scorecard: score, players } = data;
const detailCache = new Map();
const detailOf = async id => { if (!detailCache.has(id)) detailCache.set(id, await (await fetch(`${API}/api/projected-impact/players/${id}`)).json()); return detailCache.get(id); };

// The page's formats, written again so a formatting bug shows up as a mismatch.
const fixed = (v, d = 2) => v == null ? "—" : v.toFixed(d);
const signed = (v, d = 2) => { if (v == null) return "—"; const t = Math.abs(v).toFixed(d); return Number(t) === 0 ? t : `${v > 0 ? "+" : "−"}${t}`; };
const pct = (v, d = 1) => v == null ? "—" : `${(v * 100).toFixed(d)}%`;
const band = (b, d = 2) => `${signed(b.low, d)} to ${signed(b.high, d)}`;
const paren = (g, d = 2) => `${signed(g.gap, d)} (${band(g, d)})`;
const count = n => n.toLocaleString("en-US");
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const longDate = iso => { const [y, m, d] = iso.slice(0, 10).split("-").map(Number); return `${MONTHS[m - 1]} ${d}, ${y}`; };
const num = v => v === null || v === undefined || v === "" ? null : Number(v);
const tone = b => b.low > 0 ? "good" : b.high < 0 ? "bad" : null;
const identity = (v, d = 2) => v == null || Number(Math.abs(v).toFixed(d)) === 0 ? null : v > 0 ? "a" : "b";
const teamOf = p => p.tricode ?? p.last_tricode, seasonOf = p => p.tricode ? "2026-27" : "2025-26";

const ORDER = ["lightgbm", "ridge", "time_decay", "age_curve", "carry_forward"];
const LABEL = { lightgbm: "LightGBM", ridge: "Ridge", time_decay: "Time-decay RAPM", age_curve: "Age curve", carry_forward: "Carry-forward" };
// Which gains the frozen test and the weekly score serve, written out, so a lookup that silently finds nothing fails here.
const TEST_PAIRS = { lightgbm: ["carry_forward", "time_decay"], ridge: ["carry_forward", "time_decay"], age_curve: ["carry_forward", "time_decay"], time_decay: [], carry_forward: [] };
const WEEK_PAIRS = { lightgbm: ["carry_forward", "time_decay"], ridge: ["carry_forward", "time_decay"], age_curve: [], time_decay: [], carry_forward: [] };

const readTable = (page, name) => page.evaluate(n => [...document.querySelectorAll(`table[data-table="${n}"] tbody tr`)].filter(tr => tr.dataset.row).map(tr => ({
  key: tr.dataset.row, group: tr.dataset.group, roster: tr.dataset.roster, lead: tr.querySelector("th")?.innerText ?? "",
  logos: tr.querySelectorAll("th .team-logo, th img[src*='logo'], th img[src*='teams']").length,
  photo: tr.querySelector("th .player-portrait")?.getAttribute("src") ?? null, fallback: tr.querySelectorAll("th .player-portrait-fallback").length,
  sub: tr.querySelector(".player-cell-teams")?.textContent ?? null,
  why: tr.querySelector("th button")?.getAttribute("aria-label") ?? null,
  range: (r => r ? { low: r.style.getPropertyValue("--pi-low"), high: r.style.getPropertyValue("--pi-high"), at: r.style.getPropertyValue("--pi-at"), zero: r.style.getPropertyValue("--pi-zero"), tone: r.dataset.tone ?? null, identity: r.dataset.identity ?? null } : null)(tr.querySelector(".pi-range")),
  cells: Object.fromEntries([...tr.querySelectorAll("td")].map(td => { const main = td.querySelector(".rs-grid-value"); return [td.dataset.column, {
    field: td.dataset.field, value: td.dataset.value, low: td.dataset.low, high: td.dataset.high, baseline: td.dataset.baseline, text: td.textContent,
    main: main?.textContent ?? null, sub: td.querySelector(".rs-grid-sub")?.textContent ?? null, tone: main?.dataset.tone ?? null, identity: main?.dataset.identity ?? null }]; })),
})), name);

const left = Math.floor(Math.min(...players.map(p => p.low))), right = Math.ceil(Math.max(...players.map(p => p.high)));
const atPct = v => ((v - left) / (right - left)) * 100;
const subtitle = p => { const team = p.on_roster ? p.tricode ?? "—" : `Not on a roster · last ${p.last_tricode ?? "—"}`; return p.group === "prior" ? team : `${team} · ${p.group === "rookie" ? "Rookie" : "Returner"}`; };

const report = [];
const browser = await chromium.launch();
for (const width of [1440, 390]) {
  const wide = width > 600, tag = wide ? "1440" : "390";
  const page = await browser.newPage({ viewport: { width, height: wide ? 900 : 844 } });
  const errors = [], mismatches = []; let compared = 0, loads = 0;
  const eq = (what, got, want) => { compared += 1; if (got !== want) mismatches.push({ what, got, want }); };
  const near = (what, got, want, e = 1e-6) => { compared += 1; if (got === null || Math.abs(got - want) > e) mismatches.push({ what, got, want }); };
  page.on("console", m => { if (m.type() === "error") errors.push(m.text()); });
  page.on("pageerror", e => errors.push(String(e)));
  const open = async (q, ready) => { loads += 1; await page.goto(`${WEB}${q}`, { waitUntil: "domcontentloaded", timeout: 120000 }); await page.waitForSelector(ready, { state: "attached", timeout: 60000 }); };
  const READY = 'table[data-table="projections"] tbody tr[data-row]';

  const checkBoard = (id, table, want) => {
    eq(`${id} rows`, table.length, want.length);
    eq(`${id} order`, table.map(r => r.key).join(), want.map(p => p.player_id).join());
    for (const p of want) {
      const r = table.find(x => x.key === p.player_id); if (!r) continue;
      const c = r.cells.projection, t = tone(p);
      eq(`${id} ${p.name} value`, num(c.value), p.projection); eq(`${id} ${p.name} low`, num(c.low), p.low); eq(`${id} ${p.name} high`, num(c.high), p.high);
      eq(`${id} ${p.name} text`, c.main, signed(p.projection)); eq(`${id} ${p.name} interval`, c.sub, band(p, 1));
      eq(`${id} ${p.name} tone`, c.tone, t); eq(`${id} ${p.name} identity`, c.identity, t ? null : identity(p.projection));
      eq(`${id} ${p.name} age`, num(r.cells.age.value), p.age); eq(`${id} ${p.name} age text`, r.cells.age.text, p.age == null ? "—" : String(Math.floor(p.age)));
      eq(`${id} ${p.name} last`, num(r.cells.last.value), p.group === "prior" ? p.ratings.carry_forward : null);
      eq(`${id} ${p.name} last text`, r.cells.last.text, p.group === "prior" ? signed(p.ratings.carry_forward) : "—");
      eq(`${id} ${p.name} last identity`, r.cells.last.identity, p.group === "prior" ? identity(p.ratings.carry_forward) : null); eq(`${id} ${p.name} last no tone`, r.cells.last.tone, null);
      eq(`${id} ${p.name} minutes`, num(r.cells.minutes.value), p.minutes_last_season);
      eq(`${id} ${p.name} minutes text`, r.cells.minutes.text, p.minutes_last_season == null ? "—" : Math.round(p.minutes_last_season).toLocaleString("en-US"));
      eq(`${id} ${p.name} name`, r.lead.includes(p.name), true); eq(`${id} ${p.name} subtitle`, r.sub, subtitle(p));
      eq(`${id} ${p.name} why`, r.why, `Why ${p.name} is projected here`); eq(`${id} ${p.name} group`, r.group, p.group);
      eq(`${id} ${p.name} logo`, r.logos >= 1, true);
      eq(`${id} ${p.name} season photo`, r.photo === null ? r.fallback === 1 : r.photo.includes(`season=${seasonOf(p)}&team=${teamOf(p)}`), true);
      if (wide || r.range) {
        near(`${id} ${p.name} bar low`, parseFloat(r.range.low), atPct(p.low)); near(`${id} ${p.name} bar high`, parseFloat(r.range.high), atPct(p.high)); near(`${id} ${p.name} bar at`, parseFloat(r.range.at), atPct(p.projection)); near(`${id} ${p.name} bar zero`, parseFloat(r.range.zero), atPct(0));
        eq(`${id} ${p.name} bar inside`, parseFloat(r.range.low) >= 0 && parseFloat(r.range.high) <= 100, true);
        eq(`${id} ${p.name} bar tone`, r.range.tone, t); eq(`${id} ${p.name} bar identity`, r.range.identity, t ? null : identity(p.projection));
      }
    }
  };
  const inView = v => v === "all" ? players : v === "rookie" ? players.filter(p => p.group !== "prior") : players.filter(p => p.on_roster);
  const byProjection = list => [...list].sort((a, b) => b.projection - a.projection || a.player_id.localeCompare(b.player_id));

  const gainCell = (what, cell, g, colored) => {
    eq(`${what} value`, num(cell.value), g.gap); eq(`${what} low`, num(cell.low), g.low); eq(`${what} high`, num(cell.high), g.high);
    eq(`${what} text`, cell.main, signed(g.gap)); eq(`${what} band`, cell.sub, band(g)); eq(`${what} tone`, cell.tone, colored ? tone(g) : null); eq(`${what} no identity`, cell.identity, null);
  };
  const expectCells = (id, row, name, gaps, pairs, colored) => {
    for (const base of ["carry_forward", "time_decay"]) {
      const c = row.cells[`over_${base}`], what = `${id} ${name} over ${base}`;
      if (name === base) { eq(`${what} baseline`, c.main, "Baseline"); eq(`${what} baseline flag`, c.baseline, "true"); continue; }
      if (pairs[name].includes(base)) { const g = gaps[`${name}_over_${base}`]; eq(`${what} served`, !!g, true); if (g) gainCell(what, c, g, colored); }
      else eq(`${what} dash`, c.text, "—");
    }
  };

  // Default page.
  await open("", READY);
  await page.waitForLoadState("networkidle").catch(() => {});
  eq("h1", await page.locator("h1").innerText(), "Projected Impact");
  eq("hero", (await page.locator('[data-field="hero-meta"]').innerText()).trim(), `${count(players.length)} players · frozen ${longDate(model.frozen_at)} · 80% intervals`);

  // The answer's claims, from the served numbers.
  const answer = await page.locator('[data-field="answer"]').innerText();
  eq("answer yes", answer.includes("Yes, on both held-out seasons, but its edge over time-decay RAPM is small."), true);
  eq("answer gates", card.test.gates.A1_player.passed && card.test.gates.A2_game.passed, true);
  for (const [s, v] of Object.entries(card.test.seasons)) { eq(`answer ${s} players`, v.player.gaps.lightgbm_over_carry_forward.low > 0, true); eq(`answer ${s} games`, v.game.gaps.lightgbm_over_carry_forward.low > 0, true); }
  const pool = card.test.pooled;
  eq("answer small, players", pool.player.gaps.lightgbm_over_time_decay.gap < pool.player.gaps.lightgbm_over_carry_forward.gap / 2, true);
  eq("answer small, games", pool.game.gaps.lightgbm_over_time_decay.gap < pool.game.gaps.lightgbm_over_carry_forward.gap / 2, true);

  // Projections: default (roster) view.
  const proj = await page.locator("#projections").innerText();
  eq("projections frozen", proj.includes(`Frozen on ${longDate(model.frozen_at)}`), true); eq("projections cutoff", proj.includes(`before the ${longDate(model.feature_cutoff)} opener`), true);
  eq("projections honesty", proj.includes("not the player's true ability"), true); eq("no verdict from overlap", proj.includes("no claim about which of two players is better"), true);
  eq("board default", await page.locator('[data-field="shown"]').getAttribute("data-value"), String(inView("roster").length));
  eq("axis left", num(await page.locator('[data-field="axis"]').getAttribute("data-left")), left); eq("axis right", num(await page.locator('[data-field="axis"]').getAttribute("data-right")), right);
  eq("no red key while none excludes below", await page.locator('#projections .rs-legend [data-tone="bad"]').count(), players.some(p => p.high < 0) ? 1 : 0);
  checkBoard("roster", await readTable(page, "projections"), byProjection(inView("roster")));

  // Default Why card.
  const checkCard = async (p, id) => {
    const d = await detailOf(p.player_id), blocks = Object.entries(d.player.contributions.blocks), top = d.player.contributions.top;
    const got = await page.evaluate(pid => { const c = document.querySelector(`[data-player="${pid}"]`); const field = n => c.querySelector(`[data-field="${n}"]`); const bars = n => [...c.querySelectorAll(`[data-bars="${n}"] li`)].map(l => ({ key: l.dataset.key, value: l.dataset.value, label: l.querySelector(".pi-bar-label").textContent, text: l.querySelector(".pi-bar-value").textContent, identity: l.querySelector(".pi-bar-value").dataset.identity ?? null, sign: l.querySelector(".pi-bar").dataset.sign, barIdentity: l.querySelector(".pi-bar").dataset.identity ?? null, tones: l.querySelectorAll("[data-tone]").length }));
      return { name: c.querySelector(".pi-card-name").textContent, team: c.querySelector(".pi-card-team").textContent, value: field("card-projection").dataset.value, low: field("card-projection").dataset.low, high: field("card-projection").dataset.high, strong: field("card-projection").querySelector("strong").textContent, strongTone: field("card-projection").querySelector("strong").dataset.tone ?? null, strongIdentity: field("card-projection").querySelector("strong").dataset.identity ?? null, small: field("card-projection").querySelector("small").textContent, sum: field("sum").textContent, base: field("sum").dataset.base, blocks: bars("blocks"), top: bars("top"),
        tiles: [...c.querySelectorAll(".pi-tile")].map(t => ({ rating: t.dataset.rating, value: t.dataset.value, label: t.querySelector(".pi-tile-label").textContent, text: t.querySelector(".pi-tile-value").textContent, identity: t.querySelector(".pi-tile-value").dataset.identity ?? null })), avatar: c.querySelectorAll(".ui-identity img, .ui-identity .player-portrait, .ui-identity .player-portrait-fallback").length, tint: c.getAttribute("style") ?? "" }; }, p.player_id);
    eq(`${id} name`, got.name, p.name); eq(`${id} value`, num(got.value), p.projection); eq(`${id} low`, num(got.low), p.low); eq(`${id} high`, num(got.high), p.high);
    eq(`${id} text`, got.strong, signed(p.projection)); eq(`${id} band`, got.small, `80% interval ${band(p, 1)}`);
    eq(`${id} tone`, got.strongTone, tone(p)); eq(`${id} identity`, got.strongIdentity, tone(p) ? null : identity(p.projection));
    eq(`${id} team`, got.team, `${subtitle(p)}${p.age == null ? "" : ` · Age ${Math.floor(p.age)}`}`); eq(`${id} avatar`, got.avatar >= 1, true);
    eq(`${id} base`, num(got.base), d.base); eq(`${id} sum text`, got.sum, `${signed(d.base)} training average + the sources below = ${signed(p.projection)}`);
    near(`${id} base + sources = projection`, d.base + blocks.reduce((s, [, v]) => s + v, 0), p.projection, 1e-3);
    eq(`${id} blocks count`, got.blocks.length, blocks.length);
    eq(`${id} blocks order`, got.blocks.map(b => b.key).join(), [...blocks].sort((a, b) => Math.abs(b[1]) - Math.abs(a[1])).map(([k]) => k).join());
    for (const [k, v] of blocks) { const b = got.blocks.find(x => x.key === k); if (!b) continue; eq(`${id} block ${k}`, num(b.value), v); eq(`${id} block ${k} text`, b.text, signed(v)); eq(`${id} block ${k} identity`, b.identity, identity(v)); eq(`${id} block ${k} bar`, b.barIdentity, identity(v)); eq(`${id} block ${k} sign`, b.sign, v >= 0 ? "up" : "down"); eq(`${id} block ${k} no green/red`, b.tones, 0); eq(`${id} block ${k} worded`, /_/.test(b.label), false); }
    eq(`${id} top count`, got.top.length, top.length);
    top.forEach((e, i) => { const b = got.top[i]; eq(`${id} top ${i} key`, b.key, e.feature); eq(`${id} top ${i} value`, num(b.value), e.contribution); eq(`${id} top ${i} text`, b.text, signed(e.contribution)); eq(`${id} top ${i} identity`, b.identity, identity(e.contribution)); eq(`${id} top ${i} no green/red`, b.tones, 0); eq(`${id} top ${i} input`, e.value == null ? !/\(\d/.test(b.label) : b.label.endsWith(`(${fixed(e.value)})`), true); eq(`${id} top ${i} worded`, /_/.test(b.label.replace(/\(.*$/, "")), false); });
    eq(`${id} tiles order`, got.tiles.map(t => t.rating).join(), ORDER.join());
    for (const t of got.tiles) { eq(`${id} tile ${t.rating}`, num(t.value), p.ratings[t.rating]); eq(`${id} tile ${t.rating} text`, t.text, signed(p.ratings[t.rating])); eq(`${id} tile ${t.rating} identity`, t.identity, identity(p.ratings[t.rating])); eq(`${id} tile ${t.rating} label`, t.label, t.rating === "carry_forward" && p.group !== "prior" ? "Group average" : LABEL[t.rating]); }
  };
  const top = byProjection(inView("roster"))[0];
  await page.waitForSelector(`[data-player="${top.player_id}"]`, { state: "attached" });
  await checkCard(top, "card default");

  // The test: pooled, then each season.
  const checkTest = async (scope, label, id) => {
    const players_ = await readTable(page, "test-players"), games_ = await readTable(page, "test-games");
    eq(`${id} season`, await page.locator('[data-field="test"]').getAttribute("data-season"), label);
    eq(`${id} player count`, num(await page.locator('[data-field="test-players"]').getAttribute("data-value")), scope.player.players); eq(`${id} game count`, num(await page.locator('[data-field="test-games"]').getAttribute("data-value")), scope.game.games);
    eq(`${id} player order`, players_.map(r => r.key).join(), ORDER.join()); eq(`${id} game order`, games_.map(r => r.key).join(), ORDER.join());
    for (const n of ORDER) {
      const pl = players_.find(r => r.key === n), ga = games_.find(r => r.key === n), m = scope.player.models[n], g = scope.game.ratings[n];
      eq(`${id} ${n} label`, pl.lead.startsWith(LABEL[n]), true); eq(`${id} ${n} frozen mark`, pl.lead.includes("The frozen model"), n === model.selected);
      eq(`${id} ${n} rmse`, num(pl.cells.rmse.value), m.rmse); eq(`${id} ${n} rmse text`, pl.cells.rmse.main, fixed(m.rmse)); eq(`${id} ${n} corr`, num(pl.cells.correlation.value), m.correlation); eq(`${id} ${n} corr text`, pl.cells.correlation.main, fixed(m.correlation));
      eq(`${id} ${n} margin`, num(ga.cells.rmse.value), g.rmse); eq(`${id} ${n} margin text`, ga.cells.rmse.main, fixed(g.rmse)); eq(`${id} ${n} winner`, num(ga.cells.winner.value), g.winner_accuracy); eq(`${id} ${n} winner text`, ga.cells.winner.main, pct(g.winner_accuracy));
      for (const k of ["rmse", "correlation"]) eq(`${id} ${n} ${k} neutral`, pl.cells[k].tone, null);
      expectCells(`${id} players`, pl, n, scope.player.gaps, TEST_PAIRS, true); expectCells(`${id} games`, ga, n, scope.game.gaps, TEST_PAIRS, true);
    }
  };
  await checkTest(card.test.pooled, "pooled", "test pooled");

  // Rookies and returners.
  const groups = await readTable(page, "test-groups");
  eq("groups rows", groups.map(r => r.key).join(), "lightgbm,ridge,time_decay,group_mean");
  for (const grp of ["rookie", "returner"]) {
    const t = card.test.pooled.groups[grp];
    for (const n of ["lightgbm", "ridge", "time_decay"]) { const r = groups.find(x => x.key === n), m = t.models[n], g = m.gap_over_group_mean; eq(`group ${grp} ${n} rmse`, num(r.cells[`${grp}-rmse`].value), m.rmse); eq(`group ${grp} ${n} rmse text`, r.cells[`${grp}-rmse`].main, fixed(m.rmse));
      const c = r.cells[`${grp}-gain`]; eq(`group ${grp} ${n} gain`, num(c.value), g.gap); eq(`group ${grp} ${n} low`, num(c.low), g.low); eq(`group ${grp} ${n} high`, num(c.high), g.high); eq(`group ${grp} ${n} text`, c.main, signed(g.gap)); eq(`group ${grp} ${n} band`, c.sub, band(g)); eq(`group ${grp} ${n} tone`, c.tone, tone(g));
      eq(`group ${grp} ${n} includes zero (the sentence)`, g.low <= 0 && g.high >= 0, true); }
    const base = groups.find(x => x.key === "group_mean"); eq(`group ${grp} mean rmse`, num(base.cells[`${grp}-rmse`].value), t.group_mean_rule_rmse); eq(`group ${grp} baseline`, base.cells[`${grp}-gain`].main, "Baseline");
  }
  const rookieTd = card.test.pooled.groups.rookie.models.time_decay.gap_over_group_mean; eq("rookies: time decay matches the average", rookieTd.gap === 0 && rookieTd.low === 0 && rookieTd.high === 0, true);
  const heads = await page.locator('table[data-table="test-groups"] thead').innerText();
  eq("groups rookies head", heads.includes(`ROOKIES, ${card.test.pooled.groups.rookie.players} PLAYERS`) || heads.includes(`Rookies, ${card.test.pooled.groups.rookie.players} players`), true);
  eq("groups returners head", heads.includes(`RETURNERS, ${card.test.pooled.groups.returner.players} PLAYERS`) || heads.includes(`Returners, ${card.test.pooled.groups.returner.players} players`), true);
  const ridge = await page.locator('[data-field="ridge-line"]').innerText();
  eq("ridge better on margin", pool.game.ratings.ridge.rmse < pool.game.ratings.lightgbm.rmse, true); eq("ridge better on players", pool.player.models.ridge.rmse < pool.player.models.lightgbm.rmse, true);
  eq("ridge line", ridge.includes(`margin RMSE ${fixed(pool.game.ratings.ridge.rmse)} against ${fixed(pool.game.ratings.lightgbm.rmse)}, player RMSE ${fixed(pool.player.models.ridge.rmse)} against ${fixed(pool.player.models.lightgbm.rmse)}`), true);

  // 2026-27.
  const status = await page.locator('[data-field="score-status"]').innerText();
  eq("score status", status.startsWith(`Scored through ${longDate(score.scored_through)} (last run ${longDate(score.written_at)}):`), true);
  eq("prospective games", num(await page.locator('[data-field="prospective-games"]').getAttribute("data-value")), score.prospective.games);
  eq("hindsight games", num(await page.locator('[data-field="hindsight-games"]').getAttribute("data-value")), score.hindsight.games);
  eq("scored in frozen file", score.projections_sha256, model.projections_sha256);
  const checkWeek = async (group, name, colored) => {
    const rows = await readTable(page, name);
    eq(`${name} order`, rows.map(r => r.key).join(), ORDER.join());
    for (const n of ORDER) { const r = rows.find(x => x.key === n), g = group.ratings[n]; eq(`${name} ${n} rmse`, num(r.cells.rmse.value), g.rmse); eq(`${name} ${n} rmse text`, r.cells.rmse.main, fixed(g.rmse)); eq(`${name} ${n} winner`, num(r.cells.winner.value), g.winner_accuracy); eq(`${name} ${n} winner text`, r.cells.winner.main, pct(g.winner_accuracy)); if (group.gaps) expectCells(name, r, n, group.gaps, WEEK_PAIRS, colored); else eq(`${name} ${n} no gains`, r.cells.over_carry_forward, undefined); }
    if (!colored) eq(`${name} never coloured`, await page.locator(`table[data-table="${name}"] [data-tone]`).count(), 0);
  };
  if (score.prospective.games > 0) await checkWeek(score.prospective, "score-prospective", true);
  else { const line = await page.locator('[data-field="prospective-empty"]').innerText(); const next = new Date(Date.parse(`${score.written_at.slice(0, 10)}T00:00:00Z`) + 7 * 864e5).toISOString().slice(0, 10); eq("prospective empty", line.includes(`due around ${longDate(next)}`), true); eq("no prospective table", await page.locator('table[data-table="score-prospective"]').count(), 0); }
  if (score.hindsight.games > 0) { await checkWeek(score.hindsight, "score-hindsight", false); eq("hindsight note", (await page.locator('[data-field="hindsight-note"]').innerText()).includes("too few to quote"), true); eq("unprojected", num(await page.locator('#season-2026-27 [data-field="unprojected"]').last().getAttribute("data-value")), score.hindsight.unprojected_minutes_share); }

  // Aging: both series at every age 20 to 38, relative to 27.
  const ages = card.aging.ages.map((age, i) => ({ age, delta: card.aging.delta_method_relative_to_27[i], pd: card.aging.partial_dependence.lightgbm[i] })).filter(a => a.age >= 20 && a.age <= 38);
  const zeroPd = ages.find(a => a.age === 27).pd;
  const aging = await page.evaluate(() => { const f = document.querySelector('[data-chart="aging"]'); const dots = s => [...f.querySelectorAll(`.slc-dot${s}`)].map(d => ({ age: d.dataset.season, value: d.dataset.value, bg: getComputedStyle(d).backgroundColor })); const line = s => getComputedStyle(f.querySelector(`path.slc-line${s}`)).stroke;
    return { main: dots(":not([data-series])"), overlay: dots('[data-series="overlay"]'), mainStroke: line(":not([data-series])"), overlayStroke: line('[data-series="overlay"]'), zero: f.querySelectorAll(".slc-grid[data-zero]").length, x: [...f.querySelectorAll(".slc-x-label")].map(x => x.textContent), a: getComputedStyle(document.documentElement).getPropertyValue("--color-category-3").trim(), b: getComputedStyle(document.documentElement).getPropertyValue("--color-category-4").trim(), text: f.innerText, keyA: getComputedStyle(f.querySelector('.pi-key-mark[data-series="main"]')).backgroundColor, keyB: getComputedStyle(f.querySelector('.pi-key-mark[data-series="overlay"]')).backgroundColor }; });
  eq("aging points", aging.main.length, ages.length); eq("aging overlay points", aging.overlay.length, ages.length); eq("aging zero line", aging.zero, 1); eq("aging ages", aging.main.map(d => d.age).join(), ages.map(a => String(a.age)).join()); eq("aging x labels", aging.x.join(), "20,24,27,30,34,38");
  for (const a of ages) { eq(`aging ${a.age}`, num(aging.main.find(d => d.age === String(a.age))?.value), a.delta); near(`aging model ${a.age}`, num(aging.overlay.find(d => d.age === String(a.age))?.value), a.pd - zeroPd, 1e-9); }
  const hex = h => { const n = parseInt(h.slice(1), 16); return `rgb(${n >> 16 & 255}, ${n >> 8 & 255}, ${n & 255})`; };
  eq("aging tint a", aging.mainStroke, hex(aging.a)); eq("aging tint b", aging.overlayStroke, hex(aging.b)); eq("aging key a", aging.keyA, hex(aging.a)); eq("aging key b", aging.keyB, hex(aging.b));
  eq("aging honesty", aging.text.includes("Neither curve has a served interval"), true); eq("aging ends", aging.text.includes("The ends rest on few players"), true);
  const agingLine = await page.locator('[data-field="aging-line"]').innerText();
  eq("aging gains", agingLine.includes(`players ${paren(pool.player.gaps.age_curve_over_carry_forward)}, games ${paren(pool.game.gaps.age_curve_over_carry_forward)}, which is worse`), true); eq("aging worse", pool.game.gaps.age_curve_over_carry_forward.high < 0, true);

  // Coverage.
  const cov = card.test.pooled.coverage;
  const covTable = await readTable(page, "coverage");
  eq("coverage rows", covTable.map(r => r.key).join(), ["all", ...Object.keys(cov.by_prior_minutes)].join());
  const all = covTable[0]; eq("coverage all", num(all.cells.coverage.value), cov.overall.coverage); eq("coverage all text", all.cells.coverage.main, pct(cov.overall.coverage)); eq("coverage all players", num(all.cells.players.value), cov.overall.players); eq("coverage all width", all.cells.width.text, "—");
  for (const [b, row] of Object.entries(cov.by_prior_minutes)) { const r = covTable.find(x => x.key === b); eq(`coverage ${b}`, num(r.cells.coverage.value), row.coverage); eq(`coverage ${b} text`, r.cells.coverage.main, pct(row.coverage)); eq(`coverage ${b} players`, num(r.cells.players.value), row.players); eq(`coverage ${b} width`, num(r.cells.width.value), row.half_width); eq(`coverage ${b} width text`, r.cells.width.main, fixed(row.half_width)); eq(`coverage ${b} calibrated`, num(r.cells.calibration.value), model.conformal[`${b}_n`]); eq(`coverage ${b} width = conformal`, row.half_width, model.conformal[b]); }
  const covLine = await page.locator('[data-field="coverage-line"]').innerText();
  eq("coverage line", covLine.includes(`covered ${pct(cov.overall.coverage)} of ${count(cov.overall.players)} players (${Object.entries(card.test.seasons).map(([s, v]) => `${pct(v.coverage.overall.coverage)} in ${s}`).join(", ")}), past the 77–83%`), true);
  eq("coverage mean width", num(await page.locator('[data-field="mean-width"]').getAttribute("data-value")), cov.mean_width);

  if (shots) {
    await page.screenshot({ path: `${shots}/pi-top-${tag}.png` });
    await page.evaluate(async () => { document.querySelectorAll("img").forEach(i => { i.loading = "eager"; }); });
    await page.waitForLoadState("networkidle").catch(() => {});
    await page.screenshot({ path: `${shots}/pi-full-${tag}.png`, fullPage: true });
    for (const id of ["projections", "contributions", "test", "season-2026-27", "aging", "intervals", "reading"]) { await page.locator(`#${id}`).scrollIntoViewIfNeeded(); await page.waitForTimeout(200); await page.locator(`#${id}`).screenshot({ path: `${shots}/pi-${id}-${tag}.png` }); }
    await page.evaluate(() => window.scrollTo(0, 0));
  }

  // About and the definitions, collapsed by default.
  const collapsedHeight = await page.evaluate(() => document.documentElement.scrollHeight);
  eq("about collapsed", await page.locator("#about details").getAttribute("open"), null); eq("glossary collapsed", await page.locator("#glossary details").getAttribute("open"), null);
  await page.locator("#about summary").click();
  eq("about projections hash", await page.locator('[data-field="projections-sha"]').getAttribute("data-value"), model.projections_sha256); eq("about registration hash", await page.locator('[data-field="registration-sha"]').getAttribute("data-value"), model.registration_sha256); eq("about manifest hash", await page.locator('[data-field="manifest-sha"]').getAttribute("data-value"), model.manifest_sha256);
  const about = await page.locator("#about").innerText();
  const sel = card.selection.gaps_over_carry_forward_90;
  eq("about selection", about.includes(`Gain over carry-forward on ${card.selection.season} (90%): ${["lightgbm", "ridge", "time_decay", "age_curve"].map(n => `${LABEL[n]} ${paren(sel[n])}`).join("; ")}.`), true);
  eq("about model", about.includes(`LightGBM (${card.lightgbm.num_leaves} leaves, ${card.lightgbm.rounds} rounds`) && about.includes(`ridge alpha ${card.ridge_alpha}`), true);
  eq("about fallback", about.includes(`rookie average of ${signed(model.fallback_rating)}`), true); eq("about frozen", about.includes(`Frozen ${longDate(model.frozen_at)}, ${model.frozen_at.slice(11, 16)} UTC`), true);
  eq("about credit", about.includes("DARKO (Kostya Medvedovsky) and EPM (Taylor Snarr)"), true);
  const bands = { "500+": "500 to 999", "1000+": "1,000 to 1,999", "2000+": "2,000 or more" };
  for (const [k, v] of Object.entries(cov.by_target_minutes_diagnostic)) eq(`about diagnostic ${k}`, about.includes(`${bands[k]}, ${pct(v.coverage)}`), true);
  eq("diagnostic bands partition the players", Object.values(cov.by_target_minutes_diagnostic).reduce((s, v) => s + v.players, 0), cov.overall.players);
  if (shots) { await page.locator("#about").scrollIntoViewIfNeeded(); await page.waitForTimeout(200); await page.locator("#about").screenshot({ path: `${shots}/pi-about-${tag}.png` }); }
  await page.locator("#about summary").click();
  await page.locator("#glossary summary").click();
  if (shots) { await page.locator("#glossary").scrollIntoViewIfNeeded(); await page.waitForTimeout(200); await page.locator("#glossary").screenshot({ path: `${shots}/pi-glossary-${tag}.png` }); }
  await page.locator("#glossary summary").click();

  // Page-wide rules. Images are made eager first, so broken ones count.
  await page.evaluate(async () => { document.querySelectorAll("img").forEach(i => { i.loading = "eager"; }); await Promise.race([Promise.all([...document.images].map(i => i.complete ? 0 : new Promise(r => { i.onload = i.onerror = r; }))), new Promise(r => setTimeout(r, 45000))]); });
  const layout = await page.evaluate(w => {
    const root = document.querySelector(".pi-page"), text = root.innerText;
    const visible = e => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 && !e.closest("[aria-hidden='true']"); };
    const small = w < 600 ? [...root.querySelectorAll(":is(button, select, input, summary, a)")].filter(visible).filter(e => Math.round(e.getBoundingClientRect().height) < 40 && !e.closest("th")).map(e => `${e.tagName} ${(e.getAttribute("aria-label") || e.textContent || "").trim().slice(0, 40)} ${e.getBoundingClientRect().height}`) : [];
    const icon = document.querySelector(".research-hero .ui-page-header-icon").getBoundingClientRect(), svg = document.querySelector(".research-hero .ui-page-header-icon svg").getBoundingClientRect();
    const toned = [...root.querySelectorAll("[data-tone]")].filter(e => e.closest("td") && !e.classList.contains("rs-swatch"));
    return {
      overflow: document.documentElement.scrollWidth - innerWidth, broken: [...document.images].filter(i => i.complete && i.naturalWidth === 0).length, images: root.querySelectorAll("img").length,
      portraits: root.querySelectorAll("table .player-portrait").length, portraitFallbacks: root.querySelectorAll("table .player-portrait-fallback").length, small, column: Math.round(root.getBoundingClientRect().width), height: document.documentElement.scrollHeight,
      fractionalControlHeights: [...root.querySelectorAll(":is(button, select)")].filter(visible).filter(e => { const h = e.getBoundingClientRect().height; return Math.abs(h - Math.round(h)) > 0.01; }).length,
      iconCentred: Math.abs((icon.left + icon.width / 2) - (svg.left + svg.width / 2)) <= 1 && Math.abs((icon.top + icon.height / 2) - (svg.top + svg.height / 2)) <= 1,
      projectWords: (text.match(/\b(courtlens-projected|commit|branch|R\d\d|F1|A1|A2|owner|waive[dr]?|the plan)\b/gi) ?? []), arrows: /[→←↑↓]/.test(text), isoDates: (text.match(/\b20\d\d-\d\d-\d\d\b/g) ?? []).length, hyphenMinus: (text.match(/(?<![\w–-])-\d+\.\d/g) ?? []).length,
      greenRedCells: toned.length, watermarks: root.querySelectorAll(".pi-card > img, .rs-card > img").length, sectionBorders: [...root.querySelectorAll(":scope > .rs-section")].filter(s => parseFloat(getComputedStyle(s).borderTopWidth) > 0).length,
      cardEdges: (c => c ? parseFloat(getComputedStyle(c).borderLeftWidth) : 0)(root.querySelector(".pi-card")),
      phoneBoardFits: (() => { const c = root.querySelector('table[data-table="projections"] td[data-column="projection"]').getBoundingClientRect(); return c.right <= innerWidth; })(),
      firstColumnBarsHidden: root.querySelector(".pi-range") ? getComputedStyle(root.querySelector(".pi-range")).display : null,
    };
  }, width);

  // The other test seasons.
  for (const season of Object.keys(card.test.seasons)) { await open(`?testSeason=${season}`, 'table[data-table="test-players"] tbody tr'); await checkTest(card.test.seasons[season], season, `test ${season}`); }

  // The other views and every team.
  for (const view of ["rookie", "all"]) { await open(`?view=${view}`, READY); checkBoard(view, await readTable(page, "projections"), byProjection(inView(view))); eq(`${view} count`, await page.locator('[data-field="shown"]').getAttribute("data-value"), String(inView(view).length)); }
  const teams = [...new Set(players.filter(p => p.on_roster).map(p => p.tricode))].sort();
  for (const team of wide ? teams : teams.slice(0, 3)) { await open(`?team=${team}`, READY); checkBoard(`team ${team}`, await readTable(page, "projections"), byProjection(inView("roster").filter(p => p.tricode === team))); }
  { const last = players.find(p => !p.on_roster); await open(`?view=all&team=${last.last_tricode}`, READY); checkBoard("everyone, last team", await readTable(page, "projections"), byProjection(players.filter(p => teamOf(p) === last.last_tricode))); }

  // Search and sort.
  await open("", READY);
  await page.getByRole("searchbox", { name: "Search players", exact: true }).fill("curry");
  await page.waitForFunction(() => document.querySelectorAll('table[data-table="projections"] tbody tr[data-row]').length < 20);
  checkBoard("search curry", await readTable(page, "projections"), byProjection(inView("roster").filter(p => p.name.toLowerCase().includes("curry"))));
  await page.getByRole("searchbox", { name: "Search players", exact: true }).fill("");
  await page.waitForFunction(n => document.querySelectorAll('table[data-table="projections"] tbody tr[data-row]').length === n, inView("roster").length);
  await page.locator('table[data-table="projections"] thead th', { hasText: "Age" }).locator("button").first().click();
  await page.waitForTimeout(250);
  const ageRows = await readTable(page, "projections"), ageValues = ageRows.map(r => num(r.cells.age.value));
  const knownAges = ageValues.filter(a => a !== null);
  eq("sort by age: oldest first", knownAges.every((a, i) => i === 0 || knownAges[i - 1] >= a), true);
  eq("sort by age: unknown last", ageValues.slice(knownAges.length).every(a => a === null), true);

  // The Why card for a spread of players, and the search into it.
  const pick = (list, n) => list.slice(0, n);
  const roster = byProjection(inView("roster"));
  const spread = [...pick(roster, wide ? 40 : 4), ...roster.slice(wide ? -10 : -1), ...pick(players.filter(p => p.group === "rookie"), wide ? 15 : 2), ...pick(players.filter(p => p.group === "returner"), wide ? 10 : 1), ...pick(players.filter(p => !p.on_roster), wide ? 10 : 1)];
  for (const p of spread) { await open(`?player=${p.player_id}`, `[data-player="${p.player_id}"]`); await checkCard(p, `card ${p.name}`); }
  await open("", READY);
  const wanted = roster[3];
  await page.locator("#contributions input").first().fill(wanted.name.split(" ").at(-1));
  await page.waitForSelector('#contributions [role="option"]', { timeout: 15000 });
  await page.locator('#contributions [role="option"]', { hasText: wanted.name }).first().click();
  await page.waitForSelector(`[data-player="${wanted.player_id}"]`, { state: "attached" });
  await checkCard(wanted, "card via search");
  await page.locator("#contributions").getByRole("button", { name: "Clear" }).click();
  await page.waitForFunction(() => location.search.includes("player=none"));
  eq("cleared state", (await page.locator("#contributions").innerText()).includes("No player chosen."), true);
  await page.locator("#contributions").getByRole("button", { name: "Open the default player" }).click();
  await page.waitForSelector(`[data-player="${top.player_id}"]`, { state: "attached" });

  const result = { width, collapsedHeight, compared, loads, mismatches: mismatches.length, errors: [...new Set(errors)].slice(0, 12), ...layout, firstMismatches: mismatches.slice(0, 30) };
  report.push(result);
  console.log(JSON.stringify({ ...result, firstMismatches: mismatches.slice(0, 12) }, null, 1));
  await page.close();
}
await browser.close();
if (out) writeFileSync(out, JSON.stringify(report, null, 1));
