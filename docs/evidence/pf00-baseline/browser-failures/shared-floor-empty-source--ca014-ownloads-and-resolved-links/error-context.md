# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: shared-floor.spec.ts >> empty source preserves unknown values, exact downloads and resolved links
- Location: e2e/shared-floor.spec.ts:24:5

# Error details

```
Test timeout of 30000ms exceeded.
```

```
Error: locator.click: Test timeout of 30000ms exceeded.
Call log:
  - waiting for getByRole('button', { name: 'Pin for comparison' })
    - locator resolved to <button>Pin for comparison</button>
  - attempting click action
    - waiting for element to be visible, enabled and stable
    - element is visible, enabled and stable
    - scrolling into view if needed
    2 × waiting for "http://localhost:3151/wowy?operation=wowy&team_id=TOR&release_id=fixture-release&season=2023-24&phase=regular_season&before_date=2024-04-15&together=1627751&min_possessions=100&min_games=5" navigation to finish...
      - navigated to "http://localhost:3151/wowy?operation=wowy&team_id=TOR&release_id=fixture-release&season=2023-24&phase=regular_season&before_date=2024-04-15&together=1627751&min_possessions=100&min_games=5"

```

# Page snapshot

```yaml
- generic [active] [ref=f4e1]:
  - link "Skip to content" [ref=f4e2] [cursor=pointer]:
    - /url: "#content"
  - generic [ref=f4e3]:
    - banner [ref=f4e4]:
      - generic [ref=f4e5]:
        - generic [ref=f4e6]:
          - link "CourtLoad Research Workbench home" [ref=f4e7] [cursor=pointer]:
            - /url: /
            - generic [ref=f4e14]:
              - generic [ref=f4e15]: COURTLOAD
              - generic [ref=f4e16]: Replica Workbench
          - navigation "Primary Quick Switch" [ref=f4e17]:
            - link "Stats" [ref=f4e18] [cursor=pointer]:
              - /url: /stats?season=2023-24&phase=regular_season&before_date=2024-04-15&release_id=fixture-release
            - generic [aria-hidden] [ref=f4e19]: ·
            - link "Games" [ref=f4e20] [cursor=pointer]:
              - /url: /live?season=2023-24&phase=regular_season&before_date=2024-04-15&release_id=fixture-release
        - generic [ref=f4e21]:
          - search [ref=f4e22]:
            - generic [ref=f4e23]:
              - generic [aria-hidden]: 🔍
              - combobox "Search players, teams and pages" [ref=f4e24]
              - generic [aria-hidden]: /
          - status [ref=f4e25]
        - generic [ref=f4e26]:
          - button "Ask" [ref=f4e27]
          - link "Data status" [ref=f4e28] [cursor=pointer]:
            - /url: /data-status?season=2023-24&phase=regular_season&before_date=2024-04-15&release_id=fixture-release
          - link "Settings" [ref=f4e29] [cursor=pointer]:
            - /url: /settings?season=2023-24&phase=regular_season&before_date=2024-04-15&release_id=fixture-release
      - navigation "Workspace Navigation" [ref=f4e30]:
        - generic [ref=f4e31]:
          - link "Stats" [ref=f4e32] [cursor=pointer]:
            - /url: /stats?season=2023-24&phase=regular_season&before_date=2024-04-15&release_id=fixture-release
          - link "WOWY" [ref=f4e33] [cursor=pointer]:
            - /url: /wowy?season=2023-24&phase=regular_season&before_date=2024-04-15&release_id=fixture-release
          - button "Live" [ref=f4e35] [cursor=pointer]:
            - generic [aria-hidden] [ref=f4e37]: ▼
          - button "Players" [ref=f4e39] [cursor=pointer]:
            - generic [aria-hidden] [ref=f4e41]: ▼
          - button "Teams" [ref=f4e43] [cursor=pointer]:
            - generic [aria-hidden] [ref=f4e45]: ▼
          - button "Compare" [ref=f4e47] [cursor=pointer]:
            - generic [aria-hidden] [ref=f4e49]: ▼
          - button "Research" [ref=f4e51] [cursor=pointer]:
            - generic [aria-hidden] [ref=f4e53]: ▼
        - button "Help" [ref=f4e56] [cursor=pointer]:
          - generic [aria-hidden] [ref=f4e58]: ▼
    - main [ref=f4e59]:
      - generic [ref=f4e60]:
        - generic [ref=f4e61]:
          - generic [ref=f4e62]:
            - heading "WOWY · Shared floor" [level=1] [ref=f4e63]
            - paragraph [ref=f4e64]: Observed lineup exposure, raw rates and descriptive differences.
          - link "Teammate shifts" [ref=f4e65] [cursor=pointer]:
            - /url: /stat-line-shift
        - generic [ref=f4e66]:
          - generic [ref=f4e67]:
            - generic [ref=f4e68]:
              - text: Operation
              - combobox "Operation" [ref=f4e69]:
                - option "WOWY" [selected]
                - option "On/off"
            - generic [ref=f4e70]:
              - text: View
              - combobox "View" [ref=f4e71]:
                - option "Team sets" [selected]
                - option "Selected-player leaders (max 5)"
                - option "2–5-player unit"
            - generic [ref=f4e72]:
              - text: Team
              - combobox "Team" [ref=f4e73]:
                - option "ATL · Atlanta Hawks"
                - option "BOS · Boston Celtics"
                - option "BKN · Brooklyn Nets"
                - option "CHA · Charlotte Hornets"
                - option "CHI · Chicago Bulls"
                - option "CLE · Cleveland Cavaliers"
                - option "DAL · Dallas Mavericks"
                - option "DEN · Denver Nuggets"
                - option "DET · Detroit Pistons"
                - option "GSW · Golden State Warriors"
                - option "HOU · Houston Rockets"
                - option "IND · Indiana Pacers"
                - option "LAC · LA Clippers"
                - option "LAL · Los Angeles Lakers"
                - option "MEM · Memphis Grizzlies"
                - option "MIA · Miami Heat"
                - option "MIL · Milwaukee Bucks"
                - option "MIN · Minnesota Timberwolves"
                - option "NOP · New Orleans Pelicans"
                - option "NYK · New York Knicks"
                - option "OKC · Oklahoma City Thunder"
                - option "ORL · Orlando Magic"
                - option "PHI · Philadelphia 76ers"
                - option "PHX · Phoenix Suns"
                - option "POR · Portland Trail Blazers"
                - option "SAC · Sacramento Kings"
                - option "SAS · San Antonio Spurs"
                - option "TOR · Toronto Raptors" [selected]
                - option "UTA · Utah Jazz"
                - option "WAS · Washington Wizards"
            - generic [ref=f4e74]:
              - text: Season
              - textbox "Season" [ref=f4e75]:
                - /placeholder: Published default
                - text: 2023-24
            - generic [ref=f4e76]:
              - text: Phase
              - combobox "Phase" [ref=f4e77]:
                - option "Published default"
                - option "Regular season" [selected]
                - option "Playoffs"
                - option "Preseason"
                - option "Play-in"
                - option "Cup final"
                - option "Summer league"
            - generic [ref=f4e78]:
              - text: Before date (exclusive)
              - textbox "Before date (exclusive)" [ref=f4e79]: 2024-04-15
            - generic [ref=f4e80]:
              - text: From date (inclusive)
              - textbox "From date (inclusive)" [ref=f4e81]
            - generic [ref=f4e82]:
              - text: Release ID
              - textbox "Release ID" [ref=f4e83]:
                - /placeholder: Published default
                - text: fixture-release
            - generic [ref=f4e84]:
              - text: Minimum possessions
              - spinbutton "Minimum possessions" [ref=f4e85]: "100"
            - generic [ref=f4e86]:
              - text: Minimum games
              - spinbutton "Minimum games" [ref=f4e87]: "5"
          - generic [ref=f4e88]:
            - generic [ref=f4e89]:
              - text: Together player IDs
              - textbox "Together player IDs" [ref=f4e90]:
                - /placeholder: Comma-separated NBA IDs
                - text: "1627751"
            - generic [ref=f4e91]:
              - text: Apart player IDs
              - textbox "Apart player IDs" [ref=f4e92]
            - generic [ref=f4e93]:
              - text: Search players
              - textbox "Search players" [ref=f4e94]:
                - /placeholder: Type a player name
            - generic [ref=f4e95]:
              - text: Add search result to
              - combobox "Add search result to" [ref=f4e96]:
                - option "Together" [selected]
                - option "Apart"
          - paragraph [ref=f4e97]: All together players must be present; all apart players must be absent. The complement means the predicate fails. A 2–4-player unit allows other teammates; five players specify the full lineup. Conditions apply to this team. Focal players stay on court in both stat-shift splits.
          - paragraph [ref=f4e98]: "Shared-floor queries use season/date bounds. Box-score last-X windows do not apply. Default gates: 100 offensive and defensive possessions and 5 games per cell. Raw estimates remain visible below gates. No shrinkage or prior is applied; no leverage filter is applied. Each query is bounded to 20,000 stints."
          - button "Run shared-floor analysis" [ref=f4e99] [cursor=pointer]
  - button "Open Next.js Dev Tools" [ref=f4e105] [cursor=pointer]
  - alert [ref=f4e109]
```

