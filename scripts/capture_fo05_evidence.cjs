// FO05 evidence: Roster Shapes screens, layout measurements and export compatibility checks.
// Usage: node scripts/capture_fo05_evidence.cjs [baseUrl] [apiUrl]
const path = require("path");
const fs = require("fs");
const { chromium } = require(path.join(__dirname, "../dashboard/node_modules/playwright"));

const base = process.argv[2] || "http://localhost:3100";
const api = process.argv[3] || "http://localhost:8000";
const outDir = path.join(__dirname, "../docs/evidence/fo05");
fs.mkdirSync(path.join(outDir, "screens"), { recursive: true });

const TEAM = "1610612738";
const SCOPE = "season=2025-26&phase=regular_season";
const ASSIGN = { "Derrick White": "PG", "Anfernee Simons": "PG", "Payton Pritchard": "SG", "Jaylen Brown": "SF", "Baylor Scheierman": "SF", "Sam Hauser": "PF", "Neemias Queta": "C", "Luka Garza": "C" };
const PROJECT = { "Derrick White": "34", "Anfernee Simons": "22", "Payton Pritchard": "30", "Jaylen Brown": "35", "Baylor Scheierman": "18", "Sam Hauser": "26", "Neemias Queta": "26", "Luka Garza": "14" };

async function measure(page) {
  return page.evaluate(() => {
    const box = (sel) => { const el = document.querySelector(sel); if (!el) return null; const r = el.getBoundingClientRect(); return { top: Math.round(r.top + scrollY), left: Math.round(r.left), width: Math.round(r.width), height: Math.round(r.height) }; };
    const visible = (el) => el.getBoundingClientRect().width > 0;
    const subtitle = document.querySelector(".ui-page-header-subtitle");
    const title = document.querySelector(".ui-page-header-title")?.getBoundingClientRect();
    const actions = document.querySelector(".ui-page-header-actions")?.getBoundingClientRect();
    const main = document.querySelector("main")?.innerText ?? "";
    return {
      viewport: innerWidth,
      header: document.querySelector(".ui-page-header-title")?.textContent,
      subtitleLines: subtitle ? Math.round(subtitle.getBoundingClientRect().height / parseFloat(getComputedStyle(subtitle).lineHeight)) : 0,
      actionsOnTitleRow: Boolean(title && actions && actions.height > 0 && actions.top < title.bottom && actions.bottom > title.top),
      pickerTop: box(".roster-picker")?.top ?? null,
      teamTiles: document.querySelectorAll(".team-grid-tile").length,
      boardTop: box(".roster-chart")?.top ?? null,
      lanes: [...document.querySelectorAll(".roster-lane")].map((lane) => ({ lane: lane.dataset.lane, chips: lane.querySelectorAll(".roster-chip").length, share: lane.querySelector(".roster-share")?.getAttribute("aria-valuenow") })),
      laneColumnsLeft: [...document.querySelectorAll(".roster-lanes > .roster-lane")].map((lane) => Math.round(lane.getBoundingClientRect().left)),
      chipHeights: [...new Set([...document.querySelectorAll(".roster-chip")].map((chip) => Math.round(chip.getBoundingClientRect().height)))],
      menuTargets: [...new Set([...document.querySelectorAll(".roster-chip-menu .ui-menu-trigger")].filter(visible).map((el) => Math.round(el.getBoundingClientRect().height)))],
      chipHeadshots: document.querySelectorAll(".roster-chip .player-portrait, .roster-chip .player-portrait-fallback").length,
      chips: document.querySelectorAll(".roster-chip").length,
      teamLogo: Boolean(document.querySelector(".roster-team .team-logo img")),
      gauge: document.querySelector(".roster-gauge")?.className ?? null,
      gaugeText: document.querySelector(".roster-gauge")?.innerText.replace(/\s+/g, " ") ?? null,
      horizontalScroll: document.documentElement.scrollWidth > innerWidth,
      glyphs: (document.body.innerText.match(/[←-⇿■-◿☀-➿⬀-⯿]/g) || []).length,
      codeRulesInMain: /game_date|Strictly prior|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}/.test(main.replace(document.querySelector(".ui-why-body")?.innerText ?? "", "")),
      loadButtons: [...document.querySelectorAll("button")].filter((b) => /^Load/i.test(b.textContent.trim())).length,
      releaseInputs: [...document.querySelectorAll("label")].filter((l) => /Release ID/i.test(l.textContent)).length,
      notesInMainFlow: document.querySelectorAll("main .notice, main .ui-gated-note").length,
      filterControlHeights: [...document.querySelectorAll(".ui-filter-bar button:not(.ui-segmented-item), .ui-filter-bar select, .ui-filter-bar .ui-segmented-control")].filter(visible).map((e) => Math.round(e.getBoundingClientRect().height)),
      tableExpanded: document.querySelector(".roster-table .ui-accordion-trigger")?.getAttribute("aria-expanded")
    };
  });
}

async function moveAll(page) {
  for (const [name, lane] of Object.entries(ASSIGN)) {
    await page.getByRole("button", { name: `Move ${name}` }).click();
    await page.getByRole("menuitem", { name: new RegExp(`^Move to ${lane}`) }).click();
  }
}

async function setProjected(page, phone) {
  if (phone) await page.getByRole("button", { name: /^Filters/ }).click();
  await page.getByRole("radio", { name: "Projected" }).last().click();
  if (phone) { await page.keyboard.press("Escape"); await page.getByRole("dialog").waitFor({ state: "detached" }); }
  for (const [name, minutes] of Object.entries(PROJECT)) await page.getByLabel(`Projected minutes for ${name}`).fill(minutes);
}

