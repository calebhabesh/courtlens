# RD18 Shot Aftermath: design evidence

Research → Shooting → Shot Aftermath (`/research/shooting/aftermath`). Instructions and status: [research design catalog, RD18](../../../research-design-catalog.md#rd18-shot-aftermath--queued). Unlike RD10–RD16 this page needs a new frozen play-by-play aggregate first (owner, 2026-11-09), so it runs as a build block, then the design rounds.

## Reference

The owner's saved Databallr page `~/Downloads/Webpages/DraftBallr/Shot Aftermath _ databallr.html` (not committed). databallr.com and draftballr.com were not fetched.

## Before (:3100, read 2026-11-10)

[`before-check.mjs`](before-check.mjs), [`before-check.json`](before-check.json), screenshots `sa-before-*`. The old workbench operation view under the left-aligned Shooting header, full width: an example-player card (Tyrese Maxey, 2026-27 box score), five stat tiles, then a zone table and a branch table (3 old `data-table`s, 0 `StatsGrid`), filled by `POST /api/workbench/operations/shot-aftermath`. 1,774 px tall at 1440, 2,314 at 390. 0 console errors, 0 overflow, 0 broken images; 2 native selects (Season, Phase). Every value reads 0 or "—" under "Source Unavailable, 0 / 154 league games": unavailable data drawn as zero counts. Raw branch keys in the body (`missed_recovery`, `missed_no_observed_recovery`); no hashes. The phone subtitle is cut mid-word.

## Content check (2026-11-10, read only)

[`content-check.py`](content-check.py) and [`content-check.json`](content-check.json): match counts only, no points or rates read, so nothing anticipates the registration. Findings are in the [progress log](../../../research-progress.md) entry of the same date and in the catalog section.