# Test source

```ts
  1   | import { expect, test } from "@playwright/test";
  2   | import { openWorkbench } from "./workbench-navigation";
  3   | import { readFileSync } from "node:fs";
  4   | const empty = JSON.parse(readFileSync("../docs/evidence/b21-api-smoke.json", "utf8")).response;
  5   | 
  6   | test.beforeEach(async ({ page }) => {
  7   |   await page.route("**/api/workbench/operations/*", async route => {
  8   |     const req = route.request().postDataJSON();
  9   |     const response = structuredClone(empty);
  10  |     response.operation = route.request().url().split("/").pop();
  11  |     response.request = { ...empty.request, ...req };
  12  |     const ids = [...req.together, ...req.apart, ...req.exact_unit];
  13  |     response.partitions = Array.from({ length: 2 ** ids.length }, (_, mask) => ({
  14  |       ...structuredClone(empty.cells[0]), key: `partition-${mask}`,
  15  |       present: ids.filter((_: string, index: number) => mask & (1 << index)),
  16  |       absent: ids.filter((_: string, index: number) => !(mask & (1 << index)))
  17  |     }));
  18  |     response.evidence_hash = `fixture-${response.operation}-${req.together?.join("-")}-${req.exact_unit?.join("-")}`;
  19  |     response.context = { ...response.context, season: req.season || "2023-24", release_id: req.release_id || "fixture-release", before_date: req.before_date || "2024-04-15" };
  20  |     await route.fulfill({ json: response });
  21  |   });
  22  | });
  23  | 
  24  | test("empty source preserves unknown values, exact downloads and resolved links", async ({ page }) => {
  25  |   await openWorkbench(page, "/wowy?team_id=TOR&together=1627751");
  26  |   await page.getByRole("button", { name: "Run shared-floor analysis" }).click();
  27  |   await expect(page.getByText("Real analytics are unavailable", { exact: false })).toBeVisible();
  28  |   await expect(page.getByText("0 / 82 finalized games reconstructed", { exact: false })).toBeVisible();
  29  |   await expect(page.locator("tbody").first()).toContainText("—");
  30  |   await expect(page).toHaveURL(/release_id=fixture-release/);
  31  |   await page.screenshot({ path: test.info().outputPath("b22-empty-desktop-fixture.png"), fullPage: true });
  32  |   const pending = page.waitForEvent("download");
  33  |   await page.getByRole("button", { name: "Save evidence JSON" }).click();
  34  |   const download = await pending;
  35  |   const file = await download.path();
  36  |   const bundle = JSON.parse(readFileSync(file!, "utf8"));
  37  |   expect(bundle.results[0].coverage_status).toBe("source_blocked");
  38  |   expect(bundle.results[0].cells[0].raw_metrics.net_rating).toBeNull();
> 39  |   await page.getByRole("button", { name: "Pin for comparison" }).click();
      |                                                                  ^ Error: locator.click: Test timeout of 30000ms exceeded.
  40  |   await page.getByLabel("Together player IDs").fill("other");
  41  |   await page.getByRole("button", { name: "Run shared-floor analysis" }).click();
  42  |   await expect(page.getByText("Pinned eligible differences", { exact: false })).toBeVisible();
  43  | });
  44  | 
  45  | test("two and five player units use the same operation with all partitions", async ({ page }) => {
  46  |   const requests: unknown[] = [];
  47  |   page.on("request", req => { if (req.url().endsWith("/operations/wowy")) requests.push(req.postDataJSON()); });
  48  |   await openWorkbench(page, "/wowy");
  49  |   await page.getByRole("combobox", { name: "View", exact: true }).selectOption("unit");
  50  |   for (const ids of ["1,2", "1,2,3,4,5"]) {
  51  |     await page.getByLabel("Unit player IDs").fill(ids);
  52  |     await page.getByRole("button", { name: "Run shared-floor analysis" }).click();
  53  |     await expect(page.getByText("Real analytics are unavailable", { exact: false })).toBeVisible();
  54  |     await expect(page.getByText(`All disjoint presence/absence partitions (${2 ** ids.split(",").length})`, { exact: true })).toBeVisible();
  55  |   }
  56  |   expect(requests).toEqual(expect.arrayContaining([expect.objectContaining({ exact_unit: ["1", "2"] }), expect.objectContaining({ exact_unit: ["1", "2", "3", "4", "5"] })]));
  57  | });
  58  | 
  59  | test("stat shifts reject focal contradictions and request per-possession production", async ({ page }) => {
  60  |   await openWorkbench(page, "/stat-line-shift");
  61  |   await page.getByLabel("Focal player ID", { exact: true }).fill("1");
  62  |   await page.getByLabel("Together player IDs").fill("1");
  63  |   await page.getByRole("button", { name: "Run shared-floor analysis" }).click();
  64  |   await expect(page.locator(".shared-floor").getByRole("alert")).toContainText("separate");
  65  |   await page.getByLabel("Together player IDs").fill("2");
  66  |   await page.getByRole("button", { name: "Run shared-floor analysis" }).click();
  67  |   await expect(page.getByRole("heading", { name: "stat-shift · TOR · 2" })).toBeVisible();
  68  | });
  69  | 
  70  | test("bounded leaders pin a resolved release across candidates", async ({ page }) => {
  71  |   const requests: Record<string, unknown>[] = [];
  72  |   page.on("request", req => { if (req.url().endsWith("/operations/on-off")) requests.push(req.postDataJSON()); });
  73  |   await openWorkbench(page, "/wowy");
  74  |   await page.getByRole("combobox", { name: "View", exact: true }).selectOption("leaders");
  75  |   await page.getByLabel("Candidate player IDs").fill("1,2,3");
  76  |   await page.getByRole("button", { name: "Run shared-floor analysis" }).click();
  77  |   await expect(page.getByRole("heading", { name: /on-off · TOR/ })).toHaveCount(3);
  78  |   expect(requests).toHaveLength(3);
  79  |   expect(requests[1].release_id).toBe("fixture-release");
  80  |   expect(requests[2].before_date).toBe("2024-04-15");
  81  | });
  82  | 
  83  | test("Stats on/off preset opens actual shared-floor operation", async ({ page }) => {
  84  |   await openWorkbench(page, "/stats?preset=onoff&together=1");
  85  |   await expect(page.getByRole("heading", { name: "Stats · On/off" })).toBeVisible();
  86  |   await page.getByRole("button", { name: "Run shared-floor analysis" }).click();
  87  |   await expect(page.getByRole("heading", { name: "on-off · TOR · 1" })).toBeVisible();
  88  | });
  89  | 
  90  | test("partial samples show raw rates and directional denominators while gating differences", async ({ page }) => {
  91  |   await page.route("**/api/workbench/operations/wowy", async route => {
  92  |     const response = structuredClone(empty);
  93  |     response.operation = "wowy";
  94  |     response.request = { ...empty.request, ...route.request().postDataJSON() };
  95  |     response.coverage_status = "partial"; response.observed_games = 3;
  96  |     response.disclosures = ["Browser acceptance fixture; not real player analytics."];
  97  |     response.cells[0] = { ...response.cells[0], games: 3, stints: 12, minutes: 40.25,
  98  |       offensive_possessions: 80.5, defensive_possessions: 79.25, points: 96, points_allowed: 89,
  99  |       sample_status: "insufficient_sample", reason: "Below possession and game gates",
  100 |       raw_metrics: { offensive_rating: 119.254658, defensive_rating: 112.302839, net_rating: 6.951819 },
  101 |       metric_denominators: { offensive_rating: 80.5, defensive_rating: 79.25 },
  102 |       metric_valid_stints: { offensive_rating: 12, defensive_rating: 12 } };
  103 |     response.shifts[0].selected_value = 119.254658;
  104 |     await route.fulfill({ json: response });
  105 |   });
  106 |   await page.setViewportSize({ width: 390, height: 844 });
  107 |   await openWorkbench(page, "/wowy?together=1&team_id=TOR");
  108 |   await page.getByRole("button", { name: "Run shared-floor analysis" }).click();
  109 |   const exposure = page.locator("table").first();
  110 |   await expect(exposure).toContainText("80.50");
  111 |   await expect(exposure).toContainText("79.25");
  112 |   await expect(exposure).toContainText("119.25");
  113 |   await expect(exposure).toContainText("insufficient_sample");
  114 |   await expect(page.locator("table").nth(1).locator("tbody tr").first()).toContainText("—");
  115 |   await expect(page.getByText("No shrinkage or prior is applied", { exact: false })).toBeVisible();
  116 |   const fits = await page.locator(".shared-floor").evaluate(el => el.getBoundingClientRect().right <= window.innerWidth);
  117 |   expect(fits).toBe(true);
  118 |   await page.screenshot({ path: test.info().outputPath("b22-partial-mobile-fixture.png"), fullPage: true });
  119 | });
  120 | 
  121 | test("query overflow is actionable and exports are unavailable after failed queries", async ({ page }) => {
  122 |   await page.route("**/api/workbench/operations/wowy", route => route.fulfill({ status: 422, json: { detail: { reason: "query_bound_exceeded", detail: "Narrow with lower/cutoff dates" } } }));
  123 |   await openWorkbench(page, "/wowy?together=1");
  124 |   await page.getByRole("button", { name: "Run shared-floor analysis" }).click();
  125 |   await expect(page.locator(".shared-floor").getByRole("alert")).toContainText("query_bound_exceeded");
  126 |   await expect(page.locator(".shared-floor").getByRole("alert")).toContainText("Narrow");
  127 |   await expect(page.getByRole("button", { name: "Save evidence JSON" })).toHaveCount(0);
  128 | });
  129 | 
```