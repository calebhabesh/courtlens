// UC04 batch 1: measure every visible Stats control in a set of states, before and after the
// kit migration. Run from dashboard/ against a fixture build:
//   BASE=http://127.0.0.1:3180 OUT=<dir> LABEL=before node ../docs/evidence/ui-consolidation/uc04-stats/measure-stats.mjs
import { createRequire } from "node:module";
import { writeFileSync } from "node:fs";
const { chromium } = createRequire(`${process.cwd()}/`)("playwright");

const BASE = process.env.BASE ?? "http://127.0.0.1:3180";
const OUT = process.env.OUT;
const LABEL = process.env.LABEL ?? "run";

const collect = () => {
  const sel = "button, a[class*='button'], a[class*='pill'], a[class*='chip'], a[data-kit], select, summary, [role='radio'], [role='tab'], [data-kit='segmented'], .stats-preset-tabs, .control-button-group, .stats-footer-group, .stats-tool-group";
  const out = [];
  for (const el of document.querySelectorAll(sel)) {
    if (el.closest(".dense-stats-table tbody") && el.matches(".stats-cell-button")) continue;
    const r = el.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) continue;
    const cs = getComputedStyle(el);
    if (cs.visibility === "hidden") continue;
    const svgs = [...el.querySelectorAll(":scope svg")].slice(0, 3).map(s => {
      const b = s.getBoundingClientRect();
      return { w: +b.width.toFixed(1), l: +(b.left - r.left).toFixed(1), rt: +(r.right - b.right).toFixed(1), color: getComputedStyle(s).color };
    });
    const name = (el.getAttribute("aria-label") || el.innerText || el.value || el.getAttribute("title") || el.getAttribute("class") || "").trim().replace(/\s+/g, " ").slice(0, 48);
    out.push({
      key: `${el.tagName.toLowerCase()}|${el.getAttribute("role") || ""}|${name}`,
      x: +r.left.toFixed(1), y: +(r.top + scrollY).toFixed(1), w: +r.width.toFixed(1), h: +r.height.toFixed(1),
      pad: `${cs.paddingTop} ${cs.paddingRight} ${cs.paddingBottom} ${cs.paddingLeft}`,
      fs: cs.fontSize, fw: cs.fontWeight, radius: cs.borderRadius, gap: cs.columnGap,
      bg: cs.backgroundColor, color: cs.color, border: `${cs.borderTopWidth} ${cs.borderTopColor}`, shadow: cs.boxShadow,
      state: el.getAttribute("aria-pressed") || el.getAttribute("aria-checked") || el.getAttribute("aria-selected") || el.getAttribute("aria-expanded") || "",
      svgs,
    });
  }
  return out;
};

const rows = page => page.locator(".dense-stats-table tbody tr.stats-table-row:not(.stats-skeleton-row)");
const settle = async page => {
  await page.waitForFunction(() => document.fonts.status === "loaded" && !document.querySelector('body > div[hidden][id^="S:"]'));
  await page.waitForTimeout(400);
};

const STATES = [
  ["stats", "/stats", async () => {}],
  ["stats-preview-pinned", "/stats", async page => { await rows(page).first().getByRole("button", { name: /^Pin preview for / }).click(); }, { desktopOnly: true }],
  ["stats-filters", "/stats", async page => { await page.getByRole("button", { name: "Filters", exact: true }).first().click(); }],
  ["stats-team-dialog", "/stats", async page => { await page.getByRole("button", { name: "Select Team", exact: true }).first().click(); }, { desktopOnly: true }],
  ["stats-details", "/stats", async page => { await rows(page).first().getByRole("button", { name: /^Open details for / }).click(); }],
  ["stats-totals", "/stats?mode=totals", async () => {}],
  ["stats-scatter", "/stats", async page => { await page.getByRole("button", { name: "Scatter plot", exact: true }).click(); }],
  ["stats-lines", "/stats", async page => { await page.getByRole("button", { name: "Trend lines", exact: true }).click(); }],
  ["stats-manage-views", "/stats", async page => { await page.getByRole("button", { name: "Manage", exact: true }).click(); }],
  ["stats-hotkeys", "/stats", async page => { await page.getByRole("group", { name: "Page help" }).getByRole("button", { name: "Hotkeys" }).click(); }],
  ["stats-compare-tray", "/stats", async page => {
    for (let index = 0; index < 2; index += 1) await rows(page).nth(index).getByRole("button", { name: /^Add .* to comparison$/ }).click();
  }],
  ["stats-glossary", "/stats/glossary", async () => {}],
  ["stats-tracking", "/stats/tracking", async () => {}],
];

const browser = await chromium.launch({ executablePath: process.env.PW_CHROMIUM_PATH || "/usr/bin/chromium" });
const results = [];
try {
  for (const width of [1440, 390]) {
    const phone = width === 390;
    const context = await browser.newContext({ viewport: { width, height: phone ? 844 : 900 }, colorScheme: "dark", reducedMotion: "reduce", isMobile: phone, hasTouch: phone, deviceScaleFactor: 1 });
    for (const [name, path, act, opts = {}] of STATES) {
      if (opts.desktopOnly && phone) continue;
      const page = await context.newPage();
      const errors = [];
      page.on("pageerror", error => errors.push(error.message));
      try {
        await page.goto(BASE + path, { waitUntil: "networkidle" });
        await settle(page);
        await act(page);
        await page.waitForTimeout(500);
        const controls = await page.evaluate(collect);
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
        results.push({ state: name, width, errors, overflow, controls });
        if (OUT) await page.screenshot({ path: `${OUT}/${LABEL}-${name}-${width}.png`, fullPage: false });
      } catch (error) {
        results.push({ state: name, width, error: String(error).slice(0, 300) });
      }
      await page.close();
    }
    await context.close();
  }
} finally {
  await browser.close();
}
if (OUT) writeFileSync(`${OUT}/${LABEL}.json`, JSON.stringify(results, null, 1));
console.log(results.map(r => `${r.state}@${r.width}: ${r.error ?? `${r.controls.length} controls, ${r.errors.length} errors, overflow ${r.overflow}`}`).join("\n"));
