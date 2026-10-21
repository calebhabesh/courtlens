import { test, expect } from "@playwright/test";
import { openWorkbench } from "./workbench-navigation";

// Alignment row 9: Databallr's Player Showcase (season card grid, player dialog, slideshow)
// against the mock API's Stats query (two fixture players, one season).
test.describe("Player Showcase", () => {
  test("centred title, two consoles and a banner over ranked cards with the four card stats", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await openWorkbench(page, "/showcase");
    await expect(page.getByRole("heading", { level: 1, name: "Player Showcase" })).toBeVisible();
    await expect(page.locator(".sc-banner")).toContainText("2025-26");
    await expect(page.locator(".sc-banner-title")).toHaveText("DARKO DPM Leaders");
    const cards = page.locator(".sc-card");
    await expect(cards).toHaveCount(2);
    await expect(cards.first().locator(".sc-rank")).toHaveText("1");
    await expect(cards.first().locator(".sc-season")).toHaveText("'26");
    await expect(cards.first().locator(".sc-stat-label")).toHaveText(["DPM", "PTS", "AST", "TS%"]);
    // The key names every tone; no Load More when the board is complete.
    await expect(page.locator(".sc-key")).toContainText("Gold: up from last season");
    await expect(page.locator(".sc-key")).toContainText("Blue: down");
    expect(await page.getByRole("button", { name: /^Load/ }).count()).toBe(0);

    // The two consoles sit centred under the title, and the banner title is centred on the page.
    const geometry = await page.evaluate(() => {
      const box = (selector: string) => document.querySelector(selector)!.getBoundingClientRect();
      const consoles = box(".sc-consoles"), title = box(".ui-page-header-title-row"), banner = box(".sc-banner"), heading = box(".sc-banner-title");
      const scope = box(".sc-console-scope"), order = box(".sc-console-order");
      return {
        consoles: consoles.left + consoles.width / 2, title: title.left + title.width / 2, banner: banner.left + banner.width / 2,
        heading: heading.left + heading.width / 2, heights: [scope.height, order.height]
      };
    });
    expect(Math.abs(geometry.consoles - geometry.title)).toBeLessThanOrEqual(2);
    expect(Math.abs(geometry.heading - geometry.banner)).toBeLessThanOrEqual(2);
    expect(Math.abs(geometry.heights[0] - geometry.heights[1])).toBeLessThanOrEqual(2);
  });

  test("sort, direction, view and Choose Stats are URL state", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await openWorkbench(page, "/showcase");
    await page.getByRole("combobox", { name: "Sort by" }).selectOption("pts");
    await expect(page).toHaveURL(/sort=pts/);
    await expect(page.locator(".sc-banner-title")).toHaveText("PTS Leaders");
    await expect(page.locator(".sc-card").first().locator(".sc-stat-label").first()).toHaveText("PTS");

    await page.getByRole("button", { name: "Choose Stats" }).click();
    const dialog = page.getByRole("dialog", { name: "Choose Stats" });
    await dialog.getByText("REB", { exact: true }).click();
    await dialog.getByRole("button", { name: "Save Changes" }).click();
    await expect(page).toHaveURL(/stats=/);
    await expect(page.locator(".sc-card").first().locator(".sc-stat-label")).toContainText(["REB"]);

    await page.getByRole("radio", { name: "List" }).click();
    await expect(page).toHaveURL(/view=list/);
    await expect(page.locator(".sc-list-table tbody tr")).toHaveCount(2);
    await expect(page.locator(".sc-list-table thead th").first()).toHaveText("#");
  });

  test("a card opens the player's career dialog and Escape closes it", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await openWorkbench(page, "/showcase");
    const first = page.locator(".sc-card").first();
    const name = (await first.locator(".sc-name").innerText()).trim();
    await first.click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toContainText(name);
    await expect(dialog.getByRole("link", { name: "Open Player Dashboard" })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
  });

  test("the slideshow starts and pauses; the timeline lights the season shown", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await openWorkbench(page, "/showcase");
    await expect(page.getByRole("button", { name: "2025-26", exact: true })).toHaveAttribute("aria-pressed", "true");
    await page.getByRole("button", { name: "Play Slideshow" }).click();
    await expect(page.getByRole("button", { name: "Pause Slideshow" })).toBeVisible();
    await page.getByRole("button", { name: "Pause Slideshow" }).click();
    await expect(page.getByRole("button", { name: "Play Slideshow" })).toBeVisible();
    await page.getByRole("button", { name: "How the slideshow works" }).click();
    await expect(page.getByRole("dialog", { name: "Slideshow" })).toContainText("wraps to 2025-26");
  });

  test("Space plays and pauses the slideshow unless a control has focus", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await openWorkbench(page, "/showcase");
    await page.locator("body").press(" ");
    await expect(page.getByRole("button", { name: "Pause Slideshow" })).toBeVisible();
    await page.locator("body").press(" ");
    await expect(page.getByRole("button", { name: "Play Slideshow" })).toBeVisible();
    // A focused search box keeps Space for typing.
    await page.getByLabel("Find player").focus();
    await page.keyboard.press(" ");
    await expect(page.getByRole("button", { name: "Play Slideshow" })).toBeVisible();
  });

  test("cards added from the dialog fill the compare tray and Z opens Compare for that season", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await openWorkbench(page, "/showcase");
    const cards = page.locator(".sc-card");
    for (const index of [0, 1]) {
      await cards.nth(index).click();
      await page.getByRole("dialog").getByRole("button", { name: /^Add to Compare/ }).click();
      await page.keyboard.press("Escape");
      await expect(page.getByRole("dialog")).toHaveCount(0);
    }
    await expect(page.locator(".sc-card[data-compared]")).toHaveCount(2);
    const tray = page.getByRole("region", { name: "Comparison selection tray" });
    await expect(tray).toContainText("Compare (2)");
    // The tray never covers the last cards.
    const [trayTop, lastBottom] = await page.evaluate(() => {
      window.scrollTo(0, document.documentElement.scrollHeight);
      const cardsList = document.querySelectorAll(".sc-card");
      return [document.querySelector(".compare-tray")!.getBoundingClientRect().top, cardsList[cardsList.length - 1].getBoundingClientRect().bottom];
    });
    expect(lastBottom).toBeLessThanOrEqual(trayTop);
    await page.locator("body").press("z");
    await expect(page).toHaveURL(/\/compare\?.*season=2025-26.*playerA=.*playerB=/);
  });

  test("phone: consoles stack, two cards a row and no sideways scroll", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await openWorkbench(page, "/showcase");
    await expect(page.locator(".sc-card")).toHaveCount(2);
    const [a, b] = await page.locator(".sc-card").evaluateAll(cards => cards.map(card => card.getBoundingClientRect().top));
    expect(Math.abs(a - b)).toBeLessThanOrEqual(1);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });
});