(async () => {
  const browser = await chromium.launch();
  const results = { base, measuredAt: new Date().toISOString(), views: {}, export: {} };
  for (const [width, height] of [[1440, 900], [390, 844]]) {
    const phone = width < 768;
    const context = await browser.newContext({ viewport: { width, height }, acceptDownloads: true });
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    const shot = (name, fullPage = false) => page.screenshot({ path: path.join(outDir, "screens", `${name}-${width}.png`), fullPage });

    await page.goto(`${base}/roster-shapes?${SCOPE}`, { waitUntil: "networkidle" });
    await shot("picker");
    results.views[`picker-${width}`] = await measure(page);

    await page.getByRole("button", { name: "Boston Celtics" }).click();
    await page.getByRole("region", { name: "Roster allocations" }).waitFor();
    await page.waitForLoadState("networkidle");
    await shot("observed");
    results.views[`observed-${width}`] = await measure(page);

    await moveAll(page);
    await shot("assigned", true);
    results.views[`assigned-${width}`] = await measure(page);

    await setProjected(page, phone);
    await shot("projected", true);
    results.views[`projected-${width}`] = await measure(page);

    if (!phone) {
      // Drag from the pool into a lane, then capture the gauge over 240 and the Why? disclosure.
      const chart = page.getByRole("region", { name: "Roster allocations" });
      await chart.getByRole("region", { name: "Unassigned lane" }).locator(".roster-chip", { hasText: "Jordan Walsh" })
        .dragTo(chart.getByRole("region", { name: "SG lane" }));
      results.views.dragToSG = await chart.getByRole("region", { name: "SG lane" }).innerText().then((text) => text.includes("Jordan Walsh"));
      await page.getByLabel("Projected minutes for Jordan Walsh").fill("40");
      results.views.gaugeOver = await page.locator(".roster-gauge").getAttribute("class");
      await page.getByLabel("Projected minutes for Jordan Walsh").fill("");
      await page.locator(".ui-why-summary").first().click();
      await shot("why");
      results.views.whyHasCodeRules = /game_date|before_date/.test(await page.locator(".ui-why-body").innerText());
      await page.getByRole("button", { name: "Data details" }).click();
      await page.getByRole("dialog").waitFor();
      await page.waitForTimeout(300);
      await shot("data-details");
      results.views.dataDetailsWarnings = await page.getByRole("dialog").innerText().then((text) => text.includes("Source warning"));
      await page.keyboard.press("Escape");
      await page.getByRole("dialog").waitFor({ state: "detached" });

      const download = page.waitForEvent("download");
      await page.getByRole("button", { name: "Export JSON" }).click();
      const file = await download;
      const text = fs.readFileSync(await file.path(), "utf8");
      fs.writeFileSync(path.join(outDir, "export-sample.json"), text);

      // Rebuild the pre-FO05 payload from the same API response with the old page's formula.
      // Same request the page makes: the resolved release, season, phase and cutoff.
      const exported = JSON.parse(text).context;
      const query = new URLSearchParams({ releaseId: exported.release_id, season: exported.season, phase: exported.phase, beforeDate: exported.before_date });
      const data = await (await fetch(`${api}/api/workbench/teams/${TEAM}?${query}`)).json();
      // ASSIGN plus the dragged chip above.
      const positions = Object.fromEntries(Object.entries({ ...ASSIGN, "Jordan Walsh": "SG" }).map(([name, lane]) => [data.player_cohort.find((row) => row.player_name === name).player_id, lane]));
      const minutes = Object.fromEntries(Object.entries(PROJECT).map(([name, value]) => [data.player_cohort.find((row) => row.player_name === name).player_id, value]));
      const mode = "projected";
      const allocations = data.player_cohort.map(row => ({...row, allocation_position: positions[row.player_id] ?? "Unassigned", allocation_minutes: mode === "observed" ? row.total_minutes : minutes[row.player_id]?.trim() ? Number(minutes[row.player_id]) : null}));
      const legacy = JSON.stringify({version:"roster-minute-allocation-v1",context:data.context,team:data.team,source:"team-detail-player-game-boxes",basis:mode,position_source:"user_assigned",units:mode === "observed" ? "total_team_stint_minutes" : "projected_minutes_per_game",allocations,warnings:data.warnings}, null, 2);
      results.export = { bytes: Buffer.byteLength(text), keys: Object.keys(JSON.parse(text)), byteIdenticalToLegacyFormula: text === legacy };

      await page.getByRole("button", { name: "Change team" }).click();
      await page.getByRole("dialog", { name: "Choose a team" }).waitFor();
      await page.waitForTimeout(300);
      await shot("change-team");
      await page.keyboard.press("Escape");

      // A scope with no games yet: one line with an action, never zero minutes.
      await page.goto(`${base}/roster-shapes?team=${TEAM}&${SCOPE}&beforeDate=2025-10-01`, { waitUntil: "networkidle" });
      await page.locator(".ui-gated-note").first().waitFor();
      await shot("empty");
      results.views.emptyState = await page.locator(".ui-gated-note-line").first().innerText();
    } else {
      await page.getByRole("button", { name: /^Filters/ }).click();
      await page.waitForTimeout(400);
      await shot("filters-sheet");
    }
    results.views[`errors-${width}`] = errors;
    await context.close();
  }
  await browser.close();
  fs.writeFileSync(path.join(outDir, "measurements.json"), JSON.stringify(results, null, 2) + "\n");
  console.log(JSON.stringify(results, null, 2));
})();
