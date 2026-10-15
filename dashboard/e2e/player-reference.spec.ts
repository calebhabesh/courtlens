import { expect, test } from "@playwright/test";
import { openWorkbench } from "./workbench-navigation";

for (const width of [1440, 390]) {
  test(`reference sections keep contract terms, history and events in one table at ${width}`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await openWorkbench(page, "/players/24");
    const table = page.getByRole("table", { name: "Contract and salary history by season" });
    await expect(table.getByText("Current Contract", { exact: true })).toBeVisible();
    await expect(table.getByText("Salary History", { exact: true })).toBeVisible();
    for (const text of ["$2,000,000", "1.2%", "Player option", "Team option", "$0", "$1,000,000", "Signed extension."]) await expect(table).toContainText(text);
    await expect(table.getByRole("row", { name: /^Remaining Guaranteed/ }).getByRole("link", { name: "$123.45", exact: true })).toBeVisible();
    const transactions = page.getByRole("region", { name: "Transaction News", exact: true });
    await expect(transactions.locator("time").first()).toHaveAttribute("datetime", "2026-09-22");
    await transactions.getByText("Earlier Transactions · 1", { exact: true }).click();
    await expect(transactions.getByText("Drafted by Boston.")).toBeVisible();
    const highs = page.getByRole("region", { name: "Career highs table", exact: true });
    await expect(highs).toContainText("Regular season");
    await expect(highs).toContainText("Playoffs");
    await expect(highs.getByRole("link", { name: "42", exact: true })).toHaveAttribute("title", "PTS · Jan 2, 2026");
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width);
    if (width === 390) {
      const scroller = page.getByRole("region", { name: "Contract table scroll area", exact: true });
      expect(await scroller.evaluate(el => el.scrollWidth > el.clientWidth)).toBe(true);
      await scroller.evaluate(el => { el.scrollLeft = el.scrollWidth; });
      await expect(table.getByText("Signed extension.", { exact: true })).toBeVisible();
    }
  });
}
