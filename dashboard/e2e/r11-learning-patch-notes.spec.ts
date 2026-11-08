import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { LEARNING_TIERS, learningTopic, learningTopicCount, topicMatches } from "../lib/learning-topics";
import { PATCH_RELEASES, commitUrl, releaseLine } from "../lib/patch-notes";
import { openWorkbench } from "./workbench-navigation";

// R11: Learning, Glossary and Patch Notes (Learning redesigned in RD06). Measured numbers come from lib/research-facts.ts
// (checked against the frozen results by Vitest); the league table and chart must equal the served four-factors answer.
const ff = JSON.parse(readFileSync("e2e/fixtures/r10-four-factors.json", "utf8"));

test.describe("R11 Learning (RD06 design)", () => {
  test.beforeEach(async ({ page }) => { await page.setViewportSize({ width: 1440, height: 900 }); });
  const topics = LEARNING_TIERS.flatMap(tier => tier.topics.map(topic => ({ tier, topic })));

  test("lists every tier and topic, each reachable from the index, with its wells and chips", async ({ page }) => {
    await openWorkbench(page, "/methodology/learning");
    await expect(page.getByRole("heading", { level: 1, name: "Learning" })).toBeVisible();
    await expect(page.getByText(`${learningTopicCount()} topics across ${LEARNING_TIERS.length} tiers`, { exact: false })).toBeVisible();
    await expect(page.getByRole("link", { name: "Definitions" })).toHaveAttribute("href", "/methodology");
    const index = page.getByRole("navigation", { name: "Learning topics", exact: true });
    for (const tier of LEARNING_TIERS) {
      await expect(page.getByRole("heading", { level: 2, name: `Tier ${tier.number}: ${tier.title}`, exact: true })).toBeVisible();
      await expect(index.getByRole("link", { name: `${tier.number}. ${tier.title}`, exact: true })).toHaveAttribute("href", `#${tier.id}`);
    }
    for (const { tier, topic } of topics) {
      await expect(index.getByRole("link", { name: topic.title, exact: true })).toHaveAttribute("href", `#${topic.id}`);
      const card = page.locator(`article[id="${topic.id}"]`);
      await expect(card.getByRole("heading", { level: 3 })).toHaveText(topic.title);
      await expect(card.locator(".ln-pill")).toHaveText(`Tier ${tier.number} · ${tier.title}`);
      await expect(card.locator(".ln-formula")).toHaveCount(topic.formulas?.length ?? 0);
      for (const [i, formula] of (topic.formulas ?? []).entries()) {
        await expect(card.locator(".ln-formula").nth(i).locator(".ln-well-label")).toHaveText(formula.label);
        await expect(card.locator(".ln-formula").nth(i).locator("code")).toHaveText(formula.line);
      }
      if (topic.measured) await expect(card.locator(`[data-measured="${topic.id}"]`)).toHaveText(topic.measured.text);
      await expect(card.locator("[data-myth]")).toHaveCount(topic.myth ? 1 : 0);
      if (topic.myth) {
        await expect(card.locator(`[data-myth="${topic.id}"]`)).toContainText(topic.myth);
        await expect(card.locator(`[data-myth="${topic.id}"] [data-measured]`)).toHaveText(topic.measured?.text ?? "");
        await expect(card.locator(".ln-measured")).toHaveCount(0);
      }
      const chips = card.getByRole("navigation", { name: `${topic.title} prerequisites` });
      for (const id of topic.prerequisites ?? []) await expect(chips.getByRole("link", { name: learningTopic(id)?.topic.title ?? id, exact: true })).toHaveAttribute("href", `#${id}`);
      for (const link of topic.links) await expect(card.getByRole("navigation", { name: `${topic.title} pages` }).getByRole("link", { name: link.label, exact: true })).toHaveAttribute("href", link.href);
    }
    await expect(page.getByRole("heading", { name: "Investigate historical scoring variation" })).toHaveCount(0);
    await expect(page.locator("select")).toHaveCount(0);
  });

  test("search filters the cards and the index; clearing brings every topic back", async ({ page }) => {
    await openWorkbench(page, "/methodology/learning");
    const search = page.getByRole("searchbox", { name: "Search topics" });
    await search.fill("rebound");
    const expected = topics.filter(({ topic }) => topicMatches(topic, "rebound")).map(({ topic }) => topic.id);
    expect(expected.length).toBeGreaterThan(0);
    await expect(page.locator("article[data-topic]")).toHaveCount(expected.length);
    expect(await page.locator("article[data-topic]").evaluateAll(cards => cards.map(card => card.id))).toEqual(expected);
    await expect(page.getByRole("status").filter({ hasText: "topics match" })).toHaveText(`${expected.length} of ${learningTopicCount()} topics match “rebound”`);
    await search.fill("zzzz");
    await expect(page.locator("article[data-topic]")).toHaveCount(0);
    await page.getByRole("button", { name: "Clear search" }).click();
    await expect(page.locator("article[data-topic]")).toHaveCount(learningTopicCount());
  });

  test("the index marks the topic being read", async ({ page }) => {
    await openWorkbench(page, "/methodology/learning");
    const index = page.getByRole("navigation", { name: "Learning topics", exact: true });
    await index.getByRole("link", { name: "RAPM", exact: true }).click();
    await expect(page).toHaveURL(/#rapm$/);
    await expect(index.getByRole("link", { name: "RAPM", exact: true })).toHaveAttribute("aria-current", "location");
    await expect(index.locator("[aria-current]")).toHaveCount(1);
  });

  test("the search heads the index column at its width and stays with it (RD06 round 2)", async ({ page }) => {
    await openWorkbench(page, "/methodology/learning");
    const search = page.getByRole("searchbox", { name: "Search topics" });
    const index = page.getByRole("navigation", { name: "Learning topics", exact: true });
    const column = page.locator(".ln-aside");
    const [s, i, c] = [await search.locator("xpath=ancestor::div[contains(@class,'ln-search')]").boundingBox(), await index.boundingBox(), await column.boundingBox()];
    expect(Math.abs(s!.x - c!.x)).toBeLessThanOrEqual(1);
    expect(Math.abs(s!.width - c!.width)).toBeLessThanOrEqual(1);
    expect(Math.round(i!.y - (s!.y + s!.height))).toBe(24); // round 3: a clear 24 px under the search
    const top = page.locator(".ln-tier").first();
    expect(Math.abs(s!.y - (await top.boundingBox())!.y)).toBeLessThanOrEqual(1);
    await page.locator("article#rapm").scrollIntoViewIfNeeded();
    await page.mouse.wheel(0, 600);
    await expect(search).toBeInViewport();
    await expect(index).toBeInViewport();
  });

  test("shows the served league inputs for every season, in the table and the chart", async ({ page }) => {
    await openWorkbench(page, "/methodology/learning");
    const table = page.getByRole("table", { name: "League averages by season" });
    await expect(table.locator("tbody tr")).toHaveCount(ff.seasons.length);
    for (const season of ff.seasons) {
      const row = table.locator(`tr[data-row="${season.season}"]`);
      await expect(row.locator('[data-field="ts"]')).toHaveAttribute("data-value", String(season.league.ts));
      await expect(row.locator('[data-field="efg"]')).toHaveAttribute("data-value", String(season.league.inputs.efg));
      await expect(row.locator('[data-field="tov_pct"]')).toHaveAttribute("data-value", String(season.league.inputs.tov_pct));
      await expect(row.locator('[data-field="orb_pct"]')).toHaveAttribute("data-value", String(season.league.inputs.orb_pct));
      await expect(row.locator('[data-field="fg3a_rate"]')).toHaveAttribute("data-value", String(season.league.fg3a_rate));
      await expect(row.locator('[data-field="ortg"]')).toHaveAttribute("data-value", String(season.league.ortg_factors));
    }
    const chart = page.locator(".ln-trends-chart");
    const dots = async () => chart.locator(".slc-dot").evaluateAll(nodes => nodes.map(node => [node.getAttribute("data-season"), Number(node.getAttribute("data-value"))]));
    expect(await dots()).toEqual(ff.seasons.map((s: { season: string; league: { ts: number } }) => [s.season, s.league.ts]));
    await chart.getByRole("radio", { name: "ORB%" }).click();
    await expect(chart.getByText("League ORB% by season", { exact: false })).toBeVisible();
    expect(await dots()).toEqual(ff.seasons.map((s: { season: string; league: { inputs: { orb_pct: number } } }) => [s.season, s.league.inputs.orb_pct]));
    const plot = chart.getByRole("img");
    await plot.hover({ position: { x: 4, y: 40 } });
    await expect(chart.locator(".slc-tip")).toContainText(ff.seasons[0].season);
  });

  test("fits a phone: no overflow, the index collapses above the cards", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await openWorkbench(page, "/methodology/learning");
    await expect(page.getByRole("table", { name: "League averages by season" })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await expect(page.getByRole("navigation", { name: "Learning topics", exact: true })).toBeHidden();
    const searchBox = (await page.getByRole("searchbox", { name: "Search topics" }).locator("xpath=ancestor::div[contains(@class,'ln-search')]").boundingBox())!;
    const topicsButton = (await page.locator(".ln-index-phone summary").boundingBox())!;
    expect(searchBox.y + searchBox.height).toBeLessThanOrEqual(topicsButton.y);
    expect(Math.abs(searchBox.width - topicsButton.width)).toBeLessThanOrEqual(1);
    const phoneIndex = page.getByRole("navigation", { name: "Learning topics (phone)" });
    await expect(phoneIndex).toBeHidden();
    await page.locator(".ln-index-phone summary").click();
    await phoneIndex.getByRole("link", { name: "Lineup Sample Size", exact: true }).click();
    await expect(page).toHaveURL(/#lineup-sample-size$/);
    await expect(phoneIndex).toBeHidden();
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
