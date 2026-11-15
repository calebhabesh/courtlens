import path from "node:path";
import { expect, test, type Page } from "@playwright/test";

// Site links SL04 owner gate: approved pages now look different on hover and focus. Real data on the
// owner's dev stack: SITE_LINKS_REAL=1 PLAYWRIGHT_EXTERNAL_SERVER=1.
test.skip(!process.env.SITE_LINKS_REAL, "Requires the real dev stack on :3100.");

const evidence = path.resolve(process.cwd(), "../docs/evidence/site-links/gate");

const shots: Array<{ name: string; path: string; link: string }> = [
  { name: "stats", path: "/stats", link: "a.stats-player-link" },
  { name: "live-card", path: "/live/2026-11-13", link: "a.live-card-team-link" },
  { name: "research-wingspan", path: "/wingspan", link: "main a.stats-player-link" },
];

async function hoverAndShoot(page: Page, link: string, file: string) {
  const target = page.locator(link).nth(1);
  await target.scrollIntoViewIfNeeded();
  await page.evaluate(() => window.scrollBy(0, -120));
  await target.hover();
  await page.waitForTimeout(300);
  const color = await target.evaluate(node => {
    const text = node.querySelector(".entity-link-text, .player-cell-name") ?? node;
    const style = getComputedStyle(text);
    return { color: style.color, decoration: style.textDecorationLine };
  });
  await page.screenshot({ path: file, animations: "disabled" });
  return color;
}

for (const width of [1440, 390]) {
  for (const { name, path: route, link } of shots) {
    test(`${name} at ${width} with a link hovered`, async ({ page }) => {
      test.setTimeout(120_000);
      await page.setViewportSize({ width, height: 900 });
      await page.goto(route, { waitUntil: "domcontentloaded" });
      await page.locator(link).nth(1).waitFor({ timeout: 60_000 });
      await page.waitForLoadState("networkidle", { timeout: 8_000 }).catch(() => undefined);
      const hovered = await hoverAndShoot(page, link, path.join(evidence, `${name}-${width}.png`));
      console.log(`SITE_LINKS_GATE ${JSON.stringify({ name, width, hovered })}`);
      // D1: accent (#ffd166 = rgb(255, 209, 102)) and underline on hover.
      expect(hovered.color).toBe("rgb(255, 209, 102)");
      expect(hovered.decoration).toContain("underline");
    });
  }
}

// SL05 owner gate: the Related row on the four hubs at 1440 and 390, with its first link hovered.
async function hubs(page: Page): Promise<Array<{ name: string; path: string }>> {
  await page.goto("/live/2026-11-13", { waitUntil: "domcontentloaded" });
  const game = page.locator('a[href^="/live/games/"]').first();
  await game.waitFor({ timeout: 60_000 });
  const gamePath = await game.getAttribute("href");
  await page.goto("/playoffs?season=2024-25", { waitUntil: "domcontentloaded" });
  const series = page.locator('a[href^="/playoffs/"]').first();
  await series.waitFor({ state: "attached", timeout: 60_000 });
  const seriesPath = await series.getAttribute("href");
  return [
    { name: "related-player", path: "/players/2544?season=2024-25" },
    { name: "related-team", path: "/teams/1610612760?season=2024-25" },
    { name: "related-game", path: gamePath! },
    { name: "related-series", path: seriesPath! },
  ];
}

test.describe("SL05 Related row", () => {
  for (const width of [1440, 390]) {
    test(`four hubs at ${width} with a Related link hovered`, async ({ page }) => {
      test.setTimeout(300_000);
      await page.setViewportSize({ width, height: 900 });
      for (const hub of await hubs(page)) {
        await page.goto(hub.path, { waitUntil: "domcontentloaded" });
        const row = page.getByRole("navigation", { name: "Related" });
        await row.waitFor({ timeout: 60_000 });
        await page.waitForLoadState("networkidle", { timeout: 8_000 }).catch(() => undefined);
        await row.scrollIntoViewIfNeeded();
        // Leave some of the page above the row in the picture.
        await page.evaluate(() => window.scrollBy(0, 240));
        const link = row.locator("a").first();
        await link.hover();
        await page.waitForTimeout(300);
        const hovered = await link.evaluate(node => {
          // A block link underlines its text child; an entity link underlines itself.
          const style = getComputedStyle(node.classList.contains("is-block") ? node.querySelector(".entity-link-text") ?? node : node);
          return { color: style.color, decoration: style.textDecorationLine, height: node.getBoundingClientRect().height };
        });
        await page.screenshot({ path: path.join(evidence, `${hub.name}-${width}.png`), animations: "disabled" });
        console.log(`SITE_LINKS_GATE ${JSON.stringify({ ...hub, width, hovered })}`);
        expect(hovered.color).toBe("rgb(255, 209, 102)");
        expect(hovered.decoration).toContain("underline");
        expect(hovered.height).toBeGreaterThanOrEqual(24);
      }
    });
  }

  test("a game's schedule link opens the team page at its schedule", async ({ page }) => {
    test.setTimeout(180_000);
    const game = (await hubs(page))[2];
    await page.goto(game.path, { waitUntil: "domcontentloaded" });
    const link = page.getByRole("navigation", { name: "Related" }).getByRole("link", { name: /Schedule$/ }).first();
    await link.waitFor({ timeout: 60_000 });
    await link.click();
    await page.waitForURL(/\/teams\//, { waitUntil: "commit", timeout: 60_000 });
    const schedule = page.locator("#schedule");
    await schedule.waitFor({ timeout: 60_000 });
    await page.waitForTimeout(1_500);
    const top = await schedule.evaluate(node => node.getBoundingClientRect().top);
    console.log(`SITE_LINKS_SCHEDULE ${JSON.stringify({ url: page.url(), top })}`);
    expect(page.url()).toMatch(/#schedule$/);
    expect(Math.abs(top)).toBeLessThan(200);
  });
});
