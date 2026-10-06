# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: workbench.spec.ts >> Workbench Dark Research Interface >> player explorer allows filtering and links to detail view
- Location: e2e/workbench.spec.ts:25:7

# Error details

```
Test timeout of 30000ms exceeded.
```

```
Error: locator.click: Test timeout of 30000ms exceeded.
Call log:
  - waiting for getByRole('link', { name: 'View Full Profile →' })
    - locator resolved to <a class="button button-primary" href="/players/24?season=2025-26&phase=regular_season&beforeDate=2026-06-30&window=season&releaseId=5bbb6035-6794-4bb0-b894-7208f52ef7ad">View Full Profile →</a>
  - attempting click action
    2 × waiting for element to be visible, enabled and stable
      - element is not stable
    - retrying click action
    - waiting 20ms
    - waiting for element to be visible, enabled and stable
    - element is not stable
  2 × retrying click action
      - waiting 100ms
      - waiting for element to be visible, enabled and stable
      - element is visible, enabled and stable
      - scrolling into view if needed
      - done scrolling
      - <div title="Fixture Guard" class="player-portrait-fallback " aria-label="Fixture Guard portrait placeholder">FG</div> from <div class="stats-drawer-header">…</div> subtree intercepts pointer events
  - retrying click action
    - waiting 500ms
  - element was detached from the DOM, retrying

```

# Page snapshot

