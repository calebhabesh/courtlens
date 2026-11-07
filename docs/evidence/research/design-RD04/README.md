# RD04 Shot Quality: design evidence

Research → Shot Quality (`/research/shot-quality`), redesigned after Databallr's saved "ShotQuality RAPM - Scoring Impact
Decomposition" page. Instructions and status: [research design catalog, RD04](../../../research-design-catalog.md#rd04-shot-quality--).

## Reference

Three saves of the page exist: `~/Downloads/Webpages/` (W), `~/Downloads/Webpages/DraftBallr/` (D) and the owner's
`~/Downloads/LocalSend/` copy of 2026-11-07. Their text is identical except for one stray number after the footer; only the CSS
bundle differs by build. The LocalSend copy was used (newest, the one the owner sent). It was rendered offline: scripts
stripped, a `<base>` added, `crossorigin` removed so the local stylesheet loads, and every non-`file://` request blocked.
databallr.com was never fetched. Measured: the content column is 1352 px at 1440 (the 1400 px container), the table frame
scrolls at 68vh, and the hero is centred. Reference screenshots are not committed (third-party page).

Before shots of the old four-tab page: `before-{players,decomposition,model,player}-{1440,390}.png`.

## Round 1 (owner, 2026-11-07)

"I agree with your recommendations. Let's comprehensively build it out." The nine recommendations are recorded with the
instruction in the catalog.

**Built**

- `components/shot-quality-research.tsx`: Databallr's centred hero through `PageHeader` (`research-hero`, accent icon tile, one
  line), a 1352 px `.rs-column`, tabs Decomposition (default) · Shot-making · Player · Model (`?tab=players` still opens
  Shot-making). On a phone the tabs are a text-only stretched group, so all four fit at 390.
- `components/shot-decomposition-tab.tsx`: Databallr's order. The three side boards of a season are loaded together and
  merged, so Offense / Defense / Combined switch without a request (`side` stays in the URL). The table is RD00's
  `ResearchTable`: search, min shots (from 1,000, on the view's own shots), team, season, Methodology (opens and scrolls to
  Caveats & Methodology), CSV of every side with p10/p90, count, bars and the 80% interval line. Then the colour key and a
  one-line note that each season is its own fit, the Six-Factor RAPM link card (no 98.5%), How to Read with this season's
  highest oTS and lowest dTS as the examples, the Offense / Defense glossary, "Does Shot Making Carry Over?" (the registered
  verdict, an interval dot plot of the eight season-to-season correlations and the two differences), and the collapsed
  Caveats & Methodology: overview, the four regressions as steps, the foul-baseline table with a worked example on the
  season's avg_pts, the calibration shift by season, ridge and the second stage with the additivity table, data joins, and
  credits (Databallr as the design reference).
- Shot-making: the same table with FGA, FG%, 3PA share, PPS, xPPS (no colour) and shot-making/100 with its 95% interval
  (the colour key says 95%); How to Read cards; collapsed Caveats & Methodology.
- Model (own design): three result tiles, the model card as six cards, test gates and pooled metrics, the calibration chart,
  slices, persistence; the selection metrics, test metrics by season, calibration bins and data check in Caveats &
  Methodology.
- Player (own design, the RD03 pattern): clearable search (`player=none` gives an empty state with a way back), a 64 px
  `PlayerAvatar` card, four tiles from the latest served season, shot-making by season, and the player's oTS / oSQ / oMake / oFT
  per season from the four season boards.
- Colour everywhere: green/red only where the served interval excludes zero (80% for the decomposition, 95% for shot-making and
  the model's comparisons); the old sign colouring is gone.
- Shared: `ResearchTable` takes an optional controlled view (`view`, `onViewChange`), a minimum whose value can depend on the
  view, and `intervalLevel` for the colour key; `ToneLegend` takes `level`. Defaults unchanged for RD00/RD01 callers.
- New `components/shot-quality-figures.tsx` (panel, `Toned`, tiles, interval plot, link card) and
  `components/shot-quality-research.css`, imported after `zts-research.css`.

**Checks**

- Lint 0 errors / 0 warnings (ESLint and Stylelint), typecheck clean, Vitest 818 passed (one new `ResearchTable` test).
- No Python changed.
- Page specs `r05-shot-quality` and `r06-decomposition` rewritten for the layout: 14/14 three times on the production build
  with the mock API's real-answer fixtures.
- Full Playwright in a sandbox (`systemd-run`, MemoryMax=8G): first run 594 passed, 17 skipped, 5 failed; second run 596
  passed, 17 skipped, 3 failed. Every failure was in `r10-wingspan-calculator` (a click that did not reach the URL or the
  overlay within 5 s under full-suite load). That spec passed 11/11 twice on its own against the same build. Wingspan imports
  only `sortRows`, `ResearchSection`, `ResearchDisclosure` and `MethodBlock` from the shared files, none of them changed here.
  Recorded as a load flake, not caused by RD04.
- Real data (`real-check.mjs` through `readonly-proxy.mjs`, GET only, 4180 → :8000, against the same build): 8 scenes at 1440
  and 390, **50,550 values, 0 mismatches**, 0 console errors, 0 overflow, 0 broken images, 0 phone controls under 40 px, column
  1352 px (366 px on a phone). Includes every row of every side's board in three scenes, every shot-making row in two seasons,
  the colour of every coloured value, the model tables, bins and chart points, and two players' histories and splits.
  `real-data-check.json`.
- Glance test: every screenshot viewed (`sq-*-{1440,390}.png`).

## Rounds 2 and 3 (owner, 2026-11-07)

Round 2: "Can we use the same team picker we use on the other pages. I don't like drop down selector for teams." Round 3
(screenshot of the hero, sent during round 2): "The "Shot Quality" icon looks wonky, and not centerd."

**Changed**

- New shared `components/research/team-picker.tsx`: the site's team picker as WOWY and Contracts have it. A kit button with the
  chosen team's logo and code ("Select Team" when empty) opens the Select Team dialog with the compact `TeamGrid` (season-correct
  logos and codes) and Show All Teams to clear. `ResearchTable` takes it with `teamPicker`; both Shot Quality tables use it, so
  the page has no team dropdown. Off by default, so the approved RD00 and RD01 tables are unchanged.
- Hero icon: `panel.css`'s unlayered `display: inline-flex` overrode the page's layered `inline-grid; place-items: center`, so the
  glyph sat in the tile's top-left corner. Now centred with `align-items` / `justify-content`, which nothing overrides.

**Checks**

- Lint 0/0, typecheck, Vitest 819 (new: the picker replaces the select and filters). No Python changed.
- Page specs updated to choose a team through the dialog and clear it: 14/14 three times.
- Full Playwright: 598 passed, 17 skipped, 1 failed: `visual-baselines` "roster shapes depth chart" phone, a 2% pixel diff on a
  page this round didn't touch. The spec passed 84/84 on rerun.
- Real data: 10 scenes at 1440 and 390, **51,416 values, 0 mismatches**, 0 console errors, 0 overflow, 0 broken images, 0
  phone controls under 40 px. New scenes pick Boston (decomposition) and Denver (shot-making) through the dialog and compare
  every row with the API's team-filtered board; every scene checks there is no team select and measures the hero icon (glyph
  vs tile centre, tile vs title, pair vs column: all 0 px, within 0.01). The first run counted the dialog as still open during
  its close animation (4 script mismatches); the check now waits for it to detach.
- Glance test: the hero and the open dialog viewed at both widths (`sq-*-team-*-{1440,390}.png` show the dialog open).

