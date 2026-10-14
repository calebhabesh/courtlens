# Stats DARKO integration — 2026-10-12

Owner instructions 38–39 in the alignment catalog. Ready for owner review, not owner-aligned.

Overview now displays DPM, ODPM and DDPM under Impact, with DPM descending as its default sort.
Counting-mode changes leave the forecasts in points per 100 possessions. CourtLens BPR retains its
own catalog identity and Impact preset. The source credit is a highlighted blue link in the header
hover card, footer, preview metric labels, trend dialog, glossary and Data details. The header card
stays open while its link is hovered or focused; clicking opens DARKO in a new tab.

## Source verification

The first import used `?season=YYYY`. It reproduced the reported bug: Jokić's 2024-25 DPM was
7.3354, rather than the player history's displayed 6.59 before his final playoff game. The source
[player history](https://www.darko.app/player/203999) links that season to
[May 18, 2025](https://www.darko.app/?asof=2025-05-18). The retained dated response gives 6.58564.
A three-player subset is retained as `tests/fixtures/darko/asof-2025-05-18.json`.

The dated leaderboard supplies every player in one response, so the operator import needs six
boards, rather than approximately 600 player pages. Each scope uses the published dataset's last
game date; regular season and playoffs stay separate. The parser rejects undated boards, mismatched
seasons/dates, duplicate identities and nonfinite ratings, and preserves unknowns and full precision.
Raw bytes and acquisition/robots receipts remain append-only. A failed scope prevents sealing a
replacement bundle. Visitors only read sealed files.

Installed v2 bundle:
`data/derived/darko-dpm-v2/04db0bc16838a71314708be00f15e88f6542820d3c627ccf2dad40945f924c02.json`.
The erroneous v1 acquisitions/bundle remain retained and are not served. The operator command is
`courtlens refresh-darko`; install subsequent printed paths with `COURTLENS_DARKO_MANIFEST`.

The full-season SQL joins are recorded in [source-verification.json](source-verification.json).
Jokić's 2024-25 regular-season DPM is 6.54928; playoffs is 6.58564. These are latest retrospective
pregame forecasts at the stated dates, not season averages or verified original publication-time
model revisions. Different dates/revisions may differ from Databallr; its exact snapshot is unknown.

**Source limit:** 2025-26 playoff `asof=2026-06-13` returns `dataDate=2026-06-03`. The API marks this
snapshot partial, and the UI shows **DARKO through Jun 3, 2026**. No June 13 rating is invented.
The other five scopes have matching request/data dates. Missing regular-season ratings remain null:
2023-24 540/586 CourtLens players matched, 2024-25 537/577, 2025-26 542/591. Every playoff participant
matches (229/229, 232/232, 230/230); matching is by NBA identity, never names.

Short windows, multi-season aggregates and earlier cutoffs cannot borrow the snapshots. SQL checks
that the snapshot covers the bound dataset's full phase. Saved investigations/URLs retain the bundle
hash, including unavailable scopes; missing pinned bundles fail explicitly. Cache/cursor identities
bind the eligible raw snapshot. No DARKO output enters points-forecast features.

## Verification

- `courtlens refresh-darko`: six successful paced dated acquisitions; source/refusal behavior tested
  using HTTP 403/429, retained robots disallow metadata and crawl-delay enforcement.
- Ruff check/format and strict mypy: zero issues. Dashboard lint and typecheck: zero issues.
- Full isolated PostgreSQL Python suite: **2053 passed, 1 skipped, 24 deselected**, 449.72 seconds.
  The skipped test requires a separately configured assistant browser fixture; published-data and
  deliberate kernel-limit tests were deselected by the normal runner. **17 dependency warnings**:
  google-genai/Python 3.14 deprecation and scikit-learn/SciPy's existing `iprint` solver warning.
  Full output: [python-tests.log](python-tests.log).
- After the final cursor/default-sort changes, the focused PostgreSQL/parser/Stats run passed
  **54 tests**. Final URL validation, unavailable-bundle pinning and forecasting guard checks:
  **32 passed** (10 DARKO + 22 impact). [targeted-python-tests.log](targeted-python-tests.log).
- Vitest: **453/453**. Production webpack build passed.
- Affected browser set (DARKO, Stats follow-ups, preview, search/readability, glossary, workbench):
  **33 passed, 1 pre-existing failure**. Failure: `workbench.spec.ts:72`, Teams' ambiguous
  `getByText("Toronto Raptors")`, already recorded before this work. Every Stats-specific test passed,
  including opening the blue hover link, default sort direction/reset and short-window missingness.
- Stats desktop/phone screenshot baselines regenerated for the DPM/source credit changes, then
  verified **2/2**. Real FastAPI/PostgreSQL screenshots at 1440×900 and 390×844: no page errors or
  horizontal page overflow. [measurements.json](measurements.json) records geometry and source blue
  `rgb(103, 170, 249)`.

## Glance test

Reviewed `stats-darko-1440.png`, `stats-darko-impact-1440.png`, `stats-darko-hover-1440.png` and
`stats-darko-390.png`. Existing owner-directed Stats layout is retained.

1. Header: pass; NBA Player Statistics, existing title/help rows.
2. Filters: pass; selected state visible, no overlapping/clipped controls, no Load button.
3. First desktop result: pass; frame begins at y=371.5, below 400px.
4. Alignment: pass for the existing Stats layout; metric columns centered with tabular digits,
   matching table/preview frame. Frame bottom y=884 at 900px viewport. Footer controls wrap as
   needed; no overlap with the blue credit.
5. Identity: pass; real headshots/logos, recurring guides preserved.
6. Missingness: pass; nulls remain em dashes, detailed source/hash information inside Data details.
7. Icons: pass; existing wrapper Lucide icons.
8. States: pass; skeleton/sort/reset and unavailable-scope browser checks.
9. Phone: pass; Filters sheet, sticky identity and horizontal table scrolling; body does not overflow.
   The blue source link has a 40px minimum touch target.
10. Dates: pass; actual source date uses the shared display format in the footer.

Source attribution and sample/cohort reference stay beside the result. The signed values and local
percentile numbers remain readable without color. Only the owner can mark Stats aligned.
