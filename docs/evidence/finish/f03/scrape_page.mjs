import { chromium } from "@playwright/test";
import { writeFileSync } from "node:fs";
const browser = await chromium.launch({ executablePath: "/usr/bin/chromium" });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const out = { tables: {}, fields: {} };
const grab = async () => page.evaluate(() => {
  const t = {};
  for (const table of document.querySelectorAll("table[aria-label]")) {
    const rows = [];
    for (const tr of table.querySelectorAll("tbody tr")) {
      const row = { attrs: Object.fromEntries([...tr.attributes].filter(a => a.name.startsWith("data-")).map(a => [a.name, a.value])), cells: {} };
      for (const td of tr.querySelectorAll("[data-field]")) row.cells[td.getAttribute("data-field")] = Object.fromEntries([...td.attributes].filter(a => a.name.startsWith("data-")).map(a => [a.name, a.value]));
      rows.push(row);
    }
    t[table.getAttribute("aria-label")] = rows;
  }
  return t;
});
await page.goto("http://localhost:3180/research/win-probability"); await page.waitForSelector('[data-field="headline"]');
for (const s of await page.locator("details summary").all()) await s.click();
Object.assign(out.tables, await grab());
out.fields = await page.evaluate(() => Object.fromEntries([...document.querySelectorAll("p[data-field],li[data-field],[data-chart],li[data-rule]")].map(e => [e.getAttribute("data-field") ?? e.getAttribute("data-chart") ?? e.getAttribute("data-rule"), Object.fromEntries([...e.attributes].filter(a => a.name.startsWith("data-")).map(a => [a.name, a.value]))])));
for (const phase of ["First half", "Third quarter", "Q4, before last 2 min", "Last 2 min", "Overtime"]) { await page.getByRole("radiogroup", { name: "Phase" }).getByRole("radio", { name: phase, exact: true }).click(); Object.assign(out.tables, await grab()); }
for (const season of ["2025-26", "2024-25"]) { await page.getByRole("radiogroup", { name: "Season" }).getByRole("radio", { name: season }).click(); await page.waitForSelector(`table[aria-label="Win probability added, ${season}"]`); Object.assign(out.tables, await grab()); }
writeFileSync(process.argv[2], JSON.stringify(out));
await browser.close();
