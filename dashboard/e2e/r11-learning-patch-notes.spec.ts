import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { LEARNING_TIERS, learningTopicCount } from "../lib/learning-topics";
import { PATCH_RELEASES, commitUrl, releaseLine } from "../lib/patch-notes";
import { openWorkbench } from "./workbench-navigation";

// R11: Learning, Glossary and Patch Notes. Measured numbers come from lib/research-facts.ts (checked
// against the frozen results by Vitest); the league table must equal the served four-factors answer.
const ff = JSON.parse(readFileSync("e2e/fixtures/r10-four-factors.json", "utf8"));

test.describe("R11 Learning", () => {
  test.beforeEach(async ({ page }) => { await page.setViewportSize({ width: 1440, height: 900 }); });

  test("lists every tier and topic, each reachable from the index", async ({ page }) => {
    await openWorkbench(page, "/methodology/learning");
    await expect(page.getByText(`${learningTopicCount()} topics across ${LEARNING_TIERS.length} tiers`, { exact: false })).toBeVisible();
    const index = page.getByRole("list", { name: "Learning tiers" });
    await expect(index.getByRole("listitem")).toHaveCount(LEARNING_TIERS.length);
    for (const tier of LEARNING_TIERS) {
      await expect(page.getByRole("heading", { name: `Tier ${tier.number}: ${tier.title}`, exact: true })).toBeVisible();
      for (const topic of tier.topics) {
        await expect(index.getByRole("link", { name: topic.title, exact: true })).toHaveAttribute("href", `#${topic.id}`);
        await expect(page.locator(`[id="${topic.id}"]`)).toHaveText(topic.title);
        if (topic.measured) await expect(page.locator(`[data-measured="${topic.id}"]`)).toHaveText(topic.measured.text);
      }
    }
    await expect(page.getByRole("heading", { name: "Investigate historical scoring variation" })).toBeVisible();
  });

  test("shows the served league inputs for every season", async ({ page }) => {
    await openWorkbench(page, "/methodology/learning");
    const table = page.getByRole("table", { name: "League averages by season" });
    await expect(table.locator("tbody tr")).toHaveCount(ff.seasons.length);
    for (const season of ff.seasons) {
      const row = table.locator(`tr[data-row="${season.season}"]`);
      await expect(row.locator('[data-field="ts"]')).toHaveAttribute("data-value", String(season.league.ts));
      await expect(row.locator('[data-field="tov_pct"]')).toHaveAttribute("data-value", String(season.league.inputs.tov_pct));
      await expect(row.locator('[data-field="orb_pct"]')).toHaveAttribute("data-value", String(season.league.inputs.orb_pct));
    }
  });

  test("fits a phone without horizontal overflow", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await openWorkbench(page, "/methodology/learning");
    await expect(page.getByRole("table", { name: "League averages by season" })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });
});

test.describe("R11 Patch Notes", () => {
  test.beforeEach(async ({ page }) => { await page.setViewportSize({ width: 1440, height: 900 }); });

  test("lists every release newest first with its version and each entry's commit", async ({ page }) => {
    await openWorkbench(page, "/whats-new");
    for (const release of PATCH_RELEASES) {
      await expect(page.locator(`[data-release="${release.id}"]`)).toHaveText(releaseLine(release));
      for (const group of release.groups) for (const entry of group.entries)
        await expect(page.getByRole("link", { name: `Commit ${entry.commit}` }).first()).toHaveAttribute("href", commitUrl(entry.commit));
    }
    await expect(page.getByRole("link", { name: /blog/i })).toHaveCount(0);
  });

  test("the Research menu lists Learning and Patch Notes; the Blog stays removed", async ({ page }) => {
    await openWorkbench(page, "/whats-new");
    await page.getByRole("button", { name: "Research", exact: true }).click();
    const menu = page.getByRole("menu", { name: "Research" });
    await expect(menu.getByRole("menuitem", { name: /^Learning/ })).toHaveAttribute("href", "/methodology/learning");
    await expect(menu.getByRole("menuitem", { name: /^Patch Notes/ })).toHaveAttribute("href", "/whats-new");
    await expect(menu.getByRole("menuitem", { name: /Blog/ })).toHaveCount(0);
    await page.goto("/whats-new/blog");
    await expect(page).toHaveURL(url => url.pathname === "/whats-new");
  });
});
