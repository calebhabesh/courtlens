// Real production, parameter-free first loads; no source acquisition or provider calls.
import { createRequire } from "node:module";
import { mkdirSync, writeFileSync } from "node:fs";
const require = createRequire(new URL("../../../dashboard/package.json", import.meta.url).pathname);
const { chromium } = require("@playwright/test");
const base = process.env.BASE ?? "http://localhost:3413";
const out = new URL(".", import.meta.url).pathname;
mkdirSync(`${out}/screenshots`, { recursive: true });
const routes = [["evaluation", "/evaluation"], ["public-investigations", "/investigations"], ["saved-distribution", "/investigations/saved/3bcb37c9-b410-44b1-be7f-c3b368fbe28c"], ["saved-periods", "/investigations/saved/ed0c4c82-9b31-4527-962e-012d180ec2ba"], ["saved-venue", "/investigations/saved/be611173-e250-44cc-bd72-7e64f24341ec"], ["saved-peers", "/investigations/saved/fff8adb1-f205-4fdf-a353-8618ac567440"], ["playoffs", "/playoffs"]];
const browser = await chromium.launch({ executablePath: "/usr/bin/chromium" });
const results = [];
for (const [name, path] of routes) for (const [viewport, size] of Object.entries({ desktop: { width: 1440, height: 900 }, phone: { width: 390, height: 844 } })) {
  const page = await browser.newPage({ viewport: size, reducedMotion: "reduce" });
  const errors = [], failed = [];
  page.on("pageerror", error => errors.push(String(error)));
  page.on("console", message => { if (message.type() === "error") errors.push(message.text()); });
  page.on("response", response => { if (response.status() >= 400) failed.push(`${response.status()} ${new URL(response.url()).pathname}`); });
  await page.goto(base + path, { waitUntil: "networkidle", timeout: 90000 });
  await page.waitForFunction(() => document.fonts.status === "loaded");
  const measurement = await page.evaluate(() => {
    const main = document.querySelector("main");
    const visible = element => element.checkVisibility() && element.getBoundingClientRect().width > 0;
    const text = main.innerText;
    const first = main.querySelector(".chart-frame,.pc12-public-findings,.ui-findings,.playoffs-bracket-content");
    return { title: main.querySelector("h1")?.textContent, first_result_top: first?.getBoundingClientRect().top ?? null, first_table_top: main.querySelector("table")?.getBoundingClientRect().top ?? null, overflow_px: document.documentElement.scrollWidth - innerWidth,
      small_targets: [...main.querySelectorAll("button,a,input,select")].filter(visible).filter(element => !element.closest("table,p,.ui-why,h2,.ui-identity")).filter(element => element.getBoundingClientRect().height < 40).map(element => ({ text: element.textContent.trim().slice(0, 60), height: element.getBoundingClientRect().height })),
      iso_dates: (text.match(/\b20\d\d-\d\d-\d\d\b/g) ?? []).length, hashes: (text.match(/\b[0-9a-f]{64}\b/g) ?? []).length, code_rules: (text.match(/game_date\s*<\s*before_date/g) ?? []).length, internal_titles: (text.match(/B35[ab]/g) ?? []).length,
      chart: main.querySelector(".chart-frame")?.textContent, text: text.slice(0, 1800), circles: main.querySelectorAll(".pc12-samples-svg circle").length,
      cards: [...main.querySelectorAll(".pc12-public-finding h2")].map(element => element.textContent), source: [...main.querySelectorAll(".chart-meta")].map(element => element.textContent) };
  });
  await page.screenshot({ path: `${out}/screenshots/${name}-${viewport}.png`, animations: "disabled" });
  await page.screenshot({ path: `${out}/screenshots/${name}-${viewport}-full.png`, animations: "disabled", fullPage: true });
  results.push({ name, path, viewport, ...measurement, errors, failed });
  await page.close();
}
writeFileSync(`${out}/measurements.json`, JSON.stringify(results, null, 2) + "\n");
await browser.close();
console.log(JSON.stringify(results.map(({ name, viewport, title, first_result_top, overflow_px, errors, failed }) => ({ name, viewport, title, first_result_top, overflow_px, errors, failed })), null, 2));
