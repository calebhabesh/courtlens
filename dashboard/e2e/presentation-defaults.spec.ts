import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { openWorkbench } from "./workbench-navigation";
import { firstLoadFixtures, offSeasonFixtures } from "./first-load-fixtures";

// Alignment row 3 (owner, 2026-10-15): Compare opens on a real pair written to the URL.
for (const width of [1440,390]) test(`Compare opens on a resolved pair with percentiles and games badges at ${width}px`,async({page})=>{
  const errors:string[]=[];page.on("pageerror",error=>errors.push(error.message));
  await page.setViewportSize({width,height:900});await openWorkbench(page,"/compare");
  await expect(page).toHaveURL(/playerA=\w+&playerB=\w+/);
  await expect(page.getByRole("table",{name:"Descriptive comparison"})).toBeVisible();
  await expect(page.locator(".pvp-slot")).toHaveCount(2);await expect(page.locator(".pvp-badge")).toHaveCount(2);
  await page.getByRole("button",{name:/^Counting mode,/}).click();
  await expect(page.getByRole("menuitem",{name:/^Per 75/})).toBeDisabled();await page.keyboard.press("Escape");
  // Measure once the menu has finished closing: its items shrink as they animate out.
  await expect(page.getByRole("menuitem")).toHaveCount(0);
  // Owner trial (row 3, 22): league percentiles are hidden to keep the slim card on one screen.
  await expect(page.locator(".pvp-rows .stat-pct-sublabel")).toHaveCount(0);
  if (width === 390) {
    // Rounded: layout can land a 40px target at 39.99997px.
    const sizes = await page.locator(".pvp-card button:visible").evaluateAll(buttons => buttons.map(button => Math.round(button.getBoundingClientRect().height)));
    expect(Math.min(...sizes)).toBeGreaterThanOrEqual(40);
  }
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);expect(errors).toEqual([]);
});

test("Custom picks and exact counting units survive reload and Back/Forward; SVG carries current values",async({page})=>{
  await openWorkbench(page,"/compare?playerA=23&playerB=24&season=2025-26&phase=regular_season&releaseId=fixture-release&beforeDate=2026-04-13");
  await page.getByRole("button",{name:"Edit Metrics",exact:true}).click();
  const drawer=page.getByRole("dialog");await expect(drawer.getByRole("heading",{name:"Edit Metrics"})).toBeVisible();
  // The checkbox is controlled by the URL, which React 19.3 applies after the click event returns.
  // Rows read abbreviation + term; the checkbox keeps the catalog name as its accessible name.
  await drawer.locator("label").filter({has:page.getByRole("checkbox",{name:"Fouls Total",exact:true})}).click();
  await drawer.getByRole("searchbox",{name:"Search metrics"}).fill("foul");await expect(drawer.getByRole("checkbox")).toHaveCount(1);
  await drawer.getByRole("button",{name:"Clear search"}).click();await expect(drawer.getByRole("checkbox",{name:"Fouls Total",exact:true})).toBeChecked();
  await expect(page).toHaveURL(/preset=custom/);await expect(page).toHaveURL(/customMetrics=.*pf/);
  await page.keyboard.press("Escape");
  await page.reload();await expect(page.getByRole("radio",{name:"Custom",exact:true})).toHaveAttribute("aria-checked","true");
  await page.getByRole("button",{name:"Edit Metrics",exact:true}).click();await expect(page.getByRole("dialog").getByRole("checkbox",{name:"Fouls Total",exact:true})).toBeChecked();
  await page.keyboard.press("Escape");
  const mode=page.getByRole("button",{name:/^Counting mode,/});
  await mode.click();await page.getByRole("menuitem",{name:"Totals",exact:true}).click();
  await expect(page.getByRole("table",{name:"Descriptive comparison"})).toContainText("1,960");
  await page.goBack();await expect(mode).toHaveText("Per Game");
  await expect(page.getByRole("table",{name:"Descriptive comparison"})).toContainText("28.0");await page.goForward();
  await expect(mode).toHaveText("Totals");
  await page.getByRole("button",{name:"More",exact:true}).click();const download=page.waitForEvent("download");await page.getByRole("menuitem",{name:"Export SVG",exact:true}).click();
  const exported = await download;
  expect(exported.suggestedFilename()).toMatch(/\.svg$/);
  const svg = readFileSync((await exported.path())!, "utf8");
  expect(svg).toContain("1,960");expect(svg).toContain("Fouls");expect(svg).not.toContain("var(--");
  const image = page.waitForEvent("download");await page.getByRole("button",{name:"Share Image",exact:true}).click();
  const png = readFileSync((await (await image).path())!);
  expect(png.subarray(0,8).toString("hex")).toBe("89504e470d0a1a0a");
});

// PC11: /matchups and /wowy resolve their example server-side by a labeled rule (e2e/pc11-gated-pages.spec.ts).
// Stat Line Shift (row 13) opens like Databallr, on a team roster and a pick prompt, so it has no example.
// Last X Games (alignment row 6, follow-up 9) opens on the Stats table's top player and says so.
test("parameter-free /last-games resolves the Stats table leader and says so",async({page})=>{
  await openWorkbench(page,"/last-games");
  await expect(page.locator(".feed-example")).toContainText("Example: Fixture Star");
  await expect(page.locator(".feed-example")).toContainText("Top of the Stats table (DPM) in 2025-26");
  await expect.poll(()=>new URL(page.url()).searchParams.get("playerId")).toBe("23");
});
for(const [path,parameter] of [["/similar-players/shot-profile","player_id"],["/research/shooting/aftermath","player_id"],["/similar-players","playerId"]]) test(`parameter-free ${path} resolves a named observed example`,async({page})=>{
  await firstLoadFixtures(page);await openWorkbench(page,path);
  await expect(page.getByRole("region",{name:"Observed example context"})).toContainText("Example: Fixture Star");
  await expect.poll(()=>new URL(page.url()).searchParams.get(parameter)).toBeTruthy();
  await expect(page.getByRole("region",{name:"Observed example context"})).toContainText("Source: Published box scores");
  expect(new URL(page.url()).searchParams.get("beforeDate") || new URL(page.url()).searchParams.get("before_date")).toBeTruthy();
});

test("explicit subject is retained and the operation menu issues no conversation request",async({page})=>{
  await firstLoadFixtures(page);await openWorkbench(page,"/similar-players/shot-profile?player_id=24&season=2025-26&beforeDate=2026-04-13");
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
  await openWorkbench(page,"/similar-players/shot-profile");
  await expect(page.getByRole("status",{name:"Loading observed example"})).toBeVisible();
  const input=page.getByRole("combobox",{name:"Player",exact:true});
  await input.fill("Fixture Player 1");
  await page.getByRole("option").filter({hasText:"Fixture Player 1"}).click();
  await page.waitForTimeout(1000);
  expect(new URL(page.url()).searchParams.get("player_id")).toBe("1");
  await expect(page.getByRole("region",{name:"Observed example context"})).toHaveCount(0);
});
