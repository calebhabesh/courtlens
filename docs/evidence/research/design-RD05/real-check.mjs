// Real-data check for RD05 (Defensive Shot Quality): every value the page draws against the owner's API through the read-only proxy
// on 4180 (readonly-proxy.mjs, GET only), the production build on 3180, at 1440 and 390. Also the colour rule (green/red only where
// the served interval excludes zero: D-SQ 95%, RAPM 80%; expected and actual PPS never), console errors, page overflow, broken
// images (photos forced eager and awaited), phone controls under 40 px and the hero icon's centring.
// Usage: node real-check.mjs <report.json> [<shots dir>]
import { chromium } from "/home/ethioking/dev/courtlens/dashboard/node_modules/playwright/index.mjs";
import { writeFileSync } from "node:fs";
const API = "http://127.0.0.1:4180", WEB = "http://localhost:3180/research/defensive-matchups";
const [,, out, shots] = process.argv;
const cache = {};
const api = async path => cache[path] ??= await (await fetch(`${API}${path}`)).json();
const cards = (season, kind, sort = "dsq", team = null) => api(`/api/defensive-shot-quality/cards?season=${season}&kind=${kind}&sort=${sort}${team ? `&team=${team}` : ""}`);
const tone = band => !band ? null : band[0] > 0 ? "good" : band[1] < 0 ? "bad" : null;

const SCENES = [
  { name: "default", q: "", season: "2025-26", kind: "all", all: true, summary: true },
  { name: "3pt", q: "kind=3pt", season: "2025-26", kind: "3pt", all: true },
  { name: "2019-20", q: "season=2019-20", season: "2019-20", kind: "all", all: true },
  { name: "rank-rapm", q: "sort=rapm", season: "2025-26", kind: "all", sort: "rapm" },
  { name: "team-bos", q: "", season: "2025-26", kind: "all", team: "BOS", teamName: "Boston Celtics", all: true },
  { name: "card-2pt", q: "", season: "2025-26", kind: "all", switchTo: "2pt" },
  { name: "search", q: "", season: "2025-26", kind: "all", search: true },
  { name: "follow-2025-26", q: "", season: "2025-26", kind: "all", follow: 3 },
  { name: "follow-2017-18", q: "season=2017-18", season: "2017-18", kind: "all", follow: 3 },
];

