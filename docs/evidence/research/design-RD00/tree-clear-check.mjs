// RD00 round 6 live check on the owner's :3100 (live API, GET only): clear the Impact Tree player, reload, restore, search.
import { chromium } from "/home/ethioking/dev/courtlens/dashboard/node_modules/playwright/index.mjs";
const b = await chromium.launch();
for (const width of [1440, 390]) {
  const p = await b.newPage({ viewport: { width, height: 900 } });
  const errors = []; p.on("pageerror", e => errors.push(String(e))); p.on("console", m => m.type() === "error" && errors.push(m.text()));
  await p.goto("http://localhost:3100/research/rapm/six-factor", { waitUntil: "networkidle" });
  await p.waitForSelector('[data-node="rapm"]', { timeout: 90000 });
  const before = await p.locator("#impact-tree .entity-chip").textContent();
  await p.locator("#impact-tree").getByRole("button", { name: /^Remove .* from Player$/ }).click();
  await p.waitForURL(/player=none/);
  await p.waitForTimeout(500);
  const empty = await p.locator("#impact-tree .ui-empty-state").count(), nodes = await p.locator("#impact-tree [data-node]").count();
  await p.locator("#impact-tree").scrollIntoViewIfNeeded();
  await p.locator("#impact-tree").screenshot({ path: `tree-empty-${width}.png` });
  await p.reload({ waitUntil: "networkidle" }); await p.waitForTimeout(800);
  const emptyAfterReload = await p.locator("#impact-tree .ui-empty-state").count();
  await p.locator("#impact-tree").getByRole("button", { name: /^Show / }).click();
  await p.waitForSelector('#impact-tree [data-node="rapm"]');
  const restored = await p.locator("#impact-tree .entity-chip").textContent();
  // search another player
  await p.locator("#impact-tree").getByRole("button", { name: /^Remove/ }).click();
  await p.waitForSelector("#impact-tree .ui-empty-state");
  await p.locator('#impact-tree [role="combobox"]').fill("Jokic");
  await p.locator('[role="option"]').first().click();
  await p.waitForSelector('#impact-tree [data-node="rapm"]');
  const searched = await p.locator("#impact-tree .entity-chip").textContent();
  const overflow = await p.evaluate(() => document.documentElement.scrollWidth - innerWidth);
  console.log(JSON.stringify({ width, before, empty, nodes, emptyAfterReload, restored, searched, overflow, url: p.url(), errors }));
  await p.close();
}
await b.close();
