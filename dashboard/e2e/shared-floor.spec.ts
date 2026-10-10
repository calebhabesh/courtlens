import { expect, test } from "@playwright/test";
import { openWorkbench } from "./workbench-navigation";
import { readFileSync } from "node:fs";
const empty = JSON.parse(readFileSync("../docs/evidence/b21-api-smoke.json", "utf8")).response;

async function pick(page: import("@playwright/test").Page, label: string, ids: string, replace = false) {
  const group=page.getByRole("group",{name:label,exact:true});
  // A resolved query changes lookup scope; wait for its selected identities before replacing.
  await expect(group.locator("..").getByRole("status").filter({hasText:/^Resolving/})).toHaveCount(0);
  if(replace) {
    const chips=group.getByRole("button",{name:/^Remove/});
    let remaining=await chips.count();
    while(remaining) {
      await chips.first().click();
      // Scope retention can briefly hide every chip while the remaining IDs resolve.
      await expect(chips).toHaveCount(--remaining);
    }
  }
  for(const id of ids.split(",")) {
    const name=id === "other" ? "Fixture Guard" : `Fixture Player ${id}`;
    await page.getByRole("combobox",{name:label,exact:true}).fill(name);
    await page.getByRole("option").filter({hasText:name}).click();
  }
}

test.beforeEach(async ({ page }) => {
  await page.route("**/api/workbench/operations/*", async route => {
    const req = route.request().postDataJSON();
    const response = structuredClone(empty);
    response.operation = route.request().url().split("/").pop();
    response.request = { ...empty.request, ...req };
    const ids = [...req.together, ...req.apart, ...req.exact_unit];
    response.partitions = Array.from({ length: 2 ** ids.length }, (_, mask) => ({
      ...structuredClone(empty.cells[0]), key: `partition-${mask}`,
      present: ids.filter((_: string, index: number) => mask & (1 << index)),
      absent: ids.filter((_: string, index: number) => !(mask & (1 << index)))
    }));
    response.evidence_hash = `fixture-${response.operation}-${req.together?.join("-")}-${req.exact_unit?.join("-")}`;
    response.context = { ...response.context, season: req.season || "2023-24", release_id: req.release_id || "fixture-release", before_date: req.before_date || "2024-04-15" };
    await route.fulfill({ json: response });
  });
});

test("empty source preserves unknown values, exact downloads and resolved links", async ({ page }) => {
  await openWorkbench(page, "/wowy?team_id=TOR&together=1627751");
  await expect(page.getByText("No admitted exposure in this scope.", { exact: true })).toBeVisible();
  await expect(page.getByText("0 / 82 finalized games reconstructed", { exact: false })).toBeVisible();
  await expect(page.locator("tbody").first()).toContainText("—");
  await expect(page).toHaveURL(/release_id=fixture-release/);
  await page.screenshot({ path: test.info().outputPath("b22-empty-desktop-fixture.png"), fullPage: true });
  await page.getByRole("button", { name: "Data details", exact: true }).click();
  const pending = page.waitForEvent("download");
  await page.getByRole("button", { name: "Save evidence JSON" }).click();
  const download = await pending;
  const file = await download.path();
  const bundle = JSON.parse(readFileSync(file!, "utf8"));
  expect(bundle.results[0].coverage_status).toBe("source_blocked");
  expect(bundle.results[0].cells[0].raw_metrics.net_rating).toBeNull();
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Pin for comparison" }).click();
  await pick(page,"Together players","other",true);
  await expect(page.getByText("Pinned eligible differences", { exact: false })).toBeVisible();
});

test("two and five player units use the same operation with all partitions", async ({ page }) => {
  const requests: unknown[] = [];
  page.on("request", req => { if (req.url().endsWith("/operations/wowy")) requests.push(req.postDataJSON()); });
  await openWorkbench(page, "/wowy");
  await page.getByRole("combobox", { name: "View", exact: true }).selectOption("unit");
  for (const ids of ["1,2", "1,2,3,4,5"]) {
    await pick(page,"Exact unit",ids,true);
    await expect(page.getByText("No admitted exposure in this scope.", { exact: true })).toBeVisible();
    await expect(page.getByText(`All disjoint presence/absence partitions (${2 ** ids.split(",").length})`, { exact: true })).toBeVisible();
  }
  expect(requests).toEqual(expect.arrayContaining([expect.objectContaining({ exact_unit: ["1", "2"] }), expect.objectContaining({ exact_unit: ["1", "2", "3", "4", "5"] })]));
});

