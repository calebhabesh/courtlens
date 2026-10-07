# Stats readability, portrait quality, branding and search — 2026-10-07

Owner requested a readable second pass: larger records and portraits, centered group guides,
secondary-nav alignment, a frameless mixed-case amber wordmark, table suggestions, concise
main search identities and a right-aligned clear action. Subsequent steering selected Fontshare
Tabular for all wordmarks. This bounded PF01/PF02/PF04/PF05 and B07 follow-up preserves the
existing analytical scope and source/model gates. Pre-existing changes were recorded in
[baseline](baseline.json) and retained. Implementation and verification were sequential.

## Implemented result

- Standard records **52px**, primary values **14px**, percentiles **11px**; compact **42px**.
  Identity **280px** (220px narrow), guide gutters **40px**, numeric widths **84–140px**.
  Metric/header centers and portrait centers agree; pinned columns and internal scrolling remain.
- Primary portraits **40px**, guides **34px**, preview **44px**, concise search **38px**.
  A versioned local portrait URL avoids the prior one-day browser cache. Explicit image URLs
  and missing-image placeholders remain supported. Compact portraits retain 34px sizing.
- Shared CourtLens wordmark artwork uses **Fontshare Tabular Bold 1.15**, mixed case and amber,
  on the header, Stats toolbar, profile/showcase cards, standalone SVGs and PNG export headers.
  Original glyph outlines/advance widths become fixed logo artwork, with bounds preserving
  glyph overshoot. No font binary is redistributed, modified, subsetted or loaded at runtime.
  [Fontshare](https://www.fontshare.com/fonts/tabular),
  [asset provenance/license](../../../dashboard/public/brand/manifest.json).
- Header basketball mark is frameless; wordmark centers vertically. Availability shares the
  right-hand navigation group with Help, including an aligned dropdown.
- Table name search uses the shared player-only lookup: suggestion selection filters Stats in
  place and preserves release/season/phase/cutoff/window; plain Enter submits partial text.
  Popups are positioned through a portal outside the clipped table, following scroll/resize.
  Escape, IME, cancellation/cache fencing, explicit selection, pointer and touch remain.
- Main/table suggestions omit alias badges and duplicate operational captions. Matching aliases
  still work. Captions distinguish represented teams/season, last-observed teams and no scoped
  stats. The main clear button is **4px** from the right edge. Detailed entity forms retain their
  existing identity behavior.

## Measured verification

| Check | Result |
| --- | --- |
| Reported defects reproduced before editing | Five regression cases fail against the baseline: [red run](baseline-browser.log), [before screenshot](before.png). Direct measurements: 40px/12px rows, guide offsets 27–32px, Availability as a separate flex child, clear inset 32px. |
| Full final production fixture browser suite | **159 pass / 3 opt-in skips**, no failures: [browser](browser.log). Includes six new readability/search/export cases, existing lookup race/IME/scope/touch cases, table/preset/rail tests and shared shell/assistant workflows. |
| Dashboard unit suite | **205 pass / 31 files**: [unit](unit.log). |
| Python unit suite | **967 pass / 2 existing opt-in PostgreSQL skips**: [Python unit](python-unit.log). Portrait acquisition cases all pass: [targeted](portraits-tests.log). |
| ESLint / TypeScript | Zero warnings/errors: [lint](lint.log), [types](typecheck.log). |
| Ruff / formatting / strict mypy | Pass: [Ruff](ruff.log), [format](ruff-format.log) (470 files), [mypy](mypy.log) (164 sources). |
| Production fixture / real builds | Pass, no build warnings: [fixture](build.log), [real](build-real.log). Installed Next.js 16.3.5. |
| Real FastAPI/PostgreSQL Stats | **18 checks / four widths**, zero page errors: [record](real-browser.json), [log](real-browser.log). Source portrait decodes at **1040×760**, displays at 40px. Independent first-row values remain Luka Dončić PPG **33.5**, percentile **99**, eligible **591**. Includes all nine supported metric presets, guide modes, counting modes, hover/pin equivalence and mobile details. |
| Real search | **4 checks**, zero page errors: [record](search-real.json), [log](search-real.log). Real `sc` results have concise captions; no-match X inset 4px; Scottie Barnes selection stays in Stats with every scope field preserved and correct preview; real mobile touch works. |
| Actual Chromium 200% zoom | DPR **1 → 2**, CSS **1279×676**, document **1272px**, preview focus and internal scrolling work: [record](zoom.json), [log](zoom.log). |

Inspected final real-data screenshots: [table/hover](reference-hover.png),
[global results](global-search.png), [global empty](global-empty.png),
[table suggestions](table-search.png), [selected player](table-selected.png),
[2560px](wide-initial.png), [1440px](desktop-initial.png), [375px](mobile-initial.png),
[200% zoom](zoom-200.png). Zero document horizontal overflow at measured widths.

## Portrait acquisition

Existing official NBA portrait worker now acquires 1040×760 PNGs using a distinct
`nba_cdn_1040x760` registry source. It checks numeric NBA IDs, MIME/signature/header dimensions,
10-second request timeout and a 1MB asset ceiling, and records width/height, attribution and
content hash. Optional bounded player IDs allow a targeted upgrade; cached HD prefixes do not
consume the batch. Previous low-resolution records/files remain intact. New UI reads never
acquire images or call a provider.

The first request coalesced with a previously queued 200-player portrait job, which acquired
200 HD images (132 in the selected cohort), zero failures: [first job](portrait-upgrade-first.json).
A subsequent targeted job acquired the remaining **459** cohort images with zero failures.
Final coverage is **591/591** eligible-player cached images at **1040×760**:
[final job](portrait-upgrade.json), [log](portrait-upgrade.log). Every previously registered
cohort image/hash/path was checked as retained. Coverage means valid cached source images;
the source can supply a silhouette, and latest portraits do not prove historical membership.
No migration, publication, model evaluation or statistical-source refresh was performed.

## Harness and limits

Production builds ran in an isolated /tmp copy with fixture API 4111/frontend 3212 and a
separate copied real standalone frontend 3213. Existing frontend 3100/API 8000 were retained.
The real-search harness forwards GETs to the actual API and adds the isolated 3213 origin to
its intercepted response headers, because the existing backend CORS allows the owner's
localhost frontend rather than test ports. It does not substitute result data or change backend
CORS. All analytical/personal-workspace browser mutations are blocked; the explicit portrait
worker acquisition is the only new persisted data operation. Probes are retained alongside
records. Private Xvfb zoom verification does not manipulate the owner's desktop.

Baseline/intermediate runs exposed expected selector ambiguities after the new combobox,
a test-only noncanonical phase, native select options in an overly broad lookup assertion,
and 53px rows after the portrait increase; final tests use role-specific selectors and canonical
scope, and corrected cell padding keeps 52px rows. Final checks above use the corrected source.
Three browser skips are the two real assistant-panel opt-ins and real personal-workspace test;
two Python skips are existing assistant tests requiring an explicitly configured PostgreSQL URL.
Database release/restore acceptance was not rerun for this bounded UI/portrait-cache follow-up.

The owner's existing Next dev server was also verified directly at **localhost:3100** with the
real API and its normal CORS policy: 52px rows, 40px displayed/1040px source portraits,
shared Tabular wordmarks, and visible Scottie Barnes table suggestions; zero page errors.
[Running development screenshot](running-dev.png), [record](running-dev.json).
No restart was needed. Task-owned fixture/isolated production servers were stopped after
verification; the owner's frontend/API remain running. Full-tree `git diff --check` reports a
pre-existing blank EOF in the unrelated dirty assistant contract; task-owned diffs are clean.
