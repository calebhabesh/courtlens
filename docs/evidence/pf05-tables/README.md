# PF05 — table structure and interactions

Completed 2026-10-05 at the bounded PF05 criterion. Prerequisites: PF01 query correctness and PF02–PF04 visual foundation, scoped identity and selection. Gemini 3.8 Flash was unavailable; Codex performed its presentation ownership as an explicit substitution. No delegation or concurrent shared-file writer. Starting revision remains `daedc03c66e7142c5a23ef918193e86e1b86af1a`; pre-existing dirty work was preserved.

## Implemented boundary

- Declared contiguous metric-group boundaries in preset metadata, combining Overview into Profile/Counting/Defense/Efficiency. Inserted recurring decorative Photos/Logos/Initials guides between sections; None removes them while retaining primary portraits and team identity. Header/body/empty spans follow the same boundaries. Custom column order survives; normalization deduplicates effective metric keys.
- Capped metric widths at 88px and fixed pinned identity geometry. Standard portraits are 36px; body text is 14px with 11px percentiles. Sampled first-row heights are **53px desktop / 57px narrow**, allowing team labels and wrapped names; these are measured sizes, not a claim of the contract's initial 44–48px target. Wide tables retain available space without stretching individual metrics. Narrow views pin the name and internally scroll auxiliary columns. The name filter occupies a usable full narrow row (**319px** in the 375px viewport).
- Plain names link to profiles with release/season/phase/cutoff/window. Separate detail controls open a keyboard-contained drawer and return focus on dismissal. Shared native sort buttons and `aria-sort` now serve Stats, Teams and playoff series player tables.
- Replaced competing row/window shortcuts with one focused-table handler. C toggles once; editable, modified and IME events remain native. A/D scroll, W/E change density and T expands table height. Density/guide/view presentation retains the cursor; analytical changes reset it. Guide preference survives explicit URLs/workspace reloads; name and sample controls synchronize after navigation.
- Preserved server percentiles, full-dataset Favorites, offsets and normalization-aware values/sorts. Comparison selections retain named off-page identity through bounded scoped lookup. The tray participates in layout; removal/clear and scope links work. More than two selections explicitly say **Compare first 2**, matching the existing head-to-head route. Failed selection/favorite changes show an inline actionable message and preserve selection.

Owned files: explorer, preset metadata/tests, shared table UI, table CSS, Team explorer, playoff series view, drawer/tray, Hotkeys copy, decorative TeamLogoStack option and Lucide wrapper additions; focused browser tests/verifiers and evidence/progress. No backend schema/computation, acquisition, migration, publication, package or assistant implementation change. [Surface inventory](route-inventory.md) records reused seams and PF06 boundaries.

## Verification

| Check | Result |
| --- | --- |
| PostgreSQL/API/SQL targeted regressions | **28 passed**, zero skips/warnings |
| Dashboard unit tests | **181 passed** |
| Dashboard lint/types; Ruff/format; strict mypy | Pass, zero diagnostics/warnings |
| Isolated real/fixture production webpack builds | Pass |
| Affected fixture browser workflows | **13 passed**; six focused table tests plus seven existing affected workflows |
| Production real-service contract checks | **66 passed**, zero page errors/console warnings |
| Final production layout checks | **3 passed** at CSS 2560×1440, 1440×900, 375×812, DPR 1 |
| Actual browser 200% zoom | **3 passed**, DPR 1→2, CSS viewport 1280×676, document width 1272 |
| Independent raw-fact arithmetic/paging scopes | **9 passed** |
| Retained analytical reproduction | **185 unchanged**: 137 matching saved hashes; same 48 pre-existing mismatches |
| Preservation | Zero outside-owned starting-file changes; **1,266 prior evidence files** preserved; **316 artifact hashes** equal the PF04 inventory |

Production checks reconcile ordering, ranks, displayed values and percentiles with real HTTP results; all four guide modes across nine player-table presets; every displayed supported metric on three rows across **27 preset/counting-mode combinations**; ascending/descending keyboard sort; first/next/page-size/search/Favorites; off-page favorite and comparison identity; focused shortcuts; drawer focus; context links and pin geometry. The three layout checks independently verify narrow name-filter width, contained document overflow, fixed metric widths and pinned positions. Actual zoom uses headed Chromium/X11 and OS keyboard events, with OS-window screenshots.

Analytical responses are real FastAPI/PostgreSQL throughout. Personal reads/mutations use a **disposable in-memory verification proxy**, seeded with Scottie Barnes as an off-page Favorite (source row 61); no retained personal mutation is claimed or performed. Playoff series and custom-order/failure/larger-tray cases are separately identified rendered fixtures. The original API, source, model, finance and Live gates remain unchanged.

