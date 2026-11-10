# R11 — Learning, Glossary and Patch Notes (catalog row 21)

Built 2026-11-06 on branch `finish-r11-r12`. Parent: [Research progress](../../../research-progress.md),
[Research handoff](../../../research-plan.md) (R11; D14 recorded first). Build block: plain UI from the
shared Research components (`components/research/`), no page CSS. Databallr styling waits for the
design phase. No Python, API, model or data change.

Reference: the owner's saved Databallr pages `Learning _ databallr.html` and `patch-notes.html`
(`~/Downloads/Webpages/DraftBallr/`). Nothing was fetched from databallr.com.

## Reference against CourtLens

| Databallr shows | CourtLens now shows | Gap |
| --- | --- | --- |
| Learning: "17 topics across 4 tiers", a tier index, then each topic with prose, a formula box, Key Takeaways and "Explore / See … in …" links | `/methodology/learning`: 22 topics across 5 tiers (Core Concepts, Impact Measurement, Shooting Deep Dive, Lineup and Context, and CourtLens's own Testing Models), a tier index, each topic with prose, formula, Key takeaways and links to the CourtLens page. Prose is CourtLens's own; formulas are symbolic (no invented example numbers) | Same topic list except Databallr's per-topic worked examples with illustrative numbers, which were left out (no invented numbers) |
| No measured results | A "Measured in CourtLens (Rxx)" box on 14 topics quoting the registered result and linking its evidence README | — (CourtLens addition) |
| "The NBA's Statistical Evolution": league TS%, TOV/100, ORB% for 2001–2026 with a chart | The same topic with a served table: TS%, eFG%, TOV%, ORB%, 3PA rate and ORTG per regular season from `/api/four-factors` | **2014-15 to 2025-26 only** (CourtLens's play-by-play archives start there); table, no chart (build phase) |
| Glossary (press G in Stats) | `/stats/glossary`, generated from the metric catalog: one card per distinct catalog metric (128 of 130; two aliases collapse). Metrics without written copy are now described from their own catalog fields (formula, unit, direction) instead of repeating their name: the seven Basketball-Reference metrics | Written copy is still presentation over the catalog (`lib/stats-glossary.ts`), as before |
| Patch Notes: months with a version (v4.0–v4.2), groups, entries with New/Updated badge, Explore →, text and bullets | `/whats-new` (now titled Patch Notes): releases newest first, each a real merge to main (PRs #17, #24, #25, #42 and the presentation-clarity merge) or, for unmerged work, its branch; groups; entries with New/Updated/Removed badge, date, Explore, the commit link and, for Research blocks, the progress log | **CourtLens has no version numbers**: releases are labelled by PR or branch, not v4.x |
| Blog (in the changelog and menu) | Removed: no route, no menu item, `/blog` and `/whats-new/blog` redirect to Patch Notes, no Blog link on the page | — |

## Where the numbers come from

- **Learning's measured results** are 39 facts in `dashboard/lib/research-facts.ts`, each with its committed
  frozen file (`evaluation/research/frozen/…`) and field. `research-facts.test.ts` (Vitest) fails if a
  shown value no longer equals its source. The real-data check re-derives every fact independently
  from the same files: **39/39 equal**. Every figure inside a measured box is one of these facts.
- **League table**: every cell's `data-value` equals `/api/four-factors` (private API, real data).
- **Patch Notes**: `dashboard/content/patch-notes.json`. `node dashboard/scripts/check-patch-notes.mjs`
  checks every entry's commit exists and is dated as shown, every quoted commit, every merge commit
  and its PR number, and every progress-log heading: **83 references match**. It needs full history,
  so it isn't in CI (which clones at depth 1); a Vitest test checks structure, order and that the
  displayed copy holds no hash or ISO date.
- The Stats page's What's New line now names the newest Patch Notes entry instead of the removed
  markdown note.

## Other changes

- Research menu: Learning under Methods, Patch Notes under Tools (D8). Learning stays a Methodology
  tab; its menu entry is a documented shortcut (`TAB_SHORTCUTS`) that the one-entry-per-merged-page
  rule exempts. What's New left the ⋯ menu (Patch Notes is in Research).
- Removed: the markdown patch note (`content/2026-10-04-retained-operations.md`), its reader and the
  `OriginalArticle` renderer (no other users). Its content is the "Saved operations and learning" entry.
- Shared: `ResearchLinks` (a left-aligned row of text links, optional accessible name).
- Links to `/research` were left out: that landing page is R12's. A prefetch of the missing route kept
  the page from reaching network idle, which the first full run caught.

## Verification

| Check | Result |
| --- | --- |
| Lint, Stylelint, typecheck | 0 errors, 0 warnings |
| Vitest | 785 passed (115 files) |
| Python | not run: no Python changed |
| Page spec `e2e/r11-learning-patch-notes.spec.ts` (fixture `e2e/fixtures/r10-four-factors.json`, a real API answer) | 5 tests, **15/15 over three repeats** |
| Updated specs | `fo13-pages` (Patch Notes on the Article template), `saved-operations` (new heading), `visual-baselines` (ready text) |
| Full Playwright (production build sandbox under `~/.cache/courtlens-tmp`, mock API 4180, dashboard 3180, 2 workers, 8 GiB, `docs/` copied) | First run 574 passed, 17 skipped, 2 failed: the What's New baselines, which never reached network idle (the `/research` prefetch above). After the fix the two baselines were regenerated and viewed (the page changed by design: Patch Notes replaces the markdown note). Final run **576 passed, 17 skipped, 0 failed**; `git status` shows no evidence-file changes |
| Real data ([`real-data-check.json`](real-data-check.json), [`real-check.mjs`](real-check.mjs)) | Private API on 4180 (worktree code, shared Postgres read only), production build on 3180. Learning 141 values, Patch Notes 63, Glossary 8, Stats 1, each at 1440 and 390: **0 mismatches**, 0 console errors, 0 horizontal overflow, 0 broken images (scrolled first) |
| Internal links | All 34 internal destinations on the two pages return 200 |

## Glance test (1440 × 900 and 390 × 844; [`glance.json`](glance.json))

| # | Item | 1440 | 390 | Note |
| --- | --- | --- | --- | --- |
| 1 | Header | pass | pass | "Patch Notes" matches its menu label; Learning sits under the "Methodology" title with the Learning tab selected (the menu entry opens that tab); one subtitle line |
| 2 | Filters | n/a | n/a | No filters on either page |
| 3 | First screen | partial | partial | Learning's tier index starts at 376 px, Patch Notes' first release at 300 px; each has a one- to three-line centred tagline before it (Databallr's intro line) |
| 4 | Alignment | pass | pass | Tokens only; shared left edges; table numbers right-aligned, tabular |
| 5 | Identity | n/a | n/a | No players or team codes on these pages |
| 6 | Missing data | pass | pass | 0 hashes, 0 UUIDs in visible text (commit hashes are in link names and titles only) |
| 7 | Icons | pass | pass | Wrapper Lucide only; 20 px headings, 16 px inline |
| 8 | States | pass | pass | The league table uses the shared `FeedSkeleton` and a one-line `FeedFailure` with Retry |
| 9 | Phone | — | pass | 0 px sideways scroll; 0 touch targets under 40 px |
| 10 | Dates | pass | pass | "Nov 3, 2026"; 0 ISO dates in visible text |

Screenshots: [Learning 1440](methodology-learning-1440.png), [390](methodology-learning-390.png);
[league table topic 1440](learning-league-evolution-1440.png), [390](learning-league-evolution-390.png);
[measured topic 1440](learning-stabilization-1440.png), [390](learning-stabilization-390.png);
[Patch Notes 1440](whats-new-1440.png), [390](whats-new-390.png);
[Glossary 1440](stats-glossary-1440.png), [390](stats-glossary-390.png). All viewed.

R16 constraints observed: no Ask or provider calls; the main `.venv` unchanged; the shared Postgres
only read (R16's pinned release `a584c88b` untouched; the pages read the published default
`0ccfe95c`); `~/dev/courtlens-r16` and `research-r16` untouched.

## Not done

- The owner's review and ✅.
- Databallr styling (design phase): a chart for the league trends, Databallr's topic layout.
- Evidence links point at `main` on GitHub; they resolve once the research branch is merged.
