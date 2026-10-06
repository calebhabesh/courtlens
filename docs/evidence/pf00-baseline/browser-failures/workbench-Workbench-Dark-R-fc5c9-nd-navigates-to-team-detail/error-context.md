# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: workbench.spec.ts >> Workbench Dark Research Interface >> team research lists cohorts and navigates to team detail
- Location: e2e/workbench.spec.ts:63:7

# Error details

```
Error: expect(locator).toContainText(expected) failed

Locator: locator('h1.player-identity-name')
Expected substring: "Toronto Raptors"
Timeout: 5000ms
Error: element(s) not found

Call log:
  - Expect "toContainText" locator('h1.player-identity-name') with timeout 5000ms
  - waiting for locator('h1.player-identity-name')
    - waiting for "http://localhost:3151/teams" navigation to finish...
    - navigated to "http://localhost:3151/teams"

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
  - text: Season
  - combobox "Filter by season":
    - option "2026-27 (Current)"
    - option "2025-26"
    - option "2024-25"
    - option "2023-24" [selected]
  - text: Phase
  - combobox "Filter by competition phase":
    - option "Regular Season" [selected]
    - option "Playoffs"
    - option "Preseason"
  - text: Before Cutoff (America/NY)
  - textbox "Before date cutoff": 2026-06-30
  - text: Window
  - combobox "Analysis window":
    - option "Season-to-date" [selected]
    - option "Last 10 Games"
    - option "Last 5 Games"
  - text: "Strictly prior to 2026-06-30 Sample: 2 games"
  - heading "Team Explorer" [level=1]
  - paragraph: Verified franchise standings, Dean Oliver Four Factors, offensive/defensive ratings, and pace distributions across 2023-24 regular season.
  - group "View mode":
    - button "Standings Table"
    - button "Franchise Cards"
    - button "Pace & Efficiency Plot"
  - group "Grouping mode":
    - button "League Overall"
    - button "Conferences"
    - button "Divisions"
  - searchbox "Search franchise (e.g. BOS, Celtics)..."
  - link "Compare Teams ⇄":
    - /url: /team-compare
  - text: "METRIC SET:"
  - button "Standings & Scoring"
  - button "Offensive Four Factors"
  - button "Defensive Four Factors"
  - button "Ratings, Tempo & Factors"
  - strong: "Official standings notice:"
  - text: Ties in record ordering do not establish official conference placement. Standings are presented by win percentage without tiebreaker resolution.
  - heading "All Teams (30)" [level=2]
  - text: 2 teams
  - table "All Teams (30) table":
    - rowgroup:
      - row "# Franchise W-L Win% ▼ PPG Opp PPG Net Diff FG% Opp FG% 3P% FT% eFG% Actions":
        - columnheader "#"
        - columnheader "Franchise"
        - columnheader "W-L"
        - columnheader "Win% ▼"
        - columnheader "PPG"
        - columnheader "Opp PPG"
        - columnheader "Net Diff"
        - columnheader "FG%"
        - columnheader "Opp FG%"
        - columnheader "3P%"
        - columnheader "FT%"
        - columnheader "eFG%"
        - columnheader "Actions"
    - rowgroup:
      - row "1 BOS Boston Celtics 55-17 0.764 118.9 108.5 +10.4 — — — — — Compare Profile →":
        - cell "1"
        - cell "BOS Boston Celtics":
          - text: BOS
          - link "Boston Celtics":
            - /url: /teams/200?season=2023-24&phase=regular_season&beforeDate=2026-06-30
        - cell "55-17"
        - cell "0.764"
        - cell "118.9"
        - cell "108.5"
        - cell "+10.4"
        - cell "—"
        - cell "—"
        - cell "—"
        - cell "—"
        - cell "—"
        - cell "Compare Profile →":
          - link "Compare":
            - /url: /team-compare?teamA=200&season=2023-24&phase=regular_season&beforeDate=2026-06-30
          - link "Profile →":
            - /url: /teams/200?season=2023-24&phase=regular_season&beforeDate=2026-06-30
      - row "2 TOR Toronto Raptors 45-27 0.625 115.4 110.2 +5.2 — — — — — Compare Profile →":
        - cell "2"
        - cell "TOR Toronto Raptors":
          - text: TOR
          - link "Toronto Raptors":
            - /url: /teams/100?season=2023-24&phase=regular_season&beforeDate=2026-06-30
        - cell "45-27"
        - cell "0.625"
        - cell "115.4"
        - cell "110.2"
        - cell "+5.2"
        - cell "—"
        - cell "—"
        - cell "—"
        - cell "—"
        - cell "—"
        - cell "Compare Profile →":
          - link "Compare":
            - /url: /team-compare?teamA=100&season=2023-24&phase=regular_season&beforeDate=2026-06-30
          - link "Profile →":
            - /url: /teams/100?season=2023-24&phase=regular_season&beforeDate=2026-06-30
- alert
```

