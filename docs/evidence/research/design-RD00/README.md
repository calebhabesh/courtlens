# RD00 — Six-Factor RAPM, round 2: centred column, open layout

Measured 2026-11-06 on branch `research` from `a1fd129`. Parents: [Research design catalog](../../../research-design-catalog.md)
RD00, [Research progress](../../../research-progress.md), round 1 in [design-18](../design-18/README.md). Page:
`/research/rapm/six-factor`. **Awaiting the owner.** Only the owner marks ✅.

Design only. No Python, API, fit, interval or unknown state changed; the shared Postgres was only read.

## Instructions (owner, 2026-11-06)

1. Move from a full-width page to a centred column like Databallr, and do this for pretty much all the Research
   pages: full width makes the containers bulky and the site hard to read.
2. Move away from containerizing everything; make it look aesthetic without boxing every block.

References: three new owner screenshots of Databallr's Six-Factor page (header to archetypes, and the open Caveats &
Methodology) and the saved page `~/Downloads/Webpages/DraftBallr/Six-Factor RAPM _ databallr.html`, rendered offline
with every network request blocked. databallr.com was not fetched.

## What changed

| Before | After |
| --- | --- |
| Content 1392 px wide at 1440 | `.rs-column`: a 992 px centred column (Databallr's measured width) holding the filter bar and every section; 224 px each side at 1440, 12 px at 390 |
| Cards filled on surface-1 with a ring (How It Works, Two Ways to Slice, archetypes, reading examples) | Open: a 2 px top rule, gold/blue for Offense/Defense identity, text on the page background |
| Factor panel framed and tinted; What Shows Up / What Box Scores Miss on wells; tradeoffs box | Open under the tabs; lists on the page; tradeoffs as a left accent rule |
| Glossary entries as 13 boxed cards | A two-column definition list divided by hairlines |
| Caveats & Methodology as three boxed blocks, steps on wells | Blocks divided by a hairline; numbered steps without wells |
| Table toolbar on a panel | Controls on the page |
| Archetype six-factor strip on a well | Hairlines above and below |
| Framework grid on surface-1 | Kept as a grid (hairline frame, no fill) |
| Ratings table: 120 px value columns, would scroll 88 px in the column | Widths by content: 128 px with an interval, 96 px without (Net Eff, Poss Ctrl), 64 px counts, 184 px player; 24 px bars. Every view fits 992 px unscrolled |
| Long names at 390 ran 24–53 px under the RAPM values (found in the review) | Names wrap inside the pinned column at every width (override in the `foundation` layer, where identity names are styled) |

Kept framed on purpose: the ratings table, the framework grid and the Impact Tree nodes (a table, a grid and a
diagram). Recorded as the pattern in the [alignment plan](../../../databallr-alignment-plan.md) "Research pages".

**Shared effect.** The open cards are shared: Learning, Patch Notes and the Research landing (RD06, RD07, RD09) now
show open cards too, still at full width until their own design turn. All three checked at 1440 and 390: 0 console
errors, 0 overflow. Patch Notes' two baselines were regenerated (below).

## Verification

| Check | Result |
| --- | --- |
| Dashboard lint (ESLint + Stylelint) | 0 errors, 0 warnings |
| Typecheck | clean |
| Vitest | 805 passed |
| Python | not run: no Python file changed |
| Page Playwright (`e2e/r02-six-factor.spec.ts`) | 33/33 over three repeats; two new tests (centred column with open cards and an unscrolled table in all three views; names inside the pinned column at 390) 6/6 over three repeats |
| Full Playwright (production build sandbox in `~/.cache/courtlens-tmp`, fixture API 4180, dashboard 3180, 2 workers, 8 GiB) | 577 passed, 17 skipped, 4 failed: the `pc11-six-factor` and `whats-new` baselines at desktop and phone, changed by design. All four diffs viewed (open cards and the column; Patch Notes also carried already-committed content its old baseline tolerated), regenerated; `visual-baselines.spec.ts` rerun 84/84. Net **581 passed, 17 skipped, 0 failed**. `git status` showed no evidence file touched by the run |
| Real data ([`real-data-check.json`](real-data-check.json), [`real-check.mjs`](real-check.mjs)) | The owner's API on :8000 through a read-only proxy on 4180 (GET/HEAD/OPTIONS only; POST refused 405), production build on 3180. 2025-26 regular season 22,126 values, 2018-19 21,008, 2025-26 playoffs 435, each at 1440 and 390: **0 mismatches**, 0 console errors, 0 page overflow, 0 broken images. Layout per view: table sideways scroll 0 at 1440 (Combined, Offense, Defense), 610 / 546 / 546 px inside its frame at 390; 0 names outside the pinned column |
| Screenshots (viewed) | [`six-factor-1440.png`](six-factor-1440.png), [`six-factor-390.png`](six-factor-390.png), [`six-factor-playoffs-1440.png`](six-factor-playoffs-1440.png) (unknown intervals, no colour), [`six-factor-methods-1440.png`](six-factor-methods-1440.png) (dTS tab, Caveats & Methodology open) |

For full-page captures the sticky header and filter bar were made static and lazy photos loaded by scrolling first.

## Glance test (1440 × 900 and 390 × 844)

| # | Item | 1440 | 390 | Note |
| --- | --- | --- | --- | --- |
| 1 | Header | pass | pass | Unchanged: centred icon and title (text 14 px right of centre, the icon and its gap), one subtitle line |
| 2 | Filters | pass | pass | One filter bar, now aligned to the column; collapses to Filters on the phone |
| 3 | First screen | partial | partial | The Framework starts at 402 px (1440) and 454 px (390); its prose runs three lines at 1440, as in Databallr |
| 4 | Alignment | pass | pass | One left edge for every section (224 px at 1440); column centred to 0 px; tokens only (Stylelint) |
| 5 | Identity | pass | pass | Season photos with logo badges; logo column in the table; gold/blue only for Offense/Defense |
| 6 | Missing data | pass | pass | Unknowns "—" or "Interval unknown", never zero or coloured; playoffs explain the missing weights in one line |
| 7 | Icons | pass | pass | Wrapper Lucide only; no new icons |
| 8 | States | partial | partial | Error and no-fit states unchanged; loading is still the shared `FeedSkeleton` |
| 9 | Phone | — | pass | 0 px page overflow; 0 controls under 40 px; the table scrolls in its frame under pinned logo and player columns |
| 10 | Dates | pass | pass | "Apr 12, 2026" |

## Not verified or left open

- **Other Research pages** get the centred column in their own turns (RD01 onward); only the shared open-card style
  reached Learning, Patch Notes and the landing now.
- **The picker chip** still shows the player's current photo (R02 note).
- **Hosted demo:** not deployed (standing rule).

R16 constraints observed: no Ask or provider calls, `~/dev/courtlens-r16` untouched, shared Postgres only read, the
owner's :8000 and :3100 servers not restarted.

## Credits

Design reference: Databallr's Six-Factor RAPM explainer and ShotQuality RAPM table. Method: RAPM after Rosenbaum (2004)
and Sill (2010); factors after Dean Oliver's Four Factors; the six-factor split after Databallr's framework. Data: NBA
play-by-play (PlayByPlayV3) via shufinskiy/nba_data; every value is CourtLens's own fit.
