import { chromium, expect } from "@playwright/test";
import fs from "node:fs/promises";
import path from "node:path";

const base = process.argv[2] ?? "http://localhost:3100";
const output = process.argv[3];
if (output) await fs.mkdir(output, { recursive: true });
const report = { base, viewports: [] };
const browser = await chromium.launch({ headless: true, executablePath: process.env.PW_CHROMIUM_PATH ?? "/usr/bin/chromium" });
try {
  for (const width of [1440, 1024, 390]) {
    const page = await browser.newPage({ viewport: { width, height: 900 }, reducedMotion: "reduce" });
    const errors = [];
    page.on("pageerror", error => errors.push(error.message));
    await page.goto(new URL("/team-compare?history=1", base).href, { waitUntil: "networkidle" });
    await expect(page.locator(".tc-tray-drawer")).toHaveAttribute("data-open", "true");
    await expect(page.locator(".tc-history-scores")).toHaveCSS("display", "grid");
    await expect(page.locator(".tc-history-score-layout").first()).toHaveCSS("display", "grid");
    await expect(page.locator(".tc-history-team-totals")).toHaveCount(2);
    await expect(page.locator(".tc-history-team-totals").first()).toBeVisible();
    const geometry = await page.evaluate(() => {
      const center = element => {
        const range = document.createRange(); range.selectNodeContents(element);
        const rect = range.getBoundingClientRect();
        return rect.x + rect.width / 2;
      };
      const offsets = [...document.querySelectorAll(".tc-history-team-totals")].flatMap(table => {
        const headers = [...table.querySelectorAll("thead th")].slice(1);
        return [...table.querySelectorAll("tbody tr")].flatMap(row =>
          [...row.querySelectorAll(".tc-history-total-value")].map((value, index) => Math.abs(center(value) - center(headers[index]))));
      });
      const overflowing = [...document.querySelectorAll(".tc-history-score-side, .tc-history-game-meta, .tc-history-team-totals td")]
        .filter(el => el.scrollWidth > el.clientWidth + 1).map(el => el.textContent);
      return {
        clientWidth: document.documentElement.clientWidth,
        scrollWidth: document.documentElement.scrollWidth,
        maximumColumnOffset: Math.max(...offsets), overflowing,
        teamLabels: [...document.querySelectorAll(".tc-history-total-team")].map(el => el.textContent),
        gameWidths: [...document.querySelectorAll(".tc-history-scores button")].map(el => el.getBoundingClientRect().width),
      };
    });
    expect(geometry.clientWidth).toBe(geometry.scrollWidth);
    expect(geometry.maximumColumnOffset).toBeLessThan(1);
    expect(geometry.overflowing).toEqual([]);
    expect(geometry.teamLabels).toEqual(["OKC", "BOS", "OKC", "BOS"]);
    const games = page.locator(".tc-history-scores button");
    expect(await games.count()).toBeGreaterThan(0);
    if (await games.count() > 1) {
      const loaded = page.waitForResponse(response => response.url().includes("/api/live/historical?"));
      await games.nth(1).focus();
      await page.keyboard.press("Enter");
      expect((await loaded).ok()).toBe(true);
      await expect(games.nth(1)).toHaveAttribute("aria-pressed", "true");
      await expect(page.locator(".tc-history-team-totals")).toHaveCount(2);
    }
    await page.getByRole("radio", { name: "Full Box", exact: true }).click();
    const fullBoxRows = await page.locator(".tc-history-box-table tbody").evaluateAll(bodies => bodies.map(body => body.rows.length));
    for (const count of fullBoxRows) expect(count).toBeGreaterThan(5);
    await page.getByRole("radio", { name: "Top 5", exact: true }).click();
    const topRows = await page.locator(".tc-history-box-table tbody").evaluateAll(bodies => bodies.map(body => body.rows.length));
    expect(topRows).toEqual([5, 5]);
    expect(errors).toEqual([]);
    report.viewports.push({ width, ...geometry, fullBoxRows, topRows, errors });
    if (output) {
      await page.evaluate(() => document.activeElement?.blur());
      await page.locator(".tc-tray").screenshot({
        path: path.join(output, `history-${width}.png`), animations: "disabled",
        style: ".skip-link:not(:focus) { visibility: hidden; }",
      });
      await page.screenshot({ path: path.join(output, `full-${width}.png`), fullPage: true, animations: "disabled" });
    }
    await page.close();
  }
} finally {
  await browser.close();
  if (output) await fs.writeFile(path.join(output, "verification.json"), JSON.stringify(report, null, 2) + "\n");
}
console.log(JSON.stringify(report, null, 2));
