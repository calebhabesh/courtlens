# PC11 evidence: populate or remove gated pages

Contract: [gated pages v1](../../design/gated-pages-v1.md). Plan:
[PC11](../../presentation-clarity-plan.md#pc11-populate-or-remove-gated-pages). Owner decisions at
G4 (D6 playoff toggle dropped, D7 fit and white space kept) are recorded in the plan.

## Before → after (first load, no URL parameters)

| Page | PC02 audit / before | After |
| --- | --- | --- |
| `/research/defensive-matchups` | gate notice ("Required source unavailable") | ranked makes-below-expected chart, 4 tiles, focus defender's matchups, 580-defender shaded table |
| `/matchups` | example card, then `source_blocked · 0 / 1230` | who guarded the example player (Amen Thompson, 393 defenders), tiles, table |
| `/research/shooting/adjusted` | registered experiment, 0 runs | play-type-adjusted leaderboard, focus breakdown with league deltas, 439-player table |
| `/research/rapm/six-factor` | registered experiment, 0 runs | one factor at a time (oTS default), 15-player chart, six shaded factor columns |
| `/wingspan` | one hand-entered seed row repeated 100 times (fake) | 2026 combine class (78 players, 76 measured), height vs wingspan scatter, shaded table |
| `/wowy` | example card, then `source_blocked · 0 / 82` games | HOU: Amen Thompson · Kevin Durant, four splits, 45 duos |
| `/stats/tracking` (new tab) | — | drives default, 582 players, 8 categories, sortable shaded columns |
| `/players/[id]` Tracking / Measurements | Measurements read 4 seeded players | 8 tracking groups with percentiles; official combine record or a one-line unknown |
| `/research/epv` | gate notice | removed; redirects to `/research/rapm` (query kept) |
| `/planner` | fixture league | hosted build only: link hidden and `/planner` → `/` |

## Real results (owner dev server, real API)

- **Defense (2025-26 regular season, all shots):** 580 defenders, 422 qualified. Most makes below
  expected: Wembanyama 120.3 (1,092 shots, 38.2% vs 49.2% expected), Holmgren 73.1, Queta 68.8.
  Most contests per game: Clingan 13.5.
- **Play types (offense):** 439 players, 323 qualified (250+ possessions). League play-type PPP
  1.023; spot-up is the most common (1.055). Leaders: Jaxson Hayes +25.2 per 100, Gilgeous-Alexander
  +24.4, Kennard +20.7.
- **Six-Factor:** 802 rated; top oTS Jokić +4.13, Curry +4.10, Gilgeous-Alexander +3.90.
- **Tracking:** Avdija 27.8 drives per game, Gilgeous-Alexander 17.4 drive points.
- **Combine:** 1,873 participants 2000–2026, 1,812 with height and wingspan. 2026 longest span over
  height: Rueben Chinyelu +10.25 in.
- **WOWY:** artifact `89ebf089f98a06422ccb51b3a0cb253a4b09eb355b0f758c6a2b067192ad49f4` (3.7 MB),
  six cohorts (3 seasons × regular season/playoffs), 6,201 pairs. Two independent runs give the
  same hash (≈25 s each). **Conservation: 0 failures**: in every pair the four splits sum exactly
  to the team total for seconds, points, possessions and stints. Jokić's 2,265 stint minutes equal
  the NBA tracking feed's 2,265.0. Default: HOU, Amen Thompson · Kevin Durant, 2,157 shared minutes,
  +5.5 together, −5.8 with neither on (+11.2, descriptive).

[Read-only check](read-only-check.json): 161 publication pointers (digest recorded),
1,031 identities, 205 stats feed datasets and 200,690 versions, all unchanged. The 340 legacy
measurement rows are unchanged and no longer read by any page; GETs no longer seed them.

## Extended glance test

[Capture script](capture.mjs), [measurements](measurements.json), [screenshots](screenshots/):
owner dev server with the real API, no URL parameters on entry, 1440×900 and 390×844. 18 captures:
0 page errors, 0 failed requests, 0px overflow, 0 ISO dates and 0 hashes in the main flow, 0 phone
targets under 40px outside tables. Ready in 0.8–1.2 s (profile tabs 2.5 s, local machine).
P = pass, ~ = partial, - = not applicable. Items 1–10 are the overhaul test, 11–14 the additions.

| Route | Score | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 | 14 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `/research/defensive-matchups` | 12/14 | P | P | P | ~ | P | P | P | ~ | P | P | P | P | P | P |
| `/matchups` | 12/14 | P | P | P | ~ | P | P | P | ~ | P | P | P | P | P | P |
| `/research/shooting/adjusted` | 12/14 | P | P | P | ~ | P | P | P | ~ | P | P | P | P | P | P |
| `/research/rapm/six-factor` | 11/13 | P | P | P | ~ | - | P | P | ~ | P | P | P | P | P | P |
| `/wingspan` | 11/13 | P | P | P | ~ | - | P | P | ~ | P | P | P | P | P | P |
| `/wowy` | 11/14 | P | P | P | ~ | ~ | P | P | ~ | P | P | P | P | P | P |
| `/stats/tracking` | 11/13 | P | P | P | ~ | - | P | P | ~ | P | P | P | P | P | P |
| `/players/[id]?tab=tracking` | 12/14 | P | P | P | ~ | P | P | P | ~ | P | P | P | P | P | P |

PC02 scored all of these F on item 11 (first load). Notes:

- **3:** tiles start at 227–284px desktop; the headline chart at 342–403px.
- **4:** right-aligned tabular numbers; full-page 4px alignment not measured.
- **5:** focus players have headshots (Defensive Matchups, Player Matchups, Adjusted Shooting);
  WOWY shows the team logo but not the two players' headshots. Dense ranked lists use names only.
- **8:** loading shows generic skeleton blocks, not the final layout.
- **9:** desktop still has the shared 28px Data details button (as PC10).
- **13:** single-measure bars use the identity-A tone (as `ValueBar`); percentile shading is
  explained in each table caption; small samples are muted and labeled.

## Checks

- Python: 11 new tests (`tests/unit/test_stats_feed_views.py` 6, `tests/unit/test_wowy.py` 3,
  `tests/integration/test_stats_feed_views_postgres.py` 2 on PostgreSQL 17).
  [Full suite](verification/python.log): 2,018 passed, 1 existing browser-prerequisite skip, 19
  published-data deselections. Ruff, format and strict mypy (234 files) clean.
- Dashboard: lint 0/0, typecheck clean, Vitest 62 files / 430 tests (new `RankedBars` and
  `lib/stats-feeds.test.ts`; nav and route-inventory tests updated for EPV and the hosted flag).
- Playwright on a production build of the committed tree only (git archive export, so the owner's
  uncommitted Stats changes are not in it), mock API on 4100, dashboard on 3410:
  [full run](verification/playwright-full.log) 403 passed, 15 skipped, 4 failed before baseline
  refresh. `chart-kit.spec.ts:74` is the failure recorded at PC08/PC10. The three
  `native-select-theme` popups are full-page Stats captures shifted by the new Box Score / Tracking
  tabs; they and the two FO14 Stats baselines were regenerated from that clean build and pass.
  New `pc11-gated-pages.spec.ts` (9) and 14 PC11 visual baselines.
- Tests rewritten because behavior moved: the `/wowy` operation-form tests (units, leaders,
  evidence export, pinning) and the old Matchups assignment-matrix tests were removed with that
  UI; the shared chip-picker tests now run on Teammate Stat Shift; one race test covers the new
  WOWY fetch (a held earlier response cannot replace the current result, 3/3 repeats).

## Reproduction

```bash
.venv/bin/python -m courtlens.evaluation.wowy_runner          # writes data/derived/wowy-v1/<sha>.json
.venv/bin/python scripts/test_python.py -q
npm --prefix dashboard run lint && npm --prefix dashboard run typecheck && npm --prefix dashboard test
node dashboard/e2e/mock-api.mjs &                              # 4100
(cd dashboard && COURTLENS_API_INTERNAL_URL=http://localhost:4100 NEXT_PUBLIC_COURTLENS_API_URL=http://localhost:4100 npm run build -- --webpack \
  && PORT=3410 HOSTNAME=127.0.0.1 node e2e/start-dashboard.mjs &)
PLAYWRIGHT_EXTERNAL_SERVER=true PLAYWRIGHT_BASE_URL=http://localhost:3410 npx --prefix dashboard playwright test
node docs/evidence/pc11/capture.mjs docs/evidence/pc11            # real API through the 3100 dev server
```

`data/derived/` is git-ignored: the hosted deployment (PC13) must ship the WOWY artifact with the
other derived artifacts.
