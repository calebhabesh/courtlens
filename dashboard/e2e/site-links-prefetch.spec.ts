import { expect, test, type Locator, type Page, type Request } from "@playwright/test";
import { openWorkbench } from "./workbench-navigation";

// Site links (docs/site-links-plan.md) as revised by speed plan SP03 (D4): links prefetch on intent
// only. Loading and scrolling a table of names sends no prefetch at all; a pointer resting on one
// link fetches that page once; a pointer sweeping across rows fetches nothing; and the click after a
// prefetch is served from it. Prefetching only happens in production builds, which is what this
// suite runs against.
const ENTITY_PATH = /^\/(players|teams|live\/games|live\/open|playoffs)\//;
const LINKS = 'main a[href^="/players/"], main a[href^="/teams/"]';

const isRsc = (request: Request) => request.headers().rsc === "1" || new URL(request.url()).searchParams.has("_rsc");
const isPrefetch = (request: Request) => isRsc(request) && request.headers()["next-router-prefetch"] === "1";
// A full prefetch is one page render (an RSC request without the prefetch header, the same request a
// click would make) plus one or two route-tree lookups (`Next-Router-Segment-Prefetch: /_tree`, about
// 300 bytes, no API read). The render is the request that costs the server.
const isTree = (request: Request) => request.headers()["next-router-segment-prefetch"] === "/_tree";
const isRender = (request: Request) => isRsc(request) && !isTree(request);
const entity = (requests: Request[]) => requests.filter(request => ENTITY_PATH.test(new URL(request.url()).pathname));

function record(page: Page) {
  const requests: Request[] = [];
  page.on("request", request => requests.push(request));
  return requests;
}

async function visibleLinks(page: Page, minimum: number): Promise<Locator[]> {
  const links = page.locator(LINKS);
  await expect(links.first()).toBeVisible();
  const visible: Locator[] = [];
  for (let i = 0; i < await links.count() && visible.length < minimum; i++) {
    if (await links.nth(i).isVisible()) visible.push(links.nth(i));
  }
  return visible;
}

function log(data: Record<string, unknown>) {
  console.log(`SITE_LINKS_PREFETCH ${JSON.stringify(data)}`);
}

// The fixture API has no standings rows; against real data (SITE_LINKS_PREFETCH_REAL=1) Standings is measured too.
for (const route of process.env.SITE_LINKS_PREFETCH_REAL ? ["/stats", "/standings", "/draft"] : ["/stats", "/draft"]) {
  test(`loading and scrolling ${route} sends no prefetch`, async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 700 });
    const requests = record(page);
    await openWorkbench(page, route);
    const count = await page.locator(LINKS).count();
    expect(count).toBeGreaterThan(0);
    // Keep the pointer off every link while the page settles and scrolls.
    await page.mouse.move(1, 699);
    for (let i = 0; i < 6; i++) {
      await page.mouse.wheel(0, 500);
      await page.waitForTimeout(250);
    }
    await page.waitForTimeout(1000);
    // Links outside SP03's scope (the footer, some page links) still use Next's default viewport
    // prefetch; they are logged, not asserted.
    log({ route, phase: "load+scroll", links: count, requests: requests.length, entity: entity(requests).length, otherPrefetch: requests.filter(isPrefetch).map(request => new URL(request.url()).pathname) });
    expect(entity(requests).map(request => request.url())).toEqual([]);
  });
}

test("a resting hover prefetches once, a sweep over 20 rows prefetches nothing, and the click reuses the prefetch", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1600 });
  // Draft Classes: a long table of player links on fixture data and real data alike.
  await openWorkbench(page, "/draft");
  const links = await visibleLinks(page, 20);
  expect(links.length).toBeGreaterThanOrEqual(20);
  const heading = await page.locator("main h1").boundingBox();
  if (!heading) throw new Error("no page heading to rest the pointer on");
  const rest = { x: heading.x + heading.width / 2, y: heading.y + heading.height / 2 };
  await page.mouse.move(rest.x, rest.y);

  // Sweep: one continuous move through the centre of 20 links, ending off every link.
  const sweep = record(page);
  const boxes = await Promise.all(links.slice(0, 20).map(link => link.boundingBox()));
  for (const box of boxes) {
    if (!box) throw new Error("link without a box");
    await page.mouse.move(box.x + Math.min(box.width / 2, 24), box.y + box.height / 2);
  }
  await page.mouse.move(rest.x, rest.y);
  await page.waitForTimeout(1000);
  log({ phase: "sweep", rows: boxes.length, entity: entity(sweep).length });
  expect(entity(sweep).map(request => request.url())).toEqual([]);

  // Resting hover: one full prefetch of that page, and only one however long the pointer stays.
  const target = links[5];
  const href = await target.getAttribute("href");
  const path = new URL(href ?? "", page.url()).pathname;
  const hover = record(page);
  const finished = page.waitForEvent("requestfinished", { predicate: request => isRender(request) && new URL(request.url()).pathname === path, timeout: 15_000 });
  await target.hover();
  await finished;
  await page.mouse.move(rest.x, rest.y);
  await target.hover();
  await page.waitForTimeout(1000);
  const hovered = entity(hover);
  const renders = hovered.filter(isRender);
  log({ phase: "resting-hover", path, renders: renders.length, treeLookups: hovered.filter(isTree).length, other: hovered.length - renders.length - hovered.filter(isTree).length });
  expect(renders.map(request => new URL(request.url()).pathname)).toEqual([path]);
  expect(hovered.filter(request => !isRender(request) && !isTree(request))).toEqual([]);
  expect(hovered.filter(isTree).length).toBeLessThanOrEqual(2);

  // The click that follows: no further page request.
  const click = record(page);
  await target.click();
  await page.waitForURL(url => url.pathname === path);
  await expect(page.locator("main h1")).not.toBeEmpty();
  await page.waitForLoadState("networkidle").catch(() => undefined);
  const after = click.filter(request => isRsc(request) || request.resourceType() === "document");
  log({ phase: "click-after-prefetch", path, rsc: click.filter(isRsc).length, documents: click.filter(request => request.resourceType() === "document").length });
  expect(after.map(request => request.url())).toEqual([]);
});
