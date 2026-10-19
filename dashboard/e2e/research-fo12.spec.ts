import { expect, test } from "@playwright/test";
import { openWorkbench } from "./workbench-navigation";

// FO12: Research pages on the Research template keep their state in the URL, run valid queries
// without a Load button, state unknown as unknown and keep IDs and hashes in Data details.
const scope = "season=2025-26&phase=regular_season&releaseId=fixture-release&beforeDate=2026-04-13";
const hash = "c".repeat(64);
const period = (label: string, start: string, end: string) => ({ label, mode: "appearances", start_date: start, end_date: end, appearances_count: 10, total_minutes: 340, min_per_game: 34, stints: ["TOR"], metrics: {}, sample_counts: {} });

test("trends runs from the URL, formats shooting percentages and keeps the evidence hash in Data details", async ({ page }) => {
  const requests: Record<string, unknown>[] = [];
  await page.route("**/api/workbench/operations/compare-periods", route => {
    requests.push(route.request().postDataJSON());
    return route.fulfill({ json: { operation_version: "fixture-v1", evidence_hash: hash, player_id: "1630567", player_name: "Scottie Barnes", season: "2025-26", phase: "regular_season", before_date: "2026-04-13",
      period_a: period("Last 10 Appearances", "2026-03-25", "2026-04-12"), period_b: period("Preceding 10 Appearances", "2026-03-03", "2026-03-23"), has_calendar_overlap: false, disclosures: ["Fixture disclosure"],
      deltas: [
        { metric_key: "pts_per_game", display_name: "Points Per Game", period_a_value: 20, period_b_value: 18.5, absolute_delta: 1.5, percentage_delta: 8.11, period_a_n: 10, period_b_n: 10 },
        { metric_key: "ts_pct", display_name: "True Shooting Percentage", period_a_value: 0.55, period_b_value: 0.52, absolute_delta: 0.03, percentage_delta: 5.77, period_a_n: 10, period_b_n: 10 },
        { metric_key: "fg3_pct", display_name: "Three-Point Percentage", period_a_value: null, period_b_value: 0.3, absolute_delta: null, percentage_delta: null, period_a_n: 0, period_b_n: 10 }
      ] } });
  });
  await openWorkbench(page, `/research/trends?${scope}&playerId=1630567`);
  const findings = page.getByRole("region", { name: "Key findings" });
  await expect(findings).toContainText("55.0%");
  await expect(findings).toContainText("+3 pp");
  const table = page.getByRole("region", { name: "Metric variance" });
  await expect(table.getByRole("row", { name: /Three-Point Percentage/ })).toContainText("—");
  expect(requests[0]).toMatchObject({ player_id: "1630567", season: "2025-26", release_id: "fixture-release", before_date: "2026-04-13", mode: "appearances", period_a_n: 10 });
  // A filter change applies immediately and stays in the URL.
  await page.getByLabel("Period A", { exact: true }).selectOption("5");
  await expect(page).toHaveURL(/periodAN=5/);
  await expect.poll(() => requests.at(-1)?.period_a_n).toBe(5);
  await expect(page.getByText(hash)).toHaveCount(0);
  await page.getByRole("button", { name: "Data Details" }).click();
  await expect(page.getByRole("dialog")).toContainText(hash);
});

