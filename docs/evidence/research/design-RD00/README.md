# RD00 — Six-Factor RAPM, rounds 2–5: centred column, Databallr shading, RAPM Ratings tab, larger photos, less caption text

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

## Round 3 — the RAPM Ratings tab (owner, 2026-11-06)

Instruction 3: "Not done: the RAPM Ratings table is still full width and has the old ugly table/container styling."
The tab (`/research/rapm`, formerly queue row RD15, now folded into RD00) is rebuilt in the same pattern. Same
data, filter bar, notices and experiment; design only.

| Before | After |
| --- | --- |
| Full width (1392 px) | `.rs-column`, 992 px centred, filter bar included |
| Boxed `.pc12-headline` leaders chart, four filled stat tiles | Leaders section: the chart in an open region still labelled "Headline result" (PC12: bars on first load at 623 px at 1440 and 711 px at 390, under PC12's 800 px and above the table), then four open facts (`ResearchCards` gains a 4-across layout, 2 × 2 on a phone) |
| Legacy `data-table` in a filled wrapper, unsigned values, minutes to one decimal | The shared `ResearchTable`: search, Min MIN, CSV, count, sortable headers, pinned player column, bars, signed values, whole minutes, a link to each player's Impact Tree. No interval or team is served for these rows, so nothing is coloured, the colour key is hidden, and there is no logo column (`team` is now optional in `ResearchTable`) |
| B26 experiment: three filled tiles under a hairline | A Registered Experiment section; the tiles open (top rule, no fill) |

The PC12 phone rules for the leaders chart (full-width names, source above the bars) were tied to the old
`.pc12-headline` box; they now also apply to the open `.rapm-headline`, so names like Shai Gilgeous-Alexander are
not cut at 390.

| Check | Result |
| --- | --- |
| Lint, typecheck, Vitest | 0 errors, 0 warnings; clean; 805 passed |
| Specs | `r02-six-factor` (one new test: column, no colour, no logo column, no colour key, experiment heading) and `pc12-headlines` 60/60 over three repeats; `advanced-research` passed. `pc12-b-rapm-{1440,390}` baselines regenerated after viewing (layout changed by design; the PC12 assertions themselves passed unchanged except the RAPM selector, now `.rapm-headline`) |
| Full Playwright | First run 581 passed, 17 skipped, 1 failed: `projected-impact.spec.ts` "no frozen row" matched a duplicate streaming copy of a section (a page this round does not touch; passed 25/25 alone). Rerun **582 passed, 17 skipped, 0 failed**; after the headline phone fix, final run **582 passed, 17 skipped, 0 failed**. No committed evidence touched by the runs |
| Real data ([`real-data-check-ratings.json`](real-data-check-ratings.json), [`real-check-ratings.mjs`](real-check-ratings.mjs)) | Every table cell (six ratings, games, minutes), the five leader bars and the facts against `/api/workbench/impact` through the read-only proxy: 2025-26 regular season 215 values, 2018-19 215, 2025-26 playoffs 65, each at 1440 and 390: **0 mismatches**, 0 console errors, 0 overflow, 0 broken images; column 992 px and centred; table unscrolled at 1440 (562 px inside its frame at 390); 0 coloured values; no colour key |
| Six-Factor tab after the shared table change | `real-check.mjs` rerun: 87,138 values, 0 mismatches, unchanged layout figures |
| Screenshots (viewed) | [`ratings-1440.png`](ratings-1440.png), [`ratings-390.png`](ratings-390.png), [`ratings-playoffs-1440.png`](ratings-playoffs-1440.png) |

Glance test for the tab: header and filters as the Six-Factor tab; first screen shows the leaders chart (bars at 623 px at
1440); one left edge; season photos; unknowns "—"; 0 controls under 40 px at 390; 0 px page overflow.

Incident: adding the new stylesheet import before creating the file left the owner's :3100 dev server failing to
compile `globals.css` for a few minutes (Turbopack cached the missing file). Toggling the import line cleared it;
the same stale-CSS cache also hid the headline fix once and was cleared the same way. :3100 verified healthy.

## Round 4 — shading and photos (owner, 2026-11-06)

4. "The page should be shaded like Databallr does it; we are currently only using thin white lines."
5. "Six Factors section: the player photos need to be much larger."
6. "Same goes for Leaders and All Ratings: the player photos are too small, they don't even have player colours in
   the photos, and they're clipped off on the edges."

| Before (round 2–3) | After |
| --- | --- |
| Open blocks: top rules and hairlines only | Databallr's shading in the shared components: cards, glossary entries, method blocks, the table toolbar, the framework grid and tree nodes on a light panel (`--rs-panel`, 4% white, 10% rim, 14 px radius); What Shows Up / Box Scores Miss, the tradeoffs box, steps, formulas and archetype strips on a slightly darker well (`--rs-well`); Offense/Defense cards tinted gold/blue; the factor panel accent-tinted and ringed. Light panels, not round 1's dark surfaces |
| Six Factors estimates: 30 px photos | 64 px season photos in team colour with the logo badge (48 px on a phone) |
| Tables: 30 px photos, grey ring (no team passed) | 40 px, team-coloured ring and fill; the logo column carries the team, so no badge |
| RAPM Ratings: no team served, so no colour or logos | Teams read from the season's six-factor fit (`getSixFactorTeams`, the same served GET): photo colour, logo column, team under the name; footnote says so. A player missing from the fit stays without a team |
| Leaders chart: 30 px photos | 44 px in team colour; the games line starts under the name |

"Clipped off on the edges" was the tight face crop at 30 px: the circle cut through the head. At 40–64 px the same
face-framed crop shows head and shoulders inside the ring, as on the approved Stats table.

| Check | Result |
| --- | --- |
| Lint, typecheck, Vitest | 0 errors, 0 warnings; clean; 805 passed |
| Specs | `r02-six-factor` (round-2 test now asserts the shading, 64 px list photos, 40 px team-coloured table photos; ratings test expects the logo column) and `pc12-headlines` 60/60 over three repeats. Baselines `pc12-b-rapm-{1440,390}` and `whats-new-{desktop,phone}` regenerated after viewing (photos; Patch Notes' shared cards now shaded) |
| Full Playwright | **582 passed, 17 skipped, 0 failed**; no committed evidence touched |
| Real data | RAPM Ratings: 1,170 values (now including each row's team against the six-factor feed and the 40 px photo size), 0 mismatches. Six-Factor: 87,138 values, 0 mismatches. Both at 1440 and 390 over three scopes: 0 console errors, 0 overflow, 0 broken images, tables unscrolled at 1440 |
| Screenshots (viewed, every photo loaded before capture) | all seven PNGs in this folder retaken |

Shared effect: Learning, Patch Notes and the Research landing use the same cards, so they are shaded too.

## Round 5 — caption text (owner, 2026-11-06)

7. "There is a lot of caption text on this page, like 'Rule:' in this image. If it is non-essential we should remove
   it, if it takes away from the key takeaway/point."

Every caption on both tabs was listed and given one fate. The rule: keep what changes how a number is read or is a
required honesty statement (confounding, unknowns, overlapping intervals, no interval); move method detail into the
collapsed Caveats & Methodology (in the DOM, so nothing is lost); cut repeats.

| Caption | Fate |
| --- | --- |
| Archetype cards: "Rule: … RAPM 80% interval …" | **Cut from cards.** Rules listed in a new methodology block, "How the Archetypes Are Picked"; the RAPM value keeps its interval colour, and the interval is in the table and tree |
| Archetype intro (two sentences on rules and "not a claim…") | **Shortened** to "Six different routes to impact in 2025-26."; the "not a claim the player is the best" sentence moved with the rules |
| How It Works, card 2: player count and 12-season range | **Cut**; the range is in the Caveats, the R² stays |
| How It Works, card 3: admitted games, fit date, players in the fit, rated | **Moved** to the Stints step in The Regressions |
| Framework: "Databallr quotes 0.985 for its own pooled fit." | **Cut** here; the Caveats already compare with 0.985 |
| Six Factors: "Order follows the estimates. Where intervals overlap…" | **Cut**; How to Read the Numbers keeps the overlap rule |
| Tradeoffs lead-in | **Shortened** ("oTS against oREB for the archetype players.") |
| Scatter note | **Shortened** to the one point: no interval for these sums, so nearby dots are not separated |
| All Ratings footnote (units, sorting) | **Shortened**: the interval line, the unrated count with the Impact Tree pointer, the Stats link. Units stay in How to Read |
| Impact Tree aside "Any player, 2025-26 · Regular Season" | **Cut**; the filter bar shows the scope |
| Impact Tree second note (R² repeat) | **Shortened** to "the bottom row does not sum to the middle"; the rebuild sentence stays |
| RAPM Ratings: chart note "Blue = 1Y RAPM; descriptive…; intervals…" | **Cut**; the notice above and the intro link carry both |
| RAPM Ratings facts: "In the served impact cohort", "Scheduled games in this scope", season under the date | **Cut**; the leader's name stays under the top value |
| RAPM Ratings table footnote | **Shortened** to "Top 20 by 1Y RAPM. Uncoloured: no interval is served here (see the Six-Factor tab)." |
| Kept as they are | Taglines, the confounding notice and its Why?, the How to Read units, examples and no-prior note, the Two Ways examples, the rebuild sentence, unknown and playoff notices, every caveat, chart source and sample lines, the credits |

| Check | Result |
| --- | --- |
| Lint, typecheck, Vitest | 0 errors, 0 warnings; clean; 805 passed |
| Specs | `r02-six-factor` 14/14 (archetype test now asserts no "Rule:" on cards and each rule in the methodology list). Baselines `pc12-b-rapm-{1440,390}` and `pc11-six-factor-phone` regenerated after viewing (captions removed) |
| Full Playwright | **582 passed, 17 skipped, 0 failed**; no committed evidence touched |
| Real data | Six-Factor 87,162 values (now also: no "Rule:" on any card, each rule in the methodology list; coverage and player counts read from the methodology's Stints step) and RAPM Ratings 1,170, both 0 mismatches over three scopes at 1440 and 390; 0 console errors, 0 overflow, 0 broken images. Screenshots in this folder retaken with every photo loaded and viewed |

## Round 6 — clearable Impact Tree (owner, 2026-11-06)

Owner: "Does there always need to be a player in the Impact Tree? Why can't I remove a player? The x button doesn't work."

**Cause.** The X did clear the picker, but clearing removed `player` from the URL, and a missing `player` means "open
on the top RAPM player", so the same player came straight back. The section was also only drawn while a player was set.

**Change (design only, no API change).** The top RAPM player still fills the tree on first load (the first-load
default). Clearing the picker now stores `player=none`: the section keeps its heading and picker and shows "No player
selected" with a search prompt and a "Show {leader}" button that puts the top RAPM player back. The empty state
survives a reload and a shared link. The lookup failure's "Clear selection" button leads to the same empty state.

| Check | Result |
| --- | --- |
| Lint, typecheck, Vitest | 0 errors, 0 warnings; clean; 805 passed (in the repo; the sandbox lacked the root README that `research-facts.test.ts` reads) |
| Specs | `r02-six-factor` 15/15, three repeats (45/45). New test: remove via X, URL `player=none`, empty state with no tree nodes and the picker, still empty after reload, "Show Kawhi Leonard" restores the tree and every node matches the fixture. The mock lookup gained the fixture leader (202695) so the chip renders |
| Full Playwright | **583 passed, 17 skipped, 0 failed**; no baseline changed (the first-load tree is unchanged) |
| Real data | `tree-clear-check.mjs` on the owner's :3100 (live API, GET only) at 1440 and 390: X clears, URL `player=none`, empty state, kept after reload, "Show Kawhi Leonard" restores him, a search for Jokić loads his tree; 0 console errors, 0 overflow |
| Screenshots | `tree-empty-1440.png`, `tree-empty-390.png` (viewed) |

## Credits

Design reference: Databallr's Six-Factor RAPM explainer and ShotQuality RAPM table. Method: RAPM after Rosenbaum (2004)
and Sill (2010); factors after Dean Oliver's Four Factors; the six-factor split after Databallr's framework. Data: NBA
play-by-play (PlayByPlayV3) via shufinskiy/nba_data; every value is CourtLens's own fit.