const report = [];
const browser = await chromium.launch();
for (const scene of SCENES) for (const width of [1440, 390]) {
  const page = await browser.newPage({ viewport: { width, height: width > 600 ? 900 : 844 } });
  const errors = [], mismatches = []; let compared = 0;
  const eq = (what, got, want, tol = 0) => {
    compared += 1;
    const ok = want === null ? got === null || got === "" : typeof want === "number" ? got !== null && got !== "" && Math.abs(Number(got) - want) <= tol : got === want;
    if (!ok) mismatches.push({ what, got, want });
  };
  page.on("console", m => { if (m.type() === "error") errors.push(m.text()); });
  page.on("pageerror", e => errors.push(String(e)));
  await page.goto(`${WEB}${scene.q ? `?${scene.q}` : ""}`, { waitUntil: "networkidle", timeout: 120000 });
  await page.waitForSelector("[data-card]", { timeout: 60000 });
  if (scene.team) {
    eq("no team dropdown", await page.locator("select[aria-label='Team']").count(), 0);
    await page.getByRole("button", { name: "Select Team" }).click();
    await page.getByRole("dialog", { name: "Select Team" }).getByRole("button", { name: scene.teamName }).click();
    await page.waitForURL(/team=BOS/);
    await page.waitForFunction(() => document.querySelectorAll("[data-card]").length > 0 && !document.querySelector("[aria-busy='true']"));
    await page.waitForTimeout(800);
  }
  const b = await cards(scene.season, scene.kind, scene.sort ?? "dsq", scene.team ?? null);
  const allBoard = await cards(scene.season, "all", scene.sort ?? "dsq", scene.team ?? null);
  const matchupsOf = Object.fromEntries(allBoard.rows.map(r => [r.player_id, r.key_matchups]));
  if (scene.all) {
    // Page through every card (Databallr's next-six paging).
    for (let i = 0; i < 80; i += 1) {
      const more = page.getByRole("button", { name: /Show next \d+ players/ });
      if (!(await more.count())) break;
      await more.click();
    }
    eq("paging count", await page.locator("[data-card]").count(), b.rows.length);
  } else eq("first page", await page.locator("[data-card]").count(), Math.min(6, b.rows.length));
  if (scene.switchTo) for (const c of await page.locator("[data-card]").all()) await c.getByRole("radio", { name: scene.switchTo.toUpperCase() }).click();
  const target = scene.search ? b.rows[9] : null;
  if (target) await page.getByRole("searchbox", { name: "Search defenders" }).fill(target.player_name);
  const drawn = await page.locator("[data-card]").evaluateAll(list => list.map(card => {
    const f = sel => { const el = card.querySelector(sel); return el ? { value: el.getAttribute("data-value"), low: el.getAttribute("data-low"), high: el.getAttribute("data-high"), tone: el.getAttribute("data-tone") } : null; };
    return { id: card.getAttribute("data-card"), kind: card.getAttribute("data-kind"), position: f("[data-field='position']")?.value, dsq: f(".dq-stat [data-field='dsq']"), rapm: f("[data-field='rapm']"),
      fga: f(".dq-stat [data-field='fga']"), xpps: f(".dq-stat [data-field='xpps']"), pps: f(".dq-stat [data-field='pps']"),
      ranks: Object.fromEntries(["dsq", "fga", "xpps", "pps"].map(k => [k, card.querySelector(`[data-field='${k}-rank']`)?.getAttribute("data-value")])),
      all: card.querySelector("[data-link='all-matchups']")?.getAttribute("href") ?? null,
      matchups: [...card.querySelectorAll("tr[data-matchup]")].map(tr => ({ id: tr.getAttribute("data-matchup"), href: tr.querySelector("a")?.getAttribute("href") ?? null, ...Object.fromEntries(["fga", "xpps", "pps"].map(k => [k, tr.querySelector(`td[data-field='${k}']`)?.getAttribute("data-value")])) })) };
  }));
  const expectedRows = target ? [target] : b.rows.slice(0, drawn.length);
  eq("order", JSON.stringify(drawn.map(d => d.id)), JSON.stringify(expectedRows.map(r => r.player_id)));
  const shownKind = scene.switchTo ?? scene.kind;
  const shownBoard = shownKind === scene.kind ? b : await cards(scene.season, shownKind, scene.sort ?? "dsq", scene.team ?? null);
  const shownById = Object.fromEntries(shownBoard.rows.map(r => [r.player_id, r]));
  for (const d of drawn) {
    const card = b.rows.find(r => r.player_id === d.id), v = shownById[d.id];
    eq(`${d.id} kind`, d.kind, shownKind);
    eq(`${d.id} position`, d.position, b.rows.indexOf(card) + 1);
    eq(`${d.id} rapm`, d.rapm?.value ?? null, card.rapm.value);
    if (card.rapm.value != null) { eq(`${d.id} rapm low`, d.rapm.low, card.rapm.interval[0]); eq(`${d.id} rapm high`, d.rapm.high, card.rapm.interval[1]); eq(`${d.id} rapm tone`, d.rapm.tone, tone(card.rapm.interval)); }
    if (!v) { eq(`${d.id} ${shownKind} unknown`, d.dsq?.value ?? null, null); continue; }
    eq(`${d.id} dsq`, d.dsq?.value ?? null, v.value.dsq);
    if (v.value.dsq != null) { eq(`${d.id} dsq low`, d.dsq.low, v.value.interval?.[0] ?? null); eq(`${d.id} dsq high`, d.dsq.high, v.value.interval?.[1] ?? null); eq(`${d.id} dsq tone`, d.dsq.tone, tone(v.value.interval)); }
    for (const k of ["fga", "xpps", "pps"]) { eq(`${d.id} ${k}`, d[k]?.value ?? null, v.value[k]); eq(`${d.id} ${k} tone`, d[k]?.tone ?? null, null); }
    for (const k of ["dsq", "fga", "xpps", "pps"]) eq(`${d.id} rank ${k}`, d.ranks[k] ?? null, v.rank?.[k] ?? null);
    const m = matchupsOf[d.id] ?? card.key_matchups;
    eq(`${d.id} matchups`, JSON.stringify(d.matchups.map(x => x.id)), JSON.stringify(m.map(x => x.player_id)));
    m.forEach((x, i) => { for (const k of ["fga", "xpps", "pps"]) eq(`${d.id} matchup ${x.player_id} ${k}`, d.matchups[i]?.[k] ?? null, x[k]); });
    // Round 3: All matchups and each key matchup's head-to-head on Player Matchups.
    const base = `/matchups?season=${scene.season}&side=defense&playerId=${d.id}`;
    eq(`${d.id} all-matchups href`, d.all, base);
    m.forEach((x, i) => eq(`${d.id} matchup ${x.player_id} href`, d.matchups[i]?.href ?? null, `${base}&opponentId=${x.player_id}`));
  }
  if (scene.follow) {
    // Round 3: follow the links of the first cards; Player Matchups must open on that defender, and on the head-to-head.
    for (const d of drawn.slice(0, scene.follow)) {
      const card = b.rows.find(r => r.player_id === d.id);
      const side = await browser.newPage({ viewport: { width, height: width > 600 ? 900 : 844 } });
      side.on("console", msg => { if (msg.type() === "error") errors.push(`matchups: ${msg.text()}`); });
      await side.goto(`http://localhost:3180${d.all}`, { waitUntil: "networkidle", timeout: 120000 });
      const view = await api(`/api/workbench/season-matchups?season=${scene.season}&side=defense&playerId=${d.id}&limit=50`);
      eq(`${d.id} matchups defender`, view.detail?.player_id ?? null, d.id);
      eq(`${d.id} matchups region`, await side.getByRole("region", { name: `Who ${card.player_name} guarded` }).count() > 0, true);
      const shooter = card.key_matchups[0];
      await side.goto(`http://localhost:3180${d.matchups[0].href}`, { waitUntil: "networkidle", timeout: 120000 });
      const pair = (await api(`/api/workbench/season-matchups?season=${scene.season}&side=defense&playerId=${d.id}&opponentId=${shooter.player_id}&limit=50`)).pair;
      eq(`${d.id} vs ${shooter.player_id} pair served`, pair ? String(pair.player_id) : null, shooter.player_id);
      eq(`${d.id} vs ${shooter.player_id} pair shown`, (await side.locator("main").innerText()).includes(shooter.player_name), true);
      await side.close();
    }
  }
  if (!target) eq("count chip", (await page.locator(".dq-toolbar").innerText()).includes(`${b.rows.length.toLocaleString("en-US")} defenders`), true);
  if (scene.summary) {
    const s = await api("/api/defensive-shot-quality");
    const attr = async (sel, name = "data-value") => page.locator(sel).first().getAttribute(name);
    eq("tile share", await attr("[data-field='share']"), s.signal.share);
    eq("tile persistence", await attr("[data-field='persistence']"), s.persistence.correlations.dsq.r);
    eq("tile agreement", await attr("[data-field='agreement']"), s.agreement_with_rapm.correlations.make.r);
    const checks = { "persistence-dsq": [s.persistence.correlations.dsq, s.persistence.pairs], "persistence-pps": [s.persistence.correlations.pps, s.persistence.pairs],
      "persistence-xpps": [s.persistence.correlations.xpps, s.persistence.pairs], "agreement-make": [s.agreement_with_rapm.correlations.make, s.agreement_with_rapm.pairs],
      "agreement-sq": [s.agreement_with_rapm.correlations.sq, s.agreement_with_rapm.pairs], "agreement-ts": [s.agreement_with_rapm.correlations.ts, s.agreement_with_rapm.pairs] };
    for (const [key, [c, pairs]] of Object.entries(checks)) {
      const row = `[data-table='checks'] tr[data-row='${key}']`;
      eq(`check ${key} r`, await attr(`${row} td[data-column='r']`), c.r);
      eq(`check ${key} low`, await attr(`${row} td[data-column='interval']`), c.interval[0]);
      eq(`check ${key} high`, await attr(`${row} td[data-column='interval']`, "data-high"), c.interval[1]);
      eq(`check ${key} pairs`, await attr(`${row} td[data-column='pairs']`), pairs);
    }
    for (const [season, blk] of Object.entries(s.seasons)) {
      const row = `[data-table='seasons'] tr[data-row='${season}']`;
      for (const [col, want] of [["games", blk.games], ["served", blk.defenders_served], ["excludes", blk.interval_excludes_zero], ["share", blk.interval_excludes_zero_share],
        ["width", blk.median_interval_width], ["pps", blk.league.all.pps], ["xpps", blk.league.all.xpps]]) eq(`season ${season} ${col}`, await attr(`${row} td[data-column='${col}']`), want);
    }
  }
  await page.evaluate(async () => { document.querySelectorAll("img").forEach(i => { i.loading = "eager"; }); await Promise.all([...document.images].map(i => i.complete ? 0 : new Promise(r => { i.onload = i.onerror = r; }))); });
  await page.waitForTimeout(1000);
  const page_ = await page.evaluate(w => {
    const broken = [...document.images].filter(i => i.complete && i.naturalWidth === 0).map(i => i.currentSrc || i.src);
    const small = w < 600 ? [...document.querySelectorAll("button, select, input, [role='radio'], summary")].filter(e => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 && r.height < 40 && !e.closest("[aria-hidden='true']"); }).map(e => `${e.tagName}:${(e.getAttribute("aria-label") || e.textContent || "").trim().slice(0, 40)}:${Math.round(e.getBoundingClientRect().height)}`) : [];
    const col = document.querySelector(".dq-page").getBoundingClientRect();
    const tile = document.querySelector(".dq-hero .ui-page-header-icon").getBoundingClientRect();
    const glyph = document.querySelector(".dq-hero .ui-page-header-icon svg").getBoundingClientRect();
    const title = document.querySelector(".dq-hero .ui-page-header-title").getBoundingClientRect();
    const mid = r => ({ x: r.left + r.width / 2, y: r.top + r.height / 2 });
    const icon = { dx: +(mid(glyph).x - mid(tile).x).toFixed(2), dy: +(mid(glyph).y - mid(tile).y).toFixed(2), titleDy: +(mid(title).y - mid(tile).y).toFixed(2),
      groupDx: +(((tile.left + title.right) / 2) - mid(col).x).toFixed(2) };
    const grid = getComputedStyle(document.querySelector(".dq-grid")).gridTemplateColumns.split(" ").length;
    // Every value tagged good (or bad) draws in the one positive (or negative) colour, the RAPM chip included; untagged values never do.
    const colours = tone => [...new Set([...document.querySelectorAll(`[data-card] [data-tone='${tone}']`)].map(e => getComputedStyle(e).color))];
    const good = colours("good"), bad = colours("bad");
    const plain = [...new Set([...document.querySelectorAll("[data-card] [data-field='rapm']:not([data-tone]), [data-card] .dq-stat [data-field]:not([data-tone])")].map(e => getComputedStyle(e).color))];
    const toneColours = { good, bad, plainUsesTone: plain.some(c => good.includes(c) || bad.includes(c)) };
    // Round 2 (owner): no logo watermark behind a card; the team colour stays.
    const cardsEl = [...document.querySelectorAll("[data-card]")];
    const watermarks = cardsEl.reduce((n, c) => n + c.querySelectorAll(":scope > img").length, 0);
    const tinted = cardsEl.filter(c => getComputedStyle(c).backgroundImage.includes("gradient")).length === cardsEl.length;
    return { overflow: document.documentElement.scrollWidth - innerWidth, broken, small, column: Math.round(col.width), columns: grid, icon, toneColours, watermarks, tinted };
  }, width);
  for (const [k, v] of Object.entries(page_.icon)) eq(`hero icon ${k}`, Math.abs(v) <= 1, true);
  eq("card columns", page_.columns, width > 1200 ? 3 : 1);
  eq("no watermarks", page_.watermarks, 0);
  eq("cards tinted", page_.tinted, true);
  eq("one good colour", page_.toneColours.good.length <= 1, true);
  eq("one bad colour", page_.toneColours.bad.length <= 1, true);
  eq("untoned values not green/red", page_.toneColours.plainUsesTone, false);
  report.push({ scene: scene.name, width, compared, mismatches: mismatches.slice(0, 40), mismatchCount: mismatches.length, errors, ...page_ });
  console.log(scene.name, width, compared, "mismatches", mismatches.length, "errors", errors.length, "overflow", page_.overflow, "broken", page_.broken.length, "small", page_.small.length, "col", page_.column, "cols", page_.columns, "icon", JSON.stringify(page_.icon));
  if (mismatches.length) console.log(JSON.stringify(mismatches.slice(0, 5)));
  if (page_.small.length) console.log(JSON.stringify(page_.small.slice(0, 8)));
  if (shots && ["default", "3pt", "2019-20", "team-bos", "card-2pt", "search"].includes(scene.name)) {
    const fresh = await browser.newPage({ viewport: { width, height: width > 600 ? 900 : 844 } });
    await fresh.goto(`${WEB}${scene.q ? `?${scene.q}` : ""}${scene.team ? `${scene.q ? "&" : "?"}team=${scene.team}` : ""}`, { waitUntil: "networkidle", timeout: 120000 });
    await fresh.waitForSelector("[data-card]", { timeout: 60000 });
    if (scene.switchTo) await fresh.locator("[data-card]").first().getByRole("radio", { name: scene.switchTo.toUpperCase() }).click();
    if (target) await fresh.getByRole("searchbox", { name: "Search defenders" }).fill(target.player_name);
    await fresh.evaluate(async () => { document.querySelectorAll("img").forEach(i => { i.loading = "eager"; }); await Promise.all([...document.images].map(i => i.complete ? 0 : new Promise(r => { i.onload = i.onerror = r; }))); });
    await fresh.waitForTimeout(1000);
    await fresh.screenshot({ path: `${shots}/dq-${scene.name}-${width}.png`, fullPage: true });
    await fresh.close();
  }
  await page.close();
}
await browser.close();
const total = report.reduce((a, r) => a + r.compared, 0), bad = report.reduce((a, r) => a + r.mismatchCount, 0);
writeFileSync(out, JSON.stringify({ compared: total, mismatches: bad, scenes: report }, null, 1) + "\n");
console.log("total", total, "mismatches", bad);
