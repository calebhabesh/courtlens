# PF06 — route-wide workflow and copy polish

Completed at the bounded PF06 criterion on 2026-10-05. Read root/dashboard instructions, workbench/replica/freeze handoffs, the UI contract and PF01–PF05 evidence; used the UI/UX skill and installed Next.js production documentation. Gemini 3.8 Flash was unavailable; Codex performed its presentation ownership sequentially, with no delegation. Starting revision remains `daedc03c66e7142c5a23ef918193e86e1b86af1a`. Existing dirty work was preserved.

## Implemented boundary

- One desktop/mobile destination model and release-bound route-to-capability mapping. Source-dependent tools consume the bounded catalog; unavailable/unverified destinations remain reachable in Availability, with reasons and alternatives. Partial coverage stays primary; ordinary empty results never remove a tool. Personal tools, finance, independently sourced Live and sealed research reports retain their separate namespaces. In particular, a completed negative research result remains accessible. Historical Finals now uses the actual `live_mode=history` route parameter.
- Shared catalog requests are coalesced by release, expire after 30 seconds and retain at most eight client keys. Failed requests are evicted; obsolete release responses cannot become the active catalog. Navigation never probes each destination with statistical queries or calls a model. The On-Off preset uses the same runtime route-capability mapping; box-score proxy presets keep their explicit model limitations.
- WOWY, shooting and roster forms use catalog season/phase options, humane labels, exclusive cutoff semantics and explicit unsupported selections; release identifiers move into Advanced source. Roster adopts URL scope/navigation and preserves source context in profile links/exports. Trends, distributions and similarity season selectors consume the catalog; their pickers receive complete lookup scope. Team pages/comparison resolve catalog defaults instead of 2023–24 constants. Playoff controls display the postseason phase their query actually uses.
- Fixed Distributions' Splits/Opponent requests dropping release, selected phase and cutoff. This is client serialization repair using existing frozen API fields; no analytical formula/schema changed. Explicit postseason request payloads have a rendered browser regression.
- Settings puts portraits/configuration/install actions before diagnostics. Configured key remains distinct from provider health; an idle queue remains distinct from worker liveness; unavailable portrait status displays Unknown. Assistant configuration, storage/serving paths and installation internals live in details. Source/sample/conditional/model/hypothetical limits remain visible where they change interpretation.
- Removed task-facing milestone IDs and construction prose, retained source-safe capability explanations and scoped alternative links. Negative/model statuses have humane labels. Research pages use left-aligned available width and shared panel spacing. Corrected real 375px overflow in Case Studies, Showcase, team comparison, team profiles and playoff series through wrapping controls, responsive grids and internally scrollable tables. Chart/comparison/export/slideshow actions reuse Lucide; chart/data/export provenance is preserved.
- Reviewed all **52 canonical pages** and their transitive controls. Shared entity entry remains from PF04; free-text filters, questions/notes, numeric scenarios, source observation selection and operator inputs keep their justified roles. Ask receives [its PF08 checklist](ask-checklist.md) and production previews only: no assistant implementation changed.

Owned seams: route availability/catalog helpers, shared scope controls, navigation/context, Settings/install/portraits, team/default/context routes, selected research/control/copy/layout and chart action callers, CSS/Lucide wrapper, affected fixture tests and verification/evidence/progress. [Owned file list](owned-files.json) and [route/control inventory](route-inventory.md) give concrete ownership. No backend code/schema/arithmetic, package, migration, publication, data acquisition, provider inference or retained personal mutation changed.

## Verification

| Check | Measured result |
| --- | --- |
| PostgreSQL/API/SQL regressions | **28 passed**, zero skips/warnings |
| Dashboard unit tests | **184 passed** |
| Ruff/format/strict mypy; dashboard lint/types | Pass, zero diagnostics/warnings |
| Isolated real/fixture production webpack builds | Both pass |
| Affected fixture browser workflows | **54 passed** |
| Real-service production route audit | **52 page/state records** at 1440×900 and 375×812; zero document overflow/page exceptions |
| Production preview/navigation assertions | **20 checks**; source/research/Ask/Settings/roster/WOWY at three widths and desktop/mobile secondary agreement |
| Real chart/roster/research tasks | **8 passed**; SVG/PNG/table values, named participation, scoped JSON and sealed negative report |
| Real context checks | **4 passed**; team defaults/change/cutoff, postseason phase and scoped unavailable-tool alternatives |
| Supplemental layout measurements | **6 passed**; Stats/roster at three widths; roster gutter 24px desktop, 16px mobile |
| Actual browser 200% zoom | **5 passed**; DPR 1→2, CSS viewport 1280×676, contained document width |
| Retained reproduction | **185 unchanged**: 137 matching saved hashes; same 48 existing mismatches |
| Retained artifacts | **316 hashes unchanged** from PF04 inventory |
| Starting files/prior evidence | Zero outside-owned changes; exact count in [preservation](preservation.json) |

Fixture coverage includes missing/partial/empty/overflow/error/cancellation states; desktop/mobile availability with partial/unreachable catalogs; unsupported/context navigation; configured-key/worker distinctions; missing context; three distribution subtools retaining the same release/postseason/cutoff; calculator invalid assumptions; roster projections/unknowns; measurements and units; source-blocked/negative/integrity-rejection research; finance and source-linked terms; saved-operation reopening/pagination/mismatch/exports; installation metadata/prompt. Fixture tests and real API evidence are distinct.