# Test source

```ts
  1   | import { expect, test } from "@playwright/test";
  2   | import { openWorkbench } from "./workbench-navigation";
  3   | 
  4   | test.describe("Workbench Dark Research Interface", () => {
  5   |   test("home opens Stats with dark theme, horizontal navigation, context and data", async ({ page }) => {
  6   |     await openWorkbench(page);
  7   |     await expect(page).toHaveURL(/\/stats$/);
  8   |     await expect(page.getByRole("banner").getByRole("link", { name: "CourtLoad Research Workbench home" })).toContainText("COURTLOAD");
  9   |     const navigation = page.getByRole("navigation", { name: "Workspace Navigation" });
  10  |     await expect(navigation.getByRole("link", { name: "Stats", exact: true })).toBeVisible();
  11  |     for (const name of ["Players", "Teams", "Compare", "Research", "Help"]) {
  12  |       await navigation.getByRole("button", { name, exact: true }).click();
  13  |       await expect(navigation.getByRole("button", { name, exact: true })).toHaveAttribute("aria-expanded", "true");
  14  |       await page.keyboard.press("Escape");
  15  |       await expect(navigation.getByRole("button", { name, exact: true })).toHaveAttribute("aria-expanded", "false");
  16  |     }
  17  |     await expect(page.getByRole("banner").getByRole("link", { name: "Data status" })).toBeVisible();
  18  |     await expect(page.getByRole("banner").getByRole("link", { name: "Settings" })).toBeVisible();
  19  |     await expect(page.getByLabel("Filter by season")).toHaveValue("2025-26");
  20  |     await expect(page.getByRole("heading", { name: "Stats Explorer" })).toBeVisible();
  21  |     await expect(page.getByText("Fixture Star", { exact: true })).toBeVisible();
  22  |     await expect(page.getByText("Fixture Guard", { exact: true })).toBeVisible();
  23  |   });
  24  | 
  25  |   test("player explorer allows filtering and links to detail view", async ({ page }) => {
  26  |     await page.goto("/players");
  27  | 
  28  |     await expect(page.locator("h1.page-title")).toHaveText("Player Explorer");
  29  |     await expect(page.getByRole("button", { name: "Fixture Star", exact: true })).toBeVisible();
  30  | 
  31  |     // Filter by name
  32  |     const searchInput = page.getByLabel("Filter players by name");
  33  |     await searchInput.fill("Guard");
  34  |     await searchInput.press("Enter");
  35  |     await expect(page).toHaveURL(/name=Guard/);
  36  | 
  37  |     await expect(page.getByRole("button", { name: "Fixture Guard", exact: true })).toBeVisible();
  38  | 
  39  |     // Navigate to player detail
  40  |     await page.getByRole("button", { name: "Open details for Fixture Guard" }).click();
  41  |     await page.getByRole("link", { name: "View Full Profile →" }).click();
  42  |     await page.waitForURL("**/players/24**");
  43  |     await expect(page.locator("h1.player-identity-name")).toContainText("Fixture Guard");
  44  |   });
  45  | 
  46  |   test("player detail presents profile summaries, game logs, and lineage trigger", async ({ page }) => {
  47  |     await page.goto("/players/23");
  48  | 
  49  |     await expect(page.locator("h1.player-identity-name")).toContainText("Fixture Star");
  50  |     await expect(page.getByText("Toronto Raptors").first()).toBeVisible();
  51  | 
  52  |     // Verify summaries tabs or panels
  53  |     await expect(page.getByText("Prior Appearance Game Log")).toBeVisible();
  54  |     await expect(page.locator("td.font-mono:has-text('2026-04-12')")).toBeVisible();
  55  | 
  56  |     // Verify lineage drawer button exists and opens drawer
  57  |     const lineageButton = page.locator("button:has-text('Lineage')").first();
  58  |     await expect(lineageButton).toBeVisible();
  59  |     await lineageButton.click();
  60  |     await expect(page.getByText("Source Lineage")).toBeVisible();
  61  |   });
  62  | 
  63  |   test("team research lists cohorts and navigates to team detail", async ({ page }) => {
  64  |     await page.goto("/teams");
  65  | 
  66  |     await expect(page.locator("h1.page-title")).toHaveText("Team Explorer");
  67  |     await expect(page.getByText("Toronto Raptors")).toBeVisible();
  68  |     await expect(page.getByText("Boston Celtics")).toBeVisible();
  69  | 
  70  |     // Standings notice
  71  |     await expect(page.getByText("Official standings notice:")).toBeVisible();
  72  | 
  73  |     // Navigate to team detail
  74  |     await page.locator("a[href*='/teams/100']").first().click();
  75  |     await page.waitForURL("**/teams/100**");
> 76  |     await expect(page.locator("h1.player-identity-name")).toContainText("Toronto Raptors");
      |                                                           ^ Error: expect(locator).toContainText(expected) failed
  77  |   });
  78  | 
  79  |   test("comparison view displays head-to-head metrics without declaring forced winners", async ({ page }) => {
  80  |     await page.goto("/compare?playerA=23&playerB=24");
  81  | 
  82  |     await expect(page.locator("h1.page-title")).toHaveText("Compare Players");
  83  |     await expect(page.getByRole("link", { name: "Fixture Star" })).toBeVisible();
  84  |     await expect(page.getByRole("link", { name: "Fixture Guard" })).toBeVisible();
  85  | 
  86  |     // Verify no winner banner or decision badge exists
  87  |     await expect(page.getByText(/^Winner:/)).not.toBeVisible();
  88  |     await expect(page.getByText("Better Player:")).not.toBeVisible();
  89  |   });
  90  | 
  91  |   test("forecasts view displays active policy, promotion decision, gates, and prespecified slices", async ({ page }) => {
  92  |     await page.goto("/forecasts");
  93  | 
  94  |     await expect(page.locator("h1.page-title")).toHaveText("Points Forecasts & Protocol");
  95  |     await expect(page.locator("main").getByRole("heading", { name: "Active Forecast Policy" })).toBeVisible();
  96  |     await expect(page.locator(".panel-header .badge:has-text('points-v1-prior_blend')")).toBeVisible();
  97  | 
  98  |     // Verify promotion decision banner and gates
  99  |     await expect(page.getByText("Promotion Decision:")).toBeVisible();
  100 |     await expect(page.getByText("DO_NOT_PROMOTE")).toBeVisible();
  101 |     await expect(page.getByText("Gate 1: Validation Improvement >= 5%")).toBeVisible();
  102 |     await expect(page.getByText("Gate 2: Final Paired Superiority")).toBeVisible();
  103 | 
  104 |     // Verify holdout performance table
  105 |     await expect(page.getByText("Out-of-Time Performance on Holdout Block F")).toBeVisible();
  106 |     await expect(page.locator("strong.font-mono:has-text('prior_blend')").first()).toBeVisible();
  107 |     await expect(page.locator("strong.font-mono:has-text('player_only')").first()).toBeVisible();
  108 | 
  109 |     // Verify slices table
  110 |     await expect(page.getByText("Prespecified Out-of-Time Error Slices")).toBeVisible();
  111 |     await expect(page.getByText("Schedule Rest").first()).toBeVisible();
  112 | 
  113 |     // Verify prospective issuance status and ledger table
  114 |     await expect(page.getByText("Genuine Prospective Issuance Status")).toBeVisible();
  115 |     await expect(page.getByText("Awaiting 2026-27 Tipoff")).toBeVisible();
  116 |     await expect(page.getByText("Prospective Forecasts Ledger")).toBeVisible();
  117 |     await expect(page.getByRole("link", { name: "Fixture Star" })).toBeVisible();
  118 |   });
  119 | 
  120 |   test("dense dark research layout fits a 375px mobile viewport without horizontal overflow", async ({ page }) => {
  121 |     await page.setViewportSize({ width: 375, height: 667 });
  122 |     await page.goto("/");
  123 | 
  124 |     const dimensions = await page.evaluate(() => ({
  125 |       scroll: document.documentElement.scrollWidth,
  126 |       client: document.documentElement.clientWidth
  127 |     }));
  128 | 
  129 |     expect(dimensions.scroll).toBe(dimensions.client);
  130 |   });
  131 | 
  132 |   test("Ask drawer offers manual research and links to optional configuration", async ({ page }) => {
  133 |     await openWorkbench(page);
  134 |     await page.getByRole("button", { name: "Ask", exact: true }).click();
  135 |     const dialog = page.getByRole("dialog", { name: "Research conversation" });
  136 |     await expect(dialog.getByRole("heading", { name: "Ask CourtLoad" })).toBeVisible();
  137 |     await expect(dialog.getByLabel("Research operation", { exact: true })).toBeVisible();
  138 |     const textarea = dialog.getByLabel("Research question (optional label)", { exact: true });
  139 |     await textarea.fill("Compare Scottie Barnes and RJ Barrett");
  140 |     await expect(dialog.getByText("37 / 2000", { exact: true })).toBeVisible();
  141 |     await page.keyboard.press("Escape");
  142 |     await expect(dialog).not.toBeVisible();
  143 |     await page.goto("/settings");
  144 |     await expect(page.getByRole("heading", { name: "Optional AI Assistant (Gemini Adapter)" })).toBeVisible();
  145 |     await expect(page.getByText("Disabled; manual research available", { exact: true }).filter({ visible: true })).toBeVisible();
  146 |   });
  147 | });
  148 | 
```