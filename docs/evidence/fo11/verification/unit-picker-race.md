# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: shared-floor.spec.ts >> two and five player units use the same operation with all partitions
- Location: e2e/shared-floor.spec.ts:57:5

# Error details

```
Test timeout of 30000ms exceeded.
```

```
Error: locator.click: Test timeout of 30000ms exceeded.
Call log:
  - waiting for getByRole('option').filter({ hasText: 'Fixture Player 2' })

```

# Page snapshot

```yaml
- generic [ref=e1]:
  - link "Skip to content" [ref=e2] [cursor=pointer]:
    - /url: "#content"
  - generic [ref=e3]:
    - banner [ref=e4]:
      - generic [ref=e5]:
        - link "CourtLens Research Workbench home" [ref=e6] [cursor=pointer]:
          - /url: /
          - img "CourtLens" [ref=e16]
        - navigation "Workspace Navigation" [ref=e18]:
          - link "Stats" [ref=e20] [cursor=pointer]:
            - /url: /stats?season=2023-24&phase=regular_season&beforeDate=2024-04-15&releaseId=fixture-release
          - button "Live" [ref=e22] [cursor=pointer]
          - button "Players" [ref=e27] [cursor=pointer]
          - button "Teams" [ref=e32] [cursor=pointer]
          - button "Compare" [ref=e37] [cursor=pointer]
          - button "Research" [ref=e42] [cursor=pointer]
      - searchbox "Search players, teams and pages" [ref=e47] [cursor=pointer]:
        - generic [ref=e51]: Search players, teams…
        - generic [ref=e52]: ⌘K
      - generic [ref=e53]:
        - button "Ask" [ref=e54] [cursor=pointer]
        - button "More options" [ref=e59] [cursor=pointer]
    - main [ref=e64]:
      - generic [ref=e66]:
        - generic [ref=e67]:
          - generic [ref=e68]:
            - heading "WOWY" [level=1] [ref=e69]
            - generic [ref=e70]:
              - link "Teammate Shifts" [ref=e71] [cursor=pointer]:
                - /url: /stat-line-shift
              - button "Export cell metrics CSV" [ref=e72] [cursor=pointer]
          - paragraph [ref=e73]: Observed lineup exposure and descriptive differences.
        - region "Research context controls" [ref=e74]:
          - generic [ref=e75]:
            - generic [ref=e76]:
              - generic [ref=e77]:
                - generic [ref=e78]: Season
                - combobox "Season" [ref=e81] [cursor=pointer]:
                  - option "Published default · 2025-26"
                  - option "2023-24 · unavailable" [selected]
                  - option "2025-26"
              - generic [ref=e82]:
                - generic [ref=e83]: Phase
                - combobox "Phase" [ref=e86] [cursor=pointer]:
                  - option "Published default · Regular season"
                  - option "Regular season" [selected]
              - generic [ref=e87]:
                - generic [ref=e88]: Through
                - 'button "Through date: Apr 14, 2024" [ref=e91] [cursor=pointer]':
                  - generic [ref=e94]: Apr 14, 2024
            - generic [ref=e95]:
              - generic [ref=e96]:
                - generic [ref=e97]: From
                - 'button "From date (inclusive): Select a date" [ref=e100] [cursor=pointer]':
                  - generic [ref=e103]: Select a date
              - generic [ref=e104]:
                - generic [ref=e105]: Minimum possessions
                - spinbutton "Minimum possessions" [ref=e107]: "100"
              - generic [ref=e108]:
                - generic [ref=e109]: Minimum games
                - spinbutton "Minimum games" [ref=e111]: "5"
          - generic [ref=e112]:
            - generic [ref=e113]:
              - generic [ref=e114]: Operation
              - combobox "Operation" [ref=e116]:
                - option "WOWY" [selected]
                - option "On/off"
            - generic [ref=e117]:
              - generic [ref=e118]: View
              - combobox "View" [ref=e120]:
                - option "Team sets"
                - option "Selected-player leaders (max 5)"
                - option "2–5-player unit" [selected]
          - button "Data details" [ref=e122] [cursor=pointer]
        - generic [ref=e128]:
          - group "Team" [ref=e130]:
            - list "Selected Team" [ref=e132]:
              - listitem [ref=e133]:
                - img "TOR" [ref=e135]
                - generic [ref=e136]:
                  - generic [ref=e137]: Toronto Raptors
                  - generic [ref=e138]: Synthetic browser fixture
                - button "Remove Toronto Raptors from Team" [ref=e139] [cursor=pointer]
            - generic [ref=e143]:
              - combobox "Team" [ref=e145]
              - status [ref=e146]
            - textbox [aria-hidden]: selected
          - group "Exact unit" [ref=e148]:
            - list "Selected Exact unit" [ref=e150]:
              - listitem [ref=e151]:
                - generic [ref=e152]:
                  - generic "Fixture Player 2 portrait placeholder" [ref=e153]: FP
                  - 'generic "Teams observed in selected scope: TOR" [ref=e154]':
                    - img "TOR" [ref=e155]
                - generic [ref=e156]:
                  - generic [ref=e157]: Fixture Player 2
                  - generic [ref=e158]: Synthetic browser fixture
                - button "Remove Fixture Player 2 from Exact unit" [ref=e159] [cursor=pointer]
              - listitem [ref=e163]:
                - generic [ref=e164]:
                  - generic "Fixture Player 1 portrait placeholder" [ref=e165]: FP
                  - 'generic "Teams observed in selected scope: TOR" [ref=e166]':
                    - img "TOR" [ref=e167]
                - generic [ref=e168]:
                  - generic [ref=e169]: Fixture Player 1
                  - generic [ref=e170]: Synthetic browser fixture
                - button "Remove Fixture Player 1 from Exact unit" [ref=e171] [cursor=pointer]
            - generic [ref=e175]:
              - generic [ref=e176]:
                - combobox "Exact unit" [expanded] [active] [ref=e177]: Fixture Player 2
                - button "Clear Exact unit" [ref=e178] [cursor=pointer]
              - status [ref=e182]: 0 suggestions. Use arrow keys to choose, then Enter.
              - generic [ref=e183]:
                - paragraph [ref=e184]: No matches for “Fixture Player 2”. Try a shorter name or another spelling.
                - listbox "Exact unit suggestions"
            - textbox [aria-hidden]: selected
        - article [ref=e185]:
          - generic [ref=e186]:
            - generic [ref=e187]:
              - generic [ref=e189]:
                - generic [ref=e190]:
                  - img "TOR" [ref=e192]
                  - generic [ref=e193]:
                    - generic [ref=e194]: Toronto Raptors
                    - generic [ref=e195]: Selected conditions
                - generic [ref=e196]:
                  - generic [ref=e197]:
                    - generic "Fixture Player 2 portrait placeholder" [ref=e198]: FP
                    - img "TOR" [ref=e200]
                  - generic [ref=e201]:
                    - generic [ref=e202]: Fixture Player 2
                    - generic [ref=e203]: TOR
                - generic [ref=e205]:
                  - generic [ref=e206]:
                    - generic "Fixture Player 1 portrait placeholder" [ref=e207]: FP
                    - img "TOR" [ref=e209]
                  - generic [ref=e210]:
                    - generic [ref=e211]: Fixture Player 1
                    - generic [ref=e212]: TOR
              - generic [ref=e215]:
                - img "TOR" [ref=e217]
                - generic [ref=e218]:
                  - generic [ref=e219]: Toronto Raptors
                  - generic [ref=e220]: Logical complement
            - generic [ref=e221]:
              - heading "WOWY · Fixture Player 2, Fixture Player 1" [level=2] [ref=e222]
              - status [ref=e223]:
                - text: "Source coverage:"
                - strong [ref=e224]: source_blocked
                - text: · 0 / 82 finalized games reconstructed
              - table "Descriptive comparison" [ref=e225]:
                - row [ref=e226]:
                  - columnheader "Metric" [ref=e227]
                  - columnheader "Selected raw" [ref=e228]
                  - columnheader "Complement raw" [ref=e229]
                - row [ref=e230]:
                  - rowheader "offensive rating" [ref=e231]
                  - cell "—" [ref=e232]
                  - cell "—" [ref=e235]
                - row [ref=e238]:
                  - rowheader "defensive rating" [ref=e239]
                  - cell "—" [ref=e240]
                  - cell "—" [ref=e243]
                - row [ref=e246]:
                  - rowheader "net rating" [ref=e247]
                  - cell "—" [ref=e248]
                  - cell "—" [ref=e251]
              - region "Exposure metrics" [ref=e254]:
                - table [ref=e255]:
                  - caption [ref=e256]: Observed exposure and raw team ratings per 100 directional possessions
                  - rowgroup [ref=e257]:
                    - row [ref=e258]:
                      - columnheader "Cell / conditions" [ref=e259]
                      - columnheader "Games" [ref=e260]
                      - columnheader "Stints" [ref=e261]
                      - columnheader "Minutes" [ref=e262]
                      - columnheader "Off. poss." [ref=e263]
                      - columnheader "Def. poss." [ref=e264]
                      - columnheader "Points" [ref=e265]
                      - columnheader "Allowed" [ref=e266]
                      - columnheader "ORTG" [ref=e267]
                      - columnheader "DRTG" [ref=e268]
                      - columnheader "NET" [ref=e269]
                      - columnheader "Sample gate" [ref=e270]
                  - rowgroup [ref=e271]:
                    - row [ref=e272]:
                      - rowheader "selected" [ref=e273]
                      - cell "0" [ref=e274]
                      - cell "0" [ref=e275]
                      - cell "0.00" [ref=e276]
                      - cell "0.00" [ref=e277]
                      - cell "0.00" [ref=e278]
                      - cell "—" [ref=e279]
                      - cell "—" [ref=e280]
                      - cell "—" [ref=e281]
                      - cell "—" [ref=e282]
                      - cell "—" [ref=e283]
                      - cell "empty Insufficient shared-floor exposure" [ref=e284]:
                        - text: empty
                        - generic [ref=e285]: Insufficient shared-floor exposure
                    - row [ref=e286]:
                      - rowheader "complement" [ref=e287]
                      - cell "0" [ref=e288]
                      - cell "0" [ref=e289]
                      - cell "0.00" [ref=e290]
                      - cell "0.00" [ref=e291]
                      - cell "0.00" [ref=e292]
                      - cell "—" [ref=e293]
                      - cell "—" [ref=e294]
                      - cell "—" [ref=e295]
                      - cell "—" [ref=e296]
                      - cell "—" [ref=e297]
                      - cell "empty Insufficient shared-floor exposure" [ref=e298]:
                        - text: empty
                        - generic [ref=e299]: Insufficient shared-floor exposure
              - table [ref=e301]:
                - caption [ref=e302]: Selected minus logical complement · descriptive differences
                - rowgroup [ref=e303]:
                  - row [ref=e304]:
                    - columnheader "Metric" [ref=e305]
                    - columnheader "Selected raw" [ref=e306]
                    - columnheader "Complement raw" [ref=e307]
                    - columnheader "Eligible difference" [ref=e308]
                    - columnheader "Approximate 95% interval / reason" [ref=e309]
                - rowgroup [ref=e310]:
                  - row [ref=e311]:
                    - rowheader "offensive_rating" [ref=e312]
                    - cell "—" [ref=e313]
                    - cell "—" [ref=e314]
                    - cell "—" [ref=e315]
                    - cell "Insufficient sample or joint interval unavailable" [ref=e316]
                  - row [ref=e317]:
                    - rowheader "defensive_rating" [ref=e318]
                    - cell "—" [ref=e319]
                    - cell "—" [ref=e320]
                    - cell "—" [ref=e321]
                    - cell "Insufficient sample or joint interval unavailable" [ref=e322]
                  - row [ref=e323]:
                    - rowheader "net_rating" [ref=e324]
                    - cell "—" [ref=e325]
                    - cell "—" [ref=e326]
                    - cell "—" [ref=e327]
                    - cell "Insufficient sample or joint interval unavailable" [ref=e328]
              - group [ref=e329]:
                - generic "All disjoint presence/absence partitions (4)" [ref=e330] [cursor=pointer]
              - group [ref=e331]:
                - generic "Metric support, event totals and uncertainty" [ref=e332] [cursor=pointer]
              - note [ref=e333]:
                - generic [ref=e334]: No admitted exposure in this scope.
                - group [ref=e338]:
                  - generic "Why?" [ref=e339] [cursor=pointer]
              - generic [ref=e340]:
                - button "Pin for comparison" [ref=e341] [cursor=pointer]
                - link "Reopen this resolved query" [ref=e342] [cursor=pointer]:
                  - /url: /wowy?operation=wowy&team_id=TOR&release_id=fixture-release&season=2023-24&phase=regular_season&before_date=2024-04-15&exact_unit=2%2C1&min_possessions=100&min_games=5
  - region "Notifications"
  - alert [ref=e343]
```