test("stat shifts reject focal contradictions and request per-possession production", async ({ page }) => {
  await openWorkbench(page, "/stat-line-shift");
  await pick(page,"Focal player","1");
  await pick(page,"Together players","1");
  await expect(page.locator(".shared-floor").getByRole("alert")).toContainText("separate");
  await pick(page,"Together players","2",true);
  await expect(page.getByRole("heading", { name: "Observed Stat Shift" })).toBeVisible();
  await expect(page.locator(".floor-result")).toContainText("finalized games reconstructed");
  await expect(page.getByRole("button", { name: "Run shared-floor analysis" })).toHaveCount(0);
});

test("bounded leaders pin a resolved release across candidates", async ({ page }) => {
  const requests: Record<string, unknown>[] = [];
  page.on("request", req => { if (req.url().endsWith("/operations/on-off")) requests.push(req.postDataJSON()); });
  await openWorkbench(page, "/wowy");
  await page.getByRole("combobox", { name: "View", exact: true }).selectOption("leaders");
  await pick(page,"Candidate players","1,2,3");
  await expect(page.getByRole("heading", { name: /On\/Off ·/ })).toHaveCount(3);
  expect(requests.slice(-3)).toHaveLength(3);
  expect(requests.at(-2)!.release_id).toBe("fixture-release");
  expect(requests.at(-1)!.before_date).toBe("2024-04-15");
});

test("Stats on/off preset opens served per-team rating columns", async ({ page }) => {
  await openWorkbench(page, "/stats?preset=onoff&together=1");
  await expect(page.getByRole("heading", { name: "Stats Explorer" })).toBeVisible();
  await expect(page.getByRole("tab", { name: "On-Off", exact: true })).toHaveAttribute("aria-selected", "true");
  await expect(page.getByRole("columnheader").filter({ hasText: "Net on/off" })).toBeVisible();
});

test("partial samples show raw rates and directional denominators while gating differences", async ({ page }) => {
  await page.route("**/api/workbench/operations/wowy", async route => {
    const response = structuredClone(empty);
    response.operation = "wowy";
    response.request = { ...empty.request, ...route.request().postDataJSON() };
    response.coverage_status = "partial"; response.observed_games = 3;
    response.disclosures = ["Browser acceptance fixture; not real player analytics."];
    response.cells[0] = { ...response.cells[0], games: 3, stints: 12, minutes: 40.25,
      offensive_possessions: 80.5, defensive_possessions: 79.25, points: 96, points_allowed: 89,
      sample_status: "insufficient_sample", reason: "Below possession and game gates",
      raw_metrics: { offensive_rating: 119.254658, defensive_rating: 112.302839, net_rating: 6.951819 },
      metric_denominators: { offensive_rating: 80.5, defensive_rating: 79.25 },
      metric_valid_stints: { offensive_rating: 12, defensive_rating: 12 } };
    response.shifts[0].selected_value = 119.254658;
    await route.fulfill({ json: response });
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await openWorkbench(page, "/wowy?together=1&team_id=TOR");
  const exposure = page.locator("table").first();
  await expect(exposure).toContainText("80.50");
  await expect(exposure).toContainText("79.25");
  await expect(exposure).toContainText("119.25");
  await expect(exposure).toContainText("insufficient_sample");
  await expect(page.locator("table").nth(1).locator("tbody tr").first()).toContainText("—");
  await page.locator(".floor-result .ui-why-summary").click();
  await expect(page.getByText("No shrinkage or prior is applied", { exact: false })).toBeVisible();
  const fits = await page.locator(".shared-floor").evaluate(el => el.getBoundingClientRect().right <= window.innerWidth);
  expect(fits).toBe(true);
  await page.screenshot({ path: test.info().outputPath("b22-partial-mobile-fixture.png"), fullPage: true });
});

test("query overflow is actionable and exports are unavailable after failed queries", async ({ page }) => {
  await page.route("**/api/workbench/operations/wowy", route => route.fulfill({ status: 422, json: { detail: { reason: "query_bound_exceeded", detail: "Narrow with lower/cutoff dates" } } }));
  await openWorkbench(page, "/wowy?together=1");
  await expect(page.locator(".shared-floor").getByRole("alert")).toContainText("query_bound_exceeded");
  await expect(page.locator(".shared-floor").getByRole("alert")).toContainText("Narrow");
  await expect(page.getByRole("button", { name: "Save evidence JSON" })).toHaveCount(0);
});
