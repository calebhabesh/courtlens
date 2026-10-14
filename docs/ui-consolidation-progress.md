# UI consolidation progress

Measured evidence for the [UI consolidation handoff](ui-consolidation-plan.md). Plans and
prose are not runtime verification; each entry records what was run and measured.

## Starting point (2026-10-14)

- Branch `ui-consolidation` from `main` after the Stats/Players alignment checkpoint merged.
- Inventory: ~70 imports of the `components/ui` controls (`Button` 19, `IconButton` 4, `Select` 22,
  `SegmentedControl` 19, `Menu` 8); about 240 raw `<button>`/`<a>` uses of legacy `.button` classes in
  83 files; 53 bespoke control classes in CSS; `components.css` 5,024 lines and `pages.css`
  4,859 lines of 12,698 total; 115 rules targeting `.button`, `.ui-button`, `.ui-select` or
  `.icon-button`.
- UC00 styling-system decision (owner, 2026-10-14): **Tailwind v4**. The owner will keep building
  the project and wants faster development, so the kit is built in Tailwind and controls migrate
  once. Existing `tokens.css` values move into `@theme`; page CSS migrates as each page is touched.

## UC01 — Control spec (2026-10-14)

- Wrote [control kit v1](design/control-kit-v1.md) from measurements of the live local site
  (FastAPI/PostgreSQL through the dev servers, release `23be18f9-…`).
- Measured with `measure-controls.mjs` (Playwright Chromium, dark scheme): 13 pages from the
  Stats 71 survey at 1440x900 and at 390x844 (touch, DPR 2). Excluding 1,300 Stats table-cell
  buttons, 624 desktop and 455 phone controls were measured (box, padding, text, radius,
  colours, gap, ARIA state, icon offsets). Per-page tables, method and data:
  [UC01 evidence](evidence/ui-consolidation/uc01/README.md).
- Findings: every desktop control already uses one of four heights (28/32/36/40) apart from table
  and row targets, the header nav line box and one inline text action. `ui-button-md` renders text
  buttons at 34 px (min-height plus block padding) next to 32 px icon buttons. Phone controls are
  all 40 px except Similar Players' wrapped actions (60 px).
- Owner decisions: **four sizes**, `xs` 28 / `sm` 32 / `md` 36 / `lg` 40 (phone 40 for all), and
  **keep the instruction 71 chevron offset**.
- Mapping: all 110 control-shaped class names in the dashboard CSS. Each maps to `Button`,
  `IconButton`, `Select`, `Segmented`, `MenuTrigger` or `Chip`, or is listed as not fitting the kit
  with its reason (table targets, header nav, list rows, inline text, static badges, inputs). Twenty
  classes have no TS/TSX reference and are recorded as dead CSS for UC05. Legacy `.button-dark` has
  no CSS rule.
- Deliberate changes C1–C12 are listed in the spec. None is applied in UC01; each goes to the owner
  with before/after screenshots in its UC04 batch.
- Verification: docs only, no dashboard code changed, so dashboard lint, typecheck, Vitest and
  Playwright were not run for this block. `tests/unit/test_frozen_identifiers.py` passed (6/6) and
  every relative link in the new docs resolves.

## UC02 — Tailwind control kit (2026-10-14)

- Finished the inherited, uncommitted kit on `ui-consolidation`: `Button`, `ButtonLink`,
  `ButtonSummary`, `IconButton`, native `Select`, `Segmented`, `MenuTrigger`, `Chip` and
  `RemovableChip`, exported from `components/ui/kit`. Existing components and page callers
  stay in place for UC04; the only page addition is the required section at `/design#control-kit`.
- Tailwind and its PostCSS plugin are pinned to **4.3.3**. No preflight. `tokens.css` remains
  the value source; an inline reference theme maps those values without emitting duplicates.
  Utilities are restricted to kit sources and use the **`kit:` prefix**: limiting source scanning
  alone would still generate global classes such as `text-sm` that match unmigrated pages.
  The utilities layer follows foundation so kit geometry/states win over page styles.
- Sizes are fixed 28/32/36/40 px, with 40 px phone targets. Recipes own padding, gaps, variants,
  tones, selected/disabled/focus/press/loading states and mirrored chevron offsets. Console
  tone uses the table-lift surface. Selected triggers use `data-selected`, independently of
  `aria-expanded`. Reduced-motion kit transitions use the 1 ms instant token; the legacy fade
  token remains unchanged. Resetting the native select's inherited minimum height was necessary
  for desktop sm/md sizes to measure 32/36 px.
- `Segmented` has 4 px inner padding, radio semantics, one enabled tab stop, wrapping arrow/Home/
  End focus, disabled options/groups and the compositor `SlidingIndicator`. Optional
  `deferChange` paints the selection before its owner update and cancels pending work on unmount
  or external value change. Its size measures the outer group; phone items retain 40 px targets
  within a 48 px group. Legacy `SegmentedControl`/`StatsChoicePills` callers are not migrated yet.