# Test source

```ts
  1   | import { expect, test } from "@playwright/test";
  2   | import { openWorkbench } from "./workbench-navigation";
  3   | import { readFileSync } from "node:fs";
  4   | const empty = JSON.parse(readFileSync("../docs/evidence/b21-api-smoke.json", "utf8")).response;
  5   |
  6   | async function pick(page: import("@playwright/test").Page, label: string, ids: string, replace = false) {
  7   |   const group=page.getByRole("group",{name:label,exact:true});
  8   |   // A resolved query changes lookup scope; wait for its selected identities before replacing.
  9   |   await expect(group.locator("..").getByRole("status").filter({hasText:/^Resolving/})).toHaveCount(0);
  10  |   if(replace) { while(await group.getByRole("button",{name:/^Remove/}).count()) await group.getByRole("button",{name:/^Remove/}).first().click(); }
  11  |   for(const id of ids.split(",")) {
  12  |     const name=id === "other" ? "Fixture Guard" : `Fixture Player ${id}`;
  13  |     await page.getByRole("combobox",{name:label,exact:true}).fill(name);
> 14  |     await page.getByRole("option").filter({hasText:name}).click();
      |                                                           ^ Error: locator.click: Test timeout of 30000ms exceeded.
  15  |   }
  16  | }
  17  |
  18  | test.beforeEach(async ({ page }) => {
  19  |   await page.route("**/api/workbench/operations/*", async route => {
  20  |     const req = route.request().postDataJSON();
  21  |     const response = structuredClone(empty);
  22  |     response.operation = route.request().url().split("/").pop();
  23  |     response.request = { ...empty.request, ...req };
  24  |     const ids = [...req.together, ...req.apart, ...req.exact_unit];
  25  |     response.partitions = Array.from({ length: 2 ** ids.length }, (_, mask) => ({
  26  |       ...structuredClone(empty.cells[0]), key: `partition-${mask}`,
  27  |       present: ids.filter((_: string, index: number) => mask & (1 << index)),
  28  |       absent: ids.filter((_: string, index: number) => !(mask & (1 << index)))
  29  |     }));
  30  |     response.evidence_hash = `fixture-${response.operation}-${req.together?.join("-")}-${req.exact_unit?.join("-")}`;
  31  |     response.context = { ...response.context, season: req.season || "2023-24", release_id: req.release_id || "fixture-release", before_date: req.before_date || "2024-04-15" };
  32  |     await route.fulfill({ json: response });
  33  |   });
  34  | });
  35  |
  36  | test("empty source preserves unknown values, exact downloads and resolved links", async ({ page }) => {
  37  |   await openWorkbench(page, "/wowy?team_id=TOR&together=1627751");
  38  |   await expect(page.getByText("No admitted exposure in this scope.", { exact: true })).toBeVisible();
  39  |   await expect(page.getByText("0 / 82 finalized games reconstructed", { exact: false })).toBeVisible();
  40  |   await expect(page.locator("tbody").first()).toContainText("—");
  41  |   await expect(page).toHaveURL(/release_id=fixture-release/);
  42  |   await page.screenshot({ path: test.info().outputPath("b22-empty-desktop-fixture.png"), fullPage: true });
  43  |   await page.getByRole("button", { name: "Data details", exact: true }).click();
  44  |   const pending = page.waitForEvent("download");
  45  |   await page.getByRole("button", { name: "Save evidence JSON" }).click();
  46  |   const download = await pending;
  47  |   const file = await download.path();
  48  |   const bundle = JSON.parse(readFileSync(file!, "utf8"));
  49  |   expect(bundle.results[0].coverage_status).toBe("source_blocked");
  50  |   expect(bundle.results[0].cells[0].raw_metrics.net_rating).toBeNull();
  51  |   await page.keyboard.press("Escape");
  52  |   await page.getByRole("button", { name: "Pin for comparison" }).click();
  53  |   await pick(page,"Together players","other",true);
  54  |   await expect(page.getByText("Pinned eligible differences", { exact: false })).toBeVisible();
  55  | });
  56  |
  57  | test("two and five player units use the same operation with all partitions", async ({ page }) => {
  58  |   const requests: unknown[] = [];
  59  |   page.on("request", req => { if (req.url().endsWith("/operations/wowy")) requests.push(req.postDataJSON()); });
  60  |   await openWorkbench(page, "/wowy");
  61  |   await page.getByRole("combobox", { name: "View", exact: true }).selectOption("unit");
  62  |   for (const ids of ["1,2", "1,2,3,4,5"]) {
  63  |     await pick(page,"Exact unit",ids,true);
  64  |       await expect(page.getByText("No admitted exposure in this scope.", { exact: true })).toBeVisible();
  65  |     await expect(page.getByText(`All disjoint presence/absence partitions (${2 ** ids.split(",").length})`, { exact: true })).toBeVisible();
  66  |   }
  67  |   expect(requests).toEqual(expect.arrayContaining([expect.objectContaining({ exact_unit: ["1", "2"] }), expect.objectContaining({ exact_unit: ["1", "2", "3", "4", "5"] })]));
  68  | });
  69  |
  70  | test("stat shifts reject focal contradictions and request per-possession production", async ({ page }) => {
  71  |   await openWorkbench(page, "/stat-line-shift");
  72  |   await pick(page,"Focal player","1");
  73  |   await pick(page,"Together players","1");
  74  |   await expect(page.locator(".shared-floor").getByRole("alert")).toContainText("separate");
  75  |   await pick(page,"Together players","2",true);
  76  |   await expect(page.getByRole("heading", { name: "Observed Stat Shift" })).toBeVisible();
  77  |   await expect(page.locator(".floor-result")).toContainText("finalized games reconstructed");
  78  |   await expect(page.getByRole("button", { name: "Run shared-floor analysis" })).toHaveCount(0);
  79  | });
  80  |
  81  | test("bounded leaders pin a resolved release across candidates", async ({ page }) => {
  82  |   const requests: Record<string, unknown>[] = [];
  83  |   page.on("request", req => { if (req.url().endsWith("/operations/on-off")) requests.push(req.postDataJSON()); });
  84  |   await openWorkbench(page, "/wowy");
  85  |   await page.getByRole("combobox", { name: "View", exact: true }).selectOption("leaders");
  86  |   await pick(page,"Candidate players","1,2,3");
  87  |   await expect(page.getByRole("heading", { name: /On\/Off ·/ })).toHaveCount(3);
  88  |   expect(requests.slice(-3)).toHaveLength(3);
  89  |   expect(requests.at(-2)!.release_id).toBe("fixture-release");
  90  |   expect(requests.at(-1)!.before_date).toBe("2024-04-15");
  91  | });
  92  |
  93  | test("Stats on/off preset opens served per-team rating columns", async ({ page }) => {
  94  |   await openWorkbench(page, "/stats?preset=onoff&together=1");
  95  |   await expect(page.getByRole("heading", { name: "Stats Explorer" })).toBeVisible();
  96  |   await expect(page.getByRole("tab", { name: "On-Off", exact: true })).toHaveAttribute("aria-selected", "true");
  97  |   await expect(page.getByRole("columnheader").filter({ hasText: "Net on/off" })).toBeVisible();
  98  | });
  99  |
  100 | test("partial samples show raw rates and directional denominators while gating differences", async ({ page }) => {
  101 |   await page.route("**/api/workbench/operations/wowy", async route => {
  102 |     const response = structuredClone(empty);
  103 |     response.operation = "wowy";
  104 |     response.request = { ...empty.request, ...route.request().postDataJSON() };
  105 |     response.coverage_status = "partial"; response.observed_games = 3;
  106 |     response.disclosures = ["Browser acceptance fixture; not real player analytics."];
  107 |     response.cells[0] = { ...response.cells[0], games: 3, stints: 12, minutes: 40.25,
  108 |       offensive_possessions: 80.5, defensive_possessions: 79.25, points: 96, points_allowed: 89,
  109 |       sample_status: "insufficient_sample", reason: "Below possession and game gates",
  110 |       raw_metrics: { offensive_rating: 119.254658, defensive_rating: 112.302839, net_rating: 6.951819 },
  111 |       metric_denominators: { offensive_rating: 80.5, defensive_rating: 79.25 },
  112 |       metric_valid_stints: { offensive_rating: 12, defensive_rating: 12 } };
  113 |     response.shifts[0].selected_value = 119.254658;
  114 |     await route.fulfill({ json: response });
```
