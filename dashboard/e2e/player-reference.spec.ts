import { expect, test } from "@playwright/test";
import { openWorkbench } from "./workbench-navigation";

for (const width of [1440, 390]) {
  test(`reference sections keep contract terms, history and events in one table at ${width}`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await openWorkbench(page, "/players/24");
    const table = page.getByRole("table", { name: "Contract and salary history by season" });
    // Seasons are bracketed by contract: the current one counted back with Wikipedia's terms, a
    // signing only the article lists, and a signing whose length and start are unknown.
    await expect(table.getByText("Current ·", { exact: false }).first()).toBeVisible();
    await expect(table.getByRole("link", { name: "3-yr/$6M", exact: true })).toHaveAttribute("href", "https://en.wikipedia.org/wiki/Fixture_Player");
    await expect(table.getByRole("link", { name: "from Wikipedia", exact: true })).toBeVisible();
    await expect(table).toContainText("Length and first season not reported");
    for (const text of ["$2,000,000", "1.2%", "Player Option", "Team Option", "$0", "$1,000,000"]) await expect(table).toContainText(text);
    await expect(page.getByRole("link", { name: "Wikipedia: Fixture Player", exact: true })).toBeVisible();
    await expect(table.getByRole("row", { name: /^Remaining Guaranteed/ }).getByRole("link", { name: "$123.45", exact: true })).toBeVisible();
    const transactions = page.getByRole("region", { name: "Transaction News", exact: true });
    await expect(transactions.locator("time").first()).toHaveAttribute("datetime", "2026-09-22");
    await transactions.getByText("Earlier Transactions · 1", { exact: true }).click();
    await expect(transactions.getByText("Drafted by Boston.")).toBeVisible();
    const highs = page.getByRole("region", { name: "Career highs table", exact: true });
    await expect(highs).toContainText("Regular Season");
    await expect(highs).toContainText("Playoffs");
    await expect(highs.getByRole("link", { name: "42", exact: true })).toHaveAttribute("title", "PTS · Jan 2, 2026");
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width);
    if (width === 390) {
      const scroller = page.getByRole("region", { name: "Contract table scroll area", exact: true });
      expect(await scroller.evaluate(el => el.scrollWidth > el.clientWidth)).toBe(true);
      await scroller.evaluate(el => { el.scrollLeft = el.scrollWidth; });
      await expect(table.getByText("Traded from BOS to TOR.", { exact: true })).toBeVisible();
    }
  });
}
