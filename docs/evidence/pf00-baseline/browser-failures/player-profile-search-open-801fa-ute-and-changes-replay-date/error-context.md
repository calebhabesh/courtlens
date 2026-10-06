# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: player-profile.spec.ts >> search opens a snapshot-pinned real route and changes replay date
- Location: e2e/player-profile.spec.ts:3:5

# Error details

```
Error: expect(page).toHaveURL(expected) failed

Expected pattern: /date=2023-01-02/
Received string:  "http://localhost:3151/players/23?date=2023-01-10&snapshotId=snapshot-browser-fixture"
Timeout: 5000ms

Call log:
  - Expect "toHaveURL" with timeout 5000ms
    12 × locator resolved to <html lang="en" data-scroll-behavior="smooth" class="__variable_39053e __variable_21e7a0">…</html>
       - unexpected value "http://localhost:3151/players/23?date=2023-01-10&snapshotId=snapshot-browser-fixture"

```

```yaml
- link "Skip to content":
  - /url: "#content"
- banner:
  - link "CourtLoad Research Workbench home":
    - /url: /
    - text: COURTLOAD Replica Workbench
  - navigation "Primary Quick Switch":
    - link "Stats":
      - /url: /stats
    - link "Games":
      - /url: /live
  - search:
    - combobox "Search players, teams and pages"
  - status
  - button "Ask"
  - link "Data status":
    - /url: /data-status
  - link "Settings":
    - /url: /settings
  - navigation "Workspace Navigation":
    - link "Stats":
      - /url: /stats
    - link "WOWY":
      - /url: /wowy
    - button "Live"
    - button "Players"
    - button "Teams"
    - button "Compare"
    - button "Research"
    - button "Help"
- main:
  - paragraph: Loading CourtLoad…
```

# Test source

```ts
  1  | import { expect, test } from "@playwright/test";
  2  | 
  3  | test("search opens a snapshot-pinned real route and changes replay date", async ({ page }) => {
  4  |   await page.goto(`/players?snapshotId=${snapshotId}`);
  5  |   await page.getByLabel("Player name").fill("Fixture");
  6  |   await page.getByRole("button", { name: "Search", exact: true }).click();
  7  |   await page.getByRole("link", { name: /Fixture Star/ }).click();
  8  | 
  9  |   await expect(page).toHaveURL(/players\/23\?date=2023-01-10&snapshotId=snapshot-browser-fixture/);
  10 |   await expect(page.getByRole("heading", { name: "Fixture Star" })).toBeVisible();
  11 |   await expect(page.getByText("45.5", { exact: true }).first()).toBeVisible();
  12 | 
  13 |   await page.getByLabel("Replay date").selectOption("2023-01-02");
  14 |   await page.getByRole("button", { name: "Change date" }).click();
> 15 |   await expect(page).toHaveURL(/date=2023-01-02/);
     |                      ^ Error: expect(page).toHaveURL(expected) failed
  16 |   await expect(page.getByRole("heading", { name: "No history before this cutoff" }).first()).toBeVisible();
  17 | });
  18 | 
  19 | test("unsupported replay date keeps the input and offers recovery", async ({ page }) => {
  20 |   await page.goto(`/players/23?date=2023-01-09&snapshotId=${snapshotId}`);
  21 | 
  22 |   await expect(page.getByRole("heading", { name: "Replay date not supported" })).toBeVisible();
  23 |   await expect(page.locator("main").getByText("2023-01-09 is outside the available replay dates.")).toBeVisible();
  24 |   await expect(page.getByRole("link", { name: "Return to player search" })).toBeVisible();
  25 | });
  26 | 
  27 | const snapshotId = "snapshot-browser-fixture";
  28 | 
```