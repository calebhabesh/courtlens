import { expect, test } from "@playwright/test";
import { openWorkbench } from "./workbench-navigation";

// FO12: Research pages on the Research template keep their state in the URL, run valid queries
// without a Load button, state unknown as unknown and keep IDs and hashes in Data details.
const hash = "c".repeat(64);

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