Raw records: [starting state](starting-state.json), [preservation](preservation.json), [targeted backend](python-postgres-targeted.log), [units](dashboard-unit.log), [production checks](browser.json), [final layout](layout.json), [zoom](zoom.json), [fixture workflows](fixture-browser-final-pass.log), [real arithmetic](real-database.json), [retained comparison](retained-comparison.json), [build](build.log) and [fixture build](fixture-build.log). Screenshots include normal/scrolled wide, desktop and mobile views, and actual zoom/sorted zoom.

## Commands and environment

Existing local PostgreSQL/FastAPI at ports 5432/8000; Python 3.14.7 `.venv`; installed Next 16.3.5/React 19; Chromium `/usr/bin/chromium`; headless DPR 1 and X11 display `:99` for actual zoom. No package installation, provider inference, public hosting or Live demand.

```bash
COURTLOAD_TEST_POSTGRES_URL=postgresql+psycopg://courtload:courtload@127.0.0.1:5432/courtload_pf00_baseline \
  .venv/bin/pytest tests/integration/test_lookup_identity_postgres.py \
  tests/integration/test_stats_presentation_postgres.py \
  tests/unit/test_stats_engine.py::TestSQLGenerationAndCompilation -ra
.venv/bin/python scripts/verify_pf01a_stats.py --output docs/evidence/pf05-tables/real-database.json
.venv/bin/ruff check .
.venv/bin/ruff format --check .
.venv/bin/mypy src/courtload
npm --prefix dashboard run lint
npm --prefix dashboard run typecheck
npm --prefix dashboard test
python3 docs/evidence/pf05-tables/build-helper.py.txt
PF05_BUILD_LABEL=fixture-build PF05_API_URL=http://127.0.0.1:4100 \
  PF05_BROWSER_API_URL=http://127.0.0.1:4100 python3 docs/evidence/pf05-tables/build-helper.py.txt
# Keep these proxy processes running for the isolated real production preview:
python3 scripts/verify_pf04_proxy.py       # browser read-only API, :8154
python3 scripts/verify_pf05_proxy.py       # real analytics/disposable personal state, :8155
# Real standalone server: build-directory.txt/.next/standalone/server.js,
# HOSTNAME=127.0.0.1 PORT=3154 COURTLOAD_API_INTERNAL_URL=http://127.0.0.1:8155
node scripts/verify_pf05_browser.cjs
node scripts/verify_pf05_layout.cjs
DISPLAY=:99 node scripts/verify_pf05_zoom.cjs
# Fixture mock: node dashboard/e2e/mock-api.mjs, :4100;
# fixture-build-directory.txt/.next/standalone/server.js, HOSTNAME=127.0.0.1 PORT=3155.
PLAYWRIGHT_EXTERNAL_SERVER=true PLAYWRIGHT_BASE_URL=http://127.0.0.1:3155 \
  npm --prefix dashboard run test:browser -- e2e/table-interactions.spec.ts \
  e2e/workbench.spec.ts --workers=2 --grep-invert 'forecasts view'
```

The retained reproduction run used the checksum-verified PF01a verifier with only its output destination redirected into PF05; the ten read-only in-process HTTP timings have p95 **376.1ms**. This is bounded local evidence, not a new PF09 installation/resource benchmark. Lookup typing/model budgets were not changed or rebenchmarked; guide assets reuse lazy existing URLs and browser caching.

## Classified failures and limits

- The first broader backend command accidentally included all of `tests/unit/test_stats_engine.py`: **34 passed / 2 failed**, because archive tests require a populated release absent from the disposable test DB. The exact failure log is retained in `python-postgres.log`; unchanged backend/test hashes and the correct targeted 28-test run distinguish this environment failure from PF05 implementation.
- The broad initial fixture run reproduced the existing forecast strict-mode duplicate-badge failure. It remains in `fixture-browser.log` and is explicitly excluded from the final affected run. PF00 full-suite failures remain open.
- Initial browser harness failures included reading before navigation settled, a proxy expecting an entity ID in the body rather than its canonical URL, asserting horizontal movement when a wide table already fit, inherited disposable guide preferences and the Next route announcer matching a generic alert locator. Retained logs document them; final checks wait for actual state, distinguish scrollable widths and target the owned alert without relaxing behavior assertions.
- The 66 production contract checks and final layout/zoom checks are distinct records; final fixture runs additionally exercise selection failure and larger-tray copy. No all-route acceptance, fresh restore, real-provider evaluation or whole-installation memory measurement is claimed. The route-wide audit and concise availability/copy remain **PF06**; assistant and freeze acceptance remain PF07–PF09.

Next dependency: **PF06 route-wide workflow and copy polish**. Preserve replica source gates and retained evidence.