```yaml
- generic [active] [ref=f1e1]:
  - link "Skip to content" [ref=f1e2] [cursor=pointer]:
    - /url: "#content"
  - generic [ref=f1e3]:
    - banner [ref=f1e4]:
      - generic [ref=f1e5]:
        - generic [ref=f1e6]:
          - link "CourtLoad Research Workbench home" [ref=f1e7] [cursor=pointer]:
            - /url: /
            - generic [ref=f1e14]:
              - generic [ref=f1e15]: COURTLOAD
              - generic [ref=f1e16]: Replica Workbench
          - navigation "Primary Quick Switch" [ref=f1e17]:
            - link "Stats" [ref=f1e18] [cursor=pointer]:
              - /url: /stats
            - generic [aria-hidden] [ref=f1e19]: ·
            - link "Games" [ref=f1e20] [cursor=pointer]:
              - /url: /live
        - generic [ref=f1e21]:
          - search [ref=f1e22]:
            - generic [ref=f1e23]:
              - generic [aria-hidden]: 🔍
              - combobox "Search players, teams and pages" [ref=f1e24]
              - generic [aria-hidden]: /
          - status [ref=f1e25]
        - generic [ref=f1e26]:
          - button "Ask" [ref=f1e27]
          - link "Data status" [ref=f1e28] [cursor=pointer]:
            - /url: /data-status
          - link "Settings" [ref=f1e29] [cursor=pointer]:
            - /url: /settings
      - navigation "Workspace Navigation" [ref=f1e30]:
        - generic [ref=f1e31]:
          - link "Stats" [ref=f1e32] [cursor=pointer]:
            - /url: /stats
          - link "WOWY" [ref=f1e33] [cursor=pointer]:
            - /url: /wowy
          - button "Live" [ref=f1e35] [cursor=pointer]:
            - generic [aria-hidden] [ref=f1e37]: ▼
          - button "Players" [ref=f1e39] [cursor=pointer]:
            - generic [aria-hidden] [ref=f1e41]: ▼
          - button "Teams" [ref=f1e43] [cursor=pointer]:
            - generic [aria-hidden] [ref=f1e45]: ▼
          - button "Compare" [ref=f1e47] [cursor=pointer]:
            - generic [aria-hidden] [ref=f1e49]: ▼
          - button "Research" [ref=f1e51] [cursor=pointer]:
            - generic [aria-hidden] [ref=f1e53]: ▼
        - button "Help" [ref=f1e56] [cursor=pointer]:
          - generic [aria-hidden] [ref=f1e58]: ▼
    - main [ref=f1e59]:
      - generic "Research context controls" [ref=f1e60]:
        - generic [ref=f1e61]:
          - generic [ref=f1e62]:
            - generic [ref=f1e63]: Season
            - combobox "Filter by season" [ref=f1e64]:
              - option "2026-27 (Current)"
              - option "2025-26" [selected]
              - option "2024-25"
              - option "2023-24"
          - generic [ref=f1e65]:
            - generic [ref=f1e66]: Phase
            - combobox "Filter by competition phase" [ref=f1e67]:
              - option "Regular Season" [selected]
              - option "Playoffs"
              - option "Preseason"
          - generic [ref=f1e68]:
            - generic [ref=f1e69]: Before Cutoff (America/NY)
            - textbox "Before date cutoff" [ref=f1e70]: 2026-06-30
          - generic [ref=f1e71]:
            - generic [ref=f1e72]: Window
            - combobox "Analysis window" [ref=f1e73]:
              - option "Season-to-date" [selected]
              - option "Last 10 Games"
              - option "Last 5 Games"
        - generic [ref=f1e74]:
          - 'generic "Temporal discipline: game_date < cutoff" [ref=f1e75]': Strictly prior to 2026-06-30
          - generic [ref=f1e76]: "Last game: 2026-04-14"
          - generic [ref=f1e77]: "Sample: 1 games"
      - generic [ref=f1e78]:
        - generic [ref=f1e80]:
          - heading "Player Explorer" [level=1] [ref=f1e81]
          - paragraph [ref=f1e82]: Browse, filter, and compare production metrics without required search inputs. Single-formula definitions from metric catalog v1.
        - generic [ref=f1e83]:
          - generic [ref=f1e84]:
            - tablist "Stats Explorer Presets" [ref=f1e85]:
              - tab "Overview" [selected] [ref=f1e86] [cursor=pointer]
              - tab "Shooting" [ref=f1e88] [cursor=pointer]
              - tab "Defense" [ref=f1e90] [cursor=pointer]
              - tab "True Shooting" [ref=f1e92] [cursor=pointer]
              - tab "Rates (Per 36)" [ref=f1e94] [cursor=pointer]
              - tab "Playmaking" [ref=f1e96] [cursor=pointer]
              - tab "Rebounding" [ref=f1e98] [cursor=pointer]
              - tab "Impact 🔒 B25–B26" [ref=f1e100] [cursor=pointer]:
                - generic [ref=f1e101]: Impact
                - generic [ref=f1e102]: 🔒 B25–B26
              - tab "On-Off 🔒 B20–B21" [ref=f1e103] [cursor=pointer]:
                - generic [ref=f1e104]: On-Off
                - generic [ref=f1e105]: 🔒 B20–B21
              - tab "Six Factor 🔒 B20, B26" [ref=f1e106] [cursor=pointer]:
                - generic [ref=f1e107]: Six Factor
                - generic [ref=f1e108]: 🔒 B20, B26
            - button "⚙ Manage Views" [ref=f1e110] [cursor=pointer]
          - generic [ref=f1e111]:
            - group "Counting Mode" [ref=f1e112]:
              - generic [ref=f1e113]: "Mode:"
              - button "Per Game" [ref=f1e114] [cursor=pointer]
              - button "Totals" [ref=f1e115] [cursor=pointer]
              - button "Per 36" [ref=f1e116] [cursor=pointer]
              - button "Per 75 Gated by B19/B20" [ref=f1e117] [cursor=pointer]:
                - text: Per 75
                - generic "Gated by B19/B20" [ref=f1e118]
              - button "Per 100 Gated by B19/B20" [ref=f1e119] [cursor=pointer]:
                - text: Per 100
                - generic "Gated by B19/B20" [ref=f1e120]
            - group "Identity Presentation" [ref=f1e121]:
              - generic [ref=f1e122]: "Show:"
              - button "Photos" [ref=f1e123] [cursor=pointer]
              - button "Logos" [ref=f1e124] [cursor=pointer]
              - button "Initials" [ref=f1e125] [cursor=pointer]
              - button "None" [ref=f1e126] [cursor=pointer]
            - group "Table Layout and Density" [ref=f1e127]:
              - button "Standard Density" [ref=f1e128] [cursor=pointer]
              - button "Expand Table (T)" [ref=f1e129] [cursor=pointer]
              - button "%iles On" [ref=f1e130] [cursor=pointer]
            - group "Explorer View Mode" [ref=f1e131]:
              - generic [ref=f1e132]: "View:"
              - button "☷ Table" [ref=f1e133] [cursor=pointer]
              - button "⤢ Scatter Plot" [ref=f1e134] [cursor=pointer]
              - button "📈 Trend Lines" [ref=f1e135] [cursor=pointer]
            - generic [ref=f1e136]:
              - button "? Hotkeys" [ref=f1e137] [cursor=pointer]
              - button "💾 Save" [ref=f1e138] [cursor=pointer]
          - generic [ref=f1e139]:
            - generic [ref=f1e140]:
              - generic [ref=f1e141]: Player search
              - generic [ref=f1e142]:
                - textbox "Filter players by name" [ref=f1e143]:
                  - /placeholder: Search table (e.g. Luka, Siakam)...
                  - text: Guard
                - button "Clear player search" [ref=f1e144] [cursor=pointer]: ✕
            - generic [ref=f1e145]:
              - generic [ref=f1e146]: Team
              - combobox "Filter by NBA team" [ref=f1e147]:
                - option "All Teams (30)" [selected]
                - option "ATL — Atlanta Hawks"
                - option "BOS — Boston Celtics"
                - option "BKN — Brooklyn Nets"
                - option "CHA — Charlotte Hornets"
                - option "CHI — Chicago Bulls"
                - option "CLE — Cleveland Cavaliers"
                - option "DAL — Dallas Mavericks"
                - option "DEN — Denver Nuggets"
                - option "DET — Detroit Pistons"
                - option "GSW — Golden State Warriors"
                - option "HOU — Houston Rockets"
                - option "IND — Indiana Pacers"
                - option "LAC — LA Clippers"
                - option "LAL — Los Angeles Lakers"
                - option "MEM — Memphis Grizzlies"
                - option "MIA — Miami Heat"
                - option "MIL — Milwaukee Bucks"
                - option "MIN — Minnesota Timberwolves"
                - option "NOP — New Orleans Pelicans"
                - option "NYK — New York Knicks"
                - option "OKC — Oklahoma City Thunder"
                - option "ORL — Orlando Magic"
                - option "PHI — Philadelphia 76ers"
                - option "PHX — Phoenix Suns"
                - option "POR — Portland Trail Blazers"
                - option "SAC — Sacramento Kings"
                - option "SAS — San Antonio Spurs"
                - option "TOR — Toronto Raptors"
                - option "UTA — Utah Jazz"
                - option "WAS — Washington Wizards"
            - generic [ref=f1e148]:
              - generic [ref=f1e149]: Min GP
              - spinbutton "Minimum games played" [ref=f1e150]
            - generic [ref=f1e151]:
              - generic [ref=f1e152]: Min MPG
              - spinbutton "Minimum minutes per game" [ref=f1e153]
            - generic [ref=f1e154]:
              - generic [ref=f1e155]: Sort By
              - combobox "Sort table by metric" [ref=f1e156]:
                - option "GP (Participation)" [selected]
                - option "MIN (Participation)"
                - option "MPG (Participation)"
                - option "PTS (Scoring)"
                - option "REB (Rebounding)"
                - option "AST (Playmaking)"
                - option "STL (Defense)"
                - option "BLK (Defense)"
                - option "FG% (Efficiency)"
                - option "3P% (Efficiency)"
                - option "FT% (Efficiency)"
                - option "TS% (Efficiency)"
                - option "eFG% (Efficiency)"
            - generic [ref=f1e157]:
              - generic [ref=f1e158]: Rows
              - combobox "Results per page" [ref=f1e159]:
                - option "25 rows"
                - option "50 rows" [selected]
                - option "100 rows"
            - button "☆ Favorites" [ref=f1e160] [cursor=pointer]:
              - generic [ref=f1e161]: ☆
              - generic [ref=f1e162]: Favorites
            - button "Reset Filters" [ref=f1e163] [cursor=pointer]
          - generic [ref=f1e164]:
            - generic [ref=f1e165]:
              - text: Showing 1 of 1 eligible players · Sorted by
              - strong [ref=f1e166]: PTS
              - text: (DESC)
            - generic [ref=f1e167]: Click column headers to sort · Click player row to view profile
          - table "Dense player statistics explorer" [ref=f1e169]:
            - rowgroup [ref=f1e170]:
              - row [ref=f1e171]:
                - columnheader "Player Identity" [ref=f1e172]
                - columnheader "Participation" [ref=f1e173]
                - columnheader "Scoring" [ref=f1e174]
                - columnheader "Rebounding" [ref=f1e175]
                - columnheader "Playmaking" [ref=f1e176]
                - columnheader "Defense" [ref=f1e177]
                - columnheader "Efficiency" [ref=f1e178]
                - columnheader "Actions" [ref=f1e179]
              - row [ref=f1e180]:
                - columnheader "✓" [ref=f1e181]
                - columnheader "#" [ref=f1e182]
                - columnheader "Player" [ref=f1e183] [cursor=pointer]
                - columnheader "Team" [ref=f1e184]
                - columnheader "GP" [ref=f1e185] [cursor=pointer]
                - columnheader "MIN" [ref=f1e188] [cursor=pointer]
                - columnheader "MPG" [ref=f1e191] [cursor=pointer]
                - columnheader "PTS" [ref=f1e194] [cursor=pointer]
                - columnheader "REB" [ref=f1e197] [cursor=pointer]
                - columnheader "AST" [ref=f1e200] [cursor=pointer]
                - columnheader "STL" [ref=f1e203] [cursor=pointer]
                - columnheader "BLK" [ref=f1e206] [cursor=pointer]
                - columnheader "FG%" [ref=f1e209] [cursor=pointer]
                - columnheader "3P%" [ref=f1e212] [cursor=pointer]
                - columnheader "FT%" [ref=f1e215] [cursor=pointer]
                - columnheader "TS%" [ref=f1e218] [cursor=pointer]
                - columnheader "eFG%" [ref=f1e221] [cursor=pointer]
                - columnheader "Detail" [ref=f1e224]
            - rowgroup [ref=f1e225]:
              - row [ref=f1e226]:
                - cell [ref=f1e227]:
                  - checkbox "Select Fixture Guard for comparison" [ref=f1e228] [cursor=pointer]
                - cell "1" [ref=f1e229]
                - cell [ref=f1e230]:
                  - generic [ref=f1e231]:
                    - img "Fixture Guard portrait" [ref=f1e232]
                    - button "Add Fixture Guard to favorites" [ref=f1e233] [cursor=pointer]: ☆
                    - button "Fixture Guard" [ref=f1e234]
                - cell "BOS" [ref=f1e235]
                - cell "68" [ref=f1e236]
                - cell "2,278" [ref=f1e239]
                - cell "35.7" [ref=f1e242]
                - cell "22.0" [ref=f1e245]
                - cell "8.0" [ref=f1e248]
                - cell "7.0" [ref=f1e251]
                - cell "1.0" [ref=f1e254]
                - cell "0.5" [ref=f1e257]
                - cell "50.0%" [ref=f1e260]
                - cell "35.0%" [ref=f1e263]
                - cell "84.0%" [ref=f1e266]
                - cell "—" [ref=f1e269]
                - cell "—" [ref=f1e272]
                - cell [ref=f1e275]:
                  - button "Open details for Fixture Guard" [ref=f1e276] [cursor=pointer]: ⌕
          - generic [ref=f1e277]:
            - button "← First Page" [disabled] [ref=f1e279] [cursor=pointer]
            - generic [ref=f1e280]: "Keyboard: T expand width · W/E density · C compare row · Z compare · ? hotkeys"
  - button "Open Next.js Dev Tools" [ref=f1e286] [cursor=pointer]
  - alert [ref=f1e290]
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
> 41  |     await page.getByRole("link", { name: "View Full Profile →" }).click();
      |                                                                   ^ Error: locator.click: Test timeout of 30000ms exceeded.
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
  76  |     await expect(page.locator("h1.player-identity-name")).toContainText("Toronto Raptors");
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
```