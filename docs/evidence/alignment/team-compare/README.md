# Team Comparison (`/team-compare`) — 2026-10-17

Alignment row 15. `/team-compare` is a single centered 920px comparison card pairing two team seasons side by side:

- **Team identity & series score:** Square `176×176` (`112×112` on phone) team-tinted logo panels with in-place franchise picker triggers (`TeamGrid` with `edgeHighlights={false}`), full franchise names (`Oklahoma City Thunder`, `Boston Celtics`, etc.), per-team season selectors, and season/playoff series win counts (`32px` desktop / `24px` phone) centered between each team's logo box and the center `-` hyphen above `vs`.
- **Paired player rotations & verified starting units:** Release-bound offline read-only starting-lineup snapshot (`starter-evidence.bf09e1d964030a116b25996df57e53b051f5f45500e0343781a9d7784bc3d563.json`) derived from admitted raw NBA box-score `position` fields splits `By Position` into **Most-used Starting Five** (`G`, `G`, `F`, `F`, `C`) and **Bench & Alternate Starters** sorted by team minutes. Outer-edge player values (`20px` desktop / `16px` phone) use semibold `600` weight and team-tinted fill on the leading side of each pair (`400` on the trailing side).
- **Team Stats & Edit Metrics drawer:** Searchable `Edit Metrics` drawer in the scope console customizes both `Rotation Metrics` (20 metrics across Impact, Counting, Shooting & Efficiency, and Exposure) and `Team Stats` (25 metrics across Overview & Record, Pace & Efficiency, Scoring & Shooting, and Four Factors Offense/Defense).
- **Docked `Game History` tray:** Selectable games with full dates, venue and score sit above two compact team totals tables. Shooting uses `Team / FG / 3P / FT`; counting uses `Team / REB / AST / TOV`. Each team has one labelled row in each table. Player box scores sit below with `Top 5` / `Full Box`, fetched on demand from `/api/live/historical`. Games and tables sit side by side on desktop and stack on phones.

## Game History repair, 2026-10-17

The owner's 3100 dev server reproduced the reported jumbling in a fresh browser. Its markup was
current, but the compiled stylesheet still contained the earlier table/pill rules and omitted the
new scoreboard and total-value layout selectors. The production-only verification missed this
runtime mismatch. [The before-state record](repair/before.json) records the absent selectors and
the compiled stylesheet's hash.

The tray now owns `team-game-history.css`, explicitly registered in `globals.css`. The new root
import rebuilt the dev stylesheet. The redesign removes repeated badges and subgrid layouts:
two ordinary totals tables label teams in row headers and metrics in column headers. Selectable
games share a dedicated grid above the tables. The glance test on both desktop and phone confirms
that games, selection, dates, team labels and totals have distinct places.

Run the actual-server guard from the repository root:

```bash
node dashboard/scripts/verify-team-compare-layout.mjs http://localhost:3100
```

It checks the served layout styles, clipping, page overflow, team labels, column alignment,
keyboard game selection and Full Box / Top 5 behavior. Both the [3100 measurements](repair/main.json)
and the [production 3180 measurements](repair/production.json) pass at 1440, 1024 and 390px, with
zero measured column offset, no overflowing content and no browser exceptions. Production used
a read-only proxy on 4180. No shared controls were restyled.

- Current 3100 captures: [desktop](repair/main-1440.png), [tablet](repair/main-1024.png),
  [phone](repair/main-390.png).
- Production captures: [desktop](repair/production-1440.png),
  [tablet](repair/production-1024.png), [phone](repair/production-390.png).
- [Build](repair/build.log), [lint](repair/lint.log), [TypeScript](repair/typecheck.log) and
  [eight Playwright tests](repair/playwright.log) pass, including all four existing page baselines.
- [Vitest](repair/vitest.log) passes all 568 assertions but still exits with the four previously
  recorded header animation-cancellation rejections. Header code and tests remain unchanged.

Row 15 remains ready for owner review. The original measurements and polish logs below describe
earlier iterations; the repair records above verify the current Game History layout.

## Captures & Verification

- Desktop (`1440×900`): [team-compare-1440.png](team-compare-1440.png)
- Desktop with `Game History` open (`1440×900`): [team-compare-game-history-1440.png](team-compare-game-history-1440.png)
- Phone (`390×844`): [team-compare-390.png](team-compare-390.png)
- Measured layout and typography verification: [verification.json](verification.json)

## Earlier polish, 2026-10-17

Game History rows now include calendar years and select the box score directly with a kit button.
The separate game selector is removed. Each totals tile identifies both teams with their logo and
abbreviation. Equal-width columns and shared grid rows center the metric between the values.

Free-throw emphasis uses each team's own totals. Missing, blank and invalid fields produce "—"
for the affected aggregate. Known zeroes remain zero, and known 0/0 shooting displays `0-0` without
an undefined percentage. Team Stats shows FTR to three decimal places and gives pace no leading-side
emphasis. Mobile rotation rows measure 84px, previously 116px, while the default matchup's full
player names remain visible.

- [Desktop Game History detail](team-compare-history-detail-1440.png)
- [Phone Game History detail](team-compare-history-detail-390.png)
- [Phone Team Stats](team-compare-stats-390.png)
- [Final live measurements and interaction results](polish-verification.json)

The live production sandbox at 3180 used a read-only proxy at 4180 to the owner's API. Both
1440px and 390px captures have no page overflow. All six metric labels are within 0.008px of the
horizontal midpoint of their paired values and within 0.5px vertically. Live keyboard selection
loads G2's box score, Full Box shows 11/9 rows, and switching back to G1 correctly emphasizes
Boston's 19/20 FT (95%) over OKC's 13/17 (76%). No browser exceptions occurred. The glance test
confirms that the selected game, both teams and each value's team attribution are visible in the
tray at both widths.

Verification:

- [Production build](polish-build.log), [ESLint/Stylelint](polish-lint.log) and
  [TypeScript](polish-typecheck.log) pass.
- [Playwright](polish-playwright.log): eight tests pass, including unknown versus zero,
  missing/invalid totals, FT emphasis, team labels, date and metric centering, mobile density,
  scope persistence and four visual baselines. The phone rotation baseline was updated for
  the approved density change.
- [Vitest](polish-vitest.log): all 568 tests pass, but the command exits with four unhandled
  `AbortError: The animation was canceled` rejections in `components/ui/header.test.tsx`.
  [The header test run alone](polish-vitest-header.log) reproduces all four rejections.
  The header component and its tests are unchanged by this work.

The original [verification.json](verification.json) records the first integration, and
[polish-verification.json](polish-verification.json) records the earlier paired-tile layout.
The repair records above supersede that layout and its production-only verification.
