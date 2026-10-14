// The /wowy operation UI was replaced in PC11 by stint-derived pair splits (e2e/pc11-gated-pages.spec.ts);
// these checks cover the operation that Teammate Stat Shift still uses.
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

test("Stats on/off preset opens served per-team rating columns", async ({ page }) => {
  await openWorkbench(page, "/stats?preset=onoff&together=1");
  await expect(page.getByRole("heading", { level: 1, name: "NBA Player Statistics", exact: true })).toBeVisible();
  await expect(page.getByRole("tab", { name: "On-Off", exact: true })).toHaveAttribute("aria-selected", "true");
  await expect(page.getByRole("columnheader").filter({ hasText: "Net on/off" })).toBeVisible();
});
