// Real-data check for RD00 rounds 3–4 (RAPM Ratings tab): every table cell, the leader bars and the four facts
// against the owner's API through a read-only proxy on 4180 (GET only; no API code changed), plus the layout:
// the centred column, the table's sideways scroll, no colour without an interval, console errors, overflow, images.
import { chromium } from "/home/ethioking/dev/courtlens/dashboard/node_modules/playwright/index.mjs";
import { writeFileSync } from "node:fs";
const API = "http://127.0.0.1:4180", WEB = "http://localhost:3180/research/rapm";
const [,, out] = process.argv;
const METRICS = ["rapm", "orapm", "drapm", "bpr", "rapm_2y", "rapm_3y"];
const report = [];
const browser = await chromium.launch();
for (const scope of [{ season: "2025-26", phase: "regular_season", beforeDate: "2026-07-01" }, { season: "2018-19", phase: "regular_season", beforeDate: "2019-07-01" }, { season: "2025-26", phase: "playoffs", beforeDate: "2026-07-01" }]) {
  const query = new URLSearchParams(scope);
  const api = await (await fetch(`${API}/api/workbench/impact?${query}`)).json();
  const byId = new Map(api.players.map(p => [p.player_id, p]));
  // Round 4: teams (photo colour, logo) come from the season's six-factor fit.
  const six = await (await fetch(`${API}/api/six-factor?${new URLSearchParams({ season: scope.season, phase: scope.phase })}`)).json();
  const teamOf = new Map((six.players ?? []).map(p => [p.player_id, p.team]));
  for (const width of [1440, 390]) {
    const page = await browser.newPage({ viewport: { width, height: width > 600 ? 900 : 844 } });
    const errors = [], mismatches = [];
    let compared = 0;
    const eq = (what, got, want) => { compared += 1; if (!(got === want || (got == null && want == null))) mismatches.push({ what, got, want }); };
    page.on("console", m => { if (m.type() === "error") errors.push(m.text()); });
    page.on("pageerror", e => errors.push(String(e)));
    await page.goto(`${WEB}?${query}`, { waitUntil: "networkidle" });
    const status = api.status;
    let layout = { status };
    if (api.players.length) {
      await page.waitForSelector(".rt-grid tbody tr[data-row]", { timeout: 60000 });
      const rows = await page.$$eval(".rt-grid tbody tr[data-row]", trs => trs.map(tr => ({ id: tr.getAttribute("data-row"), name: tr.querySelector(".ui-identity-name")?.textContent.trim(),
        team: tr.querySelector(".ui-identity-subtitle")?.textContent.trim() ?? null, photo: Math.round(tr.querySelector(".ui-identity-media > *")?.getBoundingClientRect().width ?? 0),
        cells: [...tr.querySelectorAll("td[data-column]")].map(td => ({ key: td.getAttribute("data-column"), value: td.getAttribute("data-value"), text: td.textContent.trim() })) })));
      eq("row count", rows.length, api.players.length);
      for (const row of rows) {
        const p = byId.get(row.id);
        eq(`${row.id} name`, row.name, p.player_name);
        eq(`${row.id} team`, row.team, teamOf.get(row.id) ?? null);
        eq(`${row.id} photo size`, row.photo, 40);
        for (const cell of row.cells) {
          const want = cell.key === "games" ? (p.support.rapm?.games ?? null) : cell.key === "minutes" ? (p.support.rapm?.seconds == null ? null : p.support.rapm.seconds / 60) : (p.metrics[cell.key] ?? null);
          eq(`${row.id} ${cell.key}`, cell.value == null ? null : Number(cell.value), want);
          if (want == null) eq(`${row.id} ${cell.key} unknown text`, cell.text, "—");
        }
        eq(`${row.id} column set`, row.cells.map(c => c.key).join(","), [...METRICS, "games", "minutes"].join(","));
      }
      layout = { ...layout, ...await page.evaluate(() => {
        const s = document.querySelector(".rt-scroll"), col = document.querySelector(".rapm-ratings.rs-column").getBoundingClientRect();
        return { columnWidth: Math.round(col.width), centred: Math.abs(col.left - (innerWidth - col.right)) <= 1, tableScroll: s.scrollWidth - s.clientWidth,
          coloured: document.querySelectorAll('.rt-grid [data-tone="good"], .rt-grid [data-tone="bad"]').length, colourKey: document.querySelectorAll('[aria-label="Colour key"]').length };
      }) };
    }
    if (status === "available") {
      const leaders = api.players.filter(p => p.metrics.rapm != null).slice(0, 5);
      const bars = await page.$$eval('[aria-label="Headline result"] .chart-ranked li', lis => lis.map(li => li.textContent));
      eq("leader bars", bars.length, leaders.length);
      leaders.forEach((p, i) => { eq(`leader ${i} name`, bars[i]?.includes(p.player_name), true); eq(`leader ${i} value`, bars[i]?.includes(p.metrics.rapm.toFixed(2)), true); });
      const facts = await page.$$eval('[aria-label="Fit summary"] .rs-card', cards => cards.map(c => c.textContent));
      const coverage = api.coverage.find(c => c.season === scope.season && c.phase === scope.phase);
      eq("fact top", facts[0]?.includes(leaders[0].metrics.rapm.toFixed(2)) && facts[0]?.includes(leaders[0].player_name), true);
      eq("fact rated", facts[1]?.includes(api.total_players.toLocaleString("en-US")), true);
      if (coverage) eq("fact admitted", facts[2]?.includes(`${coverage.admitted_games.toLocaleString("en-US")} / ${coverage.scheduled_games.toLocaleString("en-US")}`), true);
    } else {
      layout.notice = await page.locator("main").innerText().then(t => t.includes(api.reason || "No sealed impact fit"));
    }
    await page.evaluate(async () => { for (let y = 0; y < document.documentElement.scrollHeight; y += 600) { window.scrollTo(0, y); await new Promise(r => setTimeout(r, 80)); } });
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
