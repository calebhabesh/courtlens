import { expect, test, type Request } from "@playwright/test";
import { openWorkbench } from "./workbench-navigation";

// Site links (docs/site-links-plan.md): entity links never prefetch, on entering the viewport or on
// hover, so a table of names sends no request per row to the shared VPS. Prefetching only happens in
// production builds, which is what this suite runs against.
const ENTITY_PATH = /^\/(players|teams|live\/games|live\/open|playoffs)\//;

function entityRequests(requests: Request[]) {
  return requests.filter(request => ENTITY_PATH.test(new URL(request.url()).pathname)).map(request => request.url());
}

// The fixture API has no standings rows; against real data (SITE_LINKS_PREFETCH_REAL=1) Standings is measured too.
for (const route of process.env.SITE_LINKS_PREFETCH_REAL ? ["/stats", "/standings", "/draft"] : ["/stats", "/draft"]) {
  test(`scrolling and hovering ${route} sends no request for its entity links`, async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 700 });
    await openWorkbench(page, route);
    const links = page.locator('main a[href^="/players/"], main a[href^="/teams/"]');
    await expect(links.first()).toBeVisible();
    const count = await links.count();
    expect(count).toBeGreaterThan(0);
    const requests: Request[] = [];
    page.on("request", request => requests.push(request));
    for (let i = 0; i < 6; i++) {
      await page.mouse.wheel(0, 500);
      await page.waitForTimeout(250);
    }
    for (const index of [0, Math.floor(count / 2), count - 1]) {
      const link = links.nth(index);
      if (await link.isVisible()) await link.hover();
    }
    await page.waitForTimeout(1000);
    const prefetched = entityRequests(requests);
    console.log(`SITE_LINKS_PREFETCH ${JSON.stringify({ route, links: count, requests: requests.length, entity: prefetched.length })}`);
    expect(prefetched).toEqual([]);
  });
}
