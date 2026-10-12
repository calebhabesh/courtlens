import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { openWorkbench } from "./workbench-navigation";
import { firstLoadFixtures, offSeasonFixtures } from "./first-load-fixtures";

for (const width of [1440,390]) test(`Compare starts on silhouette cards and a one-click observed suggestion at ${width}px`,async({page})=>{
  const errors:string[]=[];page.on("pageerror",error=>errors.push(error.message));
  await page.setViewportSize({width,height:900});await openWorkbench(page,"/compare");
  await expect(page.locator(".pc04-identity-card[data-placeholder]")).toHaveCount(2);
  await expect(page.getByRole("button",{name:"Top 2 by minutes",exact:true})).toBeEnabled();
  await page.getByRole("button",{name:"Top 2 by minutes",exact:true}).click();
  await expect(page.getByRole("table",{name:"Descriptive comparison"})).toBeVisible();
  await expect(page.getByRole("radio",{name:"Per 75",exact:true})).toBeDisabled();
  await expect(page.locator(".pc04-games-badge")).toHaveCount(2);
  if (width === 390) {
    const sizes = await page.locator(".pc04-compare button:visible").evaluateAll(buttons => buttons.map(button => button.getBoundingClientRect().height));
    expect(Math.min(...sizes)).toBeGreaterThanOrEqual(40);
  }
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);expect(errors).toEqual([]);
});

test("Custom picks and exact counting units survive reload and Back/Forward; SVG carries current values",async({page})=>{
  await openWorkbench(page,"/compare?playerA=23&playerB=24&season=2025-26&phase=regular_season&releaseId=fixture-release&beforeDate=2026-04-13");
  await page.getByRole("radio",{name:"Custom",exact:true}).click();
  await page.getByLabel("Fouls Total",{exact:true}).check();await expect(page).toHaveURL(/customMetrics=.*pf/);
  await page.reload();await expect(page.getByLabel("Fouls Total",{exact:true})).toBeChecked();
  await page.getByRole("radio",{name:"Totals",exact:true}).click();
  await expect(page.getByRole("table",{name:"Descriptive comparison"})).toContainText("1960.0");
  await page.goBack();await expect(page.getByRole("radio",{name:"Per Game",exact:true})).toHaveAttribute("aria-checked","true");
  await expect(page.getByRole("table",{name:"Descriptive comparison"})).toContainText("28.0");await page.goForward();
  await expect(page.getByRole("radio",{name:"Totals",exact:true})).toHaveAttribute("aria-checked","true");
  await page.getByRole("button",{name:"More",exact:true}).click();const download=page.waitForEvent("download");await page.getByRole("menuitem",{name:"Export SVG",exact:true}).click();
  const exported = await download;
  expect(exported.suggestedFilename()).toMatch(/\.svg$/);
  const svg = readFileSync((await exported.path())!, "utf8");
  expect(svg).toContain("1960.0");expect(svg).toContain("Fouls Total");expect(svg).not.toContain("var(--");
  const image = page.waitForEvent("download");await page.getByRole("button",{name:"Share image",exact:true}).click();
  const png = readFileSync((await (await image).path())!);
  expect(png.subarray(0,8).toString("hex")).toBe("89504e470d0a1a0a");
});

// PC11: /matchups and /wowy resolve their example server-side by a labeled rule (e2e/pc11-gated-pages.spec.ts).
for(const [path,parameter] of [["/stat-line-shift","player_id"],["/similar-players/shot-profile","player_id"],["/research/shooting/aftermath","player_id"],["/similar-players","playerId"],["/last-games","playerId"]]) test(`parameter-free ${path} resolves a named observed example`,async({page})=>{
  await firstLoadFixtures(page);await openWorkbench(page,path);
  await expect(page.getByRole("region",{name:"Observed example context"})).toContainText("Example: Fixture Star");
  await expect.poll(()=>new URL(page.url()).searchParams.get(parameter)).toBeTruthy();
  await expect(page.getByRole("region",{name:"Observed example context"})).toContainText("Source: Published box scores");
  expect(new URL(page.url()).searchParams.get("beforeDate") || new URL(page.url()).searchParams.get("before_date")).toBeTruthy();
});

test("explicit subject is retained and the operation menu issues no conversation request",async({page})=>{
  await firstLoadFixtures(page);await openWorkbench(page,"/stat-line-shift?player_id=24&together=23&season=2025-26&beforeDate=2026-04-13");
  await expect(page.locator(".floor-result")).toBeVisible();expect(new URL(page.url()).searchParams.get("player_id")).toBe("24");await expect(page.getByText(/^Example:/)).toHaveCount(0);
  const requests:string[]=[];page.on("request",request=>{if(request.method()==="POST")requests.push(request.url());});
  await openWorkbench(page,"/research/operation");await expect(page.getByRole("region",{name:"Available research operations"}).getByRole("link")).toHaveCount(8);expect(requests).toEqual([]);
});

test("Live empty landing resolves the latest final day, points leaders and next scheduled date",async({page})=>{
  await offSeasonFixtures(page);await openWorkbench(page,"/live");
  await expect(page.getByRole("region",{name:"Game slate"})).toContainText("110");
  await expect(page.getByRole("region",{name:"Top performers"})).toContainText("28 PTS");
  await expect(page.getByRole("region",{name:"Top performers"})).not.toContainText("Fixture Guard");
  await expect(page.getByRole("navigation",{name:"Next games"})).toContainText("Oct 20, 2026");
  expect(new URL(page.url()).searchParams.get("date")).toBe("2026-04-12");
  await page.goto("/live/2026-10-11");await expect(page.getByRole("navigation",{name:"Next games"})).toHaveCount(0);
});

test("typing a focal selection cancels a pending default without losing the lookup",async({page})=>{
  await firstLoadFixtures(page);
  await page.route("**/api/workbench/players?*",async route=>{
    const response=await route.fetch();await new Promise(resolve=>setTimeout(resolve,800));
    await route.fulfill({response});
  });
  await openWorkbench(page,"/stat-line-shift");
  await expect(page.getByRole("status",{name:"Loading observed example"})).toBeVisible();
  const input=page.getByRole("combobox",{name:"Focal player",exact:true});
  await input.fill("Fixture Player 1");
  await page.getByRole("option").filter({hasText:"Fixture Player 1"}).click();
  await page.waitForTimeout(1000);
  expect(new URL(page.url()).searchParams.get("player_id")).toBe("1");
  await expect(page.getByRole("region",{name:"Observed example context"})).toHaveCount(0);
});