Production uses local FastAPI/PostgreSQL via a read-only CORS passthrough and a disposable workspace proxy, without substituting analytical responses. No retained workspace write is performed. The saved-detail production route uses an existing saved conversational operation, not a legacy analysis ID. Historical Live routes avoid demand; the invalid game selection is an explicit failure-state check, not evidence of current Live/source acceptance. Ask screenshots capture existing behavior only.

Screenshots: CSS 2560×1440, 1440×900, 375×812, DPR 1; Stats, Ask, Settings and representative source/research/entity controls. Actual zoom uses headed Chromium/X11/OS keyboard events and OS-window captures, not CSS scaling. Visual inspection caught and corrected an undefined spacing token before the final previews. [Layout](layout.json), [zoom](zoom.json), [routes](browser.json), [tasks](tasks.json) and [context](context.json) retain exact dimensions/results.

## Commands and environment

Python 3.14.7 `.venv`, installed Next 16.3.5/React 19, local PostgreSQL/FastAPI at 5432/8000; Chromium `/usr/bin/chromium`, X11 `:99`. Builds copy the dashboard into isolated temporary directories and retain standalone static/public assets. The last rebuild removes four whitespace-only blank lines; browser verification uses functionally identical source. Final build source hashes are checked in `build-source-verification.json`. No package install, public hosting or paid dependency.

```bash
COURTLOAD_TEST_POSTGRES_URL=postgresql+psycopg://courtload:courtload@127.0.0.1:5432/courtload_pf00_baseline \
 .venv/bin/pytest tests/integration/test_lookup_identity_postgres.py \
 tests/integration/test_stats_presentation_postgres.py \
 tests/unit/test_stats_engine.py::TestSQLGenerationAndCompilation -ra
.venv/bin/ruff check .
.venv/bin/ruff format --check .
.venv/bin/mypy src/courtload
npm --prefix dashboard run lint
npm --prefix dashboard run typecheck
npm --prefix dashboard test
python3 docs/evidence/pf06-routes/build-helper.py.txt
PF06_BUILD_LABEL=fixture-build PF06_API_URL=http://127.0.0.1:4100 \
 PF06_BROWSER_API_URL=http://127.0.0.1:4100 \
 python3 docs/evidence/pf06-routes/build-helper.py.txt
# Read-only CORS passthrough :8154 and disposable workspace/real analytics :8155:
python3 scripts/verify_pf04_proxy.py
python3 scripts/verify_pf05_proxy.py
# Standalone server from build-directory.txt: HOSTNAME=127.0.0.1 PORT=3154,
# COURTLOAD_API_INTERNAL_URL=http://127.0.0.1:8155
node scripts/verify_pf06_browser.cjs
node scripts/verify_pf06_tasks.cjs
node scripts/verify_pf06_context.cjs
node scripts/verify_pf06_layout.cjs
DISPLAY=:99 node scripts/verify_pf06_zoom.cjs
# Fixture server :3157 from fixture-build-directory.txt; mock API :4100:
PLAYWRIGHT_EXTERNAL_SERVER=true PLAYWRIGHT_BASE_URL=http://127.0.0.1:3157 \
 npm --prefix dashboard run test:browser -- e2e/route-polish.spec.ts \
 e2e/advanced-research.spec.ts e2e/shared-floor.spec.ts e2e/shooting.spec.ts \
 e2e/saved-operations.spec.ts e2e/finance.spec.ts --workers=2
```

Retained reproduction uses the checksum-verified PF01a verifier, redirecting only its output to PF06. Ten read-only in-process HTTP requests have p95 **366.6ms**. Catalog cardinality/cache bounds are implementation constraints; no new installation-memory, lookup-latency or PF09 resource-acceptance benchmark is claimed. Prior lookup/model budgets remain unchanged.

## Classified failures and limits

- [Initial fixture run](fixture-browser-initial.log): 22 passes/two failures. One obsolete test typed a Team ID after PF04 had replaced that field; it now selects the actual named shared picker. The other exposed missing explicit names on the new wrapped scope selects; explicit accessible labels correct the implementation. Final affected suite passes.
- The first expanded saved-content test expected Learning's catalog to be unavailable although the fixture supplies a valid catalog. It now asserts the actual pinned lesson and picker; remaining installation/catalog/metadata assertions are preserved. Its final workflow passes.
- [Initial production audit](browser-initial.json) retained overflow findings and a preview-origin CORS mismatch. Final runs use the passthrough's supported origin and corrected grids/tables/controls. Later live-data traversal also found profile/series overflow, fixed before final evidence. Early `view=finals` used an obsolete alias; the mutation-blocking proxy rejected lease creation. Canonical historical navigation and final audit use `live_mode=history`.
- A first saved-detail harness used a legacy analysis ID against the distinct saved-conversation route, yielding an honest not-found state. Final traversal chooses an existing `/assistant/investigations` ID. Legacy evidence remains separately accessible/reproducible.
- Initial screenshot inspection found an undefined `--space-6` reference in the new research spacing override; final CSS reuses existing tokens and measures 24/16px gutters. Final static checks have zero warnings.
- PF00 full-suite failures, the pre-existing forecast fixture failure, package-audit findings and all replica source/model/finance/Live gates remain classified in their original logs. No blanket full-suite, full-source, real-provider, fresh-restore or PF09 acceptance claim is made.

Next dependency: **PF07a hybrid assistant router/defaults/knowledge/answer contracts**, followed by PF07b–d and PF08. Stop at the verified PF06 boundary; preserve sealed results and source gates.
