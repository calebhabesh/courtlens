# F03 Win Probability uniform design pass (RD14)

Research → Win Probability rebuilt in the Research pages pattern from the owner's approved seven-point proposal (2026-11-11, "Approve as written"; recorded in the [Research design catalog](../../../research-design-catalog.md) RD14 section). Presentation only: the R15b model, frozen results, nightly scorecard, ledger and API are unchanged.

## Screenshots

| | 1440 | 390 |
| --- | --- | --- |
| Before | [`f03-before-full-1440`](f03-before-full-1440.png) | [`f03-before-full-390`](f03-before-full-390.png) |
| After, toggles closed | [`f03-after-full-1440`](f03-after-full-1440.png) | [`f03-after-full-390`](f03-after-full-390.png) |
| After, every toggle open | [`f03-after-open-1440`](f03-after-open-1440.png) | [`f03-after-open-390`](f03-after-open-390.png) |

The after screenshots are of the sandbox build (dashboard on 3180) reading the owner's API through a read-only proxy on 4180, so they show real data and photos. No sideways page scroll at either width; no console errors.

## Checks (2026-11-11)

- **Real data:** [`scrape_page.mjs`](scrape_page.mjs) reads every displayed value (`data-*`) from the page, through all six phases and all three WPA seasons, and [`check_real_data.py`](check_real_data.py) recomputes each one from `GET /api/win-probability` and `/api/win-probability/wpa` without the page's code: **4,076 values, 0 mismatches**. That covers the answer, scorecard and replay rows, drift, 60 ledger games, the final-test grids for all six phases, both rules, seven model steps against their R15a references, the findings, and 236 + 242 + 236 WPA rows.
- **Fixture:** `e2e/fixtures/win-probability-page.json` is now the real API's answers from 2026-11-11 (47 prospective games; the full WPA tables for three seasons). The spec checks the page against it.
- **Touched spec ×3:** `win-probability.spec.ts`, 9 passed and 1 skipped (the screenshot recorder) on each of three runs.
- **Vitest:** 900 passed. Lint and typecheck: 0 errors, 0 warnings.
- **Full Playwright** (sandbox, 2 workers): 641 passed, 17 skipped, 0 failed. Evidence files the suite rewrites were restored afterwards.

## Corrections found while building

The old page described every step's gain as "over S2". The served `steps` (selection, 2022-23, 90% intervals) and `pairs` (test, 95%) use different references (R15a, "What each step added"), and S0g was a diagnostic, not a rejected step. The new grid labels each reference and level and says "Diagnostic" for S0g.
