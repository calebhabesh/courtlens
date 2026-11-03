import { expect, test, type Page } from "@playwright/test";
import path from "node:path";

// Playoffs (alignment row 8): the mirrored bracket and Databallr's series page, on the real
// 2025-26 playoffs saved as mock-API fixtures.
const evidence = path.join("..", "docs", "evidence", "alignment", "playoffs");
const noOverflow = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth);

test("mirrored bracket with the Finals in the centre", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/playoffs?season=2025-26");
  await page.waitForLoadState("networkidle");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("2026 NBA Playoffs");
  const west = page.locator('.pb-side[data-side="Western"]');
  const east = page.locator('.pb-side[data-side="Eastern"]');
  await expect(west.locator("a.pb-slot")).toHaveCount(7);
  await expect(east.locator("a.pb-slot")).toHaveCount(7);
  // DET met CLE in the semifinals, so their first-round series sit together.
  await expect(east.locator(".pb-col").first().locator(".pb-code")).toHaveText(["DET", "ORL", "CLE", "TOR", "BOS", "PHI", "NYK", "ATL"]);
  // The East runs right to left: its first round is the outermost column.
  const westFirst = await west.locator(".pb-col").first().boundingBox();
  const eastFirst = await east.locator(".pb-col").first().boundingBox();
  const finals = await page.locator(".pb-finals-card").boundingBox();
  expect(westFirst!.x).toBeLessThan(finals!.x);
  expect(eastFirst!.x).toBeGreaterThan(finals!.x + finals!.width);
  await expect(page.locator(".pb-finals-card")).toContainText("NYK won 4–1");
  await expect(page.locator(".pb-finals-card")).toContainText("Regular season: Split 1–1");
  // Season series on hover.
  const okc = west.locator("a.pb-slot").first();
  await okc.hover();
  await expect(okc.locator(".pb-pop")).toBeVisible();
  await expect(okc.locator(".pb-pop")).toContainText("Regular season: OKC 3–2");
  expect(await noOverflow(page)).toBe(true);
  await page.mouse.move(0, 0);
  await page.screenshot({ path: path.join(evidence, "bracket-1440.png"), fullPage: true });
  await okc.click();
  await expect(page).toHaveURL(/\/playoffs\/2026-r1-okc-phx/);
});

test("phones show one side or the Finals at a time", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 900 });
  await page.goto("/playoffs?season=2025-26");
  await page.waitForLoadState("networkidle");
  await expect(page.locator(".pb-finals-card")).toBeVisible();
  await expect(page.locator(".pb-side").first()).toBeHidden();
  await page.screenshot({ path: path.join(evidence, "bracket-finals-390.png"), fullPage: true });
  await page.getByRole("radio", { name: "West" }).click();
  await expect(page.locator('.pb-side[data-side="Western"]')).toBeVisible();
  await expect(page.locator(".pb-finals-card")).toBeHidden();
  expect(await noOverflow(page)).toBe(true);
  await page.screenshot({ path: path.join(evidence, "bracket-west-390.png"), fullPage: true });
});

test("byes leave empty slots and three-group seasons keep round columns", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/playoffs?season=1975-76");
  await page.waitForLoadState("networkidle");
  await expect(page.locator('.pb-side[data-side="Eastern"] .pb-col').first().locator(".pb-slot.is-bye")).toHaveCount(3);
  await page.screenshot({ path: path.join(evidence, "bracket-1975-76-1440.png"), fullPage: true });
  await page.goto("/playoffs?season=1949-50");
  await page.waitForLoadState("networkidle");
  await expect(page.locator(".pb-bracket")).toHaveCount(0);
  await expect(page.locator(".playoff-bracket-card").first()).toBeVisible();
});

test("series page: hero, season series, trajectory, bars, averages, matchups and impact", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/playoffs/2026-r1-okc-phx");
  await page.waitForLoadState("networkidle");
  const hero = page.locator(".ps-hero");
  await expect(hero).toContainText("Thunder");
  await expect(hero).toContainText("Series winner");
  await expect(hero.locator(".ps-hero-wins")).toHaveText(["4 series wins", "0 series wins"]);
  await hero.getByText("Regular season: OKC 3–2").click();
  await expect(hero.locator(".ps-meetings-list li")).toHaveCount(5);
  // Four played games and three empty placeholders.
  await expect(page.locator(".ps-game")).toHaveCount(7);
  await expect(page.locator(".ps-game.is-unplayed")).toHaveCount(3);
  await expect(page.locator(".ps-bars").first().locator("tbody tr").first()).toContainText("126.7");
  // Averages sort by points; Advanced swaps the columns.
  const averages = page.locator(".ps-averages");
  await expect(averages.locator("tbody tr").first()).toContainText("Shai Gilgeous-Alexander");
  await page.getByRole("radio", { name: "Advanced" }).click();
  await expect(averages.getByRole("button", { name: "Sort by AST/TO" })).toBeVisible();
  // Matchups as Databallr shows them for SGA: Brooks first, 317.2 possessions in all.
  const matchups = page.locator(".ps-mu-table");
  await expect(matchups.locator("tbody tr").first()).toContainText("D. Brooks");
  await expect(matchups.locator("tbody tr").first()).toContainText("87.2");
  await expect(matchups.locator("tfoot")).toContainText("317.2");
  await page.getByRole("radio", { name: "On Defense" }).click();
  await expect(page.locator(".ps-mu-card")).toContainText("Guarded");
  // DARKO face-off, then RAPM.
  await expect(page.locator(".ps-impact-row")).toHaveCount(12);
  await expect(page.locator(".ps-impact-row").first()).toContainText("Shai Gilgeous-Alexander");
  await page.getByRole("radio", { name: "RAPM" }).click();
  await expect(page.locator(".ps-impact h2")).toHaveText("RAPM Face-Off");
  expect(await noOverflow(page)).toBe(true);
  await page.getByRole("radio", { name: "DARKO" }).click();
  await page.getByRole("radio", { name: "Basic" }).click();
  await page.getByRole("radio", { name: "On Offense" }).click();
  for (let y = 0; y < 6000; y += 500) await page.evaluate(top => scrollTo(0, top), y);
  await page.evaluate(() => scrollTo(0, 0));
  await page.screenshot({ path: path.join(evidence, "series-1440.png"), fullPage: true });
  await page.setViewportSize({ width: 390, height: 900 });
  expect(await noOverflow(page)).toBe(true);
  await page.screenshot({ path: path.join(evidence, "series-390.png"), fullPage: true });
});