- `Menu`/`Popover` accept mutually exclusive `trigger` or `renderTrigger` props. The latter
  forwards native click/ARIA props and a callback ref to one `MenuTrigger`, preserving menu
  dismissal and focus restoration without nesting buttons. React's ref rule falsely treats
  forwarding this callback through a render prop as a render-time ref read; two local exceptions
  explain the safe forwarding operation. Other lint contracts remain enabled.
- `/design` shows all four button/icon sizes × four variants × seven states, plus link,
  disclosure, tone, native select, trigger, segmented and chip examples. Hover/press/focus are
  live targets; selected/disabled/loading are rendered together. New desktop/phone captures,
  a repeatable capture script and 387 measured control/group nodes per viewport are in
  [UC02 evidence](evidence/ui-consolidation/uc02/README.md). Both viewports report zero page
  errors and zero horizontal overflow. Captures were visually inspected.
- Updated the spec's implementation API, console tone, selected-trigger rule and outer-group
  sizing. **C13 remains pending owner approval for UC04**: filter-bar segmented items 36 → 32
  inside a 40 px group, phone items still 40 inside 48. The
  [desktop](evidence/ui-consolidation/uc02/c13-1440.png) and
  [phone](evidence/ui-consolidation/uc02/c13-390.png) comparisons are review evidence only;
  no existing page or baseline adopts C13.
- Final verification: dashboard ESLint/Stylelint **PASS, zero errors/warnings**; typecheck
  **PASS**; Vitest **75 files / 480 tests PASS** (17 new kit tests); complete Playwright suite
  **459 PASS / 27 opt-in real-service skips / zero failures**, including four new kit tests,
  92 visual-baseline tests and 22 other PC12 screenshot-spec tests. Existing baselines and
  tolerances are unchanged. Frozen-identifier tests **6 PASS**; diff whitespace and relative
  doc links **PASS**. The chart showcase test now waits for the existing streamed-page helper;
  the new press-state assertion waits for its 1 ms transition to settle.
- Browser/build work ran on isolated 3180/4180 ports in a disk-backed sandbox under
  `~/.cache/courtlens-tmp`; dependencies and historical evidence were copied. Final browser log
  is retained in the UC02 evidence. Scratch servers/browser contexts stopped and the sandbox
  was removed. The owner's 3100 dashboard and 8000 API were left running. **UC03 has not started.**

## C13 approval (2026-10-14)

- The owner approved C13 (filter-bar segmented items 36 → 32 inside an unchanged 40 px group with
  4 px inner padding; phone items stay 40 inside 48), on the agent's recommendation from the
  [desktop](evidence/ui-consolidation/uc02/c13-1440.png) and
  [phone](evidence/ui-consolidation/uc02/c13-390.png) comparisons. Outer group height is unchanged,
  so no row layout moves. Each UC04 batch applies C13 to its filter-bar `SegmentedControl` callers
  and regenerates only the affected baselines, listing them in its entry.


## UC03 — Lint ratchet (2026-10-14)

- `dashboard/eslint/control-kit.mjs` adds a local `control-kit` ESLint plugin with three rules:
  - `no-control-class`: the 8 legacy `.button*` classes and 55 bespoke control classes from the
    control kit v1 mapping are errors in any `className`/`*ClassName` value (literals, template
    text, `cx` arguments and object keys) outside `components/ui`. Ratchet
    `PENDING_CONTROL_CLASS` starts at **82 files / 428 hits**; classes listed as not fitting the kit
    (table cells, nav, menu rows, badges, inputs) are not banned.
  - `kit-layout-only`: a kit component's `className` may not carry `kit:` size, padding, gap,
    type, colour, radius, ring, shadow, opacity or scale utilities.
  - `kit-tokens`: the Stylelint value contracts applied to `kit:` utilities: no hex/rgb/hsl,
    no raw px (except 0/1) or rem in padding, margin, gap, radius, text or leading, no numeric
    z-index, no `transition-all`, no numeric durations, no `!important`. Stylelint stays for the
    remaining vanilla CSS, so together they replace its contracts for Tailwind (UC00).
- The kit itself had three hits: the Select chevron optics used raw `14px`/`16px`. They now use new
  `--kit-chevron-sm`/`--kit-chevron` tokens with the same values, so geometry is unchanged.
