# FO00 inventory and baseline

Captured 2026-10-09 on branch `frontend-overhaul` from the running local stack (dashboard
`127.0.0.1:3100`, API `127.0.0.1:8000`, published release `5bbb6035-…`). Parent:
[frontend overhaul handoff](../../frontend-overhaul-plan.md).

Artifacts in this directory:

- `before/*.png`: 55 routes × 1440×900 and 390×844 full-page screenshots (110 files), plus
  three overlay captures on a scrolled `/stats` (search at both widths, phone drawer).
- `before/measurements.json`: per-route, per-width runtime measurements (status, final URL,
  `document.title`, visible `h1`, subtitles, Load buttons, native date inputs, notice boxes, date
  format counts, glyph icons in rendered text, UUIDs, `game_date <` rules, "Strictly prior",
  phone horizontal overflow). Reproduce with `node scripts/capture_fo00_baseline.cjs`
  (add a comma-separated route list to recapture only those routes).
- `required-wording.json`: the D14 inventory (section 2). Reproduce with
  `.venv/bin/python scripts/fo00_required_wording.py`.

## 1. Route inventory (53 `page.tsx` routes)

Nav label = current header label (`components/ui/header.tsx`). Title = rendered `h1` at capture.
Template = D22 target. Action = FO07 target. Capability = `lib/route-availability.ts` requirement.

