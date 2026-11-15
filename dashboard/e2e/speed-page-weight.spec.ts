import { expect, test, type APIRequestContext } from "@playwright/test";

// Speed plan SP08: CI guards for SP05's page weight, against the mock API. Timings are not asserted
// in CI; bytes are. The ceilings sit about 15% above the fixture build's HTML on 2026-11-15 (Stats
// 297,085 B, player 23 200,998 B): a regression that sends a client component props it does not
// read crosses them. The fixture has few rows, so on Stats the field check is the sharper guard:
// SP05's `statsTableData` drops the query's analytical `percentiles` and `cohort_sample_sizes`,
// which no page reads (checked: with the trimming undone, this spec fails). The fixture's career
// rows never carry those maps, so the player page has a ceiling only.
const CEILINGS = { stats: 340_000, player: 230_000 };

// Keys as they appear inside the RSC payload strings of the HTML (JSON inside a JS string).
const TABLE_PERCENTILES = '\\"table_percentiles\\":';
const PERCENTILES = '\\"percentiles\\":';
const COHORT_SIZES = '\\"cohort_sample_sizes\\"';

async function html(request: APIRequestContext, path: string) {
  const response = await request.get(path);
  expect(response.status()).toBe(200);
  return response.text();
}

test("Stats HTML stays under its ceiling and carries no analytical percentile maps", async ({ request }) => {
  const body = await html(request, "/stats");
  expect(Buffer.byteLength(body), "Stats HTML bytes").toBeLessThanOrEqual(CEILINGS.stats);
  expect(body.includes(TABLE_PERCENTILES), "the table's own percentiles are sent").toBe(true);
  expect(body.includes(PERCENTILES), "Stats rows carry the analytical `percentiles` map").toBe(false);
  expect(body.includes(COHORT_SIZES), "Stats rows carry `cohort_sample_sizes`").toBe(false);
});

test("player page HTML stays under its ceiling", async ({ request }) => {
  const body = await html(request, "/players/23");
  expect(Buffer.byteLength(body), "player page HTML bytes").toBeLessThanOrEqual(CEILINGS.player);
});