test("distributions keeps the selected view in the URL and states the sample gate in one line", async ({ page }) => {
  await page.route("**/api/workbench/operations/distribution", route => route.fulfill({ json: { operation_version: "fixture-v1", evidence_hash: hash, player_id: "1630567", player_name: "Scottie Barnes", metric: "pts", metric_display_name: "Total Points", metric_unit: "points", season: "2025-26", phase: "regular_season", before_date: "2026-04-13",
    summary: { summary_available: false, reason: "Fewer than 5 appearances", n: 3, mean: null, median: null, min: 10, max: 20, population_sd: null, p10: null, p25: null, p75: null, p90: null, iqr: null },
    samples: [{ game_id: "g1", game_date: "2026-04-10", team_tricode: "TOR", opponent_tricode: "BOS", is_home: true, minutes: null, value: 0 }], disclosures: [] } }));
  await page.route("**/api/workbench/operations/opponent-context", route => route.fulfill({ json: { operation_version: "fixture-v1", evidence_hash: hash, season: "2025-26", phase: "regular_season", before_date: "2026-04-13", teams_analyzed: 1, disclosures: [],
    allowances: [{ opponent_team_id: "1610612738", opponent_tricode: "BOS", opponent_name: "Boston Celtics", games_observed: 60, pts_allowed_per_game: 108.2, fg_pct_allowed: null, fg3_pct_allowed: 0.35, reb_allowed_per_game: 42, ast_allowed_per_game: 24, tov_forced_per_game: 14, league_rank_pts_allowed: 1, total_teams_in_rank: 30 }] } }));
  await openWorkbench(page, `/research/distributions?${scope}&playerId=1630567`);
  await expect(page.getByText("Fewer than 5 appearances", { exact: true })).toBeVisible();
  const samples = page.getByRole("region", { name: "Appearance samples" });
  // A documented zero stays zero; a missing minutes value stays unknown.
  await expect(samples.getByRole("row", { name: /Apr 10, 2026/ })).toContainText("0");
  await expect(samples.getByRole("row", { name: /Apr 10, 2026/ })).toContainText("—");
  await page.getByRole("radio", { name: "Opponent Context" }).click();
  await expect(page).toHaveURL(/tab=opponent/);
  await expect(page.getByRole("region", { name: "Defensive allowances" })).toContainText("Boston Celtics");
  await page.reload();
  await expect(page.getByRole("radio", { name: "Opponent Context" })).toBeChecked();
});

test("a research operation deep link reruns without AI and keeps its context in Data details", async ({ page }) => {
  const context = { release_id: "retained-release", season: "2024-25", phase: "regular_season", before_date: "2025-04-15" };
  await page.route("**/api/workbench/assistant/turn", route => { const req = route.request().postDataJSON(); return route.fulfill({ json: { schema_version: "courtload-conversation-v1", status: "answered", conversation_id: "11111111-1111-4111-8111-111111111111", turn_id: req.request_id, context, context_fingerprint: hash, interpretation: "Executed without AI", plan: req.plan, results: [], choices: [], limitations: [], manifest: null, accounting: { provider_calls: 0 } } }); });
  await page.route("**/api/workbench/assistant/conversations/**", route => route.fulfill({ json: { cleared: true } }));
  const params = new URLSearchParams({ operation: "distribution", arguments: JSON.stringify({ metric: "pts" }), ...context });
  await openWorkbench(page, `/research/operation?${params}`);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Research Operation");
  await expect(page.getByRole("region", { name: "Key findings" })).toContainText("Answered");
  await expect(page.getByText("2024-25 · Regular Season · Through Apr 14, 2025")).toBeVisible();
  await expect(page.getByText("retained-release")).toHaveCount(0);
  await page.getByRole("button", { name: "Data Details" }).click();
  await expect(page.getByRole("dialog")).toContainText("retained-release");
});

test("saved investigations list scope in words and keep each record's hash behind Details", async ({ page }) => {
  await page.route("**/api/workbench/assistant/investigations?**", route => route.fulfill({ json: [{ id: "record-1", title: "Retained scoring", created_at: "2026-10-04T12:00:00Z", manifest_sha256: hash, context: { release_id: "retained-release", season: "2024-25", phase: "regular_season", before_date: "2025-04-15" }, operations: ["compare_periods"], question_saved: false }] }));
  await openWorkbench(page, "/investigations?view=personal");
  const table = page.getByRole("region", { name: "Saved operations table" });
  await expect(table.getByRole("row", { name: /Retained scoring/ })).toContainText("2024-25 · Regular Season · Through Apr 14, 2025");
  await expect(table).toContainText("Compare Periods");
  await expect(page.getByText(hash)).toHaveCount(0);
  await table.getByRole("button", { name: "Details" }).click();
  await expect(page.getByRole("dialog")).toContainText(hash);
});

// PC11 retired the last gate notices: Defensive Matchups is populated and EPV redirects (e2e/pc11-gated-pages.spec.ts).