| Route | Nav label (now) | Title (now) | Template | FO07 action | Main component | Data dependencies |
| --- | --- | --- | --- | --- | --- | --- |
| `/` | — | redirects to `/stats` | — | keep (redirect) | `app/page.tsx` | — |
| `/stats` | Stats | Stats Explorer | Explorer | keep (reference page) | `stats-workspace` | core_stats; workspace/preset catalog |
| `/players` | Player Directory | Player Explorer | Explorer | keep under Players | `stats-workspace` + `player-search` | core_stats; analytics catalog |
| `/players/[id]` | — | player name | Profile | keep | `workbench-player-profile` (+ `trend-chart`) | player profile, game log, impact, analytics profile/games |
| `/last-games` | Recent Games | player name (e.g. "Bam Adebayo") | Explorer | keep under Players | `recent-games-view` | core_stats; player profile + game log |
| `/showcase` | Showcase Cards | Player Showcase & Cards | Board | keep → "Player Showcase" (FO04) | `player-showcase-view` | core_stats; `queryPlayerResearch` |
| `/rankings` | Ranking Boards | Personal Ranking Boards | Explorer | keep under Players | `ranking-boards-view` | local boards |
| `/tierlist` | Tier Lists (Compare) | Tier List Builder | Board | move to Players | `tier-list-view` | local lists |
| `/research/similarity` | Statistical Peers | Statistical Peers & Profile Twins | Research | merge → Similar Players (Box score tab) | `similarity-investigation-view` | core_stats; statistical peers |
| `/shot-profile-twin` | Shot-Profile Twins | Shot-profile twins | Research | merge → Similar Players (Shot profile tab) | `shooting-view` | shots |
| `/teams` | Team Stats & Cohorts | Team Explorer | Explorer | keep | `team-explorer-view` | core_stats; teams research |
| `/teams/[id]` | — | team name | Profile | keep | `app/teams/[id]/page.tsx` (inline) | team detail, four factors, peers, schedule |
| `/roster-shapes` | Roster Shapes | Roster allocation diagrams | Board | keep (FO05) | `roster-allocation-view` | core_stats; team detail/participation |
| `/stat-line-shift` | Teammate Stat Shift | Teammate stat-line shift | Compare | keep under Teams | `shared-floor-view` | on_off; shared floor |
| `/contracts` | Contracts & Payroll | Contracts & known payroll | Explorer | keep | `finance-workspace` | finance books (finance-ui-v1) |
| `/contracts/[team]` | — | Contracts & known payroll | Profile | keep | `finance-workspace` | finance books |
| `/free-agency` | Free Agency Tracker | Free agency · source-book tracker | Explorer | keep | `finance-workspace` | finance books |
| `/compare` | Player Comparison | Compare Players | Compare | keep | `player-compare-view` + `compare-selector` | core_stats; analytics compare, `comparePlayers` |
| `/team-compare` | Team Comparison | Team Comparison & Four Factors Analysis | Compare | keep | `team-compare-view` | core_stats; team detail/four factors/peers |
| `/matchups` | Player Matchups | Source assignment matchups | Compare | keep | `shooting-view` | matchups |
| `/wowy` | WOWY (primary) | WOWY · Shared floor | Compare | regroup → Research › Impact | `shared-floor-view` | on_off; shared floor |
| `/live` | Live Scoreboard | Live games | Board | keep (FO08) | `live-workspace` | `/api/live` provisional + retained finals |
| `/live/[date]` | — | Live games | Board | keep | `live-workspace` | as `/live` |
| `/live/games/[id]` | — | Live games | Board | keep | `live-workspace` | as `/live` |
| `/playoffs` | Playoff Series | Playoff Bracket & Series Explorer | Board | keep (Live tab) | `playoffs-bracket-view` | core_stats; playoff bracket |
| `/playoffs/[seriesId]` | — | series name (e.g. "Detroit Pistons vs Orlando Magic") | Board | keep | `playoffs-series-view` | playoff series detail |
| `/schedule` | — (not in nav) | Team schedule | Explorer | move to `⋯` | `schedule-grid` | data status, schedule |
| `/planner` | — (not in nav) | Weekly roster planner | Board | move to `⋯` | `planner-client` | data status |
| `/data-status` | — (`⋯`) | Data & Pipelines | Explorer | move to `⋯` | `workbench-jobs-panel` | workbench status/jobs |
| `/settings` | — (`⋯`) | Settings | *none fits (see 5.6)* | keep (FO13) | `app/settings/page.tsx` + settings cards | assistant status, workbench status |
| `/methodology` | Definitions & Glossary | Methodology & Metric Catalog | *none fits (see 5.6)* | keep; absorbs Learning | `app/methodology/page.tsx` | metric catalog |
| `/learning` | Interactive Learning | Learn with CourtLens evidence | — | fold into Methodology | `learning-workshop` | workbench catalog |
| `/blog` | Blog & Updates | Evidence before narrative | *none fits (see 5.6)* | merge → What's New | `original-article` | repo Markdown |
| `/patch-notes` | Patch Notes | Patch notes: retained analytical operations | — | merge → What's New | `original-article` | repo Markdown |
| `/design` | — | CourtLens Design Language v1 | — | hide (internal) | `app/design/page.tsx` | none |
| `/research/ask` | Ask CourtLens AI | Ask CourtLens | out of scope (D23) | keep | `ask-courtlens` | assistant |
| `/investigations` | Saved Investigations | Saved Investigations | Research | keep (Forecasts & Evaluation group) | `saved-operation-library` + `workbench-investigations-list` | saved operations, saved investigations |
| `/investigations/saved/[id]` | — | not captured (5.3) | Research | keep | `saved-operation-detail` | saved operation |
| `/forecasts` | Points Forecasts | Points Forecasts & Protocol | Research | keep (Forecasts & Evaluation) | `app/forecasts/page.tsx` | forecast evaluation, prospective forecasts |
| `/evaluation` | Evaluation Archive | Evaluation unavailable | Research | keep (Forecasts & Evaluation) | `app/evaluation/page.tsx` | analytics evaluation |
| `/research/case-studies` | Case Studies | Flagship Research Case Studies | Research | keep (Forecasts & Evaluation) | `case-studies-view` | sealed reports |
| `/research/trends` | Workload Trends | Workload & Trajectory Trends | Research | keep (Trends & Distributions) | `trends-investigation-view` | core_stats; period compare, rank |
| `/research/distributions` | Distributions & Splits | Distributions, Dispersion & Splits | Research | keep (Trends & Distributions) | `distributions-investigation-view` | core_stats; distribution, splits, opponent context |
| `/research/rapm` | RAPM Research | CourtLens descriptive impact | Research | keep; gains Six-Factor tab | `research-results-view` + `impact-disclosure` | impact bundle |
| `/six-factor-rapm` | Six-Factor RAPM | CourtLens six-factor research | Research | merge → `/research/rapm` tab | `research-results-view` | sealed research results |
| `/research/defensive-matchups` | Defensive Matchups | Defensive Contests & Matchups | Research | keep (Impact) | `capability-notice` | defensive_tracking (gated) |
| `/research/epv` | Spatial EPV | Spatial Expected Possession Value (EPV) | Research | keep (Impact) | `capability-notice` | tracking (gated) |
| `/research/adjusted-shooting` | Adjusted Shooting | CourtLens playtype-adjusted shooting | Research | merge → Shooting tab | `research-results-view` | sealed research results |
| `/research/expected-shots` | Expected Shots | CourtLens expected-shot experiment | Research | merge → Shooting tab | `research-results-view` | sealed research results |
| `/shot-aftermath` | Shot Aftermath | Shot aftermath | Research | merge → Shooting tab | `shooting-view` | shots |
| `/research/operation` | — | Research operation | Research | keep (deep link target) | `research-operation-view` | saved/operation replay |
| `/calculator` | Hypothetical Calculator | Hypothetical offensive rating calculator | Research | keep | `possession-calculator-view` | none (client math) |
| `/wingspan` | Combine & Wingspan | Measurements & wingspan explorer | Research | keep | `wingspan-explorer-view` | measurements |

