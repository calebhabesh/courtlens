// Real-data check for RD00 (design row 18, round 2): every value the page draws against the owner's API through a
// read-only proxy on 4180 (GET only; no API code changed), plus the round's layout checks: the centred column, the
// table's sideways scroll per view and names inside the pinned column.
import { chromium } from "/home/ethioking/dev/courtlens/dashboard/node_modules/playwright/index.mjs";
import { writeFileSync } from "node:fs";
const API = "http://127.0.0.1:4180", WEB = "http://localhost:3180/research/rapm/six-factor";
const [,, out] = process.argv;
const NODES = ["rapm", "orapm", "drapm", "o_ts", "o_tov", "o_reb", "d_ts", "d_tov", "d_reb"];
const FACTORS = NODES.slice(3);
const num = v => v == null ? null : Number(v);
const sortDesc = (rows, get) => [...rows].sort((a, b) => { const x = get(a), y = get(b); if (x == null || y == null) return (x == null) - (y == null) || a.player_id.localeCompare(b.player_id); return (y - x) || a.player_id.localeCompare(b.player_id); });
const report = [];
const browser = await chromium.launch();
for (const scope of [{ season: "2025-26", phase: "regular_season" }, { season: "2018-19", phase: "regular_season" }, { season: "2025-26", phase: "playoffs" }]) {
  const api = await (await fetch(`${API}/api/six-factor?season=${scope.season}&phase=${scope.phase}`)).json();
  const byId = new Map(api.players.map(p => [p.player_id, p]));
  const leader = sortDesc(api.players, p => p.metrics.rapm.value)[0];
  const tree = await (await fetch(`${API}/api/six-factor/tree?playerId=${leader.player_id}&season=${scope.season}&phase=${scope.phase}`)).json();
  for (const width of [1440, 390]) {
    const page = await browser.newPage({ viewport: { width, height: width > 600 ? 900 : 844 } });
    const errors = [], mismatches = [];
    let compared = 0;
    const layout = {};
    const eq = (what, got, want) => { compared += 1; if (!(got === want || (got == null && want == null))) mismatches.push({ what, got, want }); };
    page.on("console", m => { if (m.type() === "error") errors.push(m.text()); });
    page.on("pageerror", e => errors.push(String(e)));
    const query = new URLSearchParams({ season: scope.season, ...(scope.phase === "playoffs" ? { phase: "playoffs" } : {}) });
    await page.goto(`${WEB}?${query}`, { waitUntil: "networkidle" });
    await page.waitForSelector('[data-node="d_reb"]', { timeout: 60000 });
    // Table: three views, every row and cell.
    for (const view of ["Combined", "Offense", "Defense"]) {
      await page.getByRole("radio", { name: view, exact: true }).click();
      const fit = await page.evaluate(() => {
        const s = document.querySelector(".rt-scroll"), col = document.querySelector(".rs-column").getBoundingClientRect();
        const names = [...document.querySelectorAll(".rt-grid tbody .ui-identity-name")].filter(n => { const c = n.closest("th"), r = document.createRange(); r.selectNodeContents(n);
          return r.getBoundingClientRect().right > c.getBoundingClientRect().right - parseFloat(getComputedStyle(c).paddingRight) + 0.5; }).length;
        return { tableScroll: s.scrollWidth - s.clientWidth, columnWidth: Math.round(col.width), namesOutside: names };
      });
      layout[view] = fit;
      const cells = await page.$$eval(".rt-grid tbody tr[data-row]", rows => rows.map(row => ({ id: row.getAttribute("data-row"), cells: [...row.querySelectorAll("td[data-column]")].map(td => ({ key: td.getAttribute("data-column"), value: td.getAttribute("data-value"), low: td.getAttribute("data-low"), high: td.getAttribute("data-high"), text: td.textContent.trim(), tone: td.querySelector(".rt-value")?.getAttribute("data-tone") ?? null })) })));
      eq(`${view} row count`, cells.length, api.players.length);
      for (const row of cells) {
        const p = byId.get(row.id);
        for (const cell of row.cells) {
          let want, low = null, high = null;
          if (cell.key === "games" || cell.key === "minutes") want = p[cell.key];
          else if (cell.key === "net_efficiency" || cell.key === "possession_control") want = p.composites[cell.key];
          else ({ value: want, low, high } = p.metrics[cell.key]);
          eq(`${view} ${row.id} ${cell.key}`, num(cell.value), want);
          if (want == null) eq(`${view} ${row.id} ${cell.key} unknown text`, cell.text, "—");
          if (NODES.includes(cell.key) && want != null) {
            eq(`${view} ${row.id} ${cell.key} low`, num(cell.low), low);
            eq(`${view} ${row.id} ${cell.key} high`, num(cell.high), high);
            eq(`${view} ${row.id} ${cell.key} tone`, cell.tone, low != null && low > 0 ? "good" : high != null && high < 0 ? "bad" : null);
          }
          if ((cell.key === "net_efficiency" || cell.key === "possession_control") && want != null) eq(`${view} ${row.id} ${cell.key} never toned`, cell.tone, null);
        }
      }
    }
    // Factor panel: every factor's four highest and three lowest.
    for (const key of FACTORS) {
      await page.getByRole("region", { name: "The Six Factors" }).getByRole("radio", { name: { o_ts: "oTS", o_tov: "oTOV", o_reb: "oREB", d_ts: "dTS", d_tov: "dTOV", d_reb: "dREB" }[key], exact: true }).click();
      await page.waitForTimeout(150);
      const lists = await page.$$eval(".rs-ranked-list", ls => ls.map(l => [...l.querySelectorAll("li .rs-value")].map(v => ({ value: v.getAttribute("data-value"), low: v.getAttribute("data-low"), high: v.getAttribute("data-high") }))));
      const known = sortDesc(api.players, p => p.metrics[key].value).filter(p => p.metrics[key].value != null);
      const wantTop = known.slice(0, 4), wantLow = known.slice(-3).reverse();
      eq(`${key} top count`, lists[0].length, wantTop.length); eq(`${key} low count`, lists[1].length, wantLow.length);
      wantTop.forEach((p, i) => { eq(`${key} top ${i}`, num(lists[0][i]?.value), p.metrics[key].value); eq(`${key} top ${i} low`, num(lists[0][i]?.low), p.metrics[key].low); });
      wantLow.forEach((p, i) => { eq(`${key} low ${i}`, num(lists[1][i]?.value), p.metrics[key].value); eq(`${key} low ${i} high`, num(lists[1][i]?.high), p.metrics[key].high); });
    }
    // Archetypes: RAPM and the six-factor strip.
    const cards = await page.$$eval(".sf-archetype", cs => cs.map(c => ({ rapm: c.querySelector(".sf-archetype-rapm .rs-value")?.getAttribute("data-value"), strip: [...c.querySelectorAll(".sf-strip .rs-value")].map(v => v.getAttribute("data-value")), text: c.textContent })));
    eq("archetype count", cards.length, api.archetypes.length);
    api.archetypes.forEach((card, i) => {
      const p = byId.get(card.player_id);
      eq(`archetype ${card.key} rapm`, num(cards[i]?.rapm), p.metrics.rapm.value);
      FACTORS.forEach((key, j) => eq(`archetype ${card.key} ${key}`, num(cards[i]?.strip[j]), p.metrics[key].value));
      eq(`archetype ${card.key} rule`, cards[i]?.text.includes(card.rule), true);
    });
    // Copy numbers: R², counts, weights in the formulas, composite leaders, scatter points.
    const text = await page.locator(".sf-page").innerText();
    const fit = api.reconstruction;
    if (fit) {
      eq("R² in framework", text.includes(`R² = ${fit.in_sample.value.toFixed(3)}`), true);
      eq("CV R²", text.includes(fit.cross_validated.value.toFixed(3)), true);
      for (const key of FACTORS) eq(`weight ${key} in formula`, text.includes(`${fit.weights[key].toFixed(2)} × ${{ o_ts: "oTS", o_tov: "oTOV", o_reb: "oREB", d_ts: "dTS", d_tov: "dTOV", d_reb: "dREB" }[key]}`), true);
      for (const key of ["net_efficiency", "possession_control"]) {
        const top = sortDesc(api.players, p => p.composites[key]).find(p => p.composites[key] != null);
        const shown = await page.$$eval(".rs-card .rs-note .rs-value", vs => vs.map(v => v.getAttribute("data-value")));
        eq(`${key} leader value`, shown.map(Number).includes(top.composites[key]), true);
      }
    } else eq("no reconstruction note", text.includes("No reconstruction is registered"), true);
    eq("fit players", text.includes(`${api.fit_players.toLocaleString("en-US")} players in the fit`), true);
    eq("rated players", text.includes(`${api.players.length.toLocaleString("en-US")} rated`), true);
    if (api.coverage) eq("admitted games", text.includes(`${api.coverage.admitted_games.toLocaleString("en-US")} of ${api.coverage.scheduled_games.toLocaleString("en-US")} games admitted`), true);
    const dots = await page.locator(".sf-scatter-dot").count();
    eq("scatter points", dots, api.players.filter(p => p.composites.net_efficiency != null && p.composites.possession_control != null).length);
    // Impact Tree for the default (top RAPM) player.
    for (const key of NODES) {
      const node = page.locator(`[data-node="${key}"]`);
      eq(`tree ${key} status`, await node.getAttribute("data-status"), tree.metrics[key].status);
      eq(`tree ${key} value`, num(await node.getAttribute("data-value")), tree.metrics[key].value);
      eq(`tree ${key} low`, num(await node.getAttribute("data-low")), tree.metrics[key].low);
      eq(`tree ${key} high`, num(await node.getAttribute("data-high")), tree.metrics[key].high);
    }
    // Lazy images: walk the page and the table, then count broken ones.
    await page.evaluate(async () => {
      for (let y = 0; y < document.documentElement.scrollHeight; y += 600) { window.scrollTo(0, y); await new Promise(r => setTimeout(r, 80)); }
      for (const f of document.querySelectorAll(".rt-scroll")) for (let y = 0; y < f.scrollHeight; y += 400) { f.scrollTop = y; await new Promise(r => setTimeout(r, 80)); }
    });
    await page.waitForLoadState("networkidle");
    const broken = await page.evaluate(() => [...document.images].filter(i => i.complete && i.naturalWidth === 0).map(i => i.src));
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    report.push({ ...scope, width, layout, compared, mismatches: mismatches.length, firstMismatches: mismatches.slice(0, 5), consoleErrors: errors, overflow, brokenImages: broken.length });
    console.log(JSON.stringify(report.at(-1)));
    await page.close();
  }
}
await browser.close();
writeFileSync(out, JSON.stringify({ checked: new Date().toISOString(), api: "owner's API on :8000 through a read-only proxy on 4180 (GET only; shared Postgres read only)", web: "production build on 3180", results: report }, null, 2) + "\n");
