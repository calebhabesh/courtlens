import { expect, test } from "@playwright/test";
import { openWorkbench } from "./workbench-navigation";
import { readFileSync } from "node:fs";
const smoke = JSON.parse(readFileSync("../docs/evidence/b23-api-smoke.json", "utf8"));
function fixture(operation: string, request: Record<string, unknown>) {
  const data = structuredClone(smoke.operations[operation].response);
  data.request = { ...data.request, ...request };
  data.context = { ...data.context, release_id: request.release_id || "fixture-release", season: request.season || "2023-24", phase: request.phase || "regular_season", before_date: request.before_date || "2024-04-15" };
  return data;
}
test.beforeEach(async ({ page }) => {
  await page.route("**/api/workbench/operations/*", async route => route.fulfill({ json: fixture(route.request().url().split("/").pop()!, route.request().postDataJSON()) }));
});
test("aftermath keeps branch samples, unknown membership and censoring distinct", async ({ page }) => {
  await page.route("**/api/workbench/operations/shot-aftermath", async route => {
    const data = fixture("shot-aftermath", route.request().postDataJSON()); data.coverage_status = "partial";
    data.aftermath_summary = [{ branch: "unknown", anchors: 1, games: 1, continued_samples: 0, opponent_samples: 0, missing_opponent: 1, censored_opponent: 0, first_chance_points: null, continued_points: null, next_opponent_points: null, sample_status: "insufficient_sample" }, { branch: "made", anchors: 1, games: 1, continued_samples: 1, opponent_samples: 0, missing_opponent: 0, censored_opponent: 1, first_chance_points: 2, continued_points: 0, next_opponent_points: null, sample_status: "insufficient_sample" }];
    data.anchors = [{ game_id: "g", possession_number: null, branch: "unknown", shot_points: 0, first_chance_points: null, continued_points: null, next_opponent_points: null, next_status: "missing", reason: "unmapped" }, { game_id: "g", possession_number: 5, branch: "made", shot_points: 2, first_chance_points: 2, continued_points: 0, next_opponent_points: null, next_status: "censored", reason: "period_end" }];
    await route.fulfill({ json: data });
  });
  await openWorkbench(page, "/research/shooting/aftermath?player_id=1");
  await expect(page.getByRole("region", { name: "Aftermath branches" })).toContainText("insufficient_sample");
  await page.getByText("Sequence Evidence · 2 Anchors / Unknown Candidates", { exact: true }).click();
  await expect(page.getByRole("region", { name: "Sequence evidence" })).toContainText("censored"); await expect(page.getByRole("region", { name: "Sequence evidence" })).toContainText("—");
  const pending = page.waitForEvent("download"); await page.getByRole("button", { name: "Export evidence CSV" }).click();
  expect(readFileSync((await (await pending).path())!, "utf8")).toContain('""first_chance_points"":null');
});
test("query overflow is actionable and cannot export a partial result", async ({ page }) => {
  await page.route("**/api/workbench/operations/*", async route => route.fulfill({ status: 422, json: { detail: { code: "query_bound_exceeded", message: "Narrow the date scope; complete shot input exceeds 50000 records" } } }));
  await openWorkbench(page, "/research/shooting/aftermath?player_id=1"); await expect(page.getByRole("alert").filter({ hasText: "query_bound_exceeded" })).toContainText("query_bound_exceeded"); await expect(page.getByRole("button", { name: "Save evidence JSON" })).toHaveCount(0);
});
test("cancelling an abandoned request prevents stale results", async ({ page }) => {
  await page.route("**/api/workbench/operations/*", async route => { await new Promise(resolve => setTimeout(resolve, 500)); await route.fulfill({ json: fixture("shot-aftermath", route.request().postDataJSON()) }).catch(() => {}); });
  await openWorkbench(page, "/research/shooting/aftermath?player_id=1"); await page.getByRole("button", { name: "Cancel", exact: true }).click(); await expect(page.getByText("Analysis cancelled.", { exact: true })).toBeVisible(); await expect(page.getByRole("region", { name: "Shooting result" })).toHaveCount(0); await page.waitForTimeout(650); await expect(page.getByRole("region", { name: "Shooting result" })).toHaveCount(0);
});
