# Design 18 — Six-Factor RAPM redesign (Research design phase, page 1)

Measured 2026-11-06 on branch `design-18` from `research` (`c8d0ff0`). Parents: [Research progress](../../../research-progress.md),
[Research handoff](../../../research-plan.md) D13, [alignment catalog](../../../databallr-alignment-catalog.md) row 18. Page:
`/research/rapm/six-factor`. **Awaiting the owner.** Only the owner marks ✅.

Design only. R02's API, frozen fits, intervals and unknown states are unchanged: no Python file was touched, nothing was
fitted, the shared Postgres was only read.

## Reference

The owner supplied saved Databallr pages `six-factor-rapm` and `shotquality` and seven screenshots (Six-Factor
explainer from the header to the archetypes; ShotQuality table, How to Read the Numbers, Column Glossary and the open
methodology). databallr.com was not fetched. No Databallr capture is committed.

Owner decisions on the gaps (2026-11-06): per-player notes become CourtLens's factor copy plus data lines; the
Net Efficiency vs Possession Control scatter stays under the two cards; the sticky filter bar stays above the hero; the
ratings table follows the ShotQuality table with every interval kept.

## Reference against the page

| Databallr shows | CourtLens now | Gap |
| --- | --- | --- |
| Centred title, subtitle, tagline, Stats and first-chance tree links | Centred header with book icon and subtitle, centred tabs, filter bar, centred tagline, links to Stats and the Impact Tree | — |
| The Framework: prose with R² 0.985, 3 × 2 grid with selectable cells | Prose with the leader's RAPM and CourtLens's measured R² (0.955 for 2025-26, 0.952 held out); the same grid, a cell selects the factor | R² is CourtLens's own |
| How It Works: three cards (regressions, R² reconstruction, 6-year time decay) | Three cards: independent regressions; R² reconstruction (season, held-out, 12-season range); one season and 200 resamples with admitted games, fit date and player counts | **No time-decay pool**: CourtLens serves one-season fits. Databallr's "residual < 0.6 per player" is not served, so not shown |
| The Six Factors: six tabs over a framed panel; tagline, description, What Shows Up / What Box Scores Miss, Elite Positive (4) / Notable Negative (3) with hand-written notes, Cross-Factor Tradeoffs | Same layout. CourtLens copy per factor with its season weight; Highest (4) / Lowest (3) estimates with photo, team and 80% interval; tradeoffs box: the factor beside its pair for the season's archetype players, numbers only | **Hand-written per-player notes** not reproduced (owner's choice) |
| Two Ways to Slice the Grid: Net Efficiency and Possession Control cards with formulas and an example | Same cards with the season's numeric weights in the formulas and the largest value as the example; R02's scatter below | — |
| Player Archetypes: 3 × 2 cards, label, Net, name, six-factor strip, prose | Same cards with photo and logo, RAPM, the strip (the archetype's factors in bold) and the printed rule with the RAPM interval | Prose is the rule (owner's choice); archetypes are CourtLens's own six rules |
| Caveats & Methodology, collapsed | Collapsed: Caveats, The Regressions (five numbered steps), Data & Credits | Databallr's collapsed content was not visible |
| ShotQuality table: search, min poss, team, Methodology, CSV, count, Offense / Defense / Combined, logo, photo, bar and value, sticky header, legend | Same: search, Min MIN, team, Methodology, CSV, count, Combined / Offense / Defense, logo, season photo, bar and value with the interval under it, sticky header and pinned columns, colour key, a link to each Impact Tree | **Minutes, not possessions** (not served) |
| How to Read the Numbers, Column Glossary | Units, colour key, offense and defense examples; glossary cards in Total / Offense / Defense / Sample groups | — |
| `/decomp` first-chance tree (no screenshot; a mock-up with fake data) | R02's real Impact Tree, restyled: offense nodes ringed gold, defense blue | No reference |

Colour follows the owner's rule, not Databallr's gold/cyan signs: a value is green or red only when its 80% interval
excludes zero; values without an interval (Net Efficiency, Possession Control, every playoff value) stay neutral.
Gold and blue mark Offense and Defense only.

## Reusable pattern

Recorded in the [alignment plan](../../../databallr-alignment-plan.md) Patterns ("Research pages"):

- `components/research/research-page.tsx` + `.css`: `ResearchIntro`, `ResearchSection`, `ResearchProse`,
  `ResearchCards`/`ResearchCard`, `FormulaLine`, `SignalValue`, `ResearchTabPanel`, `FeatureList`, `RankedList`,
  `ResearchCallout`, `ReadingGuide`, `ToneLegend`, `Glossary`, `MethodSteps`, `MethodBlock`, `ResearchDisclosure`.
- `components/research/research-table.tsx` + `.css`: `ResearchTable` (ShotQuality table) with typed columns, views,
  filters, CSV and the interval colour rule.
- `lib/research-values.ts`: `intervalTone`, `signed`, `intervalLabel`, `toCsv`.
- A centred header through `TabbedPage` (`hero: { icon }`), styled in `app/styles/foundation.css` beside the Compare
  header it reuses.
- Two Lucide icons added to the wrapper: `layers`, `crosshair`.