Nav label vs title (D7 requires an exact match): of the 39 routes with a nav label, only
`/investigations` ("Saved Investigations") matches exactly. 19 titles are not Title Case, for
example "Roster allocation diagrams", "Source assignment matchups", "WOWY · Shared floor",
"Free agency · source-book tracker", "CourtLens expected-shot experiment".

## 2. Required wording (D14)

`scripts/fo00_required_wording.py` cross-references strings asserted by tests (unit + e2e
`getByText`/`toContainText`/`toHaveText`/`getByLabel`/`getByRole name`, literal or regex) and
quoted strings in `docs/design/*.md` against strings that non-test dashboard source renders.
Result: **388 required strings: 44 caveat/prose, 344 labels; 24 come from contracts.**
`required-wording.json` holds each string with every `required_by` location and up to eight
`rendered_at` locations.

Caveat/prose strings that FO blocks must keep rendered (behind "Why?" or Data details where they
leave the main flow). Each is asserted by an e2e test unless marked:

| String (prefix) | Rendered at | Likely block |
| --- | --- | --- |
| An idle job queue does not establish worker liveness. | `app/settings/page.tsx:68` | FO13 |
| Basketball exclusive cutoff | `finance-contract-drawer.tsx:39` | FO10 |
| Configuration alone does not establish provider availability or answer accuracy | `assistant-status-card.tsx:14` | FO13 |
| Manual research needs no provider key | `assistant-status-card.tsx:14` | FO13 |
| An idle / Cost unknown / This answer contains unverified numbers. / Chat history is retained separately / History stays in this local installation | Ask components | Ask (out of scope) |
| could not be verified · not declared | `lib/route-availability.ts:21,23` | FO02 (nav gating) |
| does not establish unsigned status · No represented contracts match | `finance-workspace.tsx:79` | FO10 |
| Estimate gap *(contract)* · Estimate unavailable at this cutoff · No reconstructed target | `app/compare/page.tsx:207–261` | FO11 |
| No calibration fit | `research-results-view.tsx:54` | FO12 |
| No challenger promoted | `app/evaluation/page.tsx:46` | FO12 |
| Out-of-Time Performance on Holdout Block F | `app/forecasts/page.tsx:264` | FO12 |
| No games in the observed source slate | `live-workspace.tsx:116` | FO08 |
| Player boxes unknown | `live-workspace.tsx:20` | FO08 |
| No history before this cutoff · Replay date not supported | `app/players/[id]/page.tsx:357,368` | FO09 |
| Prior Appearance Game Log | `workbench-player-profile.tsx:570` | FO09 |
| No shrinkage or prior is applied · Real analytics are unavailable | `shared-floor-view.tsx:116,131` | FO11 |
| Source video unavailable: no admitted exact | `shooting-view.tsx:149` | FO07/FO12 |
| Search is unavailable. · No matches for | `lookup-input.tsx:108,148` | FO01/FO02 |
| No results *(unit)* | `ui/command-palette.tsx:160` | FO02 |
| The question was not retained. | `saved-operation-detail.tsx:58` | FO12 |
| Retain my selected question as durable metadata | `save-operation.tsx:36` | FO12 |
| Investigate historical scoring variation | `learning-workshop.tsx:11` | FO07/FO13 |
| Unknown pick | `wingspan-explorer-view.tsx:40` | FO12 |
| AI temporarily unavailable *(contract)* | `lib/conversation.ts:10` | Ask |

