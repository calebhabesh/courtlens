import { test, expect } from "@playwright/test";
import fixture from "./fixtures/rd17-expected-shot.json";
import { openWorkbench } from "./workbench-navigation";
// RD17: real answers of the research API (the sealed earlier expected-shot run and the registry).
const result = fixture.result;
const run = result.run;
const BOS = "1610612738";
async function researchRoutes(page: import("@playwright/test").Page) {
  await page.route("**/api/workbench/research/experiments",route => route.fulfill({json:fixture.experiments}));
  await page.route("**/api/workbench/research/runs?*",route => route.fulfill({json:fixture.runs}));
  await page.route(`**/api/workbench/research/runs/${run.run_id}`,route => route.fulfill({json:result}));
}
test("the sealed negative result is Shot Quality's earlier attempt: one line, numbers behind a toggle, identifiers in About, GET only", async ({page}) => {
  const methods: string[] = [];
  page.on("request",request => { if(request.url().includes("/research/")) methods.push(request.method()); });
  await researchRoutes(page);
  // RD17: the old Expected Shots URL opens Shot Quality's Model tab with the earlier attempt open.
  await page.goto("/research/shooting");
  await expect(page).toHaveURL(url => url.pathname === "/research/shot-quality" && url.searchParams.get("tab") === "model" && url.searchParams.get("earlier") === "open");
  const line = page.locator("[data-field=earlier-line]");
  await expect(line).toContainText("0.08%"); await expect(line).toContainText("1%"); await expect(line).toContainText("never calibrated and never tested");
  await expect(line).toContainText("Apr 14, 2024"); await expect(line).toHaveAttribute("data-passed", "false");
  const grid = page.getByRole("table",{name:"The earlier attempt's selection scores"});
  await expect(grid).toBeVisible();
  await expect(grid.locator('tr[data-metric="brier"] [data-field=baseline]')).toHaveText("0.233961");
  await expect(grid.locator('tr[data-metric="brier"] [data-field=candidate]')).toHaveText("0.233771");
  await expect(grid.locator('tr[data-metric="rows"] [data-field=candidate]')).toHaveText("106,080");
  await expect(page.locator("[data-field=earlier-result]")).toContainText("Failed");
  await expect(page.locator("[data-field=earlier-sample]")).toContainText("Jan 15, 2025");
  // No hashes or project codes in the visible text; they are in the collapsed Caveats & Methodology.
  const visible = await page.locator("main").evaluate(main => (main as HTMLElement).innerText);
  expect(visible).not.toMatch(/court(?:load|lens)-[a-z]|\b[0-9a-f]{16,}\b/);
  await page.locator("#model-method summary").first().click();
  await expect(page.locator(".sq-earlier-ids")).toContainText(result.manifest_sha256);
  await expect(page.locator("[data-field=earlier-other-runs]")).toContainText("failed before any fit");
  const pending=page.waitForEvent("download");await page.getByRole("button",{name:"Download the sealed report"}).click();
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
test("integrity rejection hides the earlier attempt's numbers and retry recovers",async ({page}) => {
  await researchRoutes(page); await page.route(`**/api/workbench/research/runs/${run.run_id}`,route => route.fulfill({status:503,json:{detail:"artifact failed integrity verification"}}));
  await openWorkbench(page, "/research/shot-quality?tab=model");
  const section = page.locator("#earlier-attempt");
  await expect(section.getByRole("alert")).toContainText("The earlier attempt is unavailable");
  await expect(page.locator("[data-field=earlier-line]")).toHaveCount(0);
  await page.unroute(`**/api/workbench/research/runs/${run.run_id}`);await page.route(`**/api/workbench/research/runs/${run.run_id}`,route => route.fulfill({json:result}));
  await section.getByRole("button",{name:"Retry"}).click();await expect(page.locator("[data-field=earlier-line]")).toContainText("0.08%");
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
