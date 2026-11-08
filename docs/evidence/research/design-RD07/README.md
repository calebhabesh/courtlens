# RD07 Patch Notes: design evidence

Research → Patch Notes (`/whats-new`), redesigned after Databallr's saved changelog. Instructions and status:
[research design catalog, RD07](../../../research-design-catalog.md#rd07-patch-notes--).

## Reference

`~/Downloads/Projects/Courtlens/databallr — NBA & WNBA analytics, impact metrics, and draft games.html` (+ `_files`), the save the
owner attached in round 1. It is the same changelog as `~/Downloads/Webpages/DraftBallr/patch-notes.html`, saved later, so the
attached save was followed. It was rendered offline: scripts stripped, `crossorigin` removed, a `<base>` added, every non-`file://`
request blocked, scroll-in content forced visible. databallr.com was never fetched. Measured at 1440: a left-aligned hero
("Changelog" kicker, the latest month, a 60 px title, one subtitle line); releases in a 976 px column, each a 160 px release column
(month in 11 px capitals over a 36 px version, not sticky) beside 776 px entries; group labels in 11 px capitals over a hairline;
plain entry rows between hairlines with a 24 px title, a New (accent) or Updated (grey) pill, Explore on the right, one sentence and
dot bullets. At 390 the month and version share a row and Explore sits under the title. Reference screenshots are not committed
(third-party page).

Before shots of the old page (from :3100): `before-1440.png`, `before-390.png`.

## Round 1 (owner, 2026-11-08)

"Go with your recommendations and suggestions for optimal construction and layout of this page. Build it comprehensively." The
recommendations, including both stop-and-ask items, are recorded with the instruction in the catalog.

**Built**

- **Header.** Patch Notes draws the centred hero (`PageHeader` with `sq-hero pn-hero research-hero`, history tile): "Patch Notes",
  one line, then "Latest Nov 8, 2026 · 8 releases · 63 changes" and links to Learning and Research. `app/whats-new/layout.tsx` no
  longer wraps the page in the one-tab `TabbedPage`; `/whats-new` joins `OWN_HEADER_TABS` (`lib/route-consolidation.ts`). The
  route, the `/blog` and `/whats-new/blog` redirects and the page title are unchanged.
- **Version numbers (stop-and-ask A).** Each release in `content/patch-notes.json` carries a `number`, v1.0 (research workbench)
  to v1.7 (the research branch), in merge order. The unmerged research branch shows an "Unmerged" pill. `scripts/check-patch-notes.mjs`
  now also checks that the numbers step by one from oldest to newest, that only the newest release is unmerged and that merge dates
  follow the numbers; a deliberately wrong number was caught. The About text says they were assigned on Nov 8, 2026.
- **New entries (stop-and-ask B).** A "Page redesigns" group in the research release: one Updated entry for each approved
  redesign, RD00 to RD06, each linked to the commit that shipped its first round, with an "Approved after n review rounds" bullet
  quoting the approval commit and the progress-log "approved" heading. The release range now ends on 2026-11-08. The script
  verifies all 107 commit, date, log and version references. RD07 itself is not listed (its commit does not exist yet).
- **Layout** (`components/patch-notes-view.tsx`, new `components/patch-notes-view.css`, imported after Learning's CSS). A 1000 px
  article column. Each release: a 160 px column with the month in small capitals (a range uses short month names so it fits:
  "Oct–Nov 2026"), the version, the release name and the merge line (linking the merge commit when there is one), sticky while
  its entries are read; beside it the release summary, then each group label over a hairline and its entries. On a phone the
  release head is one wrapped row above its entries. No index or search.
- **Entries.** No cards: rows between hairlines. Title with a badge pill (New in the accent, Updated grey, Removed and Unmerged
  outlined; labels, never green/red), Explore (`ButtonLink`, `arrow-right` icon) on the right, under the title on a phone; the
  sentence and accent-dot bullets at a 660 px measure; one quiet line with the date, the commit and the progress-log link.
- **About this page**, collapsed: how releases and version numbers are defined, how the entries are checked, Databallr credited as
  the design reference.
- **Not changed.** No API, analysis or frozen result. The R11 spec's Patch Notes tests were rewritten for the new layout (every
  release and entry checked against the JSON; the sticky column; the phone order and Explore height); Learning's tests are
  unchanged. The FO13 What's New visual baselines were regenerated (viewed) and their ready heading is now "v1.6 Databallr
  alignment".

**Checks**

- Lint 0 errors / 0 warnings (ESLint and Stylelint), typecheck clean, Vitest 832 passed (`lib/patch-notes.test.ts`: version
  order, month ranges). `check-patch-notes.mjs`: 107 references match. No Python changed.
- `r11-learning-patch-notes`, `fo13-pages` and `route-consolidation`: 66/66 three times (`--repeat-each=3`) on the final build.
  The first run measured one Explore link at 39.99994 px (sub-pixel); the spec now rounds, as other specs do.
- Full Playwright in a sandbox (`systemd-run`, MemoryMax=8G, mock API on 4180, production build on 3180): the first run had 603
  passed, 17 skipped, 2 failed, the two What's New visual baselines (the page was redesigned). Regenerated and viewed; final run
  **605 passed, 17 skipped, 0 failed**.
- Real-data check (`real-check.mjs`, production build on 3180, the owner's API through `readonly-proxy.mjs`, GET only, 4180 →
  :8000) at 1440 and 390: **1,366 values, 0 mismatches** against the committed `patch-notes.json` (every release's month,
  version, pill, name, merge line and link, summary and groups; every entry's title, badge, Explore link, text, bullets, date,
  commit and log link; the hero counts); 0 console errors, 0 overflow, 0 broken images, no phone control or `ButtonLink` under 40
  px; hero icon centred; the release column 160 px and pinned in view on a desktop, above its entries on a phone. Report:
  `real-data-check.json`.
- Glance test, screenshots viewed: `patch-notes-default-*`, `patch-notes-full-*`, `patch-notes-sticky-1440` (v1.6 pinned beside
  its Teams entries), `patch-notes-release-390`, `patch-notes-about-*`. In five seconds: what the page is (hero), what changed
  most recently (latest date and counts), which release each change belongs to (the pinned version). Visuals judged from the
  sandbox build, not :3100.

**Found in passing (not changed):** the Stats page's "What's New" line shows the newest entry, which is now "Nov 8: Defensive Shot
Quality redesign" (the first of the two Nov 8 entries); its baselines still pass.

## Round 2 (owner, 2026-11-08)

"Can we add some type of color attention grabbing to the left side which has the version numbers (which are visual dividers)." and
"I would like a more condensed note of the features added, they take up a little too much space." (screenshot: v1.7's release
column beside its first three entries).

**Built**

- **Release column.** A gold-tinted tile (`--color-accent` at 16% fading to 4%, a 1 px accent rim and a 3 px accent rail on the
  left), with the month and the version in the accent; still 160 px and sticky. The merge line sits on two lines ("PR #42", then
  "merged Nov 3, 2026"); a visually hidden separator keeps its text "PR #42 · merged Nov 3, 2026" for screen readers and the
  tests. On a phone the tile is one wrapped row (month, version, pill, name, then the line) above its entries.
- **Condensed entries.** Titles 18 px (16 px on a phone), text 14 px at a 760 px measure, 16 px row padding, 2 px between
  bullets, and the date · commit · progress-log line moved into the title row beside Explore (under the title, with Explore at
  its right, on a phone). The commit link shows the hash alone; its accessible name stays "Commit …". Full-page height: 11,840
  to 7,567 px at 1440 (36% shorter), 14,288 to 10,994 px at 390 (23%).
- **Not changed.** Data, content and APIs; the spec (its checks still hold); the What's New visual baselines regenerated and viewed.

**Checks**

- Lint 0 / 0, typecheck clean, Vitest 832 passed.
- `r11-learning-patch-notes`, `fo13-pages`, `route-consolidation`: 66/66 three times.
- Full Playwright in the sandbox: **605 passed, 17 skipped, 0 failed** (after regenerating the two What's New baselines).
- Real-data check through `readonly-proxy.mjs` at 1440 and 390: **1,366 values, 0 mismatches**; 0 console errors, 0 overflow, 0
  broken images, no phone control or `ButtonLink` under 40 px; the tile 160 px and pinned on a desktop, above its entries on a phone.
- Glance test, screenshots viewed: `r2-patch-notes-default-*`, `r2-patch-notes-sticky-1440` (v1.6's tile pinned beside its
  entries), `r2-patch-notes-release-390`, `r2-patch-notes-full-*`. The releases now read as gold markers down the left; more
  changes fit on a screen (about 6 entries per 1440 screen instead of 3).

## Round 3 (owner, 2026-11-08): stale CSS on :3100, no code change

"I meant the left part with the actual version number" (screenshot from :3100, v1.7's release column circled). The screenshot
showed round 2's markup (date, commit and log above Explore) with round 1's styling: no tile, white version. The CSS chunk :3100
served had round 1's `.pn-release-head` (no background or rail) and no `.pn-entry-side` rule, so the dev server was serving the
stale import. Removing and re-adding the `patch-notes-view.css` import in `app/globals.css` (file left unchanged) made :3100
serve the current rules; measured there: the tile's gradient and 3 px accent rail, the version in `rgb(255, 209, 102)`.
Committed code unchanged since round 2.