- `.stylelintrc.json` adds `selector-disallowed-list` for `.ui-button`, `.ui-icon-button`,
  `.ui-select`, `.ui-segmented*`, `.ui-*-trigger`, `.ui-chip`, `.ui-entity-chip`,
  `.ui-filter-bar-toggle`, `.ui-why-summary` (with suffixes) and `[data-kit]`. The ratchet override
  starts at **6 files / 145 selectors**: components.css 43, foundation.css 61, stats-explorer.css 26,
  pages.css 13, presentation-clarity.css 1, table-presentation.css 1. Wrapper classes stay allowed.
- `eslint/control-kit.test.ts` (30 tests) covers each rule's valid/invalid cases and both
  ratchets: neither list may grow past its start, and every listed file must still violate, so a
  migrated file has to leave the list.
- Verification: dashboard ESLint/Stylelint **PASS, zero errors/warnings**; typecheck **PASS**;
  Vitest **76 files / 510 tests PASS**; full Playwright in a disk-backed sandbox on 3180/4180
  **458 PASS / 27 opt-in skips / 1 failure**: `roster-shapes.spec.ts:108` hit a strict-mode
  duplicate `.roster-team` while a streamed copy was still loading (no UC03 code on that page).
  Rerun of that spec with `--repeat-each=3`: **21/21 PASS**. Visual baselines unchanged.
  Frozen identifiers **6 PASS**; `git diff --check` **PASS**.

## UC04 batch 1 — Stats (2026-10-14)

**Owner approved 2026-10-14:** C1–C5, C9, C10 and D1–D9 as listed; C7 and C8 dropped from the
spec. `stats-phone.png` regenerated after approval. Evidence: [UC04 Stats evidence](evidence/ui-consolidation/uc04-stats/README.md).

- **Files (13 leave the ratchet, 82 → 69):** `workbench-player-explorer`, `stats-page-controls`,
  `stats-preview-rail`, `stats-detail-drawer`, `stats-feed-ui`, `stats-workspace`,
  `stats-glossary-view`, `tracking-stats-view`, `manage-views-modal`, `hotkeys-modal`,
  `compare-tray`, `scatter-plot-view`, `multi-player-lines-view`. `StatsChoicePills` stays for the
  career table (batch 3). `ContextBar` and `SeasonScopePicker` serve 17 pages and move with
  batch 2.
- **Kit changes:** `dense` on `Button`/`ButtonLink`/`ButtonSummary` (one 4 px padding step less)
  and on `Segmented` (also abutting items), so the preset row and footer keep their widths;
  `IconButton filled`; a UC02 bug fixed where `Segmented`'s console tone lost its text colour to
  the default tone's (two colour utilities resolved by stylesheet order).
- **CSS removed:** 59 dead rules or selectors across `stats-explorer.css` (64,138 → 56,794 bytes),
  `stats-glossary.css`, `components.css` and `pages.css`. Layout that lived on control classes
  moved to wrappers (`stats-expand-action`, `stats-row-pin`, `filter-clear-slot`,
  `filter-action-slot`, `stats-footer-group.is-single`), because kit utilities outrank page CSS.
- **Semantics:** presets (`tablist`/`tab`) and Table Divider/Counting Mode (`group`/`button`) are
  now `radiogroup`/`radio` with arrow-key selection. Four e2e specs updated; the FO14 phone
  preset-clipping check now targets the radios instead of a class that no longer exists.
- **Spec changes applied:** C1 (drawer research links 34 → 32), C2 (legacy buttons: padding
  16 → 12; the drawer's Close is now surface-2 on a surface-2 footer), C3 (Hotkeys "Got it" text
  12 → 13), C4 (Select Team, Draft Class padding 16 → 12), C5 (help row, Add View, Manage icons
  14 → 16), C9 (row and preview-rail icon actions → 28 × 28), C10 (glossary chips solid accent →
  accent outline; also padding 16 → 12, text 14 → 13).
- **Not applied:** C7 (footer padding 4 → 8) and C8 (preset padding 8 → 12). Each wraps its row at
  1440 px (measured: footer expand control drops a line; Add View/Manage drop a line and the table
  moves down 48 px). `dense` keeps today's widths.
- **New changes for review:**
  - D1 Draft Class gains the `MenuTrigger` chevron (+8 px).
  - D2 The "C" position chip is 33 px wide, not 40 (the kit has no minimum width).
  - D3 Table tool buttons lose their 1 px hairline border and accent icons (white icons on the
    same fill); Filters with active filters shows the full selected look.
  - D4 Counting Mode: five separate 36 px pills → one 36 px segmented group with 28 px items;
    inactive text secondary 500 instead of control 600.
  - D5 Footer: the current density, open Filters and expanded state show accent fill + ring
    instead of accent text; scroll buttons' kbd-to-icon gap 4 → 8; density buttons size to
    content. Disabled First Page now dims.
  - D6 Phone: preset and divider groups 40 → 48 with 40 px items (the C13 phone rule); Counting
    Mode fits one line, so the table starts 20 px higher.
  - D7 Manage Views: text tabs → filled `xs` chips; close 30 × 22 → 28 × 28. On phone, Create View
    and Hotkeys "Got it" fit one 40 px line instead of wrapping to 46.
  - D8 Stats `xs` buttons: weight 600 → 500.
  - D9 Compare tray remove: hover turns neutral instead of red.
