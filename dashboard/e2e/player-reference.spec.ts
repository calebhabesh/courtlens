import { expect, test } from "@playwright/test";
import { openWorkbench } from "./workbench-navigation";

for (const width of [1440, 390]) {
  test(`reference sections preserve terms and expand retained history at ${width}`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await openWorkbench(page, "/players/24");
    const contract = page.getByRole("region", { name: "Contract", exact: true });
    await expect(contract.getByRole("heading", { name: "Current Contract", exact: true })).toBeVisible();
    const salaries = page.getByRole("table", { name: "Current contract salaries" });
    await expect(salaries).toContainText("$2,000,000");
    await expect(salaries).toContainText("1.2%");
    await expect(salaries).toContainText("Player option");
    await expect(salaries).toContainText("Team option");
    await expect(salaries).not.toContainText("$123.45");
    await expect(contract.getByRole("link", { name: "$123.45", exact: true })).toBeVisible();
    await contract.getByText("Salary History · 2 entries", { exact: true }).click();
    const history = page.getByRole("table", { name: "Reported salary history" });
    await expect(history).toBeVisible();
    await expect(history).toContainText("$0");
    await expect(history).toContainText("$1,000,000");
    const transactions = page.getByRole("region", { name: "Transactions", exact: true });
    await expect(transactions.locator("time").first()).toHaveAttribute("datetime", "2026-09-22");
    await transactions.getByText("Earlier Transactions · 1", { exact: true }).click();
    await expect(transactions.getByText("Drafted by Boston.")).toBeVisible();
    const highs = page.getByRole("region", { name: "Career highs table", exact: true });
    await expect(highs).toContainText("Regular season");
    await expect(highs).toContainText("Playoffs");
    await expect(highs.getByRole("link", { name: "42", exact: true })).toHaveAttribute("title", "PTS · Jan 2, 2026");
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width);
    if (width === 390) {
      const scroller = page.getByRole("region", { name: "Current contract by season", exact: true });
      expect(await scroller.evaluate(el => el.scrollWidth > el.clientWidth)).toBe(true);
      await scroller.evaluate(el => { el.scrollLeft = el.scrollWidth; });
      await expect(salaries.getByText("Team option", { exact: true })).toBeVisible();
    }
  });
}
