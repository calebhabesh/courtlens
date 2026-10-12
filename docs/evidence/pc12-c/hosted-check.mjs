import { createRequire } from "node:module";
import { writeFileSync } from "node:fs";
import assert from "node:assert/strict";
const require = createRequire(new URL("../../../dashboard/package.json", import.meta.url).pathname);
const { chromium } = require("@playwright/test");
const browser = await chromium.launch({ executablePath: "/usr/bin/chromium" });
const checks = [];
for (const width of [1440, 390]) {
  const page = await browser.newPage({ viewport: { width, height: 900 } });
  for (const path of ["/investigations", "/investigations?view=personal"]) {
    await page.goto(`http://localhost:3423${path}`, { waitUntil: "networkidle" });
    const actual = { width, path, public_examples: await page.getByRole("region", { name: "Public investigation examples" }).count(), personal_link: await page.getByRole("link", { name: "My Saved Investigations" }).count(), legacy_library: await page.getByRole("region", { name: "Legacy saved investigations" }).count(), overflow: await page.evaluate(() => document.documentElement.scrollWidth - innerWidth) };
    assert.equal(actual.public_examples, 1); assert.equal(actual.personal_link, 0); assert.equal(actual.legacy_library, 0); assert.equal(actual.overflow, 0);
    checks.push(actual);
  }
  await page.close();
}
await browser.close();
writeFileSync(new URL("./hosted-check.json", import.meta.url), JSON.stringify(checks, null, 2) + "\n");
console.log("4 hosted menu checks passed; fixture production build with hosted flag.");