## Verification

| Check | Result |
| --- | --- |
| Dashboard lint (ESLint + Stylelint) | 0 errors, 0 warnings |
| Typecheck | clean |
| Vitest | 742 passed (7 new: `lib/research-values.test.ts`, `components/research/research-table.test.tsx`) |
| Python | not run: no Python file changed |
| Page Playwright (`e2e/r02-six-factor.spec.ts`, real-API fixture `e2e/fixtures/six-factor-page.json`) | 11 tests, 33/33 over three repeats |
| Visual baselines | `pc11-six-factor-{desktop,phone}` and `pc12-b-rapm-{1440,390}` regenerated: the page and its shared header changed by design; all four viewed |
| Full Playwright (production build sandbox, mock API 4180, dashboard 3180, 2 workers, 8 GiB) | First run 569 passed, 17 skipped, 2 failed: the RAPM Ratings tab's `pc12-b-rapm` baselines (1440, 390). They predated R02 (old "RAPM Research" title) and had passed inside the pixel tolerance; the centred shared header pushed them over. Regenerated and viewed (the tab belongs to this page). Rerun: **571 passed, 17 skipped, 0 failed**; `git status` clean of evidence changes |
| Real data ([`real-data-check.json`](real-data-check.json), [`real-check.mjs`](real-check.mjs)) | Private API on 4180 (worktree code, shared Postgres read only), production build on 3180. Every table cell in all three views (value, interval, tone, unknown "—"), every factor's highest and lowest lists, archetype RAPM, strips and rules, R², weights in both formulas, composite leaders, counts, scatter points and all nine tree nodes equal the API: 2025-26 regular season 22,126 values, 2018-19 21,008, 2025-26 playoffs 435, each at 1440 and 390. **0 mismatches**, 0 console errors, 0 horizontal overflow, 0 broken images |
| Screenshots | [`six-factor-1440.png`](six-factor-1440.png), [`six-factor-390.png`](six-factor-390.png), [`six-factor-playoffs-1440.png`](six-factor-playoffs-1440.png), [`six-factor-playoffs-390.png`](six-factor-playoffs-390.png) (unknown intervals, no colour), [`six-factor-dts-methods-1440.png`](six-factor-dts-methods-1440.png) (dTS tab, methodology open); viewed, and compared side by side with the owner's screenshots. Small and large values stay legible: −0.00 to +9.61 in the strips and table, 2,953 minutes, interval text at 12 px |

For the full-page captures the sticky filter bar was made static; lazy photos were loaded by scrolling first.

## Glance test (1440 × 900 and 390 × 844)

| # | Item | 1440 | 390 | Note |
| --- | --- | --- | --- | --- |
| 1 | Header | pass | pass | "Six-Factor RAPM" matches the nav label; one subtitle line; centred icon and title (the title text sits 14 px right of centre, the width of the 20 px icon and its gap); subtitle and tagline centred at 0 px |
| 2 | Filters | pass | pass | One filter bar in the shared place; Season and Phase 40 px; no Load button; collapses to Filters on the phone |
| 3 | First screen | partial | partial | The Framework starts at 386 px (1440) and its measured R² line at 540 px, no notice box before it (regular season). Its prose runs three lines, as in Databallr's explainer, which the owner asked to follow |
| 4 | Alignment | pass | pass | Tokens only (Stylelint); shared left edge for every section; table numbers right-aligned with tabular digits |
| 5 | Identity | pass | pass | Season photos with logo badges in lists, cards and the tree; a logo column in the table; Offense/Defense in identity gold/blue |
| 6 | Missing data | pass | pass | Unknowns are "—" or "Unknown", never zero; playoffs add one line; hashes only in Data details |
| 7 | Icons | pass | pass | Wrapper Lucide only (two added: layers, crosshair); 20 px headings, 16 px inline, 14 px glossary labels |
| 8 | States | partial | partial | Error and no-fit states are one line with an action; loading is the shared `FeedSkeleton`, not this layout (unchanged from R02) |
| 9 | Phone | — | pass | 0 px sideways scroll; every control at 390 measures 40 px or more (0 smaller); the table scrolls inside its frame with pinned logo and player columns |
| 10 | Dates | pass | pass | "Apr 12, 2026" |

## Not verified or left open

- **Hosted demo:** not deployed (standing rule).
- **The picker chip** still shows the player's current photo (R02 note); every other photo is season-correct.
- **Loading state** is the shared `FeedSkeleton`, not a skeleton of this layout (unchanged from R02).
- **Databallr's collapsed Caveats & Methodology** and its `/decomp` page were not in the screenshots.

R16 constraints observed: no Ask or provider calls, the main `.venv` unchanged, the shared Postgres only read (release
`a584c88b` untouched), `~/dev/courtlens-r16` and `research-r16` untouched.

## Credits

Design reference: Databallr's Six-Factor RAPM explainer and ShotQuality RAPM table. Method: RAPM after Rosenbaum (2004)
and Sill (2010); factors after Dean Oliver's Four Factors; the six-factor split after Databallr's framework. Data: NBA
play-by-play (PlayByPlayV3) via shufinskiy/nba_data; every value is CourtLens's own fit.
