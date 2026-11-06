import { chromium } from "@playwright/test";
const out = process.argv[2];
const browser = await chromium.launch();
const views = [["rookies", ""], ["value", "?tab=value"], ["classes", "?tab=classes&year=1984&order=redraft"], ["steals", "?tab=steals"], ["combine", "?tab=combine"]];
for (const [w, h] of [[1440, 1000], [390, 844]]) {
  const page = await browser.newPage({ viewport: { width: w, height: h } });
  for (const [name, q] of views) {
    await page.goto(`http://localhost:3180/draft${q}`, { waitUntil: "networkidle" });
    await page.waitForTimeout(800);
    await page.screenshot({ path: `${out}/draft-${name}-${w}.png` });
    if (name === "rookies" || name === "value") await page.screenshot({ path: `${out}/draft-${name}-${w}-full.png`, fullPage: true });
  }
  await page.close();
}
await browser.close();