- **Verification:** ESLint/Stylelint **PASS, zero errors/warnings**; typecheck **PASS**; Vitest
  **76 files / 510 tests PASS**; full Playwright against the 3180 fixture build **457 PASS /
  27 opt-in skips / 2 failures**: `stats-phone.png` (4% of pixels, pending approval) and
  `fo13-pages.spec.ts:112` (strict-mode duplicate while a streamed copy loads; planner code
  unchanged). `fo13-pages.spec.ts` with `--repeat-each=5`: 34/35 pass, the one failure the same
  duplicate on a different planner test, so the flake predates this batch. The desktop Stats baseline passes within its 1% tolerance.
- **After approval:** `stats-phone-linux.png` regenerated (only that baseline). Re-verified in the
  sandbox: lint, typecheck, Vitest 510 PASS; full Playwright **458 PASS / 27 skips / 1 failure**,
  the known Roster Shapes streamed-duplicate flake (`advanced-research.spec.ts:62`), which passes
  15/15 with `--repeat-each=3`.

## UC04 batch 2 — app shell (2026-10-14)

Evidence: [UC04 shell evidence](evidence/ui-consolidation/uc04-shell/README.md).

- **Migrated:** header Ask (`Button sm ghost onBackground`), More (`IconButton sm`), phone search
  and drawer toggle (`IconButton lg`, shown and hidden through wrapper spans); `ContextBar` season
  stepper (`IconButton lg` ghost in the existing group), phase (`Segmented lg`, C13 geometry);
  `SeasonScopePicker` trigger (`MenuTrigger lg` through `Popover renderTrigger`, keeping the large
  season value and accent calendar as content) and quick ranges (`Chip sm`). `context-bar` and
  `season-scope-picker` leave the ratchet (69 → 67). 27 dead rules or selectors removed
  (`stats-explorer.css` 56,785 → 54,354 bytes, `components.css`).
- **Deferred to a legacy-component step:** `DataDetailsButton`, the `FilterBar` toggle and the
  legacy `Select`, `DatePicker`, `SegmentedControl` and `Menu` triggers live in `components/ui`
  and render on about 30 pages with context-dependent sizes. They migrate together, after the
  page batches, so each page is reviewed once.
