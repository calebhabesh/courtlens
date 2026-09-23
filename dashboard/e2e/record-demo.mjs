import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";

async function run() {
  const repoRoot = path.resolve("..");
  const assetsDir = path.join(repoRoot, "docs/assets");
  const tempVideoDir = path.join(assetsDir, "video_temp");
  if (!fs.existsSync(tempVideoDir)) {
    fs.mkdirSync(tempVideoDir, { recursive: true });
  }

  const executablePath = process.env.PW_CHROMIUM_PATH || "/usr/bin/chromium";

  console.log("Launching Chromium for demonstration recording...");
  const browser = await chromium.launch({
    executablePath,
    headless: true,
  });

  const context = await browser.newContext({
    viewport: { width: 1280, height: 720 },
    recordVideo: {
      dir: tempVideoDir,
      size: { width: 1280, height: 720 },
    },
  });

  const page = await context.newPage();
  page.on("console", (msg) => console.log("PAGE LOG:", msg.text()));
  page.on("pageerror", (err) => console.log("PAGE ERROR:", err));
  const baseUrl = "http://localhost:3100";

  console.log("Step 1: Navigating to Player Explorer...");
  await page.goto(`${baseUrl}/players`, { waitUntil: "networkidle" });
  await page.waitForTimeout(1000);

  console.log("Step 2: Searching for 'LeBron'...");
  const searchInput = page.locator("#player-query");
  await searchInput.waitFor({ state: "visible", timeout: 10000 });
  await searchInput.click();
  await searchInput.pressSequentially("LeBron", { delay: 120 });
  await page.waitForTimeout(500);
  await page.locator('button[type="submit"]').click();

  const playerLink = page.locator('a[href*="/players/2544"]').first();
  await playerLink.waitFor({ state: "visible", timeout: 10000 });
  await page.waitForTimeout(1000);

  console.log("Step 3: Opening LeBron James Player Context...");
  await playerLink.click();
  await page.waitForURL(/\/players\/2544/, { timeout: 10000 });
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(2000);

  console.log("Scrolling through trends and matchup context...");
  await page.evaluate(() => window.scrollBy({ top: 400, behavior: "smooth" }));
  await page.waitForTimeout(2000);

  await page.evaluate(() => window.scrollBy({ top: 450, behavior: "smooth" }));
  await page.waitForTimeout(2000);

  await page.evaluate(() => window.scrollBy({ top: 450, behavior: "smooth" }));
  await page.waitForTimeout(2000);

  console.log("Step 4: Navigating to Two-Player Comparison (LeBron vs Curry at 2023-11-15)...");
  await page.goto(
    `${baseUrl}/compare?playerA=2544&playerB=201939&date=2023-11-15&snapshotId=5b14b7ed-353b-499d-a37a-6887b5f6c715`,
    { waitUntil: "networkidle" }
  );
  await page.waitForTimeout(3000);

  await page.evaluate(() => window.scrollBy({ top: 350, behavior: "smooth" }));
  await page.waitForTimeout(2500);

  console.log("Step 5: Navigating to Evaluation and Methodology view...");
  const evalLink = page.getByRole("link", { name: "Evaluation", exact: true }).first();
  await evalLink.click();
  await page.waitForURL(/\/evaluation/, { timeout: 10000 });
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(3000);

  await page.evaluate(() => window.scrollBy({ top: 400, behavior: "smooth" }));
  await page.waitForTimeout(2500);

  console.log("Recording complete. Closing page and saving video...");
  const video = page.video();
  await page.close();

  const targetPath = path.join(assetsDir, "demo.webm");
  await video.saveAs(targetPath);
  await context.close();
  await browser.close();
  fs.rmSync(tempVideoDir, { recursive: true, force: true });

  const stats = fs.statSync(targetPath);
  console.log(`Successfully created demo recording: ${targetPath} (${Math.round(stats.size / 1024)} KB)`);
}

run().catch((err) => {
  console.error("Recording failed:", err);
  process.exit(1);
});
