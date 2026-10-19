import { test, expect } from "@playwright/test";
import result from "./fixtures/research-negative-result.json";
import { openWorkbench } from "./workbench-navigation";
const run = result.run;
const BOS = "1610612738";
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
  await researchRoutes(page); await page.goto("/research/shooting");
  const region = page.getByRole("region",{name:"Registered research result"});
  await expect(region).toContainText("Completed negative result");
  await expect(region).toContainText("0.08127%"); await expect(region).toContainText("No calibration fit");
  await expect(region).toContainText("Final error report opened: no");
  // FO12: one display date format (D11); the sealed ISO horizons sit in Data details.
  await expect(region).toContainText("Apr 14, 2024"); await expect(region).toContainText("Jan 15, 2025");
  await page.getByText("Selection Reliability Bins and Samples",{exact:true}).click();
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
  // PC11 populated Six-Factor and Adjusted Shooting from served data; only RAPM keeps its registered experiment.
  for(const [path,requirement] of [["/research/rapm","stint and possession"]]) {
    // Streaming can briefly keep a hidden copy of the view, so assert on the visible one.
    await page.goto(path); await expect(page.locator(".research-view").filter({ hasText: requirement }).filter({ visible: true }).first()).toBeVisible();
    await expect(page.getByRole("region",{name:"Registered research result"})).toHaveCount(0);
  }
});
test("integrity rejection hides numerical outputs and retry recovers",async ({page}) => {
  await researchRoutes(page); await page.route(`**/api/workbench/research/runs/${run.run_id}`,route => route.fulfill({status:503,json:{detail:"artifact failed integrity verification"}}));
  await page.goto("/research/shooting");await expect(page.getByRole("alert").filter({hasText:"Report unavailable"})).toContainText("integrity verification");
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
  await page.route(`**/api/workbench/teams/${BOS}?*`,route => { expect(new URL(route.request().url()).searchParams.get("phase")).toBe("regular_season"); return route.fulfill({json:{team:{id:"fixture",name:"Fixture Team",tricode:"FIX"},context:{release_id:"fixture-release",season:"2025-26",phase:"regular",before_date:"2026-07-01"},record:{games_played:1},player_cohort:[{player_id:"1",player_name:"Fixture Player",games_played:1,total_minutes:30,points:0,points_per_game:0}],warnings:["Fixture scope only"]}}); });
  // FO05: no form or Load button; the team loads from the URL as soon as it is chosen.
  // The depth chart is a team profile section since alignment row 12.
  await openWorkbench(page, `/teams/${BOS}?season=2025-26&phase=regular_season`);
  const chart = page.locator("#depth-chart").getByRole("region",{name:"Roster allocations",exact:true});
  await expect(page.locator(".roster-team")).toContainText("30 observed minutes");
  await expect(chart.getByRole("region",{name:"Unassigned lane"})).toContainText("30 min · 100.0%");
  await page.getByRole("button",{name:"All players (1)"}).click();
  await page.getByLabel("Position for Fixture Player").selectOption("PG");
  await expect(chart.getByRole("region",{name:"PG lane"})).toContainText("Fixture Player");
  await page.getByRole("radio",{name:"Projected"}).click();
  await expect(page.getByRole("meter",{name:"Projected team minutes per game"})).toHaveAttribute("aria-valuenow","0");
  await page.getByLabel("Projected minutes for Fixture Player").fill("-1");await expect(page.getByRole("button",{name:"Export JSON"})).toBeDisabled();
  await page.getByLabel("Projected minutes for Fixture Player").fill("24");await expect(page.getByRole("meter",{name:"Projected team minutes per game"})).toHaveAttribute("aria-valuenow","24");
  await expect(page.getByRole("button",{name:"Export JSON"})).toBeEnabled();
});
