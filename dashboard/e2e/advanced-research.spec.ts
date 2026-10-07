import { test, expect } from "@playwright/test";
import result from "./fixtures/research-negative-result.json";
import { openWorkbench } from "./workbench-navigation";
const run = result.run;
const registry = [
  {experiment:run.experiment, status:run.status, run_id:run.run_id, protocol_sha256:run.protocol_sha256, gate:null},
  {experiment:"courtload-rapm-v1",status:"source_blocked",run_id:null,protocol_sha256:"rapm-fixture",gate:"requires complete reconciled stint and possession seasons"},
  {experiment:"courtload-six-factor-v1",status:"source_blocked",run_id:null,protocol_sha256:"six-fixture",gate:"requires shooting, turnover and rebound attribution"},
  {experiment:"courtload-adjusted-shooting-v1",status:"source_blocked",run_id:null,protocol_sha256:"adjusted-fixture",gate:"requires admitted playtypes and foul trips"}
];
async function researchRoutes(page: import("@playwright/test").Page) {
  await page.route("**/api/workbench/research/experiments",route => route.fulfill({json:registry}));
  await page.route("**/api/workbench/research/runs?*",route => route.fulfill({json:[run]}));
  await page.route(`**/api/workbench/research/runs/${run.run_id}`,route => route.fulfill({json:result}));
}
test("completed negative report shows amended identity, honest horizons, metrics and export", async ({page}) => {
  const methods: string[] = [];
  page.on("request",request => { if(request.url().includes("/research/")) methods.push(request.method()); });
  await researchRoutes(page); await page.goto("/research/expected-shots");
  const region = page.getByRole("region",{name:"Registered research result"});
  await expect(region).toContainText("Completed negative result");
  await expect(region).toContainText("0.08127%"); await expect(region).toContainText("No calibration fit");
  await expect(region).toContainText("Final error report opened: no");
  await expect(region).toContainText("2024-04-14"); await expect(region).toContainText("2025-01-15");
  await page.getByText("Selection reliability bins and samples",{exact:true}).click();
  await expect(page.getByRole("region",{name:"Reliability bins"})).toContainText("—");
  const pending=page.waitForEvent("download");await page.getByRole("button",{name:"Export verified report JSON"}).click();
  const download=await pending; const {readFileSync}=await import("node:fs");
  expect(JSON.parse(readFileSync((await download.path())!,"utf8")).manifest_sha256).toBe(result.manifest_sha256);
  expect(methods.every(method => method === "GET")).toBe(true);
  await page.setViewportSize({width:375,height:812});
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
test("each unavailable model names its independent requirement",async ({page}) => {
  await researchRoutes(page);
  for(const [path,requirement] of [["/research/rapm","stint and possession"],["/six-factor-rapm","turnover and rebound"],["/research/adjusted-shooting","playtypes and foul trips"]]) {
    await page.goto(path); await expect(page.locator(".advanced-research")).toContainText(requirement);
    await expect(page.getByRole("region",{name:"Registered research result"})).toHaveCount(0);
  }
});
test("integrity rejection hides numerical outputs and retry recovers",async ({page}) => {
  await researchRoutes(page); await page.route(`**/api/workbench/research/runs/${run.run_id}`,route => route.fulfill({status:503,json:{detail:"artifact failed integrity verification"}}));
  await page.goto("/research/expected-shots");await expect(page.getByRole("alert").filter({hasText:"Report unavailable"})).toContainText("integrity verification");
  await expect(page.getByRole("button",{name:"Export verified report JSON"})).toHaveCount(0);
  await page.unroute(`**/api/workbench/research/runs/${run.run_id}`);await page.route(`**/api/workbench/research/runs/${run.run_id}`,route => route.fulfill({json:result}));
  await page.getByRole("button",{name:"Retry reads"}).click();await expect(page.getByRole("region",{name:"Registered research result"})).toContainText("Completed negative result");
});
test("calculator rejects invalid scenarios and shows checked finite differences on mobile",async ({page}) => {
  await page.setViewportSize({width:390,height:844}); await openWorkbench(page, "/calculator");
  await expect(page.getByRole("region",{name:"Scenario output"})).toContainText("ORTG");
  await page.getByLabel("2P category probability",{exact:true}).fill("0.9");
  await expect(page.getByRole("alert").filter({hasText:"sum to 1"})).toBeVisible();
  await expect(page.getByRole("button",{name:"Export scenario JSON"})).toHaveCount(0);
  await page.getByRole("button",{name:"Reset hypothetical defaults"}).click();
  await expect(page.getByRole("region",{name:"Scenario output"})).toContainText("Finite-difference sensitivities");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({path:test.info().outputPath("b27-calculator-mobile.png"),fullPage:true});
});
test("roster keeps observed and projected inputs separate and exports context",async ({page}) => {
  await page.route("**/api/workbench/teams/fixture?*",route => { expect(new URL(route.request().url()).searchParams.get("phase")).toBe("regular_season"); return route.fulfill({json:{team:{id:"fixture",name:"Fixture Team",tricode:"FIX"},context:{release_id:"fixture-release",season:"2025-26",phase:"regular",before_date:"2026-07-01"},record:{games_played:1},player_cohort:[{player_id:"1",player_name:"Fixture Player",games_played:1,total_minutes:30,points:0,points_per_game:0}],warnings:["Fixture scope only"]}}); });
  await page.route("**/api/workbench/lookup?*", route => route.fulfill({json:{items:[{kind:"team",canonical_id:"fixture",display_name:"Fixture Team",destination:"/teams/fixture",matching_alias:"Fixture",season_available:true,season_scope:"2025-26",associations:[]}],total_matches:1,catalog_version:"fixture"}}));
  await page.goto("/roster-shapes?season=2025-26&phase=regular_season");await page.getByRole("combobox",{name:"Team",exact:true}).fill("Fixture");await page.getByRole("option",{name:/Fixture Team/}).click(); await page.getByRole("button",{name:"Load participation"}).click();
  await expect(page.getByRole("region",{name:"Roster allocations",exact:true})).toContainText("total 30.0");
  await page.getByLabel("Position for Fixture Player").selectOption("PG");
  await page.getByLabel("Allocation basis").selectOption("projected");
  await expect(page.getByRole("region",{name:"Roster allocations",exact:true})).toContainText("total 0.0");
  await page.getByLabel("Projected minutes for Fixture Player").fill("-1");await expect(page.getByRole("button",{name:"Export allocation inputs JSON"})).toBeDisabled();
  await page.getByLabel("Projected minutes for Fixture Player").fill("24");await expect(page.getByRole("region",{name:"Roster allocations",exact:true})).toContainText("total 24.0");
});
test("measurements preserve unknown picks, null lengths and units in bounded sample",async ({page}) => {
  await page.route("**/api/workbench/measurements?*",route => route.fulfill({json:{items:[{player_id:"fixture",display_name:"Fixture Player",measurement_type:"combine",source_name:"fixture-combine",draft_year:2021,pick_overall:null,drafting_team_id:null,height_no_shoes_inches:80,height_shoes_inches:null,wingspan_inches:86,standing_reach_inches:null,weight_lbs:200,body_fat_pct:null,wingspan_to_height_ratio:null}],count:1,disclaimer:"Fixture only"}}));
  await page.goto("/wingspan");await expect(page.getByRole("region",{name:"Measurement records"})).toContainText("Unknown pick");
  await page.getByLabel("Length units").selectOption("cm");await expect(page.getByRole("region",{name:"Measurement records"})).toContainText("218.44 cm");
  await page.getByLabel("Compare Fixture Player combine").check();await expect(page.getByRole("region",{name:"Measurement comparison"})).toContainText("fixture-combine");
  await page.setViewportSize({width:390,height:844});expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
