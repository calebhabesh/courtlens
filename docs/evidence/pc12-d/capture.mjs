// Each capture enters without parameters and reads the real API; personal state is untouched.
import { createRequire } from "node:module";
import { mkdirSync, writeFileSync } from "node:fs";
const require = createRequire(new URL("../../../dashboard/package.json", import.meta.url).pathname);
const { chromium } = require("@playwright/test");
const base = process.env.BASE ?? "http://localhost:3415";
const out = new URL(".", import.meta.url).pathname;
mkdirSync(`${out}/screenshots`, { recursive: true });
const browser = await chromium.launch({ executablePath: "/usr/bin/chromium" });
const results = [];
for (const [name, path] of [["rankings", "/rankings"], ["tierlist", "/tierlist"]]) for (const [viewport, size] of Object.entries({ desktop: { width: 1440, height: 900 }, phone: { width: 390, height: 844 } })) {
  const page = await browser.newPage({ viewport: size, reducedMotion: "reduce" });
  const errors = [], failed = [], mutations = [];
  page.on("pageerror", error => errors.push(String(error)));
  page.on("console", message => { if (message.type() === "error") errors.push(message.text()); });
  page.on("response", response => { if (response.status() >= 400) failed.push(`${response.status()} ${new URL(response.url()).pathname}`); });
  page.on("request", request => { if (new URL(request.url()).pathname.startsWith("/api/workspace") && request.method() !== "GET") mutations.push(request.method()); });
  await page.goto(base + path, { waitUntil: "networkidle", timeout: 90000 });
  await page.waitForFunction(() => document.fonts.status === "loaded");
  const measurement = await page.evaluate(() => {
    const main = document.querySelector("main"), board = main.querySelector(".pc12-example-board");
    const visible = element => element.checkVisibility() && element.getBoundingClientRect().width > 0;
    return { title: main.querySelector("h1")?.textContent, resolved_url: location.pathname + location.search, first_result_top: board?.getBoundingClientRect().top ?? null, table_top: main.querySelector("table")?.getBoundingClientRect().top ?? null, groups_top: main.querySelector(".pc12-example-tiers")?.getBoundingClientRect().top ?? null, overflow_px: document.documentElement.scrollWidth - innerWidth,
      small_targets: [...main.querySelectorAll("button,a,input,select,summary")].filter(visible).filter(element => !element.closest("p,.ui-why,h2")).filter(element => element.getBoundingClientRect().height < 40).map(element => ({ text: element.textContent.trim().slice(0, 60), height: element.getBoundingClientRect().height })),
      players: [...main.querySelectorAll(".pc12-example-board .ui-identity-name")].map(element => element.textContent),
      groups: [...main.querySelectorAll(".pc12-example-tier h3")].map(element => element.textContent),
      minutes: [...main.querySelectorAll(".pc12-example-table tbody tr")].map(row => row.querySelectorAll("td")[1]?.querySelector("strong")?.textContent),
      iso_dates: (main.innerText.match(/\b20\d\d-\d\d-\d\d\b/g) ?? []).length, hashes: (main.innerText.match(/\b[0-9a-f]{64}\b/g) ?? []).length,
      text: main.innerText.slice(0, 4500) };
  });
  await page.screenshot({ path: `${out}/screenshots/${name}-${viewport}.png`, animations: "disabled" });
  await page.screenshot({ path: `${out}/screenshots/${name}-${viewport}-full.png`, animations: "disabled", fullPage: true });
  results.push({ name, path, viewport, ...measurement, errors, failed, mutations });
  await page.close();
}
writeFileSync(`${out}/measurements.json`, JSON.stringify(results, null, 2) + "\n");
await browser.close();
console.log(JSON.stringify(results.map(({ name, viewport, first_result_top, table_top, groups_top, overflow_px, errors, failed, mutations }) => ({ name, viewport, first_result_top, table_top, groups_top, overflow_px, errors, failed, mutations })), null, 2));