- **Changes for review:** C6 (Ask text 12 → 13, padding 8 → 12, +10 px wide), and:
  - D10 Ask at 768–1279 px is 32 px tall instead of 40 (the kit's 40 px rule starts at 767 px).
  - D11 Season stepper buttons 36 → 40 px wide with 16 px chevrons; the rest of the Stats scope row
    shifts 18 px right (no wrap at 1440 or 1024).
  - D12 Season trigger icon-to-text gap 4 → 8 and no open-state highlight; its chevron follows
    the label colour.
  - D13 Phase segments get the kit's 4 px gap (+4 px).
  - D14 Header icon glyphs 14 → 16 (More, search, drawer toggle).
  - Phone filter sheet: phase group 44 → 48 with 40 px items (C13 rule).
- **Verification:** ESLint/Stylelint **PASS**; typecheck **PASS**; Vitest **510 PASS**; full
  Playwright against the 3180 fixture build **455 PASS / 27 skips / 4 failures**: the
  `analysis-window-popup.png` screenshot (the Window select moved 18 px right, D11; pending
  approval) and three known streamed-duplicate flakes (`advanced-research:62`, `fo13-pages:47`,
  `roster-shapes:108`), which pass 19/19 on rerun. The Stats desktop and phone baselines pass.
- **Owner approval (2026-10-14):** C6 and D10–D14 approved as shown, including the 32 px Ask
  at 768–1279 px (no tablet kit size). `analysis-window-popup-linux.png` regenerated (only that
  baseline); `native-select-theme.spec.ts` 4/4 PASS against the 3180 fixture build.

## UC04 batch 3 — Players and player profile (2026-10-14)

Evidence: [UC04 players evidence](evidence/ui-consolidation/uc04-players/README.md).

- **Migrated:** career table views (`Segmented lg console dense`, the Stats preset geometry),
  Counting Mode and Phase (`Segmented md deferChange`, as Stats), stint expand (`IconButton xs`,
  C9); Back to table (`Button xs primary`); profile favourite and compare (`IconButton sm
  secondary`), Export (`IconButton sm` through `Menu renderTrigger`, spinner while exporting) and
  Explore (`MenuTrigger sm`); game log Per Game / Per 36 Min (`Segmented sm`); Lineage
  (`Button lg`, C3); directory Search (`Button lg console`), Clear search, Clear filters and Next
  players (`Button`/`ButtonLink lg`); fixture search and replay-profile Change date / Return to
  player search (`Button`/`ButtonLink lg`, C2). `StatsChoicePills` has no callers left and is
  deleted. Seven files leave the ratchet (67 → 60).
- **CSS removed:** the preset-tab, preset-indicator, counting-mode and `control-pill` rules under
  `.stats-workspace` and the global `.stats-preset-tab` rules (`stats-explorer.css` 54,403 → 49,919
  bytes; `pages.css` 141,368 → 140,440; `components.css` 124,786 → 124,767).
- **Not in this batch:** the profile section tabs (Overview, Game Log, Tracking) are the legacy
  `Tabs` in `components/ui` (C1), and `TablePercentileLegend`'s Rules disclosure shares
  `ui-why-summary` with `GatedNote`'s Why? (about 50 callers). Both move with the legacy-component
  step, so "Rules" and "Why?" stay identical.
- **Changes for review:** C2 (fixture search, Change date, Return to player search: padding
  16 → 12, text 14 → 13, weight 600 → 500, no hairline border), C3 (Lineage text 12 → 13,
  weight 600 → 500, no border), C9 (stint expand 24 → 28; the fixture has no multi-team season to
  show it), and:
  - D15 Profile actions: Export becomes a 32 px filled icon button like favourite and compare
    (was a 28 px transparent box), Explore gains 12 px padding (+8 px wide); the row grows 9 px
    to the left, so the bio facts shift up to 8 px left. Favourite and compare lose
    the custom tooltip for the kit's native one; the favourite star fills when on.
  - D16 Career Counting Mode and Phase: separate 36 px pills → one 36 px group with 28 px items,
    inactive text secondary 500 (the D4 Stats look). Phone: one line instead of two (−20 px).
  - D17 Game log Per Game / Per 36 Min: same 32 px group, items 28 → 24 with the kit's 4 px
    padding; text 12 → 13.
  - D18 Directory Search: weight 500 → 600 and control text colour, matching the Team select
    beside it.
  - D19 Back to table: 4 px narrower (kit icon gap; the Esc key cap loses its extra 4 px margin).
- **Semantics:** career views were `tablist`/`tab` and Counting Mode/Phase `group`/`button`; all
  are now `radiogroup`/`radio` with arrow keys, as on Stats. `player-career.spec.ts` updated.
- **Verification:** ESLint/Stylelint **PASS**; typecheck **PASS**; Vitest **76 files / 510 PASS**;
  full Playwright against the 3180 fixture build **457 PASS / 27 skips / 2 failures**, both
  streamed-duplicate strict-mode flakes on untouched pages (`fo13-pages:93` planner sign-in,
  `saved-operations:52` methodology heading). With `--repeat-each=8` they fail 6/16 on this build
  and 5/16 on an `ee2a8af` build, so they predate the batch. No screenshot baseline changed;
  the player specs (`player-career`, `player-profile`, `players-fo09`) pass 9/9.
- **Owner approval (2026-10-14):** C2, C3, C9 and D15–D19 approved as shown. No baseline needed
  regenerating.

## UC04 batch 4 — catalogued pages (2026-10-14)

Evidence: [UC04 catalogued pages evidence](evidence/ui-consolidation/uc04-pages/README.md).

- **Scope:** every catalogued page after Stats and Players: Compare, Teams and team detail, Team
  Compare, Recent Games, Live, Playoffs and series, Showcase, Rankings, Tier List, Roster Shapes,
  Stat Line Shift, Contracts and Books, Matchups, Similar Players and Shot Profile, RAPM, Six
  Factor and shooting results, Wingspan, Calculator. Also `research-trend-charts` (player Game Log
  tab), which batch 3 missed. 35 files leave the ratchet (60 → 25); two more non-ratchet views
  (`season-matchups-view`, `six-factor-view`) move their segmented controls to the kit.
- **Migrated:** legacy `.button`/`.button-small` → `Button`/`ButtonLink lg` (they render 40 px
  here); legacy `ui/button` callers → kit (`md` 34 → `sm` 32, `sm` → `xs`); every
  `SegmentedControl` caller on these pages → `Segmented` (`lg` in filter bars, `md` on Compare);
  icons inside buttons → `icon`/`iconAfter`. Recent Games and Showcase Export menus open from a
  kit primary `Button` through `renderTrigger`. Rankings and Tier List: board tabs → `Segmented`,
  aggregator picker → toggle `Chip`s, modal close, reorder and remove → `IconButton xs`, Delete
  Board/List → `Button lg danger`, favourite quick-adds → `Button xs ghost`.
- **Kit addition:** `IconButtonLink` (square icon-only link) for the Showcase rail shortcuts.
- **Spec:** `roster-chip` and `tier-player-chip` are draggable cards with inputs, not chips; they
  move to "does not fit" and leave the lint list. `tier-reorder-btn` maps to `secondary` because
  ghost icons were unreadable on the light tier label.
- **Batch 3 regression fixed here:** batch 3 deleted the global `.stats-preset-tab` rules, but
  Rankings and Tier List still used that class for personal board tabs, which then rendered as
  21 px unstyled text (visible only with personal boards, so no baseline caught it). They are kit
  `Segmented` now.
- **Shared step (with the `components/ui` legacy components):** `lookup-input` (28 routes),
  `entity-picker` (8 routes) and the season popover's mode switch and Apply button.
- **CSS removed:** `modal-close-btn`, `ranking-chip-btn`, `ranking-meta-btn`, `ranking-reorder-btn`,
  `ranking-delete-btn`, `tier-delete-btn`, `tier-quick-fav-btn`, `tier-reorder-btn`,
  `tier-remove-btn`, `finance-detail-button`, `playoffs-tabs` and the Showcase tooltip/active rules
  (`pages.css` 140,440 → 138,280 bytes; `components.css` 124,767 → 124,445;
  `presentation-clarity.css` 22,801 → 22,639).
- **Changes for review:** C1 (legacy md buttons 34 → 32: Profile, Export, Pause updates, Play,
  Aggregate boards, New board, Copy to my boards, New tier list, Add tier row, Export JSON, Change
  team), C2 (legacy `.button`: padding 16 → 12, text 14 → 13, weight 600 → 500, no hairline;
  Compare suggestions, Compare Teams, All teams, Change team, Calculator, Contracts, Retry
  actions), C3 (`.button-small` at 40: text 12 → 13; Swap players, table Compare/Profile, series
  links, Lineage, View Data Table), C12 (Similar Players PvP Compare / Set Target are `Button lg`;
  the fixture shows only the error state, so the phone wrap is not measured), C13 (filter-bar
  segmented items 36 → 32 in the 40 px group: Teams view, Team Compare tabs, Recent Games ×3,
  Playoffs ×3, Showcase focus, Roster basis, Shot profile, Matchups, Six Factor), and:
  - D20 Compare presets and counting mode: same 36 px group, items 32 → 28 (kit `md`).
  - D21 Playoff series player filter: three 40 px buttons (active one primary-filled) → one 40 px
    `Segmented` with the accent-outline selection.
  - D22 Recent Games and Showcase Export: the same primary button, 34 → 32 px.
  - D23 Recent Games and Showcase rail: favourite and compare lose the custom tooltip for the
    native one and the star fills when on (as D15); the three rail shortcuts are `IconButtonLink`s
    with the same 32 px look.
  - D24 Rankings and Tier List: board tabs as above; Aggregate boards shows the selected look while
    the aggregator is open; the board picker's checkboxes become toggle chips; favourite quick-adds
    40 → 28 px ghost; ranking row reorder 40 → 28 ghost and remove 40 → 28 danger; tier row
    controls 20 → 28 px filled (each tier label box grows 8 px); tier card remove 22×14 → 28 px
    danger; dialog close 30×22 → 28×28.
  - D25 Contracts Books player names: underlined accent text → `Button xs ghost` (the fixture has
    no rows, so not pictured).
- **Semantics:** Rankings/Tier List board tabs and the playoff series filter are
  `radiogroup`/`radio`; the aggregator picker is `aria-pressed` buttons instead of checkboxes.
  `entity-selection.spec.ts` and `pc12-example-boards.spec.ts` updated for the radio role.
- **Test hardening:** `presentation-defaults.spec.ts:22` failed 2/20 on this build and 0/20 on
  `300a83c`. A probe showed a hidden streamed copy (`div[hidden]#S:1`) of the Compare view for
  about 300 ms after some reloads; `getByLabel` matches inside `[hidden]`, so strict mode saw two
  checkboxes. The spec now uses `getByRole("checkbox")`, which ignores hidden content: the file
  passes 220/220 with `--repeat-each=20`. The streamed copy itself predates this batch (it is the
  same mechanism as the known planner and Roster Shapes flakes).
- **Verification:** ESLint/Stylelint **PASS**; typecheck **PASS**; Vitest **76 files / 511 PASS**
  (one new `IconButtonLink` test); full Playwright against the 3180 fixture build
  **439 PASS / 27 skips / 20 failures**: 18 screenshot baselines that change with C1–C13
  (`visual-baselines.spec.ts`: FO06 phone showcase, playoffs bracket, recent games, roster shapes
  depth, team stats; FO11 phone team comparison overview and factors; FO12 phone calculator; PC04
  desktop shot-profile, shot-aftermath, first-load roster-shapes; PC04 phone recent-games,
  first-load roster-shapes, shot-profile; PC11 phone player-matchups, six-factor; and
  `pc12-headlines.spec.ts` Teams and Team Compare at 390), pending approval;
  `presentation-defaults:22`, fixed as above; and the known planner flake `fo13-pages:112`
  (3/12 on `300a83c`). The page specs touched by this batch (`entity-selection`,
  `pc12-example-boards`, `roster-shapes`, `showcase`, `live`, `compare-overhaul`,
  `teams-overhaul`, `player-career`) pass 43/43.
- **Owner approval (2026-10-14):** C1, C2, C3, C12, C13 and D20–D25 approved as shown, including
  the `roster-chip`/`tier-player-chip` spec move and the filled tier-row controls. Before updating,
  the two screenshot specs against a fresh 3180 fixture build failed on exactly the 18 listed
  baselines (90 pass); those 18 were regenerated with `--update-snapshots=changed` and the rerun
  passes **108/108**. No other baseline changed.

## UC04 batch 5 — Ask and CourtLens-only pages (2026-10-14)

Evidence: [UC04 Ask and CourtLens-only pages evidence](evidence/ui-consolidation/uc04-courtlens/README.md).
D-numbers continue this log's UC04 series; they are not Design Language's D26 glyph rule.

- **Scope:** `/forecasts`, `/evaluation`, `/investigations` (public, personal, saved detail),
  `/research/operation`, `/research/ask` and the Ask drawer, Case Studies, Distributions, Trends,
  adjusted shooting, `/data-status`, `/settings` and `/planner`. 19 files leave the ratchet
  (25 → 6). `/design` was never on the ratchet (no banned classes).
- **Left for the shared step (6 files):** `assistant-status-card`, `install-interface` and
  `workbench-portrait-settings` keep one `ui-why-summary` each (shared with `GatedNote`'s Why?, as
  batch 3 decided); their other buttons migrate now. `entity-picker`, `lookup-input` and
  `table-percentile-legend` were already assigned to that step.
- **Migrated:** legacy `.button`/`.button-small` → `Button`/`ButtonLink lg` (all measured 40 px
  here; the two form submits get an explicit `type="submit"`, since the kit defaults to
  `button`); legacy `ui/button` callers → kit (`md` 34 → `sm` 32, `sm` 28 → `xs`): Settings
  history, portraits and install, Data Status refresh, Planner sign-in and compare; the four
  filter-bar `SegmentedControl`s (Case Studies, Distributions, Trends, adjusted shooting) →
  `Segmented lg`. Ask: Send and Stop → `IconButton md` (primary/secondary), sidebar toggle,
  Delete chat and Close conversations → `IconButton sm secondary` (they rendered filled; the
  `button-quiet` override lost), New chat → `Button sm ghost`, notice actions → `Button sm` in an
  `ask-notice-actions` row, page-context remove → `IconButton xs`.
- **Spec:** `ask-chip` and `agent-source-chip` move to "does not fit" and leave the lint list.
  Follow-up questions and action labels are model-written text of any length that wraps (a 390 px
  follow-up measured 46 px), and the citation chip flows inline inside answer prose; a fixed-height,
  no-wrap kit control would overflow. Their legacy `Button` wrappers become plain
  `<button className="ask-chip">`; `button.ask-chip` keeps the weight 500, line height and disabled
  look the legacy button supplied (measured parity after a first pass showed 500 → 400).
- **CSS removed:** `.ask-send.button` (desktop and phone), `.ask-topbar .button`,
  `.ask-page-context button` and `.ask-notice .button + .button`.
- **Changes for review:** C1 (legacy md 34 → 32: Clear history, Sign in, Compare scenario, New chat,
  Ask notice actions), C2 (legacy `.button`: padding 16 → 12, text 14 → 13, weight 600 → 500, no
  hairline; every header link, Retry, Share Link, Export, Verify, pager and Save on these pages),
  C3 (`.button-small` at 40: text 12 → 13; Open in Stats/Research, Clear conversation, View
  Distribution, Investigate, legacy investigation actions), C13 (filter-bar segmented items
  36 → 32 in the 40 px group; phone groups 44 → 48 with 40 px items: Case Studies, Distributions,
  Trends, adjusted shooting), and:
  - D26 Ask Send/Stop: a 36 px circle (44 on phone) → the kit's 36 px rounded square (40 on phone).
    The kit has no circular control; keeping the circle means a bespoke control.
  - D27 Ask page-context remove: a 44 × 44 transparent "×" text button → a 28 px `IconButton`
    with the close icon (40 on phone); the context row is 16 px shorter, so the dock above it moves
    down 16 px.
  - D28 Ask drawer at 390 px: the shorter Close research conversation button lets the drawer header
    fit one line, so the panel starts 33 px higher.
  - D29 Ask follow-up chip hover: the accent outline the action-link chips already used, instead of
    the legacy button's surface fill.
  - Phone segmented groups on Trends and adjusted shooting no longer stretch to the full row
    (366 px); they size to their options, as on every other migrated filter bar.
- **Verification:** ESLint/Stylelint **PASS**; typecheck **PASS**; Vitest **76 files / 511 PASS**;
  full Playwright against the 3180 fixture build **452 PASS / 27 skips / 7 failures**: four
  screenshot baselines that change with C2/C13 (`visual-baselines.spec.ts` FO12 phone
  case-studies and PC11 phone adjusted-shooting; `pc12-headlines.spec.ts` Trends at 390;
  `pc12-demo-hygiene.spec.ts` `pc12-c-saved-390`), pending approval; and three streamed-duplicate
  strict-mode flakes (`advanced-research:62`, `roster-shapes:108`, `fo13-pages:47`). Rerun with
  `--repeat-each=5` they fail 5/15 and then 1/15; the planner failure is the duplicate `Email`
  field at `fill`, before the migrated Sign in button is used.
- **Owner approval (2026-10-14):** C1, C2, C3, C13 and D26–D29 approved as shown, including the
  `ask-chip`/`agent-source-chip` spec move and the square Send/Stop. Against a fresh 3180 fixture
  build the three screenshot specs failed on exactly the 4 listed baselines (110 pass); those were
  regenerated with `--update-snapshots=changed` and the rerun passes **114/114**.

## UC04 batch 6a — shared page chrome (2026-10-14)

Evidence: [UC04 shared chrome evidence](evidence/ui-consolidation/uc04-shared-chrome/README.md).
The shared step that batches 2–4 deferred runs as 6a (page chrome), 6b (form triggers) and 6c
(menus, tabs, search, entity picker, legacy deletions). The owner pre-approved its changes
(2026-10-14) and asked for the remaining blocks to run on the agent's judgement.

- **Migrated:** the `FilterBar` Filters toggle → `Button lg` with a new kit `stretch` option (fills
  the row, lead-aligns and truncates; it opens a sheet, so no chevron), shown and hidden through a
  `filter-bar-toggle-slot` wrapper; `DataDetailsButton` → kit `Button` ghost; `GatedNote`'s Why?,
  `TablePercentileLegend`'s Rules and the three Settings disclosures → `ButtonSummary xs ghost`;
  drawer, modal and search-clear close buttons → `IconButton xs ghost` (same 28 px). The TSX
  ratchet drops 6 → 2 (`entity-picker`, `lookup-input`, both 6c).
- **Placement context:** `components/ui/control-scope.tsx` gives shared controls their size and
  tone from where they sit, replacing page CSS that did it by selector. `FilterBar` provides `lg`
  and the Stats workspace (`/stats`, `/players`) the console tone; explicit props win.
- **CSS removed:** `.ui-why-summary` (4 rules), `.ui-filter-bar-toggle` (3) and
  `.ui-filter-bar-meta .ui-button` (2) in foundation.css, and the Stats console selectors for the
  toggle and Data details (5) in stats-explorer.css.
- **Found and fixed during measurement:**
  - With the kit's `lg` padding, Data details grew 15 px and wrapped a filter control to a second
    row (+52 px) on Players, Teams and Showcase at 1024 px. A probe showed the Teams and Showcase
    bars have no slack, so Data details keeps its old width: `xs` ghost outside the Stats console
    (resting look unchanged; its hover box is 28 instead of 40 px) and `lg dense` on the console.
  - The phone toggle's accessible name ran together ("Filters2025-26 …") once label and summary
    shared one truncating span. A real space restores it; the summary margin rises to 12 px so the
    visible gap is 14.5 px (was 16).
- **Changes:** Why?/Rules and the Settings disclosures lose the dotted underline, weight
  600 → 500, radius 4 → 6, with the kit hover fill (the approved UC01 mapping); content below a Why?
  on Rankings and Tier List moves up 1 px. Stats console Data details: 16 px icon, +2 px wide. Phone
  Filters toggle on Stats: console tone (control text, weight 600). Data details elsewhere: 28 px
  hover box.
- **Verification:** ESLint/Stylelint **PASS**; typecheck **PASS**; Vitest **76 files / 511 PASS**;
  all five measurement scripts before and after (196 states at 1440/1024/390, zero errors or
  overflow); full Playwright against the 3180 fixture build **459 PASS / 27 skips / 0 failures**.
  After the final gap fix, the Filters-sheet and screenshot specs pass **140/140**. No baseline
  changed.
