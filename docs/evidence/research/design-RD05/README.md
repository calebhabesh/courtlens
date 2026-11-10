# RD05 Defensive Shot Quality: design evidence

Research → Defensive Shot Quality (`/research/defensive-matchups`), redesigned after Databallr's saved "Defensive Shot Quality -
NBA Defense Analytics" page (`/d-shotquality`). Instructions and status: [research design catalog,
RD05](../../../research-design-catalog.md#rd05-defensive-shot-quality--).

## Reference

`~/Downloads/Webpages/Defensive Shot Quality - NBA Defense Analytics _ databallr.html`. The file the owner attached in round 1,
`~/Downloads/Projects/Courtlens/ShotQuality RAPM - Scoring Impact Decomposition _ databallr.html`, is another save of
`/shotquality` (RD04's page; its text equals the LocalSend copy but for one stray number), so the Webpages save was used. It was
rendered offline: scripts stripped, a `<base>` added, `crossorigin` removed so the local stylesheet loads, and every
non-`file://` request blocked. databallr.com was never fetched. Measured: the card column is about 1368 px at 1440; three cards
across, one on a phone; search 320 px; the Team button 40 px; shot-type buttons 32 px. Reference screenshots are not committed
(third-party page).

Before shots of the old page: `before-1440.png`, `before-390.png`.

## Round 1 (owner, 2026-11-08)

"Yes, go with your recommendations for an optimal layout and presentation of this page. Comprehensively build out the page
now." The nine recommendations are recorded with the instruction in the catalog.

**Built**

- `components/defensive-shot-quality-view.tsx`, rewritten. RD04's centred hero (`PageHeader` with the `sq-hero` classes, shield
  tile) and 1352 px column. A toolbar panel: the Stats table search (`GridSearch` markup) filtering the cards by name, then a
  season select (2017-18 on), Rank by (our stand-in for Databallr's Data Source), the site's `TeamPicker` and the global All /
  2PT / 3PT; under them the 95% colour key and the defender count.
- The three shot-type boards of the season, sort and team load together and join by player, so every card has its own All / 2PT
  / 3PT (starting from the global one) without a request; the order is the global type's, exactly as the API ranks it. A search
  keeps each card's #N from the full list.
- Cards after Databallr's: a subdued team-colour tint and the team's logo watermark (identity only), a 60 px season photo
  (`PlayerAvatar`), the name, the logo beside the code, the D-SQ RAPM chip with its 80% interval under it ("The decomposition
  starts in 2022-23." before), the #N badge, the card's switch, a D-SQ per 100 tile (value over its 95% interval, rank), then
  Matchup shots, Expected PPS and Actual PPS tiles with ranks, and Key Matchups on `StatsGrid` (shooter with logo, photo and
  code; FGA, xPPS, PPS). Databallr's 2nd Defender tiles are left out; a line under the cards says why.
- Colour: green/red only where the served interval excludes zero (D-SQ 95%, the RAPM chip 80%); expected and actual PPS never.
  The old page coloured by sign (Capela's RAPM +0.23 was green with an interval of −0.05 to +0.50).
- Under the cards: How to Read the Cards (three short reading notes and a worked example from the season's top D-SQ), Glossary
  (the served definitions, once), Is It Signal? (three tiles and the six reported checks on `StatsGrid`) and collapsed Caveats &
  Methodology (hindsight and the interval, the by-season table on `StatsGrid`, the Tracking page link, credits with the reference
  note, the hashes).
- `components/defensive-shot-quality-view.css`, imported after `shot-quality-research.css`.
- No API, analysis or result changed. The mock fixture (`e2e/fixtures/shot-decomposition.json`) gained five real boards from the
  owner's API (2025-26 2PT; 2019-20 2PT and 3PT; Boston 2PT and 3PT), `unknown` trimmed to five like the existing boards.

**Checks**

- Lint 0 errors / 0 warnings (ESLint and Stylelint), typecheck clean, Vitest 820 passed. No Python changed.
- `r06-decomposition` (RD04's decomposition tests and the rewritten Defensive Shot Quality tests: every value, rank, tone and key
  matchup of the first six cards, paging, per-card and global switch, search and team picker, the pre-2022-23 RAPM unknown, phone
  overflow): 9/9 three times on the final build, with the mock API's real-answer fixtures.
- Full Playwright in a sandbox (`systemd-run`, MemoryMax=8G), four runs across the round's builds: 594, 596, 597 and (final
  build) 597 passed, 17 skipped. Final run: 3 failed, all `r10-wingspan-calculator` under load (11/11 alone). Earlier runs'
  failures were the same Wingspan flake plus load timeouts in `r05-shot-quality` and `r09-draft-classes` (24/24 alone, twice)
  and once RD04's `side=combined` URL wait (9/9 alone, three times); none of those pages changed.
- Real-data check (`real-check.mjs` through `readonly-proxy.mjs`, GET only, 4180 → :8000; production build on 3180), seven scenes
  at 1440 and 390 (default with all 329 cards paged in, 3PT, 2019-20, Rank by RAPM, Boston through the picker, every shown card
  switched to 2PT, search): **67,960 values, 0 mismatches**; 0 console errors, 0 overflow, 0 broken images, no phone control under
  40 px; three card columns at 1440 and one at 390; hero glyph and title offsets 0 px. Rendered colour: one green and one red
  across every toned value (the chip included), and no untoned value in either. `real-data-check.json`.
- Found and fixed in the check: the chip's white text overrode the green of an interval-excluding RAPM (Grant Williams +0.64).
- Glance test (screenshots viewed): the title, the ranked defenders and their green D-SQ with ranks read at once; the RAPM chip
  and Key Matchups second; photos match the season (2019-20: Anderson in Memphis, Gobert in Utah).
- Screenshots: `dq-{default,3pt,2019-20,team-bos,card-2pt,search}-{1440,390}.png` (real data).

## Round 2 (owner, 2026-11-08)

"remove the team logo under the cards. It's a little distracting. The team color match is enough." (Screenshot: the first three
cards.)

**Built**

- The team logo watermark behind each card is removed (`TeamWatermark` and its CSS). The team-colour tint stays, as do the
  logo badge on the photo and the logo beside the team code (the site's logo rule).

**Checks**

- Lint 0 errors / 0 warnings, typecheck clean, Vitest 820 passed.
- `r06-decomposition` 9/9 three times; it now also asserts no image behind a card.
- Full Playwright in the sandbox: 597 passed, 17 skipped, 3 failed, all `r10-wingspan-calculator` under load (11/11 alone).
- Real-data check, the same seven scenes at 1440 and 390: **67,988 values, 0 mismatches**; 0 console errors, 0 overflow, 0 broken
  images, no phone control under 40 px; new checks: 0 watermarks, every card tinted.
- Glance test (screenshots viewed): the cards read as the defender, the D-SQ value and the ranks, with the team only in the tint,
  the badge and the code. Screenshots replaced: `dq-*-{1440,390}.png`.

## Round 3 (owner, 2026-11-08)

The owner asked whether Key Matchups should be searchable, to see how a defender did against different players. The frozen
results keep five key matchups per defender, so a search inside the card would need new data; the recommendation was to link
to Player Matchups (`/matchups`, NBA tracking's season matchups, which already searches everyone a player guarded and opens any
head-to-head). Owner: "Sounds good build it comprehensively."

**Coverage check (before building, GET only on the owner's API).** Player Matchups answers 2017-18, 2019-20, 2022-23 and
2025-26 with a defence list for each of the top 12 defenders (244 to 377 opponents each), and all 96 sampled key-matchup pairs
(two per defender) are served.

**Built**

- `matchupsHref(season, defender, shooter?)` builds `/matchups?season=…&side=defense&playerId=…[&opponentId=…]`.
- The Key Matchups head of each card gains an "All matchups →" link (kit `ButtonLink`, 40 px on a phone) opening everyone the
  defender guarded that season; each shooter's name in the table opens that head-to-head (it used to open the shooter's player
  page; the defender's name still opens theirs).
- The source is said once in each place a reader meets it: the line under the cards, the glossary (Key Matchups, All
  matchups) and Caveats & Methodology. Player Matchups is NBA tracking (minutes, partial possessions, points, FG%), with no
  expected PPS, so its numbers differ from the cards'. It shows a player's latest team: Anthony Davis is DAL on Capela's card
  (his team in those games) and WAS on the head-to-head.

**Checks**

- Lint 0 errors / 0 warnings, typecheck clean, Vitest 822 passed (new `defensive-shot-quality-view.test.ts`, the link builder).
- `r06-decomposition` with `pc11-gated-pages` (Player Matchups' own spec): 17 tests; three runs: 16 passed and 1 URL wait
  failed on the first run against the freshly started server, then 17/17, 17/17, and 68/68 with `--repeat-each 4`. The new test
  checks every link of the first six cards and clicks through both kinds.
- Full Playwright in the sandbox: 595 passed, 17 skipped, 6 failed: `r10-wingspan-calculator` (4), `r09-draft-classes` (1) and RD04's
  `side=combined` URL wait (1), under load (load average about 20 during the run). Alone at the default workers r06 and r09 pass
  and r10 fails again 4 times; with two workers all three specs pass 28/28. None of those pages changed.
- Real-data check, nine scenes at 1440 and 390 (the seven before, plus following the first three cards' links in 2025-26 and
  2017-18): **80,616 values, 0 mismatches**, including every card's All matchups and head-to-head hrefs, Player Matchups opening
  on the right defender ("Who … guarded") and showing the shooter in the pair; 0 console errors (both pages), 0 overflow, 0 broken
  images, no phone control under 40 px.
- Glance test (screenshots viewed): the link sits on the Key Matchups line, quiet but obvious; the head-to-head opens with both
  players and their numbers. New screenshots: `dq-card-links-*.png`, `dq-to-all-matchups-*.png`, `dq-to-head-to-head-*.png`;
  the others replaced.