The plan's example "Missing participation is not a confirmed zero…" is **rendered**
(`roster-allocation-view.tsx:43`) but **not asserted** by any test or quoted in any contract.
D14 therefore lets FO05 shorten it, but D4's rule (unknown is never shown as zero) still applies.

Contract rules that constrain copy without fixing exact wording (keep the meaning):

- `workbench-interface-contract.md:87`: null values show an em dash or an unavailable label with a
  reason, never zero. Tables keep headers, units, `aria-sort` and loading placeholders.
- `polish-ui-contract.md:89`: compact season/phase/cutoff/window controls with genuine counts ("a
  player count says players"). Raw UUIDs, timezone names and milestone IDs belong in details;
  **the exclusive-cutoff meaning must stay discoverable** (D20's Data details satisfies this).
- `polish-ui-contract.md:120`, `replica-feature-contract.md:109`: primary identity keeps portrait,
  logo, plain linked name, team scope; a missing portrait uses the fallback and never removes
  identity.
- `finance-ui-v1.md:15,19`: null money is "Unknown", a documented zero is `$0.00`; known payroll
  is labelled as known payroll; no legal room, surplus or ROI claims.
- `live-ui-v1.md:17,68,84`: provisional values separate from admitted finals; em dash for missing;
  the Live notice describes provisional values and independent final admission (FO08 keeps that
  meaning in one line + Why?).
- `product-contract.md:29`: for a historical archive, never default to today's date with a
  misleading empty view; show the supported date range (FO08 date strip).
- `saved-operations-ui-v1.md:57,66`: Methodology shows catalog version, count, validity and
  limitations; prior measurements are labelled as prior.

## 3. Baseline screenshots

`before/` has every route except `/investigations/saved/[id]` at both widths. Every response
returned HTTP 200. Dynamic samples: `/players/1629029` (Luka Dončić), `/teams/1610612737` (Atlanta),
`/contracts/BOS`, `/playoffs/2026-r1-det-orl`, `/live/2026-04-12` (has finals),
`/live/2026-10-09` (today, no games), `/live/games/0022501186`.

## 4. Counts

Source counts (non-test `.ts/.tsx` under `app`, `components`, `lib`):

| Measure | Count | Notes |
| --- | --- | --- |
| Glyph/emoji icons | **100** in 33 files | → 38, ✓ 16, ✕ 14, ★ 10, ☆ 4, ← 7, ◀ 2, ▶ 1, ↑ 1, ↓ 1, ⚠ 1, 🏀 1, 📊 2, 📈 1, ⚡ 1 |
| Direct `lucide-react` imports | **3** files | `stats-workspace.tsx`, `stats-preview-rail.tsx`, `workbench-player-explorer.tsx` |
| `style={{` | **41**, all custom-property-only | `app/design/page.tsx` 24, distributions 7, multi-player lines 3, team compare 2, one each: player explorer, skeleton, tier list, team logo, scatter plot. ESLint's `no-restricted-syntax` rule passes, so every key is `--*`. The only misuse is six spacing-utility props on `/design` (`--mt` ×4, `--p`, `--page-gutter`). |
| "Load …" buttons | **4** | `schedule` "Load week", `roster-allocation-view` "Load participation", `live-workspace` "Load finalized research", `finance-contract-drawer` "Load player Stats" |
| Native `type="date"` | **18** in 14 files | incl. `context-bar.tsx`, `catalog-scope-fields.tsx`, `live-workspace.tsx` (2), `trends-investigation-view.tsx` (4), `planner-client.tsx` (2) |
| Notice boxes (`notice`/`notice-box` classes) | **69** in 38 files | |
| Date formatting call sites | 28 | `toLocaleString` 17, `Intl.DateTimeFormat` 5, `toISOString().slice(0,10)` 4, `toLocaleDateString` 2; no shared formatter |
| "Strictly prior" | 3 | `context-bar.tsx:184`, `workbench-player-profile.tsx:572`, `multi-player-lines-view.tsx:671` |
| `game_date <` in UI text | 3 | `case-studies-view.tsx:146`, `lib/image-export.ts:153,197` (export card) |

Runtime counts (desktop, 55 captured routes):

| Measure | Result |
| --- | --- |
| Visible "Load …" buttons | 4 pages: `/roster-shapes`, `/schedule`, `/live/2026-04-12` and `/live/games/…` ("Load finalized research") |
| Native date inputs visible | 27 pages |
| Notice boxes visible | 44 across 30 pages |
| Date formats in rendered text | ISO `YYYY-MM-DD` on 22 pages; `M/D/YYYY` on 2 (`/forecasts`, `/investigations`); "Apr 12, 2026" style on **0** |
| UUIDs in rendered text | `/data-status` 24, `/live/…` 2 each, `/compare` 1 (footer "Snapshot 5bbb…"), `/learning` 1 |
| Glyph icons in rendered text | 15 pages; worst `/investigations` (236 →), `/playoffs/[seriesId]` (40), `/teams/[id]` (34), `/teams` (30), `/playoffs` (15) |
| Phone horizontal page scroll | 1 page: `/design` |

## 5. Findings not in the plan

1. **Search pill overlaps the nav at 1440px.** On every desktop screenshot the header search pill
   is drawn on top of the "Research" menu item ("Research" and "Search" text overlap). FO02 owns
   it.
2. **Hamburger and the duplicate magnifier show at 1440px** (D8/D9 already call for removing
   them; confirmed present).
3. **`/investigations` saved-operation library shows "Failed to fetch"** against the running API,
   so there was no `/investigations/saved/[id]` sample to capture. This is a before-state defect,
   not caused by FO00. It needs a diagnosis before FO12. The page is also 8.6 MB at full height
   because the legacy list renders 236 "→" rows.
4. **`/evaluation` renders "Evaluation unavailable" as its h1.** The empty state replaces the
   page title.
5. **Two emoji not in the plan's glyph list** render on `/data-status`: 🔄 and 📸. FO03's lint
   rule should catch every emoji range, not a fixed list.
6. **D22 has no template for article and settings pages.** `/methodology`, What's New
   (`/blog` + `/patch-notes`) and `/settings` don't fit Explorer/Profile/Compare/Board/Research.
   FO06 should add an **Article** template (and decide whether Settings uses it) or the owner
   should name one of the five.
7. **Overlay bugs reproduce on a scrolled page.** `overlay-search-scrolled--desktop.png`: the dim
   and blur cover only a ~480px column (x≈480–960). `overlay-drawer-scrolled--phone.png`: the
   drawer is blurred along with its own contents, and the effect stops ~600px down. Both fit the
   containing-block hypothesis. FO02 still needs a minimal reproduction to confirm the cause.
8. **Native date inputs display `MM/DD/YYYY`** (e.g. "04/13/2026" in the `/teams` context bar)
   beside ISO text ("Strictly prior to 2026-04-13") on the same screen. The rendered-text counts in
   section 4 miss these because input values are not in `innerText`. The 27 pages with native
   date inputs all mix two formats.
9. **Capture caveat:** in tall full-page screenshots, lazy-loaded logos below the first screens
   can be missing (`/teams` rows 24–30). Treat that as a capture artifact, not a page defect.
   FO06 baselines should scroll or force-load images before capturing.
10. **The export card prints the code rule** `Temporal Constraint: game_date < …`
   (`lib/image-export.ts:153`). D16 replaces it with the context line in FO04.
